import Foundation
import WatchConnectivity

extension Notification.Name {
    /// The watch changed the day's gym (a set done, a set or an exercise added,
    /// removed or swapped): Training mode takes the new sheet (object: WatchBridge.GymChange).
    static let watchGym = Notification.Name("watchGym")
    /// The watch started, moved or ended the rest (object: WatchGym.Rest).
    static let watchRest = Notification.Name("watchRest")
    /// The weight and reps being set on the watch (object: WatchGym.Draft).
    static let watchDraft = Notification.Name("watchDraft")
}

/// The gym on the Apple Watch (AurinWatch/Gym*.swift), both ways: the day's
/// plan for the watch, sent again whenever the iPhone saves the day, and the
/// sets and changes the watch sends back, written into the sheet and saved
/// like a set ticked in Training mode.
extension WatchBridge {
    struct GymChange {
        let day: GymDay
        let date: String
    }

    /// The rest settings of Training mode (TrainingModeView's @AppStorage).
    static var restSettings: (sets: Int, exercises: Int) {
        let defaults = UserDefaults.standard
        return (defaults.object(forKey: "restSets") as? Int ?? GymRestSettingsView.byExercise,
                defaults.object(forKey: "restExercises") as? Int ?? 120)
    }

    private var api: APIClient { AppModel.live?.api ?? APIClient() }

    func watchGym(_ day: GymDay, date: String) -> WatchGym {
        // The day's parts as last chosen on the phone, for the watch's list.
        var day = day
        GymDayParts.carry(into: &day, date: date)
        let rest = Self.restSettings
        var gym = WatchGym(day, date: date, restSets: rest.sets, restExercises: rest.exercises)
        gym.partsDone = Self.partsDone(day, date: date)
        Self.addInfo(&gym, day: day, date: date)
        return gym
    }

    /// What Training mode shows at each exercise (mockup "u cviku"): the note,
    /// the best set before today and each work set's numbers last time, from
    /// the history and notes the phone already keeps (no request of its own).
    static func addInfo(_ gym: inout WatchGym, day: GymDay, date: String,
                        history: GymHistory? = GymHistoryCache.load(), notes: [String: String] = ExerciseNotes.shared.notes) {
        for e in gym.exercises.indices {
            let name = gym.exercises[e].name
            gym.exercises[e].note = notes[name]?.nilIfBlank
            if let best = GymSessionMath.record(history?.exercise(name), before: date), let reps = best.reps {
                gym.exercises[e].record = WatchGym.Last(kg: best.kg, reps: Int(reps))
            }
            guard let last = history?.last(name, before: date),
                  let exercise = day.exercises.first(where: { $0.name == name }) else { continue }
            // The same place among the work sets as Training mode (GymSessionMath.lastTime).
            let work = exercise.sets.filter(\.work)
            for l in gym.exercises[e].lifts.indices {
                guard let position = work.firstIndex(where: { $0.row == gym.exercises[e].lifts[l].row }),
                      last.sets.indices.contains(position), let reps = last.sets[position].reps else { continue }
                gym.exercises[e].lifts[l].last = WatchGym.Last(kg: last.sets[position].kg, reps: Int(reps))
            }
        }
    }

    /// The parts of the day done here: the warm-up or stretching with every move
    /// ticked off, the cardio stopped (Training mode, StretchingCard).
    static func partsDone(_ day: GymDay, date: String) -> [String] {
        let defaults = UserDefaults.standard
        let ticks = StretchingCard.done(defaults.string(forKey: StretchingCard.doneKey) ?? "", date: date)
        let logs = defaults.string(forKey: GymCardioLog.storageKey) ?? ""
        let parts = GymDayParts.resolved(day, stored: defaults.string(forKey: GymDayParts.storageKey) ?? "", date: date)
        return GymDayPart.allCases.filter { part in
            if part.isCardio {
                return ticks.contains(part.tickPrefix + part.cardioId) || GymCardioLog.entry(logs, date: date, id: part.cardioId) != nil
            }
            guard let moves = parts.moves(part, day: day), !moves.items.isEmpty else { return false }
            return moves.items.allSatisfy { ticks.contains(part.tickPrefix + $0.id) }
        }.map(\.rawValue)
    }

