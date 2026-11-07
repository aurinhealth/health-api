import XCTest
import SwiftUI
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

    /// The stored answer's id comes with the answer, and a reopened chat brings each answer's thumb.
    func testAnswerIdAndThumbDecode() throws {
        let result = try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ano.","chatId":4,"messageId":91,"actions":[]}"#.utf8))
        XCTAssertEqual(result.messageId, 91)
        let chat = try JSONDecoder().decode(ChatDetail.self, from: Data(#"{"id":4,"title":"t","messages":[{"id":90,"role":"user","content":"Můžu?","createdAt":"2026-11-04 18:58:00"},{"id":91,"role":"assistant","content":"Ano.","createdAt":"2026-11-04 18:58:09","rating":"down"}]}"#.utf8))
        XCTAssertNil(chat.messages[0].rating)
        XCTAssertEqual(chat.messages[1].rating, "down")
        XCTAssertEqual(chat.messages[1].serverId, 91)
    }

    /// Copy gives the answer without the Markdown marks.
    func testCopiedAnswerIsPlainText() {
        let text = "## Dnes\n\nAno, **VO2max 5×4 min** sedí.\n\n- Drž 112–118 % FTP\n- Stop pod 105 %\n\n1. Rozjetí\n2. Intervaly\n\n---"
        XCTAssertEqual(CoachMarkdown.plainText(text), "Dnes\n\nAno, VO2max 5×4 min sedí.\n\n• Drž 112–118 % FTP\n• Stop pod 105 %\n\n1. Rozjetí\n2. Intervaly")
    }

    /// Under an answer the pool is larger than the three of the empty chat.
    func testDaySuggestionsTakeALimit() {
        let date = AppModel.localDate(Date())
        XCTAssertEqual(CoachSuggestions.forDay(today: nil, sessions: [], date: date).count, 3)
        XCTAssertEqual(CoachSuggestions.forDay(today: nil, sessions: [], date: date, limit: 8).count, CoachSuggestions.fallback.count)
    }

    /// "Report this answer…" fills the description within the server's 4000 characters.
    func testReportedAnswerFitsTheReport() {
        let start = CoachAnswerReport.startText(String(repeating: "Dlouhá odpověď. ", count: 400))
        XCTAssertLessThan(start.count, 4000)
        XCTAssertTrue(start.hasPrefix("Odpověď kouče, kterou hlásím:"))
    }

    /// A chat search result decodes, and the word is marked in its text whatever its case and accents.
    func testSearchResultDecodesAndMarksTheWord() throws {
        let json = #"{"chatId":4,"title":"Swap squats","updatedAt":"2026-11-02 17:55:00","messageId":41,"role":"user","createdAt":"2026-11-02 17:50:00","snippet":"My Knee hurts, the knee again"}"#
        let result = try JSONDecoder().decode(ChatSearchResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.id, 41)
        XCTAssertEqual(result.chatId, 4)
        let marked = ChatsPanel.marked(result.snippet, "knee")
        let runs = marked.runs.filter { $0[AttributeScopes.SwiftUIAttributes.BackgroundColorAttribute.self] != nil }.map { String(marked[$0.range].characters) }
        XCTAssertEqual(runs, ["Knee", "knee"])
        let czech = ChatsPanel.marked("Únava po noci", "unava")
        XCTAssertEqual(czech.runs.filter { $0[AttributeScopes.SwiftUIAttributes.BackgroundColorAttribute.self] != nil }.map { String(czech[$0.range].characters) }, ["Únava"])
        XCTAssertEqual(String(ChatsPanel.marked("text", "").characters), "text")
    }
}
