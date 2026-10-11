import Foundation

// MARK: - History (GET /app/api/gym/history, src/strength-history.js strengthSessions)

/// The work sets of the last months by exercise and day, newest day first:
/// "minule 82,5 kg × 6", an exercise's history and the next suggested load.
struct GymHistory: Codable, Equatable {
    var exercises: [Exercise]

    struct Exercise: Codable, Equatable, Identifiable {
        let name: String
        let sessions: [Session]
        var id: String { name }
    }

    struct Session: Codable, Equatable, Identifiable {
        let date: String
        let sets: [Lift]
        var id: String { date }
    }

    /// One work set: kg (nil with body weight), reps, and the planned reps'
    /// lower end when there was a plan.
    struct Lift: Codable, Equatable {
        let kg: Double?
        let reps: Double?
        let target: Double?
        let rpe: Double?
    }

    static let empty = GymHistory(exercises: [])

    func exercise(_ name: String) -> Exercise? {
        exercises.first { $0.name == name }
    }

    /// The exercise's last session before the day.
    func last(_ name: String, before date: String) -> Session? {
        exercise(name)?.sessions.first { $0.date < date }
    }

    /// The exercises of the last workout before the day, in its order
    /// ("Zopakovat minulou").
    func lastWorkout(before date: String) -> [String] {
        let days: [String] = exercises.compactMap { (e: Exercise) -> String? in e.sessions.first { $0.date < date }?.date }
        guard let latest = days.max() else { return [] }
        return exercises.filter { (e: Exercise) -> Bool in e.sessions.first { $0.date < date }?.date == latest }.map(\.name)
    }

    /// Exercises done before the day, the most recent first (the search sheet).
    func recent(before date: String) -> [Exercise] {
        exercises.filter { (e: Exercise) -> Bool in e.sessions.contains { $0.date < date } }
    }
}

extension APIClient {
    func gymHistory(days: Int = 180) async throws -> GymHistory {
        try await get("/app/api/gym/history?days=\(days)")
    }

    /// Calories of a flagged session: "estimate" (count the estimate), "device"
    /// (keep the watch's number) or nil (back to the automatic choice).
    func setEnergyChoice(activityId: String, date: String, choice: String?) async throws {
        let value: JSONValue = choice.map { JSONValue.string($0) } ?? JSONValue.null
        let body: JSONObject = ["activityId": .string(activityId), "date": .string(date), "choice": value]
        let _: JSONValue = try await send("/app/api/training/energy", method: "POST", body: body)
    }
}

/// The last history seen on the phone, so the suggestions work without signal.
/// Signing out deletes it.
enum GymHistoryCache {
    private static var url: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "gym-history.json")
    }

    static func save(_ history: GymHistory) {
        try? JSONEncoder().encode(history).write(to: url, options: .atomic)
    }

    static func load() -> GymHistory? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(GymHistory.self, from: data)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: url)
    }
}

extension AppModel {
    /// The server's history, else the one saved on the phone.
    func gymHistory() async -> GymHistory {
        if demo { return DemoGymHistory.history }
        do {
            let history = try await api.gymHistory()
            GymHistoryCache.save(history)
            return history
        } catch {
            return GymHistoryCache.load() ?? GymHistory.empty
        }
    }

    /// The day's lifting session that was done (the watch or Intervals.icu):
    /// its length and calories for the gym detail.
    func doneStrengthSession(on date: String) -> WeekSession? {
        let pick: (WeekSession) -> Bool = { $0.date == date && $0.sport == "strength" && $0.status == "done" && $0.kind == "activity" }
        if let found = training?.sessions?.first(where: pick) { return found }
        if let found = today?.plan.compactMap({ $0.session }).first(where: pick) { return found }
        if let day = calendar[date], let found = day.activities.first(where: { $0.sport == "strength" && $0.status == "done" }) { return found.session }
        return nil
    }
}

