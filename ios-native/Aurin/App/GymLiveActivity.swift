import ActivityKit
import Foundation

/// The gym Live Activity (Shared/GymActivity.swift) from Posilovna naživo and
/// Režim tréninku: started with the first set to show, updated as sets and
/// rests change, ended when the screen closes or no set is left. The rest's
/// end is the activity's stale date, so the lock screen turns to the next set
/// on time even while the app sleeps.
@MainActor
enum GymLiveActivity {
    private static var activity: Activity<GymActivityAttributes>?
    private static var last: GymActivityAttributes.ContentState?
    private static var lastUpdate = Date.distantPast
    /// The user swiped the activity away: no new one until the workout ends.
    private static var dismissed = false

    /// The day as it is now. `focus` is the exercise on screen (Režim
    /// tréninku), else the first one with a set left. `quiet` (a new heart
    /// rate) updates at most every 15 s, to stay within iOS's budget.
    static func sync(day: GymDay?, focus: Int? = nil, restStart: Date?, restEnd: Date?, quiet: Bool = false) {
        guard let day, let state = state(day, focus: focus, restStart: restStart, restEnd: restEnd) else { end(); return }
        guard state != last else { return }
        // Swiped away on the lock screen: it stays away for this workout.
        if activity?.activityState == .dismissed { dismissed = true; activity = nil }
        guard !dismissed else { return }
        if quiet && Date().timeIntervalSince(lastUpdate) < 15 { return }
        last = state
        lastUpdate = Date()
        GymRestShared.set(state.restEnd)
        let content = ActivityContent(state: state, staleDate: state.restEnd)
        // Stale (the rest ran out on the lock screen) is still the same
        // activity: updated, never a second one under it.
        if let activity, activity.activityState == .active || activity.activityState == .stale {
            Task { await activity.update(content) }
            return
        }
        activity = nil
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        endOrphans()
        // The clock of the recording, the same as the screen's Čas.
        let attributes = GymActivityAttributes(startedAt: LiveWorkout.shared.clockStart ?? day.startedAt ?? Date(), labels: labels)
        activity = try? Activity.request(attributes: attributes, content: content)
    }

    static func end() {
        GymRestShared.set(nil)
        last = nil
        dismissed = false
        guard let current = activity else { return }
        activity = nil
        Task { await current.end(nil, dismissalPolicy: .immediate) }
    }

    /// Left from an app that closed mid-workout: no screen answers their buttons.
    static func endOrphans() {
        for other in Activity<GymActivityAttributes>.activities where other.id != activity?.id {
            Task { await other.end(nil, dismissalPolicy: .immediate) }
        }
    }

    static func state(_ day: GymDay, focus: Int?, restStart: Date?, restEnd: Date?, now: Date = Date()) -> GymActivityAttributes.ContentState? {
        let list = day.exercises
        let open = list.indices.filter { list[$0].sets.contains { !$0.done } }
        guard let first = open.first else { return nil }
        let index = focus.flatMap { open.contains($0) ? $0 : nil } ?? first
        let exercise = list[index]
        guard let set = exercise.sets.first(where: { !$0.done }) else { return nil }
        let following = open.first { $0 > index } ?? open.first { $0 != index }
        let then: String? = following.flatMap { i in list[i].sets.first { !$0.done }.map { list[i].name + " · " + load($0, in: list[i]) } }
        let resting = restEnd.map { $0 > now } ?? false
        let live = LiveWorkout.shared
        return .init(
            header: L10n.tr("Posilovna") + " · " + exercisesLine(index + 1, of: list.count),
            exercise: exercise.name,
            setLabel: set.warmup ? L10n.tr("rozcvička") : set.drop ? L10n.tr("dropset") : setLine(set, of: exercise.workCount),
            load: load(set, in: exercise),
            weight: loadParts(set, in: exercise).weight,
            reps: loadParts(set, in: exercise).reps,
            setShort: set.warmup || set.drop ? nil : "\(set.number)/\(exercise.workCount)",
            then: then,
            row: set.row,
            segments: list.map { e in e.sets.isEmpty ? 0 : Double(e.sets.filter(\.done).count) / Double(e.sets.count) },
            heartRate: live.running ? live.heartRate.map { Int($0.rounded()) } : nil,
            kcal: live.running ? live.kcal.map { Int($0.rounded()) } : nil,
            // The same rest keeps its start, so an unchanged state isn't sent again.
            restStart: resting ? (restStart ?? (last?.restEnd == restEnd ? last?.restStart : nil) ?? now) : nil,
            restEnd: resting ? restEnd : nil)
    }

    /// "80 kg × 8": what the set before was done with, else the plan.
    static func load(_ set: GymSet, in exercise: GymExercise) -> String {
        let parts = loadParts(set, in: exercise)
        return (parts.weight.map { $0 + " × " } ?? "") + (parts.reps ?? "")
    }

    /// "80 kg" and "8" of "80 kg × 8".
    static func loadParts(_ set: GymSet, in exercise: GymExercise) -> (weight: String?, reps: String?) {
        let carry = GymSessionMath.carried(set, in: exercise)
        let weight = LiftWeight.shown(carry?.kg ?? set.plannedKg ?? set.kg).map { $0 + " " + Units.weightUnit }
        return (weight, (carry?.reps ?? set.plannedReps ?? set.reps)?.nilIfBlank)
    }

    /// "3 z 5 cviků", "exercise 3 of 5".
    static func exercisesLine(_ n: Int, of total: Int) -> String {
        if L10n.isEnglish { return "exercise \(n) of \(total)" }
        return "\(n) \(preposition(total)) \(total) " + (total == 1 ? "cviku" : "cviků")
    }

    /// "série 3 ze 4" (by sides "série 2 ze 4 · L"), "set 3 of 4".
    static func setLine(_ set: GymSet, of total: Int) -> String {
        let side = set.side.map { " · " + $0 } ?? ""
        if L10n.isEnglish { return "set \(set.number) of \(total)" + side }
        return "série \(set.number) \(preposition(total)) \(total)" + side
    }

    /// "z" or "ze" before a number as it is read: ze dvou, ze tří, ze čtyř,
    /// ze sedmi, ze dvanácti…, ze dvaceti…; z pěti, z osmi, z jedenácti.
    static func preposition(_ n: Int) -> String {
        let lead = n < 10 || (10...19).contains(n) ? n : (n % 100) / 10
        return [2, 3, 4, 7, 12, 13, 14, 17].contains(lead) ? "ze" : "z"
    }

    private static var labels: GymActivityAttributes.Labels {
        .init(rest: L10n.tr("Pauza"),
              next: L10n.isEnglish ? "Next" : "Další",
              then: L10n.isEnglish ? "Then" : "Potom",
              plus: "+30 s",
              skipRest: L10n.tr("Přeskočit pauzu"),
              skip: L10n.tr("Přeskočit"),
              setDone: L10n.tr("Série hotová"))
    }
}
