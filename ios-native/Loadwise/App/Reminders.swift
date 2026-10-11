import Foundation
import UserNotifications

/// Local reminders, planned on the phone from the Today data (no push server
/// needed, so they work with a free signing too): bedtime, today's workout,
/// water during the day and logging the evening meal. Each one can be turned
/// off in Settings → Oznámení.
enum Reminders {
    static let bedtimeKey = "remind.bedtime"
    static let workoutKey = "remind.workout"
    static let waterKey = "remind.water"
    static let foodKey = "remind.food"

    private static let prefix = "loadwise."

    static func isOn(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    /// Asks for permission once (the first time any reminder is on).
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Plans today's reminders again from the latest Today screen.
    static func reschedule(from today: TodaySnapshot) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)

        // Bedtime: 30 minutes before, with the night's need.
        if isOn(bedtimeKey), let bed = today.tonight?.bedtime, let need = today.tonight?.need, let at = minutes(bed) {
            let remind = (at - 30 + 1440) % 1440
            // A bedtime after midnight (00:40) reminds at 00:10 tonight, which is "earlier" than now.
            add(center, "bedtime", at: remind, title: L10n.tr("Za půl hodiny do postele"),
                body: L10n.f("Na dnešní noc potřebuješ %@. Jdi spát do %@.", Fmt.duration(need), bed), afterMidnight: remind < 6 * 60)
        }
        // Today's planned workout: an hour before its start.
        if isOn(workoutKey) {
            for item in today.plan where item.kind == "workout" && !item.done {
                guard let time = item.time, let at = minutes(time), at >= 60 else { continue }
                add(center, "workout." + time, at: at - 60, title: L10n.f("Za hodinu: %@", item.title),
                    body: item.detail.map { L10n.f("%@. Dej si něco malého a připrav se.", $0) } ?? L10n.tr("Dej si něco malého a připrav se."))
            }
        }
        // Water at 10, 13 and 16 while below the day's target.
        if isOn(waterKey), let target = today.nutrition.water.target, (today.nutrition.water.ml ?? 0) < target {
            let amount = Units.imperial ? Units.volumeText(target) : Fmt.decimal(target / 1000) + " l"
            for hour in [10, 13, 16] {
                add(center, "water.\(hour)", at: hour * 60, title: L10n.tr("Napij se"),
                    body: L10n.f("Dnešní cíl je %@ vody.", amount))
            }
        }
        // The evening: log what was eaten.
        if isOn(foodKey) {
            // Every evening, also on days the app is not opened.
            add(center, "food", at: 20 * 60 + 30, title: L10n.tr("Zapiš jídlo"), body: L10n.tr("Ať sedí dnešní příjem a zítřejší doporučení."), repeats: true)
        }
    }

    /// The end of a rest in Režim tréninku, so it sounds with the phone locked
    /// too (in the app a vibration says it). nil cancels it.
    static func restEnds(at end: Date?) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [restId])
        guard let end, end.timeIntervalSinceNow > 1 else { return }
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined { status = await requestPermission() ? .authorized : .denied }
        guard status == .authorized || status == .provisional else { return }
        let content = UNMutableNotificationContent()
        content.title = L10n.tr("Konec pauzy")
        content.body = L10n.tr("Další série.")
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: end.timeIntervalSinceNow, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: restId, content: content, trigger: trigger))
    }

    /// Outside the "loadwise." prefix, so planning the day keeps it.
    private static let restId = "loadwise-rest"

    static func cancelAll() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix(prefix) })
        }
    }

    /// Only times still ahead today are planned, unless the reminder repeats
    /// daily or belongs to the coming night (afterMidnight: the next 00:10).
    private static func add(_ center: UNUserNotificationCenter, _ id: String, at minute: Int, title: String, body: String,
                            repeats: Bool = false, afterMidnight: Bool = false) {
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let nowMinute = (now.hour ?? 0) * 60 + (now.minute ?? 0)
        // After midnight but before 6:00 the "coming night" reminder is the one ahead, not yesterday's.
        guard repeats || minute > nowMinute || (afterMidnight && nowMinute >= 6 * 60) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        var when = DateComponents()
        when.hour = minute / 60
        when.minute = minute % 60
        // The next matching time: later today, or after midnight for the coming night.
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: repeats)
        center.add(UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger))
    }

    private static func minutes(_ clock: String) -> Int? {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}
