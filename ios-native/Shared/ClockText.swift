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

    /// One formatter per time zone, made again after a change of the
    /// 12/24-hour setting, the region or the time zone (the screens format
    /// every clock as they draw, the day's timeline each minute).
    private static func formatter(timeZone: TimeZone) -> DateFormatter {
        _ = watching
        let key = timeZone.identifier + L10n.language
        lock.lock()
        defer { lock.unlock() }
        if let formatter = made[key] { return formatter }
        let f = DateFormatter()
        // The app's language with the phone's 12/24-hour setting: an English
        // app on a Czech phone reads "7:30 PM", not "7:30 odp.".
        f.locale = L10n.locale
        f.timeZone = timeZone
        f.dateFormat = isTwelveHour ? "h:mm a" : "H:mm"
        made[key] = f
        return f
    }

    private static let lock = NSLock()
    // Guarded by lock.
    nonisolated(unsafe) private static var made: [String: DateFormatter] = [:]

    /// Empties `made` when the phone's settings change; set up on first use.
    private static let watching: Bool = {
        let changes: [Notification.Name] = [NSLocale.currentLocaleDidChangeNotification, .NSSystemTimeZoneDidChange]
        for name in changes {
            _ = NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { _ in ClockText.forget() }
        }
        return true
    }()

    private static func forget() {
        lock.lock()
        made = [:]
        lock.unlock()
    }
}
