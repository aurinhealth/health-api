import XCTest
@testable import Aurin

/// "Už máš dnešní prášek?": an hour after the usual time, or after the
/// reminder when that is later; past midnight it moves to the next day.
final class MissedPillTests: XCTestCase {
    func testAnHourAfterTheUsualTime() {
        XCTAssertEqual(Reminders.missedPillMinute(usual: 20 * 60, reminder: nil), 21 * 60)
        // The reminder at 21:00 comes later than the usual 20:00: an hour after it.
        XCTAssertEqual(Reminders.missedPillMinute(usual: 20 * 60, reminder: 21 * 60), 22 * 60)
        // A morning reminder doesn't hold back an evening pill.
        XCTAssertEqual(Reminders.missedPillMinute(usual: 20 * 60, reminder: 8 * 60), 21 * 60)
    }

    func testPastMidnight() {
        // Usually 23:30: 00:30 the next day.
        XCTAssertEqual(Reminders.missedPillMinute(usual: 23 * 60 + 30, reminder: nil), 1440 + 30)
        // Usually 00:10, the reminder at 22:00: 01:10 the next day, not 23:00.
        XCTAssertEqual(Reminders.missedPillMinute(usual: 10, reminder: 22 * 60), 1440 + 70)
    }
}
