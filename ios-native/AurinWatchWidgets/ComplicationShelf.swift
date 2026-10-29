import Foundation
import Security

/// Today for the watch face: the watch app keeps the last snapshot from the
/// iPhone here (WatchStore), and the complications (AurinWatchWidgets) read it.
/// A Keychain item in the group both have (keychain-access-groups), as the
/// watch app and its widgets share no App Group.
enum ComplicationShelf {
    private static let service = "health.aurin.watch.today"

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
    }

    /// Without the 90 days of history, which the watch face doesn't draw.
    static func save(_ snapshot: WatchSnapshot) {
        var small = snapshot
        small.sleep?.nights = []
        small.restingHR?.series = []
        small.hrv?.series = []
        guard let data = small.encoded() else { return }
        let update: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    static func clear() {
        SecItemDelete(query as CFDictionary)
    }

    static func load() -> WatchSnapshot? {
        var read = query
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(read as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return WatchSnapshot.decode(data)
    }
}
