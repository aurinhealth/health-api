import Foundation

enum APIError: LocalizedError, Equatable {
    case unauthorized
    case message(String)
    /// AI features need the user's AI consent first (403 ai_consent_required).
    case aiConsentRequired(String)
    /// The server no longer serves this version of the app (426, src/app-version.js).
    case updateRequired(String)
    /// The AI feature needs the AI subscription (402 subscription_required).
    case subscriptionRequired(String)
    /// This week's messages to the coach are used up (429 coach_allowance_used).
    case coachAllowanceUsed(String, CoachAllowance?)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return L10n.tr("Přihlášení vypršelo. Přihlas se znovu.")
        case .message(let text): return text
        case .aiConsentRequired(let text): return text
        case .updateRequired(let text): return text
        case .subscriptionRequired(let text): return text
        case .coachAllowanceUsed(let text, _): return text
        }
    }
}

/// The Loadwise server (the Cloudflare Worker in src/). The session is the
/// pfd_session cookie, which URLSession keeps in the shared cookie storage.
final class APIClient: @unchecked Sendable {
    static let sessionCookie = "pfd_session"
    /// The version of the server's API this app reads, sent as X-Loadwise-Api.
    /// Raise it together with MIN_APP_API in src/app-version.js when a server
    /// change breaks what installed apps expect; older apps then ask for an update.
    static let apiLevel = 1

    /// An AI feature answered 402: AppModel shows the Loadwise Pro offer.
    var onSubscriptionRequired: (@Sendable () -> Void)?

    /// Called on the first 426: AppModel swaps the screens for the update notice.
    var onUpdateRequired: (@Sendable () -> Void)?

    /// A client made without an address follows Nastavení → Testování → Server,
    /// also when it is switched while the client lives (AppDelegate's, Apple Health's).
    private let fixedBaseURL: URL?
    var baseURL: URL { fixedBaseURL ?? Self.server }
    private let session: URLSession
    private let decoder = JSONDecoder()

    /// The server's address (ServerChoice.swift). petrfitnessdata.eu, the old
    /// one, still serves the live server for builds from before the move.
    static var server: URL { ServerChoice.current.url }
    private static let legacyServer = URL(string: "https://petrfitnessdata.eu")!

