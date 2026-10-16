import SwiftUI

/// Trénink → Svaly (GET /app/api/muscles, src/muscle-fatigue.js): how tired
/// each muscle of the exercise catalogue is and when it is rested, the most
/// tired first, and what tired them in the last 3 days. Rides and runs count
/// as an estimate (estimated).
struct MuscleFatigue: Decodable {
    let date: String
    let muscles: [Muscle]?
    let recent: [Source]?
    /// Nohy, Hýždě, Záda, Hrudník, Ramena, Paže (the rings) and Střed těla.
    var groups: [Group]? = nil
    /// "full", "upper", "lower" or "none": what today is good for.
    var readyToday: String? = nil
    var lastGym: LastGym? = nil
    /// The ready body part trained longest ago.
    var recommend: Recommend? = nil

    /// A body part, as rested as its most tired muscle.
    struct Group: Decodable, Identifiable, Hashable {
        let id: String
        let label: String
        let ring: Bool?
        let state: String
        /// 5–100: how rested.
        let percent: Int
        let readyDate: String?
        let estimated: Bool?
        /// Days trained this week and the target (twice).
        let thisWeek: Int?
        let target: Int?
        let lastDate: String?
        let daysSince: Int?
    }

    struct LastGym: Decodable, Hashable {
        /// "nohy", "horní část těla".
        let part: String
        let day: String
    }

    struct Recommend: Decodable, Hashable {
        let group: String
        let label: String
        let daysSince: Int?
    }

    struct Muscle: Decodable, Identifiable, Hashable {
        let id: String
        let label: String
        /// "rested", "recovering" (under a day left) or "fatigued".
        let state: String
        /// 0–1: the bar, full at a whole session's worth of fatigue.
        let level: Double?
        let hours: Int?
        /// The user's day the muscle is rested on.
        let readyDate: String?
        let estimated: Bool?
        /// What tired it, the biggest part first (at most three).
        let from: [Cause]?
    }

    /// One gym exercise (with its sets) or a ride, run or walk.
    struct Cause: Decodable, Hashable {
        let title: String
        let sets: Int?
        let day: String
        /// Half or more of the muscle's fatigue.
        let main: Bool
        let estimated: Bool?
    }

    struct Source: Decodable, Hashable {
        let kind: String
        let date: String
        /// "Běh 14 km", "Posilovna, nohy".
        let title: String
        /// "včera", "pondělí".
        let day: String
        let estimated: Bool?
    }

    /// The screen's and the widget's name.
    static var title: String { L10n.tr("Únava svalů") }

    /// The muscles that are not rested yet, the most tired first.
    var tired: [Muscle] { (muscles ?? []).filter { $0.state != "rested" } }

    /// The six body parts of the rings.
    var rings: [Group] { (groups ?? []).filter { $0.ring != false } }

    /// "Horní část těla" and the like: what is ready today, nil when nothing whole is.
    var readyTitle: String? {
        switch readyToday {
        case "full": return L10n.tr("Celé tělo")
        case "upper": return L10n.tr("Horní část těla")
        case "lower": return L10n.tr("Nohy")
        default: return nil
        }
    }

    /// The builder's focus for today ("auto", "upper", "lower"), nil when nothing is ready.
    var focus: String? {
        switch readyToday {
        case "full": return "auto"
        case "upper": return "upper"
        case "lower": return "lower"
        default: return nil
        }
    }

    /// "Poslední trénink: nohy, včera".
    var lastGymText: String? {
        lastGym.map { L10n.f("Poslední trénink: %@, %@", L10n.tr($0.part), L10n.tr($0.day)) }
    }

    func muscle(_ id: String) -> Muscle? { muscles?.first { $0.id == id } }

    /// A muscle of the figure in the gym's chips and catalogue (BodyFigure:
    /// upper_back, lats, abs…), as the muscles here count it.
    static func fatigueIds(body id: String) -> [String] {
        switch id {
        case "upper_back", "lats": return ["back"]
        case "front_delts": return ["shoulders"]
        case "abs", "obliques": return ["core"]
        case "hips": return ["glutes", "adductors", "abductors"]
        default: return [id]
        }
    }

    /// The other way: the chip of the exercise catalogue for a muscle here.
    static func bodyId(_ id: String) -> String {
        switch id {
        case "back": return "upper_back"
        case "shoulders": return "front_delts"
        case "core": return "abs"
        case "glutes", "adductors", "abductors": return "hips"
        default: return id
        }
    }

