import Foundation

// The order of the day's sets on the watch, shared with the iPhone's tests:
// the next set after one done (the other side, a drop set, a superset's
// partner), and the totals of the workout.

extension WatchGym {
    func lift(row: Int) -> Lift? {
        exercises.lazy.flatMap(\.lifts).first { $0.row == row }
    }

    /// A set done off its plan: the drop sets straight after it, not done
    /// yet, take the same share, to 0.5 kg (as GymDay.followDrops in the sheet).
    mutating func followDrops(after row: Int, from old: Double?, to new: Double) {
        guard let old, old > 0, new > 0, abs(new - old) >= 0.01,
              let e = exercises.firstIndex(where: { $0.lifts.contains { $0.row == row } }),
              let l = exercises[e].lifts.firstIndex(where: { $0.row == row }) else { return }
        for i in exercises[e].lifts.indices.dropFirst(l + 1) {
            guard exercises[e].lifts[i].drop else { break }
            if !exercises[e].lifts[i].done, let kg = exercises[e].lifts[i].kg, kg > 0 {
                exercises[e].lifts[i].kg = (kg * new / old * 2).rounded() / 2
            }
        }
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
    /// The other side of the same set first; a superset goes round by round
    /// (Training mode on the iPhone, TrainingModeView.supersetTurn).
    func next(after row: Int) -> (exercise: Int, lift: Lift, newExercise: Bool, turn: Turn?)? {
        guard let e = exercises.firstIndex(where: { $0.lifts.contains { $0.row == row } }),
              let l = exercises[e].lifts.firstIndex(where: { $0.row == row }) else { return nil }
        let lift = exercises[e].lifts[l]
        if let other = otherSide(of: lift, in: e) { return (e, other, false, nil) }
        let following = exercises[e].lifts[(l + 1)...].first(where: { !$0.done })
        // Into a drop set straight on; else in a superset the partner comes next.
        if !lift.warmup, following?.drop != true, let turn = supersetTurn(from: e, after: row) { return turn }
        if let following { return (e, following, false, nil) }
        let order = Array(exercises.indices[(e + 1)...]) + Array(exercises.indices[..<e])
        for i in order {
            if let lift = exercises[i].lifts.first(where: { !$0.done }) { return (i, lift, true, nil) }
        }
        return nil
    }

    /// How a superset goes on: its partner straight after (no rest), or back to
    /// the first one after a round (the set's rest).
    enum Turn: Equatable { case partner, round }

    /// The next exercise of the superset with sets left after the set `row`
    /// (done or about to be), nil outside one or when all of it is done (then
    /// the exercise after it, as without one).
    private func supersetTurn(from e: Int, after row: Int) -> (exercise: Int, lift: Lift, newExercise: Bool, turn: Turn?)? {
        guard let letter = exercises[e].superset else { return nil }
        let group = exercises.indices.filter { exercises[$0].superset == letter }
        guard group.count > 1, let pos = group.firstIndex(of: e) else { return nil }
        let left = { (i: Int) in exercises[i].lifts.first { !$0.done && $0.row != row } }
        guard let target = (1...group.count).map({ group[(pos + $0) % group.count] }).first(where: { left($0) != nil }),
              let lift = left(target) else { return nil }
        return (target, lift, target != e, target > e ? .partner : .round)
    }

    /// The other side (left or right) of the same set, not done yet.
    func otherSide(of lift: Lift, in e: Int) -> Lift? {
        guard lift.side != nil, exercises.indices.contains(e) else { return nil }
        return exercises[e].lifts.first {
            !$0.done && $0.number == lift.number && $0.side != nil && $0.side != lift.side && $0.warmup == lift.warmup && $0.drop == lift.drop
        }
    }

    /// The next set of the same exercise not done yet (its other side first):
    /// it starts from the weight of the one before, as on the iPhone.
    func nextInExercise(after row: Int) -> Lift? {
        guard let e = exercises.firstIndex(where: { $0.lifts.contains { $0.row == row } }),
              let l = exercises[e].lifts.firstIndex(where: { $0.row == row }) else { return nil }
        return otherSide(of: exercises[e].lifts[l], in: e) ?? exercises[e].lifts[(l + 1)...].first { !$0.done }
    }

    /// The exercises of a superset (their places), nil outside one.
    func superset(of e: Int) -> [Int]? {
        guard exercises.indices.contains(e), let letter = exercises[e].superset else { return nil }
        let group = exercises.indices.filter { exercises[$0].superset == letter }
        return group.count > 1 ? group : nil
    }

    /// The first set not done, from the top.
    var current: (exercise: Int, lift: Lift)? {
        for e in exercises.indices {
            if let lift = exercises[e].lifts.first(where: { !$0.done }) { return (e, lift) }
        }
        return nil
    }

    var started: Bool { exercises.contains { $0.lifts.contains(where: \.done) } }
    /// Every set done; an empty workout (no exercise yet) is not done.
    var allDone: Bool { !exercises.isEmpty && current == nil }

    /// kg × reps of the work sets done.
    var volume: Double {
        exercises.flatMap(\.lifts).filter { $0.done && $0.work }.reduce(0) { $0 + ($1.kg ?? 0) * Double($1.reps ?? 0) }
    }

    var setsDone: Int { exercises.flatMap(\.lifts).filter { $0.done && !$0.warmup }.count }
    /// Sets still to do (not the warm-up): "4 sets left" on a summary reached by End workout.
    var setsLeft: Int { exercises.flatMap(\.lifts).filter { !$0.done && !$0.warmup }.count }
}

extension WatchGym {
    struct NewRecord: Equatable, Identifiable {
        let name: String
        let title: String
        let set: Last
        var id: String { name }
    }

    /// The exercises whose best work set today beats their best before today,
    /// with that set (the summary's PR lines, Training mode's Nový rekord);
    /// a first time is no record.
    var newRecords: [NewRecord] {
        exercises.compactMap { e in
            guard let old = e.record, old.e1rm > 0 else { return nil }
            let done = e.lifts.filter { $0.done && $0.work }.compactMap { lift in lift.reps.map { Last(kg: lift.kg, reps: $0) } }
            guard let best = done.max(by: { $0.e1rm < $1.e1rm }), best.e1rm > old.e1rm + 0.01 else { return nil }
            return NewRecord(name: e.name, title: e.title, set: best)
        }
    }

    /// The note, the record and last time's sets of a plan built again from
    /// the sheet alone (a change on the watch, the server's copy): kept from
    /// the plan before, which had them from the iPhone.
    mutating func keepInfo(from old: WatchGym) {
        for e in exercises.indices {
            guard let before = old.exercises.first(where: { $0.name == exercises[e].name }) else { continue }
            if exercises[e].note == nil { exercises[e].note = before.note }
            if exercises[e].record == nil { exercises[e].record = before.record }
            for l in exercises[e].lifts.indices where exercises[e].lifts[l].last == nil {
                let lift = exercises[e].lifts[l]
                exercises[e].lifts[l].last = before.lifts.first {
                    $0.number == lift.number && $0.side == lift.side && $0.warmup == lift.warmup && $0.drop == lift.drop
                }?.last
            }
        }
    }
}
