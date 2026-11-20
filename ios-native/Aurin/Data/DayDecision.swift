import Foundation

/// The one decision of the day (src/day-decision.js, GET /app/api/today
/// `day`): Today, Training, Food and Health say what it says.
struct DayDecision: Decodable, Equatable {
    /// A key of src/day-verdict.js VERDICT_KEYS; nil without a readiness number.
    var key: String? = nil
    /// The readiness said hard and only the recovery time holds it back.
    var recovering: Bool? = nil
    /// When hard training is fine again ("YYYY-MM-DD"), nil when it already is.
    var hardFrom: String? = nil
    /// The day's training is done: the rest of the day is recovery.
    var done: Bool? = nil
    var sessions: [Judged]? = nil
    var tomorrow: [Judged]? = nil

    struct Judged: Decodable, Equatable {
        let date: String
        let title: String
        let sport: String?
        let fits: Bool
        var lighter: String? = nil
    }

    /// The line of a planned session on `date` that asks for a lighter
    /// version, nil when it fits (Training's week plan, Today's plan).
    func lighter(title: String, date: String) -> String? {
        ((sessions ?? []) + (tomorrow ?? [])).first { $0.date == date && $0.title == title && !$0.fits }?.lighter
    }
}
