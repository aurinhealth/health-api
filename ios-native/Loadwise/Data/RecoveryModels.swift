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
        /// A session: when it alone is recovered from (ISO), without the morning's signs.
        var readyAt: String? = nil
        /// Sleep: minutes slept and the night's need.
        var minutes: Int? = nil
        var need: Int? = nil
        /// HRV (ms) and resting heart rate (bpm) against their usual range.
        var value: Int? = nil
        var low: Int? = nil
        var high: Int? = nil

        var isSession: Bool { ["ride", "run", "walk", "gym"].contains(kind) }
        var ready: Date? { readyAt.flatMap(RecoveryTime.date) }
    }

    var ready: Date? { Self.date(readyAt) }
    var start: Date? { Self.date(from) }
    var light: Date? { lightAt.flatMap(Self.date) }
    /// The main session works the legs (anything but a gym day that spared them).
    var legsTired: Bool { causes.first.map { $0.kind != "gym" || ($0.title ?? "").contains("nohy") || ($0.title ?? "").contains("legs") } ?? false }

    static func date(_ iso: String) -> Date? {
        fractional.date(from: iso) ?? whole.date(from: iso)
    }

    // ISO8601DateFormatter is thread-safe; made once, as the card draws.
    nonisolated(unsafe) private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let whole: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// The day it counts for: after 22:00 the next morning's. Regenerace
    /// shows days only, never a clock time (Petr, 2026-10-15).
    private static func day(_ date: Date) -> Date {
        Calendar.current.component(.hour, from: date) >= 22 ? date.addingTimeInterval(6 * 3600) : date
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        DateFormatters.make(pattern, locale: L10n.locale, timeZone: .current).string(from: date)
    }

    /// "dnes", "pátek" / "today", "Friday".
    static func when(_ date: Date, today: String) -> String {
        let d = day(date)
        return AppModel.localDate(d) == today ? L10n.tr("dnes") : format(d, "EEEE")
    }

    /// In a sentence: "dnes", "v pátek", "ve čtvrtek" / "today", "on Friday".
    static func phrase(_ date: Date, today: String) -> String {
        let d = day(date)
        if AppModel.localDate(d) == today { return L10n.tr("dnes") }
        if L10n.isEnglish { return "on " + format(d, "EEEE") }
        let weekday = Calendar.current.component(.weekday, from: d)
        return ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"][weekday - 1]
    }

    /// "pá" / "Fri" for the bar's ends and the sessions.
    static func short(_ date: Date, ready: Bool = true) -> String {
        format(ready ? day(date) : date, L10n.isEnglish ? "EEE" : "EEEEEE").capitalized(with: L10n.locale)
    }

    /// A session's day: "dnes", "včera", "neděle" / "Sunday".
    static func dayName(_ iso: String, today: String) -> String {
        if iso == today { return L10n.tr("dnes") }
        if Fmt.relativeDay(iso, today: today) == L10n.tr("včera") { return L10n.tr("včera") }
        let utc = TimeZone(identifier: "UTC")!
        guard let date = DateFormatters.iso(timeZone: utc).date(from: iso) else { return iso }
        return DateFormatters.make("EEEE", locale: L10n.locale, timeZone: utc).string(from: date)
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
