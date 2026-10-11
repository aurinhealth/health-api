import Foundation

/// GET /app/api/training/calendar (src/app-calendar.js): per day what was done
/// and what is planned, for the day strip and the month on Training.
struct TrainingCalendar: Decodable, Equatable {
    let start: String
    let end: String
    let today: String
    let days: [CalendarDay]
}

struct CalendarDay: Decodable, Equatable, Identifiable {
    let date: String
    /// The day's main sport: ride, run, strength, swim, walk, other or rest.
    let primary: String
    /// Done activities, walks included.
    let count: Int
    /// Their length together, minutes.
    let minutes: Double
    let kcal: Double
    /// Workouts still planned.
    let planned: Int
    let activities: [CalendarActivity]
    var id: String { date }
}

struct CalendarActivity: Decodable, Equatable, Identifiable {
    let id: String
    /// ride, run, strength, swim, walk or other.
    let sport: String
    /// "done" or "planned".
    let status: String
    let title: String
    let date: String
    let time: String?
    let minutes: Double?
    let km: Double?
    let kcal: Double?
    let activityId: String?
    let eventId: String?
    /// A session from the watch (Google Health): its summary for the detail.
    var summary: Summary? = nil

    struct Summary: Decodable, Equatable {
        let source: String?
        let start: String?
        let end: String?
        let avgHr: Double?
        let maxHr: Double?
        let steps: Double?
        let elevationM: Double?
    }

    /// The week list's row, for the activity and plan details.
    var session: WeekSession {
        let rounded: Int? = minutes.map { Int($0.rounded()) }
        return WeekSession(id: id, kind: kind, status: status, date: date, time: time, title: title, sport: sport,
                           minutes: rounded, tss: nil, activityId: activityId, eventId: eventId)
    }

    private var kind: String {
        if status == "done" { return "activity" }
        return sport == "strength" && eventId == nil ? "gym" : "planned"
    }
}

/// Days as "yyyy-MM-dd" in the calendar's own arithmetic (UTC, so summer
/// time never moves a day).
enum ISODay {
    private static let utc = TimeZone(identifier: "UTC")!
    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = utc
        c.firstWeekday = 2
        return c
    }
    private static let parser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")!
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ iso: String) -> Date? { parser.date(from: iso) }
    static func iso(_ date: Date) -> String { parser.string(from: date) }

    static func shift(_ iso: String, _ days: Int) -> String {
        guard let d = date(iso), let moved = calendar.date(byAdding: .day, value: days, to: d) else { return iso }
        return self.iso(moved)
    }

    /// The days from one to the other, both included.
    static func range(_ from: String, _ to: String) -> [String] {
        var out: [String] = []
        var d = from
        while d <= to && out.count < 400 {
            out.append(d)
            d = shift(d, 1)
        }
        return out
    }

    /// "2026-10-01" for any day of October 2026.
    static func monthStart(_ iso: String) -> String { String(iso.prefix(8)) + "01" }

    static func monthEnd(_ iso: String) -> String { shift(addMonths(monthStart(iso), 1), -1) }

    static func addMonths(_ iso: String, _ months: Int) -> String {
        guard let d = date(monthStart(iso)), let moved = calendar.date(byAdding: .month, value: months, to: d) else { return iso }
        return self.iso(moved)
    }

    /// Monday 0 … Sunday 6.
    static func weekdayIndex(_ iso: String) -> Int {
        guard let d = date(iso) else { return 0 }
        return (calendar.component(.weekday, from: d) + 5) % 7
    }

    /// The weeks of the month for the grid, Monday first; nil outside it.
    static func monthGrid(_ iso: String) -> [[String?]] {
        let first = monthStart(iso), last = monthEnd(iso)
        var cells: [String?] = Array(repeating: nil, count: weekdayIndex(first))
        cells += range(first, last).map { Optional($0) }
        while cells.count % 7 != 0 { cells.append(nil) }
        return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<$0 + 7]) }
    }

    /// "Říjen 2026".
    static func monthTitle(_ iso: String) -> String {
        guard let d = date(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Fmt.locale
        f.timeZone = utc
        f.dateFormat = "LLLL yyyy"
        return Fmt.capitalized(f.string(from: d))
    }

    /// The day of the month: "9".
    static func day(_ iso: String) -> String {
        String(Int(iso.suffix(2)) ?? 0)
    }
}