/// A few sessions for the sample data, so the suggestions show something.
enum DemoGymHistory {
    static let history = GymHistory(exercises: [
        GymHistory.Exercise(name: "Barbell bench press", sessions: [
            GymHistory.Session(date: "2026-10-05", sets: [lift(80, 8, 6), lift(80, 8, 6), lift(82.5, 6, 6), lift(82.5, 6, 6)]),
            GymHistory.Session(date: "2026-10-01", sets: [lift(80, 8, 8), lift(80, 8, 8), lift(80, 7, 8), lift(80, 6, 8)]),
            GymHistory.Session(date: "2026-09-28", sets: [lift(77.5, 8, 8), lift(77.5, 8, 8), lift(80, 6, 8)])
        ]),
        GymHistory.Exercise(name: "One-arm DB row", sessions: [
            GymHistory.Session(date: "2026-10-05", sets: [lift(30, 10, 10), lift(30, 10, 10), lift(32.5, 8, 10)])
        ])
    ])

    private static func lift(_ kg: Double, _ reps: Double, _ target: Double) -> GymHistory.Lift {
        GymHistory.Lift(kg: kg, reps: reps, target: target, rpe: nil)
    }
}

// MARK: - Coach

/// The suggested sets of an exercise: warm-ups ("R") and work sets.
struct GymSuggestion: Equatable {
    struct Planned: Equatable {
        let kg: Double?
        let reps: Int
    }

    var warmups: [Planned]
    var work: [Planned]
    var line: String
}

/// Push, pull, legs or core: what the next exercise balances.
enum GymGroup: String {
    case push, pull, legs, core

    var label: String {
        switch self {
        case .push: return L10n.tr("tlaky")
        case .pull: return L10n.tr("záda")
        case .legs: return L10n.tr("nohy")
        case .core: return L10n.tr("střed těla")
        }
    }
}

struct GymNextPick: Identifiable, Equatable {
    let name: String
    let suggestion: GymSuggestion
    var id: String { name }
}

/// Simple progression from the stored history, on the phone: all work sets
/// at the target reps last time → +2.5 kg; otherwise the same weight again.
/// A set short of its reps takes 2.5 kg off the next one.
enum GymCoach {
    static let step = 2.5

    static func roundLoad(_ kg: Double) -> Double {
        max(0, (kg / step).rounded() * step)
    }

    /// The sheet's kg text: "85", "82.5".
    static func kgText(_ kg: Double) -> String {
        let r = (kg * 100).rounded() / 100
        return r.rounded() == r ? String(Int(r)) : String(r)
    }

    /// kg as shown in the chosen unit: "82,5".
    static func shown(_ kg: Double) -> String {
        LiftWeight.shown(kgText(kg)) ?? kgText(kg)
    }

    static func firstNumber(_ text: String?) -> Int? {
        guard let text else { return nil }
        let digits = text.trimmingCharacters(in: .whitespaces).prefix { $0.isNumber }
        return digits.isEmpty ? nil : Int(String(digits))
    }

    static func firstNumber(_ value: JSONValue?) -> Int? {
        if let n = value?.number { return Int(n) }
        return firstNumber(value?.string)
    }

    static func topKg(_ session: GymHistory.Session) -> Double? {
        session.sets.compactMap { $0.kg }.filter { $0 > 0 }.max()
    }

    /// The reps the sets aimed at: the plan's, else the first set's.
    static func target(_ session: GymHistory.Session) -> Int {
        if let t = session.sets.compactMap({ $0.target }).min(), t > 0 { return Int(t) }
        return Int(session.sets.first?.reps ?? 8)
    }

    static func allHit(_ session: GymHistory.Session) -> Bool {
        let t = target(session)
        return !session.sets.isEmpty && session.sets.allSatisfy { Int($0.reps ?? 0) >= t }
    }

    static func repsList(_ session: GymHistory.Session) -> String {
        session.sets.map { String(Int($0.reps ?? 0)) }.joined(separator: ", ")
    }

    /// "minule 82,5 kg × 6": the heaviest set of the last session.
    static func lastText(_ session: GymHistory.Session) -> String {
        if let top = topKg(session) {
            let reps = session.sets.first { $0.kg == top }?.reps ?? 0
            return L10n.f("minule %@ %@ × %@", shown(top), Units.weightUnit, String(Int(reps)))
        }
        return L10n.f("minule %@ opakování", repsList(session))
    }

