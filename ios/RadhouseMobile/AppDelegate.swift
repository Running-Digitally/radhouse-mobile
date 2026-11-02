import UIKit
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()
    }
    return true
  }
  func application(_ application: UIApplication,
                   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    ApplePushRegistration.shared.complete(deviceToken)
  }

  func application(_ application: UIApplication,
                   didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NSLog("Radhouse push: Apple registration failed with code %ld", (error as NSError).code)
    ApplePushRegistration.shared.fail("apple_registration_failed")
  }
}

// All state and callbacks are confined to the main queue. Tokens are never logged or persisted.
final class ApplePushRegistration {
  static let shared = ApplePushRegistration()
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var timeout: DispatchWorkItem?

  func start(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    fail("apple_registration_superseded")
#if targetEnvironment(simulator)
    reject("apple_simulator", "Use a physical device for notification delivery.", nil)
#else
    self.resolve = resolve
    self.reject = reject
    let timer = DispatchWorkItem { [weak self] in self?.fail("apple_registration_timeout") }
    timeout = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timer)
    NSLog("Radhouse push: requesting Apple registration callback")
    // Always request the callback; isRegisteredForRemoteNotifications is not token readiness.
    UIApplication.shared.registerForRemoteNotifications()
#endif
  }

  func complete(_ token: Data) {
    guard let callback = resolve else { return }
    clear()
    NSLog("Radhouse push: Apple registration callback received")
    callback(token.map { String(format: "%02x", $0) }.joined())
  }

  func fail(_ code: String) {
    guard let callback = reject else { return }
    clear()
    NSLog("Radhouse push: %@", code)
    callback(code, "Apple notification registration could not complete.", nil)
  }

  private func clear() {
    timeout?.cancel()
    timeout = nil
    resolve = nil
    reject = nil
  }
}

// UIKit owns the window through its scene lifecycle, including on iOS 27.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var privacyCover: UIView?
  private var reactNativeDelegate: ReactNativeDelegate?
  private var reactNativeFactory: RCTReactNativeFactory?

  func sceneWillResignActive(_ scene: UIScene) {
    guard let window else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = UIColor.systemBackground
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    privacyCover?.removeFromSuperview()
    window.addSubview(cover)
    privacyCover = cover
    // React Native 0.85 observes the application lifecycle notifications.
    NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: UIApplication.shared)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: UIApplication.shared)
    privacyCover?.removeFromSuperview()
    privacyCover = nil
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let delegate = ReactNativeDelegate()
    delegate.dependencyProvider = RCTAppDependencyProvider()
    let factory = RCTReactNativeFactory(delegate: delegate)
    reactNativeDelegate = delegate
    reactNativeFactory = factory
    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    // Preserve cold-start notification data for the messaging adapter.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let response = connectionOptions.notificationResponse {
      launchOptions[.remoteNotification] = response.notification.request.content.userInfo
    }
    factory.startReactNative(
      withModuleName: "RadhouseMobile", in: sceneWindow, launchOptions: launchOptions
    )
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
