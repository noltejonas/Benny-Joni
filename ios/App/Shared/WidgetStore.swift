import Foundation
import Security

// Gemeinsamer Speicher von App und Homescreen-Widget. Die App legt hier den
// Schnappschuss der Woche ab (www/widget-model.js → WidgetBridgePlugin), das
// Widget liest ihn. Gehört zu beiden Targets (App und BennyJoniWidget).
//
// Geteilt wird über eine Keychain-Gruppe mit Team-Präfix
// ($(AppIdentifierPrefix)com.bennyjoni.terminator.shared, steht als
// BJSharedKeychainGroup in beiden Info.plist). Anders als eine App Group muss
// sie nicht im Developer-Portal registriert werden: Jedes Provisioning-Profil
// des Teams erlaubt solche Gruppen, die Signierung per API-Key reicht.
enum WidgetStore {
    // Muss zum kind in BennyJoniWidget.swift passen, sonst lädt reloadTimelines nichts neu.
    static let widgetKind = "BennyJoniWeek"
    private static let service = "com.bennyjoni.terminator.widget"
    private static let account = "snapshot.v1"

    static var accessGroup: String? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "BJSharedKeychainGroup") as? String,
              !group.isEmpty, !group.hasPrefix("$(") else { return nil }
        return group
    }

    private static func query() -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup { q[kSecAttrAccessGroup as String] = accessGroup }
        return q
    }

    @discardableResult
    static func save(_ json: String) -> Bool {
        guard let data = json.data(using: .utf8) else { return false }
        // Nach dem ersten Entsperren lesbar: Widgets rendern auch bei gesperrtem Gerät.
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        var status = SecItemUpdate(query() as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let add = query().merging(attributes) { _, new in new }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        return status == errSecSuccess
    }

    static func clear() {
        SecItemDelete(query() as CFDictionary)
    }

    static func load() -> Data? {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
}
