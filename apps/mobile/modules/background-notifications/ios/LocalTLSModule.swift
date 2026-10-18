import ExpoModulesCore
import Foundation

private final class LocalHTTP: LocalTrustDelegate, URLSessionDataDelegate {
  var bytes = Data()
  var response: HTTPURLResponse?
  let complete: (Data?, HTTPURLResponse?, Error?) -> Void
  init(origin: String, pin: String, complete: @escaping (Data?, HTTPURLResponse?, Error?) -> Void) { self.complete = complete; super.init(origin: origin, pin: pin) }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    self.response = response as? HTTPURLResponse
    completionHandler(response.expectedContentLength > 24 * 1024 * 1024 ? .cancel : .allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard bytes.count + data.count <= 24 * 1024 * 1024 else { dataTask.cancel(); return }
    bytes.append(data)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { complete(error == nil ? bytes : nil, response, error); session.finishTasksAndInvalidate() }
}
private final class LocalSocket: LocalTrustDelegate, URLSessionWebSocketDelegate {
  let event: (String, [String: Any]) -> Void
  init(origin: String, pin: String, event: @escaping (String, [String: Any]) -> Void) { self.event = event; super.init(origin: origin, pin: pin) }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) { event("open", [:]) }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    event("close", ["code": closeCode.rawValue, "reason": reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""])
  }
}
public class LocalTLSModule: Module {
  private var requests: [String: URLSessionDataTask] = [:]
  private var sockets: [String: (URLSession, URLSessionWebSocketTask)] = [:]
  private var files: [String: URL] = [:]
  private var destroyed = false
  private func invalid() -> NSError { NSError(domain: "DSBotLocalTLS", code: 1, userInfo: [NSLocalizedDescriptionKey: "The local HTTPS connection could not be verified or completed."]) }
  public func definition() -> ModuleDefinition {
    Name("DSBotLocalTLS")
    Events("socket")
    AsyncFunction("request") { (input: [String: Any], promise: Promise) in
      guard !self.destroyed, self.requests.count < 32, let origin = input["origin"] as? String, let pin = input["pin"] as? String, validLocalPin(pin),
        let id = input["id"] as? String, let address = input["url"] as? String, validateLocalURL(origin, address), let url = URL(string: address),
        let method = input["method"] as? String, ["GET", "POST", "PUT", "DELETE", "PATCH"].contains(method) else { promise.reject(self.invalid()); return }
      var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 45
      for (key, value) in input["headers"] as? [String: String] ?? [:] {
        guard ["accept", "authorization", "content-type"].contains(key.lowercased()) else { promise.reject(self.invalid()); return }
        request.setValue(value, forHTTPHeaderField: key)
      }
      if let encoded = input["body"] as? String {
        guard encoded.count <= 28 * 1024 * 1024, let data = Data(base64Encoded: encoded), data.count <= 20 * 1024 * 1024 else { promise.reject(self.invalid()); return }
        request.httpBody = data
      }
      let delegate = LocalHTTP(origin: origin, pin: pin) { [weak self] data, response, error in
        guard let self = self else { promise.reject(NSError(domain: "DSBotLocalTLS", code: 2)); return }
        self.requests.removeValue(forKey: id)
        guard !self.destroyed, error == nil, let data = data, let response = response, !(300..<400).contains(response.statusCode) else { promise.reject(self.invalid()); return }
        var value: [String: Any] = ["status": response.statusCode, "headers": response.allHeaderFields.reduce(into: [String: String]()) { result, field in result[String(describing: field.key)] = String(describing: field.value) }]
        if (200..<300).contains(response.statusCode) && method == "GET" && url.path.hasPrefix("/mobile/v1/attachments/") {
          self.files.filter { pair in ((try? pair.value.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)?.timeIntervalSinceNow ?? 0) < -60 }.forEach { pair in try? FileManager.default.removeItem(at: pair.value); self.files.removeValue(forKey: pair.key) }
          guard self.files.count < 16 else { promise.reject(self.invalid()); return }
          let name = "dsbot-response-" + UUID().uuidString
          let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
          do { try data.write(to: file, options: [.atomic, .completeFileProtection]); self.files[name] = file }
          catch { promise.reject(self.invalid()); return }
          value["bodyFile"] = file.absoluteString; value["fileId"] = name
        } else { value["bodyText"] = String(data: data, encoding: .utf8) ?? "" }
        promise.resolve(value)
      }
      let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
      let session = URLSession(configuration: config, delegate: delegate, delegateQueue: OperationQueue.main)
      let task = session.dataTask(with: request); self.requests[id] = task; task.resume()
    }.runOnQueue(.main)
    AsyncFunction("cancel") { (id: String) in self.requests.removeValue(forKey: id)?.cancel() }.runOnQueue(.main)
    AsyncFunction("removeResponseFile") { (id: String) -> Bool in if let file = self.files.removeValue(forKey: id) { try? FileManager.default.removeItem(at: file) }; return true }.runOnQueue(.main)
    AsyncFunction("connect") { (origin: String, pin: String, id: String, address: String) in
      guard !self.destroyed, self.sockets.count < 16, validLocalPin(pin), validateLocalURL(origin, address, socket: true), let url = URL(string: address) else { throw self.invalid() }
      let delegate = LocalSocket(origin: origin, pin: pin) { [weak self] type, value in self?.emit(id, type, value) }
      let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
      let session = URLSession(configuration: config, delegate: delegate, delegateQueue: OperationQueue.main)
      let task = session.webSocketTask(with: url); task.maximumMessageSize = 4 * 1024 * 1024
      self.sockets[id] = (session, task); task.resume(); self.receive(id, task)
    }.runOnQueue(.main)
    AsyncFunction("send") { (id: String, text: String) in
      guard text.utf8.count <= 512 * 1024, let (_, task) = self.sockets[id] else { throw self.invalid() }
      task.send(.string(text)) { [weak self] error in if error != nil { DispatchQueue.main.async { self?.emit(id, "error", [:]); self?.emit(id, "close", ["code": 1006]) } } }
    }.runOnQueue(.main)
    AsyncFunction("close") { (id: String) in self.emit(id, "close", ["code": 1000]) }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async {
        self.destroyed = true
        self.requests.values.forEach { $0.cancel() }; self.requests.removeAll()
        self.sockets.values.forEach { $0.1.cancel(with: .goingAway, reason: nil); $0.0.invalidateAndCancel() }; self.sockets.removeAll()
        self.files.values.forEach { try? FileManager.default.removeItem(at: $0) }; self.files.removeAll()
      }
    }
  }
  private func emit(_ id: String, _ type: String, _ data: [String: Any]) {
    guard !destroyed, sockets[id] != nil else { return }
    if type == "close", let (session, task) = sockets.removeValue(forKey: id) { task.cancel(with: .normalClosure, reason: nil); session.invalidateAndCancel() }
    sendEvent("socket", ["id": id, "type": type].merging(data) { _, new in new })
  }
  private func receive(_ id: String, _ task: URLSessionWebSocketTask) {
    task.receive { [weak self] result in
      DispatchQueue.main.async {
        guard let self = self, self.sockets[id]?.1 === task else { return }
        switch result {
        case .success(.string(let text)): self.emit(id, "message", ["data": text]); self.receive(id, task)
        case .success: self.emit(id, "error", [:]); self.emit(id, "close", ["code": 1003])
        case .failure: self.emit(id, "error", [:]); self.emit(id, "close", ["code": task.closeCode == .invalid ? 1006 : task.closeCode.rawValue])
        }
      }
    }
  }
}
