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

    static func gym(_ day: GymDay, date: String, restSets: Int, restExercises: Int) -> WatchGym {
        let exercises = day.exercises.map { exercise -> WatchGym.Exercise in
            let lifts = exercise.sets.map { set in
                WatchGym.Lift(row: set.row, number: set.number, warmup: set.warmup, drop: set.drop, side: set.side,
                              kg: number(set.kg) ?? number(set.plannedKg),
                              reps: GymCoach.firstNumber(set.reps) ?? GymCoach.firstNumber(set.plannedReps),
                              plannedReps: set.plannedReps, done: set.done,
                              rest: set.warmup ? 60 : GymRestSettingsView.between(set, setting: restSets),
                              intensity: GymIntensity.letter(set.intensity))
            }
            let shown = ExerciseCatalog.shownName(exercise.name)
            return WatchGym.Exercise(name: exercise.name, shown: shown == exercise.name ? nil : shown, lifts: lifts)
        }
        return WatchGym(date: date, title: day.planName, minutes: day.plannedMinutes, restExercises: restExercises,
                        exercises: day.cancelled == true ? [] : exercises)
    }

    private static func number(_ text: String?) -> Double? {
        guard let text = text?.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."), !text.isEmpty else { return nil }
        return Double(text)
    }

    /// The rest settings of Training mode (TrainingModeView's @AppStorage).
    private static var restSettings: (sets: Int, exercises: Int) {
        let defaults = UserDefaults.standard
        return (defaults.object(forKey: "restSets") as? Int ?? GymRestSettingsView.byExercise,
                defaults.object(forKey: "restExercises") as? Int ?? 120)
    }

    private var api: APIClient { AppModel.live?.api ?? APIClient() }

    func watchGym(_ day: GymDay, date: String) -> WatchGym {
        let rest = Self.restSettings
        return Self.gym(day, date: date, restSets: rest.sets, restExercises: rest.exercises)
    }

    /// The day's plan, from the server when it answers, else the one saved on the phone.
    func loadGym(date: String) async -> WatchGym? {
        var day: GymDay?
        if let model = AppModel.live {
            day = try? await model.gymDay(date: date)
        } else if api.hasSession {
            day = try? await api.gym(date: date)
        }
        day = day ?? gymDays[date] ?? GymDayCache.load(date: date)
        guard let day else { return nil }
        gymDays[date] = day
        return watchGym(day, date: date)
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
        day.complete(row: done.row, kg: GymCoach.kgText(done.kg), reps: String(done.reps), rpe: "")
        // The start in the sheet, as a set ticked in Training mode marks it: an
        // iPhone app closed by iOS meanwhile goes on from it, not from a new Start.
        if day.startedAt == nil { day.markStarted(LiveWorkout.shared.start ?? Date()) }
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
        let names = day.exercises.map(\.name)
        guard names.indices.contains(change.exercise) else { return watchGym(day, date: change.date) }
        switch change.kind {
        case .addSet: day.addSet(at: change.exercise)
        case .removeSet: day.removeSet(at: change.exercise)
        case .removeExercise: day.removeExercise(at: change.exercise)
        case .swap:
            guard let option = change.option else { break }
            day.replace(exercise: names[change.exercise], with: option.name, kg: option.kg.map(GymCoach.kgText))
        case .addExercise:
            guard let option = change.option else { break }
            day.addExercise(option.name, sets: option.sets ?? 3, reps: option.reps ?? "10", kg: option.kg.map(GymCoach.kgText) ?? "")
        case .move:
            guard let to = change.to else { break }
            day.moveExercise(from: change.exercise, to: to)
        }
        await save(day, date: change.date)
        return watchGym(day, date: change.date)
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
