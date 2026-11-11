import XCTest
@testable import Aurin

/// Today's month calendar (MonthCalendarSheet): the days from
/// GET /app/api/days and what each day's ring shows.
@MainActor
final class MonthCalendarTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        super.tearDown()
    }

    func testDaysDecodeAndRings() throws {
        let json = """
        {"start":"2026-11-01","end":"2026-11-02","days":[
          {"date":"2026-11-01","readiness":{"score":82,"zone":"green"},"sleep":{"minutes":412,"need":480,"percent":86},"strain":11.4,"hrv":{"value":70,"band":"above"}},
          {"date":"2026-11-02","readiness":null,"sleep":null,"strain":null,"hrv":null}]}
        """
        let range = try JSONDecoder().decode(DaysRange.self, from: Data(json.utf8))
        XCTAssertEqual(range.days.count, 2)
        let full = range.days[0], empty = range.days[1]
        XCTAssertEqual(DayMark(metric: .readiness, values: full).fill, 0.82, accuracy: 0.001)
        XCTAssertEqual(DayMark(metric: .sleep, values: full).fill, 0.86, accuracy: 0.001)
        XCTAssertEqual(DayMark(metric: .strain, values: full).fill, 11.4 / 21, accuracy: 0.001)
        XCTAssertEqual(DayMark(metric: .hrv, values: full).symbol, "arrow.up")
        for metric in MonthCalendarSheet.Metric.allCases {
            XCTAssertEqual(DayMark(metric: metric, values: empty).fill, 0, "a day without data is an empty track")
        }
    }

    func testSummaryPlurals() {
        L10n.setLanguage("cs")
        XCTAssertEqual(L10n.plural("%lld dní v obvyklém rozmezí", 1), "1 den v obvyklém rozmezí")
        XCTAssertEqual(L10n.plural("%lld dní v obvyklém rozmezí", 3), "3 dny v obvyklém rozmezí")
        XCTAssertEqual(L10n.plural("%lld dní nad obvyklým rozmezím", 8), "8 dní nad obvyklým rozmezím")
        L10n.setLanguage("en")
        XCTAssertEqual(L10n.plural("%lld dní v obvyklém rozmezí", 8), "8 days within your usual range")
        XCTAssertEqual(L10n.plural("%lld pod ním", 1), "1 below it")
    }
}
