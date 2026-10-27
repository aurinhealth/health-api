import Foundation

/// The gym on the Apple Watch (AurinWatch/Gym*.swift): the day's plan for the
/// watch and the sets it sends back, written into the sheet and saved like a
/// set ticked in Training mode.
extension WatchBridge {
    static func gym(_ day: GymDay, date: String, restSets: Int, restExercises: Int) -> WatchGym {
        let exercises = day.exercises.compactMap { exercise -> WatchGym.Exercise? in
            let lifts = exercise.sets.map { set in
                WatchGym.Lift(row: set.row, number: set.number, warmup: set.warmup, drop: set.drop, side: set.side,
                              kg: number(set.kg) ?? number(set.plannedKg),
                              reps: GymCoach.firstNumber(set.reps) ?? GymCoach.firstNumber(set.plannedReps),
                              plannedReps: set.plannedReps, done: set.done,
                              rest: set.warmup ? 60 : GymRestSettingsView.between(set, setting: restSets))
            }
            return lifts.isEmpty ? nil : WatchGym.Exercise(name: exercise.name, lifts: lifts)
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

    /// The day's plan, from the server when it answers, else the one saved on the phone.
    func loadGym(date: String) async -> WatchGym? {
        let day: GymDay?
        if api.hasSession, let fresh = try? await api.gym(date: date) {
            day = fresh
        } else {
            day = GymDayCache.load(date: date)
        }
        guard let day else { return nil }
        gymDays[date] = day
        let rest = Self.restSettings
        return Self.gym(day, date: date, restSets: rest.sets, restExercises: rest.exercises)
    }

    /// A set from the watch into the day's sheet. Sets arrive one by one and
    /// are applied to the copy kept here, so a quick second set never saves an older sheet.
    func applyGym(_ done: WatchGym.Done) async {
        var day = gymDays[done.date] ?? GymDayCache.load(date: done.date)
        if day == nil { day = try? await api.gym(date: done.date) }
        guard var day else { return }
        day.complete(row: done.row, kg: GymCoach.kgText(done.kg), reps: String(done.reps), rpe: "")
        gymDays[done.date] = day
        if let model = AppModel.live {
            try? await model.saveGym(day, date: done.date)
        } else {
            GymDayCache.save(day, date: done.date)
            try? await api.saveGym(day, date: done.date)
        }
    }
}