    /// "80×8 · 80×8 · 82,5×6".
    static func setsLine(_ lifts: [GymHistory.Lift]) -> String {
        lifts.map { (lift: GymHistory.Lift) -> String in
            let reps = String(Int(lift.reps ?? 0))
            if let kg = lift.kg, kg > 0 { return shown(kg) + "×" + reps }
            return reps
        }.joined(separator: " · ")
    }

    /// The done work sets of an exercise as one line.
    static func setsLine(_ sets: [GymSet]) -> String {
        setsLine(sets.filter { $0.done && !$0.warmup }.map { lift($0) })
    }

    static func lift(_ set: GymSet) -> GymHistory.Lift {
        GymHistory.Lift(kg: set.kg.flatMap(LiftWeight.number), reps: set.reps.flatMap(LiftWeight.number),
                        target: firstNumber(set.plannedReps).map { Double($0) }, rpe: set.rpe.flatMap(LiftWeight.number))
    }

    /// Warm-ups before a work weight: half for 10, then 70 % for 5.
    static func warmups(for kg: Double) -> [GymSuggestion.Planned] {
        if kg >= 40 {
            return [GymSuggestion.Planned(kg: roundLoad(kg * 0.5), reps: 10), GymSuggestion.Planned(kg: roundLoad(kg * 0.7), reps: 5)]
        }
        if kg >= 20 { return [GymSuggestion.Planned(kg: roundLoad(kg * 0.5), reps: 10)] }
        return []
    }

    static func suggest(_ name: String, history: GymHistory, before date: String, catalog: GymCatalogExercise?) -> GymSuggestion {
        guard let last = history.last(name, before: date), !last.sets.isEmpty else {
            let reps = firstNumber(catalog?.reps) ?? 10
            let sets = min(max(firstNumber(catalog?.sets) ?? 3, 1), 5)
            let work = Array(repeating: GymSuggestion.Planned(kg: nil, reps: reps), count: sets)
            return GymSuggestion(warmups: [], work: work,
                                 line: L10n.f("Tenhle cvik tu ještě nemáš. Začni lehčí váhou a najdi, co dáš na %@ opakování.", String(reps)))
        }
        let goal = Self.target(last), hit = Self.allHit(last)
        let count = min(max(last.sets.count, 2), 5)
        if let top = Self.topKg(last) {
            let next = hit ? top + step : top
            let work = Array(repeating: GymSuggestion.Planned(kg: next, reps: goal), count: count)
            let line = hit
                ? L10n.f("Minule %@ × %@ a šlo to. Dnes zkus %@ %@.", shown(top), repsList(last), shown(next), Units.weightUnit)
                : L10n.f("Minule %@ × %@. Dnes zůstaň na %@ %@ a dotáhni všechna opakování.", shown(top), repsList(last), shown(next), Units.weightUnit)
            return GymSuggestion(warmups: warmups(for: next), work: work, line: line)
        }
        let reps = hit ? goal + 1 : goal
        let work = Array(repeating: GymSuggestion.Planned(kg: nil, reps: reps), count: count)
        let line = hit
            ? L10n.f("Minule %@ opakování a šlo to. Dnes zkus o jedno víc.", repsList(last))
            : L10n.f("Minule %@ opakování. Dnes je zkus dotáhnout.", repsList(last))
        return GymSuggestion(warmups: [], work: work, line: line)
    }

    /// "návrh 72,5 kg × 8, 3 série".
    static func proposal(_ s: GymSuggestion) -> String {
        guard let first = s.work.first else { return "" }
        let sets = String(s.work.count) + " " + Fmt.plural(s.work.count, "série", "série", "sérií")
        if let kg = first.kg {
            return L10n.f("návrh %@ %@ × %@, %@", shown(kg), Units.weightUnit, String(first.reps), sets)
        }
        return L10n.f("návrh %@ opakování, %@", String(first.reps), sets)
    }