    /// A part done on the watch: its moves ticked off and the cardio's length kept,
    /// as if done in Training mode here.
    func applyGym(_ done: WatchGym.PartDone) {
        let defaults = UserDefaults.standard
        var stored = defaults.string(forKey: StretchingCard.doneKey) ?? ""
        let already = StretchingCard.done(stored, date: done.date)
        for tick in done.ticks where !already.contains(tick) {
            stored = StretchingCard.toggled(stored, date: done.date, id: tick)
        }
        defaults.set(stored, forKey: StretchingCard.doneKey)
        if let id = done.cardio, let seconds = done.seconds, let end = done.end {
            let logs = defaults.string(forKey: GymCardioLog.storageKey) ?? ""
            defaults.set(GymCardioLog.saving(GymCardioLog.Entry(seconds: seconds, end: end), date: done.date, id: id, into: logs),
                         forKey: GymCardioLog.storageKey)
        }
    }

    /// The day's plan. Today's copy on the phone answers at once (the server
    /// takes seconds); the server's copy follows to the watch when it differs.
    /// Without a copy, from the server, else nothing.
    func loadGym(date: String) async -> WatchGym? {
        // Not waited for: the plan answers at once and goes again with them.
        Task { await loadExerciseInfo(date: date) }
        if date == AppModel.localDate(Date()), let saved = AppModel.live?.writes.waitingGym(date: date) ?? gymDays[date] ?? GymDayCache.load(date: date) {
            gymDays[date] = saved
            Task { @MainActor in await refreshGym(date: date, shown: saved) }
            return watchGym(saved, date: date)
        }
        guard let day = await fetchGym(date: date) ?? gymDays[date] ?? GymDayCache.load(date: date) else { return nil }
        gymDays[date] = day
        return watchGym(day, date: date)
    }

    /// The notes and the history of sets, once a run of the app, for "last
    /// time" and the record at each exercise on the watch; the plan already
    /// sent goes again with them. The history as Training mode loads it each
    /// time it opens (one request), so a workout done since is in it.
    private func loadExerciseInfo(date: String) async {
        guard !Self.exerciseInfoLoaded, let model = AppModel.live, !model.demo else { return }
        Self.exerciseInfoLoaded = true
        await ExerciseNotes.shared.load(api: model.api, demo: false)
        _ = await model.gymHistory()
        if let day = gymDays[date] { gymSaved(day, date: date) }
    }

    private static var exerciseInfoLoaded = false

    /// The day from the server (through the app's model when it runs, which
    /// keeps the writes still waiting and the saved copy).
    private func fetchGym(date: String) async -> GymDay? {
        if let model = AppModel.live { return try? await model.gymDay(date: date) }
        guard api.hasSession else { return nil }
        return try? await api.gym(date: date)
    }

    /// The server's copy after the watch got the phone's: sent on when it
    /// differs and nothing changed the day here meanwhile (a set from the watch is newer).
    private func refreshGym(date: String, shown: GymDay) async {
        guard let fresh = await fetchGym(date: date), fresh.values != shown.values,
              gymDays[date] == shown else { return }
        gymSaved(fresh, date: date)
    }

    /// The copy the watch works on: sets arrive one by one and are applied to
    /// it, so a quick second set never saves an older sheet.
    private func gymDay(_ date: String) async -> GymDay? {
        if let day = gymDays[date] ?? GymDayCache.load(date: date) { return day }
        if let model = AppModel.live { return try? await model.gymDay(date: date) }
        return try? await api.gym(date: date)
    }

    private func save(_ day: GymDay, date: String) async {
        gymDays[date] = day
        NotificationCenter.default.post(name: .watchGym, object: GymChange(day: day, date: date))
        if let model = AppModel.live {
            try? await model.saveGym(day, date: date)
        } else {
            GymDayCache.save(day, date: date)
            try? await api.saveGym(day, date: date)
        }
    }

    /// A set from the watch into the day's sheet.
    func applyGym(_ done: WatchGym.Done) async {
        guard var day = await gymDay(done.date) else { return }
        // The start in the sheet, as a set ticked in Training mode marks it: an
        // iPhone app closed by iOS meanwhile goes on from it, not from a new Start.
        day.apply(done, start: LiveWorkout.shared.start ?? Date())
        await save(day, date: done.date)
    }

    /// How a set went, tapped on the watch during the rest.
    func applyGym(_ rated: WatchGym.Rated) async {
        guard var day = await gymDay(rated.date) else { return }
        day.setIntensity(row: rated.row, rated.letter)
        await save(day, date: rated.date)
    }

