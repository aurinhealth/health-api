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
        var name: String
        var lifts: [Lift]
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

    static let requestKey = "gymRequest"
    static let replyKey = "gym"
    static let doneKey = "gymDone"

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym? { try? JSONDecoder().decode(WatchGym.self, from: data) }
}

extension WatchGym.Done {
    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchGym.Done? { try? JSONDecoder().decode(WatchGym.Done.self, from: data) }
}
