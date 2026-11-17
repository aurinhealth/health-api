import Foundation

/// One point of a detail chart, as GET /app/api/health/series sends it: the
/// day (or the Monday of a week), the value, the athlete's usual band on that
/// day and the state the server worked out ("within", "slightly", "far",
/// with "above" or "below"). The app never judges a value itself.
struct ChartPoint: Decodable, Equatable {
    let date: String
    let value: Double
    var low: Double? = nil
    var high: Double? = nil
    var state: String? = nil
    var side: String? = nil

    /// Outside the usual band, as the server says.
    var isOff: Bool { state == "slightly" || state == "far" }
}

/// The periods under a detail chart (redesign Z2, Strain concept).
enum ChartPeriod: Int, CaseIterable, Identifiable {
    case days30 = 30, months3 = 91, months6 = 182, year = 365

    var id: Int { rawValue }
    var days: Int { rawValue }

    /// The key GET /app/api/health/series takes.
    var key: String {
        switch self {
        case .days30: return "30d"
        case .months3: return "3m"
        case .months6: return "6m"
        case .year: return "1y"
        }
    }

    var title: String {
        switch self {
        case .days30: return L10n.tr("30 dní")
        case .months3: return L10n.tr("3 měsíce")
        case .months6: return L10n.tr("6 měsíců")
        case .year: return L10n.tr("1 rok")
        }
    }

    /// From 91 days on a point is a week's average (as the server's series).
    var weekly: Bool { days >= ChartBuckets.weeklyFromDays }
}

/// Which day or week a value belongs to. A moment belongs to the day the
/// athlete lived it in (their time zone, not UTC), so a run at 23:50 and one
/// at 00:10 fall on two days; a week runs Monday to Sunday.
enum ChartBuckets {
    /// WEEKLY_FROM_DAYS of src/health-series.js.
    static let weeklyFromDays = 91

    /// The local day of a moment, "2026-11-16".
    static func day(_ moment: Date, in zone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let p = calendar.dateComponents([.year, .month, .day], from: moment)
        return String(format: "%04ld-%02ld-%02ld", p.year ?? 0, p.month ?? 0, p.day ?? 0)
    }

    /// The Monday of a day's week.
    static func monday(_ iso: String) -> String {
        ISODay.shift(iso, -ISODay.weekdayIndex(iso))
    }

    enum Combine { case sum, mean }

    /// Moments with a value to one point per local day (steps add up, a
    /// heart rate is averaged), oldest first.
    static func daily(_ samples: [(Date, Double)], in zone: TimeZone = .current, combine: Combine) -> [ChartPoint] {
        var days: [String: [Double]] = [:]
        for (moment, value) in samples { days[day(moment, in: zone), default: []].append(value) }
        return days.keys.sorted().map { key in
            let values = days[key] ?? []
            let total = values.reduce(0, +)
            return ChartPoint(date: key, value: combine == .sum ? total : total / Double(max(values.count, 1)))
        }
    }

    /// Daily points to weekly averages, each on its Monday, as the server
    /// does: the band is the mean of the days that have one. A week of one
    /// point keeps it (the server's weekly points come back the same, state
    /// included); an average the app made has no state, as only the server
    /// judges a value.
    static func weekly(_ points: [ChartPoint]) -> [ChartPoint] {
        var weeks: [String: [ChartPoint]] = [:]
        for p in points { weeks[monday(p.date), default: []].append(p) }
        return weeks.keys.sorted().map { week in
            let list = weeks[week] ?? []
            if list.count == 1, let only = list.first {
                return ChartPoint(date: week, value: only.value, low: only.low, high: only.high, state: only.state, side: only.side)
            }
            let banded = list.filter { $0.low != nil && $0.high != nil }
            return ChartPoint(date: week, value: mean(list.map(\.value)) ?? 0,
                              low: mean(banded.compactMap(\.low)), high: mean(banded.compactMap(\.high)))
        }
    }

    /// The points a period shows when it ends on `end`: its days, by week
    /// from 91 days on.
    static func shown(_ points: [ChartPoint], period: ChartPeriod, end: String) -> [ChartPoint] {
        let start = ISODay.shift(end, 1 - period.days)
        let inside = points.filter { $0.date >= start && $0.date <= end }.sorted { $0.date < $1.date }
        return period.weekly ? weekly(inside) : inside
    }

    /// Runs of points without a gap: a missing day (a missing week by week)
    /// breaks the line, so a gap never looks like a measured value.
    static func segments(_ points: [ChartPoint], weekly: Bool) -> [Int] {
        let step = weekly ? 7 : 1
        var out: [Int] = []
        var segment = 0
        for (i, p) in points.enumerated() {
            if i > 0, ISODay.shift(points[i - 1].date, step) < p.date { segment += 1 }
            out.append(segment)
        }
        return out
    }

    static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }
}
