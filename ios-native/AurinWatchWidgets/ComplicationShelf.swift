import Foundation
import Security

/// Today for the watch face: the watch app keeps the last snapshot from the
/// iPhone here (WatchStore), and the complications (AurinWatchWidgets) read it.
/// A Keychain item in the group both have (keychain-access-groups), as the
/// watch app and its widgets share no App Group.
enum ComplicationShelf {
    private static let service = "health.aurin.watch.today"
    private static let planService = "health.aurin.watch.plan"

    private static func query(_ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
    }

    /// The next ride's or run's steps, for the Workout complication's bars.
    struct Planned: Codable, Equatable, Sendable {
        var id: String
        var plan: WatchPlan
    }

    /// Without the 90 days of history, which the watch face doesn't draw: only
    /// the last two days, for the arrow against yesterday.
    static func save(_ snapshot: WatchSnapshot) {
        var small = snapshot
        small.sleep?.nights = []
        small.restingHR?.series = Array(snapshot.restingHR?.series.suffix(2) ?? [])
        small.hrv?.series = Array(snapshot.hrv?.series.suffix(2) ?? [])
        guard let data = small.encoded() else { return }
        write(data, service)
    }

    static func save(plan: WatchPlan, id: String) {
        guard let data = try? JSONEncoder().encode(Planned(id: id, plan: plan)) else { return }
        write(data, planService)
    }

    static func clear() {
        SecItemDelete(query(service) as CFDictionary)
        SecItemDelete(query(planService) as CFDictionary)
    }

    static func load() -> WatchSnapshot? {
        read(service).flatMap(WatchSnapshot.decode)
    }

    static func plan() -> Planned? {
        read(planService).flatMap { try? JSONDecoder().decode(Planned.self, from: $0) }
    }

    private static func write(_ data: Data, _ service: String) {
        let update: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(query(service) as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            var item = query(service)
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    private static func read(_ service: String) -> Data? {
        var read = query(service)
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(read as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
}
