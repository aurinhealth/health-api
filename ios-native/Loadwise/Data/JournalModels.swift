import Foundation

// Deník, the habit journal (src/routes-journal.js). Every name and value text
// comes from the server in the app's language (X-Interface-Language).

/// A follow-up a ✓ opens inline: Sauna → minutes (stepper) and temperature (chips).
struct JournalFollow: Decodable, Equatable, Hashable {
    let key: String
    let label: String
    /// "stepper" or "chips".
    let kind: String
    var unit: String? = nil
    var options: [Double]? = nil
    var low: Double? = nil
    var high: Double? = nil
    var step: Double? = nil
    var initial: Double? = nil
}

/// One item of the journal: what it is and, on a day, its answer.
struct JournalItem: Decodable, Equatable, Identifiable {
    let key: String
    let name: String
    let category: String
    /// "yesno", "amount", "time" or "scale".
    let type: String
    let icon: String
    var when: String? = nil
    var custom: Bool? = nil
    /// Filled in from the day's data (drinks, food, activities).
    var auto: Bool? = nil
    var unit: String? = nil
    /// The unit's forms after 1, 2–4 and 5+ (Czech), or 1 and more (English).
    var units: [String]? = nil
    var step: Double? = nil
    var usual: Double? = nil
    var limit: Double? = nil
    var withTime: Bool? = nil
    var late: String? = nil
    var follow: [JournalFollow]? = nil
    // On a day:
    var answered: Bool? = nil
    /// 1 ✓, 0 ✕, nil unanswered.
    var answer: Int? = nil
    var amount: Double? = nil
    /// "HH:MM"
    var time: String? = nil
    var extra: [String: Double]? = nil
    /// "2 · do 21:40", "300 mg", "21:15".
    var value: String? = nil
    /// The row's value without the time, which has its own column: "2 nápoje", "vždy ne".
    var short: String? = nil
    /// "morning", "day", "evening" or "night".
    var part: String? = nil
    /// "Vždy ne" (0) / "Vždy ano" (1).
    var fixed: Int? = nil
    var fromData: Bool? = nil
    // In the catalogue:
    var pinned: Bool? = nil

    var id: String { key }
    var isAnswered: Bool { answered == true }
    var isYesNo: Bool { type == "yesno" }

    /// "1 nápoj", "3 nápoje", "300 mg".
    func unitText(for amount: Double) -> String {
        guard let units, units.count == 3 else { return unit ?? "" }
        let n = Int(amount.rounded())
        if Double(n) != amount { return units[2] }
        if L10n.isEnglish { return n == 1 ? units[0] : units[1] }
        return n == 1 ? units[0] : (2...4).contains(n) ? units[1] : units[2]
    }
}

struct JournalWeekDay: Decodable, Equatable, Identifiable {
    let date: String
    /// "done", "partial", "empty" or "future".
    let state: String
    var id: String { date }
}

struct JournalSection: Decodable, Equatable, Identifiable {
    let key: String
    let title: String
    var items: [JournalItem]
    var id: String { key }
}

/// GET /app/api/journal?date=: one day.
struct JournalDay: Decodable, Equatable {
    let date: String
    let today: String
    let week: [JournalWeekDay]
    var mood: Double? = nil
    let answered: Int
    let total: Int
    /// By part of the day: Ráno, Přes den, Večer, Noc.
    var sections: [JournalSection]
    var enabled: Bool? = nil
}

struct JournalCategory: Decodable, Equatable, Identifiable {
    let key: String
    let title: String
    var id: String { key }
}

/// GET /app/api/journal/catalog: Upravit deník.
struct JournalCatalog: Decodable, Equatable {
    let count: Int
    let categories: [JournalCategory]
    let items: [JournalItem]
    let pinned: [String]
    var enabled: Bool? = nil
    var askMorning: Bool? = nil
}

/// The Today card: the questions about yesterday in the morning.
struct JournalCard: Decodable, Equatable {
    struct Row: Decodable, Equatable, Identifiable {
        let key: String
        let name: String
        let icon: String
        var category: String? = nil
        let value: String
        var id: String { key }
    }
    let date: String
    let isToday: Bool
    var mood: Double? = nil
    /// Only the evening card asks the mood; the morning check-in asks it on Today.
    var askMood: Bool? = nil
    let answered: Int
    let total: Int
    let open: Int
    let rows: [Row]
    /// Ranní otázky on: the sheet opens by itself on the first open of the day.
    var ask: Bool? = nil
}

