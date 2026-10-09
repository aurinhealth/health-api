import Foundation
import Network

/// A write made without signal: a meal, a drink, a weigh-in or the gym sheet
/// of a day. It waits on the phone (OutboxStore) and AppModel.sendOutbox sends
/// it when the app comes back or the network returns. Meals, drinks and
/// weigh-ins carry a requestId, so the server keeps one even when an answer got
/// lost and the write goes out again (src/idempotency.js).
struct OutboxItem: Codable, Identifiable, Equatable {
    var id = UUID()
    let path: String
    let method: String
    var body: Data
    /// What it was, for the note when the server turns it down.
    var label: String
    /// A later write with the same key replaces this one (the gym sheet of a day).
    var key: String? = nil
    /// How the write shows on the screens until it is sent.
    var overlay: OutboxOverlay? = nil
    var created = Date()
    /// Server errors so far (5xx); after a few the write is given up.
    var failures = 0

    /// A JSON body: the encoded value with the extra fields (requestId…).
    static func json<T: Encodable>(_ value: T, adding extra: JSONObject = [:]) -> Data {
        guard let data = try? JSONEncoder().encode(value) else { return Data("{}".utf8) }
        guard !extra.isEmpty, var object = try? JSONDecoder().decode(JSONObject.self, from: data) else { return data }
        for (k, v) in extra { object[k] = v }
        return (try? JSONEncoder().encode(object)) ?? data
    }

    /// The body as fields (to change a waiting drink, or read a waiting gym sheet).
    var fields: JSONObject {
        (try? JSONDecoder().decode(JSONObject.self, from: body)) ?? [:]
    }
}

/// A waiting write as the Food and Today screens show it meanwhile: a meal or
/// drink added (with a negative local id), one removed or a drink changed.
struct OutboxOverlay: Codable, Equatable {
    enum Kind: String, Codable { case food, removeFood, drink, removeDrink, editDrink, weight }
    var kind: Kind
    var date: String
    /// The entry: its server id, or a negative local id for one not sent yet.
    var id: Int? = nil
    var name: String? = nil
    var meal: String? = nil
    var kcal: Double? = nil
    var protein: Double? = nil
    var carbs: Double? = nil
    var fat: Double? = nil
    var ml: Double? = nil
    var drink: String? = nil
    /// A changed drink as it was before.
    var previousMl: Double? = nil
    var previousDrink: String? = nil
    var time: String? = nil
    var kg: Double? = nil
}

/// Why a waiting write did not go out although the server answered.
enum OutboxRefusal: LocalizedError {
    /// 4xx: the server will never take it; the write is dropped with a note.
    case rejected(String)
    /// 5xx: maybe later.
    case retry(String)

    var errorDescription: String? {
        switch self {
        case .rejected(let message), .retry(let message): return message
        }
    }
}

enum Outbox {
    /// The request did not reach the server (no signal, the connection dropped,
    /// it timed out); a server error is not one of these.
    static func isNoConnection(_ error: Error) -> Bool {
        guard let code = (error as? URLError)?.code else { return false }
        return [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
                .dataNotAllowed, .internationalRoamingOff].contains(code)
    }

    /// A local id for a meal or drink not sent yet (negative, so never a server id).
    static func localId() -> Int {
        -Int.random(in: 1...999_999_999)
    }

    /// "HH:mm" now, and "yyyy-MM-ddTHH:mm" for the drink's time.
    static func clock(_ date: Date = Date(), withDay: Bool = false) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = withDay ? "yyyy-MM-dd'T'HH:mm" : "HH:mm"
        return f.string(from: date)
    }

    /// The waiting gym sheet of a day, as GymDay.
    static func gymDay(_ item: OutboxItem, date: String) -> GymDay? {
        guard case .array(let rows)? = item.fields["fullValues"] else { return nil }
        let values: [[JSONValue]] = rows.map { if case .array(let cells) = $0 { return cells } else { return [] } }
        return GymDay(date: date, values: values, cancelled: nil)
    }
}