    init(baseURL: URL? = nil) {
        self.fixedBaseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config)
        Self.moveLegacySession(to: self.baseURL)
    }

    /// Builds from before the move kept the session cookie for petrfitnessdata.eu.
    /// The server signs it without the host, so the same cookie keeps the user
    /// signed in on the new address. It moves rather than copies, so a sign-out
    /// on the new address stays a sign-out.
    private static func moveLegacySession(to baseURL: URL) {
        // Only onto the live server: the test server has sessions of its own.
        guard let host = baseURL.host(), host == ServerChoice.live.url.host() else { return }
        let storage = HTTPCookieStorage.shared
        guard let old = storage.cookies(for: legacyServer)?.first(where: { $0.name == sessionCookie }) else { return }
        storage.deleteCookie(old)
        let current = (storage.cookies(for: baseURL) ?? []).contains { $0.name == sessionCookie }
        guard !current, (old.expiresDate ?? .distantFuture) > Date() else { return }
        var properties: [HTTPCookiePropertyKey: Any] = [.name: old.name, .value: old.value, .domain: host, .path: "/", .secure: "TRUE", HTTPCookiePropertyKey("HttpOnly"): "TRUE"]
        if let expires = old.expiresDate { properties[.expires] = expires }
        if let cookie = HTTPCookie(properties: properties) { storage.setCookie(cookie) }
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

    /// Today with the answer as it came, for the writes waiting for signal (OutboxPatch).
    func todayData(date: String? = nil) async throws -> (TodaySnapshot, Data) {
        var path = "/app/api/today"
        if let date { path += "?date=" + date }
        return try await getWithData(path, cacheKey: SnapshotCache.dayKey("today", date))
    }

    func training() async throws -> TrainingSnapshot {
        try await get("/app/api/training", cacheKey: "training")
    }

    // MARK: - Coach

    /// Asks the coach; yields the answer as it grows and the final result.
    func askCoach(_ message: String, chatId: Int?, view: String, date: String? = nil) -> AsyncThrowingStream<AssistantEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = makeRequest("/app/api/assistant", method: "POST")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("application/x-ndjson, application/json", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 180
                    var body: JSONObject = ["message": .string(message), "stream": .bool(true), "mode": .string("auto"),
                                            "appContext": .object(["view": .string(view), "date": .string(date ?? Self.localToday())])]
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
                        case "error": throw APIError.message(object["message"] as? String ?? L10n.tr("Kouč teď neodpověděl."))
                        case "done":
                            let result = try JSONSerialization.data(withJSONObject: object["result"] ?? [:])
                            continuation.yield(.done(try decoder.decode(AssistantResult.self, from: result)))
                        default: break
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: Self.readable(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// The server's line ("Návrh potvrzen.", "Smazáno") and, for a change of a
    /// done activity, the token "Vrátit" sends back.
    func decideCoachAction(draftId: Int, confirm: Bool) async throws -> (message: String?, undo: String?) {
        struct Response: Decodable { let message: String?; let undo: String? }
        let r: Response = try await send("/app/api/assistant/action", method: "POST",
                                         body: ["draftId": JSONValue.number(Double(draftId)), "decision": .string(confirm ? "confirm" : "reject")])
        return (r.message, r.undo)
    }

    /// "Vrátit" under a confirmed delete, merge or time change of a done activity.
    func undoActivityChange(token: String) async throws {
        let _: JSONValue = try await send("/app/api/activity/undo", method: "POST", body: ["token": JSONValue.string(token)])
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

    /// The signed-in account's name and e-mail (GET /app/api/me → user).
    func account() async throws -> (name: String?, email: String?) {
        struct User: Decodable { let name: String?; let email: String? }
        struct Me: Decodable { let user: User? }
        let me: Me = try await get("/app/api/me")
        return (me.user?.name?.nilIfBlank, me.user?.email?.nilIfBlank)
    }

    /// An internal tester, who may switch the server (GET /app/api/me →
    /// internalTester), and the app's owner, who approves food corrections.
    func roles() async throws -> (internalTester: Bool, owner: Bool) {
        struct User: Decodable { let isOwner: Bool? }
        struct Me: Decodable { let internalTester: Bool?; let user: User? }
        let me: Me = try await get("/app/api/me")
        return (me.internalTester ?? false, me.user?.isOwner ?? false)
    }

    func setAI(_ allowed: Bool) async throws {
        let _: JSONValue = try await send("/app/api/consent", method: "POST", body: ["ai": JSONValue.bool(allowed)])
    }

    /// All the account's data as an NDJSON file in the temporary folder, to
    /// share (one JSON object per line: a header, then a line per record).
    /// A long-used account runs to hundreds of megabytes, so the server
    /// streams it and the app downloads it straight to a file.
    func exportData() async throws -> URL {
        var request = makeRequest("/app/api/account/export")
        request.setValue("application/x-ndjson, application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 300
        let (downloaded, response) = try await session.download(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) {
            // Errors come as a short JSON message.
            let data = (try? Data(contentsOf: downloaded)) ?? Data()
            try? FileManager.default.removeItem(at: downloaded)
            try check(response, data)
            throw APIError.message(L10n.f("Server odpověděl chybou %@.", String(status)))
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "aurin-data-" + Self.localToday() + ".ndjson")
        try? FileManager.default.removeItem(at: url)
        try FileManager.default.moveItem(at: downloaded, to: url)
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
        let _: JSONValue = try await send("/app/api/gym", method: "POST", body: Self.gymBody(day, date: date))
    }

    static func gymBody(_ day: GymDay, date: String) -> JSONObject {
        var body = day.saveBody
        body["date"] = .string(date)
        return body
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

    /// Replacements that fit the active place, without the exercises already in
    /// the plan (`inPlan`: a proposal not saved yet).
    func gymAlternatives(date: String, exercise: String, inPlan: [String] = []) async throws -> [GymAlternative] {
        struct Response: Decodable { let alternatives: [GymAlternative]? }
        var path = "/app/api/gym/alternatives?date=" + date + "&exercise=" + Self.query(exercise)
        if !inPlan.isEmpty, let data = try? JSONEncoder().encode(inPlan), let json = String(data: data, encoding: .utf8) {
            path += "&inPlan=" + Self.query(json)
        }
        let r: Response = try await get(path)
        return r.alternatives ?? []
    }

    func activityDetail(id: String) async throws -> ActivityDetail {
        try await get("/app/api/activity-detail?id=" + Self.query(id))
    }

    /// A workout from the watch (Apple Health, Google Health).
    func watchDetail(_ ref: WatchRef) async throws -> ActivityDetail {
        try await get("/app/api/activity-detail/watch?source=" + Self.query(ref.source) + "&id=" + Self.query(ref.id))
    }

    func plannedWorkout(eventId: String) async throws -> PlannedWorkout {
        try await get("/app/api/workouts/planned?id=" + Self.query(eventId))
    }

    func movePlanned(eventId: String, to date: String) async throws {
        let _: JSONValue = try await send("/app/api/planned/move", method: "POST", body: ["eventId": JSONValue.string(eventId), "date": .string(date)])
    }

    /// Another day and the time of day: time "" leaves the day without one,
    /// "HH:MM" sets it, nil keeps it. The answer may carry a note about other changes.
    func reschedulePlanned(eventId: String, to date: String, time: String?) async throws -> PlannedChange {
        var body: JSONObject = ["eventId": .string(eventId), "date": .string(date)]
        if let time { body["time"] = time.isEmpty ? JSONValue.null : JSONValue.string(time) }
        let change: PlannedChange = try await send("/app/api/planned/move", method: "POST", body: body)
        return change
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
    /// A done one comes back with where it was sent (Synchronizace).
    @discardableResult
    func manualWorkout(name: String, date: String, sport: String, minutes: Int, completed: Bool, rpe: Int?, notes: String,
                       start: Date? = nil, heart: WindowHeartRate? = nil, pairWith: String? = nil) async throws -> ManualWorkoutResult {
        var body: JSONObject = ["name": .string(name), "date": .string(date), "sport": .string(sport), "minutes": .number(Double(minutes)),
                                "completed": .bool(completed), "notes": .string(notes), "requestId": .string(UUID().uuidString)]
        if let rpe { body["rpe"] = .number(Double(rpe)) }
        if let start {
            // The window the heart rate was read for; the start's clock time in the phone's zone.
            let iso = ISO8601DateFormatter()
            body["start"] = .string(iso.string(from: start))
            body["end"] = .string(iso.string(from: start.addingTimeInterval(Double(minutes) * 60)))
            let clock = Calendar.current.dateComponents([.hour, .minute], from: start)
            body["time"] = .string(String(format: "%02d:%02d", clock.hour ?? 12, clock.minute ?? 0))
        }
        if let v = heart?.avgHr { body["avgHr"] = .number(Double(v)) }
        if let v = heart?.maxHr { body["maxHr"] = .number(Double(v)) }
        if let v = heart?.kcal { body["kcal"] = .number(Double(v)) }
        // The watch's record it is paired with: nothing is sent anywhere then.
        if let pairWith { body["pairWith"] = .string(pairWith) }
        return try await send("/app/api/workouts/manual", method: "POST", body: body)
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
        try await get("/app/api/health" + (date.map { "?date=" + $0 } ?? ""), cacheKey: SnapshotCache.dayKey("health", date))
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

    func foodData(date: String? = nil) async throws -> (FoodSnapshot, Data) {
        try await getWithData("/app/api/food-today" + (date.map { "?date=" + $0 } ?? ""), cacheKey: SnapshotCache.dayKey("food", date))
    }

    /// Živiny: the day (days 1) or the last 7 days up to date.
    func nutrients(date: String, days: Int) async throws -> NutrientsPage {
        try await get("/app/api/food/nutrients?date=\(date)&days=\(days)")
    }

    func nutrientDetail(key: String, date: String) async throws -> NutrientDetail {
        try await get("/app/api/food/nutrients?date=\(date)&key=\(key)")
    }

    /// Up to three nutrients shown on Jídlo (Pro).
    func saveNutrientFavorites(_ keys: [String]) async throws {
        let _: JSONValue = try await send("/app/api/food/nutrients/favorites", method: "POST", body: ["favorites": keys])
    }

    /// Personal foods, the shared catalog and recipes; with a barcode, that code.
    func searchFood(name: String, barcode: String? = nil) async throws -> [FoodProduct] {
        var body: JSONObject = ["name": .string(name)]
        if let barcode { body["barcode"] = .string(barcode) }
        let response: FoodSearchResponse = try await send("/app/api/food/search", method: "POST", body: body)
        return response.candidates ?? response.product.map { [$0] } ?? []
    }

    /// Foods saved before: the newest first, or the most often logged.
    func personalFoods(frequent: Bool = false, limit: Int = 100) async throws -> [FoodProduct] {
        struct Response: Decodable { let products: [FoodProduct]? }
        let response: Response = try await get("/app/api/food/personal?limit=\(limit)" + (frequent ? "&sort=frequent" : ""))
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
    /// estimate: when the web has no such product, typical values marked as
    /// an AI estimate (source "ai-estimate").
    func lookupFood(name: String, barcode: String? = nil, estimate: Bool = true) async throws -> FoodProduct? {
        var body: JSONObject = ["name": .string(name), "estimate": .bool(estimate)]
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
        let r: Response = try await send("/app/api/food/photo", method: "POST", body: body, timeout: 180)
        guard r.status == "ok", let v = r.values else { throw APIError.message(r.message ?? L10n.tr("Na fotce se hodnoty nepodařilo přečíst.")) }
        var product = FoodProduct(name: (r.name?.isEmpty == false ? r.name! : L10n.tr("Jídlo z fotky")), calories_100g: v.calories_100g, protein_100g: v.protein_100g,
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
    func addFluid(ml: Int, kind: String = "water", date: String? = nil) async throws {
        var body: JSONObject = ["ml": .number(Double(ml)), "kind": .string(kind)]
        if let date { body["date"] = .string(date) }
        let _: JSONValue = try await send("/app/api/fluids", method: "POST", body: body)
    }

    /// Pairs a planned session with the activity that fulfilled it; nil
    /// keeps the plan unpaired (src/manual-pairs.js).
    func pairActivity(plannedId: String, activityId: String?, date: String) async throws {
        let body: JSONObject = ["plannedId": .string(plannedId), "activityId": activityId.map { .string($0) } ?? .null, "date": .string(date)]
        let _: JSONValue = try await send("/app/api/training/pair", method: "POST", body: body)
    }

    // MARK: - Settings

    func profile() async throws -> JSONObject {
        try await profileWithSuggestions().profile ?? [:]
    }

    func profileWithSuggestions() async throws -> ProfileResponse {
        try await get("/app/api/profile")
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
        let (data, response) = try await load(request)
        try check(response, data)
        guard hasSession else { throw APIError.message(L10n.tr("Server nevrátil přihlášení. Zkus to znovu.")) }
    }

    /// Sign in with Apple in the app: Apple's identity token and one-time code
    /// for the session cookie (POST /auth/app/apple).
    func appleLogin(identityToken: String, authorizationCode: String?, nonce: String, name: String?) async throws {
        var body: [String: JSONValue] = ["identityToken": .string(identityToken), "nonce": .string(nonce)]
        if let authorizationCode { body["authorizationCode"] = .string(authorizationCode) }
        if let name, !name.isEmpty { body["name"] = .string(name) }
        let _: JSONValue = try await send("/auth/app/apple", method: "POST", body: body)
        guard hasSession else { throw APIError.message(L10n.tr("Server nevrátil přihlášení. Zkus to znovu.")) }
    }

    /// E-mail sign-in, step 1: a six-digit code goes to the address (when it has access).
    func startEmailLogin(email: String) async throws {
        let _: JSONValue = try await send("/auth/email/start", method: "POST", body: ["email": JSONValue.string(email)])
    }

    /// Step 2: the code for the session cookie.
    func verifyEmailLogin(email: String, code: String) async throws {
        let _: JSONValue = try await send("/auth/email/verify", method: "POST", body: ["email": JSONValue.string(email), "code": .string(code)])
        guard hasSession else { throw APIError.message(L10n.tr("Server nevrátil přihlášení. Zkus to znovu.")) }
    }

    // MARK: - Data sources

    /// A short-lived link that opens the provider's consent in the browser
    /// sheet, signed in as this user (src/native-connect.js).
    func connectLink(provider: String) async throws -> URL {
        struct Response: Decodable { let url: String }
        let r: Response = try await send("/app/api/connect/start", method: "POST", body: ["provider": JSONValue.string(provider)])
        guard let url = URL(string: r.url) else { throw APIError.message(L10n.tr("Odkaz na připojení je neplatný.")) }
        return url
    }

    func saveSourcePriority(_ priority: SourcePriority) async throws {
        let _: JSONValue = try await send("/app/api/sources/priority", method: "POST", body: priority)
    }

    func disconnect(provider: String) async throws {
        let _: JSONValue = try await send("/app/api/connections", method: "DELETE", body: ["provider": JSONValue.string(provider)])
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
        let (value, _): (T, Data) = try await getWithData(path, cacheKey: cacheKey)
        return value
    }

    /// The decoded answer and its JSON as it came.
    func getWithData<T: Decodable>(_ path: String, cacheKey: String? = nil) async throws -> (T, Data) {
        let (data, response) = try await load(makeRequest(path))
        try check(response, data)
        let value: T
        do {
            value = try decoder.decode(T.self, from: data)
        } catch {
            ErrorLog.add(path: "GET \(path)", status: nil, message: ErrorLog.describe(error))
            throw APIError.message(L10n.tr("Odpověď serveru se nepodařilo přečíst."))
        }
        if let cacheKey { SnapshotCache.save(data, key: cacheKey) }
        return (value, data)
    }

    /// A file as it came, not JSON (Svaly's 3D figure, Muscle3D.swift).
    func getData(_ path: String) async throws -> Data {
        var request = makeRequest(path)
        request.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 60
        let (data, response) = try await load(request)
        try check(response, data)
        return data
    }

    /// Sends a write that may have waited for signal (Outbox). A missing
    /// connection throws the URLError; an answer other than 2xx throws
    /// OutboxRefusal (.rejected for 4xx, never accepted; .retry for 5xx).
    /// The server's answer (the new entry's id, for a meal or drink).
    @discardableResult
    func sendQueued(_ item: OutboxItem) async throws -> Data {
        var request = makeRequest(item.path, method: item.method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = item.body
        request.timeoutInterval = 20
        let (data, response) = try await load(request)
        guard let http = response as? HTTPURLResponse else { throw OutboxRefusal.retry(L10n.tr("Server neodpověděl.")) }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = json?["message"] as? String ?? L10n.f("Server odpověděl chybou %@.", String(http.statusCode))
            // Too old an app: the write waits for the new version instead of being dropped.
            if http.statusCode == 426 {
                onUpdateRequired?()
                throw OutboxRefusal.retry(message)
            }
            // A timeout or too many requests at the server: later, as with a server error.
            if (400..<500).contains(http.statusCode), ![408, 429].contains(http.statusCode) { throw OutboxRefusal.rejected(message) }
            throw OutboxRefusal.retry(message)
        }
        return data
    }

    /// timeout: longer for AI that reads photos, which may wait in line on the
    /// server behind the user's other AI calls (src/ai-usage.js claimAiSlot).
    func send<T: Decodable, B: Encodable>(_ path: String, method: String, body: B, timeout: TimeInterval? = nil) async throws -> T {
        var request = makeRequest(path, method: method)
        if let timeout { request.timeoutInterval = timeout }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await load(request)
        try check(response, data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            // Writes whose answer the app does not read may answer with nothing.
            if let ignored = JSONValue.null as? T { return ignored }
            ErrorLog.add(path: "\(method) \(path)", status: nil, message: ErrorLog.describe(error))
            throw APIError.message(L10n.tr("Odpověď serveru se nepodařilo přečíst."))
        }
    }

    /// Every request but the sign-out: what fails lands in ErrorLog, which
    /// "Nahlásit problém" sends with the report.
    private func load(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                ErrorLog.add(request, status: http.statusCode, message: json?["message"] as? String)
            }
            return (data, response)
        } catch {
            // A screen that went away cancels its requests; that is no failure.
            if (error as? URLError)?.code != .cancelled, !(error is CancellationError) {
                ErrorLog.add(request, status: nil, message: error.localizedDescription)
            }
            throw Self.readable(error)
        }
    }

    /// iOS words connection failures for engineers ("Chyba TLS způsobila
    /// selhání zabezpečeného připojení"). This keeps the URLError and its code,
    /// so Outbox and the offline notice still see it, and says what to do.
    static func readable(_ error: Error) -> Error {
        guard let url = error as? URLError else { return error }
        let text: String
        switch url.code {
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasUnknownRoot,
             .serverCertificateHasBadDate, .serverCertificateNotYetValid, .clientCertificateRejected:
            text = L10n.tr("Síť blokuje spojení. Přihlas se do Wi-Fi, nebo přepni na data.")
        case .notConnectedToInternet, .dataNotAllowed:
            text = L10n.tr("Telefon není připojený k internetu.")
        case .internationalRoamingOff:
            text = L10n.tr("Mobilní data v roamingu jsou vypnutá.")
        case .timedOut:
            text = L10n.tr("Server neodpověděl včas. Zkus to za chvíli znovu.")
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .networkConnectionLost:
            text = L10n.tr("Nepodařilo se spojit se serverem Aurinu. Zkontroluj připojení a zkus to znovu.")
        default:
            return error
        }
        var info = url.userInfo
        info[NSLocalizedDescriptionKey] = text
        return URLError(url.code, userInfo: info)
    }

    private func makeRequest(_ path: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: URL(string: path, relativeTo: baseURL)!.absoluteURL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // The server counts days in the user's zone and writes its texts in the
        // app's language and units.
        request.setValue(TimeZone.current.identifier, forHTTPHeaderField: "X-Time-Zone")
        request.setValue(L10n.language, forHTTPHeaderField: "X-Interface-Language")
        request.setValue(Units.imperial ? "imperial" : "metric", forHTTPHeaderField: "X-Units")
        request.setValue(String(Self.apiLevel), forHTTPHeaderField: "X-Loadwise-Api")
        // Writes with the session cookie must come from the site's own origin.
        if method != "GET" && (path.hasPrefix("/app/") || path.hasPrefix("/auth/")) {
            request.setValue(baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        }
        return request
    }

    private func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.message(L10n.tr("Server neodpověděl.")) }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = json?["message"] as? String
            if http.statusCode == 426 {
                onUpdateRequired?()
                throw APIError.updateRequired(message ?? L10n.tr("Tahle verze Aurinu už není podporovaná. Nainstaluj novější verzi."))
            }
            if json?["status"] as? String == "ai_consent_required" {
                throw APIError.aiConsentRequired(message ?? L10n.tr("AI funkce potřebují tvůj souhlas."))
            }
            if json?["status"] as? String == "coach_allowance_used" {
                struct Used: Decodable { let coachAllowance: CoachAllowance? }
                throw APIError.coachAllowanceUsed(message ?? L10n.tr("Zprávy koučovi na tento týden jsou vyčerpané."), (try? decoder.decode(Used.self, from: data))?.coachAllowance)
            }
            if http.statusCode == 402 {
                onSubscriptionRequired?()
                throw APIError.subscriptionRequired(message ?? L10n.tr("Tahle AI funkce je součástí AI předplatného."))
            }
            throw APIError.message(message ?? L10n.f("Server odpověděl chybou %@.", String(http.statusCode)))
        }
    }
}

extension String {
    var nilIfBlank: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self }
}