/// One of the biggest effects on readiness, for the Zdraví card.
struct JournalEffect: Decodable, Equatable, Identifiable {
    let key: String
    let name: String
    let icon: String
    let effect: Int
    var id: String { key }
}

/// "Nový objev": an item that first crossed the evidence line.
struct JournalDiscovery: Decodable, Equatable {
    let key: String
    let name: String
    let icon: String
    let metric: String
    let effect: Int
    let text: String
}

struct JournalToday: Decodable, Equatable {
    var enabled: Bool? = nil
    var askMorning: Bool? = nil
    var card: JournalCard? = nil
    var top: [JournalEffect]? = nil
    var discovery: JournalDiscovery? = nil
}

/// Whether Deník is on, kept on the phone so Zdraví knows before loading.
enum JournalSwitch {
    static let key = "journal.enabled"
    static var isOn: Bool { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
    static func remember(_ on: Bool?) { if let on { UserDefaults.standard.set(on, forKey: key) } }
}

/// GET /app/api/journal/impact?metric=: Co na tebe působí.
struct JournalImpact: Decodable, Equatable {
    struct Ranked: Decodable, Equatable, Identifiable {
        let key: String
        let name: String
        let icon: String
        let effect: Int
        let yes: Int
        let no: Int
        var id: String { key }
    }
    struct Waiting: Decodable, Equatable, Identifiable {
        let key: String
        let name: String
        let icon: String
        let yes: Int
        let no: Int
        let text: String
        var id: String { key }
    }
    let metric: String
    let items: [Ranked]
    let waiting: [Waiting]
}

/// GET /app/api/journal/item?key=&metric=: one item in detail.
struct JournalDetail: Decodable, Equatable {
    struct Compare: Decodable, Equatable, Identifiable {
        let metric: String
        let title: String
        var yes: Double? = nil
        var no: Double? = nil
        var id: String { metric }
    }
    struct Point: Decodable, Equatable, Identifiable {
        let date: String
        let value: Double
        var yes: Bool? = nil
        var id: String { date }
    }
    let key: String
    let name: String
    let icon: String
    let type: String
    let metric: String
    let metricTitle: String
    var effect: Int? = nil
    let yes: Int
    let no: Int
    let compare: [Compare]
    let chart: [Point]
    var threshold: String? = nil
}

enum JournalText {
    /// The metrics of "Co na tebe působí", short as on the segmented control.
    static let metrics: [(key: String, title: String)] = [
        ("readiness", "Připravenost"), ("hrv", "HRV"), ("sleep", "Spánek"), ("rhr", "Tep")
    ]

    /// "+11 %", "−17 %".
    static func percent(_ effect: Int) -> String {
        (effect < 0 ? "−" : "+") + String(abs(effect)) + " %"
    }

    /// A metric's value: "61", "49 ms", "58", "6 h 41", "52 min".
    static func value(_ metric: String, _ value: Double?) -> String {
        guard let value else { return "–" }
        switch metric {
        case "hrv": return "\(Int(value.rounded())) ms"
        case "sleep":
            let m = Int(value.rounded())
            return "\(m / 60) h " + String(format: "%02d", m % 60)
        case "deep": return "\(Int(value.rounded())) min"
        default: return "\(Int(value.rounded()))"
        }
    }

    /// Better after ✓ days (green) or worse (rust); lower resting HR is better.
    static func better(_ metric: String, yes: Double, no: Double) -> Bool {
        metric == "rhr" ? yes < no : yes > no
    }

    /// A number as typed: "5", "0,5".
    static func amount(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : Fmt.decimal(value, digits: 1)
    }
}

// The journal routes.
extension APIClient {
    func journalDay(date: String?) async throws -> JournalDay {
        try await get("/app/api/journal" + (date.map { "?date=" + $0 } ?? ""))
    }

