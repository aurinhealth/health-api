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
    private(set) var loading = false
    private(set) var signingIn = false
    var errorMessage: String?
    /// Sample data instead of the server ("Prohlédnout ukázku", screenshots).
    private(set) var demo: Bool
    /// The last refresh failed for lack of a connection: the screens show the
    /// data saved on the phone (SnapshotCache) with a note.
    private(set) var offline = false
    /// The day on the Today, Food and Health screens, nil for today.
    private(set) var selectedDate: String?
    /// The open tab and each tab's navigation stack, so cards, widgets and
    /// links (loadwise://open/sleep) can open any detail.
    var tab: AppTab = .today
    var paths: [AppTab: [AppRoute]] = [:]
    /// After the first sign-in: the profile setup has not been done yet.
    var needsSetup = false
    /// A full-screen flow (Režim tréninku) hides the tab bar.
    var immersive = false
    /// Writes made without signal, oldest first (Outbox.swift); the screens
    /// show them meanwhile.
    private(set) var outbox: [OutboxItem] = []
    /// A waiting write the server turned down, shown until tapped away.
    var outboxNote: String?
    /// The Today and Food answers as they came, under the waiting writes.
    @ObservationIgnored private var todayBase: Data?
    @ObservationIgnored private var foodBase: Data?
    @ObservationIgnored private var sendingOutbox = false
    @ObservationIgnored private var network: NetworkWatch?

    let api: APIClient
    private let auth: AuthService

    init(api: APIClient = APIClient(), demo: Bool = false) {
        self.api = api
        self.auth = AuthService(api: api)
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
        // The network back: what waited goes out and the screens load again.
        if !demo {
            network = NetworkWatch { [weak self] in await self?.networkBack() }
        }
    }

    /// The screens as they were last time, until the server answers.
    private func loadSaved() {
        today = SnapshotCache.load(TodaySnapshot.self, key: "today")?.value
        training = SnapshotCache.load(TrainingSnapshot.self, key: "training")?.value
        health = SnapshotCache.load(HealthSnapshot.self, key: "health")?.value
        food = SnapshotCache.load(FoodSnapshot.self, key: "food")?.value
        todayBase = OutboxStore.savedSnapshot("today")
        foodBase = OutboxStore.savedSnapshot("food")
        applyOutbox()
    }

    /// Notes whether a refresh reached the server; true when the error was a
    /// missing connection and saved data is on screen instead.
    private func noteConnection(_ error: Error?) -> Bool {
        let lost = error.map(Outbox.isNoConnection) ?? false
        offline = lost
        return lost
    }

    func path(_ tab: AppTab) -> Binding<[AppRoute]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
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

    /// The first letter of the account's name or e-mail for the settings button.
    func loadAccountInitial() async {
        guard !demo, phase == .signedIn, let name = try? await api.accountName(), let first = name.trimmingCharacters(in: .whitespaces).first else { return }
        UserDefaults.standard.set(String(first).uppercased(), forKey: Self.accountInitialKey)
    }

    func signIn() async {
        signingIn = true
        defer { signingIn = false }
        do {
            try await auth.signIn()
            demo = false
            phase = .signedIn
            errorMessage = nil
            await checkSetup()
            await refresh()
        } catch is CancellationError {
            // The user closed the sign-in sheet.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Signs in with the code from the e-mail.
    func signIn(email: String, code: String) async throws {
        try await api.verifyEmailLogin(email: email, code: code)
        demo = false
        phase = .signedIn
        errorMessage = nil
        await checkSetup()
        await refresh()
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

    func refresh() async {
        guard !demo, phase == .signedIn else { return }
        loading = true
        defer { loading = false }
        await sendOutbox()
        do {
            let (snapshot, data) = try await api.todayData(date: selectedDate)
            today = snapshot
            todayBase = data
            applyOutbox()
            errorMessage = nil
            _ = noteConnection(nil)
            if selectedDate == nil, let today {
                await Reminders.reschedule(from: today)
                WidgetBridge.update(today)
            }
        } catch APIError.unauthorized {
            signOut()
        } catch {
            // Without signal the saved screen stays; an error only without one.
            if !(noteConnection(error) && today != nil) { errorMessage = error.localizedDescription }
        }
    }

    func refreshTraining() async {
        guard !demo, phase == .signedIn else { return }
        do {
            training = try await api.training()
            trainingError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if !(noteConnection(error) && training != nil) { trainingError = error.localizedDescription }
        }
    }

    func refreshHealth() async {
        guard !demo, phase == .signedIn else { return }
        do {
            health = try await api.health(date: selectedDate)
            healthError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if !(noteConnection(error) && health != nil) { healthError = error.localizedDescription }
        }
    }

    func refreshFood() async {
        guard !demo, phase == .signedIn else { return }
        do {
            let (snapshot, data) = try await api.foodData(date: selectedDate)
            food = snapshot
            foodBase = data
            applyOutbox()
            foodError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if !(noteConnection(error) && food != nil) { foodError = error.localizedDescription }
        }
    }

    /// A drink of any kind; true when it was saved (or waits for signal).
    @discardableResult
    func addDrink(ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        do {
            if try await deliver(drinkItem(ml: ml, kind: kind, date: selectedDate ?? Self.localDate(Date()))) {
                await refreshFood()
                await refresh()
            }
            return true
        } catch {
            foodError = error.localizedDescription
            return false
        }
    }

    /// POST /app/api/fluids with the time it was drunk, so a later send keeps it.
    private func drinkItem(ml: Int, kind: String, date: String, at: Date = Date()) -> OutboxItem {
        let localId = Outbox.localId()
        var body: JSONObject = ["ml": .number(Double(ml)), "kind": .string(kind), "date": .string(date),
                                "requestId": .string(UUID().uuidString)]
        if date == Self.localDate(at) { body["at"] = .string(Outbox.clock(at, withDay: true)) }
        return OutboxItem(path: "/app/api/fluids", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Pití"),
                          overlay: OutboxOverlay(kind: .drink, date: date, id: localId, ml: Double(ml), drink: kind,
                                                 time: date == Self.localDate(at) ? Outbox.clock(at) : nil))
    }

    // MARK: - Writes without signal

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
        if let foodBase, let value = try? JSONDecoder().decode(FoodSnapshot.self, from: OutboxPatch.food(foodBase, overlays)) { food = value }
        if let todayBase, let value = try? JSONDecoder().decode(TodaySnapshot.self, from: OutboxPatch.today(todayBase, overlays)) { today = value }
    }

    /// Water added from the widget while the app was closed joins the outbox.
    private func takeWidgetDrinks() {
        let drinks = PendingDrinks.take()
        guard !drinks.isEmpty else { return }
        outbox += drinks.map { drinkItem(ml: $0.ml, kind: "water", date: $0.date) }
        saveOutbox()
    }

    /// Sends the waiting writes in order. Stops at the first that still finds
    /// no connection; one the server refuses (4xx) is dropped with a note.
    /// True when something went out.
    @discardableResult
    func sendOutbox() async -> Bool {
        guard !demo, phase == .signedIn, !sendingOutbox else { return false }
        takeWidgetDrinks()
        guard !outbox.isEmpty else { return false }
        sendingOutbox = true
        defer { sendingOutbox = false }
        var sent = false
        while let item = outbox.first {
            do {
                try await api.sendQueued(item)
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
                break
            }
            OutboxStore.save(outbox)
        }
        saveOutbox()
        if sent {
            offline = false
            if food != nil { await refreshFood() }
            if health != nil { await refreshHealth() }
        }
        return sent
    }

    /// The network came back: send what waited and load the screens again.
    private func networkBack() async {
        guard !demo, phase == .signedIn, offline || !outbox.isEmpty else { return }
        await refresh()
        if food != nil { await refreshFood() }
    }

    /// A weigh-in (kg); waits for signal when there is none. Throws the server's refusal.
    func addWeight(kg: Double) async throws {
        guard !demo else { return }
        let date = Self.localDate(Date())
        let body: JSONObject = ["kg": .number(kg), "date": .string(date), "requestId": .string(UUID().uuidString)]
        let item = OutboxItem(path: "/app/api/weight", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Váha"),
                              overlay: OutboxOverlay(kind: .weight, date: date, kg: kg))
        if try await deliver(item) {
            await refreshHealth()
            await refresh()
        }
    }

    /// Saves a day's gym sheet; without signal the newest sheet of the day
    /// waits. Throws the server's refusal.
    func saveGym(_ day: GymDay, date: String) async throws {
        guard !demo else { return }
        GymDayCache.save(day, date: date)
        let item = OutboxItem(path: "/app/api/gym", method: "POST", body: OutboxItem.json(APIClient.gymBody(day, date: date)),
                              label: L10n.tr("Posilovna"), key: "gym:" + date)
        _ = try await deliver(item)
    }

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
        // A drink not sent yet changes while it waits.
        if id < 0, let i = outbox.firstIndex(where: { $0.overlay?.id == id }) {
            var fields = outbox[i].fields
            fields["ml"] = .number(Double(ml))
            fields["kind"] = .string(kind)
            outbox[i].body = OutboxItem.json(fields)
            outbox[i].overlay?.ml = Double(ml)
            outbox[i].overlay?.drink = kind
            saveOutbox()
            return true
        }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids", method: "PATCH",
                              body: OutboxItem.json(["id": JSONValue.number(Double(id)), "ml": .number(Double(ml)), "kind": .string(kind)]),
                              label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .editDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: Double(ml), drink: kind,
                                                     previousMl: old?.ml, previousDrink: old?.kind))
        do {
            if try await deliver(item) {
                await refreshFood()
                await refresh()
            }
            return true
        } catch {
            foodError = error.localizedDescription
            return false
        }
    }

    func deleteDrink(id: Int) async {
        guard !demo else { return }
        if id < 0 { dropWaiting(localId: id); return }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids?id=\(id)", method: "DELETE", body: OutboxItem.json(JSONObject()), label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .removeDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: old?.ml, drink: old?.kind))
        do {
            if try await deliver(item) {
                await refreshFood()
                await refresh()
            }
        } catch {
            foodError = error.localizedDescription
        }
    }

    /// A meal or drink taken back before it was sent.
    private func dropWaiting(localId: Int) {
        outbox.removeAll { $0.overlay?.id == localId && ($0.overlay?.kind == .food || $0.overlay?.kind == .drink) }
        saveOutbox()
    }

    /// Logs a food; nil when it worked, else the message to show.
    func logFood(product: FoodProduct, amount: Double, meal: String) async -> String? {
        guard !demo else { return nil }
        let date = selectedDate ?? Self.localDate(Date())
        let request = FoodLogRequest(date: date, product: product.forLogging, quantity: amount, unit: product.unit, mealType: meal)
        let overlay = OutboxOverlay(kind: .food, date: date, id: Outbox.localId(), name: product.name, meal: meal,
                                    kcal: product.kcal(for: amount), protein: product.grams(product.protein_100g, for: amount),
                                    carbs: product.grams(product.carbs_100g, for: amount), fat: product.grams(product.fat_100g, for: amount),
                                    time: date == Self.localDate(Date()) ? Outbox.clock() : nil)
        let item = OutboxItem(path: "/app/api/food/log", method: "POST", body: OutboxItem.json(request, adding: ["requestId": .string(UUID().uuidString)]),
                              label: product.name, overlay: overlay)
        do {
            if try await deliver(item) {
                await refreshFood()
                await refresh()
            }
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func deleteFood(id: Int) async {
        guard !demo else { return }
        if id < 0 { dropWaiting(localId: id); return }
        let entry = food?.meals.flatMap(\.entries).first { $0.id == id }
        let item = OutboxItem(path: "/app/api/food/entry", method: "DELETE", body: OutboxItem.json(["id": JSONValue.number(Double(id))]),
                              label: entry?.name ?? L10n.tr("Jídlo"),
                              overlay: OutboxOverlay(kind: .removeFood, date: food?.date ?? Self.localDate(Date()), id: id,
                                                     kcal: entry?.kcal, protein: entry?.protein, carbs: entry?.carbs, fat: entry?.fat))
        do {
            if try await deliver(item) {
                await refreshFood()
                await refresh()
            }
        } catch {
            foodError = error.localizedDescription
        }
    }

    @discardableResult
    func addWater(ml: Int) async -> Bool {
        await addDrink(ml: ml, kind: "water")
    }

    /// One day back or forward from the day on screen; forward stops at today.
    func showDay(offset: Int) async {
        guard !demo, let shown = selectedDate ?? today?.date, let date = Self.shift(shown, by: offset) else { return }
        let todayDate = Self.localDate(Date())
        selectedDate = date >= todayDate ? nil : date
        await refreshDay()
    }

    func showToday() async {
        guard selectedDate != nil else { return }
        selectedDate = nil
        await refreshDay()
    }

    /// The day changed: Today, and Food and Health when they were opened.
    func refreshDay() async {
        await refresh()
        if food != nil { await refreshFood() }
        if health != nil { await refreshHealth() }
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
        if !demo { await api.logout() }
        signOut()
    }

    func signOut() {
        api.signOut()
        SnapshotCache.clear()
        GymDayCache.clear()
        // Waiting writes belong to this account; the next one must not send them.
        outbox = []
        OutboxStore.save([])
        outboxNote = nil
        todayBase = nil
        foodBase = nil
        Reminders.cancelAll()
        WidgetBridge.clear()
        UserDefaults.standard.removeObject(forKey: Self.setupDoneKey)
        UserDefaults.standard.removeObject(forKey: Self.accountInitialKey)
        needsSetup = false
        paths = [:]
        tab = .today
        offline = false
        demo = false
        today = nil
        training = nil
        health = nil
        food = nil
        selectedDate = nil
        phase = .signedOut
    }
}
