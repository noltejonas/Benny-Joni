import Capacitor
import WidgetKit

// Brücke von der Web-App zum Homescreen-Widget (www/widget-model.js: PTWidget.sync).
// update speichert den Schnappschuss (WidgetStore, geteilte Keychain) und lädt das Widget neu,
// clear leert ihn (Abmelden, Konto löschen). Registriert in MainViewController.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("snapshot"), !json.isEmpty else {
            call.reject("snapshot fehlt")
            return
        }
        guard WidgetStore.save(json) else {
            call.reject("Schnappschuss nicht gespeichert")
            return
        }
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.widgetKind)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        WidgetStore.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.widgetKind)
        call.resolve()
    }
}
