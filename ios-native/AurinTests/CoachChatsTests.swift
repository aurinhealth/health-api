import XCTest
@testable import Aurin

/// ☰ in the coach: the conversations by the phone's day they were last written in.
@MainActor final class CoachChatsTests: XCTestCase {
    private func chat(_ id: Int, _ updatedAt: String?) -> ChatSummary {
        try! JSONDecoder().decode(ChatSummary.self, from: JSONSerialization.data(withJSONObject: ["id": id, "title": "Chat \(id)", "updatedAt": updatedAt as Any]))
    }

    func testServerTimeIsUTC() {
        XCTAssertEqual(ChatsPanel.date("2026-10-28 18:32:10"), Date(timeIntervalSince1970: 1_793_212_330))
        XCTAssertNil(ChatsPanel.date("yesterday"))
        XCTAssertNil(ChatsPanel.date(nil))
    }

    func testChatsGroupByDayInTheServersOrder() {
        let now = Date()
        let utc = DateFormatter()
        utc.locale = Locale(identifier: "en_US_POSIX")
        utc.timeZone = TimeZone(identifier: "UTC")
        utc.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let days = ChatsPanel.days([chat(3, utc.string(from: now)), chat(2, utc.string(from: now)),
                                    chat(1, utc.string(from: now.addingTimeInterval(-3 * 86400)))])
        XCTAssertEqual(days.map { $0.chats.map(\.id) }, [[3, 2], [1]])
        XCTAssertEqual(ChatsPanel.title(days[0].day), "Dnes")
        XCTAssertEqual(ChatsPanel.title(AppModel.shift(AppModel.localDate(now), by: -1)!), "Včera")
    }
}
