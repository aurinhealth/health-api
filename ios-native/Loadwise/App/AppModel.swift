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
    /// The day on the Today screen, nil for today.
    private(set) var selectedDate: String?
    /// The open tab and each tab's navigation stack, so cards, widgets and
    /// links (loadwise://open/sleep) can open any detail.
    var tab: AppTab = .today
    var paths: [AppTab: [AppRoute]] = [:]
    /// After the first sign-in: the profile setup has not been done yet.
    var needsSetup = false
    /// A full-screen flow (Režim tréninku) hides the tab bar.
    var immersive = false

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
        } else {
            phase = api.hasSession ? .signedIn : .signedOut
            if phase == .signedIn { loadSaved() }
        }
        // "-tab training" (simulator screenshots) opens another tab first.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count {
            tab = ["training": AppTab.training, "food": .food, "health": .health][args[i + 1]] ?? .today
        }
    }

    /// The screens as they were last time, until the server answers.
    private func loadSaved() {
        today = SnapshotCache.load(TodaySnapshot.self, key: "today")?.value
        training = SnapshotCache.load(TrainingSnapshot.self, key: "training")?.value
        health = SnapshotCache.load(HealthSnapshot.self, key: "health")?.value
        food = SnapshotCache.load(FoodSnapshot.self, key: "food")?.value
    }

    /// Notes whether a refresh reached the server; true when the error was a
    /// missing connection and saved data is on screen instead.
    private func noteConnection(_ error: Error?) -> Bool {
        let lost = (error as? URLError).map { [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost, .dataNotAllowed].contains($0.code) } ?? false
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
        guard !demo, phase == .signedIn, !UserDefaults.standard.bool(forKey: Self.setupDoneKey) else { return }
        if let done = try? await api.onboardingCompleted() {
            needsSetup = !done
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

    func showDemo() {
        demo = true
        today = DemoData.today
        training = DemoData.training
        health = DemoData.health
        food = DemoData.food
        phase = .signedIn
    }

    func refresh() async {
        guard !demo, phase == .signedIn else { return }
        loading = true
        defer { loading = false }
        do {
            today = try await api.today(date: selectedDate)
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
            health = try await api.health()
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
            food = try await api.food()
            foodError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut()
        } catch {
            if !(noteConnection(error) && food != nil) { foodError = error.localizedDescription }
        }
    }

    /// A drink of any kind; true when it was saved.
    @discardableResult
    func addDrink(ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        do {
            try await api.addFluid(ml: ml, kind: kind)
            await refreshFood()
            await refresh()
            return true
        } catch {
            foodError = error.localizedDescription
            return false
        }
    }

    func deleteDrink(id: Int) async {
        guard !demo else { return }
        do {
            try await api.deleteFluid(id: id)
            await refreshFood()
            await refresh()
        } catch {
            foodError = error.localizedDescription
        }
    }

    /// Logs a food; nil when it worked, else the message to show.
    func logFood(product: FoodProduct, amount: Double, meal: String) async -> String? {
        guard !demo else { return nil }
        do {
            try await api.logFood(FoodLogRequest(date: Self.localDate(Date()), product: product.forLogging, quantity: amount, unit: product.unit, mealType: meal))
            await refreshFood()
            await refresh()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func deleteFood(id: Int) async {
        guard !demo else { return }
        do {
            try await api.deleteFoodEntry(id: id)
            await refreshFood()
            await refresh()
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
        await refresh()
    }

    func showToday() async {
        guard selectedDate != nil else { return }
        selectedDate = nil
        await refresh()
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
        Reminders.cancelAll()
        WidgetBridge.clear()
        UserDefaults.standard.removeObject(forKey: Self.setupDoneKey)
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