    /// One answer: date, key, answer (1, 0, or null to clear), amount, time, extra.
    func saveJournalEntry(_ body: JSONObject) async throws -> JournalDay {
        try await send("/app/api/journal/entry", method: "POST", body: body)
    }

    func journalCatalog() async throws -> JournalCatalog {
        try await get("/app/api/journal/catalog")
    }

    func setJournalPinned(_ keys: [String]) async throws {
        let _: JSONValue = try await send("/app/api/journal/pinned", method: "POST", body: ["pinned": JSONValue.array(keys.map { .string($0) })])
    }

    /// A new own item (name, type, unit, usual, when, category); its key.
    func addJournalItem(_ body: JSONObject) async throws -> String? {
        struct Response: Decodable { let item: JournalItem? }
        let response: Response = try await send("/app/api/journal/custom", method: "POST", body: body)
        return response.item?.key
    }

    /// Nastavení → Deník: {enabled, askMorning}.
    func setJournalOptions(_ body: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/journal/options", method: "POST", body: body)
    }

    /// "Vždy ne" (0) / "Vždy ano" (1) from the day on, nil ends it; the day comes back.
    func setJournalFixed(key: String, answer: Int?, date: String) async throws -> JournalDay {
        try await send("/app/api/journal/fixed", method: "POST", body: [
            "key": .string(key), "date": .string(date), "answer": answer.map { JSONValue.number(Double($0)) } ?? JSONValue.null
        ])
    }

    func journalToday() async throws -> JournalToday {
        try await get("/app/api/journal/today")
    }

    /// {date}: the card put away for the day; {discovery: true}: the finding seen.
    func dismissJournal(_ body: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/journal/dismiss", method: "POST", body: body)
    }

    func journalImpact(metric: String) async throws -> JournalImpact {
        try await get("/app/api/journal/impact?metric=" + metric)
    }

