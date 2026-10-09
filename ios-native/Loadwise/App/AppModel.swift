import Foundation
import Observation

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
    /// The day on the Today screen, nil for today.
    private(set) var selectedDate: String?

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
        }
    }

    func signIn() async {
        signingIn = true
        defer { signingIn = false }
        do {
            try await auth.signIn()
            demo = false
            phase = .signedIn
            errorMessage = nil
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
        } catch APIError.unauthorized {
            signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshTraining() async {
        guard !demo, phase == .signedIn else { return }
        do {
            training = try await api.training()
            trainingError = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            trainingError = error.localizedDescription
        }
    }

    func refreshHealth() async {
        guard !demo, phase == .signedIn else { return }
        do {
            health = try await api.health()
            healthError = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            healthError = error.localizedDescription
        }
    }

    func refreshFood() async {
        guard !demo, phase == .signedIn else { return }
        do {
            food = try await api.food()
            foodError = nil
        } catch APIError.unauthorized {
            signOut()
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

    func addWater(ml: Int) async {
        guard !demo else { return }
        do {
            try await api.addFluid(ml: ml)
            await refreshFood()
            await refresh()
        } catch {
            foodError = error.localizedDescription
        }
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

    static func localDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    static func shift(_ isoDate: String, by days: Int) -> String? {
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
        demo = false
        today = nil
        training = nil
        health = nil
        food = nil
        selectedDate = nil
        phase = .signedOut
    }
}
