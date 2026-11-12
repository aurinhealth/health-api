import Foundation

/// The app's steps for the usage statistics (src/usage-stats.js APP_NAMES):
/// setup pages, the Pro offer and the coach opening. Only with the opt-in
/// "Share setup steps" (consent usage_events): without it nothing is kept or
/// sent. Kept for the day in UserDefaults (names only, no values or times) and
/// sent when the app goes to the background, next to SettingsBackup.
@MainActor
enum UsageEvents {
    static let allowedKey = "usage.appSteps"
    /// The one-time notice was shown (RootView), or the setup's consent page told it.
    static let noticeKey = "usage.noticeShown"
    private static let pendingKey = "usage.pending"
    private static let limit = 30

    static var allowed: Bool { UserDefaults.standard.bool(forKey: allowedKey) }

    static func note(_ name: String) {
        guard allowed else { return }
        var pending = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        guard !pending.contains(name), pending.count < limit else { return }
        pending.append(name)
        UserDefaults.standard.set(pending, forKey: pendingKey)
    }

    /// The choice as the server has it; turned off, the waiting steps are dropped.
    static func setAllowed(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: allowedKey)
        if !on { UserDefaults.standard.removeObject(forKey: pendingKey) }
    }

    static func send(api: APIClient) async {
        let pending = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        guard allowed, !pending.isEmpty else { return }
        do {
            try await api.sendUsageEvents(pending)
            let left = (UserDefaults.standard.stringArray(forKey: pendingKey) ?? []).filter { !pending.contains($0) }
            UserDefaults.standard.set(left, forKey: pendingKey)
        } catch {
            // Tried again next time; nothing else depends on it.
        }
    }
}
