import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

// Google refuses sign-in inside an app's own web view, so the app uses the
// same handoff as the Capacitor app (src/google-login.js):
// 1. open /auth/google?app=<challenge>&return=https in a system browser sheet,
// 2. the server answers with https://<its host>/auth/app/return?token=<short-lived token>,
//    which only this app can catch: iOS hands an https callback only to an app
//    with that host among its associated domains (project.yml). A server from
//    before 2026-11 answers with loadwise://auth instead (returnsOverHttps),
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
        let https = await Self.returnsOverHttps(api.baseURL, path: Self.signInReturnPath)
        var start = URLComponents(url: api.baseURL.appending(path: "auth/google"), resolvingAgainstBaseURL: false)!
        start.queryItems = [URLQueryItem(name: "app", value: challenge)] + (https ? [URLQueryItem(name: "return", value: "https")] : [])

        let callback = try await openBrowser(start.url!, callback: Self.callback(api.baseURL, path: Self.signInReturnPath, https: https))
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let error = items.first(where: { $0.name == "error" })?.value { throw Self.signInError(error) }
        guard let token = items.first(where: { $0.name == "token" })?.value else {
            throw APIError.message(L10n.tr("Přihlášení se nepodařilo dokončit. Zkus to znovu."))
        }
        try await api.exchangeHandoff(token: token, verifier: verifier)
    }

    static let signInReturnPath = "/auth/app/return"

    /// The address the browser sheet closes on: https on the server's own host,
    /// or loadwise:// for a server from before 2026-11.
    static func callback(_ server: URL, path: String, https: Bool) -> ASWebAuthenticationSession.Callback {
        guard https, let host = server.host() else { return .customScheme("loadwise") }
        return .https(host: host, path: path)
    }

    /// Whether the server returns over https: it answers the return page itself
    /// (an older one sends a browser away from /auth/…). Remove with the
    /// loadwise:// fallback once every server has it.
    static func returnsOverHttps(_ server: URL, path: String) async -> Bool {
        var request = URLRequest(url: server.appending(path: String(path.dropFirst())), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.httpMethod = "HEAD"
        guard let answer = try? await URLSession.shared.data(for: request), let http = answer.1 as? HTTPURLResponse else { return false }
        return http.statusCode == 200 && http.url?.path() == path
    }

    /// …/auth/app/return?error=<code> from a failed Google sign-in (src/google-login.js).
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
        let callback = try await openBrowser(link, callback: .customScheme("loadwise"), headers: ticket.map { ["X-Aurin-Connect": $0] } ?? [:])
        return URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "event" })?.value ?? "unknown"
    }

    private func openBrowser(_ url: URL, callback: ASWebAuthenticationSession.Callback, headers: [String: String] = [:]) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callback: callback) { callback, error in
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
    // CryptoKit's key never comes back empty, as an unchecked SecRandomCopyBytes could.
    static func randomVerifier() -> String {
        base64url(SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) })
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
