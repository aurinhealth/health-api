import XCTest
@testable import Aurin

/// What the iPhone sends the Apple Watch app (WatchBridge.snapshot) from the sample day.
final class WatchSnapshotTests: XCTestCase {
    @MainActor
    func testSampleDay() throws {
        let today = DemoData.today
        let s = WatchBridge.snapshot(today, health: DemoData.health)
        XCTAssertEqual(s.date, today.date)
        XCTAssertEqual(s.readiness, 78)
        XCTAssertEqual(s.sleep?.minutes, 432)
        XCTAssertEqual(s.sleep?.start, "23:48")
        XCTAssertEqual(s.sleep?.end, "7:02")
        // Health's 30 days of HRV and resting HR, its seven nights and the stages.
        XCTAssertEqual(s.hrv?.series.count, 30)
        XCTAssertEqual(s.restingHR?.series.count, 30)
        XCTAssertEqual(s.sleep?.nights.count, 7)
        XCTAssertEqual(s.sleep?.deep, 83)
        XCTAssertEqual(s.hrv?.low, 55)
        XCTAssertEqual(s.strain.score, 8.4)
        XCTAssertEqual(s.strain.low, 11.4)

        // Through WatchConnectivity and back.
        let data = try XCTUnwrap(s.encoded())
        XCTAssertEqual(WatchSnapshot.decode(data), s)
    }

    @MainActor
    func testWithoutHealth() {
        let s = WatchBridge.snapshot(DemoData.today, health: nil)
        XCTAssertEqual(s.hrv?.series.count, DemoData.today.hrv?.series.count)
        XCTAssertEqual(s.sleep?.nights, [])
        XCTAssertNil(s.sleep?.deep)
    }
}
