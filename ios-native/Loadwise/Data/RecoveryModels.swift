import Foundation

/// GET /app/api/today → recovery (src/recovery-today.js): "Regenerace na dnes"
/// after a training day, nil on other days.
struct RecoveryToday: Decodable, Equatable {
    let title: String?
    /// The coach's sentence: what the session loaded and what tomorrow brings.
    let text: String?
    let items: [Item]

    struct Item: Decodable, Hashable, Identifiable {
        /// "stretch", "sauna" or "bedtime".
        let kind: String
        let title: String
        let detail: String?
        let done: Bool?
        /// Stretch: the sport and focus the routine was picked for (sent back when saving).
        let sport: String?
        let focus: String?
        let routine: Routine?
        /// Sauna: the saved row once done, so a tap by mistake can be taken back.
        var savedId: Int? = nil

        var id: String { kind }
        var isDone: Bool { done ?? false }
    }

    struct Routine: Decodable, Hashable {
        let title: String?
        let minutes: Int?
        let items: [Exercise]
    }

    struct Exercise: Decodable, Hashable, Identifiable {
        let key: String
        let name: String
        /// "40 s na stranu", "10×".
        let dose: String?
        let cue: String?
        /// The time of the move itself (both sides), for the timer.
        let seconds: Int?
        let sides: Bool?

        var id: String { key }
    }
}

/// GET /app/api/coach-text?screen= (src/screen-texts.js): the coach's sentence
/// on Today, Training and Food. source "ai" with the text, else "rules": the
/// screen keeps its own rule-based text.
struct CoachText: Decodable, Equatable {
    let source: String?
    let text: String?
    let advice: String?
    let chips: [String]?
    let basis: [Basis]?
    /// When the AI wrote it, "07:12".
    let time: String?

    struct Basis: Decodable, Equatable, Hashable {
        let label: String
        let value: String
    }

    var isAI: Bool { source == "ai" && !(text ?? "").isEmpty }
}

extension APIClient {
    /// Saves a finished stretching routine or a sauna into the day's plan as done.
    func saveRecoveryDone(date: String, kind: String, sport: String?, focus: String?) async throws {
        var body: JSONObject = ["date": .string(date), "kind": .string(kind), "done": .bool(true)]
        if let sport { body["sport"] = .string(sport) }
        if let focus { body["focus"] = .string(focus) }
        let _: JSONValue = try await send("/app/api/recovery", method: "POST", body: body)
    }

    /// Removes a saved stretching or sauna from its day (Plán dne, a sauna ticked by mistake).
    func deleteRecovery(id: Int) async throws {
        let body: JSONObject = ["id": .number(Double(id))]
        let _: JSONValue = try await send("/app/api/recovery", method: "DELETE", body: body)
    }

    func coachText(screen: String) async throws -> CoachText {
        try await get("/app/api/coach-text?screen=" + screen)
    }
}
