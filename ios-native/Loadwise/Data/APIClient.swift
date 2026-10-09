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

    func training() async throws -> TrainingSnapshot {
        try await get("/app/api/training")
    }

    // MARK: - Health

    func health(date: String? = nil) async throws -> HealthSnapshot {
        try await get("/app/api/health" + (date.map { "?date=" + $0 } ?? ""))
    }

    func night(date: String) async throws -> NightDetail {
        try await get("/app/api/night?date=" + date)
    }

    func addWeight(kg: Double) async throws {
        let _: JSONValue = try await send("/app/api/weight", method: "POST", body: ["kg": JSONValue.number(kg)])
    }

    // MARK: - Food

    func food(date: String? = nil) async throws -> FoodSnapshot {
        try await get("/app/api/food-today" + (date.map { "?date=" + $0 } ?? ""))
    }

    /// Personal foods, the shared catalog and recipes; with a barcode, that code.
    func searchFood(name: String, barcode: String? = nil) async throws -> [FoodProduct] {
        var body: JSONObject = ["name": .string(name)]
        if let barcode { body["barcode"] = .string(barcode) }
        let response: FoodSearchResponse = try await send("/app/api/food/search", method: "POST", body: body)
        return response.candidates ?? response.product.map { [$0] } ?? []
    }

    /// Foods saved before (newest first).
    func personalFoods() async throws -> [FoodProduct] {
        struct Response: Decodable { let products: [FoodProduct]? }
        let response: Response = try await get("/app/api/food/personal")
        return response.products ?? []
    }

    /// AI lookup of a food by name or barcode (counts against the AI allowance).
    func lookupFood(name: String, barcode: String? = nil) async throws -> FoodProduct? {
        var body: JSONObject = ["name": .string(name)]
        if let barcode { body["barcode"] = .string(barcode) }
        let response: FoodLookupResponse = try await send("/app/api/food/ai-lookup", method: "POST", body: body)
        return response.status == "ok" ? response.product : nil
    }

    func logFood(_ request: FoodLogRequest) async throws {
        let _: JSONValue = try await send("/app/api/food/log", method: "POST", body: request)
    }

    func deleteFoodEntry(id: Int) async throws {
        let _: JSONValue = try await send("/app/api/food/entry", method: "DELETE", body: ["id": JSONValue.number(Double(id))])
    }

    /// water, coffee, tea, juice, milk, sport or other.
    func addFluid(ml: Int, kind: String = "water") async throws {
        let _: JSONValue = try await send("/app/api/fluids", method: "POST", body: ["ml": JSONValue.number(Double(ml)), "kind": .string(kind)])
    }

    // MARK: - Settings

    func profile() async throws -> JSONObject {
        let response: ProfileResponse = try await get("/app/api/profile")
        return response.profile ?? [:]
    }

    /// The server stores the whole profile, so this sends all of it.
    func saveProfile(_ profile: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/profile", method: "POST", body: profile)
    }

    func trainingProfile() async throws -> TrainingProfileResponse {
        try await get("/app/api/training-profile")
    }

    func saveTrainingProfile(_ profile: JSONObject) async throws -> TrainingProfileResponse {
        try await send("/app/api/training-profile", method: "POST", body: profile)
    }

    func connections() async throws -> ConnectionsResponse {
        try await get("/app/api/connections")
    }

    func syncStatus() async throws -> SyncStatus {
        try await get("/app/api/sync")
    }

    /// Starts a sync of all sources; the server answers 202 and works on.
    func startSync() async throws {
        let _: JSONValue = try await send("/app/api/sync", method: "POST", body: JSONObject())
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

    /// Ends the session on the server too; the cookie goes either way.
    func logout() async {
        _ = try? await session.data(for: makeRequest("/app/logout", method: "POST"))
        signOut()
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

    private func send<T: Decodable, B: Encodable>(_ path: String, method: String, body: B) async throws -> T {
        var request = makeRequest(path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        try check(response, data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            // Writes whose answer the app does not read may answer with nothing.
            if let ignored = JSONValue.null as? T { return ignored }
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