    func journalItem(key: String, metric: String) async throws -> JournalDetail {
        let escaped = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
        return try await get("/app/api/journal/item?key=" + escaped + "&metric=" + metric)
    }
}

/// "Prohlédnout ukázku": the journal with sample answers.
enum DemoJournal {
    private static func decode<T: Decodable>(_ json: String) -> T? {
        try? JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    static var yesterday: String { AppModel.shift(AppModel.localDate(Date()), by: -1) ?? AppModel.localDate(Date()) }

    /// The sample JSON is written in Czech with %slot% placeholders; English swaps
    /// the Czech texts. Plain literals keep the release build fast: dozens of
    /// interpolations in one string literal stalled the optimizer.
    private static func fill(_ json: String, _ slots: [String: String]) -> String {
        var out = json
        for (name, value) in slots { out = out.replacingOccurrences(of: "%" + name + "%", with: value) }
        guard L10n.isEnglish else { return out }
        for (cs, en) in english { out = out.replacingOccurrences(of: cs, with: en) }
        return out
    }

    private static let english: [(String, String)] = [
        ("\"Alkohol\"", "\"Alcohol\""),
        ("\"Kofein\"", "\"Caffeine\""),
        ("\"Pozdní jídlo\"", "\"Late meal\""),
        ("\"Večerní trénink\"", "\"Evening training\""),
        ("\"Večer a noc\"", "\"Evening and night\""),
        ("\"Přes den\"", "\"Daytime\""),
        ("\"Večer\"", "\"Evening\""),
        ("\"Noc\"", "\"Night\""),
        ("\"Mobil v posteli\"", "\"Phone in bed\""),
        ("\"Pozdě spát\"", "\"Late to bed\""),
        ("\"Spánek mimo domov\"", "\"Slept away from home\""),
        ("\"Jídlo a pití\"", "\"Food and drink\""),
        ("\"Regenerace\"", "\"Recovery\""),
        ("\"Kolik minut\"", "\"Minutes\""),
        ("\"Teplota\"", "\"Temperature\""),
        ("\"Otužování\"", "\"Cold exposure\""),
        ("\"Venku 30+ min\"", "\"Outdoors 30+ min\""),
        ("\"Doplňky\"", "\"Supplements\""),
        ("\"Hořčík\"", "\"Magnesium\""),
        ("\"Vliv ukážu po 2 dalších dnech s ✓\"", "\"I'll show the effect after 2 more days with ✓\""),
        ("\"Připravenost\"", "\"Readiness\""),
        ("\"Klidový tep\"", "\"Resting HR\""),
        ("\"Spánek\"", "\"Sleep\""),
        ("\"Hluboký spánek\"", "\"Deep sleep\""),
        ("\"Od 2 nápojů výš je to −22 %\"", "\"From 2 drinks up it is −22 %\""),
        (" · do ", " · last ")
    ]

    static var today: JournalToday {
        let json = """
        {"enabled":true,"askMorning":true,"card":{"date":"%yesterday%","isToday":false,"answered":4,"total":9,"open":5,"rows":[],"ask":false},
        "top":[{"key":"alcohol","name":"Alkohol","icon":"wineglass.fill","effect":-17},{"key":"sauna","name":"Sauna","icon":"flame","effect":11},
        {"key":"late_meal","name":"Pozdní jídlo","icon":"fork.knife","effect":-9}]}
        """
        return decode(fill(json, ["yesterday": yesterday])) ?? JournalToday()
    }

    static var day: JournalDay? {
        let cs = !L10n.isEnglish
        let today = AppModel.localDate(Date())
        let monday: String = {
            var calendar = Calendar(identifier: .gregorian)
            calendar.firstWeekday = 2
            let weekday = calendar.component(.weekday, from: Date())
            return AppModel.shift(today, by: -((weekday + 5) % 7)) ?? today
        }()
        var days: [String] = []
        for i in 0..<7 {
            let d = AppModel.shift(monday, by: i) ?? today
            let state = d > today ? "future" : d == yesterday ? "partial" : d < yesterday ? "done" : "empty"
            days.append("{\"date\":\"\(d)\",\"state\":\"\(state)\"}")
        }
        let week = days.joined(separator: ",")
        let drinks = cs ? #"["nápoj","nápoje","nápojů"]"# : #"["drink","drinks","drinks"]"#
        let json = """
        {"date":"%yesterday%","today":"%today%","week":[%week%],"answered":6,"total":9,"enabled":true,"sections":[
        {"key":"day","title":"Přes den","items":[
        {"key":"caffeine","name":"Kofein","category":"food","type":"amount","icon":"cup.and.saucer.fill","auto":true,"unit":"mg","units":["mg","mg","mg"],"step":20,"usual":100,"limit":1000,"withTime":true,"answered":true,"answer":1,"amount":180,"time":"15:10","value":"180 mg · do 15:10","short":"180 mg","part":"day","fromData":true},
        {"key":"outdoors","name":"Venku 30+ min","category":"recovery","type":"yesno","icon":"sun.max.fill","auto":true,"answered":true,"answer":1,"part":"day","fromData":true}]},
        {"key":"evening","title":"Večer","items":[
        {"key":"alcohol","name":"Alkohol","category":"food","type":"amount","icon":"wineglass.fill","auto":true,"units":%drinks%,"step":1,"usual":1,"limit":15,"withTime":true,"answered":true,"answer":1,"amount":2,"time":"21:40","value":"2 · do 21:40","short":"%twodrinks%","part":"evening","fromData":true},
        {"key":"sauna","name":"Sauna","category":"recovery","type":"yesno","icon":"flame","part":"evening","answered":true,"answer":1,"extra":{"minutes":15,"temp":90},
        "follow":[{"key":"minutes","label":"Kolik minut","kind":"stepper","unit":"min","low":5,"high":90,"step":5,"initial":15},{"key":"temp","label":"Teplota","kind":"chips","unit":"°C","options":[70,80,90],"initial":80}]},
        {"key":"magnesium","name":"Hořčík","category":"supplements","type":"amount","icon":"capsule.portrait","unit":"mg","units":["mg","mg","mg"],"step":50,"usual":300,"limit":1000,"part":"evening","answered":false}]},
        {"key":"night","title":"Noc","items":[
        {"key":"phone_in_bed","name":"Mobil v posteli","category":"sleep","type":"yesno","icon":"iphone","part":"night","answered":true,"answer":1},
        {"key":"late_bed","name":"Pozdě spát","category":"sleep","type":"yesno","icon":"moon.fill","auto":true,"part":"night","answered":true,"answer":0,"fromData":true},
        {"key":"sleep_away","name":"Spánek mimo domov","category":"sleep","type":"yesno","icon":"bed.double","part":"night","answered":false}]}]}
        """
        return decode(fill(json, ["yesterday": yesterday, "today": today, "week": week, "drinks": drinks, "twodrinks": cs ? "2 nápoje" : "2 drinks"]))
    }

    /// Upravit deník in the sample: the sample's own items, all of them picked.
    static var catalog: JournalCatalog? {
        guard let day else { return nil }
        var items: [JournalItem] = []
        for section in day.sections {
            for item in section.items { items.append(item) }
        }
        let titles: [(key: String, title: String)] = [
            ("sleep", "Spánek"), ("food", "Jídlo a pití"), ("recovery", "Regenerace"),
            ("health", "Zdraví"), ("meds", "Léky"), ("supplements", "Doplňky")
        ]
        var categories: [JournalCategory] = []
        for t in titles { categories.append(JournalCategory(key: t.key, title: L10n.tr(t.title))) }
        var keys: [String] = []
        for item in items { keys.append(item.key) }
        return JournalCatalog(count: items.count, categories: categories, items: items, pinned: keys)
    }

    static func impact(metric: String) -> JournalImpact? {
        let scale = metric == "hrv" ? 1.3 : metric == "sleep" ? 0.6 : 1
        func e(_ v: Int) -> Int { Int((Double(v) * scale).rounded()) }
        let json = """
        {"metric":"%metric%","items":[
        {"key":"sauna","name":"Sauna","icon":"flame","effect":%e11%,"yes":9,"no":52},
        {"key":"magnesium","name":"Hořčík","icon":"capsule.portrait","effect":%e6%,"yes":40,"no":21},
        {"key":"outdoors","name":"Venku 30+ min","icon":"sun.max.fill","effect":%e4%,"yes":34,"no":27},
        {"key":"phone_in_bed","name":"Mobil v posteli","icon":"iphone","effect":%em5%,"yes":21,"no":40},
        {"key":"late_meal","name":"Pozdní jídlo","icon":"fork.knife","effect":%em9%,"yes":12,"no":49},
        {"key":"alcohol","name":"Alkohol","icon":"wineglass.fill","effect":%em17%,"yes":9,"no":52}],
        "waiting":[
        {"key":"cold_exposure","name":"Otužování","icon":"drop.fill","yes":3,"no":58,"text":"Vliv ukážu po 2 dalších dnech s ✓"}]}
        """
        return decode(fill(json, ["metric": metric, "e11": String(e(11)), "e6": String(e(6)), "e4": String(e(4)), "em5": String(e(-5)), "em9": String(e(-9)), "em17": String(e(-17))]))
    }

    static func detail(key: String, metric: String) -> JournalDetail? {
        let today = AppModel.localDate(Date())
        let values: [Double] = [58, 61, 55, 47, 60, 63, 59, 49, 57, 62, 64, 58, 46, 55, 60, 61, 63, 50, 59, 62, 58, 60, 48, 57, 61, 64, 59, 51, 58, 60]
        let marked: Set<Int> = [3, 7, 12, 17, 22, 27]
        var list: [String] = []
        for (i, v) in values.enumerated() {
            let date = AppModel.shift(today, by: i - 29) ?? today
            list.append("{\"date\":\"\(date)\",\"value\":\(v),\"yes\":\(marked.contains(i))}")
        }
        let points = list.joined(separator: ",")
        let json = """
        {"key":"alcohol","name":"Alkohol","icon":"wineglass.fill","type":"amount","metric":"hrv","metricTitle":"HRV","effect":-18,"yes":9,"no":52,
        "compare":[{"metric":"readiness","title":"Připravenost","yes":61,"no":74},{"metric":"hrv","title":"HRV","yes":49,"no":60},
        {"metric":"rhr","title":"Klidový tep","yes":58,"no":53},{"metric":"sleep","title":"Spánek","yes":401,"no":442},
        {"metric":"deep","title":"Hluboký spánek","yes":52,"no":71}],
        "chart":[%points%],"threshold":"Od 2 nápojů výš je to −22 %"}
        """
        return decode(fill(json, ["points": points]))
    }
}
