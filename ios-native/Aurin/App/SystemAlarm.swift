import Foundation
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// The alarm set in Nastavení → Spánek, rung by iOS itself (AlarmKit, iOS 26):
/// it sounds like the Clock app's alarm, also in silent mode and Focus. One
/// alarm repeats on work days, one at the weekend, each on its chosen days
/// (AlarmDays); changing them replaces both. Older iOS has no such API: the app only counts the bedtime from them.
enum SystemAlarm {
    private static let idsKey = "systemAlarmIDs"
    /// Each alarm's title by its id: Snooze changed sets it again under the same one.
    private static let titlesKey = "systemAlarmTitles"

    /// Whether this iPhone can have the app's alarm.
    static var supported: Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) { return true }
        #endif
        return false
    }

    /// The alarms of a saved profile (WatchAlarmBridge, the app's start).
    static func sync(profile: JSONObject) async -> String? {
        let wake = { (key: String) in profile[key]?.string.flatMap { $0.isEmpty ? nil : $0 } }
        return await sync(work: wake("wakeTime"), weekend: wake("wakeTimeWeekend"),
                          workDays: AlarmDays.mask(profile["wakeDays"], fallback: AlarmDays.work),
                          weekendDays: AlarmDays.mask(profile["wakeDaysWeekend"], fallback: AlarmDays.weekend))
    }

    /// Sets the alarms ("07:00" on work days, "08:30" at the weekend, nil for
    /// none) on their days. Returns what went wrong, nil when it is set.
    static func sync(work: String?, weekend: String?, workDays: Int = AlarmDays.work, weekendDays: Int = AlarmDays.weekend) async -> String? {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            do {
                let manager = AlarmManager.shared
                switch manager.authorizationState {
                case .denied: return L10n.tr("Budík nemá povolení. Povol ho v Nastavení iPhonu → Aplikace → Aurin.")
                case .authorized: break
                default:
                    guard try await manager.requestAuthorization() == .authorized else {
                        return L10n.tr("Bez povolení budík nastavit nejde.")
                    }
                }
                cancelSaved(manager)
                var ids: [String] = [], titles: [String: String] = [:]
                for (time, days, title) in [(work, workDays, L10n.tr("Budík na pracovní den")), (weekend, weekendDays, L10n.tr("Budík na víkend"))] {
                    if let time, let id = try await schedule(manager, at: time, days: weekdays(days), title: title) {
                        ids.append(id.uuidString)
                        titles[id.uuidString] = title
                    }
                }
                UserDefaults.standard.set(ids, forKey: idsKey)
                UserDefaults.standard.set(titles, forKey: titlesKey)
                return nil
            } catch {
                return L10n.f("Budík se nepodařilo nastavit: %@", error.localizedDescription)
            }
        }
        #endif
        return L10n.tr("Budík v iPhonu potřebuje iOS 26.")
    }

    /// Takes the app's alarms away.
    static func cancel() {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) { cancelSaved(AlarmManager.shared) }
        #endif
        UserDefaults.standard.removeObject(forKey: idsKey)
        UserDefaults.standard.removeObject(forKey: titlesKey)
    }

    private static let backupKey = "systemAlarmBackup"

    /// When the iPhone's backup for the watch's alarm rings, if set.
    static var backupTime: Date? {
        UserDefaults.standard.object(forKey: backupKey + "Time") as? Date
    }

    /// One alarm on the iPhone at `date`, for when the watch's doesn't wake
    /// (WatchAlarmBridge): replaces the one before; nil takes it away.
    static func backup(at date: Date?) async {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            let manager = AlarmManager.shared
            if let text = UserDefaults.standard.string(forKey: backupKey), let id = UUID(uuidString: text) {
                try? manager.cancel(id: id)
            }
            UserDefaults.standard.removeObject(forKey: backupKey)
            UserDefaults.standard.removeObject(forKey: backupKey + "Time")
            guard let date, date > Date(), manager.authorizationState == .authorized else { return }
            let id = UUID()
            guard (try? await manager.schedule(id: id, configuration: configuration(.fixed(date), title: L10n.tr("Záložní budík hodinek")))) != nil else { return }
            UserDefaults.standard.set(id.uuidString, forKey: backupKey)
            UserDefaults.standard.set(date, forKey: backupKey + "Time")
        }
        #endif
    }

    /// The app's start (AurinApp). With "Wake me on iPhone" off no alarm of the
    /// app rings but the watch's backup. Once per version the alarms are also set
    /// again from the profile: an older one had no Snooze (2), and one kept an
    /// alarm after both were turned off until the next save (3, #922).
    @MainActor static func upgrade(api: APIClient?) async {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "systemAlarm") else {
            cancel()
            // A build without the watch app has no watch's alarm to back up.
            if !WatchBridge.inBuild, backupTime != nil { await backup(at: nil) }
            return
        }
        let key = "systemAlarmVersion", version = 3
        guard defaults.integer(forKey: key) < version else { return }
        // No profile (offline, signed out): the next start tries again.
        guard let api, api.hasSession, let profile = try? await api.profile() else { return }
        let wake = { (name: String) in profile[name]?.string.flatMap { $0.isEmpty ? nil : $0 } }
        if wake("wakeTime") == nil && wake("wakeTimeWeekend") == nil { cancel() } else { _ = await sync(profile: profile) }
        // The iPhone rings itself, so there is no watch's alarm to back up.
        if !defaults.bool(forKey: "systemAlarmOnWatch") { await backup(at: nil) }
        defaults.set(version, forKey: key)
    }

    /// Snooze on or off, or its length changed (Nastavení → Spánek): the alarms
    /// already set are set again at the same times, the watch's backup too.
    static func reschedule() async {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            let defaults = UserDefaults.standard
            let manager = AlarmManager.shared
            let saved = defaults.stringArray(forKey: idsKey) ?? []
            if !saved.isEmpty, manager.authorizationState == .authorized, let alarms = try? manager.alarms {
                let oldTitles = defaults.dictionary(forKey: titlesKey) as? [String: String] ?? [:]
                var ids: [String] = [], titles: [String: String] = [:]
                for alarm in alarms where saved.contains(alarm.id.uuidString) {
                    guard case .relative(let relative)? = alarm.schedule, case .weekly(let days) = relative.repeats else { continue }
                    try? manager.cancel(id: alarm.id)
                    let title = oldTitles[alarm.id.uuidString] ?? (days.contains(.saturday) ? L10n.tr("Budík na víkend") : L10n.tr("Budík na pracovní den"))
                    let id = UUID()
                    if (try? await manager.schedule(id: id, configuration: configuration(.relative(relative), title: title))) != nil {
                        ids.append(id.uuidString)
                        titles[id.uuidString] = title
                    }
                }
                defaults.set(ids, forKey: idsKey)
                defaults.set(titles, forKey: titlesKey)
            }
            if let time = backupTime, time > Date() { await backup(at: time) }
        }
        #endif
    }

    /// Nastavení → Spánek: Snooze on (the default) and its length, 1–15 minutes (5).
    static let snoozeKey = "systemAlarmSnooze"
    static let snoozeMinutesKey = "systemAlarmSnoozeMinutes"
    static let snoozeRange = 1...15
    static var snoozeOn: Bool { UserDefaults.standard.object(forKey: snoozeKey) as? Bool ?? true }
    static var snoozeMinutes: Int {
        let value = UserDefaults.standard.integer(forKey: snoozeMinutesKey)
        return snoozeRange.contains(value) ? value : 5
    }

    #if canImport(AlarmKit)
    /// Every alarm of the app but the watch's backup: also one whose id was
    /// never saved (a sync that failed halfway), so none rings once turned off.
    @available(iOS 26, *)
    private static func cancelSaved(_ manager: AlarmManager) {
        let backup = UserDefaults.standard.string(forKey: backupKey).flatMap(UUID.init(uuidString:))
        var ids = Set((UserDefaults.standard.stringArray(forKey: idsKey) ?? []).compactMap(UUID.init(uuidString:)))
        if let alarms = try? manager.alarms { ids.formUnion(alarms.map(\.id)) }
        for id in ids where id != backup { try? manager.cancel(id: id) }
    }

    /// AlarmDays bits as AlarmKit's days.
    @available(iOS 26, *)
    private static func weekdays(_ days: Int) -> [Locale.Weekday] {
        let all: [Locale.Weekday] = [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
        return all.indices.filter { days & (1 << $0) != 0 }.map { all[$0] }
    }

    @available(iOS 26, *)
    private static func schedule(_ manager: AlarmManager, at time: String, days: [Locale.Weekday], title: String) async throws -> UUID? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        // No day chosen: no alarm (an empty week would ring once).
        guard parts.count == 2, !days.isEmpty else { return nil }
        let schedule = Alarm.Schedule.relative(.init(time: .init(hour: parts[0], minute: parts[1]), repeats: .weekly(days)))
        let id = UUID()
        _ = try await manager.schedule(id: id, configuration: configuration(schedule, title: title))
        return id
    }

    /// The ringing alarm: "I'm up" and, when on, Snooze; while snoozed "Snoozed"
    /// with the time left. iOS draws it through the widget extension's Live
    /// Activity (WakeAlarmWidget); its buttons are the system's on the lock screen.
    @available(iOS 26, *)
    private static func configuration(_ schedule: Alarm.Schedule, title: String) -> AlarmManager.AlarmConfiguration<WakeAlarm> {
        let snooze = snoozeOn
        let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title),
                                            stopButton: AlarmButton(text: LocalizedStringResource(stringLiteral: L10n.tr("Vstávám")), textColor: .white, systemImageName: "sun.max.fill"),
                                            secondaryButton: snooze ? AlarmButton(text: LocalizedStringResource(stringLiteral: L10n.tr("Odložit")), textColor: .white, systemImageName: "zzz") : nil,
                                            secondaryButtonBehavior: snooze ? .countdown : nil)
        let countdown = snooze ? AlarmPresentation.Countdown(title: LocalizedStringResource(stringLiteral: L10n.tr("Odloženo"))) : nil
        let presentation = AlarmPresentation(alert: alert, countdown: countdown, paused: nil)
        let attributes = AlarmAttributes<WakeAlarm>(presentation: presentation, tintColor: Palette.indigo)
        let duration = snooze ? Alarm.CountdownDuration(preAlert: nil, postAlert: TimeInterval(snoozeMinutes * 60)) : nil
        return AlarmManager.AlarmConfiguration(countdownDuration: duration, schedule: schedule, attributes: attributes)
    }
    #endif
}
