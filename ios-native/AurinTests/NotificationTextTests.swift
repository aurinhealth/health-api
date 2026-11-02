import UserNotifications
import XCTest
@testable import Aurin

/// The push's own texts behind Settings → Oznámení → Skrýt zdravotní údaje (Shared/NotificationText.swift).
final class NotificationTextTests: XCTestCase {
    func testHiddenValuesComeFromPrivate() {
        let content = UNMutableNotificationContent()
        content.title = "Připravenost"
        content.body = "Dnešní připravenost je spočítaná."
        content.userInfo = ["private": ["title": "Připravenost 72 · Dnes klidně naplno", "subtitle": "Spánek 7:12",
                                        "body": "Nic naplánováno.", "readiness": ["score": 72, "zone": "green"] as [String: Any]] as [String: Any]]
        XCTAssertEqual(NotificationText(content), NotificationText(title: "Připravenost 72 · Dnes klidně naplno", subtitle: "Spánek 7:12", body: "Nic naplánováno."))
        XCTAssertEqual(NotificationText.shown(content).body, "Dnešní připravenost je spočítaná.")
        XCTAssertEqual((NotificationText.readiness(content.userInfo)?["score"] as? NSNumber)?.intValue, 72)
        XCTAssertTrue(NotificationText.isMorning(content.userInfo))
    }

    func testShownValuesStayAsTheyCame() {
        let content = UNMutableNotificationContent()
        content.title = "Kouč"
        content.body = "Zítřejší práh vyměním za lehkou jízdu?"
        content.userInfo = ["coach": ["kind": "recovery"] as [String: Any]]
        XCTAssertEqual(NotificationText(content), NotificationText(title: "Kouč", body: "Zítřejší práh vyměním za lehkou jízdu?"))
        XCTAssertNil(NotificationText.hidden(content.userInfo))
        XCTAssertFalse(NotificationText.isMorning(content.userInfo))
    }

    /// Only the switches changed on this iPhone go to the server, so another iPhone's choice stays.
    func testOnlyChangedPushChoicesAreSent() {
        XCTAssertEqual(PushRegistration.changedChoices([true, true, false, true], before: nil),
                       ["morning": true, "coach": true, "water": false, "private": true])
        XCTAssertEqual(PushRegistration.changedChoices([true, false, false, true], before: [true, true, false, true]), ["coach": false])
        XCTAssertEqual(PushRegistration.changedChoices([true, true, false, true], before: [true, true, false, true]), [:])
    }
}
