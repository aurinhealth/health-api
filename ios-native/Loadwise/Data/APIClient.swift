import Foundation

enum APIError: LocalizedError, Equatable {
    case unauthorized
    case message(String)
    /// AI features need the user's AI consent first (403 ai_consent_required).
    case aiConsentRequired(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Přihlášení vypršelo. Přihlas se znovu."
        case .message(let text): return text
        case .aiConsentRequired(let text): return text
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
        return try await get(path, cacheKey: date == nil ? "today" : nil)
    }

    func training() async throws -> TrainingSnapshot {
        try await get("/app/api/training", cacheKey: "training")
    }

    // MARK: - Coach

    /// Asks the coach; yields the answer as it grows and the final result.
    func askCoach(_ message: String, chatId: Int?, view: String) -> AsyncThrowingStream<AssistantEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = makeRequest("/app/api/assistant", method: "POST")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("application/x-ndjson, application/json", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 180
                    var body: JSONObject = ["message": .string(message), "stream": .bool(true), "mode": .string("coach"),
                                            "appContext": .object(["view": .string(view), "date": .string(Self.localToday())])]
                    if let chatId { body["chatId"] = .number(Double(chatId)) }
                    request.httpBody = try JSONEncoder().encode(body)
                    let (bytes, response) = try await session.bytes(for: request)
                    let http = response as? HTTPURLResponse
                    let streaming = (http?.value(forHTTPHeaderField: "Content-Type") ?? "").contains("ndjson")
                    if !streaming {
                        // Gate failures and the short answers come as plain JSON.
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        try check(response, data)
                        continuation.yield(.done(try decoder.decode(AssistantResult.self, from: data)))
                        continuation.finish()
                        return
                    }
                    for try await line in bytes.lines {
                        guard let data = line.data(using: .utf8),
                              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                        switch object["type"] as? String {
                        case "progress": continuation.yield(.progress(object["message"] as? String ?? ""))
                        case "answer": continuation.yield(.answer(object["answer"] as? String ?? ""))
                        case "error": throw APIError.message(object["message"] as? String ?? "Kouč teď neodpověděl.")
                        case "done":
                            let result = try JSONSerialization.data(withJSONObject: object["result"] ?? [:])
                            continuation.yield(.done(try decoder.decode(AssistantResult.self, from: result)))
                        default: break
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func decideCoachAction(draftId: Int, confirm: Bool) async throws -> String? {
        struct Response: Decodable { let message: String? }
        let r: Response = try await send("/app/api/assistant/action", method: "POST",
                                         body: ["draftId": JSONValue.number(Double(draftId)), "decision": .string(confirm ? "confirm" : "reject")])
        return r.message
    }

    func chats() async throws -> [ChatSummary] {
        struct Response: Decodable { let chats: [ChatSummary]? }
        let r: Response = try await get("/app/api/assistant/chats")
        return r.chats ?? []
    }

    func chat(id: Int) async throws -> ChatDetail {
        struct Response: Decodable { let chat: ChatDetail }
        let r: Response = try await get("/app/api/assistant/chats/\(id)")
        return r.chat
    }

    func deleteChat(id: Int) async throws {
        let _: JSONValue = try await send("/app/api/assistant/chats/\(id)", method: "DELETE", body: JSONObject())
    }

    func coaches(date: String) async throws -> CoachesSnapshot {
        try await get("/app/api/coaches?date=" + date)
    }

    /// Whether the AI features are allowed (GET /app/api/me → consent).
    func aiAllowed() async throws -> Bool {
        struct Consent: Decodable { let aiAllowed: Bool? }
        struct Me: Decodable { let consent: Consent? }
        let me: Me = try await get("/app/api/me")
        return me.consent?.aiAllowed ?? false
    }

    func setAI(_ allowed: Bool) async throws {
        let _: JSONValue = try await send("/app/api/consent", method: "POST", body: ["ai": JSONValue.bool(allowed)])
    }

    /// All the account's data as a JSON file in the temporary folder, to share.
    func exportData() async throws -> URL {
        let (data, response) = try await session.data(for: makeRequest("/app/api/account/export"))
        try check(response, data)
        let url = FileManager.default.temporaryDirectory.appending(path: "loadwise-data-" + Self.localToday() + ".json")
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Deletes the account and everything in it (the user typed SMAZAT).
    func deleteAccount() async throws {
        let _: JSONValue = try await send("/app/api/account/delete", method: "POST", body: ["confirm": JSONValue.string("SMAZAT")])
        signOut()
    }

    /// Turns on the AI features (the user's consent, as in the web settings).
    func allowAI() async throws {
        let _: JSONValue = try await send("/app/api/consent", method: "POST", body: ["ai": JSONValue.bool(true)])
    }

    // MARK: - Workouts

    func gym(date: String) async throws -> GymDay {
        try await get("/app/api/gym?date=" + date)
    }

    /// Saves the whole plan (the server keeps the sheet and the history of sets).
    func saveGym(_ day: GymDay, date: String) async throws {
        var body = day.saveBody
        body["date"] = .string(date)
        let _: JSONValue = try await send("/app/api/gym", method: "POST", body: body)
    }

    /// Builds the day's gym plan (deterministic, not AI) and puts it in Intervals.icu.
    func generateGym(date: String, minutes: Int) async throws {
        let _: JSONValue = try await send("/app/api/gym/generate", method: "POST",
                                          body: ["date": JSONValue.string(date), "durationMinutes": .number(Double(minutes)), "userInitiated": .bool(true)])
    }

    func gymTechnique(exercise: String) async throws -> GymTechnique {
        struct Response: Decodable { let technique: GymTechnique }
        let r: Response = try await get("/app/api/gym/technique?exercise=" + Self.query(exercise))
        return r.technique
    }

    func gymAlternatives(date: String, exercise: String) async throws -> [GymAlternative] {
        struct Response: Decodable { let alternatives: [GymAlternative]? }
        let r: Response = try await get("/app/api/gym/alternatives?date=" + date + "&exercise=" + Self.query(exercise))
        return r.alternatives ?? []
    }

    func activityDetail(id: String) async throws -> ActivityDetail {
        try await get("/app/api/activity-detail?id=" + Self.query(id))
    }

    func plannedWorkout(eventId: String) async throws -> PlannedWorkout {
        try await get("/app/api/workouts/planned?id=" + Self.query(eventId))
    }

    func movePlanned(eventId: String, to date: String) async throws {
        let _: JSONValue = try await send("/app/api/planned/move", method: "POST", body: ["eventId": JSONValue.string(eventId), "date": .string(date)])
    }

    func deletePlanned(eventId: String) async throws {
        let _: JSONValue = try await send("/app/api/planned/delete", method: "POST", body: ["eventId": JSONValue.string(eventId)])
    }

    func setPlannedEnvironment(eventId: String, indoor: Bool) async throws {
        let _: JSONValue = try await send("/app/api/planned/environment", method: "POST",
                                          body: ["eventId": JSONValue.string(eventId), "environment": .string(indoor ? "indoor" : "outdoor")])
    }

    /// How a session went (RPE 1–10 and a note) for the coach.
    func reflection(date: String, rpe: Int, notes: String) async throws {
        let _: JSONValue = try await send("/app/api/coach/reflections", method: "POST",
                                          body: ["date": JSONValue.string(date), "rpe": .number(Double(rpe)), "notes": .string(notes)])
    }

    /// A session typed in: sport ride, run or gym; done (past) or planned (future).
    func manualWorkout(name: String, date: String, sport: String, minutes: Int, completed: Bool, rpe: Int?, notes: String) async throws {
        var body: JSONObject = ["name": .string(name), "date": .string(date), "sport": .string(sport), "minutes": .number(Double(minutes)),
                                "completed": .bool(completed), "notes": .string(notes), "requestId": .string(UUID().uuidString)]
        if let rpe { body["rpe"] = .number(Double(rpe)) }
        let _: JSONValue = try await send("/app/api/workouts/manual", method: "POST", body: body)
    }

    /// Today's date in the phone's zone, usable off the main actor.
    static func localToday() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    static func query(_ text: String) -> String {
        text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+?#"))) ?? text
    }

    // MARK: - Health

    func health(date: String? = nil) async throws -> HealthSnapshot {
        try await get("/app/api/health" + (date.map { "?date=" + $0 } ?? ""), cacheKey: date == nil ? "health" : nil)
    }

    func night(date: String) async throws -> NightDetail {
        try await get("/app/api/night?date=" + date)
    }

    func addWeight(kg: Double) async throws {
        let _: JSONValue = try await send("/app/api/weight", method: "POST", body: ["kg": JSONValue.number(kg)])
    }

    // MARK: - Food

    func food(date: String? = nil) async throws -> FoodSnapshot {
        try await get("/app/api/food-today" + (date.map { "?date=" + $0 } ?? ""), cacheKey: date == nil ? "food" : nil)
    }

    /// Personal foods, the shared catalog and recipes; with a barcode, that code.
    func searchFood(name: String, barcode: String? = nil) async throws -> [FoodProduct] {
        var body: JSONObject = ["name": .string(name)]
        if let barcode { body["barcode"] = .string(barcode) }
        let response: FoodSearchResponse = try await send("/app/api/food/search", method: "POST", body: body)
        return response.candidates ?? response.product.map { [$0] } ?? []
    }

    /// Foods saved before: the newest first, or the most often logged.
    func personalFoods(frequent: Bool = false) async throws -> [FoodProduct] {
        struct Response: Decodable { let products: [FoodProduct]? }
        let response: Response = try await get("/app/api/food/personal" + (frequent ? "?sort=frequent" : ""))
        return response.products ?? []
    }

    func recipes() async throws -> [FoodRecipe] {
        struct Response: Decodable { let recipes: [FoodRecipe]? }
        let response: Response = try await get("/app/api/food/recipes")
        return response.recipes ?? []
    }

    /// A new recipe: the ingredients with their values for the amount used.
    func saveRecipe(name: String, servings: Double, ingredients: [JSONValue]) async throws {
        let _: JSONValue = try await send("/app/api/food/recipes", method: "POST",
                                          body: ["name": JSONValue.string(name), "servings": .number(servings), "ingredients": .array(ingredients)])
    }

    func deleteRecipe(id: String) async throws {
        let _: JSONValue = try await send("/app/api/food/recipes", method: "DELETE", body: ["id": JSONValue.string(id)])
    }

    /// AI lookup of a food by name or barcode (counts against the AI allowance).
    func lookupFood(name: String, barcode: String? = nil) async throws -> FoodProduct? {
        var body: JSONObject = ["name": .string(name)]
        if let barcode { body["barcode"] = .string(barcode) }
        let response: FoodLookupResponse = try await send("/app/api/food/ai-lookup", method: "POST", body: body)
        return response.status == "ok" ? response.product : nil
    }

    /// Reads a photo with AI: "label" (the nutrition table, per 100 g/ml) or
    /// "portion" (a plate of food or a portion, the whole portion).
    func readFoodPhoto(_ jpeg: Data, mode: String) async throws -> (product: FoodProduct, note: String?) {
        struct Values: Decodable { let calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g: Double? }
        struct Response: Decodable { let status: String?; let name: String?; let basis: String?; let values: Values?; let servingSize: String?; let note: String?; let warning: String?; let message: String? }
        let body: JSONObject = ["image": .string("data:image/jpeg;base64," + jpeg.base64EncodedString()), "mode": .string(mode)]
        let r: Response = try await send("/app/api/food/photo", method: "POST", body: body)
        guard r.status == "ok", let v = r.values else { throw APIError.message(r.message ?? "Na fotce se hodnoty nepodařilo přečíst.") }
        var product = FoodProduct(name: (r.name?.isEmpty == false ? r.name! : "Jídlo z fotky"), calories_100g: v.calories_100g, protein_100g: v.protein_100g,
                                  carbs_100g: v.carbs_100g, fat_100g: v.fat_100g,
                                  nutrition_basis: r.basis == "portion" ? "portion" : r.basis == "100ml" ? "ml" : "g",
                                  serving_size: r.servingSize.flatMap { $0.isEmpty ? nil : JSONValue.string($0) },
                                  source: mode == "portion" ? "photo" : "package_label")
        product.fiber_100g = v.fiber_100g
        product.sugars_100g = v.sugars_100g
        product.salt_100g = v.salt_100g
        return (product, [r.note, r.warning].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " ").nilIfBlank)
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

    /// With a cache key the answer is also kept on disk (SnapshotCache).
    func get<T: Decodable>(_ path: String, cacheKey: String? = nil) async throws -> T {
        let (data, response) = try await session.data(for: makeRequest(path))
        try check(response, data)
        let value: T
        do {
            value = try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.message("Odpověď serveru se nepodařilo přečíst.")
        }
        if let cacheKey { SnapshotCache.save(data, key: cacheKey) }
        return value
    }

    func send<T: Decodable, B: Encodable>(_ path: String, method: String, body: B) async throws -> T {
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
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = json?["message"] as? String
            if json?["status"] as? String == "ai_consent_required" {
                throw APIError.aiConsentRequired(message ?? "AI funkce potřebují tvůj souhlas.")
            }
            throw APIError.message(message ?? "Server odpověděl chybou \(http.statusCode).")
        }
    }
}

extension String {
    var nilIfBlank: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self }
}
