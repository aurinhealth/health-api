import Foundation

/// GET /app/api/cycle (src/routes-cycle.js, src/cycle-model.js): the cycle
/// settings, where today is in the cycle and the calendar month. `available`
/// is false only from an older server that limited it to women.
struct CycleResponse: Decodable, Equatable {
    let available: Bool
    var settings: CycleSettings? = nil
    var state: CycleState? = nil
    var askPeriod: Bool? = nil
    /// "YYYY-MM"
    var month: String? = nil
    var days: [CycleDay]? = nil

    var enabled: Bool { available && settings?.enabled == true }
}

struct CycleSettings: Codable, Equatable {
    var enabled: Bool
    var lastPeriod: String?
    var cycleLength: Int?
    var periodLength: Int?
    /// none, pill, patch, ring, hormonal_iud, copper_iud, implant, injection
    var contraception: String
    var adaptTraining: Bool
    /// "21+7", "24+4" or "28"
    var pillPack: String
    var packStart: String?
    var pillReminder: Bool
    /// "HH:MM"
    var pillReminderTime: String
    var pillReminderInPause: Bool
    /// The AI coach sees today's cycle (src/cycle-model.js cycleForCoach).
    var shareWithCoach: Bool?

    var hormonal: Bool { Self.hormonal.contains(contraception) }
    static let hormonal: Set<String> = ["pill", "patch", "ring", "hormonal_iud", "implant", "injection"]

    /// The choices of Antikoncepce, in the order of the picker.
    static let contraceptions: [(id: String, title: String, symbol: String)] = [
        ("none", "Žádná", "circle.slash"),
        ("pill", "Pilulka", "pills"),
        ("patch", "Náplast", "bandage"),
        ("ring", "Kroužek", "circle.circle"),
        ("hormonal_iud", "Hormonální tělísko", "t.circle"),
        ("copper_iud", "Měděné tělísko", "t.circle"),
        ("implant", "Implantát", "capsule.portrait"),
        ("injection", "Injekce", "syringe")
    ]

    static func title(of contraception: String) -> String {
        contraceptions.first { $0.id == contraception }?.title ?? "Žádná"
    }
}

struct CycleState: Decodable, Equatable {
    let date: String
    let contraception: String
    let hormonal: Bool
    /// Natural cycle: day of the cycle, phase (menstrual, follicular,
    /// ovulation, luteal) and the next period as a range.
    var cycleDay: Int? = nil
    var phase: String? = nil
    var length: Int? = nil
    var learned: Bool? = nil
    var periodLength: Int? = nil
    var lastStart: String? = nil
    var ovulation: String? = nil
    var next: Next? = nil
    var daysToNext: Int? = nil
    /// Hormonal contraception: days since the last bleeding.
    var daysSinceBleeding: Int? = nil
    var pill: PillDay? = nil
    var today: Logged? = nil

    struct Next: Decodable, Equatable {
        let start: String
        let from: String
        let to: String
        let late: Bool
    }

    struct Logged: Decodable, Equatable {
        let flow: Int
        let symptoms: [String]
        var pill: String? = nil
    }
}

/// The pill of the pack on a day (src/cycle-model.js pillState).
struct PillDay: Decodable, Equatable {
    let pack: String
    let number: Int?
    let of: Int
    let pause: Bool
    var pauseDay: Int? = nil
    /// "HH:MM", "taken" or nil.
    var taken: String? = nil
}

/// One day of the calendar month.
struct CycleDay: Decodable, Equatable, Identifiable {
    let date: String
    let flow: Int
    let symptoms: [String]
    var forecast: Bool? = nil
    var ovulation: Bool? = nil
    /// "taken", "planned" or "pause" with the pill.
    var pill: String? = nil

    var id: String { date }
}

/// Today's cycle on the Today screen (src/app-today.js `cycle`).
struct TodayCycle: Decodable, Equatable {
    let ask: Bool
    let hormonal: Bool
    var cycleDay: Int? = nil
    var phase: String? = nil
    let flow: Int
    let symptoms: [String]
    var pill: PillDay? = nil
    let eased: Bool
    var keptPlan: Bool? = nil
    var note: String? = nil
}

enum CycleText {
    /// The symptoms in the order of the sheet: id, Czech label, SF Symbol.
    static let symptoms: [(id: String, title: String, symbol: String)] = [
        ("cramps", "Křeče", "waveform.path"),
        ("fatigue", "Únava", "bed.double"),
        ("headache", "Hlava", "brain.head.profile"),
        ("bloating", "Nadýmání", "circle.dotted"),
        ("mood", "Nálada", "face.dashed"),
        ("appetite", "Chuť k jídlu", "fork.knife")
    ]

    static func symptom(_ id: String) -> String {
        L10n.tr(symptoms.first { $0.id == id }?.title ?? id).lowercased()
    }

    static func phase(_ phase: String?) -> String? {
        switch phase {
        case "menstrual": return L10n.tr("Menstruace")
        case "follicular": return L10n.tr("Folikulární fáze")
        case "ovulation": return L10n.tr("Ovulace")
        case "luteal": return L10n.tr("Luteální fáze")
        default: return nil
        }
    }

    static let flows = ["Slabé", "Střední", "Silné"]
}

// The cycle routes.
extension APIClient {
    func cycle(month: String? = nil) async throws -> CycleResponse {
        try await get("/app/api/cycle" + (month.map { "?month=" + $0 } ?? ""))
    }

    func saveCycleSettings(_ changes: JSONObject) async throws -> CycleResponse {
        let response: CycleWrite = try await send("/app/api/cycle/settings", method: "POST", body: changes)
        return response.view
    }

    /// What was logged on a day: flow (0–3), symptoms, pill ("HH:MM" or
    /// null), noPeriod, keepPlan. Keys left out stay as they were.
    func saveCycleDay(_ day: JSONObject) async throws -> CycleResponse {
        let response: CycleWrite = try await send("/app/api/cycle/day", method: "POST", body: day)
        return response.view
    }

    func importAppleCycle(_ days: [JSONValue]) async throws {
        let _: JSONValue = try await send("/app/api/cycle/apple", method: "POST", body: ["days": JSONValue.array(days)])
    }
}

/// A write's answer: the view again (available is implied).
private struct CycleWrite: Decodable {
    let settings: CycleSettings?
    let state: CycleState?
    let askPeriod: Bool?
    let month: String?
    let days: [CycleDay]?

    var view: CycleResponse { CycleResponse(available: true, settings: settings, state: state, askPeriod: askPeriod, month: month, days: days) }
}