/// The waiting writes on disk (Application Support), so they outlive the app.
/// Signing out deletes them with the account's other saved data.
enum OutboxStore {
    private static var url: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "outbox.json")
    }

    static func load() -> [OutboxItem] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([OutboxItem].self, from: data)) ?? []
    }

    static func save(_ items: [OutboxItem]) {
        if items.isEmpty { try? FileManager.default.removeItem(at: url); return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(items).write(to: url, options: .atomic)
    }

    /// The saved screen as it came from the server (SnapshotCache's file).
    static func savedSnapshot(_ key: String) -> Data? {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "snapshots", directoryHint: .isDirectory)
        return try? Data(contentsOf: dir.appending(path: key + ".json"))
    }
}

/// The last gym sheet of each day seen or saved on the phone, so the gym
/// session opens without signal too. Signing out deletes it.
enum GymDayCache {
    private static var directory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "gym", directoryHint: .isDirectory)
    }

    static func save(_ day: GymDay, date: String) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? JSONEncoder().encode(day.values).write(to: directory.appending(path: date + ".json"), options: .atomic)
    }

    static func load(date: String) -> GymDay? {
        guard let data = try? Data(contentsOf: directory.appending(path: date + ".json")),
              let values = try? JSONDecoder().decode([[JSONValue]].self, from: data) else { return nil }
        return GymDay(date: date, values: values, cancelled: nil)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: directory)
    }
}

/// The waiting writes laid over the server's Food and Today answers (raw
/// JSON, so fields added to the screens later pass through untouched).
enum OutboxPatch {
    /// How much a drink hydrates (src/fluids.js HYDRATION_FACTORS).
    static let hydration: [String: Double] = ["water": 1, "tea": 1, "coffee": 0.9, "juice": 1, "milk": 1.1, "sport": 1.1,
                                              "soda": 0.9, "beer": 0.5, "wine": 0, "other": 1, "food": 1]

    static func hydrationMl(_ ml: Double, _ kind: String?) -> Double {
        (ml * (hydration[kind ?? "water"] ?? 1)).rounded()
    }

    private static func number(_ value: Any?) -> Double {
        (value as? NSNumber)?.doubleValue ?? 0
    }

    private static func object(_ data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private static func data(_ object: [String: Any], or original: Data) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? original
    }

    /// Adds sign × value to a number field (kept when there is nothing to add).
    private static func add(_ dict: inout [String: Any], _ key: String, _ value: Double?, _ sign: Double) {
        guard let value, value != 0 else { return }
        dict[key] = max(0, number(dict[key]) + sign * value)
    }

    private static func addMacro(_ dict: inout [String: Any], _ key: String, _ value: Double?, _ sign: Double) {
        guard var macro = dict[key] as? [String: Any] else { return }
        add(&macro, "eaten", value, sign)
        dict[key] = macro
    }

