import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

// Google refuses sign-in inside an app's own web view, so the app uses the
// same handoff as the Capacitor app (src/google-login.js):
// 1. open /auth/google?app=<challenge> in a system browser sheet,
// 2. the server answers with loadwise://auth?token=<short-lived token>,
// 3. the app trades the token plus the verifier behind the challenge for the
//    session cookie at POST /auth/app/session.
// The cookie lands in HTTPCookieStorage.shared and URLSession sends it with
// every API call.
@MainActor
final class AuthService: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let api: APIClient
    private var session: ASWebAuthenticationSession?

    init(api: APIClient) {
        self.api = api
    }

    func signIn() async throws {
        let verifier = Self.randomVerifier()
        let challenge = Self.challenge(for: verifier)
        var start = URLComponents(url: api.baseURL.appending(path: "auth/google"), resolvingAgainstBaseURL: false)!
        start.queryItems = [URLQueryItem(name: "app", value: challenge)]

        let callback = try await openBrowser(start.url!)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let error = items.first(where: { $0.name == "error" })?.value { throw Self.signInError(error) }
        guard let token = items.first(where: { $0.name == "token" })?.value else {
            throw APIError.message(L10n.tr("Přihlášení se nepodařilo dokončit. Zkus to znovu."))
        }
        try await api.exchangeHandoff(token: token, verifier: verifier)
    }

    /// loadwise://auth?error=<code> from a failed Google sign-in (src/google-login.js).
    static func signInError(_ code: String) -> Error {
        switch code {
        case "cancelled": return APIError.message(L10n.tr("Přihlášení přes Google bylo zrušeno."))
        case "not_invited": return APIError.message(L10n.tr("Tento Google účet nemá do Loadwise pozvánku. Požádej o ni správce, nebo se přihlas jiným účtem."))
        case "expired": return APIError.message(L10n.tr("Přihlášení vypršelo. Zkus to znovu."))
        case "unavailable": return APIError.message(L10n.tr("Přihlášení přes Google teď nejde. Zkus to později nebo se přihlas e-mailem."))
        default: return APIError.message(L10n.tr("Google přihlášení se nepodařilo ověřit. Zkus to znovu."))
        }
    }

    /// Connects Google or Intervals.icu: the provider's page in the browser
    /// sheet, back at loadwise://connected?event=… (src/connect-return.js).
    func connect(provider: String) async throws -> String {
        let callback = try await openBrowser(try await api.connectLink(provider: provider))
        return URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "event" })?.value ?? "unknown"
    }

    private func openBrowser(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "loadwise") { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: error ?? APIError.message(L10n.tr("Přihlášení se nepodařilo.")))
                }
            }
            session.presentationContextProvider = self
            // Keep Google's own cookies, so the account picker remembers the user.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }

    // 32 random bytes as base64url: 43 characters, like the web app's verifier.
    static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64url(Data(bytes))
    }

    static func challenge(for verifier: String) -> String {
        base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
