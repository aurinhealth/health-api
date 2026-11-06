import XCTest
@testable import Aurin

/// What the iPhone sends the Apple Watch app (WatchBridge.snapshot) from the sample day.
final class WatchSnapshotTests: XCTestCase {
    @MainActor
    func testSampleDay() throws {
        let today = DemoData.today
        var s = WatchBridge.snapshot(today, health: DemoData.health)
        // Whole seconds: a fraction can come back a hair different from JSON.
        s.updated = Date(timeIntervalSince1970: 1_791_450_000)
        XCTAssertEqual(s.date, today.date)
        XCTAssertEqual(s.readiness, 78)
        // The day's verdict, the line under the watch's number (Today audit 17).
        XCTAssertEqual(s.verdict, "hard")
        XCTAssertEqual(s.sleep?.minutes, 432)
        XCTAssertEqual(s.sleep?.start, "23:33")
        XCTAssertEqual(s.sleep?.end, "7:02")
        // Health's 30 days of HRV and resting HR, its seven nights and the stages.
        XCTAssertEqual(s.hrv?.series.count, 30)
        XCTAssertEqual(s.restingHR?.series.count, 30)
        XCTAssertEqual(s.sleep?.nights.count, 7)
        XCTAssertEqual(s.sleep?.deep, 83)
        XCTAssertEqual(s.hrv?.low, 55)
        XCTAssertEqual(s.strain.score, 8.4)
        XCTAssertEqual(s.strain.low, 11.4)

        // A morning with last night: its HRV is this morning's (Today audit 20).
        XCTAssertFalse(s.awaitingNight)
        var waiting = s
        waiting.readiness = nil
        waiting.sleep?.minutes = nil
        XCTAssertTrue(waiting.awaitingNight)
        // No HRV or resting HR history (no wearable at night): nothing to wait for.
        waiting.hrv = nil
        waiting.restingHR = nil
        XCTAssertFalse(waiting.awaitingNight)

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

    /// Strain against the target, one rule for the watch app and its
    /// complications: under it is neutral until 18:00, then off.
    func testStrainStanding() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let morning = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: 5, hour: 10)))
        let evening = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: 5, hour: 18)))
        typealias S = WatchSnapshot.Strain
        XCTAssertEqual(S.standing(1.5, low: 3, high: 6, at: morning, calendar: calendar), .neutral)
        XCTAssertEqual(S.standing(1.5, low: 3, high: 6, at: evening, calendar: calendar), .off)
        XCTAssertEqual(S.standing(4.5, low: 3, high: 6, at: morning, calendar: calendar), .onTarget)
        XCTAssertEqual(S.standing(7.2, low: 3, high: 6, at: morning, calendar: calendar), .off)
        XCTAssertNil(S.standing(4.5, low: nil, high: 6, at: morning, calendar: calendar))
    }
}
