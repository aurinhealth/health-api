import XCTest
@testable import Aurin

/// The new detail chart's days and weeks (redesign Z2): a value belongs to the
/// day the athlete lived it in, so the hour around midnight never slips into
/// the neighbouring day, and a week runs Monday to Sunday as on the server.
@MainActor
final class ChartBucketTests: XCTestCase {
    private let prague = TimeZone(identifier: "Europe/Prague")!

    private func moment(_ text: String, _ zone: TimeZone) -> Date {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.date(from: text)!
    }

    func testMidnightSplitsTheDayInTheAthletesZone() {
        let late = moment("2026-11-16 23:59:30", prague)
        let early = moment("2026-11-17 00:00:30", prague)
        XCTAssertEqual(ChartBuckets.day(late, in: prague), "2026-11-16")
        XCTAssertEqual(ChartBuckets.day(early, in: prague), "2026-11-17")
        // In UTC both are still 16 November: bucketing by UTC would merge them.
        XCTAssertEqual(ChartBuckets.day(early, in: TimeZone(identifier: "UTC")!), "2026-11-16")

        let days = ChartBuckets.daily([(late, 4000), (early, 300), (moment("2026-11-17 08:00:00", prague), 700)], in: prague, combine: .sum)
        XCTAssertEqual(days.map(\.date), ["2026-11-16", "2026-11-17"])
        XCTAssertEqual(days.map(\.value), [4000, 1000])
    }

    func testMidnightWestOfUTCAndOnTheDSTNight() {
        let newYork = TimeZone(identifier: "America/New_York")!
        // 23:30 in New York is already the next day in UTC.
        XCTAssertEqual(ChartBuckets.day(moment("2026-11-16 23:30:00", newYork), in: newYork), "2026-11-16")
        // 25 October 2026 has 25 hours in Prague: 00:30 and 23:30 are the same day.
        XCTAssertEqual(ChartBuckets.day(moment("2026-10-25 00:30:00", prague), in: prague), "2026-10-25")
        XCTAssertEqual(ChartBuckets.day(moment("2026-10-25 23:30:00", prague), in: prague), "2026-10-25")
        let means = ChartBuckets.daily([(moment("2026-10-25 00:30:00", prague), 50), (moment("2026-10-25 23:30:00", prague), 60)], in: prague, combine: .mean)
        XCTAssertEqual(means, [ChartPoint(date: "2026-10-25", value: 55)])
    }

    func testWeeksRunMondayToSunday() {
        let sunday = ChartBuckets.day(moment("2026-11-15 23:59:00", prague), in: prague)
        let monday = ChartBuckets.day(moment("2026-11-16 00:01:00", prague), in: prague)
        XCTAssertEqual(ChartBuckets.monday(sunday), "2026-11-09")
        XCTAssertEqual(ChartBuckets.monday(monday), "2026-11-16")

        let weeks = ChartBuckets.weekly([
            ChartPoint(date: "2026-11-09", value: 50, low: 48, high: 54),
            ChartPoint(date: "2026-11-15", value: 54, low: 50, high: 56),
            ChartPoint(date: "2026-11-16", value: 60, low: 50, high: 56, state: "far", side: "above")
        ])
        XCTAssertEqual(weeks.map(\.date), ["2026-11-09", "2026-11-16"])
        XCTAssertEqual(weeks[0].value, 52)
        XCTAssertEqual(weeks[0].low, 49)
        // An average the app made carries no state; a week of one point keeps the server's.
        XCTAssertNil(weeks[0].state)
        XCTAssertEqual(weeks[1].state, "far")
        // The server's weekly points come back the same.
        XCTAssertEqual(ChartBuckets.weekly(weeks), weeks)
    }

    func testPeriodWindowAndGaps() {
        let points = (0..<100).map { ChartPoint(date: ISODay.shift("2026-11-16", -$0), value: Double($0)) }
        let month = ChartBuckets.shown(points, period: .days30, end: "2026-11-16")
        XCTAssertEqual(month.count, 30)
        XCTAssertEqual(month.first?.date, "2026-10-18")
        XCTAssertEqual(month.last?.date, "2026-11-16")
        // From 91 days on, one point a week, each on a Monday.
        let quarter = ChartBuckets.shown(points, period: .months3, end: "2026-11-16")
        XCTAssertTrue(quarter.allSatisfy { ISODay.weekdayIndex($0.date) == 0 })
        XCTAssertEqual(quarter.last?.date, "2026-11-16")

        let gap = [ChartPoint(date: "2026-11-01", value: 1), ChartPoint(date: "2026-11-02", value: 1), ChartPoint(date: "2026-11-05", value: 1)]
        XCTAssertEqual(ChartBuckets.segments(gap, weekly: false), [0, 0, 1])
        XCTAssertEqual(ChartBuckets.segments([], weekly: false), [])
    }

    func testTrendRowsAndChangeWords() {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        // 53 for the last 7 days, 54 before.
        let points = (0..<120).map { ChartPoint(date: ISODay.shift("2026-11-16", -$0), value: $0 < 7 ? 53 : 54) }
        let rows = TrendMath.rows(points, today: "2026-11-16")
        XCTAssertEqual(rows.map(\.lag), [7, 14, 30, 91])
        XCTAssertEqual(rows[0].now, 53)
        XCTAssertEqual(rows[0].then, 54)
        XCTAssertEqual(rows[0].label, "7 days ago")
        XCTAssertEqual(TrendMath.change(now: 53, then: 54, digits: 0).text, "1 lower")
        XCTAssertEqual(TrendMath.change(now: 15.6, then: 15.3, digits: 1).text, "0.3 higher")
        XCTAssertEqual(TrendMath.change(now: 53.2, then: 53.4, digits: 0).text, "no change")
        // No 7 days back then: no row, nothing made up.
        XCTAssertEqual(TrendMath.rows(Array(points.prefix(10)), today: "2026-11-16").map(\.lag), [7])
    }

    func testLearningComesFromTheServer() {
        XCTAssertEqual(LearningState.kind(have: 9, need: 21), .learning(have: 9, need: 21, per: .days))
        XCTAssertEqual(LearningState.kind(have: 40, need: 21), .learning(have: 21, need: 21, per: .days))
        XCTAssertEqual(LearningState.kind(have: 3, need: nil), .missing)
        XCTAssertEqual(MetricState(state: "far", side: "below"), .far(above: false))
        XCTAssertNil(MetricState(state: nil, side: nil))
    }
}
