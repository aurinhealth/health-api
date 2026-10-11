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
    static let weightKey = "remind.weight"
    static let weekKey = "remind.week"
    // The times, in minutes after midnight (bedtime: minutes before it).
    static let bedtimeOffsetKey = "remind.bedtime.offset"
    static let workoutTimeKey = "remind.workout.time"
    static let waterFromKey = "remind.water.from"
    static let waterToKey = "remind.water.to"
    static let waterEveryKey = "remind.water.every"
    static let foodTimeKey = "remind.food.time"
    static let weightTimeKey = "remind.weight.time"
    static let weekTimeKey = "remind.week.time"

    /// The meals of the day, each with its own reminder (off until chosen,
    /// except the three main ones) and time.
    static let meals: [(id: String, title: String, time: Int, on: Bool)] = [
        ("breakfast", "Snídaně", 7 * 60 + 30, true), ("snack_am", "Dopolední svačina", 10 * 60, false),
        ("lunch", "Oběd", 12 * 60, true), ("snack_pm", "Odpolední svačina", 15 * 60 + 30, false),
        ("dinner", "Večeře", 18 * 60 + 30, true), ("snack_late", "Druhá večeře", 21 * 60, false)
    ]
    static func mealKey(_ id: String) -> String { "remind.meal." + id }
    static func mealTimeKey(_ id: String) -> String { "remind.meal." + id + ".time" }

    /// Off by default: the reminders added later that nobody asked for yet.
    private static let offByDefault = Set([weightKey, weekKey]).union(meals.filter { !$0.on }.map { mealKey($0.id) })

    private static let prefix = "loadwise."

    static func isOn(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? !offByDefault.contains(key)
    }

    static func minute(_ key: String, _ fallback: Int) -> Int {
        UserDefaults.standard.object(forKey: key) as? Int ?? fallback
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

        // Bedtime: the chosen time before it (30 minutes), with the night's need.
        if isOn(bedtimeKey), let bed = today.tonight?.bedtime, let need = today.tonight?.need, let at = minutes(bed) {
            let offset = minute(bedtimeOffsetKey, 30)
            let remind = (at - offset + 1440) % 1440
            // A bedtime after midnight (00:40) reminds at 00:10 tonight, which is "earlier" than now.
            add(center, "bedtime", at: remind, title: offset >= 60 ? L10n.tr("Za hodinu do postele") : L10n.f("Za %@ min do postele", String(offset)),
                body: L10n.f("Na dnešní noc potřebuješ %@. Jdi spát do %@.", Fmt.duration(need), bed), afterMidnight: remind < 6 * 60)
        }
        // Today's workouts not done yet: an hour before one with a start time,
        // the others at the chosen time (16:00).
        if isOn(workoutKey) {
            let open = today.plan.filter { $0.kind == "workout" && !$0.done && $0.status != "missed" }
            for item in open {
                guard let time = item.time, let at = minutes(time), at >= 60 else { continue }
                add(center, "workout." + time, at: at - 60, title: L10n.f("Za hodinu: %@", item.title),
                    body: item.detail.map { L10n.f("%@. Dej si něco malého a připrav se.", $0) } ?? L10n.tr("Dej si něco malého a připrav se."))
            }
            let untimed = open.filter { $0.time == nil }
            if !untimed.isEmpty {
                add(center, "workout.day", at: minute(workoutTimeKey, 16 * 60), title: L10n.f("Dnes v plánu: %@", untimed.map(\.title).joined(separator: ", ")),
                    body: untimed.first?.detail.map { L10n.f("%@. Dej si něco malého a připrav se.", $0) } ?? L10n.tr("Dej si něco malého a připrav se."))
            }
        }
        // Water through the chosen part of the day while below the day's target.
        if isOn(waterKey), let target = today.nutrition.water.target, (today.nutrition.water.ml ?? 0) < target {
            let amount = Units.imperial ? Units.volumeText(target) : Fmt.decimal(target / 1000) + " l"
            let from = minute(waterFromKey, 10 * 60), to = minute(waterToKey, 16 * 60), every = max(60, minute(waterEveryKey, 3 * 60))
            for at in stride(from: from, through: max(from, to), by: every) {
                add(center, "water.\(at)", at: at, title: L10n.tr("Napij se"), body: L10n.f("Dnešní cíl je %@ vody.", amount))
            }
        }
        // Each chosen meal at its time, every day.
        for meal in meals where isOn(mealKey(meal.id)) {
            add(center, "meal." + meal.id, at: minute(mealTimeKey(meal.id), meal.time), title: L10n.tr(meal.title),
                body: L10n.tr("Zapiš, co jíš, ať sedí dnešní příjem."), repeats: true)
        }
        // The evening: log what was eaten.
        if isOn(foodKey) {
            // Every evening, also on days the app is not opened.
            add(center, "food", at: minute(foodTimeKey, 20 * 60 + 30), title: L10n.tr("Zapiš jídlo"), body: L10n.tr("Ať sedí dnešní příjem a zítřejší doporučení."), repeats: true)
        }
        // Weighing in the morning, before breakfast.
        if isOn(weightKey) {
            add(center, "weight", at: minute(weightTimeKey, 7 * 60), title: L10n.tr("Zvaž se"), body: L10n.tr("Ráno nalačno, ať je trend váhy přesný."), repeats: true)
        }
        // Sunday evening: a look at the coming week's plan.
        if isOn(weekKey) {
            add(center, "week", at: minute(weekTimeKey, 19 * 60), title: L10n.tr("Plán na příští týden"), body: L10n.tr("Zkontroluj tréninky a volný čas na další týden."), repeats: true, weekday: 1)
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
                            repeats: Bool = false, afterMidnight: Bool = false, weekday: Int? = nil) {
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
        when.weekday = weekday
        // The next matching time: later today, or after midnight for the coming night.
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: repeats)
        center.add(UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger))
    }

    private static func minutes(_ clock: String) -> Int? {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}
