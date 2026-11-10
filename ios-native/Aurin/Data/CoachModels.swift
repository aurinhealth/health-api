import Foundation

/// The final answer of POST /app/api/assistant (src/coach-assistant.js), also
/// the `result` of the stream's "done" line.
struct AssistantResult: Decodable, Equatable {
    let status: String?
    let answer: String?
    let incomplete: Bool?
    let chatId: Int?
    /// The stored answer: copy and the thumbs under it point to it.
    var messageId: Int? = nil
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
    /// What the coach would forget or rewrite: nothing changes until "Zapomenout" or "Přepsat".
    var memoryProposals: MemoryChanges? = nil
    /// This week's messages to the coach after this answer (src/coach-allowance.js).
    var coachAllowance: CoachAllowance? = nil
    /// "Nenavrhuj mi kolo": the sport turned off in Sporty k navrhování (src/sport-choice.js).
    var sportChanges: SportChanges? = nil

    struct SportChanges: Decodable, Equatable {
        let removed: [String]?

        /// "Nenavrhovat kolo, Zpět" under the answer.
        var chips: [CoachMemoryChip] { (removed ?? []).map { CoachMemoryChip(kind: .sportOff, text: $0) } }
    }

    struct MemoryChanges: Decodable, Equatable {
        let saved: String?
        /// Everything the coach saved with this answer (up to three); `saved` is the first.
        var saves: [Save]? = nil
        let forgotten: [String]?
        let updated: [Update]?

        struct Update: Decodable, Equatable {
            let from: String
            let to: String
        }

        struct Save: Decodable, Equatable {
            let text: String
            let group: String?
        }

        /// One line under the answer per change, each with "Zpět".
        var chips: [CoachMemoryChip] {
            let savedTexts = saves.map { $0.map(\.text) } ?? (saved.map { [$0] } ?? [])
            return savedTexts.map { CoachMemoryChip(kind: .saved, text: $0) }
                + (forgotten ?? []).map { CoachMemoryChip(kind: .forgotten, text: $0) }
                + (updated ?? []).map { CoachMemoryChip(kind: .updated, text: $0.to, from: $0.from) }
        }

        /// The same changes, each waiting under the answer for the athlete to confirm it.
        var proposals: [CoachMemoryChip] {
            chips.map { var chip = $0; chip.proposed = true; return chip }
        }
    }
}

/// "Zapamatováno", "Zapomenuto", "Upraveno" or "Nenavrhovat kolo" under an answer.
struct CoachMemoryChip: Identifiable, Equatable {
    /// sportOff: `text` is the sport (ride, run, swim, strength) turned off.
    enum Kind { case saved, forgotten, updated, sportOff }
    let id = UUID()
    let kind: Kind
    let text: String
    var from: String? = nil
    var undone = false
    /// Proposed by the coach: "Zapomenout" or "Přepsat" changes the memory, "Nechat" keeps it.
    var proposed = false
    var kept = false
    /// A memory from the card's quick changes says what it remembered.
    var showsText = false
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
    /// goals, training, health or life.
    var group: String? = nil
    /// "new" or "updated" for a week after the coach saved or rewrote it itself.
    var badge: String? = nil
    var id: String { text }
}

/// The groups of the memory list, in their order on the screen.
enum CoachMemoryGroup: String, CaseIterable, Identifiable {
    case goals, training, health, life
    var id: String { rawValue }
    var title: String {
        switch self {
        case .goals: return L10n.tr("Cíle")
        case .training: return L10n.tr("Trénink")
        case .health: return L10n.tr("Zdraví")
        case .life: return L10n.tr("Život")
        }
    }
}

/// The memory screen as the server keeps it: the memories, what no longer holds
/// (Past), the notes of the last days (Recent chats) and "Use memory".
struct CoachMemoryScreen: Decodable, Equatable {
    var memories: [CoachMemory] = []
    var pastMemories: [PastMemory] = []
    var recentChats: [RecentChatNote] = []
    var memoryOff = false

    struct PastMemory: Decodable, Equatable, Identifiable {
        let text: String
        let since: String?
        let ended: String?
        var id: String { text }
    }

    struct RecentChatNote: Decodable, Equatable, Identifiable {
        let day: String
        let note: String
        var id: String { day }
    }

