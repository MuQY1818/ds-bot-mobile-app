const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const legacyWindow = `    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)`;

const sceneDelegate = `class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
    window.makeKeyAndVisible()
    if let url = connectionOptions.urlContexts.first?.url {
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    }
  }
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}

`;

function transform(source) {
  if (source.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate')) return source;
  const anchor = 'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {';
  if (!source.includes(legacyWindow) || !source.includes(anchor)) {
    throw new Error('Local Scene lifecycle patch needs review for this Expo AppDelegate template');
  }
  return source.replace(legacyWindow, '    // The UIWindowScene creates the React Native window in SceneDelegate.')
    .replace(anchor, sceneDelegate + anchor);
}

module.exports = function withLocalSceneLifecycle(config) {
  config = withInfoPlist(config, config => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        }],
      },
    };
    return config;
  });
  return withAppDelegate(config, config => {
    if (config.modResults.language !== 'swift') throw new Error('Local Scene lifecycle patch requires Swift');
    config.modResults.contents = transform(config.modResults.contents);
    return config;
  });
};
module.exports.transform = transform;
