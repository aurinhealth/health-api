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

    /// The lines under a live answer: what it was made from and from memory, each optional.
    func testAnswerSourcesDecode() throws {
        let result = try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ano.","actions":[],"sources":{"from":"From last night's sleep and this morning's HRV","memory":"From memory: knee hurts on long runs"}}"#.utf8))
        XCTAssertEqual(result.sources?.from, "From last night's sleep and this morning's HRV")
        XCTAssertEqual(result.sources?.memory, "From memory: knee hurts on long runs")
        let memoryOnly = try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ano.","sources":{"memory":"From memory: no swims"}}"#.utf8))
        XCTAssertNil(memoryOnly.sources?.from)
        XCTAssertEqual(memoryOnly.sources?.memory, "From memory: no swims")
        XCTAssertNil(try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ano."}"#.utf8)).sources)
    }

    /// A reopened chat brings the chips of the server's question and the card of the coach's own message.
    func testChatQuestionAndCardDecode() throws {
        let json = #"{"id":7,"title":"Check-in after a break","messages":[{"id":120,"role":"assistant","content":"Five days without a workout. How are you?","createdAt":"2026-11-23 07:00:00"}],"actions":[],"question":{"messageId":120,"chips":["All good","Rest","Sick","Injured"]},"card":{"kind":"week_summary","messageId":120,"key":"2026-11-16"}}"#
        let chat = try JSONDecoder().decode(ChatDetail.self, from: Data(json.utf8))
        XCTAssertEqual(chat.question, ChatDetail.Question(messageId: 120, chips: ["All good", "Rest", "Sick", "Injured"]))
        XCTAssertEqual(chat.card, ChatDetail.Card(kind: "week_summary", messageId: 120, key: "2026-11-16"))
        let plain = try JSONDecoder().decode(ChatDetail.self, from: Data(#"{"id":4,"title":"t","messages":[]}"#.utf8))
        XCTAssertNil(plain.question)
        XCTAssertNil(plain.card)
    }

    /// The Sunday summary's card: the week against the one before, by sport, the load and sleep in words.
    func testWeekSummaryDecode() throws {
        let json = #"{"start":"2026-11-16","end":"2026-11-22","headline":"Good week: 5 of 6 planned workouts done.","workouts":{"done":5,"planned":6,"was":{"done":6,"planned":6}},"minutes":{"total":400,"was":365},"sports":[{"sport":"ride","done":2,"planned":2,"minutes":230,"km":96},{"sport":"gym","done":1,"planned":1,"minutes":55}],"missed":[{"date":"2026-11-19","sport":"run","name":"Tempo run"}],"load":{"state":"ready","level":"above","text":"The last 7 days were harder than your usual 4 weeks."},"sleep":null,"from":"From your workouts and sleep this week"}"#
        let summary = try JSONDecoder().decode(WeekSummary.self, from: Data(json.utf8))
        XCTAssertEqual(summary.workouts.was?.done, 6)
        XCTAssertEqual(summary.minutes.was, 365)
        XCTAssertEqual(summary.sports?.map(\.sport), ["ride", "gym"])
        XCTAssertEqual(summary.sports?.first?.km, 96)
        XCTAssertNil(summary.sports?.last?.km)
        XCTAssertEqual(summary.load?.text, "The last 7 days were harder than your usual 4 weeks.")
        XCTAssertNil(summary.sleep)
        XCTAssertEqual(WeekSummaryCard.count(5, of: 6), L10n.f("%@ z %@", "5", "6"))
        XCTAssertEqual(WeekSummaryCard.count(3, of: 0), "3")
        // A first week has nothing to compare with.
        let first = try JSONDecoder().decode(WeekSummary.self, from: Data(#"{"start":"2026-11-16","end":"2026-11-22","workouts":{"done":1,"planned":0},"minutes":{"total":40},"sports":[],"missed":[]}"#.utf8))
        XCTAssertNil(first.workouts.was)
        XCTAssertNil(first.minutes.was)
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
        // Readiness in the usual range: no "why is it low" (TestFlight 604.1).
        XCTAssertFalse(CoachSuggestions.forDay(today: DemoData.today, sessions: [], date: date, limit: 8).contains(L10n.tr("Proč mám nízkou připravenost?")))
    }

    /// The questions under an answer follow the language the athlete writes in, whatever the app's.
    func testSuggestionsFollowTheWrittenLanguage() {
        XCTAssertEqual(L10n.written("Můžu dnes dát intervaly?"), "cs")
        XCTAssertEqual(L10n.written("muzu dnes jet intervaly"), "cs")
        XCTAssertEqual(L10n.written("Can I do the intervals today?"), "en")
        XCTAssertNil(L10n.written("FTP 250"))
        let date = AppModel.localDate(Date())
        XCTAssertEqual(CoachSuggestions.forDay(today: nil, sessions: [], date: date, language: "cs").first, "Jak mám dnes trénovat?")
        XCTAssertEqual(CoachSuggestions.forDay(today: nil, sessions: [], date: date, language: "en").first, L10n.tr("Jak mám dnes trénovat?", in: "en"))
        XCTAssertNotEqual(L10n.tr("Jak mám dnes trénovat?", in: "en"), "Jak mám dnes trénovat?")
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
