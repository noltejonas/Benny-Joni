import UIKit
import Capacitor

// Bridge-Controller aus Main.storyboard. Eigene Plugins der App (nicht aus
// node_modules) meldet Capacitor nur an, wenn man sie hier registriert.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
