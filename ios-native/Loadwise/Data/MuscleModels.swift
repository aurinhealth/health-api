import SwiftUI

/// Trénink → Svaly (GET /app/api/muscles, src/muscle-fatigue.js): how tired
/// each muscle of the exercise catalogue is and when it is rested, the most
/// tired first, and what tired them in the last 3 days. Rides and runs count
/// as an estimate (estimated).
struct MuscleFatigue: Decodable {
    let date: String
    let muscles: [Muscle]?
    let recent: [Source]?

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

    /// The screen's name. Not L10n.tr("Svaly"): that key is the training goal
    /// "Muscle" (Síla, Svaly, Kondice).
    static var title: String { L10n.isEnglish ? "Muscles" : "Svaly" }

    /// The muscles that are not rested yet, the most tired first.
    var tired: [Muscle] { (muscles ?? []).filter { $0.state != "rested" } }

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
