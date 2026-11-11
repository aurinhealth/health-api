import Foundation

// MARK: - Synchronizace (GET/PUT /app/api/sync/prefs, src/sync-destinations.js)

/// Which health data a destination gets: all of it (also types added later)
/// or the chosen ones. On the wire "all" or a list of type ids.
enum SyncHealth: Codable, Equatable {
    case all
    case some([String])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let text = try? c.decode(String.self), text == "all" {
            self = .all
        } else {
            self = .some((try? c.decode([String].self)) ?? [])
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .all: try c.encode("all")
        case .some(let types): try c.encode(types)
        }
    }

    func allows(_ type: String) -> Bool {
        switch self {
        case .all: return true
        case .some(let types): return types.contains(type)
        }
    }

    /// Something at all is sent.
    var any: Bool {
        switch self {
        case .all: return true
        case .some(let types): return !types.isEmpty
        }
    }
}

/// One destination's switches (the server keeps them per user).
struct SyncPrefs: Codable, Equatable {
    var pushPlanned: Bool
    var pushActivities: Bool
    var pullActivities: Bool
    var health: SyncHealth
    /// Intervals.icu, Google Health and Apple Health: the apps whose workouts go
    /// there too ("wahoo", "google"; to Intervals.icu Apple Health's is the
    /// health type "workouts"). nil from Wahoo.
    var forward: [String]? = nil
    /// Sent once, with an app just turned on: its last 14 days go too.
    var backfill: Bool? = nil
    /// Sent once, with the yes to Apple Health's data from other apps (src/sync-destinations.js OTHER_TYPES).
    var consent: Bool? = nil

    static let off = SyncPrefs(pushPlanned: false, pushActivities: false, pullActivities: false, health: .some([]))
}

struct SyncSupports: Codable, Equatable {
    let pushPlanned: Bool
    let pushActivities: Bool
    let pullActivities: Bool
    let health: Bool
}

struct SyncDestination: Decodable, Equatable, Identifiable {
    /// apple, google, intervals or wahoo.
    let id: String
    /// nil for Apple Health: it is connected on the iPhone.
    let connected: Bool?
    var prefs: SyncPrefs
    let supports: SyncSupports
    let healthTypes: [String]
    /// Google permissions the chosen settings still need (activityWrite, weightWrite, nutritionWrite).
    var missingScopes: [String]? = nil
    /// Intervals.icu, Google Health and Apple Health: the connected apps whose workouts can go there too.
    var forwardSources: [String]? = nil
}

struct SyncOverview: Decodable {
    let destinations: [SyncDestination]
}

struct SyncPrefsSaved: Decodable {
    let prefs: SyncPrefs
    let missingScopes: [String]?
}

/// One destination's result for a done activity.
struct SyncSend: Decodable, Equatable {
    let destination: String
    /// sent, pending, error or unknown (a first send nobody answered).
    let status: String
    let message: String?
    var needsScope: String? = nil
}

struct SyncActivityResult: Decodable {
    let key: String?
    let sends: [SyncSend]?
}

/// POST /app/api/workouts/manual: the done workout's sends ride along.
struct ManualWorkoutResult: Decodable {
    let activityKey: String?
    let sends: [SyncSend]?
}

/// The destinations as the app shows them: name, the tile, the health data names.
enum SyncApp {
    static let order = ["apple", "google", "intervals", "wahoo"]

    static func name(_ id: String) -> String {
        switch id {
        case "apple": return L10n.tr("Apple Health")
        case "google": return "Google Health"
        case "intervals": return "Intervals.icu"
        case "wahoo": return "Wahoo"
        default: return id
        }
    }

    static func healthName(_ type: String) -> String {
        switch type {
        case "weight": return L10n.tr("Váha")
        case "bodyFat": return L10n.tr("Tělesný tuk")
        case "restingHR": return L10n.tr("Klidový tep")
        case "heartRate": return L10n.tr("Tep")
        case "hrv": return "HRV"
        case "sleep": return L10n.tr("Spánek")
        case "steps": return L10n.tr("Kroky")
        case "spO2": return L10n.tr("Okysličení krve")
        case "respiration": return L10n.tr("Dechová frekvence")
        case "vo2max": return "VO₂max"
        case "nutrition": return L10n.tr("Jídlo a kalorie")
        case "water": return L10n.tr("Voda")
        case "workouts": return L10n.tr("Tréninky z Apple Health")
        default: return type
        }
    }

    /// "Vše", "3 z 9" or "Nic".
    static func healthValue(_ health: SyncHealth, of types: [String]) -> String {
        switch health {
        case .all: return L10n.tr("Vše")
        case .some(let chosen):
            let n = chosen.filter { types.contains($0) }.count
            if n == 0 { return L10n.tr("Nic") }
            if n == types.count { return L10n.tr("Vše") }
            return L10n.f("%@ z %@", String(n), String(types.count))
        }
    }
}

