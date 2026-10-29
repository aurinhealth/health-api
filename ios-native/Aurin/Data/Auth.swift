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
// The cookie lands in HTTPCookieStorage.shared, which URLSession sends with
// every API call, and SessionKeychain keeps it in the Keychain.
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
        case "not_invited": return APIError.notInvited(L10n.tr("Tento Google účet nemá do Aurinu pozvánku. Aurin je teď jen pro pozvané."))
        case "expired": return APIError.message(L10n.tr("Přihlášení se přerušilo. Zkus to znovu."))
        case "unavailable": return APIError.message(L10n.tr("Přihlášení přes Google teď nejde. Zkus to později nebo se přihlas e-mailem."))
        default: return APIError.message(L10n.tr("Google přihlášení se nepodařilo ověřit. Zkus to znovu."))
        }
    }

    /// Connects Google or Intervals.icu: the provider's page in the browser
    /// sheet, back at loadwise://connected?event=… (src/connect-return.js).
    func connect(provider: String) async throws -> String {
        let link = try await api.connectLink(provider: provider)
        // The ticket again as a header: without it the server lets nobody in, so a
        // ticket link sent to someone else expires (src/native-connect.js).
        let ticket = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "ticket" })?.value
        let callback = try await openBrowser(link, headers: ticket.map { ["X-Aurin-Connect": $0] } ?? [:])
        return URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "event" })?.value ?? "unknown"
    }

    private func openBrowser(_ url: URL, headers: [String: String] = [:]) async throws -> URL {
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
            if !headers.isEmpty { session.additionalHeaderFields = headers }
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

    /// Sign in with Apple: the request asks Apple to put the SHA-256 (hex) of
    /// this nonce in the identity token; the server checks it (src/apple-login.js).
    static func appleNonceHash(_ nonce: String) -> String {
        SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
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