    /// The most tired muscle behind a muscle of the figure, when it is not rested.
    func tired(body id: String) -> Muscle? {
        Self.fatigueIds(body: id).compactMap { muscle($0) }.filter { $0.state != "rested" }
            .max { ($0.hours ?? 0) < ($1.hours ?? 0) }
    }

    /// The figure's colours by muscle id.
    var figureColors: [String: Color] {
        var colors: [String: Color] = [:]
        for muscle in muscles ?? [] { if let color = muscle.figureColor { colors[muscle.id] = color } }
        return colors
    }
}

extension MuscleFatigue.Muscle {
    var color: Color {
        switch state {
        case "fatigued": return Palette.rust
        case "recovering": return Palette.amberBar
        default: return Palette.green
        }
    }

    /// The colour on the figure: none for a rested muscle (it stays grey).
    var figureColor: Color? { state == "rested" ? nil : color }

    /// The colour of the text on the right (amber reads better than the bar's colour).
    var textColor: Color {
        switch state {
        case "fatigued": return Palette.rust
        case "recovering": return Palette.amber
        default: return Palette.green
        }
    }

    /// "odpočaté", or "odpočaté na 40 % · pozítří" (the muscle's detail and the 3D figure's bubble).
    func stateText(today: String) -> String {
        guard state != "rested" else { return L10n.tr("odpočaté") }
        let percent = max(5, Int(((1 - (level ?? 0)) * 100).rounded()))
        return L10n.f("odpočaté na %@ %%", String(percent)) + " · " + readyText(today: today)
    }

    /// Coarse on purpose: "odpočaté", "dnes", "zítra", "pozítří", "za 3 dny";
    /// "≈" when it comes mostly from rides and runs, which are estimated.
    func readyText(today: String) -> String {
        guard state != "rested", let ready = readyDate else { return L10n.tr("odpočaté") }
        let days = MuscleFatigue.days(from: today, to: ready)
        let text: String
        switch days {
        case ...0: text = L10n.tr("dnes")
        case 1: text = L10n.tr("zítra")
        case 2: text = L10n.tr("pozítří")
        case 3, 4: text = L10n.f("za %@ dny", String(days))
        default: text = L10n.f("za %@ dní", String(days))
        }
        return estimated == true ? "≈ " + text : text
    }
}

extension MuscleFatigue.Group {
    var color: Color {
        switch state {
        case "fatigued": return Palette.rust
        case "recovering": return Palette.amberBar
        default: return Palette.green
        }
    }

    var textColor: Color {
        switch state {
        case "fatigued": return Palette.rust
        case "recovering": return Palette.amber
        default: return Palette.green
        }
    }

    /// Under a ring: when it is ready, nothing for a rested part.
    func readyText(today: String) -> String? {
        guard state != "rested", let ready = readyDate else { return nil }
        let days = MuscleFatigue.days(from: today, to: ready)
        switch days {
        case ...0: return L10n.tr("dnes")
        case 1: return L10n.tr("zítra")
        case 2: return L10n.tr("pozítří")
        case 3, 4: return L10n.f("za %@ dny", String(days))
        default: return L10n.f("za %@ dní", String(days))
        }
    }
}

/// Svaly → one muscle (GET /app/api/muscles/detail, src/muscle-detail.js):
/// whether it is getting stronger, how often it is trained, the last exercises.
struct MuscleDetailData: Decodable {
    let date: String
    let id: String
    let label: String
    let strength: Strength?
    let calendar: Calendar?
    let recent: [Recent]?
    let best: Best?

    struct Strength: Decodable {
        let exercise: String
        let points: [Point]
        /// The last week against the first, 0.08 = +8 %.
        let change: Double?
    }

    struct Point: Decodable, Identifiable {
        let week: String
        let kg: Double
        var id: String { week }
    }

    struct Calendar: Decodable {
        /// The Monday of the first of the 4 weeks.
        let from: String
        let days: [String]
        let target: Int
        let perWeek: Double
        let thisWeek: Int
    }

    struct Recent: Decodable, Identifiable {
        let exercise: String
        let date: String
        let day: String
        let sets: Int
        let kg: Double?
        let reps: Double?
        var id: String { date + exercise }
    }

    struct Best: Decodable {
        let exercise: String
        let kg: Double
        let reps: Double
        let e1rm: Double
        let day: String?
    }
}

extension MuscleFatigue {
    /// Whole days between two "yyyy-MM-dd" dates.
    static func days(from a: String, to b: String) -> Int {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        guard let start = parser.date(from: a), let end = parser.date(from: b) else { return 0 }
        return Int((end.timeIntervalSince(start) / 86400).rounded())
    }
}
