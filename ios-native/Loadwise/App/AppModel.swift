import AuthenticationServices
import Foundation
import Observation
import SwiftUI

/// App state: signed in or not, and the Today data.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case signedOut
        case signedIn
    }

    private(set) var phase: Phase
    private(set) var today: TodaySnapshot?
    private(set) var training: TrainingSnapshot?
    var trainingError: String?
    /// The training calendar's days by date (Training → the strip and month).
    private(set) var calendar: [String: CalendarDay] = [:]
    private(set) var health: HealthSnapshot?
    var healthError: String?
    private(set) var food: FoodSnapshot?
    var foodError: String?
    /// A write or a refresh that failed while data is on screen: shown on top
    /// of every tab until tapped away (the screens' own errors show only
    /// without data).
    var notice: String?
    private(set) var loading = false
    /// The pill on top while the app syncs after opening (RootView SyncPill):
    /// "Synchronizuji…", "Synchronizováno" for a moment, or a failure to retry.
    private(set) var syncStatus: SyncStatus?
    enum SyncStatus: Equatable { case syncing, done, failed }
    private(set) var signingIn = false
    var errorMessage: String?
    /// Sample data instead of the server ("Prohlédnout ukázku", screenshots).
    private(set) var demo: Bool
    /// The last refresh failed for lack of a connection: the screens show the
    /// data saved on the phone (SnapshotCache) with a note.
    private(set) var offline = false
    /// The day on the Today, Food and Health screens, nil for today. Only Food
    /// goes ahead (meals planned or copied into the coming days).
    private(set) var selectedDate: String?
    /// Food reaches this many days past today.
    static let foodDaysAhead = 14
    /// The chosen day lies after today (Food only).
    var showsFutureDay: Bool { selectedDate.map { $0 > Self.localDate(Date()) } ?? false }
    /// Stav sportovce on Today (active, sick, injured, on a break).
    private(set) var athleteStatus: AthleteStatus?
    /// Cycle tracking (AppModel+Cycle.swift): nil until loaded, `available`
    /// false unless the profile's sex is female.
    var cycle: CycleResponse?
    /// Svaly (MuscleViews.swift): loaded by the widgets, the screen and the
    /// gym builder, whichever comes first.
    var muscleFatigue: MuscleFatigue?
    /// Apple Health's cycle data went to the server in this run of the app.
    @ObservationIgnored var cycleHealthSynced = false

    /// The server answered 426: this build is too old (src/app-version.js).
    private(set) var updateRequired = false
    /// When each tab's data last came from the server, and for which day. The
    /// screens open with the copy saved on the phone; refreshIfStale loads it again.
    @ObservationIgnored private var fetched: [AppTab: (at: Date, day: String)] = [:]
    /// Counts every load of a tab's data: the coach's text asks again after
    /// any change (CoachTextCard), and the server writes it anew when it differs.
    private(set) var dataRevision = 0
    /// Bumped only when Today comes from the server (not by a waiting write over it),
    /// so Today's cards ask their own endpoints once per load.
    private(set) var todayRevision = 0
    /// Whether food/today currently carry waiting writes over the server's answer.
    private var foodPatched = false
    private var todayPatched = false
    /// The day the screens show: the chosen one, else today (so a load from
    /// 23:58 counts as stale after midnight).
    private var shownDay: String { selectedDate ?? Self.localDate(Date()) }
    /// The "+" sheet is open: what it adds goes to today, whatever day the
    /// screens show (weight always did).
    var writesToday = false
    /// The day food and drinks are written to.
    private var writeDay: String { writesToday ? Self.localDate(Date()) : shownDay }
    /// The open tab and each tab's navigation stack, so cards, widgets and
    /// links (loadwise://open/sleep) can open any detail.
    var tab: AppTab = .today
    var paths: [AppTab: [AppRoute]] = [:]
    /// After the first sign-in: the profile setup has not been done yet.
    var needsSetup = false
    /// After the first e-mail sign-in on this phone: the "Příště přes Face ID"
    /// sheet, shown before the setup (RootView).
    var passkeyOffer = false
    /// A full-screen flow (Režim tréninku) hides the tab bar.
    var immersive = false
    /// Režim tréninku hidden with its arrow: the workout goes on and a bar
    /// over the tab bar leads back (MinimizedGymBar).
    var minimizedGym: MinimizedGym?
    /// Writes made without signal, oldest first (Outbox.swift); the screens
    /// show them meanwhile.
    private(set) var outbox: [OutboxItem] = []
    /// A waiting write the server turned down, shown until tapped away.
    var outboxNote: String?
    /// A done activity just sent to the apps chosen in Synchronizace: the
    /// toast "Odesláno do 2 aplikací" and its sheet (SyncViews.swift).
    var syncReport: SyncReport?
    /// A deleted workout waiting a few seconds for "Zpět" (RootView): the
    /// deletion reaches the server and Apple Health only after that.
    var undoToast: PlanToast?

    /// hide: the planned event that leaves the week and the calendar at once;
    /// "Zpět" brings it back with the next load.
    func deleteLater(_ title: String, hide eventId: String? = nil, commit: @escaping () async -> Void) {
        if let eventId {
            training?.sessions?.removeAll { $0.eventId == eventId }
            for (day, value) in calendar where value.activities.contains(where: { $0.eventId == eventId }) {
                calendar[day]?.activities.removeAll { $0.eventId == eventId }
            }
        }
        let undo: () async -> Void = eventId == nil ? {} : { [weak self] in
            await self?.refreshTraining()
            await self?.refresh()
        }
        undoToast = PlanToast(title: title, note: nil, cancelled: true, undo: undo, commit: commit)
    }
    /// The Today and Food answers as they came, under the waiting writes.
    @ObservationIgnored private var todayBase: Data?
    @ObservationIgnored private var foodBase: Data?
    @ObservationIgnored private var sendingOutbox = false
    /// Writes that just went out, still drawn over Food and Today until each
    /// screen's next answer from the server has them, so nothing blinks away.
    @ObservationIgnored private var settlingFood: [(id: UUID, overlay: OutboxOverlay)] = []
    @ObservationIgnored private var settlingToday: [(id: UUID, overlay: OutboxOverlay)] = []
    /// The server's id of a meal or drink logged on the phone (by its local
    /// id), so "Vrátit" or a delete right after the save finds it.
    @ObservationIgnored private var sentIds: [Int: Int] = [:]
    /// The write on its way now; a write made meanwhile asks for one more round.
    @ObservationIgnored private var sendingItem: UUID?
    @ObservationIgnored private var sendAgain = false
    @ObservationIgnored private var reloadTodayAfterSend = false
    @ObservationIgnored private var network: NetworkWatch?

    let api: APIClient
    private let auth: AuthService
    /// Passkeys (Data/Passkeys.swift): the sign-in and "Příště přes Face ID".
    @ObservationIgnored let passkeys: PasskeyService

    init(api: APIClient = APIClient(), demo: Bool = false) {
        self.api = api
        self.auth = AuthService(api: api)
        self.passkeys = PasskeyService()
        self.demo = demo
        if demo {
            phase = .signedIn
            today = DemoData.today
            training = DemoData.training
            health = DemoData.health
            food = DemoData.food
            calendar = DemoData.calendarByDate
        } else {
            phase = api.hasSession ? .signedIn : .signedOut
            outbox = OutboxStore.load()
            if phase == .signedIn { loadSaved() }
        }
        // "-tab training" (simulator screenshots) opens another tab first.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count {
            tab = ["training": AppTab.training, "food": .food, "health": .health][args[i + 1]] ?? .today
        }
        // "-open readiness" (the website's screenshots) opens a detail as its link
        // would, without the system's "Open in Aurin?" question that simctl openurl brings.
        if let i = args.firstIndex(of: "-open"), i + 1 < args.count,
           let url = URL(string: "loadwise://open/\(args[i + 1])") {
            handle(url)
        }
        // The network back: what waited goes out and the screens load again.
        if !demo {
            network = NetworkWatch { [weak self] in await self?.networkBack() }
        }
        // After every stored property is set: the closure captures self.
        api.onUpdateRequired = { [weak self] in
            Task { @MainActor in self?.updateRequired = true }
        }
        api.onSubscriptionRequired = { [weak self] in
            Task { @MainActor in if let self { Paywall.present(self) } }
        }
        if !demo {
            Self.live = self
            // Water from Siri or Shortcuts (AddWaterIntent) goes out now, not on the next refresh.
            drinkObserver = NotificationCenter.default.addObserver(forName: PendingDrinks.added, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in _ = await self?.sendOutbox(reloadToday: true) }
            }
        }
    }

    /// The signed-in app's model, for Siri and Shortcuts (SiriShortcuts.swift),
    /// which run in the app's process but outside its views.
    static weak var live: AppModel?
    @ObservationIgnored private var drinkObserver: NSObjectProtocol?

    /// The screens as they were last time, until the server answers.
    private func loadSaved() {
        today = SnapshotCache.load(TodaySnapshot.self, key: "today")?.value
        training = SnapshotCache.load(TrainingSnapshot.self, key: "training")?.value
        health = SnapshotCache.load(HealthSnapshot.self, key: "health")?.value
        food = SnapshotCache.load(FoodSnapshot.self, key: "food")?.value
        todayBase = OutboxStore.savedSnapshot("today")
        foodBase = OutboxStore.savedSnapshot("food")
        applyOutbox()
        SnapshotCache.prune(today: Self.localDate(Date()))
    }

    /// Notes whether a refresh reached the server; true when the error was a
    /// missing connection and saved data is on screen instead.
    nonisolated static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        return (error as NSError).domain == NSURLErrorDomain && (error as NSError).code == NSURLErrorCancelled
    }

    private func noteConnection(_ error: Error?) -> Bool {
        let lost = error.map(Outbox.isNoConnection) ?? false
        offline = lost
        return lost
    }

    func path(_ tab: AppTab) -> Binding<[AppRoute]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
    }

    /// A detail on top of the current tab's screens.
    func push(_ route: AppRoute) {
        paths[tab, default: []].append(route)
    }

    /// Opens a detail on its own tab (widgets, notifications, links).
    func open(_ route: AppRoute) {
        tab = route.tab
        paths[route.tab] = [route]
    }

    func handle(_ url: URL) {
        if let route = AppRoute(url: url) {
            open(route)
        } else if let tab = TabLink.tab(url) {
            self.tab = tab
            paths[tab] = []
        }
    }

    /// Whether the profile setup (GET /app/api/onboarding) still waits; asked
    /// once per sign-in, remembered after it is done.
    func checkSetup() async {
        guard !demo, phase == .signedIn else { return }
        // An account set up before the health-data consent still has to give it.
        let consent = (try? await api.healthConsentNeeded()) ?? false
        if UserDefaults.standard.bool(forKey: Self.setupDoneKey) {
            if consent { needsSetup = true }
            return
        }
        if let done = try? await api.onboardingCompleted() {
            needsSetup = !done || consent
            if done { UserDefaults.standard.set(true, forKey: Self.setupDoneKey) }
        }
    }

    func finishSetup() async {
        UserDefaults.standard.set(true, forKey: Self.setupDoneKey)
        needsSetup = false
        await refresh()
        await refreshFood()
        await refreshHealth()
    }

    nonisolated static let setupDoneKey = "setupDone"
    nonisolated static let accountInitialKey = "accountInitial"

    /// The account's name and e-mail for Profil, and the first letter of the
    /// name for the settings button while there is no photo.
    func loadAccountInitial() async {
        guard !demo, phase == .signedIn, let account = try? await api.account() else { return }
        let defaults = UserDefaults.standard
        defaults.set(account.name, forKey: AvatarStore.nameKey)
        defaults.set(account.email, forKey: AvatarStore.emailKey)
        let shown = defaults.string(forKey: Self.displayNameKey)?.nilIfBlank ?? account.name ?? account.email
        if let first = shown?.trimmingCharacters(in: .whitespaces).first {
            defaults.set(String(first).uppercased(), forKey: Self.accountInitialKey)
        }
    }

    /// The name the user typed in Profil (kept in the profile on the server too).
    nonisolated static let displayNameKey = "displayName"

    func signIn() async {
        signingIn = true
        defer { signingIn = false }
        do {
            try await auth.signIn()
            await signedIn()
            await refresh()
        } catch is CancellationError {
            // The user closed the sign-in sheet.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Signs in with what Sign in with Apple returned; nonce is the raw value
    /// whose hash went into the request.
    func signIn(apple credential: ASAuthorizationAppleIDCredential, nonce: String) async {
        guard let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
            errorMessage = L10n.tr("Apple nevrátil identitu účtu. Zkus to znovu.")
            return
        }
        signingIn = true
        defer { signingIn = false }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let name = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
        do {
            try await api.appleLogin(identityToken: token, authorizationCode: code, nonce: nonce, name: name)
            await signedIn()
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Signs in with the code from the e-mail. The first time on this phone
    /// the app then offers a passkey ("Příště přes Face ID", RootView).
    func signIn(email: String, code: String) async throws {
        try await api.verifyEmailLogin(email: email, code: code)
        if ServerChoice.current.passkeys && !PasskeyService.mayHaveOne { passkeyOffer = true }
        await signedIn()
        await refresh()
    }

    /// Signs in with a passkey of this phone (Data/Passkeys.swift). Throws
    /// CancellationError when the sheet was closed; any other error means the
    /// e-mail code is the way in.
    func signInWithPasskey() async throws {
        signingIn = true
        defer { signingIn = false }
        try await passkeys.signIn(api: api)
        await signedIn()
        await refresh()
    }

    /// After either sign-in: no sample data left on screen, and what an expired
    /// session left behind (writes waiting for signal, the photo) is kept only
    /// for the same account.
    private func signedIn() async {
        if demo {
            today = nil; training = nil; health = nil; food = nil
            calendar = [:]
            demo = false
        }
        phase = .signedIn
        errorMessage = nil
        let defaults = UserDefaults.standard
        if let previous = defaults.string(forKey: AvatarStore.emailKey), let account = try? await api.account(), account.email != previous {
            outbox = []
            OutboxStore.save([])
            AvatarStore.remove()
            defaults.removeObject(forKey: Self.displayNameKey)
            SnapshotCache.clear()
            today = nil; training = nil; health = nil; food = nil
            calendar = [:]
        }
        await loadAccountInitial()
        // Back in the account that read Apple Health before signing out.
        await AppleHealth.shared.resume(account: defaults.string(forKey: AvatarStore.emailKey), api: api)
        await checkSetup()
        // The morning readiness push for this account (PushRegistration.swift).
        await PushRegistration.refresh(api: api)
    }

    /// Connects a data source; the event says how it went ("intervals",
    /// "google-cancelled", "intervals-failed"…), nil when the sheet was closed.
    func connect(provider: String) async throws -> String? {
        do { return try await auth.connect(provider: provider) } catch is CancellationError { return nil }
    }

    func showDemo() {
        demo = true
        today = DemoData.today
        training = DemoData.training
        health = DemoData.health
        food = DemoData.food
        calendar = DemoData.calendarByDate
        phase = .signedIn
    }

    /// announce: the app was opened or pulled down, so the pill says it syncs.
    func refresh(announce: Bool = false) async {
        guard !demo, phase == .signedIn else { return }
        loading = true
        defer { loading = false }
        if announce { syncStatus = .syncing }
        await sendOutbox()
        let health = AppleHealth.shared
        // Until a late-morning sync, last night and the morning's HRV from the
        // watch go out before Today is computed. Later in the day Today loads
        // alongside the sync and again only when it brought something new.
        var sync: Task<AppleHealth.SyncOutcome, Never>?
        var changed = false
        if health.hasMorningData {
            let api = api
            sync = Task { await health.run(api: api) }
        } else {
            changed = await health.run(api: api).changed
        }
        do {
            try await loadToday()
            // The day is on screen: the arrows and swipes work again.
            loading = false
            if let sync, await sync.value.changed { changed = true; try? await loadToday() }
            // New nights or workouts reach the Health snapshot too: the sleep
            // detail opened from Today shows it.
            if changed {
                fetched[.health] = nil
                if self.health != nil { Task { await self.refreshHealth() } }
            }
            async let status = try? api.athleteStatus()
            if selectedDate == nil, let today {
                async let cycle: Void = loadCycle()
                await Reminders.reschedule(from: today)
                WidgetBridge.update(today)
                prefetchYesterday()
                await cycle
            }
            if let status = await status { athleteStatus = status }
            if syncStatus == .syncing { finishSync(.done) }
        } catch APIError.unauthorized {
            syncStatus = nil
            signOut(expired: true)
        } catch {
            // Without signal the saved screen stays; an error only without one.
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { if syncStatus == .syncing { syncStatus = nil }; return }
            let lost = noteConnection(error)
            if !(lost && today != nil) { errorMessage = error.localizedDescription }
            // Offline has its own note; the pill takes a failed sync.
            if syncStatus == .syncing {
                finishSync(lost ? nil : .failed)
            } else if !lost && today != nil {
                notice = error.localizedDescription
            }
            // "Bez připojení" alone hides that a Wi-Fi wants a sign-in: say so.
            if lost, (error as? URLError)?.code == .secureConnectionFailed { notice = error.localizedDescription }
        }
    }

    /// Today of the shown day from the server, with the waiting writes over it.
    private func loadToday() async throws {
        let settled = Set(settlingToday.map { $0.id })
        let day = selectedDate
        let (snapshot, data) = try await api.todayData(date: day)
        // Another day was chosen meanwhile: its own load shows it.
        guard selectedDate == day else { return }
        today = snapshot
        todayBase = data
        todayPatched = false
        settlingToday.removeAll { settled.contains($0.id) }
        fetched[.today] = (Date(), shownDay)
        dataRevision += 1
        todayRevision += 1
        applyOutbox()
        errorMessage = nil
        _ = noteConnection(nil)
    }

    /// Today again after a meal or drink went out: without the Apple Health
    /// sync, the cycle and the athlete status, which a meal does not change.
    private func reloadToday() async {
        guard !demo, phase == .signedIn else { return }
        do {
            try await loadToday()
            if selectedDate == nil, let today {
                await Reminders.reschedule(from: today)
                WidgetBridge.update(today)
            }
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // The write stays drawn over the screen; the next load brings it.
        }
    }

    /// "Synchronizováno" goes away after 3 seconds; a failure stays until tapped.
    private func finishSync(_ status: SyncStatus?) {
        syncStatus = status
        guard status == .done else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            if syncStatus == .done { syncStatus = nil }
        }
    }

    /// A tap on the failed pill: try again, or put it away.
    func dismissSyncFailure() { if syncStatus == .failed { syncStatus = nil } }

    /// A tab's data again unless it came from the server in the last 5 minutes
    /// for the same day. Without this a tab kept the copy saved on the phone
    /// (yesterday's night on Health while Today already had last night).
    func refreshIfStale(_ tab: AppTab) async {
        guard !demo, phase == .signedIn, !refreshing.contains(tab) else { return }
        // Today is already loading (the app came back): no second request.
        if tab == .today && loading { return }
        // A coming day is Food's only: Today and Health go back to today.
        if tab != .food && tab != .training && showsFutureDay { selectedDate = nil }
        let day = tab == .training ? Self.localDate(Date()) : shownDay
        if let last = fetched[tab], last.day == day, Date().timeIntervalSince(last.at) < 300 { return }
        refreshing.insert(tab)
        defer { refreshing.remove(tab) }
        switch tab {
        case .today: await refresh(announce: true)
        case .training: await refreshTraining()
        case .health: await refreshHealth()
        case .food: await refreshFood()
        }
    }
    @ObservationIgnored private var refreshing: Set<AppTab> = []

    /// The morning check-in on Today. It lowers the readiness, so Today loads
    /// again; without signal the answer waits in the outbox (a newer one
    /// replaces it) and Today follows once it went out.
    func setMorningCheckin(_ feeling: String?) async throws {
        guard !demo, let today else { return }
        guard try await deliver(APIClient.morningCheckinItem(feeling, date: today.date)) else { return }
        await refresh()
        if health != nil { await refreshHealth() }
    }

    /// A new Stav sportovce. The coach and the plans follow it, so Today and
    /// Training load again.
    func setAthleteStatus(_ status: String, until: String?, note: String?, cancel: [String] = []) async throws {
        guard !demo else { athleteStatus = AthleteStatus(status: status, note: note, statusUntil: until); return }
        athleteStatus = try await api.setAthleteStatus(status, until: until, note: note, cancel: cancel)
        await refresh()
        if training != nil { await refreshTraining() }
    }

    /// Every tab again, e.g. after a change of language (the server's texts).
    func refreshAll() async {
        fetched = [:]
        await refresh()
        if training != nil { await refreshTraining() }
        if health != nil { await refreshHealth() }
        if food != nil { await refreshFood() }
    }

    func refreshTraining() async {
        guard !demo, phase == .signedIn else { return }
        do {
            training = try await api.training()
            fetched[.training] = (Date(), Self.localDate(Date()))
            dataRevision += 1
            trainingError = nil
            _ = noteConnection(nil)
            // The calendar too: loadCalendar alone fetches only missing days, so a
            // moved or deleted session, or a new activity, stayed as it was.
            let today = Self.localDate(Date())
            await loadCalendar(from: ISODay.shift(today, -14), to: ISODay.shift(today, 28), force: true)
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && training != nil) { trainingError = error.localizedDescription }
            if !lost && training != nil { notice = error.localizedDescription }
        }
    }

    func refreshHealth() async {
        guard !demo, phase == .signedIn else { return }
        await AppleHealth.shared.sync(api: api)
        do {
            let day = selectedDate
            let value = try await api.health(date: day)
            guard selectedDate == day else { return }
            health = value
            fetched[.health] = (Date(), shownDay)
            dataRevision += 1
            healthError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && health != nil) { healthError = error.localizedDescription }
            if !lost && health != nil { notice = error.localizedDescription }
        }
    }

    func refreshFood() async {
        guard !demo, phase == .signedIn else { return }
        let settled = Set(settlingFood.map { $0.id })
        do {
            let day = selectedDate
            let (snapshot, data) = try await api.foodData(date: day)
            guard selectedDate == day else { return }
            food = snapshot
            foodBase = data
            settlingFood.removeAll { settled.contains($0.id) }
            // The day's food and water to Apple Health when switched on in Synchronizace.
            Task { await AppleHealthExport.shared.saveFoodDay(snapshot) }
            fetched[.food] = (Date(), shownDay)
            dataRevision += 1
            applyOutbox()
            foodError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && food != nil) { foodError = error.localizedDescription }
            if !lost && food != nil { notice = error.localizedDescription }
        }
    }

    /// A drink of any kind; true when it was saved (or waits for signal).
    @discardableResult
    func addDrink(ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        write(Self.drinkItem(ml: ml, kind: kind, date: writeDay))
        return true
    }

    /// A drink from Siri or Shortcuts: always today, whatever day the app shows.
    func addDrinkToday(ml: Int, kind: String) {
        guard !demo else { return }
        write(Self.drinkItem(ml: ml, kind: kind, date: Self.localDate(Date())))
    }

    /// POST /app/api/fluids with the time it was drunk, so a later send keeps it.
    static func drinkItem(ml: Int, kind: String, date: String, at: Date = Date()) -> OutboxItem {
        let localId = Outbox.localId()
        var body: JSONObject = ["ml": .number(Double(ml)), "kind": .string(kind), "date": .string(date),
                                "requestId": .string(UUID().uuidString)]
        if date == Self.localDate(at) { body["at"] = .string(Outbox.clock(at, withDay: true)) }
        return OutboxItem(path: "/app/api/fluids", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Pití"),
                          overlay: OutboxOverlay(kind: .drink, date: date, id: localId, ml: Double(ml), drink: kind,
                                                 time: date == Self.localDate(at) ? Outbox.clock(at) : nil))
    }

    // MARK: - Writes without signal

    /// A meal or drink shows at once and goes out in the background, so the
    /// sheet closes without waiting for the server. Without signal it waits in
    /// the outbox; one the server refuses comes back as the outbox note.
    /// send: false when several are written at once and sent after the last.
    private func write(_ item: OutboxItem, send: Bool = true) {
        // The saved copy of another day no longer holds; its next load saves it anew.
        if let date = item.overlay?.date, date != Self.localDate(Date()) {
            for screen in ["today", "food", "health"] { SnapshotCache.remove(key: SnapshotCache.dayKey(screen, date)) }
        }
        enqueue(item)
        if send { Task { await sendOutbox(reloadToday: true) } }
    }

    /// Sends a write now; without signal it waits in the outbox and shows on
    /// the screens meanwhile. True when it went out now. Throws when the
    /// server refused it.
    private func deliver(_ item: OutboxItem) async throws -> Bool {
        // The same gym day already waits: this one goes after it (the newer wins).
        if let key = item.key, outbox.contains(where: { $0.key == key }) {
            enqueue(item)
            await sendOutbox()
            return false
        }
        do {
            try await api.sendQueued(item)
            return true
        } catch where Outbox.isNoConnection(error) {
            enqueue(item)
            offline = true
            return false
        }
    }

    private func enqueue(_ item: OutboxItem) {
        if let key = item.key, let i = outbox.firstIndex(where: { $0.key == key }) {
            outbox[i] = item
        } else {
            outbox.append(item)
        }
        saveOutbox()
    }

    private func saveOutbox() {
        OutboxStore.save(outbox)
        applyOutbox()
    }

    /// The Today and Food screens: the server's answer with the waiting writes.
    private func applyOutbox() {
        let overlays = outbox.compactMap(\.overlay)
        // Nothing waiting and nothing shown over the server's answer: no second decode.
        let foodLayers = settlingFood.map({ $0.overlay }) + overlays, todayLayers = settlingToday.map({ $0.overlay }) + overlays
        if let foodBase, !foodLayers.isEmpty || foodPatched,
           let value = try? JSONDecoder().decode(FoodSnapshot.self, from: OutboxPatch.food(foodBase, foodLayers)) { food = value; foodPatched = !foodLayers.isEmpty }
        if let todayBase, !todayLayers.isEmpty || todayPatched,
           let value = try? JSONDecoder().decode(TodaySnapshot.self, from: OutboxPatch.today(todayBase, todayLayers)) { today = value; todayPatched = !todayLayers.isEmpty }
    }

    /// Water added from the widget while the app was closed joins the outbox.
    private func takeWidgetDrinks() {
        let drinks = PendingDrinks.take()
        guard !drinks.isEmpty else { return }
        outbox += drinks.map { Self.drinkItem(ml: $0.ml, kind: "water", date: $0.date) }
        saveOutbox()
    }

    /// Sends the waiting writes in order and loads Food (and Health) again.
    /// reloadToday: Today too, without the Apple Health sync (after a meal or
    /// drink; refresh() loads Today itself). True when something went out.
    @discardableResult
    func sendOutbox(reloadToday reload: Bool = false) async -> Bool {
        guard !demo, phase == .signedIn else { return false }
        if reload { reloadTodayAfterSend = true }
        // Already sending: the running loop takes the new write in one more round.
        guard !sendingOutbox else { sendAgain = true; return false }
        sendingOutbox = true
        defer { sendingOutbox = false }
        var sentAny = false
        repeat {
            sendAgain = false
            takeWidgetDrinks()
            guard !outbox.isEmpty else { break }
            let sent = await sendWaiting()
            saveOutbox()
            if sent {
                sentAny = true
                offline = false
                let today = reloadTodayAfterSend
                reloadTodayAfterSend = false
                await reloadAfterWrites(today: today)
            }
        } while sendAgain
        return sentAny
    }

    /// The waiting writes out in order. Stops at the first that still finds no
    /// connection; one the server refuses (4xx) is dropped with a note.
    private func sendWaiting() async -> Bool {
        var sent = false
        while let item = outbox.first {
            sendingItem = item.id
            defer { sendingItem = nil }
            do {
                let answer = try await api.sendQueued(item)
                settle(item, answer: answer)
                outbox.removeAll { $0.id == item.id }
                sent = true
            } catch OutboxRefusal.rejected(let message) {
                outbox.removeAll { $0.id == item.id }
                outboxNote = L10n.f("Neuloženo – %@: %@", item.label, message)
            } catch OutboxRefusal.retry(let message) {
                // A server error: later, but not forever.
                guard let i = outbox.firstIndex(where: { $0.id == item.id }) else { continue }
                outbox[i].failures += 1
                if outbox[i].failures >= 5 {
                    outbox.remove(at: i)
                    outboxNote = L10n.f("Neuloženo – %@: %@", item.label, message)
                    continue
                }
                break
            } catch {
                // Still no signal (or the session ended): the rest waits.
                if Outbox.isNoConnection(error) { offline = true }
                break
            }
            OutboxStore.save(outbox)
        }
        return sent
    }

    /// A write that just went out stays drawn until Food and Today load it from
    /// the server; a new meal or drink takes its server id.
    private func settle(_ item: OutboxItem, answer: Data) {
        guard var overlay = item.overlay else { return }
        if let local = overlay.id, local < 0, let id = Outbox.entryId(answer) {
            sentIds[local] = id
            overlay.id = id
        }
        settlingFood.append((item.id, overlay))
        settlingToday.append((item.id, overlay))
    }

    /// Food, Health and Today load at once after writes went out.
    private func reloadAfterWrites(today: Bool) async {
        await withTaskGroup(of: Void.self) { group in
            if food != nil { group.addTask { await self.refreshFood() } }
            if health != nil { group.addTask { await self.refreshHealth() } }
            if today { group.addTask { await self.reloadToday() } }
        }
    }

    /// A meal or drink logged on the phone (negative local id) as the server
    /// knows it: nil while it still waits to be sent, its server id once sent.
    private func serverId(of localId: Int) async -> Int? {
        // On its way right now: its answer brings the id.
        while let sending = sendingItem, outbox.first(where: { $0.id == sending })?.overlay?.id == localId {
            try? await Task.sleep(for: .milliseconds(100))
        }
        return sentIds[localId]
    }

    /// The network came back: send what waited and load the screens again.
    private func networkBack() async {
        guard !demo, phase == .signedIn, offline || !outbox.isEmpty else { return }
        await refresh()
        if food != nil { await refreshFood() }
    }

    /// A weigh-in (kg); waits for signal when there is none. Throws the server's
    /// refusal. True when it went out now. reload: false for Siri, which waits
    /// for the answer and needs no screens loaded.
    @discardableResult
    func addWeight(kg: Double, reload: Bool = true) async throws -> Bool {
        guard !demo else { return true }
        let date = Self.localDate(Date())
        let item = Self.weightItem(kg: kg, date: date)
        // Apple Health gets it too when weight is switched on in Synchronizace.
        Task { await AppleHealthExport.shared.saveWeight(kg: kg, date: date) }
        let sent = try await deliver(item)
        if sent && reload {
            await refreshHealth()
            await refresh()
        }
        return sent
    }

    /// POST /app/api/weight; the requestId keeps one weigh-in when it goes out twice.
    nonisolated static func weightItem(kg: Double, date: String) -> OutboxItem {
        let body: JSONObject = ["kg": .number(kg), "date": .string(date), "requestId": .string(UUID().uuidString)]
        return OutboxItem(path: "/app/api/weight", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Váha"),
                          overlay: OutboxOverlay(kind: .weight, date: date, kg: kg))
    }

    // MARK: - Synchronizace

    /// The server destinations a done activity goes to (Google Health,
    /// Intervals.icu, Strava), as last seen in Synchronizace: the toast lists
    /// them as "odešle se" while there is no signal.
    static let activityDestinationsKey = "sync.activityDestinations"

    /// A done activity (a gym session, a workout typed in) to the apps chosen
    /// in Synchronizace; `sends` when the server already sent it (a manual
    /// workout). Shows the toast when it went anywhere.
    func shareActivity(_ activity: ActivityToSync, sends: [SyncSend]? = nil) async {
        guard !demo else { return }
        var rows: [SyncReport.Row] = []
        if let sends {
            rows = sends.map { SyncReport.Row(destination: $0.destination, status: SyncReport.status($0.status), message: $0.message, needsScope: $0.needsScope) }
        } else {
            do {
                let result = try await api.sendActivity(activity)
                rows = (result.sends ?? []).map { SyncReport.Row(destination: $0.destination, status: SyncReport.status($0.status), message: $0.message, needsScope: $0.needsScope) }
            } catch where Outbox.isNoConnection(error) {
                // Without signal it waits in the outbox, after the activity itself.
                enqueue(OutboxItem(path: "/app/api/sync/activity", method: "POST", body: OutboxItem.json(activity.body),
                                   label: activity.name, key: "sync:" + activity.key))
                offline = true
                let waiting = UserDefaults.standard.stringArray(forKey: Self.activityDestinationsKey) ?? []
                rows = waiting.map { SyncReport.Row(destination: $0, status: .pending) }
            } catch {
                rows = []
            }
        }
        let apple = AppleHealthExport.shared
        if apple.prefs.pushActivities {
            let failed = await apple.saveWorkout(activity)
            rows.insert(SyncReport.Row(destination: "apple", status: failed == nil ? .sent : .error, message: failed), at: 0)
        }
        rows.sort { (SyncApp.order.firstIndex(of: $0.destination) ?? 9) < (SyncApp.order.firstIndex(of: $1.destination) ?? 9) }
        syncReport = rows.isEmpty ? nil : SyncReport(activity: activity, rows: rows)
    }

    /// "Zkusit znovu" in the toast's sheet.
    func retrySync(_ destination: String) async {
        guard var report = syncReport, let i = report.rows.firstIndex(where: { $0.destination == destination }) else { return }
        report.rows[i].working = true
        syncReport = report
        var row = report.rows[i]
        if destination == "apple" {
            let failed = await AppleHealthExport.shared.saveWorkout(report.activity)
            row.status = failed == nil ? .sent : .error
            row.message = failed
        } else {
            do {
                // Google first needs the permission to write workouts.
                if row.needsScope != nil {
                    guard let event = try await connect(provider: "google-extra"), event == "google" else {
                        row.working = false
                        update(row)
                        return
                    }
                }
                let send = try await api.retrySend(key: report.activity.key, destination: destination)
                row.status = SyncReport.status(send.status)
                row.message = send.message
                row.needsScope = send.needsScope
            } catch {
                // Never reached the server (it waited without signal): send it whole.
                if let result = try? await api.sendActivity(report.activity), let send = result.sends?.first(where: { $0.destination == destination }) {
                    row.status = SyncReport.status(send.status)
                    row.message = send.message
                    row.needsScope = send.needsScope
                } else {
                    row.status = .error
                    row.message = error.localizedDescription
                }
            }
        }
        row.working = false
        update(row)
    }

    private func update(_ row: SyncReport.Row) {
        guard var report = syncReport, let i = report.rows.firstIndex(where: { $0.destination == row.destination }) else { return }
        report.rows[i] = row
        syncReport = report
    }

    /// Saves a day's gym sheet; without signal the newest sheet of the day
    /// waits. Throws the server's refusal.
    func saveGym(_ day: GymDay, date: String) async throws {
        guard !demo else { return }
        GymDayCache.save(day, date: date)
        // One save of a day at a time. Sets ticked meanwhile go out after it,
        // only the newest sheet, so an older sheet can never land last.
        if gymSaving.contains(date) { gymPending[date] = day; return }
        gymSaving.insert(date)
        defer { gymSaving.remove(date) }
        var next: GymDay? = day
        while let current = next {
            gymPending[date] = nil
            let item = OutboxItem(path: "/app/api/gym", method: "POST", body: OutboxItem.json(APIClient.gymBody(current, date: date)),
                                  label: L10n.tr("Posilovna"), key: "gym:" + date)
            _ = try await deliver(item)
            next = gymPending[date]
        }
    }
    @ObservationIgnored private var gymSaving: Set<String> = []
    @ObservationIgnored private var gymPending: [String: GymDay] = [:]

    /// A day's gym sheet: the one waiting to be sent, the server's, or the
    /// last one seen on the phone when there is no signal.
    func gymDay(date: String) async throws -> GymDay {
        if let waiting = outbox.last(where: { $0.key == "gym:" + date }), let day = Outbox.gymDay(waiting, date: date) { return day }
        do {
            let day = try await api.gym(date: date)
            GymDayCache.save(day, date: date)
            return day
        } catch where Outbox.isNoConnection(error) {
            if let saved = GymDayCache.load(date: date) { return saved }
            throw error
        }
    }

    /// Loads the calendar days that are not here yet (all of them with force).
    func loadCalendar(from start: String, to end: String, force: Bool = false) async {
        let days = ISODay.range(start, end)
        guard force || days.contains(where: { calendar[$0] == nil }) else { return }
        if demo { return }
        guard phase == .signedIn, let result = try? await api.trainingCalendar(start: start, end: end) else { return }
        for day in result.days { calendar[day.date] = day }
    }

    func updateDrink(id: Int, ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            if let sent = await serverId(of: id) {
                id = sent
            } else {
                // A drink not sent yet changes while it waits.
                guard let i = outbox.firstIndex(where: { $0.overlay?.id == id }) else { return true }
                var fields = outbox[i].fields
                fields["ml"] = .number(Double(ml))
                fields["kind"] = .string(kind)
                outbox[i].body = OutboxItem.json(fields)
                outbox[i].overlay?.ml = Double(ml)
                outbox[i].overlay?.drink = kind
                saveOutbox()
                return true
            }
        }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids", method: "PATCH",
                              body: OutboxItem.json(["id": JSONValue.number(Double(id)), "ml": .number(Double(ml)), "kind": .string(kind)]),
                              label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .editDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: Double(ml), drink: kind,
                                                     previousMl: old?.ml, previousDrink: old?.kind))
        write(item)
        return true
    }

    @discardableResult
    func deleteDrink(id: Int) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            guard let sent = await serverId(of: id) else { dropWaiting(localId: id); return true }
            id = sent
        }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids?id=\(id)", method: "DELETE", body: OutboxItem.json(JSONObject()), label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .removeDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: old?.ml, drink: old?.kind))
        write(item)
        return true
    }

    /// A meal or drink taken back before it was sent.
    private func dropWaiting(localId: Int) {
        outbox.removeAll { $0.overlay?.id == localId && ($0.overlay?.kind == .food || $0.overlay?.kind == .drink) }
        saveOutbox()
    }

    /// Logs a food: it shows at once and goes out in the background (nil; a
    /// refusal comes later as the outbox note).
    /// `day`: another day than the one shown (a food the coach drafted from a sentence);
    /// `refreshAfter: false` when several are logged at once and sent after the last.
    func logFood(product: FoodProduct, amount: Double, meal: String, day: String? = nil, refreshAfter: Bool = true) async -> String? {
        guard !demo else { return nil }
        let date = day ?? writeDay
        let request = FoodLogRequest(date: date, product: product.forLogging, quantity: amount, unit: product.unit, mealType: meal)
        let overlay = OutboxOverlay(kind: .food, date: date, id: Outbox.localId(), name: product.name, meal: meal,
                                    kcal: product.kcal(for: amount), protein: product.grams(product.protein_100g, for: amount),
                                    carbs: product.grams(product.carbs_100g, for: amount), fat: product.grams(product.fat_100g, for: amount),
                                    time: date == Self.localDate(Date()) ? Outbox.clock() : nil)
        // Today's meal keeps the time it was logged, also when it waits for signal.
        var extra: JSONObject = ["requestId": .string(UUID().uuidString)]
        if date == Self.localDate(Date()) { extra["time"] = .string(Outbox.clock()) }
        let item = OutboxItem(path: "/app/api/food/log", method: "POST", body: OutboxItem.json(request, adding: extra),
                              label: product.name, overlay: overlay)
        write(item, send: refreshAfter)
        return nil
    }

    /// true when it was deleted (or waits for signal).
    @discardableResult
    func deleteFood(id: Int) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            guard let sent = await serverId(of: id) else { dropWaiting(localId: id); return true }
            id = sent
        }
        let entry = food?.meals.flatMap(\.entries).first { $0.id == id }
        let item = OutboxItem(path: "/app/api/food/entry", method: "DELETE", body: OutboxItem.json(["id": JSONValue.number(Double(id))]),
                              label: entry?.name ?? L10n.tr("Jídlo"),
                              overlay: OutboxOverlay(kind: .removeFood, date: food?.date ?? Self.localDate(Date()), id: id,
                                                     kcal: entry?.kcal, protein: entry?.protein, carbs: entry?.carbs, fat: entry?.fat))
        write(item)
        return true
    }

    @discardableResult
    func addWater(ml: Int) async -> Bool {
        await addDrink(ml: ml, kind: "water")
    }

    /// One day back or forward from the day on screen; forward stops at today,
    /// on Food (ahead) two weeks later.
    func showDay(offset: Int, ahead: Bool = false) async {
        let todayDate = Self.localDate(Date())
        guard !demo, let date = Self.shift(selectedDate ?? todayDate, by: offset) else { return }
        if date > todayDate {
            guard ahead, let last = Self.shift(todayDate, by: Self.foodDaysAhead), date <= last else { return }
            selectedDate = date
            await refreshFood()
            return
        }
        selectedDate = date == todayDate ? nil : date
        showSaved(selectedDate)
        await refreshDay()
    }

    /// A day picked in Today's week strip; today or earlier.
    func showDate(_ date: String) async {
        let todayDate = Self.localDate(Date())
        guard !demo, date <= todayDate, date != (selectedDate ?? todayDate) else { return }
        selectedDate = date == todayDate ? nil : date
        showSaved(selectedDate)
        await refreshDay()
    }

    func showToday() async {
        guard selectedDate != nil else { return }
        selectedDate = nil
        showSaved(nil)
        await refreshDay()
    }

    /// The day changed: Today, and Food and Health when they were opened.
    func refreshDay() async {
        if let date = selectedDate {
            await loadOtherDay(date)
            return
        }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.refresh() }
            if food != nil { group.addTask { await self.refreshFood() } }
            if health != nil { group.addTask { await self.refreshHealth() } }
        }
    }

    /// The saved copy of a day (SnapshotCache), on screen at once while the
    /// day loads; without one the screens keep the day before until it comes.
    private func showSaved(_ date: String?) {
        let decoder = JSONDecoder()
        if let saved = SnapshotCache.data(key: SnapshotCache.dayKey("today", date)),
           let value = try? decoder.decode(TodaySnapshot.self, from: saved.data) {
            today = value
            todayBase = saved.data
        }
        if food != nil, let saved = SnapshotCache.data(key: SnapshotCache.dayKey("food", date)),
           let value = try? decoder.decode(FoodSnapshot.self, from: saved.data) {
            food = value
            foodBase = saved.data
        }
        if health != nil, let saved = SnapshotCache.data(key: SnapshotCache.dayKey("health", date)),
           let value = try? decoder.decode(HealthSnapshot.self, from: saved.data) {
            health = value
        }
        applyOutbox()
    }

    /// Another day than today: its Today, Food and Health from the server at
    /// once, without the Apple Health sync, the waiting writes and the
    /// athlete status, which belong to today. The arrows stay free: a newer
    /// day chosen meanwhile wins and this answer is dropped.
    private func loadOtherDay(_ date: String) async {
        guard !demo, phase == .signedIn else { return }
        let wantFood = food != nil, wantHealth = health != nil
        let settledToday = Set(settlingToday.map { $0.id }), settledFood = Set(settlingFood.map { $0.id })
        let api = api
        async let todayAnswer: Result<(TodaySnapshot, Data), Error> = Self.attempt { try await api.todayData(date: date) }
        async let foodAnswer: Result<(FoodSnapshot, Data), Error>? = wantFood ? Self.attempt { try await api.foodData(date: date) } : nil
        async let healthAnswer: Result<HealthSnapshot, Error>? = wantHealth ? Self.attempt { try await api.health(date: date) } : nil
        let (t, f, h) = await (todayAnswer, foodAnswer, healthAnswer)
        guard selectedDate == date else { return }
        var failure: Error?
        switch t {
        case .success(let (snapshot, data)):
            today = snapshot
            todayBase = data
            settlingToday.removeAll { settledToday.contains($0.id) }
            fetched[.today] = (Date(), date)
        case .failure(let error): failure = error
        }
        if case .success(let (snapshot, data))? = f {
            food = snapshot
            foodBase = data
            settlingFood.removeAll { settledFood.contains($0.id) }
            fetched[.food] = (Date(), date)
            Task { await AppleHealthExport.shared.saveFoodDay(snapshot) }
        }
        if case .success(let value)? = h {
            health = value
            fetched[.health] = (Date(), date)
        }
        dataRevision += 1
        applyOutbox()
        guard let failure else {
            errorMessage = nil
            _ = noteConnection(nil)
            return
        }
        if (failure as? APIError) == .unauthorized { signOut(expired: true); return }
        if Self.isCancellation(failure) { return }
        // Without signal the saved day stays on screen; an error only without one.
        let lost = noteConnection(failure)
        if !lost { notice = failure.localizedDescription }
    }

    nonisolated private static func attempt<T>(_ body: () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await body()) } catch { return .failure(error) }
    }

    /// Yesterday's Today kept on the phone in advance (at most once an hour),
    /// so the first step back opens at once.
    private func prefetchYesterday() {
        guard let yesterday = Self.shift(Self.localDate(Date()), by: -1) else { return }
        if let saved = SnapshotCache.data(key: SnapshotCache.dayKey("today", yesterday)),
           Date().timeIntervalSince(saved.savedAt) < 3600 { return }
        let api = api
        Task(priority: .utility) { _ = try? await api.todayData(date: yesterday) }
    }

    nonisolated static func localDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    nonisolated static func shift(_ isoDate: String, by days: Int) -> String? {
        let utc = TimeZone(identifier: "UTC")!
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = utc
        f.dateFormat = "yyyy-MM-dd"
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let d = f.date(from: isoDate), let moved = calendar.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: moved)
    }

    /// Settings → "Odhlásit se": ends the session on the server as well.
    func logout() async {
        if !demo {
            // While the session still works: no more pushes to this phone.
            await PushRegistration.unregister(api: api)
            await api.logout()
        }
        signOut()
    }

    /// expired: the session ran out (401), not "Odhlásit se". Writes waiting
    /// for signal, the photo and the account's name stay until the next
    /// sign-in shows whether it is the same account (signedIn()).
    func signOut(expired: Bool = false) {
        api.signOut()
        clearLocal(expired: expired)
    }

    /// Nastavení → Testování → Server: the other server, with its own account
    /// data and sign-in. What the screens and the outbox hold belongs to the
    /// old server; both sessions stay, so switching back needs no sign-in.
    /// Apple Health pauses and resumes like a sign-out and a sign-in, each
    /// server with its own last sync (AppleHealth.serverChanged).
    func switchServer(to choice: ServerChoice) async {
        guard !demo, choice != ServerChoice.current else { return }
        if phase == .signedIn { await PushRegistration.unregister(api: api) }
        AppleHealth.shared.pause(account: UserDefaults.standard.string(forKey: AvatarStore.emailKey))
        ServerChoice.current = choice
        AppleHealth.shared.serverChanged()
        clearLocal(expired: true)
        outbox = []
        OutboxStore.save([])
        if api.hasSession {
            await signedIn()
            await refresh()
        }
    }

    private func clearLocal(expired: Bool) {
        SnapshotCache.clear()
        GymDayCache.clear()
        CoachTextMemory.values = [:]
        ThresholdCheckMemory.kept = nil
        GymHistoryCache.clear()
        ActivityDetailMemory.values = [:]
        if !expired {
            // Waiting writes belong to this account; the next one must not send them.
            outbox = []
            OutboxStore.save([])
            // Apple Health was allowed for this account, not the next one.
            AppleHealth.shared.pause(account: UserDefaults.standard.string(forKey: AvatarStore.emailKey))
            ErrorLog.clear()
            for key in [AvatarStore.nameKey, AvatarStore.emailKey, Self.displayNameKey] { UserDefaults.standard.removeObject(forKey: key) }
            AvatarStore.remove()
        }
        outboxNote = nil
        notice = nil
        todayBase = nil
        foodBase = nil
        settlingFood = []
        settlingToday = []
        sentIds = [:]
        Reminders.cancelAll()
        // The next sign-in sends the push token again for its own account.
        PushRegistration.forget()
        WidgetBridge.clear()
        UserDefaults.standard.removeObject(forKey: Self.setupDoneKey)
        UserDefaults.standard.removeObject(forKey: Self.accountInitialKey)
        needsSetup = false
        passkeyOffer = false
        paths = [:]
        tab = .today
        offline = false
        demo = false
        today = nil
        training = nil
        health = nil
        food = nil
        calendar = [:]
        selectedDate = nil
        fetched = [:]
        athleteStatus = nil
        phase = .signedOut
    }
}
