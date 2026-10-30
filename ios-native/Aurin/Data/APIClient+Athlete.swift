import Foundation

// "Stav sportovce" (src/athlete-state.js): active, sick, injured or on a break,
// until changed or until a day. While not active the coach plans no regular
// training (assertTrainingAllowed) and suggests rest instead.

struct AthleteStatus: Decodable, Equatable {
    /// "active", "sick", "injured" or "on_break".
    let status: String
    let note: String?
    /// The first day the status no longer applies (yyyy-MM-dd), nil: until changed.
    let statusUntil: String?

    static let active = AthleteStatus(status: "active", note: nil, statusUntil: nil)
}

extension APIClient {
    func athleteStatus() async throws -> AthleteStatus {
        struct Response: Decodable { let state: AthleteStatus }
        let r: Response = try await get("/app/api/athlete-state")
        return r.state
    }

    /// `cancel`: planned sessions (event ids) to cancel with a status other than Trénink.
    func setAthleteStatus(_ status: String, until: String?, note: String?, cancel: [String] = []) async throws -> AthleteStatus {
        struct Response: Decodable { let state: AthleteStatus }
        var body: JSONObject = ["status": .string(status), "note": .string(note ?? "")]
        body["statusUntil"] = until.map { .string($0) } ?? .null
        if !cancel.isEmpty { body["cancel"] = .array(cancel.map { .string($0) }) }
        let r: Response = try await send("/app/api/athlete-state", method: "POST", body: body)
        return r.state
    }

    /// Settings → Oznámení: which of the server's pushes the phone wants
    /// (the morning readiness, the coach's own messages, the water Build-up nudge).
    func setPushChoices(morning: Bool, coach: Bool, water: Bool) async throws {
        let _: JSONValue = try await send("/app/api/athlete-state", method: "POST", body: ["notify": JSONValue.object(["morning": .bool(morning), "coach": .bool(coach), "water": .bool(water)])])
    }
}

// The morning check-in on Today (src/morning-checkin.js): how the athlete
// feels, which can only lower the readiness. The server keeps one answer a
// day, so sending it again (from the outbox) changes nothing.
extension APIClient {
    static func morningCheckinItem(_ feeling: String?, date: String) -> OutboxItem {
        let body: JSONObject = ["date": .string(date), "feeling": feeling.map { .string($0) } ?? .null]
        return OutboxItem(path: "/app/api/morning-checkin", method: "POST", body: OutboxItem.json(body),
                          label: L10n.tr("Ranní pocit"), key: "checkin:" + date)
    }
}
