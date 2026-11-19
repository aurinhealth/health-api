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
    /// Tomorrow's own wake time ("Jen zítra"): when it has passed, the app's start sets the alarms again.
    private static let onceKey = "systemAlarmOnce"

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
                          weekendDays: AlarmDays.mask(profile["wakeDaysWeekend"], fallback: AlarmDays.weekend),
                          once: onceWake(profile["sleepTonight"]))
    }

    /// The profile's sleepTonight {date: "2026-11-18", wake: "06:05"}: the
    /// morning after that evening at that time, while it is still ahead.
    static func onceWake(_ value: JSONValue?) -> Date? {
        guard case .object(let tonight)? = value, let evening = tonight["date"]?.string,
              let wake = tonight["wake"]?.string, !wake.isEmpty else { return nil }
        let parts = evening.split(separator: "-").compactMap { Int($0) }, time = wake.split(separator: ":").compactMap { Int($0) }
        let calendar = Calendar.current
        guard parts.count == 3, time.count == 2,
              let start = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              let morning = calendar.date(byAdding: .day, value: 1, to: start),
              let day = calendar.date(bySettingHour: time[0], minute: time[1], second: 0, of: morning),
              day > Date() else { return nil }
        return day
    }

    /// Sets the alarms ("07:00" on work days, "08:30" at the weekend, nil for
    /// none) on their days, and `once`, tomorrow's own wake time, instead of
    /// that morning's usual alarm. Returns what went wrong, nil when it is set.
    static func sync(work: String?, weekend: String?, workDays: Int = AlarmDays.work, weekendDays: Int = AlarmDays.weekend, once: Date? = nil) async -> String? {
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
                func keep(_ id: UUID?, _ title: String) {
                    guard let id else { return }
                    ids.append(id.uuidString)
                    titles[id.uuidString] = title
                }
                // The weekday of tomorrow's own wake time (bit 0 = Sunday).
                let onceBit = once.map { 1 << (Calendar(identifier: .gregorian).component(.weekday, from: $0) - 1) } ?? 0
                for (time, days, title) in [(work, workDays, L10n.tr("Budík na pracovní den")), (weekend, weekendDays, L10n.tr("Budík na víkend"))] {
                    guard let time else { continue }
                    guard let once, days & onceBit != 0 else {
                        try await keep(schedule(manager, at: time, days: weekdays(days), title: title), title)
                        continue
                    }
                    // That weekday skips its usual alarm once: it repeats on the
                    // other days and rings on that day the next four weeks,
                    // until the app's start sets the weekly one again.
                    try await keep(schedule(manager, at: time, days: weekdays(days & ~onceBit), title: title), title)
                    for week in 1...4 {
                        if let day = Calendar.current.date(byAdding: .day, value: 7 * week, to: once), let date = at(time, on: day) {
                            try await keep(schedule(manager, on: date, title: title), title)
                        }
                    }
                }
                if let once {
                    let title = weekendDays & onceBit != 0 ? L10n.tr("Budík na víkend") : L10n.tr("Budík na pracovní den")
                    try await keep(schedule(manager, on: once, title: title), title)
                    UserDefaults.standard.set(once, forKey: onceKey)
                } else {
                    UserDefaults.standard.removeObject(forKey: onceKey)
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
        UserDefaults.standard.removeObject(forKey: onceKey)
    }

    private static let backupKey = "systemAlarmBackup"

    /// When the iPhone's backup for the watch's alarm rings, if set.
    static var backupTime: Date? {
        UserDefaults.standard.object(forKey: backupKey + "Time") as? Date
    }

    /// The watch's backup rings now or is snoozed: moving it then would silence it.
    static var backupUnderWay: Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26, *), let text = UserDefaults.standard.string(forKey: backupKey), let id = UUID(uuidString: text),
           let alarm = (try? AlarmManager.shared.alarms)?.first(where: { $0.id == id }) {
            return alarm.state != .scheduled
        }
        #endif
        return false
    }

    /// One alarm on the iPhone at `date`, for when the watch's doesn't wake
    /// (WatchAlarmBridge): replaces the one before; nil takes it away.
    static func backup(at date: Date?) async {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            let manager = AlarmManager.shared
            // A snooze on the watch sets it again (WatchAlarmBridge.watchAlarm).
            UserDefaults.standard.removeObject(forKey: "systemAlarmBackupSnoozed")
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
        guard defaults.integer(forKey: key) < version else { await restoreAfterOnce(api: api); return }
        // No profile (offline, signed out): the next start tries again.
        guard let api, api.hasSession, let profile = try? await api.profile() else { return }
        let wake = { (name: String) in profile[name]?.string.flatMap { $0.isEmpty ? nil : $0 } }
        if wake("wakeTime") == nil && wake("wakeTimeWeekend") == nil { cancel() } else { _ = await sync(profile: profile) }
        // The iPhone rings itself, so there is no watch's alarm to back up.
        if !defaults.bool(forKey: "systemAlarmOnWatch") { await backup(at: nil) }
        defaults.set(version, forKey: key)
    }

    /// Tomorrow's own wake time has passed (the app's start, back from the
    /// background): the usual alarm repeats on that weekday again. Not while an
    /// alarm of the app rings or is snoozed: setting them again would silence it.
    @MainActor static func restoreAfterOnce(api: APIClient?) async {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "systemAlarm"), let once = defaults.object(forKey: onceKey) as? Date, once < Date(),
              !underWay, let api, api.hasSession, let profile = try? await api.profile() else { return }
        _ = await sync(profile: profile)
    }

    /// An alarm of the app (not the watch's backup) rings or is snoozed now.
    private static var underWay: Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            let saved = Set(UserDefaults.standard.stringArray(forKey: idsKey) ?? [])
            return ((try? AlarmManager.shared.alarms) ?? []).contains { saved.contains($0.id.uuidString) && $0.state != .scheduled }
        }
        #endif
        return false
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
                    let schedule: Alarm.Schedule, weekend: Bool
                    switch alarm.schedule {
                    case .relative(let relative)?:
                        guard case .weekly(let days) = relative.repeats else { continue }
                        (schedule, weekend) = (.relative(relative), days.contains(.saturday))
                    case .fixed(let date)? where date > Date():
                        let day = Calendar(identifier: .gregorian).component(.weekday, from: date)
                        (schedule, weekend) = (.fixed(date), day == 1 || day == 7)
                    default: continue
                    }
                    try? manager.cancel(id: alarm.id)
                    let title = oldTitles[alarm.id.uuidString] ?? (weekend ? L10n.tr("Budík na víkend") : L10n.tr("Budík na pracovní den"))
                    let id = UUID()
                    if (try? await manager.schedule(id: id, configuration: configuration(schedule, title: title))) != nil {
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

    /// One alarm at `date`: tomorrow's own wake time, or the usual one on its weekday the weeks after.
    @available(iOS 26, *)
    private static func schedule(_ manager: AlarmManager, on date: Date, title: String) async throws -> UUID {
        let id = UUID()
        _ = try await manager.schedule(id: id, configuration: configuration(.fixed(date), title: title))
        return id
    }

    /// "07:00" on the day of `day`.
    private static func at(_ time: String, on day: Date) -> Date? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
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
