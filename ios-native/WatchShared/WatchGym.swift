import Foundation

/// The day's gym plan as the watch gets it (App/WatchGymBridge.swift): each
/// exercise with its sets, the weight and reps to start from and the rest after
/// each set. The watch asks for it when the training page opens and sends each
/// set back when it is done; the iPhone writes it into the day's sheet.
struct WatchGym: Codable, Equatable, Sendable {
    var date: String
    var title: String?
    var minutes: Int?
    /// The rest before the next exercise (Nastavení → Posilovna → Pauzy).
    var restExercises: Int
    var exercises: [Exercise]

    struct Exercise: Codable, Equatable, Sendable {
        /// As in the sheet; changes name it.
        var name: String
        /// As the app shows it (the English name in English).
        var shown: String?
        var lifts: [Lift]
        var title: String { shown ?? name }
    }

    /// One row of the sheet: a set, or one side of a set done by sides.
    struct Lift: Codable, Equatable, Sendable {
        var row: Int
        var number: String
        var warmup: Bool
        var drop: Bool
        /// "L" or "P" of a one-sided exercise.
        var side: String?
        var kg: Double?
        var reps: Int?
        var plannedReps: String?
        var done: Bool
        /// The rest after it, from the plan or the setting.
        var rest: Int
        /// The letter it is planned or rated at (GymIntensity on the iPhone).
        var intensity: String? = nil
        /// Not a warm-up nor a drop set.
        var work: Bool { !warmup && !drop }
    }

    /// A set done on the watch.
    struct Done: Codable, Equatable, Sendable {
        var date: String
        var row: Int
        var kg: Double
        var reps: Int
    }

    /// How a set done on the watch went: E, M, H or F, tapped during the rest.
    struct Rated: Codable, Equatable, Sendable {
        var date: String
        var row: Int
        var letter: String
    }

    /// A change of the plan from the watch (the menu under ≡); the iPhone
    /// writes it into the sheet and answers with the new plan.
    struct Change: Codable, Equatable, Sendable {
        enum Kind: String, Codable, Sendable { case addSet, removeSet, removeExercise, swap, addExercise, move }
        var date: String
        var kind: Kind
        /// The exercise's place in `exercises`.
        var exercise: Int
        /// The new exercise of swap and addExercise.
        var option: Option?
        /// move: the place it goes to, as List.onMove reports it.
        var to: Int?
    }

    /// An exercise offered for a swap or to add, with what it would start from.
    struct Option: Codable, Equatable, Sendable, Identifiable {
        var name: String
        var shown: String
        var kg: Double?
        var sets: Int?
        var reps: String?
        var id: String { name }
    }

    /// What the watch asks to choose from: similar to `exercise`, or matching `query`.
    struct OptionsRequest: Codable, Equatable, Sendable {
        var date: String
        var exercise: String?
        var query: String?
    }

    static let requestKey = "gymRequest"
    static let replyKey = "gym"
    static let doneKey = "gymDone"
    static let ratedKey = "gymRated"
    static let changeKey = "gymChange"
    /// Watch → iPhone every few seconds of the gym: the heart rate and calories
    /// (Live) for Training mode, which then leaves Apple Health to the watch.
    static let liveKey = "gymLive"
    /// iPhone → watch: Training mode finished, the watch ends and saves the workout.
    static let endKey = "gymEnd"

    struct Live: Codable, Equatable, Sendable {
        var start: Date
        var heartRate: Double?
        var calories: Double

        func encoded() -> Data? { try? JSONEncoder().encode(self) }
        static func decode(_ data: Data) -> Live? { try? JSONDecoder().decode(Live.self, from: data) }
    }
    static let optionsKey = "gymOptions"

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym? { try? JSONDecoder().decode(WatchGym.self, from: data) }
}

extension WatchGym.Done {
    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym.Done? { try? JSONDecoder().decode(WatchGym.Done.self, from: data) }
}

extension WatchGym.Rated {
    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym.Rated? { try? JSONDecoder().decode(WatchGym.Rated.self, from: data) }
}

extension WatchGym.Change {
    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym.Change? { try? JSONDecoder().decode(WatchGym.Change.self, from: data) }
}

extension WatchGym.OptionsRequest {
    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym.OptionsRequest? { try? JSONDecoder().decode(WatchGym.OptionsRequest.self, from: data) }
}
