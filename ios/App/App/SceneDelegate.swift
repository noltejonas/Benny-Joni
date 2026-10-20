import UIKit
import Capacitor

// Scene-Lebenszyklus: Ab iOS 27 startet eine App, die mit dem aktuellen SDK
// gebaut ist, ohne ihn nicht mehr. Fenster und CAPBridgeViewController kommen
// weiterhin aus Main.storyboard (UISceneStoryboardFile in der Info.plist).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Kaltstart über einen Link oder eine User Activity an Capacitor weiterreichen.
        connectionOptions.urlContexts.forEach(openURL)
        connectionOptions.userActivities.forEach(continueUserActivity)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach(openURL)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueUserActivity(userActivity)
    }

    // Mit Scenes ruft iOS application(_:open:options:) und
    // application(_:continue:restorationHandler:) im AppDelegate nicht mehr auf.
    // Damit das App-API von Capacitor Links weiter mitbekommt, gehen sie hier
    // an den ApplicationDelegateProxy.
    private func openURL(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
        if let source = context.options.sourceApplication { options[.sourceApplication] = source }
        if let annotation = context.options.annotation { options[.annotation] = annotation }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    private func continueUserActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
