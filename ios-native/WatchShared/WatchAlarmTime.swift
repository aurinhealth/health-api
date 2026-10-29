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
        if let evening, let wake, let day = Self.day(evening),
           let after = calendar.date(byAdding: .day, value: 1, to: day), calendar.isDate(after, inSameDayAs: morning) {
            return wake
        }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: morning)
        return weekday == 1 || weekday == 7 ? weekend : work
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
