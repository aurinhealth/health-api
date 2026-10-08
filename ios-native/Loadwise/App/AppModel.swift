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

    func signOut() {
        api.signOut()
        demo = false
        today = nil
        selectedDate = nil
        phase = .signedOut
    }
}
