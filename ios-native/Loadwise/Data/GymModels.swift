import Foundation

// MARK: - Equipment (GET/POST /app/api/gym/equipment, src/gym-equipment-ai.js)

/// What the athlete trains with: "custom" (a gym, the stations it has), "home"
/// (a home gym, the few things there), "bodyweight", or from the first setup
/// "gym" (any gym) and "dumbbells" (home with dumbbells).
struct GymEquipment: Decodable, Equatable {
    var stations: [Station]? = nil
    var equipment: String
    var selected: [String]
    var gymName: String
    var gymUrl: String
    /// The dumbbells there are, kg per hand (the plan asks for one of them).
    var dumbbellWeights: [Double]? = nil
    /// The saved gyms and home gyms, each with its own stations; the plan
    /// follows the active one ("bodyweight": none).
    var places: [GymPlace]? = nil
    var activePlace: String? = nil

    struct Station: Decodable, Equatable, Identifiable, Hashable {
        let id: String
        let group: String
        let label: String
    }
}

/// One saved place to train (src/onboarding.js normalizePlaces).
struct GymPlace: Decodable, Equatable, Identifiable {
    var id: String
    /// "gym" or "home".
    var kind: String
    var name: String
    var stations: [String]
    var url: String
    var dumbbellWeights: [Double]

    var json: JSONValue {
        .object(["id": .string(id), "kind": .string(kind), "name": .string(name),
                 "stations": .array(stations.map { .string($0) }), "url": .string(url),
                 "dumbbellWeights": .array(dumbbellWeights.map { .number($0) })])
    }
}

/// POST /app/api/gym/equipment/detect: the stations AI saw on the photos or the web.
struct GymDetectResult: Decodable, Equatable {
    let status: String?
    let found: Bool?
    let gymName: String?
    let stations: [String]?
    let note: String?
    let message: String?
}

// MARK: - Exercises (GET /app/api/gym/exercises)

struct GymCatalogExercise: Decodable, Equatable, Identifiable, Hashable {
    let name: String
    let muscle: String?
    let sets: JSONValue?
    let reps: JSONValue?
    let note: String?
    let station: String?
    let stations: [String]?
    /// Muscle group id (BodyMap) → how much the exercise works it (0–1).
    let muscles: [String: Double]?
    /// Whether the active place has what it needs (nil from an older server).
    var fits: Bool? = nil
    /// How tiring it is (about 0.25 a wrist curl, 1.4 a squat): the big lifts
    /// go first in a session (nil from an older server).
    var fatigue: Double? = nil
    /// The athlete's thumb up (true) or down (false) after a workout, nil without one.
    var liked: Bool? = nil
    var id: String { name }

    static func == (a: Self, b: Self) -> Bool { a.name == b.name }
    func hash(into hasher: inout Hasher) { hasher.combine(name) }
}

// MARK: - AI gym builder (POST /app/api/gym/generate preview, /adjust, /confirm)

/// A proposed plan: rows as the gym sheet has them (Typ, Cvik, Série, Plán kg,
/// Plán reps, …), not saved until it is confirmed.
struct GymProposal: Equatable {
    var draftId: Int?
    var planName: String
    var rationale: String?
    var rows: [[JSONValue]]
    var muscles: [String: [String: Double]]

    /// The exercises in order with their work sets, "3 × 8–10 · 40 kg".
    var exercises: [(name: String, sets: Int, reps: String, kg: String)] {
        var out: [(name: String, sets: Int, reps: String, kg: String)] = []
        for row in rows {
            guard row.count > 4, let name = row[1].string else { continue }
            let work = (row[0].string ?? "WORK").uppercased() != "WARMUP"
            if let i = out.firstIndex(where: { $0.name == name }) {
                if work { out[i].sets += 1 }
            } else {
                out.append((name, work ? 1 : 0, row[4].string ?? "", row[3].string ?? ""))
            }
        }
        return out
    }

    /// Every muscle the plan works and how much (the strongest exercise wins).
    var load: [String: Double] {
        var out: [String: Double] = [:]
        for (_, map) in muscles { for (id, w) in map { out[id] = max(out[id] ?? 0, w) } }
        return out
    }

    /// The superset letter of each exercise, in the order of `exercises`.
    var supersets: [String?] { blocks.list.map { Self.superset(of: $0) } }

    /// The exercises with a set to failure.
    var failing: Set<String> {
        Set(rows.filter { $0.count > 11 && $0[11].isTrue }.compactMap { $0[1].string })
    }

