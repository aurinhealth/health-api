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

    struct Station: Decodable, Equatable, Identifiable, Hashable {
        let id: String
        let group: String
        let label: String
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
