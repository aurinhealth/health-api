import Foundation
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// The alarm set in Nastavení → Spánek, rung by iOS itself (AlarmKit, iOS 26):
/// it sounds like the Clock app's alarm, also in silent mode and Focus. One
/// alarm repeats on work days, one at the weekend; changing the times replaces
/// them. Older iOS has no such API: the app only counts the bedtime from them.
enum SystemAlarm {
    private static let idsKey = "systemAlarmIDs"

    /// Whether this iPhone can have the app's alarm.
    static var supported: Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) { return true }
        #endif
        return false
    }

    /// Sets the alarms ("07:00" on work days, "08:30" at the weekend, nil for
    /// none). Returns what went wrong, nil when it is set.
    static func sync(work: String?, weekend: String?) async -> String? {
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
                var ids: [String] = []
                if let work, let id = try await schedule(manager, at: work, days: [.monday, .tuesday, .wednesday, .thursday, .friday], title: L10n.tr("Budík · pracovní den")) {
                    ids.append(id.uuidString)
                }
                if let weekend, let id = try await schedule(manager, at: weekend, days: [.saturday, .sunday], title: L10n.tr("Budík · víkend")) {
                    ids.append(id.uuidString)
                }
                UserDefaults.standard.set(ids, forKey: idsKey)
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
            guard (try? await manager.schedule(id: id, configuration: configuration(.fixed(date), title: L10n.tr("Budík · záloha hodinek")))) != nil else { return }
            UserDefaults.standard.set(id.uuidString, forKey: backupKey)
            UserDefaults.standard.set(date, forKey: backupKey + "Time")
        }
        #endif
    }

    /// Alarms set by an older version have no Snooze: they are set again once, at the
    /// same times (the app's start, AurinApp). Nothing goes to the server.
    static func upgrade() async {
        let key = "systemAlarmVersion", version = 2
        guard UserDefaults.standard.integer(forKey: key) < version else { return }
        await reschedule()
        UserDefaults.standard.set(version, forKey: key)
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
                var ids: [String] = []
                for alarm in alarms where saved.contains(alarm.id.uuidString) {
                    guard case .relative(let relative)? = alarm.schedule, case .weekly(let days) = relative.repeats else { continue }
                    try? manager.cancel(id: alarm.id)
                    let title = days.contains(.saturday) ? L10n.tr("Budík · víkend") : L10n.tr("Budík · pracovní den")
                    let id = UUID()
                    if (try? await manager.schedule(id: id, configuration: configuration(.relative(relative), title: title))) != nil {
                        ids.append(id.uuidString)
                    }
                }
                defaults.set(ids, forKey: idsKey)
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

    @available(iOS 26, *)
    private static func schedule(_ manager: AlarmManager, at time: String, days: [Locale.Weekday], title: String) async throws -> UUID? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
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
