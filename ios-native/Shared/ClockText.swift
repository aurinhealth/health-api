import Foundation

/// Clock times in the phone's own format: the server sends "20:30", the phone
/// shows "20:30" or "8:30 PM" by its 12/24-hour setting.
enum ClockText {
    /// "20:30" (or "20:30:00") → the phone's short time; anything else as it came.
    static func format(_ clock: String) -> String {
        let parts = clock.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard parts.count == 2 || parts.count == 3,
              let hour = Int(parts[0]), let minute = Int(parts[1]),
              (0...23).contains(hour), (0...59).contains(minute) else { return clock }
        return format(minutes: hour * 60 + minute)
    }

    /// Minutes after midnight (450) → "7:30" or "7:30 AM".
    static func format(minutes: Int) -> String {
        let m = ((minutes % 1440) + 1440) % 1440
        // A fixed day in UTC, so no daylight-saving change can shift the clock.
        let date = Date(timeIntervalSinceReferenceDate: TimeInterval(m * 60))
        return formatter(timeZone: utc).string(from: date)
    }

    /// A moment's time of day on this phone: "13:29" or "1:29 PM".
    static func format(_ date: Date) -> String {
        formatter(timeZone: .autoupdatingCurrent).string(from: date)
    }

    /// A clock that may be missing: nil stays nil.
    static func format(optional clock: String?) -> String? {
        guard let clock else { return nil }
        return format(clock)
    }

    /// The phone shows "8:30 PM" rather than "20:30".
    static var isTwelveHour: Bool {
        (DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .autoupdatingCurrent) ?? "").contains("a")
    }

    private static let utc = TimeZone(identifier: "UTC")!

    /// Made on each use, so a change of the 12/24-hour setting shows at once.
    private static func formatter(timeZone: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = .autoupdatingCurrent
        f.timeZone = timeZone
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }
}