    // MARK: Balance

    static func group(_ map: [String: Double]?) -> GymGroup? {
        guard let map, let top = map.max(by: { $0.value < $1.value })?.key else { return nil }
        switch top {
        case "chest", "front_delts", "side_delts", "triceps": return .push
        case "upper_back", "lats", "rear_delts", "biceps", "traps", "forearms", "lower_back": return .pull
        case "quads", "hamstrings", "hips", "calves": return .legs
        case "abs", "obliques": return .core
        default: return nil
        }
    }

    private static func topMuscle(_ map: [String: Double]?) -> String? {
        map?.max(by: { $0.value < $1.value })?.key
    }

    private static func muscles(_ name: String, catalog: [GymCatalogExercise], known: [String: [String: Double]]) -> [String: Double]? {
        known[name] ?? catalog.first { $0.name == name }?.muscles
    }

    /// The next exercise after the ones done: the group done least (pull after
    /// push, push after pull, then legs), a muscle not worked yet, exercises
    /// with a history first, the big lifts before the small ones.
    static func nextPicks(done names: [String], catalog: [GymCatalogExercise], history: GymHistory, date: String,
                          known: [String: [String: Double]] = [:]) -> (line: String?, picks: [GymNextPick]) {
        let groups: [GymGroup] = names.compactMap { group(muscles($0, catalog: catalog, known: known)) }
        let lastGroup: GymGroup? = names.last.flatMap { group(muscles($0, catalog: catalog, known: known)) }
        let worked = Set(names.compactMap { topMuscle(muscles($0, catalog: catalog, known: known)) })
        var order: [GymGroup] = [.push, .pull, .legs]
        if names.count >= 4 { order.append(.core) }
        let count: (GymGroup) -> Int = { g in groups.filter { $0 == g }.count }
        let priority: (GymGroup) -> Int = { g in
            if let lastGroup {
                if (lastGroup == .push && g == .pull) || (lastGroup == .pull && g == .push) { return 0 }
                if g == lastGroup { return 3 }
            }
            return g == .legs ? 1 : 2
        }
        order.sort { a, b in
            let ca = count(a), cb = count(b)
            if ca != cb { return ca < cb }
            return priority(a) < priority(b)
        }
        let candidates: [GymCatalogExercise] = catalog.filter { ex in
            !names.contains(ex.name) && ex.fits != false && ex.liked != false
        }
        let rank: (GymCatalogExercise, GymCatalogExercise) -> Bool = { a, b in
            let ha = history.last(a.name, before: date) != nil, hb = history.last(b.name, before: date) != nil
            if ha != hb { return ha }
            let wa = worked.contains(topMuscle(a.muscles) ?? ""), wb = worked.contains(topMuscle(b.muscles) ?? "")
            if wa != wb { return !wa }
            return (a.fatigue ?? 0.6) > (b.fatigue ?? 0.6)
        }
        // Two from the group the workout needs most, the rest from the others.
        var chosen: [GymCatalogExercise] = []
        for (index, g) in order.enumerated() {
            let quota = index == 0 ? 2 : 3
            let inGroup = candidates.filter { group($0.muscles) == g }.sorted(by: rank)
            for ex in inGroup.prefix(quota) where chosen.count < 3 && !chosen.contains(ex) { chosen.append(ex) }
        }
        let picks = chosen.map { ex in GymNextPick(name: ex.name, suggestion: suggest(ex.name, history: history, before: date, catalog: ex)) }
        var line: String? = nil
        if let lastName = names.last, let wanted = order.first, let lastGroup, wanted != lastGroup {
            line = L10n.f("Po cviku %@ se hodí %@, ať je to vyrovnané.", lastName, wanted.label)
        }
        return (line, picks)
    }

