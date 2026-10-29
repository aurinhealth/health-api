import Foundation
import SwiftUI

/// The watch's alarm (AurinWatch/AlarmView.swift): a wake time moved by the
/// crown is saved in the profile as Settings → Sleep saves it, and the alarm
/// rings either on the iPhone (SystemAlarm) or on the watch. When the watch
/// took it over from the iPhone, the iPhone keeps one backup five minutes
/// after the watch's, moved when the watch's is stopped or snoozed: watchOS
/// sets the watch's only while the app is open, and it may not ring.
extension WatchBridge {
    private static let movedKey = "systemAlarmOnWatch"
    private static let backupDelay: TimeInterval = 5 * 60

    /// The backup for the next wake time; kept while that alarm is under way.
    func updateAlarmBackup(_ alarm: WatchSnapshot.Alarm?, force: Bool = false) async {
        guard UserDefaults.standard.bool(forKey: Self.movedKey), Self.settings.alarmOnWatch else {
            if SystemAlarm.backupTime != nil { await SystemAlarm.backup(at: nil) }
            return
        }
        let now = Date()
        if !force, let set = SystemAlarm.backupTime, set > now, set.addingTimeInterval(-Self.backupDelay) <= now { return }
        let next = alarm?.nextWake(after: now).map { $0.addingTimeInterval(Self.backupDelay) }
        guard force || next != SystemAlarm.backupTime else { return }
        await SystemAlarm.backup(at: next)
    }

    /// The watch's alarm was stopped (the next morning's backup) or snoozed
    /// (the backup five minutes after the snooze).
    func watchAlarm(stopped: Bool, snoozedUntil: Date?) async {
        guard UserDefaults.standard.bool(forKey: Self.movedKey) else { return }
        if let snoozedUntil {
            await SystemAlarm.backup(at: snoozedUntil.addingTimeInterval(Self.backupDelay))
        } else if stopped {
            await updateAlarmBackup(currentAlarm, force: true)
        }
    }

    /// Saves the new wake time: tonight's only, or every work or weekend day
    /// (then tonight's own wake time goes, as SleepSettingsForm.saveEveryDay).
    func applyAlarm(_ change: WatchSnapshot.AlarmChange) async -> Bool {
        let api = AppModel.live?.api ?? APIClient()
        guard api.hasSession, var profile = try? await api.profile() else { return false }
        let tonight = AppModel.live?.health?.sleep.tonight
        let evening = change.evening ?? tonight?.date ?? ""
        let chosen = tonight?.chosen.map { JSONValue.number(Double($0)) } ?? .null
        switch change.scope {
        case "once":
            profile["sleepTonight"] = .object(["date": .string(evening), "minutes": chosen, "wake": .string(change.wake)])
        default:
            profile[change.scope == "weekend" ? "wakeTimeWeekend" : "wakeTime"] = .string(change.wake)
            profile["sleepTonight"] = tonight?.chosen == nil ? .null
                : .object(["date": .string(evening), "minutes": chosen, "wake": .string("")])
        }
        guard (try? await api.saveProfile(profile)) != nil else { return false }
        update(profile: profile)
        if UserDefaults.standard.bool(forKey: "systemAlarm") {
            _ = await SystemAlarm.sync(work: Self.wake(profile, "wakeTime"), weekend: Self.wake(profile, "wakeTimeWeekend"))
        }
        // The new bedtime for Today and Health, which come back to the watch.
        if let model = AppModel.live {
            await model.refreshHealth()
            await model.refresh()
        } else if let health = try? await api.health() {
            update(health)
        }
        return true
    }

    /// The watch rings from now on (the iPhone's alarm goes off), or the
    /// iPhone again, when it was the one that rang before.
    func alarmOnWatch(_ on: Bool) async {
        let defaults = UserDefaults.standard
        if Self.settings.alarmOnWatch != on { Self.settings.alarmOnWatch = on }
        if on {
            guard defaults.bool(forKey: "systemAlarm") else { return }
            SystemAlarm.cancel()
            defaults.set(false, forKey: "systemAlarm")
            defaults.set(true, forKey: Self.movedKey)
            await updateAlarmBackup(currentAlarm)
        } else if defaults.bool(forKey: Self.movedKey) {
            defaults.set(false, forKey: Self.movedKey)
            await SystemAlarm.backup(at: nil)
            let api = AppModel.live?.api ?? APIClient()
            guard let profile = try? await api.profile() else { return }
            if await SystemAlarm.sync(work: Self.wake(profile, "wakeTime"), weekend: Self.wake(profile, "wakeTimeWeekend")) == nil {
                defaults.set(true, forKey: "systemAlarm")
            }
        }
    }

    private static func wake(_ profile: JSONObject, _ key: String) -> String? {
        profile[key]?.string.flatMap { $0.isEmpty ? nil : $0 }
    }
}
