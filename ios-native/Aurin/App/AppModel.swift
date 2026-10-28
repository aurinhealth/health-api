import AuthenticationServices
import Foundation
import Observation
import SwiftUI

/// App state: signed in or not, the screens' data and the navigation. The
/// work is in its extensions: AppModel+Session (signing in and out),
/// AppModel+Loading (the screens from the server), AppModel+Writes (through
/// WriteQueue) and AppModel+Cycle. Each sign-in is an AccountScope; each tab's
/// data has its own store (ScreenStore.swift).
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case signedOut
        case signedIn
    }

    var phase: Phase

    // MARK: - The screens' data

    /// Each tab's data in its own store, so a view follows only the screen it
    /// shows; the properties below read and write them.
    @ObservationIgnored let todayScreen = PatchedScreen<TodaySnapshot>(patch: OutboxPatch.today)
    @ObservationIgnored let foodScreen = PatchedScreen<FoodSnapshot>(patch: OutboxPatch.food)
    @ObservationIgnored let healthScreen = ScreenStore<HealthSnapshot>()
    @ObservationIgnored let trainingScreen = ScreenStore<TrainingSnapshot>()

    var today: TodaySnapshot? {
        get { todayScreen.value }
        set { todayScreen.value = newValue }
    }
    var training: TrainingSnapshot? {
        get { trainingScreen.value }
        set { trainingScreen.value = newValue }
    }
    var trainingError: String? {
        get { trainingScreen.error }
        set { trainingScreen.error = newValue }
    }
    /// The training calendar's days by date (Training → the strip and month).
    var calendar: [String: CalendarDay] = [:]
    /// The strain of past days before this week, by date, as Today shows it for
    /// that day (Training → the day chosen in the calendar).
    var pastStrain: [String: Double] = [:]
    var health: HealthSnapshot? {
        get { healthScreen.value }
        set { healthScreen.value = newValue }
    }
    var healthError: String? {
        get { healthScreen.error }
        set { healthScreen.error = newValue }
    }
    var food: FoodSnapshot? {
        get { foodScreen.value }
        set { foodScreen.value = newValue }
    }
    var foodError: String? {
        get { foodScreen.error }
        set { foodScreen.error = newValue }
    }
    /// A write or a refresh that failed while data is on screen: shown on top
    /// of every tab for 6 s or until tapped away (the screens' own errors show
    /// only without data).
    var notice: String?
    var loading = false
    /// Loading with no day on screen yet: the day arrows and swipes wait. With
    /// one (saved or loaded) they work while the refresh goes on behind.
    var dayLocked: Bool { loading && today == nil }
    /// The pill on top while the app syncs after opening (RootView SyncPill):
    /// "Synchronizuji…", "Synchronizováno" for a moment, or a failure to retry.
    var syncStatus: SyncStatus?
    enum SyncStatus: Equatable { case syncing, done, failed }
    /// The sign-in under way, so only its own button turns into a spinner.
    var signingInWith: SignInMethod?
    enum SignInMethod: Equatable { case apple, google, passkey }
    var signingIn: Bool { signingInWith != nil }
    var errorMessage: String?
    /// Sample data instead of the server ("-demo": screenshots and UI tests).
    var demo: Bool
    /// The last refresh failed for lack of a connection: the screens show the
    /// data saved on the phone (SnapshotCache) with a note.
    var offline = false
    /// The day on the Today, Food and Health screens, nil for today. Only Food
    /// goes ahead (meals planned or copied into the coming days).
    var selectedDate: String?
    /// Food reaches this many days past today.
    static let foodDaysAhead = 14
    /// The chosen day lies after today (Food only).
    var showsFutureDay: Bool { selectedDate.map { $0 > Self.localDate(Date()) } ?? false }
    /// Stav sportovce on Today (active, sick, injured, on a break).
    var athleteStatus: AthleteStatus?
    /// Cycle tracking (AppModel+Cycle.swift): nil until loaded, `available`
    /// false unless the profile's sex is female.
    var cycle: CycleResponse?
    /// Svaly (MuscleViews.swift): loaded by the widgets, the screen and the
    /// gym builder, whichever comes first.
    var muscleFatigue: MuscleFatigue?
    /// When the muscles came from the server; nil after a gym day was saved (musclesStale).
    @ObservationIgnored var musclesAt: Date?
    /// Apple Health's cycle data went to the server in this run of the app.
    @ObservationIgnored var cycleHealthSynced = false

    /// This sign-in (AccountScope): ended by every sign-out, so an answer
    /// asked for before it is dropped (stillSignedIn) and its loads stop.
    @ObservationIgnored var scope = AccountScope()
    /// Still the sign-in that asked: checked after every await that brings data.
    func stillSignedIn(_ asked: AccountScope) -> Bool { asked === scope && !asked.ended && phase == .signedIn }

    /// The server answered 426: this build is too old (src/app-version.js).
    var updateRequired = false
    /// When each tab's data last came from the server, and for which day. The
    /// screens open with the copy saved on the phone; refreshIfStale loads it again.
    @ObservationIgnored var fetched: [AppTab: (at: Date, day: String)] = [:]
    /// Counts every load of a tab's data: the coach's text asks again after
    /// any change (CoachTextCard), and the server writes it anew when it differs.
    var dataRevision = 0
    /// Bumped only when Today comes from the server (not by a waiting write over it),
    /// so Today's cards ask their own endpoints once per load.
    var todayRevision = 0
    /// The day the screens show: the chosen one, else today (so a load from
    /// 23:58 counts as stale after midnight).
    var shownDay: String { selectedDate ?? Self.localDate(Date()) }
    /// The "+" sheet is open: what it adds goes to today, whatever day the
    /// screens show (weight always did).
    var writesToday = false
    /// The day food and drinks are written to.
    var writeDay: String { writesToday ? Self.localDate(Date()) : shownDay }
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
    /// The writes waiting to go out (WriteQueue.swift); the screens show them meanwhile.
    @ObservationIgnored let writes: WriteQueue
    var outbox: [OutboxItem] { writes.items }
    /// A waiting write the server turned down, shown until tapped away.
    var outboxNote: String? {
        get { writes.note }
        set { writes.note = newValue }
    }
    /// A done activity just sent to the apps chosen in Zdroje dat (Aurin posílá): the
    /// toast "Odesláno do 2 aplikací" and its sheet (SyncViews.swift).
    var syncReport: SyncReport?
    /// A deleted workout waiting a few seconds for "Zpět" (RootView): the
    /// deletion reaches the server and Apple Health only after that.
    var undoToast: PlanToast?
    /// "Uloženo. Díky, teď ho najdou i ostatní." after a food read from its
    /// label: it enters the common catalogue at once (src/personal-foods.js).
    var thanks: String?

    func thankForLabel(_ product: FoodProduct) {
        guard !demo, product.source == "package_label", !product.perPortion, product.origin == nil else { return }
        thanks = L10n.tr("Uloženo. Díky, teď ho najdou i ostatní.")
    }

    /// hide: the planned event that leaves the week and the calendar at once;
    /// activity: the done activity that leaves the week, the calendar and the
    /// day. "Vrátit" brings either back with the next load.
    func deleteLater(_ title: String, note: String? = nil, hide eventId: String? = nil, activity: String? = nil, commit: @escaping () async -> Void) {
        if let eventId {
            training?.sessions?.removeAll { $0.eventId == eventId }
            for (day, value) in calendar where value.activities.contains(where: { $0.eventId == eventId }) {
                calendar[day]?.activities.removeAll { $0.eventId == eventId }
            }
        }
        if let activity {
            training?.sessions?.removeAll { $0.id == activity }
            for (day, value) in calendar where value.activities.contains(where: { $0.id == activity }) {
                calendar[day]?.activities.removeAll { $0.id == activity }
            }
            today?.plan.removeAll { $0.session?.id == activity }
        }
        let undo: () async -> Void = eventId == nil && activity == nil ? {} : { [weak self] in
            await self?.refreshTraining()
            await self?.refresh()
        }
        undoToast = PlanToast(title: title, note: note, cancelled: true, undo: undo, commit: commit)
    }
    @ObservationIgnored private var network: NetworkWatch?

    // Today's refresh (AppModel+Loading.swift).
    @ObservationIgnored var announcedRefresh: Task<Void, Never>?
    @ObservationIgnored var announcedSince = Date.distantPast
    /// Bumped by each refresh: a stopped one leaves the pill to the one after it.
    @ObservationIgnored var refreshRound = 0
    @ObservationIgnored var leftAt: Date?
    @ObservationIgnored var refreshing: Set<AppTab> = []

    let api: APIClient
    let auth: AuthService
    /// Passkeys (Data/Passkeys.swift): the sign-in and "Příště přes Face ID".
    @ObservationIgnored let passkeys: PasskeyService

    init(api: APIClient = APIClient(), demo: Bool = false) {
        self.api = api
        self.auth = AuthService(api: api)
        self.passkeys = PasskeyService()
        self.demo = demo
        self.writes = WriteQueue(api: api, load: !demo)
        if demo {
            phase = .signedIn
            today = DemoData.today
            training = DemoData.training
            health = DemoData.health
            food = DemoData.food
            calendar = DemoData.calendarByDate
        } else {
            phase = api.hasSession ? .signedIn : .signedOut
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
            connectWrites()
            Self.live = self
            // Water from Siri or Shortcuts (AddWaterIntent) goes out now, not on the next refresh.
            drinkObserver = NotificationCenter.default.addObserver(forName: PendingDrinks.added, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in _ = await self?.writes.send(reloadToday: true) }
            }
        }
    }

    /// The signed-in app's model, for Siri and Shortcuts (SiriShortcuts.swift),
    /// which run in the app's process but outside its views.
    static weak var live: AppModel?
    @ObservationIgnored private var drinkObserver: NSObjectProtocol?


    /// Notes whether a refresh reached the server; true when the error was a
    /// missing connection and saved data is on screen instead.
    nonisolated static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        return (error as NSError).domain == NSURLErrorDomain && (error as NSError).code == NSURLErrorCancelled
    }

    func noteConnection(_ error: Error?) -> Bool {
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


    /// Loads the calendar days that are not here yet (all of them with force).
    func loadCalendar(from start: String, to end: String, force: Bool = false) async {
        let days = ISODay.range(start, end)
        guard force || days.contains(where: { calendar[$0] == nil }) else { return }
        if demo { return }
        guard phase == .signedIn else { return }
        let account = scope
        do {
            let result = try await api.trainingCalendar(start: start, end: end)
            guard stillSignedIn(account) else { return }
            for day in result.days { calendar[day.date] = day }
        } catch {
            // Without signal the days already here stay; anything else is said,
            // not left as an empty calendar (the request is in ErrorLog).
            if Self.isCancellation(error) || Outbox.isNoConnection(error) || (error as? APIError) == .unauthorized { return }
            notice = error.localizedDescription
        }
    }

    /// A past day's strain for Training's Námaha: the week's days come with the
    /// training answer, an older day from Today of that day, once.
    /// again: once more with Today's load, so a workout that came later counts.
    func loadPastStrain(_ date: String, again: Bool = false) async {
        guard !demo, phase == .signedIn, again || pastStrain[date] == nil else { return }
        let account = scope
        guard let snapshot = try? await api.today(date: date), snapshot.date == date, stillSignedIn(account) else { return }
        pastStrain[date] = snapshot.strain.score ?? 0
    }

    nonisolated static func localDate(_ date: Date) -> String {
        DateFormatters.iso().string(from: date)
    }

    nonisolated static func shift(_ isoDate: String, by days: Int) -> String? {
        let utc = TimeZone(identifier: "UTC")!
        let f = DateFormatters.iso(timeZone: utc)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let d = f.date(from: isoDate), let moved = calendar.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: moved)
    }
}