    /// "Horní část těla", "Spodní část těla" or "Celé tělo".
    static func title(_ names: [String], catalog: [GymCatalogExercise], known: [String: [String: Double]] = [:]) -> String {
        let groups = Set(names.compactMap { group(muscles($0, catalog: catalog, known: known)) }.filter { $0 != .core })
        if groups.isEmpty { return L10n.tr("Silový trénink") }
        if !groups.contains(.legs) { return L10n.tr("Horní část těla") }
        if groups.count == 1 { return L10n.tr("Spodní část těla") }
        return L10n.tr("Celé tělo")
    }

    /// The summary's line: the first exercise against last time, and what to
    /// try next time.
    static func summaryLine(_ day: GymDay, history: GymHistory, date: String) -> String {
        for exercise in day.exercises {
            let done = exercise.sets.filter { $0.done && !$0.warmup }
            let kgs: [Double] = done.compactMap { $0.kg.flatMap(LiftWeight.number) }
            guard let now = kgs.max(), now > 0, let last = history.last(exercise.name, before: date), let before = topKg(last) else { continue }
            let goal = done.compactMap { firstNumber($0.plannedReps) }.min() ?? Self.target(last)
            let reps: [Int] = done.compactMap { $0.reps.flatMap(LiftWeight.number).map { Int($0) } }
            let hitAll = !reps.isEmpty && reps.allSatisfy { $0 >= goal }
            let delta = now - before
            let first: String
            if delta > 0.01 {
                first = L10n.f("%@ +%@ %@ proti minule.", exercise.name, shown(delta), Units.weightUnit)
            } else if delta < -0.01 {
                first = L10n.f("%@ o %@ %@ lehčí než minule.", exercise.name, shown(-delta), Units.weightUnit)
            } else {
                first = L10n.f("%@ stejně jako minule.", exercise.name)
            }
            let next = hitAll
                ? L10n.f("Příště zkus %@ %@.", shown(now + step), Units.weightUnit)
                : L10n.f("Příště zkus %@ × %@ ve všech sériích.", shown(now), String(goal))
            return first + " " + next
        }
        return L10n.tr("První zapsaný trénink těchhle cviků. Příště podle něj navrhnu váhy.")
    }

    // MARK: Exercise history

    /// Epley: kg × (1 + reps / 30), the best set of the history.
    static func oneRepMax(_ exercise: GymHistory.Exercise) -> Double? {
        let values: [Double] = exercise.sessions.flatMap { $0.sets }.compactMap { lift in
            guard let kg = lift.kg, kg > 0, let reps = lift.reps, reps > 0 else { return nil }
            return reps == 1 ? kg : kg * (1 + reps / 30)
        }
        guard let best = values.max() else { return nil }
        return (best * 2).rounded() / 2
    }

    static func best(_ exercise: GymHistory.Exercise) -> Double? {
        exercise.sessions.compactMap(topKg).max()
    }

    /// The heaviest set now against the first session of the last 3 months.
    static func change(_ exercise: GymHistory.Exercise, today: String) -> Double? {
        let since = ISODay.shift(today, -91)
        let recent = exercise.sessions.filter { $0.date >= since }
        guard recent.count >= 2, let now = recent.first.flatMap(topKg), let then = recent.last.flatMap(topKg) else { return nil }
        return now - then
    }

    /// Clock of a workout: "1:02" h, or "52" min under an hour.
    static func clock(_ minutes: Int) -> (value: String, unit: String) {
        if minutes < 60 { return (String(minutes), "min") }
        return (String(minutes / 60) + ":" + String(format: "%02d", minutes % 60), "h")
    }
}

// MARK: - The gym sheet for a logged workout

extension GymDay {
    /// Row 5 of the header: "Odcvičeno", start and end (ISO 8601).
    static let timeRow = 5

    private static let iso: ISO8601DateFormatter = ISO8601DateFormatter()

    private func text(_ row: Int, _ column: Int) -> String? {
        guard row < values.count, column < values[row].count else { return nil }
        return values[row][column].string
    }

    /// The header rows, the date and the column names, for a day without a plan.
    mutating func ensureHeader(date: String) {
        while values.count < Self.firstSetRow { values.append([]) }
        if text(2, 0) == nil {
            set(row: 2, column: 0, "Datum")
            set(row: 2, column: 1, date)
        }
        if values[6].count < Self.columns.count { values[6] = Self.columns.map { JSONValue.string($0) } }
    }

