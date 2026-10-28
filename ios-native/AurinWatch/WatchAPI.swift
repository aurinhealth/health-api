import Foundation
import Security

/// The watch's own requests, with the sign-in the iPhone handed over
/// (WatchShared/WatchSession.swift): the coach answers on the watch's Wi-Fi
/// or cellular when the iPhone is out of reach. The sign-in stays in the
/// watch's Keychain and goes when the iPhone signs out.
@MainActor
enum WatchAPI {
    private static let service = "health.aurin.watch.session"
    private static let chatTimeout: TimeInterval = 180

    struct Failure: Error {
        let text: String
    }

    struct CoachResult {
        var text: String
        var chatId: Int?
        var proposal: Bool
    }

    // MARK: - The sign-in

    static func store(_ data: Data?) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        SecItemDelete(query as CFDictionary)
        guard let data else { return }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static var session: WatchSession? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
              let session = WatchSession.decode(data) else { return nil }
        if let expires = session.expires, expires < Date() { return nil }
        return session
    }

    static var signedIn: Bool { session != nil }

    // MARK: - Requests

    private static func request(_ path: String, method: String = "GET", session: WatchSession) -> URLRequest? {
        guard let url = URL(string: session.server + path) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("\(session.name)=\(session.value)", forHTTPHeaderField: "Cookie")
        request.setValue(TimeZone.current.identifier, forHTTPHeaderField: "X-Time-Zone")
        request.setValue(session.language, forHTTPHeaderField: "X-Interface-Language")
        request.setValue(session.imperial ? "imperial" : "metric", forHTTPHeaderField: "X-Units")
        request.setValue(String(session.apiLevel), forHTTPHeaderField: "X-Loadwise-Api")
        // Writes with the session cookie must come from the site's own origin.
        if method != "GET" { request.setValue(session.server, forHTTPHeaderField: "Origin") }
        return request
    }

    private static let urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        // The cookie goes by hand; the watch keeps none of its own.
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    /// The chat the app was written in during the last 6 hours, so the watch continues it.
    static func recentChat() async -> Int? {
        guard let session, let request = request("/app/api/assistant/chats", session: session),
              let (data, response) = try? await urlSession.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let latest = (object["chats"] as? [[String: Any]])?.first,
              let id = (latest["id"] as? NSNumber)?.intValue,
              let updated = latest["updatedAt"] as? String, recent(updated) else { return nil }
        return id
    }

    /// Asks the coach as the app does, the answer in one piece.
    static func askCoach(_ text: String, chatId: Int?, view: String) async throws -> CoachResult {
        guard let session, var request = request("/app/api/assistant", method: "POST", session: session) else {
            throw Failure(text: W.tr("Hodinky nejsou přihlášené. Otevři Aurin v iPhonu.", "The watch isn't signed in. Open Aurin on your iPhone."))
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = chatTimeout
        var body: [String: Any] = ["message": text, "stream": false, "mode": "auto",
                                   "appContext": ["view": view, "date": WatchStore.localDate(Date())]]
        if let chatId { body["chatId"] = chatId }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw Failure(text: W.tr("Hodinky nejsou připojené k internetu ani k iPhonu.", "The watch has no internet and no iPhone nearby."))
        }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if status == 401 {
                store(nil)
                throw Failure(text: W.tr("Přihlášení vypršelo. Otevři Aurin v iPhonu.", "Your sign-in ran out. Open Aurin on your iPhone."))
            }
            throw Failure(text: object["message"] as? String ?? W.tr("Kouč teď neodpověděl.", "The coach didn't answer just now."))
        }
        let actions = object["actions"] as? [Any] ?? []
        return CoachResult(text: plain(object["answer"] as? String ?? ""),
                           chatId: (object["chatId"] as? NSNumber)?.intValue,
                           proposal: !actions.isEmpty || object["kind"] as? String == "food_draft")
    }

    /// A ride's or run's steps as Training's session detail on the iPhone asks for them.
    static func plan(_ plan: WatchPlan.Request) async -> WatchPlan? {
        var query = URLComponents()
        query.queryItems = [URLQueryItem(name: "id", value: plan.eventId)]
        if plan.date == WatchStore.localDate(Date()) { query.queryItems?.append(URLQueryItem(name: "date", value: plan.date)) }
        guard let session, let q = query.percentEncodedQuery,
              let request = request("/app/api/workouts/planned?" + q, session: session),
              let (data, response) = try? await urlSession.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return WatchPlan.parse(data, english: session.language == "en")
    }

    /// The answer without Markdown, as Siri reads it (SiriAnswer.coach on the iPhone).
    static func plain(_ answer: String) -> String {
        var text = answer
        for mark in ["**", "__", "`"] { text = text.replacingOccurrences(of: mark, with: "") }
        text = text.split(separator: "\n", omittingEmptySubsequences: true).map { line in
            var line = line.trimmingCharacters(in: .whitespaces)
            while let first = line.first, "#-*•".contains(first) { line = String(line.dropFirst()).trimmingCharacters(in: .whitespaces) }
            return line
        }.filter { !$0.isEmpty }.joined(separator: "\n")
        return text.isEmpty ? W.tr("Kouč teď neodpověděl.", "The coach didn't answer just now.") : text
    }

    private static func recent(_ text: String) -> Bool {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let sqlite = DateFormatter()
        sqlite.locale = Locale(identifier: "en_US_POSIX")
        sqlite.timeZone = TimeZone(identifier: "UTC")
        sqlite.dateFormat = "yyyy-MM-dd HH:mm:ss"
        guard let date = iso.date(from: text) ?? ISO8601DateFormatter().date(from: text) ?? sqlite.date(from: text) else { return false }
        return Date().timeIntervalSince(date) < 6 * 3600
    }
}
