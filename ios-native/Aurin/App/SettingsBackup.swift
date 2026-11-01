import Foundation

/// The app's own settings kept with the account (src/app-settings.js): what the
/// user chose in the app (look, units, language, rest timer, reminders, the
/// "+" menu…) goes to the server when they leave the app, and a fresh install
/// takes it back after signing in, so deleting the app or a new iPhone keeps
/// it. What belongs to this phone (Apple Health and calendar access, the heart
/// rate strap, the alarms, caches) stays out.
@MainActor
enum SettingsBackup {
    /// The settings sent, by their UserDefaults key.
    static let keys: Set<String> = [
        "appearance", Units.key, L10n.key,
        "restSets", "restExercises", GymSignals.vibrationKey, GymSignals.soundKey, GymSignals.countdownKey,
        GymDayParts.storageKey,
        "libraryIndoor", "libraryPresetsRide", "libraryPresetsRun", "libraryToleranceRide", "libraryToleranceRun",
        "writeIntervals", "writeWahoo", "weekPlan.mode", "calendarMode", "favoriteActivityTypes",
        "plusMenu.items", "plusMenu.layout", QuickAction.storageKey,
        "foodListOrder", DrinkPrefs.favoritesKey, DrinkFigureKind.storageKey, DrinkFigureKind.animateKey,
        JournalSwitch.key, DeviceLocation.followKey, StoredIcons.key,
        "appleHealth.export"
    ]
    /// Every reminder (Reminders.swift, PushRegistration's morning and coach
    /// ones) and every kind of shared picture's options.
    static let prefixes = ["remind.", "share.options."]

    /// The account whose settings this phone already looked for (a fresh
    /// install looks once after signing in). Until then nothing is sent, so
    /// an empty new install never overwrites what the account kept.
    private static let checkedKey = "settingsBackup.checkedFor"
    /// The settings last sent, so leaving the app without a change sends nothing.
    private static let sentKey = "settingsBackup.sent"

    static func kept(_ key: String) -> Bool {
        keys.contains(key) || prefixes.contains { key.hasPrefix($0) }
    }

    static func current(_ defaults: UserDefaults = .standard) -> [String: Any] {
        defaults.dictionaryRepresentation().filter { kept($0.key) }
    }

    private static var account: Int? { UserDefaults.standard.object(forKey: AvatarStore.idKey) as? Int }

    /// After signing in and at launch: once per account on this phone, the
    /// settings the account kept come back.
    static func restore(api: APIClient) async {
        guard let account, UserDefaults.standard.object(forKey: checkedKey) as? Int != account else { return }
        guard let saved = try? await api.appSettings() else { return }
        if let text = saved.data, let data = Data(base64Encoded: text),
           let values = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] {
            apply(values)
        }
        UserDefaults.standard.set(account, forKey: checkedKey)
    }

    static func apply(_ values: [String: Any], to defaults: UserDefaults = .standard) {
        for (key, value) in values where kept(key) {
            // The widgets read these two from the App Group as well.
            if key == Units.key, let value = value as? String, defaults == .standard { Units.setSystem(value) }
            else if key == L10n.key, let value = value as? String, defaults == .standard { L10n.setLanguage(value) }
            else { defaults.set(value, forKey: key) }
        }
    }

    /// Leaving the app: the settings go out when they changed.
    static func send(api: APIClient) async {
        guard let account, UserDefaults.standard.object(forKey: checkedKey) as? Int == account else { return }
        let values = current()
        let last = UserDefaults.standard.data(forKey: sentKey)
            .flatMap { try? PropertyListSerialization.propertyList(from: $0, format: nil) as? [String: Any] }
        if let last, NSDictionary(dictionary: last).isEqual(to: values) { return }
        guard let data = try? PropertyListSerialization.data(fromPropertyList: values, format: .binary, options: 0) else { return }
        do {
            try await api.saveAppSettings(data.base64EncodedString())
            UserDefaults.standard.set(data, forKey: sentKey)
        } catch {}
    }

    /// Signing out: the next account looks for its own settings.
    static func forget() {
        UserDefaults.standard.removeObject(forKey: checkedKey)
        UserDefaults.standard.removeObject(forKey: sentKey)
    }
}

struct AppSettingsResponse: Decodable {
    let data: String?
}

extension APIClient {
    func appSettings() async throws -> AppSettingsResponse {
        try await get("/app/api/app-settings")
    }

    func saveAppSettings(_ data: String) async throws {
        let _: JSONValue = try await send("/app/api/app-settings", method: "PUT", body: ["data": data])
    }
}