    mutating func setName(_ name: String) {
        guard values.count > 2 else { return }
        set(row: 2, column: 3, name)
    }

    var startedAt: Date? { text(Self.timeRow, 1).flatMap { Self.iso.date(from: $0) } }
    var finishedAt: Date? { text(Self.timeRow, 2).flatMap { Self.iso.date(from: $0) } }

    mutating func markStarted(_ date: Date) {
        guard values.count > Self.timeRow else { return }
        set(row: Self.timeRow, column: 0, "Odcvičeno")
        set(row: Self.timeRow, column: 1, Self.iso.string(from: date))
    }

    mutating func markFinished(_ date: Date) {
        guard values.count > Self.timeRow else { return }
        set(row: Self.timeRow, column: 0, "Odcvičeno")
        set(row: Self.timeRow, column: 2, Self.iso.string(from: date))
    }

    /// Minutes from the start to the end of a workout logged in the app.
    var loggedMinutes: Int? {
        guard let start = startedAt, let end = finishedAt, end > start else { return nil }
        return Int((end.timeIntervalSince(start) / 60).rounded())
    }

    /// kg × reps of the done work sets.
    var volume: Double {
        exercises.flatMap { $0.sets }.filter { $0.done && !$0.warmup }.reduce(0.0) { sum, s in
            sum + (s.kg.flatMap(LiftWeight.number) ?? 0) * (s.reps.flatMap(LiftWeight.number) ?? 0)
        }
    }

    var doneWorkSets: Int {
        exercises.reduce(0) { $0 + $1.doneCount }
    }

    /// An exercise's suggested sets after the others: warm-ups ("R") first.
    mutating func appendExercise(_ name: String, suggestion: GymSuggestion) {
        while values.count > Self.firstSetRow, let last = values.last, last.allSatisfy({ $0.string == nil }) { values.removeLast() }
        while values.count < Self.firstSetRow { values.append([]) }
        func row(_ type: String, _ number: String, _ planned: GymSuggestion.Planned) -> [JSONValue] {
            let kg = planned.kg.map { GymCoach.kgText($0) } ?? ""
            return [type, name, number, kg, String(planned.reps), "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        }
        for planned in suggestion.warmups { values.append(row("WARMUP", "", planned)) }
        for (i, planned) in suggestion.work.enumerated() { values.append(row("WORK", String(i + 1), planned)) }
    }

    /// Only what was done stays: the sets not ticked go.
    mutating func dropUndone() {
        var kept = Array(values.prefix(Self.firstSetRow))
        for index in values.indices where index >= Self.firstSetRow {
            let row = values[index]
            guard row.count > 1, row[1].string != nil else { continue }
            if row.count > 8, Self.isDone(row[8].string) { kept.append(row) }
        }
        values = kept
    }

    /// A set's weight and reps changed after it was done.
    mutating func edit(row: Int, kg: String, reps: String) {
        set(row: row, column: 5, kg)
        set(row: row, column: 6, reps)
    }

    /// One set out of the sheet (a set that was never done).
    mutating func removeRow(_ row: Int) {
        guard row >= Self.firstSetRow, row < values.count else { return }
        values.remove(at: row)
    }

    /// One more work set for the exercise whose sets include `row`, like its last one.
    mutating func addSet(after row: Int) {
        guard let exercise = exercises.first(where: { $0.sets.contains { $0.row == row } }), let last = exercise.sets.last else { return }
        let work = exercise.sets.filter { !$0.warmup }
        let template = work.last ?? last
        let kg = template.kg ?? template.plannedKg ?? ""
        let reps = template.reps ?? template.plannedReps ?? ""
        let new: [JSONValue] = ["WORK", exercise.name, String(work.count + 1), kg, reps, "", "", "", "FALSE", "", "", "FALSE", exercise.superset ?? ""].map { JSONValue.string($0) }
        values.insert(new, at: last.row + 1)
    }
}
