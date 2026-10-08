import Foundation

/// Czech number and time formatting: decimal comma, space between thousands.
enum Fmt {
    static let locale = Locale(identifier: "cs_CZ")

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
        out.dateFormat = "EEEE d. MMMM"
        return out.string(from: date).uppercased(with: locale)
    }

    /// One-letter Czech weekday for a chart label: "P", "Ú", "S", "Č", "P", "S", "N".
    static func weekdayInitial(_ isoDate: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDate) else { return "" }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: date)
        return ["N", "P", "Ú", "S", "Č", "P", "S"][weekday - 1]
    }
}
