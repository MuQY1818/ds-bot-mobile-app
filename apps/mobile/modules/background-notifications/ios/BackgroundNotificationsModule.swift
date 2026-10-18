import ExpoModulesCore
import UIKit
import UserNotifications

public class BackgroundNotificationsModule: Module {
  private var locale = "en"
  private var origin = ""
  private var serverId = ""
  private var token = ""
  private var cursor: Int64 = 0
  private var expiresAt = 0.0
  private var state = "stopped"
  private var generation = 0
  private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
  private var request: URLSessionDataTask?
  private var timer: DispatchWorkItem?
  private var session = URLSession(configuration: .ephemeral, delegate: LocalTrustDelegate(origin: "", pin: ""), delegateQueue: nil)

  public func definition() -> ModuleDefinition {
    Name("DSBotBackgroundNotifications")
    AsyncFunction("start") { (url: String, serverId: String, token: String, cursor: Double, expiresAt: Double, locale: String, tlsPin: String) -> Bool in
      guard (tlsPin.isEmpty || validLocalPin(tlsPin)), UIApplication.shared.applicationState == .active,
        let address = URLComponents(string: url), address.scheme == "https", address.host?.isEmpty == false,
        address.user == nil, address.password == nil, address.query == nil, address.fragment == nil,
        address.path == "" || address.path == "/", serverId.count > 0, serverId.count <= 128,
        token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
        cursor.isFinite, cursor >= 0, cursor.rounded() == cursor, cursor < Double(Int64.max),
        expiresAt.isFinite, expiresAt > Date().timeIntervalSince1970 * 1000 else {
          throw NSError(domain: "DSBotNotifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Open the app and use a valid HTTPS background registration"])
        }
      self.stop()
      self.session.invalidateAndCancel()
      self.session = URLSession(configuration: .ephemeral, delegate: LocalTrustDelegate(origin: url, pin: tlsPin), delegateQueue: nil)
      self.locale = locale == "zh" ? "zh" : "en"
      self.origin = url.hasSuffix("/") ? String(url.dropLast()) : url
      self.serverId = serverId
      self.token = token
      self.cursor = Int64(cursor)
      self.expiresAt = expiresAt
      self.state = "foreground"
      return true
    }.runOnQueue(.main)
    AsyncFunction("setLocale") { (locale: String) in self.locale = locale == "zh" ? "zh" : "en" }.runOnQueue(.main)
    AsyncFunction("stop") { self.stop(); return true }.runOnQueue(.main)
    AsyncFunction("status") { () -> [String: Any] in
      ["running": !self.token.isEmpty, "state": self.state, "serverId": self.serverId, "cursor": self.cursor, "expiresAt": self.expiresAt, "userStopped": false]
    }.runOnQueue(.main)
    AsyncFunction("advanceCursor") { (serverId: String, value: Double) in
      if serverId == self.serverId && value.isFinite && value >= 0 && value < Double(Int64.max) && value.rounded() == value {
        self.cursor = max(self.cursor, Int64(value))
      }
    }.runOnQueue(.main)
    OnAppEntersBackground { self.beginBackground() }
    OnAppEntersForeground { self.pause("foreground") }
    OnDestroy { self.stop(); self.session.invalidateAndCancel() }
  }

  private func beginBackground() {
    guard !token.isEmpty else { return }
    pause("connecting")
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "DSBotNotificationHandoff") { [weak self] in
      self?.pause("suspended")
    }
    guard backgroundTask != .invalid else { state = "suspended"; return }
    poll(generation)
  }

  private func pause(_ next: String) {
    generation += 1
    timer?.cancel(); timer = nil
    request?.cancel(); request = nil
    if backgroundTask != .invalid {
      UIApplication.shared.endBackgroundTask(backgroundTask)
      backgroundTask = .invalid
    }
    state = next
  }

  private func stop() { pause("stopped"); token = ""; origin = ""; serverId = ""; expiresAt = 0 }

  private func poll(_ epoch: Int) {
    guard epoch == generation, backgroundTask != .invalid, !token.isEmpty else { return }
    guard expiresAt > Date().timeIntervalSince1970 * 1000 else { stop(); state = "authorization-required"; return }
    guard let url = URL(string: origin + "/mobile/v1/notifications/background") else { stop(); return }
    var input = URLRequest(url: url)
    input.httpMethod = "POST"
    input.timeoutInterval = 10
    input.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    input.setValue("application/json", forHTTPHeaderField: "Content-Type")
    input.httpBody = try? JSONSerialization.data(withJSONObject: ["cursor": cursor])
    request = session.dataTask(with: input) { [weak self] data, response, _ in
      DispatchQueue.main.async {
        guard let self = self, self.generation == epoch, self.backgroundTask != .invalid else { return }
        let code = (response as? HTTPURLResponse)?.statusCode
        if code == 401 || code == 403 { self.stop(); self.state = "authorization-required"; return }
        if code == 200, let data = data, data.count <= 256 * 1024,
          let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let next = value["cursor"] as? NSNumber, next.int64Value >= self.cursor,
          let items = value["items"] as? [[String: Any]], items.count <= 100 {
          if value["deliveryEnabled"] as? Bool == true {
            for item in items.suffix(3) {
              if let id = item["id"] as? NSNumber, id.int64Value > self.cursor, id.int64Value <= next.int64Value,
                let conversation = item["conversationId"] as? String, !conversation.isEmpty, conversation.count <= 256,
                let kind = item["kind"] as? String {
                self.alert(id.int64Value, conversation, kind)
              }
            }
          }
          self.cursor = max(self.cursor, next.int64Value)
          self.state = "connected"
        } else { self.state = "reconnecting" }
        let work = DispatchWorkItem { [weak self] in self?.poll(epoch) }
        self.timer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
      }
    }
    request?.resume()
  }

  private func alert(_ id: Int64, _ conversation: String, _ kind: String) {
    let titles = locale == "zh" ? ["reply": "Bot 有新回复", "question": "Bot 等待你的回答", "approval": "工具需要你的确认"] : ["reply": "New reply from your Bot", "question": "Your Bot has a question", "approval": "A tool needs your approval"]
    guard let title = titles[kind] else { return }
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = locale == "zh" ? "打开 DS Bot 查看详情" : "Open DS Bot to view details"
    content.sound = .default
    content.userInfo = ["serverId": serverId, "conversationId": conversation, "notificationId": id]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "ds-bot:\(serverId):\(id)", content: content, trigger: nil))
  }
}
