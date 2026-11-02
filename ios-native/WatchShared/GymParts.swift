import Foundation

// The parts of a gym day around the exercises (Rozcvička, Kardio, Cviky,
// Kardio, Protažení), shared by the iPhone and the Apple Watch: the warm-up,
// stretching and cardio the plan carries (src/stretching.js, the sheet's row 5)
// and the day's choices (order, switches, cardio length). The choices are
// kept in the same row of the sheet ("day"), so a change on either device
// reaches the other with the day's plan. The iPhone-only parts (names,
// colours, the phone's own copy) are extensions in Aurin/Screens.

/// The warm-up or the stretching: its moves in order, and the name of an own one
/// ("Legs"; nil for the automatic one).
struct GymStretching: Codable, Equatable, Sendable {
    let minutes: Int
    let items: [Item]
    var name: String? = nil

    struct Item: Codable, Equatable, Identifiable, Sendable {
        let id: String
        let name: String
        let seconds: Int
        let sides: Bool
        var rounds: Int = 1
        var steps: [String] = []
        var photos: [String] = []
        /// The YouTube id of a demonstration.
        var video: String? = nil

        enum CodingKeys: String, CodingKey { case id, name, seconds, sides, rounds, steps, photos, video }

        init(id: String, name: String, seconds: Int, sides: Bool, rounds: Int = 1, steps: [String] = [], photos: [String] = []) {
            self.id = id; self.name = name; self.seconds = seconds; self.sides = sides
            self.rounds = rounds; self.steps = steps; self.photos = photos
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = try c.decode(String.self, forKey: .name)
            seconds = try c.decode(Int.self, forKey: .seconds)
            sides = try c.decodeIfPresent(Bool.self, forKey: .sides) ?? false
            rounds = max(1, try c.decodeIfPresent(Int.self, forKey: .rounds) ?? 1)
            steps = try c.decodeIfPresent([String].self, forKey: .steps) ?? []
            photos = try c.decodeIfPresent([String].self, forKey: .photos) ?? []
            video = try c.decodeIfPresent(String.self, forKey: .video).flatMap { $0.isEmpty ? nil : $0 }
        }

        var photoURLs: [URL] { photos.compactMap(URL.init(string:)) }
    }

    /// The plan's sixth row: ["Rozcvička a protažení", "{warmup, stretching}"].
    static let row = 5

    struct Routines: Decodable {
        let warmup: GymStretching?
        let stretching: GymStretching?
        var cardio: Cardio? = nil
        /// The parts turned off in Nastavení → Posilovna, offered switched off.
        var off: [String]? = nil
    }

    /// The day's cardio: the machine, which parts are on (start and end, minutes
    /// for older builds; nil when off) and the time it runs: 0 or nil = no limit.
    struct Cardio: Decodable, Equatable {
        let type: String
        let start: Int?
        let end: Int?
        var length: Int? = nil
    }

    static func routines(_ values: [[JSONValue]]) -> Routines? {
        guard values.count > row, values[row].count > 1, values[row][0].string == "Rozcvička a protažení",
              let data = values[row][1].string?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Routines.self, from: data)
    }

    init(minutes: Int, items: [Item], name: String? = nil) {
        self.minutes = minutes
        self.items = items
        self.name = name
    }
}

extension GymDay {
    /// The warm-up before and the stretching after the session (src/stretching.js), nil without them.
    /// An older plan's warm-up began with easy cardio: that is the opening cardio now.
    var warmup: GymStretching? {
        guard let all = GymStretching.routines(values)?.warmup else { return nil }
        let cardio = all.items.filter { $0.id == "cardio" }
        guard !cardio.isEmpty else { return all }
        let moves = all.items.filter { $0.id != "cardio" }
        guard !moves.isEmpty else { return nil }
        let seconds = cardio.reduce(0) { $0 + $1.seconds }
        return GymStretching(minutes: max(1, all.minutes - Int((Double(seconds) / 60).rounded())), items: moves)
    }
    var stretching: GymStretching? { GymStretching.routines(values)?.stretching }
    /// The warm-up and the stretching turned off in Nastavení → Posilovna ("warmup", "stretching"): offered switched off.
    var routinesOff: [String] { GymStretching.routines(values)?.off ?? [] }
    /// The cardio at the start and at the end (an older plan: its warm-up's easy cardio).
    var cardio: GymStretching.Cardio? {
        let routines = GymStretching.routines(values)
        if let cardio = routines?.cardio { return cardio }
        guard let old = routines?.warmup?.items.first(where: { $0.id == "cardio" }) else { return nil }
        return GymStretching.Cardio(type: "exercise_bike", start: max(1, Int((Double(old.seconds) / 60).rounded())), end: nil)
    }

    /// The day's parts as last chosen on the iPhone or the watch, kept in the plan; nil before any choice.
    var dayParts: GymDayParts? {
        guard let object = routinesObject, let day = object["day"],
              let data = try? JSONEncoder().encode(day) else { return nil }
        return try? JSONDecoder().decode(GymDayParts.self, from: data)
    }

    /// Keeps the day's parts in the plan's row 5 next to the routines, the other keys as they are.
    mutating func setDayParts(_ parts: GymDayParts) {
        guard var object = routinesObject, let data = try? JSONEncoder().encode(parts),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return }
        object["day"] = value
        guard let json = try? JSONEncoder().encode(JSONValue.object(object)), let text = String(data: json, encoding: .utf8) else { return }
        set(row: GymStretching.row, column: 1, text)
    }

    /// Row 5's JSON as an object, nil without the routines (a plan without warm-up, stretching or cardio).
    private var routinesObject: [String: JSONValue]? {
        guard values.count > GymStretching.row, values[GymStretching.row].count > 1,
              values[GymStretching.row][0].string == "Rozcvička a protažení",
              let data = values[GymStretching.row][1].string?.data(using: .utf8),
              case let .object(object)? = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        return object
    }
}

