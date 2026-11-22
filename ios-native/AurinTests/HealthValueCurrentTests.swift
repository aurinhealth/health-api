import XCTest
@testable import Aurin

/// The headline's number and the chart's point for the same day (604 retest
/// DES-4 and DES-11).
@MainActor
final class HealthValueCurrentTests: XCTestCase {
    private let today = "2026-11-21"

    func testTodaysPointTakesTheHeadlineValue() {
        let points = [ChartPoint(date: "2026-11-20", value: 52), ChartPoint(date: today, value: 50.6, low: 49, high: 55)]
        let shown = HealthValueContent.withCurrent(points, today: today, current: 50)
        XCTAssertEqual(shown.map(\.value), [52, 50])
        XCTAssertEqual(shown.last?.low, 49)
    }

    func testMissingDayIsAddedSoTheLastNightIsSelected() {
        let points = [ChartPoint(date: "2026-11-19", value: 96, low: 94, high: 98)]
        let shown = HealthValueContent.withCurrent(points, today: today, current: 97)
        XCTAssertEqual(shown.last?.date, today)
        XCTAssertEqual(shown.last?.high, 98)
    }

    func testNoCurrentLeavesThePointsAlone() {
        let points = [ChartPoint(date: "2026-11-19", value: 96)]
        XCTAssertEqual(HealthValueContent.withCurrent(points, today: today, current: nil), points)
    }

    func testOlderNightIsNotStampedOnToday() {
        let series = [Point(date: "2026-11-19", value: 96)]
        XCTAssertNil(HealthValueContent.current(96, series, today))
        XCTAssertEqual(HealthValueContent.current(96, series + [Point(date: today, value: 97)], today), 96)
    }

    func testAddedPointCarriesTheHeadlineState() {
        let points = [ChartPoint(date: "2026-11-19", value: 52, low: 50, high: 54)]
        let shown = HealthValueContent.withCurrent(points, today: today, current: 48, state: .off(above: false))
        XCTAssertEqual(shown.last?.state, "slightly")
        XCTAssertEqual(shown.last?.side, "below")
    }
}

/// Oxygen's chart says what its headline says (606 retest, critic 9).
@MainActor
final class OxygenPointsTests: XCTestCase {
    func testHighOxygenIsNeverFarAbove() {
        let shown = HealthValueContent.oxygenPoints([ChartPoint(date: "2026-11-21", value: 98, low: 94, high: 96, state: "far", side: "above")])
        XCTAssertEqual(shown.first?.state, "within")
        XCTAssertNil(shown.first?.side)
    }

    func testLowOxygenKeepsItsWords() {
        let shown = HealthValueContent.oxygenPoints([ChartPoint(date: "2026-11-21", value: 90, low: 94, high: 97, state: "far", side: "below")])
        XCTAssertEqual(shown.first?.state, "far")
        XCTAssertEqual(shown.first?.side, "below")
    }

    /// Weight: the latest measurement against the one taken by then (concept 39);
    /// 3 months ago stays out when the nearest measurement is far older.
    func testMeasurementRowsUseTheLatestAgainstThen() {
        let points = [ChartPoint(date: "2026-06-01", value: 80.1), ChartPoint(date: "2026-10-20", value: 78.8),
                      ChartPoint(date: "2026-11-05", value: 78.6), ChartPoint(date: "2026-11-21", value: 78.4)]
        let rows = TrendMath.measurementRows(points, lags: [14, 30, 91])
        XCTAssertEqual(rows.map(\.lag), [14, 30])
        XCTAssertEqual(rows.map(\.then), [78.6, 78.8])
        XCTAssertEqual(rows.first?.now, 78.4)
        XCTAssertEqual(rows.first?.spark, [78.6, 78.4])
    }
}
