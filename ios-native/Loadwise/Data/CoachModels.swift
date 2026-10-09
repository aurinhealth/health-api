import Foundation

/// The final answer of POST /app/api/assistant (src/coach-assistant.js), also
/// the `result` of the stream's "done" line.
struct AssistantResult: Decodable, Equatable {
    let status: String?
    let answer: String?
    let incomplete: Bool?
    let chatId: Int?
    let actions: [CoachAction]?
    let memorySaved: String?
    /// Pictures to draw under the answer from the app's own data:
    /// form, recovery, sleep, nutrition, week, training or zones.
    var visuals: [String]? = nil
}

/// A change the coach proposes; nothing happens until it is confirmed
/// (POST /app/api/assistant/action, src/coach-actions.js).
struct CoachAction: Decodable, Equatable, Identifiable {
    let type: String
    let reason: String?
    let draftId: Int?
    let date: String?
    let sport: String?
    let minutes: Double?
    let workoutName: String?
    let status: String?
    let fromExercise: String?
    let toExercise: String?
    let eventSnapshot: Snapshot?

    struct Snapshot: Decodable, Equatable {
        let name: String?
        let date: String?
    }

    var id: String { draftId.map(String.init) ?? type + (date ?? "") + (reason ?? "") }

    /// "Přesunout „Dlouhý běh“ na sobotu 10. října".
    var title: String {
        let day = date.map { Fmt.weekdayShort($0) + " " + Fmt.dayMonth($0) } ?? ""
        let name = eventSnapshot?.name.map { "„" + $0 + "“" } ?? "trénink"
        switch type {
        case "move": return "Přesunout \(name) na \(day)"
        case "rest": return "Volno místo \(name) (\(day))"
        case "workout":
            let sportName = ["ride": "jízda", "run": "běh", "gym": "posilovna"][sport ?? ""] ?? "trénink"
            return "Naplánovat: " + (workoutName ?? sportName) + (minutes.map { " · " + Fmt.duration(Int($0)) } ?? "") + " · " + day
        case "gym_swap": return "V posilovně vyměnit \(fromExercise ?? "cvik") za \(toExercise ?? "jiný")"
        case "week_sport": return "Týdenní plán: \(day) " + (["ride": "kolo", "run": "běh", "gym": "posilovna"][sport ?? ""] ?? (sport ?? ""))
        case "status":
            let label = ["sick": "nemoc", "injured": "zranění", "on_break": "pauza", "active": "zpět v tréninku"][status ?? ""] ?? (status ?? "")
            return "Stav: " + label
        default: return type
        }
    }
}

/// One line of the NDJSON stream (src/assistant-stream.js).
enum AssistantEvent: Equatable {
    case progress(String)
    /// The whole answer so far (not a delta).
    case answer(String)
    case done(AssistantResult)
}

struct ChatSummary: Decodable, Equatable, Identifiable {
    let id: Int
    let title: String?
    let updatedAt: String?
    let messages: Int?
}

struct ChatMessage: Decodable, Equatable, Identifiable {
    let role: String
    let content: String
    let createdAt: String?
    var id: String { role + "|" + (createdAt ?? "") + "|" + String(content.prefix(40)) }
}

struct ChatDetail: Decodable, Equatable {
    let id: Int
    let title: String?
    let messages: [ChatMessage]
}

/// GET /app/api/coaches?date= (src/coach-engine.js), the coach's home.
struct CoachesSnapshot: Decodable, Equatable {
    let morningSummary: MorningSummary?
    let priorities: [String]?

    struct MorningSummary: Decodable, Equatable {
        let headline: String?
        let text: String?
        let recommendation: String?
    }
}