    /// The rows of each exercise in the order of `exercises`, and the rows
    /// that are not an exercise.
    private var blocks: (list: [[[JSONValue]]], rest: [[JSONValue]]) {
        var list: [[[JSONValue]]] = [], names: [String] = [], rest: [[JSONValue]] = []
        for row in rows {
            guard row.count > 4, let name = row[1].string else { rest.append(row); continue }
            if let i = names.firstIndex(of: name) { list[i].append(row) } else { names.append(name); list.append([row]) }
        }
        return (list, rest)
    }

    private static func superset(of block: [[JSONValue]]) -> String? {
        ExerciseOrder.letter(block.first(where: { $0.count > 12 })?[12].string)
    }

    /// Whether the exercise (with its superset) can move one place up (-1) or down (+1).
    func canMove(_ index: Int, by step: Int) -> Bool {
        let units = ExerciseOrder.runs(supersets)
        guard let u = units.firstIndex(where: { $0.contains(index) }) else { return false }
        return units.indices.contains(u + step)
    }

    /// Moves an exercise one place up (-1) or down (+1); a superset moves as one.
    mutating func moveExercise(_ index: Int, by step: Int) {
        let (list, rest) = blocks
        var units = ExerciseOrder.runs(list.map { Self.superset(of: $0) })
        guard let u = units.firstIndex(where: { $0.contains(index) }), units.indices.contains(u + step) else { return }
        units.swapAt(u, u + step)
        rows = units.flatMap { (unit: Range<Int>) -> [[JSONValue]] in unit.flatMap { list[$0] } } + rest
    }

    /// The exercises of a superset one after another.
    mutating func groupSupersets() {
        let (list, rest) = blocks
        rows = ExerciseOrder.grouped(list.map { Self.superset(of: $0) }).flatMap { list[$0] } + rest
    }

    /// Adds an exercise's rows where it belongs among the others (ExerciseOrder).
    mutating func insert(_ new: [[JSONValue]], name: String, catalog: [GymCatalogExercise]) {
        let current = blocks
        var list = current.list
        let ranks: [Double] = list.map { (block: [[JSONValue]]) -> Double in
            let other = block[0][1].string ?? ""
            return ExerciseOrder.rank(other, catalog: catalog, muscles: muscles[other])
        }
        let at = ExerciseOrder.insertionIndex(rank: ExerciseOrder.rank(name, catalog: catalog, muscles: muscles[name]),
                                              ranks: ranks, supersets: list.map { Self.superset(of: $0) })
        list.insert(new, at: at)
        rows = list.flatMap { $0 } + current.rest
    }
}

struct GymPreviewResponse: Decodable {
    let draftId: Int?
    let plan: Plan?
    let muscles: [String: [String: Double]]?
    let message: String?

    struct Plan: Decodable {
        let planName: String?
        let rationale: String?
        let rows: [[JSONValue]]
    }
}

struct GymAdjustResponse: Decodable {
    let rows: [[JSONValue]]?
    /// What the AI changed, one or two sentences.
    let answer: String?
    let muscles: [String: [String: Double]]?
}

// MARK: - Exercise order

/// Where an exercise belongs in a session: the big multi-joint lifts first,
/// then isolation, the core last; a superset stays together and nothing goes
/// before the exercises already done.
enum ExerciseOrder {
    /// How early the exercise belongs (higher first): the catalog's fatigue,
    /// else how many muscles it works; the core 0.
    static func rank(_ name: String, catalog: [GymCatalogExercise], muscles: [String: Double]? = nil) -> Double {
        let exercise = catalog.first { $0.name == name }
        let map: [String: Double] = muscles ?? exercise?.muscles ?? [:]
        let top = map.max { $0.value < $1.value }?.key
        if top == "abs" || top == "obliques" { return 0 }
        if let fatigue = exercise?.fatigue { return fatigue }
        let worked = map.values.filter { $0 >= 0.5 }.count
        return worked == 0 ? 0.6 : min(1.2, 0.3 + 0.15 * Double(worked))
    }

    /// The position for an exercise of `rank` among the plan's (`ranks` in
    /// order): before the first lighter one, not before `earliest`, and after
    /// a superset rather than inside it.
    static func insertionIndex(rank: Double, ranks: [Double], supersets: [String?], earliest: Int = 0) -> Int {
        let start = min(max(0, earliest), ranks.count)
        var index = ranks.count
        for i in start..<ranks.count where ranks[i] < rank {
            index = i
            break
        }
        func group(_ i: Int) -> String? { i >= 0 && i < supersets.count ? letter(supersets[i]) : nil }
        while index > 0, index < ranks.count, let g = group(index - 1), group(index) == g { index += 1 }
        return index
    }

    /// Consecutive exercises of one superset as one range, every other exercise alone.
    static func runs(_ supersets: [String?]) -> [Range<Int>] {
        var out: [Range<Int>] = []
        var start = 0
        for i in supersets.indices {
            let next = i + 1
            let g = letter(supersets[i])
            let same = next < supersets.count && g != nil && letter(supersets[next]) == g
            if !same {
                out.append(start..<next)
                start = next
            }
        }
        return out
    }

