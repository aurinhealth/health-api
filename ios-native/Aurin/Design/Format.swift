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

    /// After a percentage: "19 %" in Czech, "19%" in English.
    static var percentSign: String { L10n.isEnglish ? "%" : " %" }

    /// A range as typed ("8-10") with an en dash: "8–10".
    static func range(_ text: String) -> String {
        text.replacingOccurrences(of: #"(\d)\s*-\s*(\d)"#, with: "$1–$2", options: .regularExpression)
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
        guard let date = DateFormatters.iso().date(from: isoDate) else { return isoDate }
        return DateFormatters.make(L10n.isEnglish ? "EEEE, MMMM d" : "EEEE d. MMMM", locale: locale, template: L10n.isEnglish).string(from: date).uppercased(with: locale)
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
        DateFormatters.iso().date(from: isoDate)
    }

    /// English formats are templates: the region orders them ("October 8", "8 October").
    private static func formatted(_ date: Date, _ format: String) -> String {
        DateFormatters.make(format, locale: locale, template: L10n.isEnglish).string(from: date)
    }

    /// "1. listopadu" for 2026-11-01.
    static func dayMonth(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return isoDate }
        return DateFormatters.make(L10n.isEnglish ? "MMMM d" : "d. MMMM", locale: locale, timeZone: utc, template: L10n.isEnglish).string(from: date)
    }

    /// "8. 10.", "Oct 8": the ends of a small chart's time.
    static func dayMonthShort(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return isoDate }
        return DateFormatters.make(L10n.isEnglish ? "MMM d" : "d. M.", locale: locale, timeZone: utc, template: L10n.isEnglish).string(from: date)
    }

    /// "Říjen", "October": the month of Today's week strip.
    static func monthTitle(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return "" }
        let text = DateFormatters.make("LLLL", locale: locale, timeZone: utc).string(from: date)
        return text.prefix(1).uppercased(with: locale) + text.dropFirst()
    }

    /// "14": the day of the month.
    static func dayNumber(_ isoDate: String) -> String {
        guard let day = Int(isoDate.suffix(2)) else { return "" }
        return String(day)
    }

    static func weekdayShort(_ isoDate: String) -> String {
        guard let date = parse(isoDate) else { return "" }
        let names = weekdays
        let i = utcCalendar.component(.weekday, from: date) - 1
        return names.indices.contains(i) ? names[i] : ""
    }

    /// The two-letter weekdays of the app's language from the locale, Sunday
    /// first as Calendar counts them: "Su", "Mo" … or "Ne", "Po", "Út" ….
    static var weekdays: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        return calendar.shortStandaloneWeekdaySymbols.map { name in
            let two = String(name.prefix(2))
            return two.prefix(1).uppercased(with: locale) + two.dropFirst()
        }
    }

    /// The same, Monday first: the app's week rows.
    static var weekdaysFromMonday: [String] { Array(weekdays.dropFirst()) + weekdays.prefix(1) }

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

    private static let utc = TimeZone(identifier: "UTC")!
    private static var utcCalendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = utc
        return c
    }

    private static func parse(_ isoDate: String) -> Date? {
        DateFormatters.iso(timeZone: utc).date(from: isoDate)
    }
}

/// Date formatters made once for each format, locale and time zone: making one
/// costs far more than using it, and the screens format dates as they draw. A
/// change of language asks for another locale, so it gets new ones.
enum DateFormatters {
    private static let lock = NSLock()
    // Guarded by lock.
    nonisolated(unsafe) private static var made: [String: DateFormatter] = [:]

    /// `template`: the format is a template the locale orders and punctuates
    /// (setLocalizedDateFormatFromTemplate), not a fixed pattern.
    static func make(_ format: String, locale: Locale = Locale(identifier: "en_US_POSIX"), timeZone: TimeZone = .current, template: Bool = false) -> DateFormatter {
        let key = format + "|" + locale.identifier + "|" + timeZone.identifier + (template ? "|t" : "")
        lock.lock()
        defer { lock.unlock() }
        if let formatter = made[key] { return formatter }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        if template { formatter.setLocalizedDateFormatFromTemplate(format) } else { formatter.dateFormat = format }
        made[key] = formatter
        return formatter
    }

    /// "2026-10-08" in the given time zone (the phone's by default).
    static func iso(timeZone: TimeZone = .current) -> DateFormatter {
        make("yyyy-MM-dd", timeZone: timeZone)
    }
}