    /// GET /app/api/food-today with the waiting meals and drinks of its day.
    static func food(_ base: Data, _ overlays: [OutboxOverlay]) -> Data {
        guard var root = object(base), let date = root["date"] as? String else { return base }
        let own = overlays.filter { $0.date == date }
        guard !own.isEmpty else { return base }
        var meals = root["meals"] as? [[String: Any]] ?? []
        var macros = root["macros"] as? [String: Any] ?? [:]
        var water = root["water"] as? [String: Any] ?? [:]
        var drinks = water["drinks"] as? [[String: Any]] ?? []
        func totals(_ o: OutboxOverlay, _ sign: Double) {
            add(&root, "kcal", o.kcal, sign)
            addMacro(&macros, "protein", o.protein, sign)
            addMacro(&macros, "carbs", o.carbs, sign)
            addMacro(&macros, "fat", o.fat, sign)
        }
        func drink(_ ml: Double?, _ kind: String?, _ sign: Double) {
            guard let ml else { return }
            add(&water, "ml", hydrationMl(ml, kind), sign)
            add(&water, "drunkMl", ml, sign)
            water["entries"] = max(0, Int(number(water["entries"])) + Int(sign))
        }
        for o in own {
            switch o.kind {
            case .food:
                totals(o, 1)
                if let i = meals.firstIndex(where: { $0["type"] as? String == o.meal }) {
                    var entry: [String: Any] = ["id": o.id ?? 0, "name": o.name ?? "", "meal": o.meal ?? ""]
                    if let t = o.time { entry["time"] = t }
                    for (k, v) in [("kcal", o.kcal), ("protein", o.protein), ("carbs", o.carbs), ("fat", o.fat)] { if let v { entry[k] = v } }
                    var entries = meals[i]["entries"] as? [[String: Any]] ?? []
                    entries.append(entry)
                    meals[i]["entries"] = entries
                    add(&meals[i], "kcal", o.kcal, 1)
                }
            case .removeFood:
                for i in meals.indices {
                    var entries = meals[i]["entries"] as? [[String: Any]] ?? []
                    guard let j = entries.firstIndex(where: { Int(number($0["id"])) == o.id }) else { continue }
                    entries.remove(at: j)
                    meals[i]["entries"] = entries
                    add(&meals[i], "kcal", o.kcal, -1)
                    totals(o, -1)
                }
            case .drink:
                drink(o.ml, o.drink, 1)
                var row: [String: Any] = ["id": o.id ?? 0, "kind": o.drink ?? "water"]
                if let ml = o.ml { row["ml"] = ml; row["hydrationMl"] = hydrationMl(ml, o.drink) }
                if let t = o.time { row["time"] = t }
                drinks.append(row)
            case .removeDrink:
                guard let j = drinks.firstIndex(where: { Int(number($0["id"])) == o.id }) else { continue }
                drinks.remove(at: j)
                drink(o.ml, o.drink, -1)
            case .editDrink:
                guard let j = drinks.firstIndex(where: { Int(number($0["id"])) == o.id }), let ml = o.ml else { continue }
                let oldMl = o.previousMl ?? number(drinks[j]["ml"]), oldKind = o.previousDrink ?? drinks[j]["kind"] as? String
                add(&water, "ml", hydrationMl(oldMl, oldKind), -1)
                add(&water, "drunkMl", oldMl, -1)
                add(&water, "ml", hydrationMl(ml, o.drink), 1)
                add(&water, "drunkMl", ml, 1)
                drinks[j]["ml"] = ml
                drinks[j]["kind"] = o.drink ?? oldKind ?? "water"
                drinks[j]["hydrationMl"] = hydrationMl(ml, o.drink ?? oldKind)
            case .weight:
                break
            }
        }
        if water["drinks"] != nil || !drinks.isEmpty { water["drinks"] = drinks }
        root["meals"] = meals
        root["macros"] = macros
        root["water"] = water
        return data(root, or: base)
    }

    /// GET /app/api/today with the waiting meals, drinks and weigh-in of its day.
    static func today(_ base: Data, _ overlays: [OutboxOverlay]) -> Data {
        guard var root = object(base), let date = root["date"] as? String else { return base }
        let own = overlays.filter { $0.date == date }
        guard !own.isEmpty, var nutrition = root["nutrition"] as? [String: Any] else { return base }
        var water = nutrition["water"] as? [String: Any] ?? [:]
        for o in own {
            let sign: Double = o.kind == .removeFood || o.kind == .removeDrink ? -1 : 1
            switch o.kind {
            case .food, .removeFood:
                add(&nutrition, "kcal", o.kcal, sign)
                addMacro(&nutrition, "protein", o.protein, sign)
                addMacro(&nutrition, "carbs", o.carbs, sign)
                addMacro(&nutrition, "fat", o.fat, sign)
            case .drink, .removeDrink:
                if let ml = o.ml { add(&water, "ml", hydrationMl(ml, o.drink), sign) }
            case .editDrink:
                if let ml = o.ml, let old = o.previousMl {
                    add(&water, "ml", hydrationMl(old, o.previousDrink), -1)
                    add(&water, "ml", hydrationMl(ml, o.drink), 1)
                }
            case .weight:
                if let kg = o.kg, var weight = root["weight"] as? [String: Any] {
                    weight["latest"] = kg
                    root["weight"] = weight
                }
            }
        }
        if !water.isEmpty { nutrition["water"] = water }
        root["nutrition"] = nutrition
        return data(root, or: base)
    }
}

/// Tells when the network comes back (NWPathMonitor), to send what waits.
final class NetworkWatch: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private var connected = true

    init(onBack: @escaping @MainActor @Sendable () async -> Void) {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let now = path.status == .satisfied
            let back = now && !self.connected
            self.connected = now
            if back { Task { @MainActor in await onBack() } }
        }
        monitor.start(queue: DispatchQueue(label: "loadwise.network"))
    }

    deinit { monitor.cancel() }
}
