import UIKit
import Capacitor
import GoogleMobileAds

// Fenster, Vorder-/Hintergrund-Wechsel und geöffnete Links laufen über den
// SceneDelegate. Hier bleibt nur, was iOS weiterhin an die App meldet.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Nur kontextbezogene Werbung: keine zusätzliche Publisher-Kennung.
        // Das startet das SDK nicht; Initialisierung folgt erst nach UMP.
        MobileAds.shared.requestConfiguration.setPublisherFirstPartyIDEnabled(false)
        return true
    }

    // MARK: - Push Notifications

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
