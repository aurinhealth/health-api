import SwiftUI

// One workout of the week before it goes to the calendar (WeekPlanGenerator,
// "Add workout" on Week plan): what it should be and the workout built for it.

private func sportLabel(_ sport: String) -> String {
    ["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "strength": "Posilovna", "walk": "Chůze", "swim": "Plavání", "stretch": "Protažení", "brick": "Brick"][sport].map { L10n.tr($0) } ?? Fmt.capitalized(sport)
}

/// The session kinds of src/week-ai.js KINDS.
private func kindLabel(_ kind: String?) -> String? {
    guard let kind else { return nil }
    return ["recovery": "Lehce / regenerace", "endurance": "Vytrvalost", "long": "Dlouhý trénink", "tempo": "Tempo",
            "sweet_spot": "Sweet spot", "threshold": "Práh", "vo2max": "VO₂max", "gym": "Posilovna"][kind].map { L10n.tr($0) }
}

/// One session of the week before it goes to the calendar: what it should be,
/// and the workout built for it.
struct WeekSessionDraft: Identifiable, Equatable {
    enum Status: Equatable { case waiting, building, ready, saved, failed(String) }

    let id = UUID()
    var date: String
    var sport: String
    var minutes: Int
    /// "outdoor" or "indoor"; nil for the gym.
    var environment: String?
    /// src/week-ai.js KINDS, when the AI or a change chose it.
    var kind: String?
    /// The generator's focus (FOCUS_OF), nil when the week plan's role decides.
    var focus: String?
    var label: String?
    var reason: String?
    var role: String?
    /// What the AI changed, in its words.
    var note: String?
    /// "Přepočteno": the session changed when another one was removed;
    /// `previous` is what it was before, when the day had one of this sport.
    var recalculated = false
    var previous: String?
    /// The athlete changed it with "Upravit s AI": the asked kind passes the
    /// coach's load rules (48 h, two quality days…); red and illness still hold.
    var insisted = false
    /// The week's brick: a run straight after the day's ride, saved joined to it.
    var brick = false
    /// The time of day it goes to the calendar with ("HH:MM"); nil is any time.
    var time: String? = nil
    var workout: LibraryWorkout?
    var gym: GymProposal?
    var status: Status = .waiting
    /// The calendar event once saved ("planned:…"), for joining the next race leg to it on a retry.
    var eventId: String? = nil

    var built: Bool { status == .ready || status == .saved }

    var title: String {
        if let gym { return gym.planName }
        return workout?.name ?? label ?? kindLabel(kind) ?? sportLabel(sport)
    }

    /// "Vytrvalost, 2 h", as the row shows what the session was before a recalculation.
    var line: String { title + ", " + Fmt.duration(minutes) }

    /// The lengths the detail offers (src/week-planner.js SESSION_MINUTES).
    static func lengths(_ sport: String, including current: Int) -> [Int] {
        let list = ["gym": [30, 45, 60, 75, 90], "run": [20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360],
                    "swim": [20, 30, 45, 60, 75, 90]][sport]
            ?? [30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 420, 480]
        return list.contains(current) ? list : (list + [current]).sorted()
    }

    /// Builds the workout: a gym plan as a draft, a ride or run from the
    /// library. `resize` keeps the workout and only changes its length.
    /// `others`: the week's other sessions, so gym days follow on from each other.
    func building(_ api: APIClient, resize: Bool = false, others: [WeekSessionDraft] = []) async -> WeekSessionDraft {
        var next = self
        do {
            if sport == "gym" {
                let gymDays = others.filter { $0.sport == "gym" && $0.date != date }
                next.gym = try await api.previewGym(date: date, minutes: minutes, focus: role == "gym_upper" ? "upper" : nil, muscles: [], fromWeek: true,
                                                    gymDays: gymDays.map(\.date),
                                                    weekSessions: gymDays.compactMap { s in s.gym.map { (date: s.date, rows: $0.rows) } })
            } else {
                let r = try await api.generateWeekSession(date: date, sport: sport, minutes: minutes, environment: environment, focus: focus,
                                                          insisted: insisted, resize: resize ? workout?.id : nil)
                guard let w = r.workout else { throw APIError.message(r.message ?? L10n.tr("Bez návrhu.")) }
                next.workout = w
                // The coach still eased the kind (red, illness…): the pill and the
                // note say what the steps are, not what was asked.
                if let eased = r.eased {
                    next.kind = eased.kind
                    next.focus = eased.focus
                    next.label = kindLabel(eased.kind)
                    next.note = eased.why.map { L10n.f("Kouč nechal trénink lehčí: %@.", $0) } ?? L10n.tr("Kouč nechal trénink lehčí.")
                }
            }
            next.status = .ready
        } catch {
            next.status = .failed(error.localizedDescription)
        }
        return next
    }
}
