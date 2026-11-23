import XCTest
@testable import Aurin

/// Retest 611: Health said "above your usual range" for 57 under "Usual range
/// 53 to 57 bpm", "Last night" over Saturday's night on Monday and "-0.0".
@MainActor
final class HealthShownStateTests: XCTestCase {
    func testValueInsideTheWrittenRangeIsWithin() {
        // 56.8 is written "57": 57 against "53 to 57" is in the range.
        XCTAssertEqual(HealthValueContent.shownState(.off(above: true), value: 57.2, low: 53.4, high: 56.8, digits: 0), .within)
    }

    func testValueOutsideTheWrittenRangeKeepsTheServersState() {
        XCTAssertEqual(HealthValueContent.shownState(.far(above: true), value: 62, low: 53, high: 57, digits: 0), .far(above: true))
        XCTAssertEqual(HealthValueContent.shownState(.off(above: false), value: 52, low: 53, high: 57, digits: 0), .off(above: false))
    }

    func testServersWithinOutsideTheWrittenRangeStays() {
        XCTAssertEqual(HealthValueContent.shownState(.within, value: 58, low: 53, high: 57, digits: 0), .within)
    }

    func testNoRangeLeavesTheState() {
        XCTAssertEqual(HealthValueContent.shownState(.off(above: true), value: 57, low: nil, high: nil, digits: 0), .off(above: true))
        XCTAssertNil(HealthValueContent.shownState(nil, value: 57, low: 53, high: 57, digits: 0))
    }

    func testChartPointsFollowTheSameRule() {
        let points = [ChartPoint(date: "2026-11-22", value: 57, low: 53.4, high: 56.8, state: "slightly", side: "above"),
                      ChartPoint(date: "2026-11-21", value: 52, low: 53.4, high: 56.8, state: "slightly", side: "below")]
        let shown = HealthValueContent.shownPoints(points, digits: 0)
        XCTAssertEqual(shown[0].state, "within")
        XCTAssertNil(shown[0].side)
        XCTAssertEqual(shown[1], points[1])
    }

    func testOlderMeasurementIsNamedByItsDate() {
        let fresh = "Minulá noc, teplota kůže"
        XCTAssertEqual(HealthValueContent.dayLabel(fresh, "Teplota kůže %@", measured: "2026-11-23", day: "2026-11-23"), fresh)
        XCTAssertEqual(HealthValueContent.dayLabel(fresh, "Teplota kůže %@", measured: nil, day: "2026-11-23"), fresh)
        let older = HealthValueContent.dayLabel(fresh, "Teplota kůže %@", measured: "2026-11-21", day: "2026-11-23")
        XCTAssertNotEqual(older, fresh)
        XCTAssertTrue(older.contains(Fmt.dayMonthShort("2026-11-21")))
    }

    func testNoMinusZero() {
        XCTAssertFalse(Fmt.decimal(-0.04, digits: 1).contains("-"))
        XCTAssertFalse(Fmt.decimal(-0.4, digits: 0).contains("-"))
        XCTAssertFalse(Fmt.decimal(-0.5, digits: 0).contains("-"))
        XCTAssertTrue(Fmt.decimal(-0.4, digits: 1).contains("4"))
        XCTAssertTrue(Fmt.decimal(-0.4, digits: 1).hasPrefix("-") || Fmt.decimal(-0.4, digits: 1).hasPrefix("−"))
    }
}
