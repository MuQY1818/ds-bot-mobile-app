import Foundation
import Security
import CryptoKit

func validLocalPin(_ value: String) -> Bool { value.range(of: "^sha256:[a-f0-9]{64}$", options: .regularExpression) != nil }
private func unbracketedHost(_ value: String?) -> String? {
  guard let value = value else { return nil }
  return value.hasPrefix("[") && value.hasSuffix("]") ? String(value.dropFirst().dropLast()) : value
}
func validateLocalURL(_ origin: String, _ url: String, socket: Bool = false) -> Bool {
  guard let base = URLComponents(string: origin), let target = URLComponents(string: url) else { return false }
  return base.scheme == "https" && base.host != nil && base.user == nil && base.password == nil && base.query == nil && base.fragment == nil && ["", "/"].contains(base.path)
    && target.scheme == (socket ? "wss" : "https") && target.host == base.host && (target.port ?? 443) == (base.port ?? 443)
    && target.user == nil && target.password == nil && target.fragment == nil && target.path.hasPrefix("/mobile/v1/")
}

// SecKey's external EC representation omits the SPKI wrapper. Read the certificate's exact DER SPKI instead.
private func certificateSPKI(_ cert: SecCertificate) -> Data? {
  let bytes = [UInt8](SecCertificateCopyData(cert) as Data)
  func node(_ start: Int) -> (tag: UInt8, body: Int, end: Int)? {
    guard start >= 0, start + 2 <= bytes.count else { return nil }
    let first = Int(bytes[start + 1]); var offset = start + 2; var size = first
    if first >= 128 {
      let count = first & 127
      guard count > 0, count <= 4, offset + count <= bytes.count else { return nil }
      size = 0
      for _ in 0..<count { size = (size << 8) | Int(bytes[offset]); offset += 1 }
    }
    guard size >= 0, size <= bytes.count - offset else { return nil }
    return (bytes[start], offset, offset + size)
  }
  guard let outer = node(0), outer.tag == 0x30, outer.end == bytes.count, let tbs = node(outer.body), tbs.tag == 0x30 else { return nil }
  var at = tbs.body
  if let version = node(at), version.tag == 0xa0 { at = version.end }
  var issuer: Data?; var subject: Data?; var validity: (Date, Date)?
  func date(_ field: (tag: UInt8, body: Int, end: Int)) -> Date? {
    guard field.tag == 0x17 || field.tag == 0x18, let text = String(bytes: bytes[field.body..<field.end], encoding: .ascii),
      text.range(of: field.tag == 0x17 ? "^[0-9]{12}Z$" : "^[0-9]{14}Z$", options: .regularExpression) != nil else { return nil }
    let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.timeZone = TimeZone(secondsFromGMT: 0)
    parser.isLenient = false; parser.twoDigitStartDate = Date(timeIntervalSince1970: -631152000)
    parser.dateFormat = field.tag == 0x17 ? "yyMMddHHmmss'Z'" : "yyyyMMddHHmmss'Z'"
    return parser.date(from: text)
  }
  for index in 0..<5 {
    guard let field = node(at), field.end <= tbs.end else { return nil }
    if index == 2 { issuer = Data(bytes[at..<field.end]) }
    if index == 4 { subject = Data(bytes[at..<field.end]) }
    if index == 3, let from = node(field.body), let to = node(from.end), to.end == field.end, let start = date(from), let end = date(to) { validity = (start, end) }
    at = field.end
  }
  // An explicitly anchored leaf must still expire and carry a valid self-signature.
  guard issuer == subject, let validity = validity, validity.0 <= Date(), validity.1 > Date(),
    let spki = node(at), spki.tag == 0x30, spki.end <= tbs.end,
    let algorithm = node(tbs.end), let signature = node(algorithm.end), signature.tag == 3,
    signature.end == outer.end, signature.body < signature.end, bytes[signature.body] == 0,
    let key = SecCertificateCopyKey(cert), SecKeyVerifySignature(key, .ecdsaSignatureMessageX962SHA256,
      Data(bytes[outer.body..<tbs.end]) as CFData, Data(bytes[(signature.body + 1)..<signature.end]) as CFData, nil) else { return nil }
  return Data(bytes[at..<spki.end])
}

class LocalTrustDelegate: NSObject, URLSessionTaskDelegate {
  let origin: String
  let pin: String
  init(origin: String, pin: String) { self.origin = origin; self.pin = pin }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if pin.isEmpty { completionHandler(.performDefaultHandling, nil); return }
    guard validLocalPin(pin), challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let expected = URLComponents(string: origin), let peerHost = unbracketedHost(challenge.protectionSpace.host), peerHost == unbracketedHost(expected.host),
      challenge.protectionSpace.port == (expected.port ?? 443), let trust = challenge.protectionSpace.serverTrust,
      SecTrustGetCertificateCount(trust) == 1, let cert = SecTrustGetCertificateAtIndex(trust, 0), let spki = certificateSPKI(cert),
      "sha256:" + SHA256.hash(data: spki).map({ String(format: "%02x", $0) }).joined() == pin else {
      completionHandler(.cancelAuthenticationChallenge, nil); return
    }
    SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, peerHost as CFString))
    SecTrustSetAnchorCertificates(trust, [cert] as CFArray)
    SecTrustSetAnchorCertificatesOnly(trust, true)
    guard SecTrustEvaluateWithError(trust, nil) else { completionHandler(.cancelAuthenticationChallenge, nil); return }
    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}
