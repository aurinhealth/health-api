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
            add(center, "bedtime", at: (at - 30 + 1440) % 1440, title: "Za půl hodiny do postele",
                body: "Na dnešní noc potřebuješ " + Fmt.duration(need) + ". Jdi spát do " + bed + ".")
        }
        // Today's planned workout: an hour before its start.
        if isOn(workoutKey) {
            for item in today.plan where item.kind == "workout" && !item.done {
                guard let time = item.time, let at = minutes(time), at >= 60 else { continue }
                add(center, "workout." + time, at: at - 60, title: "Za hodinu: " + item.title,
                    body: item.detail.map { $0 + ". Dej si něco malého a připrav se." } ?? "Dej si něco malého a připrav se.")
            }
        }
        // Water at 10, 13 and 16 while below the day's target.
        if isOn(waterKey), let target = today.nutrition.water.target, (today.nutrition.water.ml ?? 0) < target {
            for hour in [10, 13, 16] {
                add(center, "water.\(hour)", at: hour * 60, title: "Napij se",
                    body: "Dnešní cíl je " + Fmt.decimal(target / 1000) + " l vody.")
            }
        }
        // The evening: log what was eaten.
        if isOn(foodKey) {
            add(center, "food", at: 20 * 60 + 30, title: "Zapiš jídlo", body: "Ať sedí dnešní příjem a zítřejší doporučení.")
        }
    }

    static func cancelAll() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix(prefix) })
        }
    }

    /// Only times still ahead today are planned.
    private static func add(_ center: UNUserNotificationCenter, _ id: String, at minute: Int, title: String, body: String) {
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        guard minute > (now.hour ?? 0) * 60 + (now.minute ?? 0) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        var when = DateComponents()
        when.hour = minute / 60
        when.minute = minute % 60
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
        center.add(UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger))
    }

    private static func minutes(_ clock: String) -> Int? {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}
