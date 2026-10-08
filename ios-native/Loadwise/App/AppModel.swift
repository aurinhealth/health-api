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
            today = try await api.today()
            errorMessage = nil
        } catch APIError.unauthorized {
            signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        api.signOut()
        demo = false
        today = nil
        phase = .signedOut
    }
}
