import Foundation

/// One day of the month calendar and the day strip (GET /app/api/days,
/// src/app-days.js): the readiness, the night against its need, the day's
/// strain (0–21) and HRV against its usual range. nil where the day has none.
struct DayValues: Decodable, Equatable {
    struct Readiness: Decodable, Equatable { let score: Int; let zone: String? }
    struct Sleep: Decodable, Equatable { let minutes: Int; let need: Int; let percent: Int }
    struct HRV: Decodable, Equatable { let value: Int; let band: String }
    let date: String
    let readiness: Readiness?
    let sleep: Sleep?
    let strain: Double?
    let hrv: HRV?
}

struct DaysRange: Decodable, Equatable {
    let start: String
    let end: String
    let days: [DayValues]
}

extension APIClient {
    func days(start: String, end: String) async throws -> DaysRange {
        try await get("/app/api/days?start=" + start + "&end=" + end)
    }
}
