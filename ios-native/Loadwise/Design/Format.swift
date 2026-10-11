import Foundation

/// Number and time formatting in the app's language: in Czech a decimal comma
/// and a space between thousands.
enum Fmt {
    static var locale: Locale { L10n.locale }

    static func int(_ value: Double?) -> String {
        guard let value else { return "–" }
        return Int(value.rounded()).formatted(.number.locale(locale))
    }

    static func decimal(_ value: Double?, digits: Int = 1) -> String {
        guard let value else { return "–" }
        return value.formatted(.number.precision(.fractionLength(digits)).locale(locale))
    }

    /// 432 → "7:12".
    static func hoursMinutes(_ minutes: Double?) -> String {
        guard let minutes else { return "–" }
        let m = Int(minutes.rounded())
        return "\(m / 60):" + String(format: "%02d", m % 60)
    }

    /// A signed change with a real minus sign: "+6", "−2".
    static func signed(_ value: Double, digits: Int = 0) -> String {
        let text = digits == 0 ? int(abs(value)) : decimal(abs(value), digits: digits)
        return (value < 0 ? "−" : "+") + text
    }

    /// "ČTVRTEK 8. ŘÍJNA" for 2026-10-08.
    static func dayHeading(_ isoDate: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDate) else { return isoDate }
        let out = DateFormatter()
        out.locale = locale
        out.dateFormat = L10n.isEnglish ? "EEEE, MMMM d" : "EEEE d. MMMM"
        return out.string(from: date).uppercased(with: locale)
    }

    /// One-letter Czech weekday for a chart label: "P", "Ú", "S", "Č", "P", "S", "N".
    static func weekdayInitial(_ isoDate: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDate) else { return "" }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: date)
        return (L10n.isEnglish ? ["S", "M", "T", "W", "T", "F", "S"] : ["N", "P", "Ú", "S", "Č", "P", "S"])[weekday - 1]
    }

    /// "1. listopadu" for 2026-11-01.
    static func dayMonth(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return isoDate }
        let out = DateFormatter()
        out.locale = locale
        out.timeZone = utc
        out.dateFormat = L10n.isEnglish ? "MMMM d" : "d. MMMM"
        return out.string(from: date)
    }

    /// Two-letter Czech weekday: "Po", "Út", "St", "Čt", "Pá", "So", "Ne".
    static func weekdayShort(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return "" }
        let names = L10n.isEnglish ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"]
        return names[utcCalendar.component(.weekday, from: date) - 1]
    }

    /// "dnes", "zítra", "v sobotu", "včera" or "6. 10." relative to today's date.
    static func relativeDay(_ isoDate: String, today: String) -> String {
        guard let a = parse(today), let b = parse(isoDate) else { return isoDate }
        let days = Int((b.timeIntervalSince(a) / 86400).rounded())
        if days == 0 { return L10n.tr("dnes") }
        if days == 1 { return L10n.tr("zítra") }
        if days == -1 { return L10n.tr("včera") }
        // Earlier days by date: "v pondělí" reads as the coming one.
        if days < 0 { return dayMonth(isoDate) }
        let weekday = utcCalendar.component(.weekday, from: b)
        let names = L10n.isEnglish
            ? ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"]
            : ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"]
        let name = names[weekday - 1]
        return days < 7 ? name : dayMonth(isoDate)
    }

    /// Minutes as "1 h 15 min" or "45 min".
    static func duration(_ minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60) h" + (minutes % 60 > 0 ? " \(minutes % 60) min" : "") : "\(minutes) min"
    }

    /// 860 → "14 h 20 min".
    static func hoursMinutesLong(_ minutes: Double) -> String {
        duration(Int(minutes.rounded()))
    }

    static func capitalized(_ text: String) -> String {
        text.prefix(1).uppercased() + String(text.dropFirst())
    }

    /// Czech plural: 1 den, 2 dny, 5 dní. In English "many" is the plural.
    static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        if L10n.isEnglish { return L10n.tr(n == 1 ? one : many) }
        return n == 1 ? one : (2...4).contains(n) ? few : many
    }

    private static let utc = TimeZone(identifier: "UTC")!
    private static var utcCalendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = utc
        return c
    }

    private static func parse(_ isoDate: String) -> Date? {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = utc
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: isoDate)
    }
}