/// The parts of the day in their default order.
enum GymDayPart: String, Codable, CaseIterable, Identifiable, Sendable {
    case warmup, cardioStart, exercises, cardioEnd, stretching

    var id: String { rawValue }
    var isCardio: Bool { self == .cardioStart || self == .cardioEnd }
}

/// One day's parts: their order, those turned off, each cardio's machine and minutes,
/// and a warm-up or stretching chosen for the day (another length or an own one).
struct GymDayParts: Codable, Equatable, Sendable {
    var order: [GymDayPart]
    var off: [GymDayPart]
    var cardio: [String: Choice]
    var routines: [String: Routine]? = nil
    /// When they were last changed, on the iPhone or the watch: the newer
    /// choice wins between the phone's copy and the day's plan (nil: never changed).
    var updated: Date? = nil

    /// The machine and the minutes; 0 minutes = no limit (a stopwatch).
    struct Choice: Codable, Equatable, Sendable {
        var type: String
        var minutes: Int
    }

    /// The choice (an own routine's id, else automatic with a length; nil = auto) and what it made.
    struct Routine: Codable, Equatable, Sendable {
        var routine: String?
        var length: Int?
        var moves: GymStretching
    }

    /// The plan's parts: the cardio the setup chose is on, the other one off, and
    /// the warm-up and the stretching off when Posilovna turned them off. The
    /// cardio runs as long as Nastavení → Posilovna → Délka kardia says (no limit
    /// by default, also for a plan made before it).
    static func defaults(_ day: GymDay) -> GymDayParts {
        let plan = day.cardio
        let type = plan?.type ?? "exercise_bike"
        let length = max(0, plan?.length ?? 0)
        var off: [GymDayPart] = day.routinesOff.compactMap { $0 == "warmup" ? .warmup : $0 == "stretching" ? .stretching : nil }
        if plan?.start == nil { off.append(.cardioStart) }
        if plan?.end == nil { off.append(.cardioEnd) }
        return GymDayParts(order: GymDayPart.allCases, off: off,
                           cardio: [GymDayPart.cardioStart.rawValue: Choice(type: type, minutes: length),
                                    GymDayPart.cardioEnd.rawValue: Choice(type: type, minutes: length)])
    }

    func isOn(_ part: GymDayPart) -> Bool { part == .exercises || !off.contains(part) }

    func choice(_ part: GymDayPart) -> Choice {
        cardio[part.rawValue] ?? Choice(type: "exercise_bike", minutes: 0)
    }

    /// The parts the day has (the warm-up and the stretching only when the plan made them).
    func visible(_ day: GymDay) -> [GymDayPart] {
        order.filter { part in
            switch part {
            case .warmup: return day.warmup != nil
            case .stretching: return day.stretching != nil
            default: return true
            }
        }
    }

    /// The parts turned on before and after the exercises, in order.
    func before(_ day: GymDay) -> [GymDayPart] {
        let parts = visible(day)
        guard let i = parts.firstIndex(of: .exercises) else { return [] }
        return parts[..<i].filter(isOn)
    }

    func after(_ day: GymDay) -> [GymDayPart] {
        let parts = visible(day)
        guard let i = parts.firstIndex(of: .exercises) else { return [] }
        return parts[(i + 1)...].filter(isOn)
    }

    /// Moves `part` to where `target` is.
    mutating func move(_ part: GymDayPart, to target: GymDayPart) {
        guard part != target, let from = order.firstIndex(of: part), let to = order.firstIndex(of: target) else { return }
        order.remove(at: from)
        order.insert(part, at: to)
    }

    /// Moves `part` one place up (-1) or down (+1) among the day's parts.
    mutating func step(_ part: GymDayPart, by offset: Int, day: GymDay) {
        let shown = visible(day)
        guard let i = shown.firstIndex(of: part), shown.indices.contains(i + offset) else { return }
        move(part, to: shown[i + offset])
    }

    /// The day's parts: the newer of the plan's and `local` (the iPhone's own copy), else the plan's defaults.
    static func current(_ day: GymDay, local: GymDayParts? = nil) -> GymDayParts {
        var parts: GymDayParts
        switch (day.dayParts, local) {
        case let (plan?, mine?): parts = (mine.updated ?? .distantPast) > (plan.updated ?? .distantPast) ? mine : plan
        case let (plan?, nil): parts = plan
        case let (nil, mine?): parts = mine
        default: parts = defaults(day)
        }
        for part in GymDayPart.allCases where !parts.order.contains(part) { parts.order.append(part) }
        return parts
    }
}

extension GymDayPart {
    /// The prefix the iPhone keeps a move's tick under (GymRoutineKind.key):
    /// the warm-up and the stretching can share a move.
    var tickPrefix: String {
        switch self {
        case .warmup: return "w-"
        case .cardioStart, .cardioEnd: return "c-"
        default: return ""
        }
    }

    /// The cardio's one item, as the iPhone names it.
    var cardioId: String { self == .cardioStart ? "cardio-start" : "cardio-end" }
}

extension GymDayParts {
    /// The warm-up's or stretching's moves for the day: one chosen for the day, else the plan's.
    func moves(_ part: GymDayPart, day: GymDay) -> GymStretching? {
        switch part {
        case .warmup: return routines?[part.rawValue]?.moves ?? day.warmup
        case .stretching: return routines?[part.rawValue]?.moves ?? day.stretching
        default: return nil
        }
    }
}
