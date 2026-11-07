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
    private static let earlierKey = "watchGymEarlier"

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
        // The sample day's gym for the screenshots (WatchDemo).
        if WatchDemo.on {
            gym = WatchDemo.race ? nil : WatchDemo.gym
            return
        }
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: Self.savedKey), let saved = WatchGym.decode(data) {
            if saved.date == WatchStore.localDate(Date()) {
                gym = saved
                alone = defaults.bool(forKey: Self.aloneKey)
                unsent = defaults.bool(forKey: Self.unsentKey)
            } else if defaults.bool(forKey: Self.aloneKey), defaults.bool(forKey: Self.unsentKey) {
                // Written alone on an earlier day and never saved (no internet
                // since): kept until the server has it, not dropped with the day.
                Self.keepEarlier(saved)
            }
        }
    }

    /// A day the watch wrote alone that has not reached the server yet.
    private static func keepEarlier(_ gym: WatchGym) {
        guard gym.sheet != nil, let data = gym.encoded() else { return }
        UserDefaults.standard.set(data, forKey: earlierKey)
    }

    /// The earlier day's sheet to the server; kept for the next try when offline.
    private func uploadEarlier() {
        guard let data = UserDefaults.standard.data(forKey: Self.earlierKey) else { return }
        guard let earlier = WatchGym.decode(data), let values = earlier.sheet else {
            UserDefaults.standard.removeObject(forKey: Self.earlierKey)
            return
        }
        Task { @MainActor in
            guard await WatchAPI.saveGym(GymDay(date: earlier.date, values: values, cancelled: nil), date: earlier.date) else { return }
            if UserDefaults.standard.data(forKey: Self.earlierKey) == data { UserDefaults.standard.removeObject(forKey: Self.earlierKey) }
        }
    }

    /// The day worked on: today, or the day a workout still running began
    /// (a gym past midnight stays on its own day).
    private var day: String {
        let today = WatchStore.localDate(WatchDemo.now)
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
        guard !WatchDemo.on else { return }
        let date = day
        // A plan kept from before (a relaunch, a day written alone) gets its swaps too.
        keepSwaps()
        // A rating given offline.
        sendRating()
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

    /// When a plan for the day last came (from the iPhone or the server).
    private var loadedAt: Date?

    /// The Training page: loads only without today's plan or after 10 minutes.
    func loadIfStale() {
        guard !loading else { return }
        if let gym, gym.date == day, let loadedAt, Date().timeIntervalSince(loadedAt) < 10 * 60 { return }
        load()
    }

    /// The day's sheet from the server with the watch's own sign-in.
    private func fromServer(_ date: String) async {
        loading = true
        defer { loading = false }
        guard let sheet = await WatchAPI.gymSheet(date: date) else {
            failed = gym == nil
            return
        }
        var plan = built(sheet, date: date)
        // The notes, records and last time's sets came with the iPhone's plan.
        if let gym, gym.date == date { plan.keepInfo(from: gym) }
        take(plan)
    }

    private func built(_ sheet: GymDay, date: String) -> WatchGym {
        let settings = WatchStore.shared.settings
        return WatchGym(sheet, date: date, restSets: settings.restSets, restExercises: settings.restExercises)
    }

    /// Another day's plan (the Training page shows tomorrow or a day tapped
    /// in its row), not kept: only today's is worked on.
    func preview(date: String) async -> WatchGym? {
        if let gym, gym.date == date { return gym }
        guard !WatchDemo.on else { return nil }
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
            // Another day: whatever the watch wrote alone belonged to the one
            // before; not saved yet, it goes to the server on its own.
            if alone, unsent, let gym { Self.keepEarlier(gym); uploadEarlier() }
            alone = false
            unsent = false
            partsFinished = []
        }
        gym = fresh
        loadedAt = Date()
        save()
        keepSwaps()
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
        let plan = gym.lift(row: row)?.plannedKg
        gym.update(row: row) { $0.kg = kg; $0.reps = reps; $0.done = true }
        // The next set of the exercise starts from this one, as on the iPhone,
        // unless its plan is its own (typed in ahead there).
        if let next = gym.nextInExercise(after: row), let done = gym.lift(row: row), done.work, next.work, next.plannedKg == plan {
            gym.update(row: next.row) { $0.kg = kg; $0.reps = reps }
        }
        // The drop sets after it follow the weight it was done with (GymDay.followDrops).
        gym.followDrops(after: row, from: plan, to: kg)
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
        if let next = gym.nextInExercise(after: row), next.work, next.plannedKg == gym.lift(row: row)?.plannedKg {
            gym.update(row: next.row) { $0.kg = kg }
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
        let message = WatchAPI.owned(message)
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
        upload()
        handBack()
    }

    /// The newest sheet to the server, one save at a time; tried again with
    /// the next set, the next load, and the end of the workout.
    private func upload() {
        // An earlier day the watch wrote alone and has not saved yet goes first.
        uploadEarlier()
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
        session.sendMessage([WatchGym.sheetKey: data], replyHandler: { reply in
            // The iPhone's plan: the watch's sheet with sets ticked on the iPhone meanwhile.
            let plan = reply[WatchGym.replyKey] as? Data
            Task { @MainActor in
                let store = GymStore.shared
                // Changed here meanwhile: the next hand-back takes that.
                guard store.gym?.sheet == values else { store.handBack(); return }
                store.alone = false
                store.unsent = false
                if let plan { store.received(plan) }
            }
        }, errorHandler: { _ in })
    }

    // MARK: - A day without a plan, the end (mockups "jen hodinky" 6–8)

    /// A start on the watch could not put the workout together (alert).
    @Published var failedStart = false
    @Published private(set) var starting = false

    /// No gym planned today: the iPhone puts the workout in the day (the last
    /// one again, one for the rested muscles, or an empty one) and answers
    /// with it. Out of its reach an empty workout starts here alone; the other
    /// two need the iPhone. True when there is a workout to open.
    func start(_ kind: WatchGym.Start.Kind) async -> Bool {
        let date = day
        if let session = phone, session.isReachable, let data = WatchGym.Start(date: date, kind: kind).encoded() {
            starting = true
            defer { starting = false }
            let reply: Data? = await withCheckedContinuation { continuation in
                session.sendMessage([WatchGym.startKey: data], replyHandler: { reply in
                    continuation.resume(returning: reply[WatchGym.replyKey] as? Data)
                }, errorHandler: { _ in
                    continuation.resume(returning: nil)
                })
            }
            if let reply, let plan = WatchGym.decode(reply) {
                take(plan)
                return true
            }
        }
        guard kind == .empty else {
            failedStart = true
            return false
        }
        // Alone: the day's sheet with its header only; it reaches the server
        // with the first exercise added (changeHere).
        var sheet = GymDay(date: date, values: [], cancelled: nil)
        sheet.ensureHeader(date: date)
        take(built(sheet, date: date))
        alone = true
        return true
    }

    /// Discarded (mockup 8, Zahodit trénink): the day loses the workout here,
    /// on the iPhone and on the server; the sets still waiting for the iPhone go too.
    func discard() {
        guard let gym else { return }
        let date = gym.date
        if let session = phone {
            for transfer in session.outstandingUserInfoTransfers
            where [WatchGym.doneKey, WatchGym.ratedKey, WatchGym.partDoneKey].contains(where: { transfer.userInfo[$0] != nil }) {
                transfer.cancel()
            }
        }
        self.gym = nil
        alone = false
        unsent = false
        partsFinished = []
        UserDefaults.standard.removeObject(forKey: Self.savedKey)
        let message: [String: Any] = [WatchGym.discardKey: date]
        if let session = phone, session.isReachable {
            // The iPhone discards it (its saved copy and queue too); not
            // answering, the watch tells the server itself.
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
                Task { await WatchAPI.discardGym(date: date) }
            })
        } else {
            Task { await WatchAPI.discardGym(date: date) }
        }
    }

    private static let ratingKey = "watchGymRating"

    /// How the workout's plan suited (good, ok, bad: the iPhone's Sedělo,
    /// Ujde, Nesedělo), sent with Finish; offline it waits for the next load.
    func rateWorkout(_ rating: String, date: String) {
        UserDefaults.standard.set(date + "|" + rating, forKey: Self.ratingKey)
        sendRating()
    }

    private func sendRating() {
        guard let saved = UserDefaults.standard.string(forKey: Self.ratingKey) else { return }
        let parts = saved.split(separator: "|").map(String.init)
        guard parts.count == 2 else {
            UserDefaults.standard.removeObject(forKey: Self.ratingKey)
            return
        }
        Task { @MainActor in
            guard await WatchAPI.rateGym(date: parts[0], rating: parts[1]) else { return }
            if UserDefaults.standard.string(forKey: Self.ratingKey) == saved { UserDefaults.standard.removeObject(forKey: Self.ratingKey) }
        }
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
    func change(_ kind: WatchGym.Change.Kind, exercise: Int, option: WatchGym.Option? = nil, to: Int? = nil, parts: GymDayParts? = nil) {
        guard let gym else { return }
        let change = WatchGym.Change(date: gym.date, kind: kind, exercise: exercise, option: option, to: to, parts: parts)
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
        fresh.partsDone = old.partsDone
        fresh.keepInfo(from: old)
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
        keepSwaps()
    }

    // MARK: - The parts around the exercises (warm-up, cardio, stretching)

    private static let partsKey = "watchGymParts"

    /// The parts finished here today (done or skipped), "date|warmup,cardioStart".
    @Published private(set) var partsFinished: [String] = {
        let saved = UserDefaults.standard.string(forKey: "watchGymParts") ?? ""
        let pieces = saved.split(separator: "|", maxSplits: 1).map(String.init)
        guard pieces.count == 2, pieces[0] == WatchStore.localDate(Date()) else { return [] }
        return pieces[1].split(separator: ",").map(String.init)
    }()

    /// The day's sheet, for its parts (nil from an older iPhone).
    var sheetDay: GymDay? {
        guard let gym, let values = gym.sheet else { return nil }
        return GymDay(date: gym.date, values: values, cancelled: nil)
    }

    /// The day's parts as last chosen on the iPhone or here.
    var dayParts: GymDayParts? { sheetDay.map { GymDayParts.current($0) } }

    /// Done or skipped here, or done in Training mode on the iPhone.
    func partFinished(_ part: GymDayPart) -> Bool {
        partsFinished.contains(part.rawValue) || gym?.partsDone?.contains(part.rawValue) == true
    }

    /// A part finished here; what was done of it goes to Training mode on the
    /// iPhone (the moves ticked off, the cardio's length and end), queued when out of reach.
    func finishPart(_ part: GymDayPart, ticks: [String], cardio: (seconds: Int, end: Date)? = nil) {
        guard let gym else { return }
        if !partsFinished.contains(part.rawValue) { partsFinished.append(part.rawValue) }
        UserDefaults.standard.set(gym.date + "|" + partsFinished.joined(separator: ","), forKey: Self.partsKey)
        guard !ticks.isEmpty || cardio != nil, let session = phone,
              let data = WatchGym.PartDone(date: gym.date, part: part.rawValue, ticks: ticks, seconds: cardio?.seconds,
                                           end: cardio?.end, cardio: part.isCardio ? part.cardioId : nil).encoded() else { return }
        let message = WatchAPI.owned([WatchGym.partDoneKey: data])
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in WCSession.default.transferUserInfo(message) })
        } else {
            session.transferUserInfo(message)
        }
    }

    /// A part run again from the list: no longer finished here.
    func reopenPart(_ part: GymDayPart) {
        partsFinished.removeAll { $0 == part.rawValue }
    }

    /// The day's parts changed here (a switch, a new place): into the day's
    /// plan, so the iPhone has them too.
    func setParts(_ parts: GymDayParts) {
        var parts = parts
        parts.updated = Date()
        // On the screen at once; the iPhone's answer (or the save here) follows.
        if var shown = gym, let values = shown.sheet {
            var sheet = GymDay(date: shown.date, values: values, cancelled: nil)
            sheet.setDayParts(parts)
            shown.sheet = sheet.values
            gym = shown
            save()
        }
        change(.parts, exercise: 0, parts: parts)
    }

    /// The rest Training mode on the iPhone started, moved or skipped.
    @Published var phoneRest: WatchGym.Rest?

    /// The weight and reps Training mode on the iPhone is at for a set.
    @Published var phoneDraft: WatchGym.Draft?

    /// The weight and reps being set here, to Training mode on the iPhone (only
    /// while in reach): once the crown rests for 0.3 s, not at every 0.5 kg step
    /// (20 kg were 40 messages).
    func sendDraft(_ draft: WatchGym.Draft) {
        draftTask?.cancel()
        draftTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            GymStore.shared.sendDraftNow(draft)
        }
    }

    private var draftTask: Task<Void, Never>?

    private func sendDraftNow(_ draft: WatchGym.Draft) {
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

    /// The gym screen (GymSessionView) is up: it ends the workout itself.
    var screenOpen = false

    func openFromPhone() {
        let workout = GymWorkout.shared
        if workout.running, !screenOpen, let gym, gym.date != WatchStore.localDate(Date()) {
            // A workout left running from an earlier day (its screen closed with
            // the ✕): it ends at its last set, then the iPhone's gym opens.
            // The iPhone closed that day long ago, so it isn't told.
            Task {
                await endWithoutScreen(at: workout.idleEnd ?? workout.lastWork, tellPhone: false)
                openFromPhone()
            }
            return
        }
        guard !workout.running else { return }
        load()
        openedFromPhone = true
    }

    /// Ends the workout with its screen closed (the cover's ✕ leaves it
    /// running), as GymSessionView.end does: idle for 30 min, finished in
    /// Training mode on the iPhone, or left from an earlier day. Saved when
    /// sets were done. Left alone, it ran on for days and held the watch on
    /// that day's gym: the iPhone's next start never opened here.
    func endWithoutScreen(at end: Date?, endedOnPhone: Bool = false, tellPhone: Bool = true) async {
        let workout = GymWorkout.shared
        guard workout.running else { return }
        let save = (gym?.setsDone ?? 0) > 0
        if !endedOnPhone { finished(at: end ?? Date()) }
        await workout.finish(save: save, at: end)
        if tellPhone, !endedOnPhone { workout.endOnPhone() }
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

    // MARK: - Swaps kept for offline

    private static let swapsKey = "watchGymSwaps"

    /// Three exercises to swap in for each exercise of the day, kept when the
    /// plan comes, so Swap works without the iPhone and without internet (an
    /// occupied machine in a gym without Wi-Fi).
    private struct Swaps: Codable {
        var date: String
        var byExercise: [String: [WatchGym.Option]]
    }

    private var swaps: Swaps? = UserDefaults.standard.data(forKey: GymStore.swapsKey)
        .flatMap { try? JSONDecoder().decode(Swaps.self, from: $0) }
    private var fetchingSwaps = false
    /// Counts sign-outs: a fetch from before one is dropped.
    private var swapsAccount = 0

    /// Fetches the swaps of today's exercises that have none kept yet, in one
    /// request (GET /app/api/gym/alternatives?exercises=); offline it fails at
    /// once and the next plan or load tries again.
    private func keepSwaps() {
        keepTechniques()
        guard let gym, gym.date == WatchStore.localDate(Date()), !fetchingSwaps, WatchAPI.signedIn else { return }
        let kept = swaps?.date == gym.date ? swaps?.byExercise ?? [:] : [:]
        var missing: [String] = []
        for name in gym.exercises.map(\.name) where kept[name] == nil && !missing.contains(name) { missing.append(name) }
        guard !missing.isEmpty else { return }
        fetchingSwaps = true
        let date = gym.date, inPlan = gym.exercises.map(\.name), account = swapsAccount
        Task { @MainActor in
            let store = GymStore.shared
            let found = await WatchAPI.gymSwaps(date: date, exercises: missing, inPlan: inPlan)
            store.fetchingSwaps = false
            guard let found, store.swapsAccount == account else { return }
            var value = (store.swaps?.date == date ? store.swaps : nil) ?? Swaps(date: date, byExercise: [:])
            // Every name asked counts as kept, so none is asked again in a loop.
            for name in missing { value.byExercise[name] = found[name] ?? [] }
            store.swaps = value
            if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: GymStore.swapsKey) }
            // Exercises that came with a plan during the request.
            store.keepSwaps()
        }
    }

    // MARK: Technique (mockup "u cviku" 5)

    private static let techniquesKey = "watchGymTechniques"

    /// The technique's steps of the exercises the plans had, in the language
    /// they came in, kept from day to day: a tap on the name shows them in a
    /// gym without Wi-Fi. An exercise outside the catalog keeps no steps.
    private struct Techniques: Codable {
        var language: String
        var byExercise: [String: [String]]
    }

    private var techniques: Techniques? = UserDefaults.standard.data(forKey: GymStore.techniquesKey)
        .flatMap { try? JSONDecoder().decode(Techniques.self, from: $0) }
    private var fetchingTechniques = false

    private var techniqueLanguage: String { W.english ? "en" : "cs" }

    /// Fetches the steps of the plan's exercises not kept yet, one request
    /// each (GET /app/api/gym/technique, as the iPhone's technique sheet), in
    /// a row; an exercise done before costs nothing. Offline the next plan tries again.
    private func keepTechniques() {
        guard let gym, !fetchingTechniques, WatchAPI.signedIn else { return }
        let language = techniqueLanguage
        let kept = techniques?.language == language ? techniques?.byExercise ?? [:] : [:]
        let missing = gym.exercises.map(\.name).reduce(into: [String]()) { if kept[$1] == nil && !$0.contains($1) { $0.append($1) } }
        guard !missing.isEmpty else { return }
        fetchingTechniques = true
        let account = swapsAccount
        Task { @MainActor in
            let store = GymStore.shared
            var found: [String: [String]] = [:]
            for name in missing {
                // nil offline: stop, the rest waits for the next plan.
                guard let steps = await WatchAPI.gymTechnique(name) else { break }
                found[name] = steps
            }
            store.fetchingTechniques = false
            guard !found.isEmpty, store.swapsAccount == account else { return }
            var value = (store.techniques?.language == language ? store.techniques : nil) ?? Techniques(language: language, byExercise: [:])
            value.byExercise.merge(found) { $1 }
            // The 80 last are plenty for anyone's exercises.
            if value.byExercise.count > 80 {
                let today = Set(store.gym?.exercises.map(\.name) ?? [])
                for name in value.byExercise.keys.filter({ !today.contains($0) }).prefix(value.byExercise.count - 80) {
                    value.byExercise[name] = nil
                }
            }
            store.techniques = value
            if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: GymStore.techniquesKey) }
        }
    }

    /// An exercise's technique steps: the kept ones, else fetched now (an
    /// exercise added during the workout); none outside the catalog, nil offline.
    func technique(_ exercise: String) async -> [String]? {
        let language = techniqueLanguage
        if techniques?.language == language, let steps = techniques?.byExercise[exercise] { return steps }
        guard let steps = await WatchAPI.gymTechnique(exercise) else { return nil }
        var value = (techniques?.language == language ? techniques : nil) ?? Techniques(language: language, byExercise: [:])
        value.byExercise[exercise] = steps
        techniques = value
        if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: Self.techniquesKey) }
        return steps
    }

    /// The swaps kept for an exercise of today, without those the plan has by now.
    func savedSwaps(for exercise: String) -> [WatchGym.Option] {
        guard let gym, let swaps, swaps.date == gym.date else { return [] }
        let inPlan = Set(gym.exercises.map(\.name))
        return (swaps.byExercise[exercise] ?? []).filter { !inPlan.contains($0.name) }
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
        swaps = nil
        swapsAccount += 1
        UserDefaults.standard.removeObject(forKey: Self.savedKey)
        UserDefaults.standard.removeObject(forKey: Self.earlierKey)
        UserDefaults.standard.removeObject(forKey: Self.swapsKey)
        UserDefaults.standard.removeObject(forKey: Self.ratingKey)
        techniques = nil
        UserDefaults.standard.removeObject(forKey: Self.techniquesKey)
    }

    private func save() {
        if let data = gym?.encoded() { UserDefaults.standard.set(data, forKey: Self.savedKey) }
    }
}
