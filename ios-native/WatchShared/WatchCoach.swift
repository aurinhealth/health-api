import Foundation

/// The coach on the watch (AurinWatch/CoachView.swift): the watch has no
/// session of its own, so the iPhone asks the server (App/WatchCoachBridge.swift)
/// in the same chat as the coach in the app and sends the answer back.
enum WatchCoach {
    /// Watch → iPhone: a question (Ask, with the chat it continues).
    static let askKey = "coachAsk"
    /// iPhone → watch: what the coach is doing now ("Looking at your sleep…").
    static let progressKey = "coachProgress"
    /// iPhone → watch: the answer (Answer).
    static let answerKey = "coachAnswer"

    struct Ask: Codable, Equatable, Sendable {
        var id: String
        var text: String
        var chatId: Int?
        /// "gym" during a workout on the watch, so the coach knows where it is asked.
        var view: String

        func encoded() -> Data? { try? JSONEncoder().encode(self) }
        static func decode(_ data: Data) -> Ask? { try? JSONDecoder().decode(Ask.self, from: data) }
    }

    struct Answer: Codable, Equatable, Sendable {
        var id: String
        /// Plain text without Markdown; the error's words when it failed.
        var text: String
        var chatId: Int?
        var failed: Bool
        /// The coach proposed a workout or food to confirm in the app.
        var proposal: Bool

        func encoded() -> Data? { try? JSONEncoder().encode(self) }
        static func decode(_ data: Data) -> Answer? { try? JSONDecoder().decode(Answer.self, from: data) }
    }
}
