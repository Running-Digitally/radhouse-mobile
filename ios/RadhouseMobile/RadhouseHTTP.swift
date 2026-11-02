import Foundation
import React
import Security
import WebKit

private let appHost = "radhouse.sati.sh"
private let appOrigin = "https://radhouse.sati.sh"

@objc(RadhouseHTTP)
class RadhouseHTTP: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(randomBytes:rejecter:)
  func randomBytes(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      reject("random_failed", "Secure random unavailable", nil); return
    }
    resolve(Data(bytes).base64EncodedString())
    bytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
  }

  @objc(request:method:access:local:csrf:body:resolver:rejecter:)
  func request(_ raw: String, method: String, access: String, local: String,
               csrf: String, body: String, resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock) {
    guard let url = URL(string: raw), url.scheme == "https", url.user == nil,
          url.password == nil, url.port == nil, url.fragment == nil,
          ["GET", "POST", "PUT", "DELETE"].contains(method), body.utf8.count <= 262144,
          access.utf8.count <= 16384, local.utf8.count <= 200, csrf.utf8.count <= 200,
          ![access, local, csrf].contains(where: { $0.contains("\r") || $0.contains("\n") || $0.contains(";") }),
          url.host == appHost || (url.host == "login.cloudflareaccess.org" &&
            url.path.hasPrefix("/transfer/") && url.query == nil && method == "GET" &&
            access.isEmpty && local.isEmpty && csrf.isEmpty && body.isEmpty) else {
      reject("denied", "Request not allowed", nil); return
    }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 65)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if url.host == appHost {
      request.setValue(access, forHTTPHeaderField: "cf-access-token")
      request.setValue(appOrigin, forHTTPHeaderField: "Origin")
      if !local.isEmpty { request.setValue("radhouse_session=\(local)", forHTTPHeaderField: "Cookie") }
      if !csrf.isEmpty { request.setValue(csrf, forHTTPHeaderField: "x-radhouse-csrf") }
    }
    if method != "GET" {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body.data(using: .utf8)
    }
    NetworkJob(resolve: resolve, reject: reject).start(request)
  }

  @objc(syncCookies:local:resolver:rejecter:)
  func syncCookies(_ access: String, local: String, resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    guard !access.isEmpty, access.count <= 16384, !local.isEmpty, local.count <= 200,
          ![access,local].contains(where: { $0.contains(";") || $0.contains("\n") || $0.contains("\r") }) else {
      reject("denied", "Invalid viewer session", nil); return
    }
    DispatchQueue.main.async {
      let group = DispatchGroup()
      for (name,value) in [("CF_Authorization",access),("radhouse_session",local)] {
        let properties: [HTTPCookiePropertyKey: Any] = [.name:name, .value:value,
          .domain:appHost, .path:"/", .secure:"TRUE", HTTPCookiePropertyKey("HttpOnly"):"TRUE",
          HTTPCookiePropertyKey("SameSite"):"Strict"]
        guard let cookie = HTTPCookie(properties: properties) else {
          reject("denied", "Invalid viewer session", nil); return
        }
        group.enter()
        WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) { group.leave() }
      }
      group.notify(queue: .main) { resolve(nil) }
    }
  }

  @objc(clearCookies:rejecter:)
  func clearCookies(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      // This app's WebKit store is dedicated to its private authenticated viewers.
      WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
        modifiedSince: .distantPast) { resolve(nil) }
    }
  }
}

private final class NetworkJob: NSObject, URLSessionDataDelegate {
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock
  private var data = Data()
  private var tooLarge = false
  init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    self.resolve = resolve; self.reject = reject
  }
  func start(_ request: URLRequest) {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
    config.timeoutIntervalForRequest = 65; config.timeoutIntervalForResource = 70
    let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
    session.dataTask(with: request).resume() // Session retains this delegate until invalidation.
  }
  func urlSession(_ session: URLSession, task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    guard data.count + chunk.count <= 4194304 else { tooLarge = true; dataTask.cancel(); return }
    data.append(chunk)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer { session.finishTasksAndInvalidate() }
    guard error == nil, !tooLarge, let response = task.response as? HTTPURLResponse,
          let body = String(data: data, encoding: .utf8) else {
      reject("network_failed", "Could not complete secure request", nil); return
    }
    var token = ""
    if response.url?.host == appHost, response.url?.path == "/auth/login", response.statusCode == 200,
       let url = response.url, let headers = response.allHeaderFields as? [String:String] {
      token = HTTPCookie.cookies(withResponseHeaderFields: headers, for: url).first {
        $0.name == "radhouse_session" && $0.domain == appHost && $0.path == "/" && $0.isSecure && $0.isHTTPOnly
      }?.value ?? ""
    }
    resolve(["status":response.statusCode, "body":body, "sessionToken":token,
      "serviceKey":response.value(forHTTPHeaderField:"service-public-key") ?? "",
      "contentType":response.value(forHTTPHeaderField:"Content-Type") ?? ""])
  }
}
