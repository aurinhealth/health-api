import Foundation
import WatchConnectivity

/// The day's gym on the watch: the plan from the iPhone (App/WatchGymBridge.swift),
/// the sets done here, and where the session stands, kept so a relaunch goes on.
@MainActor
final class GymStore: ObservableObject {
    static let shared = GymStore()
    private static let savedKey = "watchGym"

    @Published private(set) var gym: WatchGym?
    @Published private(set) var loading = false
    @Published private(set) var failed = false

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.savedKey), let saved = WatchGym.decode(data),
           saved.date == WatchStore.localDate(Date()) {
            gym = saved
        }
    }

    /// The plan from the iPhone; a session in progress keeps what was done here.
    func load() {
        let date = WatchStore.localDate(Date())
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isReachable else {
            failed = gym == nil
            return
        }
        loading = true
        session.sendMessage([WatchGym.requestKey: date], replyHandler: { reply in
            let data = reply[WatchGym.replyKey] as? Data
            Task { @MainActor in GymStore.shared.received(data) }
        }, errorHandler: { _ in
            Task { @MainActor in
                GymStore.shared.loading = false
                GymStore.shared.failed = GymStore.shared.gym == nil
            }
        })
    }

    /// A plan from the iPhone: the answer to load or to a change, or sent on
    /// its own when the iPhone saved the day (WatchStore forwards it).
    func received(_ data: Data?) {
        loading = false
        guard let data, var fresh = WatchGym.decode(data) else {
            failed = gym == nil
            return
        }
        failed = false
        // Sets done on the watch that the iPhone has not written yet stay done.
        guard fresh.date == WatchStore.localDate(Date()) else { return }
        if let gym, gym.date == fresh.date {
            for e in fresh.exercises.indices {
                for l in fresh.exercises[e].lifts.indices {
                    let row = fresh.exercises[e].lifts[l].row
                    if let mine = gym.lift(row: row), mine.done, !fresh.exercises[e].lifts[l].done {
                        fresh.exercises[e].lifts[l] = mine
                    }
                }
            }
        }
        gym = fresh
        save()
    }

    /// A set done: kept here and sent to the iPhone, which saves it in the day's sheet.
    func complete(row: Int, kg: Double, reps: Int) {
        guard var gym else { return }
        gym.update(row: row) { $0.kg = kg; $0.reps = reps; $0.done = true }
        // The next set of the exercise starts from this one, as on the iPhone.
        if let next = gym.next(after: row), !next.newExercise, let done = gym.lift(row: row), done.work, next.lift.work, !next.lift.done {
            gym.update(row: next.lift.row) { $0.kg = kg; $0.reps = reps }
        }
        self.gym = gym
        save()
        guard let data = WatchGym.Done(date: gym.date, row: row, kg: kg, reps: reps).encoded() else { return }
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated else { return }
        let message = [WatchGym.doneKey: data]
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
                // Out of reach after all: queued until the iPhone takes it.
                WCSession.default.transferUserInfo(message)
            })
        } else {
            session.transferUserInfo(message)
        }
    }

    /// A change from the menu (a set or an exercise added, removed or
    /// swapped); the iPhone writes it into the sheet and answers with the new plan.
    func change(_ kind: WatchGym.Change.Kind, exercise: Int, option: WatchGym.Option? = nil) {
        guard let gym, let data = WatchGym.Change(date: gym.date, kind: kind, exercise: exercise, option: option).encoded() else { return }
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isReachable else {
            failedChange = true
            return
        }
        changing = true
        session.sendMessage([WatchGym.changeKey: data], replyHandler: { reply in
            let data = reply[WatchGym.replyKey] as? Data
            Task { @MainActor in
                GymStore.shared.changing = false
                GymStore.shared.received(data)
            }
        }, errorHandler: { _ in
            Task { @MainActor in
                GymStore.shared.changing = false
                GymStore.shared.failedChange = true
            }
        })
    }

    @Published private(set) var changing = false
    /// A change the iPhone did not take (out of reach): the screen says so once.
    @Published var failedChange = false

    /// Exercises to swap in or to add, from the iPhone.
    func options(exercise: String?, query: String?) async -> [WatchGym.Option] {
        guard let gym, let data = WatchGym.OptionsRequest(date: gym.date, exercise: exercise, query: query).encoded() else { return [] }
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isReachable else { return [] }
        return await withCheckedContinuation { continuation in
            session.sendMessage([WatchGym.optionsKey: data], replyHandler: { reply in
                let list = (reply[WatchGym.optionsKey] as? Data).flatMap { try? JSONDecoder().decode([WatchGym.Option].self, from: $0) }
                continuation.resume(returning: list ?? [])
            }, errorHandler: { _ in
                continuation.resume(returning: [])
            })
        }
    }

    /// Weight or reps changed before the set is done.
    func edit(row: Int, kg: Double, reps: Int) {
        guard var gym else { return }
        gym.update(row: row) { $0.kg = kg; $0.reps = reps }
        self.gym = gym
        save()
    }

    private func save() {
        if let data = gym?.encoded() { UserDefaults.standard.set(data, forKey: Self.savedKey) }
    }
}

extension WatchGym {
    func lift(row: Int) -> Lift? {
        exercises.lazy.flatMap(\.lifts).first { $0.row == row }
    }

    mutating func update(row: Int, _ change: (inout Lift) -> Void) {
        for e in exercises.indices {
            if let l = exercises[e].lifts.firstIndex(where: { $0.row == row }) {
                change(&exercises[e].lifts[l])
                return
            }
        }
    }

    /// Where the set after `row` is: the next row of its exercise, else the
    /// first set not done of a later exercise, else of an earlier one.
    func next(after row: Int) -> (exercise: Int, lift: Lift, newExercise: Bool)? {
        guard let e = exercises.firstIndex(where: { $0.lifts.contains { $0.row == row } }),
              let l = exercises[e].lifts.firstIndex(where: { $0.row == row }) else { return nil }
        if let lift = exercises[e].lifts[(l + 1)...].first(where: { !$0.done }) {
            return (e, lift, false)
        }
        let order = Array(exercises.indices[(e + 1)...]) + Array(exercises.indices[..<e])
        for i in order {
            if let lift = exercises[i].lifts.first(where: { !$0.done }) { return (i, lift, true) }
        }
        return nil
    }

    /// The first set not done, from the top.
    var current: (exercise: Int, lift: Lift)? {
        for e in exercises.indices {
            if let lift = exercises[e].lifts.first(where: { !$0.done }) { return (e, lift) }
        }
        return nil
    }

    var started: Bool { exercises.contains { $0.lifts.contains(\.done) } }
    var allDone: Bool { current == nil }

    /// kg × reps of the work sets done.
    var volume: Double {
        exercises.flatMap(\.lifts).filter { $0.done && $0.work }.reduce(0) { $0 + ($1.kg ?? 0) * Double($1.reps ?? 0) }
    }

    var setsDone: Int { exercises.flatMap(\.lifts).filter { $0.done && !$0.warmup }.count }
}
