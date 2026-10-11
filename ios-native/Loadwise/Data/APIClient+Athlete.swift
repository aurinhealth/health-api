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

    func setAthleteStatus(_ status: String, until: String?, note: String?) async throws -> AthleteStatus {
        struct Response: Decodable { let state: AthleteStatus }
        var body: JSONObject = ["status": .string(status), "note": .string(note ?? "")]
        body["statusUntil"] = until.map { .string($0) } ?? .null
        let r: Response = try await send("/app/api/athlete-state", method: "POST", body: body)
        return r.state
    }
}
