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
    /// "food_draft": a sentence about food became entries to confirm (src/food-chat.js).
    var kind: String? = nil
    var draft: FoodDraft? = nil
    /// What the coach remembered, forgot or rewrote with this answer.
    var memoryChanges: MemoryChanges? = nil

    struct MemoryChanges: Decodable, Equatable {
        let saved: String?
        let forgotten: [String]?
        let updated: [Update]?

        struct Update: Decodable, Equatable {
            let from: String
            let to: String
        }

        /// One line under the answer per change, each with "Zpět".
        var chips: [CoachMemoryChip] {
            (saved.map { [CoachMemoryChip(kind: .saved, text: $0)] } ?? [])
                + (forgotten ?? []).map { CoachMemoryChip(kind: .forgotten, text: $0) }
                + (updated ?? []).map { CoachMemoryChip(kind: .updated, text: $0.to, from: $0.from) }
        }
    }
}

/// "Zapamatováno", "Zapomenuto" or "Upraveno" under an answer.
struct CoachMemoryChip: Identifiable, Equatable {
    enum Kind { case saved, forgotten, updated }
    let id = UUID()
    let kind: Kind
    let text: String
    var from: String? = nil
    var undone = false
}

/// What the coach read from "K obědu jsem měl kuře s rýží": the day and the
/// foods with the saved or looked-up product. Nothing is logged until "Zapsat".
struct FoodDraft: Decodable, Equatable {
    let date: String
    var items: [Item]

    struct Item: Decodable, Equatable {
        let name: String
        var brand: String? = nil
        var grams: Double
        var basis: String? = nil
        /// breakfast, snack_am, lunch, snack_pm, dinner or "" when not said.
        var meal: String? = nil
        var product: FoodProduct? = nil

        /// The amount first offered in the product's unit: a portion product counts portions.
        var startAmount: Double { product?.perPortion == true ? 1 : grams }
    }
}

/// One thing the coach remembers (GET /app/api/athlete-state, src/athlete-state.js memoryList).
struct CoachMemory: Decodable, Equatable, Identifiable {
    let text: String
    let since: String?
    let check: String?
    var id: String { text }
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
    /// activity_kcal: the done activity, its calories now and the new ones.
    var activityName: String? = nil
    var fromKcal: Double? = nil
    var kcal: Double? = nil
    /// activity_merge: the second part; activity_time: the start now and the new one.
    var otherName: String? = nil
    var fromTime: String? = nil
    var time: String? = nil
    /// workout: the session the server prepared for the card, a ride or run
    /// (POST /app/api/workouts/generate) or the gym exercises (/gym/generate).
    var preview: Preview? = nil

    struct Preview: Decodable, Equatable {
        var workout: LibraryWorkout? = nil
        var plan: GymPreviewResponse.Plan? = nil
    }

    struct Snapshot: Decodable, Equatable {
        let name: String?
        let date: String?
    }

    var id: String { draftId.map(String.init) ?? type + (date ?? "") + (reason ?? "") }

    /// "Přesunout „Dlouhý běh“ na sobotu 10. října".
    var title: String {
        let day = date.map { Fmt.weekdayShort($0) + " " + Fmt.dayMonth($0) } ?? ""
        let name = eventSnapshot?.name.map { L10n.f("„%@“", $0) } ?? L10n.tr("trénink")
        switch type {
        case "move": return L10n.f("Přesunout %@ na %@", name, day)
        case "rest": return L10n.f("Volno místo %@ (%@)", name, day)
        case "workout":
            let sportName = L10n.tr(["ride": "jízda", "run": "běh", "gym": "posilovna"][sport ?? ""] ?? "trénink")
            return L10n.f("Naplánovat: %@", workoutName ?? sportName) + (minutes.map { " · " + Fmt.duration(Int($0)) } ?? "") + " · " + day
        case "gym_swap": return L10n.f("V posilovně vyměnit %@ za %@", fromExercise ?? L10n.tr("cvik"), toExercise ?? L10n.tr("jiný"))
        case "activity_delete": return L10n.tr("Smazat aktivitu")
        case "activity_merge": return L10n.tr("Sloučit 2 aktivity")
        case "activity_time": return L10n.tr("Upravit čas")
        case "activity_kcal":
            let what = activityName.flatMap { $0.isEmpty ? nil : L10n.f("„%@“", $0) } ?? L10n.tr("aktivity")
            return L10n.f("Kalorie %@ (%@): %@ kcal", what, day, Fmt.int(kcal))
        case "week_sport": return L10n.f("Týdenní plán: %@ %@", day, L10n.tr(["ride": "kolo", "run": "běh", "gym": "posilovna"][sport ?? ""] ?? (sport ?? "")))
        case "status":
            let label = L10n.tr(["sick": "nemoc", "injured": "zranění", "on_break": "pauza", "active": "zpět v tréninku"][status ?? ""] ?? (status ?? ""))
            return L10n.f("Stav: %@", label)
        default: return type
        }
    }

    /// The line under the title of a change of a done activity:
    /// "Běh 07:02 + Běh 07:31", "Jízda 18:10 · út 14. 10.", "Posilovna · 17:30 → 18:00".
    var detail: String? {
        let day = date.map { Fmt.weekdayShort($0) + " " + Fmt.dayMonth($0) }
        switch type {
        case "activity_delete": return [activityName, day].compactMap { $0 }.joined(separator: " · ")
        case "activity_merge": return [activityName, otherName].compactMap { $0 }.joined(separator: " + ")
        case "activity_time": return [activityName, [fromTime, time].compactMap { $0 }.joined(separator: " → ")].compactMap { $0 }.joined(separator: " · ")
        default: return nil
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
