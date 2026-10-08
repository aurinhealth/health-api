import Foundation

enum APIError: LocalizedError, Equatable {
    case unauthorized
    case message(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Přihlášení vypršelo. Přihlas se znovu."
        case .message(let text): return text
        }
    }
}

/// The Loadwise server (the Cloudflare Worker in src/). The session is the
/// pfd_session cookie, which URLSession keeps in the shared cookie storage.
final class APIClient: @unchecked Sendable {
    static let sessionCookie = "pfd_session"

    let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL = URL(string: "https://petrfitnessdata.eu")!) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config)
    }

    var hasSession: Bool {
        (HTTPCookieStorage.shared.cookies(for: baseURL) ?? []).contains {
            $0.name == Self.sessionCookie && ($0.expiresDate ?? .distantFuture) > Date()
        }
    }

    func today(date: String? = nil) async throws -> TodaySnapshot {
        var path = "/app/api/today"
        if let date { path += "?date=" + date }
        return try await get(path)
    }

    /// Step 3 of the sign-in handoff (see AuthService): token + verifier for the cookie.
    func exchangeHandoff(token: String, verifier: String) async throws {
        var request = makeRequest("/auth/app/session", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["token": token, "verifier": verifier])
        let (data, response) = try await session.data(for: request)
        try check(response, data)
        guard hasSession else { throw APIError.message("Server nevrátil přihlášení. Zkus to znovu.") }
    }

    func signOut() {
        for cookie in HTTPCookieStorage.shared.cookies(for: baseURL) ?? [] where cookie.name == Self.sessionCookie {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: - Plumbing

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await session.data(for: makeRequest(path))
        try check(response, data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.message("Odpověď serveru se nepodařilo přečíst.")
        }
    }

    private func makeRequest(_ path: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: URL(string: path, relativeTo: baseURL)!.absoluteURL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // The server counts days in the user's zone and answers in Czech.
        request.setValue(TimeZone.current.identifier, forHTTPHeaderField: "X-Time-Zone")
        request.setValue("cs", forHTTPHeaderField: "X-Interface-Language")
        // Writes with the session cookie must come from the site's own origin.
        if method != "GET" && path.hasPrefix("/app/") {
            request.setValue(baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        }
        return request
    }

    private func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.message("Server neodpověděl.") }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw APIError.message(message ?? "Server odpověděl chybou \(http.statusCode).")
        }
    }
}
