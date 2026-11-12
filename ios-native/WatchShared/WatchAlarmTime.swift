import Foundation

/// The next wake time from the alarm's times, the same on the watch
/// (WatchAlarm) and the iPhone (its backup alarm, WatchAlarmBridge): tonight's
/// own for the morning after tonight, else the work day or weekend one.
extension WatchSnapshot.Alarm {
    func nextWake(after now: Date = Date()) -> Date? {
        let calendar = Calendar.current
        for offset in 0...2 {
            guard let morning = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)),
                  let text = wake(on: morning), let date = Self.at(text, on: morning), date > now else { continue }
            return date
        }
        return nil
    }

    func wake(on morning: Date) -> String? {
        let calendar = Calendar.current
        // Tonight's wake time only when chosen for that morning: without one it is
        // the time the night is planned to end, not an alarm (both alarms off).
        if wakeOnce == true, let evening, let wake, let day = Self.day(evening),
           let after = calendar.date(byAdding: .day, value: 1, to: day), calendar.isDate(after, inSameDayAs: morning) {
            return wake
        }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: morning)
        if AlarmDays.has(weekendDays ?? AlarmDays.weekend, weekday) { return weekend }
        return AlarmDays.has(workDays ?? AlarmDays.work, weekday) ? work : nil
    }

    /// The morning is one of the weekend alarm's days (Saturday and Sunday unless chosen).
    func weekendMorning(_ morning: Date) -> Bool {
        AlarmDays.has(weekendDays ?? AlarmDays.weekend, Calendar(identifier: .gregorian).component(.weekday, from: morning))
    }

    /// "6:45" on that day.
    static func at(_ text: String, on day: Date) -> Date? {
        let parts = text.prefix(5).split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
    }

    /// "2026-10-28" at noon.
    static func day(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}

/// The days an alarm rings as bits, Sunday the lowest (Calendar's weekday 1),
/// as Reminders counts them. The profile keeps them as wakeDays and
/// wakeDaysWeekend, 0 = Sunday … 6 = Saturday; without them Monday to Friday
/// and the weekend.
enum AlarmDays {
    static let work = 0b0111110
    static let weekend = 0b1000001

    static func has(_ days: Int, _ weekday: Int) -> Bool { days & (1 << (weekday - 1)) != 0 }

    /// The profile's list, or `fallback` when it has none.
    static func mask(_ value: JSONValue?, fallback: Int) -> Int {
        guard case .array(let list)? = value else { return fallback }
        return list.compactMap { $0.number.map { Int($0) } }.filter { (0...6).contains($0) }.reduce(0) { $0 | (1 << $1) }
    }

    static func json(_ days: Int) -> JSONValue {
        .array((0...6).filter { days & (1 << $0) != 0 }.map { .number(Double($0)) })
    }
}
