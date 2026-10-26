import ActivityKit
import AppIntents
import Foundation

/// The gym Live Activity (lock screen and Dynamic Island) while Posilovna
/// naživo or Režim tréninku is open: the rest counting down with the next set,
/// then the set itself with "Série hotová". The app fills every text in its
/// language (GymLiveActivity); the widget extension only draws them.
struct GymActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// "Posilovna · 3 z 5 cviků".
        var header: String
        /// The set now, or after the rest: "Dřep".
        var exercise: String
        /// "série 3 ze 4" (or "rozcvička").
        var setLabel: String
        /// "80 kg × 8".
        var load: String
        /// The two parts of the load for the Dynamic Island: "80 kg" (nil without a
        /// weight) and "8".
        var weight: String?
        var reps: String?
        /// "3/4" of a work set (nil for a warm-up or a drop set).
        var setShort: String?
        /// The next exercise: "Bench · 60 kg × 10".
        var then: String?
        /// The sheet row of the set, for Série hotová.
        var row: Int?
        /// Each exercise's share of sets done, 0…1.
        var segments: [Double]
        var heartRate: Int?
        var kcal: Int?
        var restStart: Date?
        var restEnd: Date?
    }

    /// When the workout started (the running clock).
    var startedAt: Date
    var labels: Labels

    /// The fixed words, in the app's language.
    struct Labels: Codable, Hashable {
        var rest: String
        var next: String
        var then: String
        var plus: String
        var skipRest: String
        var skip: String
        var setDone: String
    }
}

/// What a button of the Live Activity asks for.
enum GymActivityAction: Equatable {
    case extend
    case skip
    case complete(row: Int)
}

/// The open workout screen handles the buttons; the intents run in the app's
/// process (LiveActivityIntent), where the screen set this handler.
@MainActor
enum GymActivityInbox {
    static var handler: ((GymActivityAction) -> Void)?
}

struct GymRestExtendIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Prodloužit pauzu"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await MainActor.run { GymActivityInbox.handler?(.extend) }
        return .result()
    }
}

struct GymRestSkipIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Přeskočit pauzu"
    static let isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await MainActor.run { GymActivityInbox.handler?(.skip) }
        return .result()
    }
}

struct GymSetDoneIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Série hotová"
    static let isDiscoverable = false

    @Parameter(title: "Řádek")
    var row: Int

    init() {}
    init(row: Int) { self.row = row }

    func perform() async throws -> some IntentResult {
        let row = row
        await MainActor.run { GymActivityInbox.handler?(.complete(row: row)) }
        return .result()
    }
}
