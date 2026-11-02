import Foundation
import WatchConnectivity

/// The day's gym on the watch: the plan from the iPhone (App/WatchGymBridge.swift),
/// the sets done here, and where the session stands, kept so a relaunch goes on.
/// With the iPhone out of reach the watch goes on alone: it loads the day's
/// sheet from the server, writes sets and plan changes into it with the same
/// code as the iPhone (WatchShared/GymSheet.swift) and saves it to the server
/// itself; once the iPhone is in reach again it hands it the sheet and the
/// iPhone writes again.
@MainActor
final class GymStore: ObservableObject {
    static let shared = GymStore()
    private static let savedKey = "watchGym"
    private static let aloneKey = "watchGymAlone"
    private static let unsentKey = "watchGymUnsent"

    @Published private(set) var gym: WatchGym?
    @Published private(set) var loading = false
    @Published private(set) var failed = false

    /// The watch has written the day's sheet itself since the iPhone last took it.
    private var alone = false {
        didSet { UserDefaults.standard.set(alone, forKey: Self.aloneKey) }
    }
    /// The newest sheet has not reached the server yet (no internet).
    private var unsent = false {
        didSet { UserDefaults.standard.set(unsent, forKey: Self.unsentKey) }
    }
    private var uploading = false

    init() {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: Self.savedKey), let saved = WatchGym.decode(data),
           saved.date == WatchStore.localDate(Date()) {
            gym = saved
            alone = defaults.bool(forKey: Self.aloneKey)
            unsent = defaults.bool(forKey: Self.unsentKey)
        }
    }

    /// The day worked on: today, or the day a workout still running began
    /// (a gym past midnight stays on its own day).
    private var day: String {
        let today = WatchStore.localDate(Date())
        guard GymWorkout.shared.running, let gym else { return today }
        return gym.date
    }

    private var phone: WCSession? {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return nil }
        return WCSession.default
    }

    /// The iPhone can take a set or a change now (not while the watch is alone).
    private var phoneWrites: Bool { !alone && phone?.isReachable == true }

    /// The plan: from the iPhone in reach, else from the server; a session in
    /// progress keeps what was done here, and a day the watch writes alone stays its own.
    func load() {
        let date = day
        if alone, gym?.date == date {
            sync()
            return
        }
        guard let session = phone, session.isReachable else {
            Task { await fromServer(date) }
            return
        }
        loading = true
        session.sendMessage([WatchGym.requestKey: date], replyHandler: { reply in
            let data = reply[WatchGym.replyKey] as? Data
            Task { @MainActor in
                if let data { GymStore.shared.received(data) } else { await GymStore.shared.fromServer(date) }
            }
        }, errorHandler: { _ in
            Task { @MainActor in await GymStore.shared.fromServer(date) }
        })
    }

    /// The day's sheet from the server with the watch's own sign-in.
    private func fromServer(_ date: String) async {
        loading = true
        defer { loading = false }
        guard let sheet = await WatchAPI.gymSheet(date: date) else {
            failed = gym == nil
            return
        }
        take(built(sheet, date: date))
    }

    private func built(_ sheet: GymDay, date: String) -> WatchGym {
        let settings = WatchStore.shared.settings
        return WatchGym(sheet, date: date, restSets: settings.restSets, restExercises: settings.restExercises)
    }

    /// Another day's plan (the Training page shows tomorrow or a day tapped
    /// in its row), not kept: only today's is worked on.
    func preview(date: String) async -> WatchGym? {
        if let gym, gym.date == date { return gym }
        guard let session = phone, session.isReachable else {
            return await WatchAPI.gymSheet(date: date).map { built($0, date: date) }
        }
        let fromPhone: WatchGym? = await withCheckedContinuation { continuation in
            session.sendMessage([WatchGym.requestKey: date], replyHandler: { reply in
                continuation.resume(returning: (reply[WatchGym.replyKey] as? Data).flatMap(WatchGym.decode))
            }, errorHandler: { _ in
                continuation.resume(returning: nil)
            })
        }
        if let fromPhone { return fromPhone }
        return await WatchAPI.gymSheet(date: date).map { built($0, date: date) }
    }

    /// A plan from the iPhone: the answer to load or to a change, or sent on
    /// its own when the iPhone saved the day (WatchStore forwards it).
    func received(_ data: Data?) {
        loading = false
        guard let data, let fresh = WatchGym.decode(data) else {
            failed = gym == nil
            return
        }
        // The watch writes the day alone: the iPhone's copy is older until it takes the watch's.
        if alone, gym?.date == fresh.date { return }
        take(fresh)
    }

    /// A plan from the iPhone or the server; sets done here that it does not
    /// have yet stay done, in the plan and in its sheet.
    private func take(_ plan: WatchGym) {
        var fresh = plan
        failed = false
        guard fresh.date == day else { return }
        if let gym, gym.date == fresh.date {
            var sheet = fresh.sheet.map { GymDay(date: fresh.date, values: $0, cancelled: nil) }
            for e in fresh.exercises.indices {
                for l in fresh.exercises[e].lifts.indices {
                    let row = fresh.exercises[e].lifts[l].row
                    if let mine = gym.lift(row: row), mine.done, !fresh.exercises[e].lifts[l].done {
                        fresh.exercises[e].lifts[l] = mine
                        if let kg = mine.kg, let reps = mine.reps {
                            sheet?.apply(WatchGym.Done(date: fresh.date, row: row, kg: kg, reps: reps), start: GymWorkout.shared.start ?? Date())
                        }
                    }
                }
            }
            fresh.sheet = sheet?.values
        } else {
            // Another day: whatever the watch wrote alone belonged to the one before.
            alone = false
            unsent = false
        }
        gym = fresh
        save()
    }

    /// The sheet of the day, changed as on the iPhone and kept with the plan.
    private func editSheet(_ change: (inout GymDay) -> Void) {
        guard var gym, let values = gym.sheet else { return }
        var sheet = GymDay(date: gym.date, values: values, cancelled: nil)
        change(&sheet)
        gym.sheet = sheet.values
        self.gym = gym
    }

    /// A set done: kept here and sent to the iPhone, which saves it in the
    /// day's sheet; out of its reach the watch saves the sheet itself.
    func complete(row: Int, kg: Double, reps: Int) {
        guard var gym else { return }
        gym.update(row: row) { $0.kg = kg; $0.reps = reps; $0.done = true }
        // The next set of the exercise starts from this one, as on the iPhone.
        if let next = gym.next(after: row), !next.newExercise, let done = gym.lift(row: row), done.work, next.lift.work, !next.lift.done {
            gym.update(row: next.lift.row) { $0.kg = kg; $0.reps = reps }
        }
        self.gym = gym
        let done = WatchGym.Done(date: gym.date, row: row, kg: kg, reps: reps)
        editSheet { $0.apply(done, start: GymWorkout.shared.start ?? Date()) }
        save()
        guard let data = done.encoded() else { return }
        write([WatchGym.doneKey: data])
    }

    /// How a set went (mockup 8B), tapped during the rest: the next set of
    /// the exercise starts from `next` (in kg) when not done yet, and the
    /// letter goes to the iPhone's sheet.
    func rate(row: Int, letter: String, next kg: Double) {
        guard var gym else { return }
        if let next = gym.next(after: row), !next.newExercise, next.lift.work, !next.lift.done {
            gym.update(row: next.lift.row) { $0.kg = kg }
        }
        gym.update(row: row) { $0.intensity = letter }
        self.gym = gym
        editSheet { $0.setIntensity(row: row, letter) }
        save()
        guard let data = WatchGym.Rated(date: gym.date, row: row, letter: letter).encoded() else { return }
        write([WatchGym.ratedKey: data])
    }

    /// A set or its letter to the iPhone while it writes the day; else (out of
    /// reach, or it did not answer) the watch saves the sheet itself. A plan
    /// from an older iPhone, without its sheet, waits in the iPhone's queue as before.
    private func write(_ message: [String: Any]) {
        guard gym?.sheet != nil else {
            guard let session = phone else { return }
            if session.isReachable {
                session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in WCSession.default.transferUserInfo(message) })
            } else {
                session.transferUserInfo(message)
            }
            return
        }
        guard phoneWrites, let session = phone else {
            goAlone()
            return
        }
        session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
            Task { @MainActor in GymStore.shared.goAlone() }
        })
    }

    /// The watch writes the day itself from now on: what still waits in the
    /// iPhone's queue is in the sheet already, so it is taken back, and the
    /// sheet goes to the server.
    private func goAlone() {
        alone = true
        unsent = true
        if let session = phone {
            for transfer in session.outstandingUserInfoTransfers
            where transfer.userInfo[WatchGym.doneKey] != nil || transfer.userInfo[WatchGym.ratedKey] != nil {
                transfer.cancel()
            }
        }
        upload()
        handBack()
    }

    /// What the watch wrote alone goes on its way: to the server when it has
    /// not yet, to the iPhone when it is in reach (its connection came up).
    func sync() {
        sync()
    }

    /// The newest sheet to the server, one save at a time; tried again with
    /// the next set, the next load, and the end of the workout.
    private func upload() {
        guard alone, unsent, !uploading else { return }
        uploading = true
        Task { @MainActor in
            defer { GymStore.shared.uploading = false }
            while GymStore.shared.unsent, let gym = GymStore.shared.gym, let values = gym.sheet {
                guard await WatchAPI.saveGym(GymDay(date: gym.date, values: values, cancelled: nil), date: gym.date) else { return }
                if GymStore.shared.gym?.sheet == values { GymStore.shared.unsent = false }
            }
        }
    }

    /// The iPhone in reach again: it takes the sheet the watch wrote alone
    /// (saving it to the server too) and writes the day again from then on.
    private func handBack() {
        guard alone, let session = phone, session.isReachable, let gym, let values = gym.sheet,
              let data = WatchGym.Sheet(date: gym.date, values: values).encoded() else { return }
        session.sendMessage([WatchGym.sheetKey: data], replyHandler: { _ in
            Task { @MainActor in
                let store = GymStore.shared
                // Changed here meanwhile: the next hand-back takes that.
                guard store.gym?.sheet == values else { store.handBack(); return }
                store.alone = false
                store.unsent = false
            }
        }, errorHandler: { _ in })
    }

    /// The workout finished here: alone, the end goes into the sheet (the
    /// iPhone writes it in Training mode otherwise) and the sheet is saved.
    func finished(at end: Date) {
        guard alone else { return }
        editSheet { $0.markFinished(end) }
        save()
        unsent = true
        sync()
    }

    /// A change from the menu (a set or an exercise added, removed or
    /// swapped): the iPhone writes it into the sheet and answers with the new
    /// plan; out of its reach the watch changes the sheet itself.
    func change(_ kind: WatchGym.Change.Kind, exercise: Int, option: WatchGym.Option? = nil, to: Int? = nil) {
        guard let gym else { return }
        let change = WatchGym.Change(date: gym.date, kind: kind, exercise: exercise, option: option, to: to)
        guard phoneWrites, let session = phone, let data = change.encoded() else {
            changeHere(change)
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
                GymStore.shared.changeHere(change)
            }
        })
    }

    /// The change made here in the sheet, with the plan built again from it;
    /// sets typed but not done keep their numbers.
    private func changeHere(_ change: WatchGym.Change) {
        guard let old = gym, let values = old.sheet else {
            failedChange = true
            return
        }
        var sheet = GymDay(date: old.date, values: values, cancelled: nil)
        sheet.apply(change)
        var fresh = WatchGym(sheet, date: old.date, restSets: WatchStore.shared.settings.restSets, restExercises: old.restExercises)
        for e in fresh.exercises.indices {
            for l in fresh.exercises[e].lifts.indices where !fresh.exercises[e].lifts[l].done {
                let lift = fresh.exercises[e].lifts[l]
                // The same set of the same exercise as before the change.
                if let before = old.exercises.first(where: { $0.name == fresh.exercises[e].name })?.lifts
                    .first(where: { $0.number == lift.number && $0.side == lift.side && $0.warmup == lift.warmup && $0.drop == lift.drop && !$0.done }) {
                    fresh.exercises[e].lifts[l].kg = before.kg ?? lift.kg
                    fresh.exercises[e].lifts[l].reps = before.reps ?? lift.reps
                }
            }
        }
        gym = fresh
        save()
        goAlone()
    }

    /// The rest Training mode on the iPhone started, moved or skipped.
    @Published var phoneRest: WatchGym.Rest?

    /// The weight and reps Training mode on the iPhone is at for a set.
    @Published var phoneDraft: WatchGym.Draft?

    /// The weight and reps being set here, to Training mode on the iPhone (only while in reach).
    func sendDraft(_ draft: WatchGym.Draft) {
        guard !draft.same(phoneDraft), let session = phone, session.isReachable,
              let data = draft.encoded() else { return }
        session.sendMessage([WatchGym.draftKey: data], replyHandler: { _ in }, errorHandler: { _ in })
    }

    /// The rest here to Training mode on the iPhone (only while in reach).
    func sendRest(_ rest: WatchGym.Rest) {
        guard let session = phone, session.isReachable, let data = rest.encoded() else { return }
        session.sendMessage([WatchGym.restKey: data], replyHandler: { _ in }, errorHandler: { _ in })
    }

    /// Training mode on the iPhone opened the gym here (WatchAppDelegate).
    @Published var openedFromPhone = false
    /// Training mode on the iPhone finished: the session here ends and saves.
    @Published var endedOnPhone = false

    func openFromPhone() {
        guard !GymWorkout.shared.running else { return }
        load()
        openedFromPhone = true
    }

    /// Opened by the iPhone before the watch's connection was up (a cold
    /// launch): the plan is asked for again once it is, not left spinning.
    func loadIfWaiting() {
        guard openedFromPhone, !loading, gym == nil || gym?.date != day else { return }
        load()
    }

    @Published private(set) var changing = false
    /// A change neither the iPhone nor the watch could make (a plan from an
    /// older iPhone, without its sheet, and the iPhone out of reach).
    @Published var failedChange = false

    /// Exercises to swap in or to add: from the iPhone in reach, else from the server.
    func options(exercise: String?, query: String?) async -> [WatchGym.Option] {
        guard let gym else { return [] }
        let inPlan = gym.exercises.map(\.name)
        if phoneWrites, let session = phone, let data = WatchGym.OptionsRequest(date: gym.date, exercise: exercise, query: query).encoded() {
            let list: [WatchGym.Option]? = await withCheckedContinuation { continuation in
                session.sendMessage([WatchGym.optionsKey: data], replyHandler: { reply in
                    continuation.resume(returning: (reply[WatchGym.optionsKey] as? Data).flatMap { try? JSONDecoder().decode([WatchGym.Option].self, from: $0) })
                }, errorHandler: { _ in
                    continuation.resume(returning: nil)
                })
            }
            if let list { return list }
        }
        if let query = query?.trimmingCharacters(in: .whitespaces), !query.isEmpty {
            return await WatchAPI.gymSearch(query, inPlan: inPlan)
        }
        guard let name = exercise ?? inPlan.last else { return [] }
        return await WatchAPI.gymAlternatives(date: gym.date, exercise: name, inPlan: inPlan)
    }

    /// Weight or reps changed before the set is done.
    func edit(row: Int, kg: Double, reps: Int) {
        guard var gym else { return }
        gym.update(row: row) { $0.kg = kg; $0.reps = reps }
        self.gym = gym
        save()
    }

    /// The iPhone signed out: the day's gym of that account goes too.
    func clear() {
        guard !GymWorkout.shared.running else { return }
        gym = nil
        failed = false
        alone = false
        unsent = false
        UserDefaults.standard.removeObject(forKey: Self.savedKey)
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

    var started: Bool { exercises.contains { $0.lifts.contains(where: \.done) } }
    var allDone: Bool { current == nil }

    /// kg × reps of the work sets done.
    var volume: Double {
        exercises.flatMap(\.lifts).filter { $0.done && $0.work }.reduce(0) { $0 + ($1.kg ?? 0) * Double($1.reps ?? 0) }
    }

    var setsDone: Int { exercises.flatMap(\.lifts).filter { $0.done && !$0.warmup }.count }
}