    enum CodingKeys: String, CodingKey { case memories, pastMemories, recentChats, memoryOff }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        memories = try c.decodeIfPresent([CoachMemory].self, forKey: .memories) ?? []
        pastMemories = try c.decodeIfPresent([PastMemory].self, forKey: .pastMemories) ?? []
        recentChats = try c.decodeIfPresent([RecentChatNote].self, forKey: .recentChats) ?? []
        memoryOff = try c.decodeIfPresent(Bool.self, forKey: .memoryOff) ?? false
    }
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
    /// plan: the multi-week plan the coach proposes, its race or start and
    /// what its card shows (src/coach-actions.js, coachPlanPreview).
    var planName: String? = nil
    var weeksCount: Int? = nil
    var raceDate: String? = nil
    var raceKm: Double? = nil
    var startDate: String? = nil
    var firstDay: String? = nil
    var trainingPlan: ProposedPlan? = nil

    struct ProposedPlan: Decodable, Equatable {
        struct Week: Decodable, Equatable {
            let week: Int
            let phase: String
            let minutes: Int
            var race: Bool? = nil
        }
        /// The running plan of the same kind that starting this one ends.
        struct Replaces: Decodable, Equatable {
            let name: String
            var week: Int? = nil
            var weeksCount: Int? = nil
            var started: Bool? = nil
        }
        let weeks: [Week]
        /// Training days, 0 = Monday; none for a gym plan.
        var days: [Int]? = nil
        var sessions: Int? = nil
        /// Minutes a usual week, the lightest and the longest.
        var minutes: [Int]? = nil
        var replaces: Replaces? = nil
    }

    /// workout: Kratší, Delší, Lehčí, Těžší and the days for Jiný den
    /// (src/coach-quick-change.js); `quickChange` is the last one made.
    var quick: Quick? = nil
    /// A swim card in open water (src/coach-actions.js): by time outside, with the safety line.
    var openWater: Bool? = nil
    var quickChange: String? = nil

    struct Quick: Decodable, Equatable {
        let shorter: Bool
        let longer: Bool
        let easier: Bool
        let harder: Bool
        let day: Bool
        let days: [Day]

        struct Day: Decodable, Equatable, Hashable {
            let date: String
            let fits: Bool
        }
    }
    /// In a reopened chat (GET /app/api/assistant/chats/:id): the answer it came
    /// with and how it was decided (draft, confirmed, rejected, expired).
    var messageId: Int? = nil
    var draftStatus: String? = nil

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
        case "rest": return L10n.f("Odstranit %@ (%@)", name, day)
        case "workout":
            let sportName = L10n.tr(["ride": "jízda", "run": "běh", "swim": "plavání", "gym": "posilovna"][sport ?? ""] ?? "trénink")
            return L10n.f("Naplánovat: %@", workoutName ?? sportName) + (minutes.map { ", " + Fmt.duration(Int($0)) } ?? "") + ", " + day
        case "plan": return L10n.f("Tréninkový plán: %@", planName ?? "")
        case "gym_swap": return L10n.f("V posilovně vyměnit %@ za %@", fromExercise ?? L10n.tr("cvik"), toExercise ?? L10n.tr("jiný"))
        case "activity_delete": return L10n.tr("Smazat aktivitu")
        case "activity_merge": return L10n.tr("Sloučit 2 aktivity")
        case "activity_time": return L10n.tr("Upravit čas")
        case "activity_kcal":
            let what = activityName.flatMap { $0.isEmpty ? nil : L10n.f("„%@“", $0) } ?? L10n.tr("aktivity")
            return L10n.f("Kalorie %@ (%@): %@ kcal", what, day, Fmt.int(kcal))
        case "week_sport":
            let title = ["ride": "Přidat kolo do týdenního plánu", "run": "Přidat běh do týdenního plánu", "gym": "Přidat posilovnu do týdenního plánu"][sport ?? ""]
            return title.map { L10n.tr($0) } ?? type
        case "status":
            let label = L10n.tr(["sick": "nemoc", "injured": "zranění", "on_break": "pauza", "active": "zpět v tréninku"][status ?? ""] ?? (status ?? ""))
            return L10n.f("Stav: %@", label)
        default: return type
        }
    }

    /// The line under the title of a change of a done activity:
    /// "Běh 07:02 + Běh 07:31", "Jízda 18:10, út 14. 10.", "Posilovna, 17:30 → 18:00".
    var detail: String? {
        let day = date.map { Fmt.weekdayShort($0) + " " + Fmt.dayMonth($0) }
        switch type {
        case "activity_delete": return [activityName, day].compactMap { $0 }.joined(separator: ", ")
        case "activity_merge": return [activityName, otherName].compactMap { $0 }.joined(separator: " + ")
        case "activity_time": return [activityName, [fromTime, time].compactMap { $0 }.joined(separator: " → ")].compactMap { $0 }.joined(separator: ", ")
        // A sport added to the week plan holds for that one week only.
        case "week_sport": return day.map { $0 + ", " + L10n.tr("jen tento týden") }
        default: return nil
        }
    }
}

/// One line of the NDJSON stream (src/assistant-stream.js).
enum AssistantEvent: Equatable {
    case progress(String)
    /// The whole answer so far (not a delta).
    case answer(String)
    /// The chat the answer will be saved in, before the model runs: after a
    /// lost connection the finished answer is loaded from it.
    case chat(Int)
    case done(AssistantResult)
}

struct ChatSummary: Decodable, Equatable, Identifiable {
    let id: Int
    let title: String?
    let updatedAt: String?
    let messages: Int?
}

/// One chat found by POST /app/api/assistant/chats/search (src/assistant-chats.js):
/// its newest message with the word, and a piece of text around it.
struct ChatSearchResult: Decodable, Equatable, Identifiable {
    let chatId: Int
    let title: String?
    let messageId: Int
    let role: String
    let createdAt: String?
    let snippet: String
    var id: Int { messageId }
}

struct ChatMessage: Decodable, Equatable, Identifiable {
    let role: String
    let content: String
    let createdAt: String?
    /// The server's id, which a proposal points to (CoachAction.messageId).
    var serverId: Int? = nil
    /// "up" or "down": the athlete's thumb under this answer.
    var rating: String? = nil
    var id: String { role + "|" + (createdAt ?? "") + "|" + String(content.prefix(40)) }

    enum CodingKeys: String, CodingKey { case role, content, createdAt, rating, serverId = "id" }
}

struct ChatDetail: Decodable, Equatable {
    let id: Int
    let title: String?
    let messages: [ChatMessage]
    /// The proposals made in this chat.
    var actions: [CoachAction]? = nil
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
