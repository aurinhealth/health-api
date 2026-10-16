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

    /// The day as it is now. `focus` is the exercise on screen (Režim
    /// tréninku), else the first one with a set left. `quiet` (a new heart
    /// rate) updates at most every 15 s, to stay within iOS's budget.
    static func sync(day: GymDay?, focus: Int? = nil, restStart: Date?, restEnd: Date?, quiet: Bool = false) {
        guard let day, let state = state(day, focus: focus, restStart: restStart, restEnd: restEnd) else { end(); return }
        guard state != last else { return }
        if quiet && Date().timeIntervalSince(lastUpdate) < 15 { return }
        last = state
        lastUpdate = Date()
        let content = ActivityContent(state: state, staleDate: state.restEnd)
        if let activity, activity.activityState == .active {
            Task { await activity.update(content) }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        endOrphans()
        let attributes = GymActivityAttributes(startedAt: day.startedAt ?? Date(), labels: labels)
        activity = try? Activity.request(attributes: attributes, content: content)
    }

    static func end() {
        last = nil
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
        let then: String? = following.flatMap { i in list[i].sets.first { !$0.done }.map { list[i].name + " · " + load($0) } }
        let resting = restEnd.map { $0 > now } ?? false
        let live = LiveWorkout.shared
        return .init(
            header: L10n.tr("Posilovna") + " · " + exercisesLine(index + 1, of: list.count),
            exercise: exercise.name,
            setLabel: set.warmup ? L10n.tr("rozcvička") : setLine(set, of: exercise.workCount),
            load: load(set),
            then: then,
            row: set.row,
            segments: list.map { e in e.sets.isEmpty ? 0 : Double(e.sets.filter(\.done).count) / Double(e.sets.count) },
            heartRate: live.running ? live.heartRate.map { Int($0.rounded()) } : nil,
            kcal: live.running ? live.kcal.map { Int($0.rounded()) } : nil,
            // The same rest keeps its start, so an unchanged state isn't sent again.
            restStart: resting ? (restStart ?? (last?.restEnd == restEnd ? last?.restStart : nil) ?? now) : nil,
            restEnd: resting ? restEnd : nil)
    }

    /// "80 kg × 8".
    static func load(_ set: GymSet) -> String {
        let weight: String = LiftWeight.shown(set.plannedKg ?? set.kg).map { $0 + " " + Units.weightUnit + " × " } ?? ""
        return weight + (set.plannedReps ?? set.reps ?? "")
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
