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

/// GET /app/api/today → recoveryTime (src/recovery-time.js): Regenerace,
/// when hard training (intervals, heavy legs) is fine again after the last
/// days' sessions and what makes it take that long.
struct RecoveryTime: Decodable, Equatable {
    /// ISO times: ready for hard training, the session it counts from, easy
    /// training (nil: already now).
    let readyAt: String
    let from: String
    let lightAt: String?
    /// Hours left, and the share of the time already behind (0–1).
    let hours: Int
    let progress: Double
    let causes: [Cause]

    struct Cause: Decodable, Equatable, Hashable {
        /// "ride", "run", "walk", "gym", or a morning sign: "sleep", "hrv", "restingHR".
        let kind: String
        let title: String?
        /// "74 TSS" for a session.
        let detail: String?
        /// The session's day.
        let date: String?
        let hours: Int
        /// Sleep: minutes slept and the night's need.
        var minutes: Int? = nil
        var need: Int? = nil
        /// HRV (ms) and resting heart rate (bpm) against their usual range.
        var value: Int? = nil
        var low: Int? = nil
        var high: Int? = nil

        var isSession: Bool { ["ride", "run", "walk", "gym"].contains(kind) }
    }

    var ready: Date? { Self.date(readyAt) }
    var start: Date? { Self.date(from) }
    var light: Date? { lightAt.flatMap(Self.date) }
    /// The main session works the legs (anything but a gym day that spared them).
    var legsTired: Bool { causes.first.map { $0.kind != "gym" || ($0.title ?? "").contains("nohy") || ($0.title ?? "").contains("legs") } ?? false }

    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }

    /// "zítra 14:00", "dnes 18:30", "ve čtvrtek 7:00" relative to `today`.
    static func when(_ date: Date, today: String) -> String {
        let f = DateFormatter()
        f.locale = L10n.locale
        f.timeZone = .current
        f.dateFormat = L10n.isEnglish ? "h:mm a" : "H:mm"
        return Fmt.relativeDay(AppModel.localDate(date), today: today) + " " + f.string(from: date)
    }

    /// "út 18:15" for the bar's ends.
    static func short(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = L10n.locale
        f.timeZone = .current
        f.dateFormat = L10n.isEnglish ? "EEE h:mm a" : "EEEEEE H:mm"
        return f.string(from: date)
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