    /// The order (indices) with the later exercises of a superset moved right
    /// after its first one.
    static func grouped(_ supersets: [String?]) -> [Int] {
        var out: [Int] = []
        var placed = Set<Int>()
        for i in supersets.indices where !placed.contains(i) {
            out.append(i)
            placed.insert(i)
            guard let g = letter(supersets[i]) else { continue }
            for j in supersets.indices where j > i && !placed.contains(j) && letter(supersets[j]) == g {
                out.append(j)
                placed.insert(j)
            }
        }
        return out
    }

    /// "A", or nil for no superset.
    static func letter(_ value: String?) -> String? {
        let text = (value ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        return text.isEmpty ? nil : text
    }
}

extension GymDay {
    /// Whether the set on this row goes to failure (the "Do selhání" column).
    func isToFailure(row: Int) -> Bool {
        guard row < values.count, values[row].count > 11 else { return false }
        return values[row][11].isTrue
    }

    /// Adds an exercise where it belongs (ExerciseOrder), after the exercises
    /// already started.
    mutating func insertExercise(_ name: String, sets: Int, reps: String, catalog: [GymCatalogExercise], sides: Bool = false) {
        let list = exercises
        let ranks: [Double] = list.map { ExerciseOrder.rank($0.name, catalog: catalog) }
        let earliest = (list.lastIndex { $0.sets.contains { $0.done } } ?? -1) + 1
        let at = ExerciseOrder.insertionIndex(rank: ExerciseOrder.rank(name, catalog: catalog), ranks: ranks,
                                              supersets: list.map { $0.superset }, earliest: earliest)
        addExercise(name, sets: sets, reps: reps, sides: sides)
        // An exercise already last in the plan just gets the sets.
        guard exercises.count == list.count + 1 else { return }
        moveExercise(from: list.count, to: at)
    }
}

extension JSONValue {
    /// A sheet checkbox: TRUE, 1 or ANO.
    var isTrue: Bool {
        if case .bool(let b) = self { return b }
        return ["TRUE", "1", "ANO"].contains((string ?? "").uppercased())
    }
}

// MARK: - Workout library (GET /app/api/workouts/search, POST /schedule)

struct GeneratedWorkout: Decodable {
    let status: String?
    let message: String?
    let workout: LibraryWorkout?
    let variantCount: Int?
}

struct WorkoutSearchResponse: Decodable {
    let workouts: [LibraryWorkout]
    let total: Int?
}

struct LibraryWorkout: Decodable, Equatable, Identifiable, Hashable {
    let id: String
    let name: String
    let primary_system: String?
    let duration_minutes: Double?
    let target_load: Double?
    let intensity_factor: Double?
    let difficulty: Double?
    let description: String?
    let source_name: String?
    let environment: String?
    let steps: [PlannedWorkout.Block]?
    /// Why it suits today (src/workout-library.js rankWorkoutCandidates).
    var reasons: [String]? = nil
    var suitability: Double? = nil
    /// How to ride or run it, fuelling and terrain (src/workout-explanation.js).
    var guide: Guide? = nil
    /// The AI's pick for today with its reason (src/ai-workout-pick.js).
    var ai: AIPick? = nil

    struct AIPick: Decodable, Equatable, Hashable {
        let reason: String
    }

    struct Guide: Decodable, Equatable {
        let title: String?
        let how: [String]?
        let fueling: [String]?
        let environment: [String]?
    }

    /// "Lehký", "Střední" or "Těžký" from the difficulty (1–10).
    var difficultyLabel: String? {
        guard let d = difficulty else { return nil }
        return L10n.tr(d < 4 ? "lehký" : d < 6.5 ? "střední" : "těžký")
    }

    static func == (a: Self, b: Self) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    static let systems: [(String, String)] = [
        ("recovery", "Regenerace"), ("endurance", "Vytrvalost"), ("tempo", "Tempo"), ("sweet_spot", "Sweet spot"),
        ("threshold", "Práh"), ("vo2max", "VO2max"), ("anaerobic", "Anaerobní"), ("sprint", "Sprint")
    ]

    static func systemLabel(_ id: String?) -> String {
        systems.first { $0.0 == id }.map { L10n.tr($0.1) } ?? (id ?? "")
    }
}

// MARK: - Onboarding (GET/POST /app/api/onboarding, src/onboarding.js)

struct OnboardingStatus: Decodable {
    let completed: Bool?
    let savedProfile: JSONObject?
    let weightKg: Double?
    let training: Training?

    struct Training: Decodable {
        let experience: String?
        let equipment: String?
    }
}
