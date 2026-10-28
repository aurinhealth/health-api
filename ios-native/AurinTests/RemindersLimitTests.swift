import UserNotifications
import XCTest
@testable import Aurin

/// iOS keeps 64 pending notifications per app: the soonest are planned.
final class RemindersLimitTests: XCTestCase {
    private func request(_ id: String, inDays days: Int) -> UNNotificationRequest {
        let fire = Calendar.current.date(byAdding: .day, value: days, to: Date().addingTimeInterval(3600)) ?? Date()
        let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        return UNNotificationRequest(identifier: id, content: UNMutableNotificationContent(),
                                     trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
    }

    func testOnlyTheSoonestFit() {
        let planned = (0..<80).reversed().map { request("r\($0)", inDays: $0) }
        let kept = Reminders.soonest(planned, room: Reminders.limit - 2)
        XCTAssertEqual(kept.count, 62)
        XCTAssertEqual(kept.first?.identifier, "r0")
        XCTAssertEqual(kept.last?.identifier, "r61")
        XCTAssertTrue(Reminders.soonest(planned, room: -3).isEmpty)
    }
}