/// A done activity logged in the app, as it goes to the destinations.
struct ActivityToSync: Equatable {
    /// gym:<date> or manual:<id>; the same key updates instead of a second copy.
    let key: String
    /// gym, run or ride.
    let sport: String
    let name: String
    let date: String
    let start: Date?
    let minutes: Int
    var notes: String = ""
    var rpe: Int? = nil

    var body: JSONObject {
        var body: JSONObject = ["key": .string(key), "sport": .string(sport), "name": .string(name), "date": .string(date),
                                "minutes": .number(Double(minutes)), "notes": .string(notes)]
        if let start { body["start"] = .string(ISO8601DateFormatter().string(from: start)) }
        if let rpe { body["rpe"] = .number(Double(rpe)) }
        return body
    }
}

/// After a done activity: where it went, for the toast and its sheet.
struct SyncReport: Identifiable, Equatable {
    let id = UUID()
    let activity: ActivityToSync
    var rows: [Row]

    struct Row: Identifiable, Equatable {
        let destination: String
        var status: Status
        var message: String? = nil
        var needsScope: String? = nil
        var working = false
        var id: String { destination }
    }

    enum Status: Equatable { case sent, pending, error }

    /// The apps that did not get it, "Intervals.icu, Google Health".
    var failedNames: [String] { rows.filter { $0.status == .error }.map { SyncApp.name($0.destination) } }
    var failed: Bool { !failedNames.isEmpty }

    static func status(_ text: String) -> Status {
        switch text {
        case "sent": return .sent
        // "unknown": a send nobody answered, which the server does not repeat on
        // its own; the message and "Zkusit znovu" let the user decide.
        case "error", "unknown": return .error
        default: return .pending
        }
    }
}

extension APIClient {
    func syncOverview() async throws -> SyncOverview {
        try await get("/app/api/sync/prefs")
    }

    func saveSyncPrefs(_ destination: String, _ prefs: SyncPrefs) async throws -> SyncPrefsSaved {
        try await send("/app/api/sync/prefs/" + destination, method: "PUT", body: prefs)
    }

    /// Every health type to the destination, the rest of its preferences kept
    /// (the Intervals.icu connect sheet's "Posílat i zdravotní data").
    func sendAllHealth(to destination: String) async throws {
        let _: SyncPrefsSaved = try await send("/app/api/sync/prefs/" + destination, method: "PUT", body: ["health": JSONValue.string("all")])
    }

    func sendActivity(_ activity: ActivityToSync) async throws -> SyncActivityResult {
        try await send("/app/api/sync/activity", method: "POST", body: activity.body)
    }

    /// Workouts from other apps due in Apple Health (src/watch-forward.js appleForwardList).
    func forwardedWorkouts() async throws -> [ForwardedWorkout] {
        struct Response: Decodable { let workouts: [ForwardedWorkout] }
        let r: Response = try await get("/app/api/sync/forward/apple")
        return r.workouts
    }

    /// Health data from other apps due in Apple Health (src/apple-health-forward.js).
    func forwardedHealth(days: Int) async throws -> ForwardedHealth {
        try await get("/app/api/sync/forward/apple/health?days=\(days)")
    }

    /// One of them written to Apple Health ("sent") or found there already ("same").
    func forwardedWorkoutDone(key: String, status: String) async throws {
        struct Response: Decodable { let status: String }
        let _: Response = try await send("/app/api/sync/forward/apple", method: "POST",
                                         body: ["key": JSONValue.string(key), "status": .string(status)])
    }

    func retrySend(key: String, destination: String) async throws -> SyncSend {
        struct Response: Decodable { let send: SyncSend }
        let r: Response = try await send("/app/api/sync/retry", method: "POST",
                                         body: ["key": JSONValue.string(key), "destination": .string(destination)])
        return r.send
    }
}

/// A workout of another app (Wahoo, Google Health) the iPhone writes to Apple Health.
struct ForwardedWorkout: Decodable, Equatable {
    let key: String
    /// An Intervals.icu activity type (Ride, Run, …).
    let type: String
    let name: String
    /// UTC, ISO 8601.
    let start: String
    let minutes: Int
    /// Metres.
    let distance: Double?
    let kcal: Double?
}

/// GET /app/api/sync/forward/apple/health: what Google Health sent Aurin from the
/// user's watch, by type; a type not switched on is missing.
struct ForwardedHealth: Decodable {
    struct Night: Decodable { let key: String; let start: String; let end: String; let stages: [Stage] }
    struct Stage: Decodable { let type: String; let start: String; let end: String }
    struct Daily: Decodable { let date: String; let value: Double }
    struct Sample: Decodable { let start: String; let value: Double }
    struct Interval: Decodable { let start: String; let end: String; let value: Double }
    var sleep: [Night]? = nil
    var restingHR: [Daily]? = nil
    var spO2: [Daily]? = nil
    var respiration: [Daily]? = nil
    var heartRate: [Sample]? = nil
    var steps: [Interval]? = nil
}