    /// A change from the watch's menu; the new plan goes back to the watch.
    func applyGym(_ change: WatchGym.Change) async -> WatchGym? {
        guard var day = await gymDay(change.date) else { return nil }
        guard change.kind == .parts || day.exercises.indices.contains(change.exercise) else { return watchGym(day, date: change.date) }
        day.apply(change)
        await save(day, date: change.date)
        return watchGym(day, date: change.date)
    }

    /// The sheet the watch worked on alone while the iPhone was out of reach
    /// (it saved it to the server itself): the iPhone takes it as the day's,
    /// keeping sets ticked here meanwhile, Training mode shows it and the
    /// newest copy waiting to be sent is this one. The plan goes back to the
    /// watch, so it has the sets ticked here too.
    func applyGym(sheet: WatchGym.Sheet) async -> WatchGym {
        let mine = await gymDay(sheet.date)
        var day = mine ?? GymDay(date: sheet.date, values: [], cancelled: nil)
        day.values = GymDay.merged(sheet.values, keepingDoneFrom: mine?.values ?? [])
        await save(day, date: sheet.date)
        return watchGym(day, date: sheet.date)
    }

    /// Exercises to swap in (similar to the one given) or to add (matching the
    /// words said or written on the watch, else similar to the last one).
    func gymOptions(_ request: WatchGym.OptionsRequest) async -> [WatchGym.Option] {
        let inPlan = gymDays[request.date]?.exercises.map(\.name) ?? []
        if let query = request.query?.trimmingCharacters(in: .whitespaces), !query.isEmpty {
            let key = Self.folded(query)
            let catalog = (try? await api.gymExercises()) ?? []
            return catalog.filter { Self.folded($0.name).contains(key) && !inPlan.contains($0.name) }
                .sorted { ($0.fits != false ? 0 : 1, $0.name) < ($1.fits != false ? 0 : 1, $1.name) }
                .prefix(20)
                .map { WatchGym.Option(name: $0.name, shown: ExerciseCatalog.shownName($0.name), kg: nil,
                                       sets: $0.sets?.number.map { Int($0) }, reps: $0.reps.flatMap(Self.text)) }
        }
        guard let exercise = request.exercise ?? inPlan.last else { return [] }
        let alternatives = (try? await api.gymAlternatives(date: request.date, exercise: exercise, inPlan: inPlan)) ?? []
        return alternatives.prefix(20).map {
            WatchGym.Option(name: $0.name, shown: ExerciseCatalog.shownName($0.name), kg: $0.kg,
                            sets: $0.sets?.number.map { Int($0) }, reps: $0.reps.flatMap(Self.text))
        }
    }

    private static func text(_ value: JSONValue) -> String? {
        value.string ?? value.number.map { String(Int($0)) }
    }

    private static func folded(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    /// The iPhone saved the day (Training mode, the gym sheet, a change from
    /// the watch): today's goes to the watch, at once when it is in reach and
    /// in the application context for when it opens.
    func gymSaved(_ day: GymDay, date: String) {
        guard date == AppModel.localDate(Date()) else { return }
        gymDays[date] = day
        guard let session = WCSession.isSupported() ? WCSession.default : nil, session.activationState == .activated,
              session.isPaired, session.isWatchAppInstalled, let data = watchGym(day, date: date).encoded() else { return }
        if session.isReachable {
            session.sendMessage([WatchGym.replyKey: data], replyHandler: nil, errorHandler: nil)
        }
        sendContext()
    }

    /// The weight and reps typed for the set at hand, to the watch's gym (only while in reach).
    func sendDraft(_ draft: WatchGym.Draft) {
        guard let session = WCSession.isSupported() ? WCSession.default : nil, session.activationState == .activated,
              session.isPaired, session.isWatchAppInstalled, session.isReachable, let data = draft.encoded() else { return }
        session.sendMessage([WatchGym.draftKey: data], replyHandler: nil, errorHandler: nil)
    }

    /// The rest in Training mode, to the watch's gym (only while in reach).
    func sendRest(_ rest: WatchGym.Rest) {
        guard let session = WCSession.isSupported() ? WCSession.default : nil, session.activationState == .activated,
              session.isPaired, session.isWatchAppInstalled, session.isReachable, let data = rest.encoded() else { return }
        session.sendMessage([WatchGym.restKey: data], replyHandler: nil, errorHandler: nil)
    }

    /// Today's gym for the application context, next to the snapshot.
    var gymContext: Data? {
        let date = AppModel.localDate(Date())
        return gymDays[date].flatMap { watchGym($0, date: date).encoded() }
    }
}
