#!/bin/bash
set -euo pipefail

XCODE_ENV_LOCAL="ios/.xcode.env.local"
APP_DELEGATE_PATH="ios/zine/AppDelegate.swift"

if [ -f "$XCODE_ENV_LOCAL" ]; then
  # shellcheck disable=SC1090
  source "$XCODE_ENV_LOCAL"

  if [ -n "${NODE_BINARY:-}" ] && [ ! -x "$NODE_BINARY" ]; then
    echo "Removing stale NODE_BINARY from $XCODE_ENV_LOCAL: $NODE_BINARY"
    rm -f "$XCODE_ENV_LOCAL"
  fi
fi

# Swift 6/Xcode 16+ can require explicit import access levels.
# Also patch older AppDelegate templates that call APIs removed in newer Expo.
if [ -f "$APP_DELEGATE_PATH" ]; then
  if grep -q '^import Expo$' "$APP_DELEGATE_PATH" || grep -q '^@UIApplicationMain$' "$APP_DELEGATE_PATH" || grep -q '^public class AppDelegate: ExpoAppDelegate {' "$APP_DELEGATE_PATH" || grep -q 'bindReactNativeFactory(factory)' "$APP_DELEGATE_PATH"; then
    echo "Patching legacy AppDelegate template in $APP_DELEGATE_PATH"
    cat > "$APP_DELEGATE_PATH" <<'EOF'
internal import Expo
import Network
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    // Fixes networking related crashes on simulator in iOS 26 beta 1
    nw_tls_create_options()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
EOF
  fi
fi
