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
    /// Bedtime: "sleep" (the chosen minutes before tonight's bedtime from the
    /// sleep need) or "custom" (bedtimeTimeKey, a fixed time).
    static let bedtimeModeKey = "remind.bedtime.mode"
    static let bedtimeTimeKey = "remind.bedtime.time"
    /// Water: "every" (waterEveryKey minutes apart) or "count" (waterCountKey
    /// reminders spread between the start and the end).
    static let waterModeKey = "remind.water.mode"
    static let waterCountKey = "remind.water.count"
    /// All the meal reminders at once (each meal keeps its own switch too).
    static let mealsKey = "remind.meals"

    /// The days of the week a reminder sounds on: a bit for each Calendar
    /// weekday (bit 0 Sunday … bit 6 Saturday), stored under "<key>.days".
    static func daysKey(_ key: String) -> String { key + ".days" }
    static let everyDay = 127
    /// Every day, except the week plan on Sunday as before.
    static func defaultDays(_ key: String) -> Int { key == weekKey ? 1 : everyDay }
    static func days(_ key: String) -> Int {
        let value = UserDefaults.standard.object(forKey: daysKey(key)) as? Int ?? defaultDays(key)
        return value & everyDay == 0 ? defaultDays(key) : value & everyDay
    }
    static func has(_ days: Int, _ weekday: Int) -> Bool { days & (1 << (weekday - 1)) != 0 }

    /// The drinking reminders of a day, in minutes after midnight.
    static func waterTimes(from: Int, to: Int, mode: String, every: Int, count: Int) -> [Int] {
        let end = max(from, to)
        if mode == "count" {
            let n = max(1, count)
            if n == 1 || end == from { return [from] }
            return (0..<n).map { from + (end - from) * $0 / (n - 1) }
        }
        return Array(stride(from: from, through: end, by: max(60, every)))
    }

    /// 450 → "7:30".
    static func clock(_ minute: Int) -> String {
        ClockText.format(minutes: minute)
    }

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

        let weekday = Calendar.current.component(.weekday, from: Date())
        // Bedtime: a fixed time on the chosen days, or the chosen time before
        // tonight's bedtime (30 minutes), with the night's need.
        if isOn(bedtimeKey) {
            let bedDays = days(bedtimeKey)
            if UserDefaults.standard.string(forKey: bedtimeModeKey) == "custom" {
                addRepeating(center, "bedtime", at: minute(bedtimeTimeKey, 22 * 60), days: bedDays,
                             title: L10n.tr("Čas do postele"), body: L10n.tr("Dobrý spánek je základ regenerace."))
            } else if has(bedDays, weekday), let bed = today.tonight?.bedtime, let need = today.tonight?.need, let at = minutes(bed) {
                let offset = minute(bedtimeOffsetKey, 30)
                let remind = (at - offset + 1440) % 1440
                // A bedtime after midnight (00:40) reminds at 00:10 tonight, which is "earlier" than now.
                add(center, "bedtime", at: remind, title: offset >= 60 ? L10n.tr("Za hodinu do postele") : L10n.f("Za %@ min do postele", String(offset)),
                    body: L10n.f("Na dnešní noc potřebuješ %@. Jdi spát do %@.", Fmt.duration(need), ClockText.format(bed)), afterMidnight: remind < 6 * 60)
            }
        }
        // Today's workouts not done yet (on the chosen days): an hour before
        // one with a start time, the others at the chosen time (16:00).
        if isOn(workoutKey), has(days(workoutKey), weekday) {
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
        if isOn(waterKey), has(days(waterKey), weekday), let target = today.nutrition.water.target, (today.nutrition.water.ml ?? 0) < target {
            let amount = Units.imperial ? Units.volumeText(target) : Fmt.decimal(target / 1000) + " l"
            let times = waterTimes(from: minute(waterFromKey, 10 * 60), to: minute(waterToKey, 16 * 60),
                                   mode: UserDefaults.standard.string(forKey: waterModeKey) ?? "every",
                                   every: minute(waterEveryKey, 3 * 60), count: minute(waterCountKey, 4))
            for at in times {
                add(center, "water.\(at)", at: at, title: L10n.tr("Napij se"), body: L10n.f("Dnešní cíl je %@ vody.", amount))
            }
        }
        // Each chosen meal at its time, on the chosen days.
        if isOn(mealsKey) {
            for meal in meals where isOn(mealKey(meal.id)) {
                addRepeating(center, "meal." + meal.id, at: minute(mealTimeKey(meal.id), meal.time), days: days(mealsKey),
                             title: L10n.tr(meal.title), body: L10n.tr("Zapiš, co jíš, ať sedí dnešní příjem."))
            }
        }
        // The evening: log what was eaten, only while the day is still empty.
        // Planned a week ahead (so also on days the app is not opened), today
        // left out once something is logged.
        if isOn(foodKey) {
            let at = minute(foodTimeKey, 20 * 60 + 30), foodDays = days(foodKey)
            let logged = (today.nutrition.kcal ?? 0) > 0
            let calendar = Calendar.current
            let start = calendar.startOfDay(for: Date())
            for offset in 0..<8 {
                if offset == 0 && logged { continue }
                guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                      has(foodDays, calendar.component(.weekday, from: day)) else { continue }
                addOnce(center, "food.\(offset)", day: day, at: at, title: L10n.tr("Zapiš jídlo"),
                        body: L10n.tr("Ať sedí dnešní příjem a zítřejší doporučení."))
            }
        }
        // Weighing in the morning, before breakfast.
        if isOn(weightKey) {
            addRepeating(center, "weight", at: minute(weightTimeKey, 7 * 60), days: days(weightKey),
                         title: L10n.tr("Zvaž se"), body: L10n.tr("Ráno nalačno, ať je trend váhy přesný."))
        }
        // The pill (Settings → Oznámení → Antikoncepce): the coming 8 days of
        // the pack at the chosen time, pause days only when asked, today left
        // out once taken. "Vzato" and "Za 30 minut" right on the notification.
        if let pill = storedPill(), pill.on {
            let calendar = Calendar.current
            let start = calendar.startOfDay(for: Date())
            let takenToday = today.cycle?.pill?.taken != nil
            for offset in 0..<8 {
                if offset == 0 && takenToday { continue }
                guard let day = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
                let date = AppModel.localDate(day)
                guard let number = pillNumber(on: date, packStart: pill.packStart, active: pill.active) else { continue }
                if number == 0 && !pill.inPause { continue }
                addOnce(center, "pill.\(offset)", day: day, at: pill.minute, title: L10n.tr("Čas na prášek"),
                        body: number == 0 ? L10n.tr("Pauza mezi baleními") : L10n.f("%@. prášek z %@", String(number), String(pill.active)),
                        category: pillCategory, info: ["date": date])
            }
        }
        // Sunday evening (or the chosen days): a look at the coming week's plan.
        if isOn(weekKey) {
            addRepeating(center, "week", at: minute(weekTimeKey, 19 * 60), days: days(weekKey),
                         title: L10n.tr("Plán na příští týden"), body: L10n.tr("Zkontroluj tréninky a volný čas na další týden."))
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
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix(prefix) })
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

    /// Every day as one daily reminder, else one weekly reminder per chosen day.
    private static func addRepeating(_ center: UNUserNotificationCenter, _ id: String, at minute: Int, days: Int, title: String, body: String) {
        if days & everyDay == everyDay {
            add(center, id, at: minute, title: title, body: body, repeats: true)
            return
        }
        for weekday in 1...7 where has(days, weekday) {
            add(center, id + ".\(weekday)", at: minute, title: title, body: body, repeats: true, weekday: weekday)
        }
    }

    /// One reminder on the given day, skipped when its time has passed.
    private static func addOnce(_ center: UNUserNotificationCenter, _ id: String, day: Date, at minute: Int, title: String, body: String,
                                category: String? = nil, info: [String: String] = [:]) {
        let calendar = Calendar.current
        guard let fire = calendar.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: day), fire > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if let category { content.categoryIdentifier = category }
        if !info.isEmpty { content.userInfo = info }
        let when = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
        center.add(UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger))
    }

    // MARK: - The pill

    /// The notification's category with "Vzato" and "Za 30 minut"
    /// (AppDelegate registers it and handles the answer).
    static let pillCategory = "loadwise.pill"
    static let pillTakenAction = "loadwise.pill.taken"
    static let pillSnoozeAction = "loadwise.pill.snooze"
    private static let pillKey = "cycle.pill"

    static var pillNotificationCategory: UNNotificationCategory {
        UNNotificationCategory(identifier: pillCategory, actions: [
            UNNotificationAction(identifier: pillTakenAction, title: L10n.tr("Vzato"), options: []),
            UNNotificationAction(identifier: pillSnoozeAction, title: L10n.tr("Za 30 minut"), options: [])
        ], intentIdentifiers: [], options: [])
    }

    struct StoredPill: Codable, Equatable {
        var on: Bool
        var minute: Int
        var inPause: Bool
        var packStart: String
        var active: Int
    }

    /// The cycle settings the reminder needs, kept on the phone so the
    /// reminders are planned without the server (nil: no pill reminder).
    static func storePill(_ settings: CycleSettings?) {
        guard let settings, settings.contraception == "pill", let packStart = settings.packStart else {
            UserDefaults.standard.removeObject(forKey: pillKey)
            return
        }
        let active = ["21+7": 21, "24+4": 24, "28": 28][settings.pillPack] ?? 21
        let stored = StoredPill(on: settings.pillReminder, minute: minutes(settings.pillReminderTime) ?? 21 * 60,
                                inPause: settings.pillReminderInPause, packStart: packStart, active: active)
        if let data = try? JSONEncoder().encode(stored) { UserDefaults.standard.set(data, forKey: pillKey) }
    }

    static func storedPill() -> StoredPill? {
        guard let data = UserDefaults.standard.data(forKey: pillKey) else { return nil }
        return try? JSONDecoder().decode(StoredPill.self, from: data)
    }

    /// The pill of the pack on `date` (1…active), 0 on a pause day, nil
    /// before the pack started. Packs are 28 days.
    static func pillNumber(on date: String, packStart: String, active: Int) -> Int? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: date), let s = f.date(from: packStart), d >= s else { return nil }
        let index = Int((d.timeIntervalSince(s) / 86400).rounded()) % 28
        return index < active ? index + 1 : 0
    }

    /// "Za 30 minut": the same reminder once more (outside the "loadwise."
    /// prefix, so planning the day keeps it).
    static func snoozePill(date: String, title: String, body: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = pillCategory
        content.userInfo = ["date": date]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 30 * 60, repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: pillSnoozeId, content: content, trigger: trigger))
    }

    private static let pillSnoozeId = "loadwise-pill-snooze"

    /// Signing out or another account: no pill of the last one, and none of its reminders.
    static func forgetPill() {
        UserDefaults.standard.removeObject(forKey: pillKey)
        let ids = (0..<8).map { prefix + "pill.\($0)" } + [pillSnoozeId]
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// "22:40" → 1360.
    static func minutes(_ clock: String) -> Int? {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}
