import XCTest
@testable import Aurin

/// The bedtime reminder's "Keep your charged watch on" line: only when Apple
/// Watch measures sleep, in the first 14 days or after a night without data.
final class RemindersWatchLineTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func days(_ n: Double) -> Double { now.timeIntervalSince1970 - n * 86_400 }

    func testFirstTwoWeeksOnly() {
        XCTAssertTrue(Reminders.asksForWatch(paired: true, source: "apple-health", lastNight: true, since: days(3), now: now))
        XCTAssertFalse(Reminders.asksForWatch(paired: true, source: "apple-health", lastNight: true, since: days(15), now: now))
        XCTAssertFalse(Reminders.asksForWatch(paired: true, source: "apple-health", lastNight: true, since: 0, now: now))
    }

    func testAfterANightWithoutData() {
        XCTAssertTrue(Reminders.asksForWatch(paired: true, source: "apple-health", lastNight: false, since: days(40), now: now))
        XCTAssertTrue(Reminders.asksForWatch(paired: true, source: nil, lastNight: false, since: 0, now: now))
    }

    func testOnlyWithAppleWatch() {
        XCTAssertFalse(Reminders.asksForWatch(paired: false, source: "apple-health", lastNight: false, since: days(1), now: now))
        XCTAssertFalse(Reminders.asksForWatch(paired: true, source: "whoop", lastNight: false, since: days(1), now: now))
        XCTAssertFalse(Reminders.asksForWatch(paired: true, source: "google-wearables", lastNight: true, since: days(1), now: now))
    }
}
