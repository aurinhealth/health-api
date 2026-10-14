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

    /// The day's title on Dnes, Zdraví and Jídlo: "Dnes", "Včera", "Zítra" or
    /// the weekday ("Pondělí").
    static func dayTitle(_ isoDate: String, today: String) -> String {
        if let word = dayWord(isoDate, today: today) { return L10n.tr(word) }
        guard let date = isoDay(isoDate) else { return isoDate }
        let text = formatted(date, "EEEE")
        return text.prefix(1).uppercased(with: locale) + text.dropFirst()
    }

    /// Under the title: "středa 14. října" when the title is a word, else
    /// "12. října".
    static func daySubtitle(_ isoDate: String, today: String) -> String {
        guard let date = isoDay(isoDate) else { return "" }
        if dayWord(isoDate, today: today) != nil {
            return formatted(date, L10n.isEnglish ? "EEEE, MMMM d" : "EEEE d. MMMM")
        }
        return formatted(date, L10n.isEnglish ? "MMMM d" : "d. MMMM")
    }

    /// The day in the pinned bar: "Dnes · st 14. 10." or "Po 12. 10.".
    static func dayShort(_ isoDate: String, today: String) -> String {
        guard let date = isoDay(isoDate) else { return isoDate }
        let short = formatted(date, L10n.isEnglish ? "EEE, MMM d" : "EEE d. M.")
        if let word = dayWord(isoDate, today: today) { return L10n.tr(word) + " · " + short }
        return short.prefix(1).uppercased(with: locale) + short.dropFirst()
    }

    private static func dayWord(_ isoDate: String, today: String) -> String? {
        if isoDate == today { return "Dnes" }
        if AppModel.shift(today, by: -1) == isoDate { return "Včera" }
        if AppModel.shift(today, by: 1) == isoDate { return "Zítra" }
        return nil
    }

    private static func isoDay(_ isoDate: String) -> Date? {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: isoDate)
    }

    private static func formatted(_ date: Date, _ format: String) -> String {
        let out = DateFormatter()
        out.locale = locale
        out.dateFormat = format
        return out.string(from: date)
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

    /// The weekday after "na": "pondělí", "středu" ("Monday" in English).
    static func weekdayName(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return isoDate }
        let names = L10n.isEnglish
            ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            : ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"]
        return names[utcCalendar.component(.weekday, from: date) - 1]
    }

    /// "v pondělí", "ve středu" ("on Monday"), whichever week it is.
    static func onWeekday(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return isoDate }
        let names = L10n.isEnglish
            ? ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"]
            : ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"]
        return names[utcCalendar.component(.weekday, from: date) - 1]
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
