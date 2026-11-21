import Foundation

extension AppModel {
    /// The days from start to end (today at most) for the month calendar,
    /// once; the sheet asks for the current month again each time it opens.
    /// The server sends at most a month.
    func loadDays(from start: String, to end: String, force: Bool = false) async {
        let today = Self.localDate(Date())
        let last = min(end, today)
        guard start <= last, !demo, phase == .signedIn else { return }
        guard force || ISODay.range(start, last).contains(where: { dayValues[$0] == nil }) else { return }
        let account = scope
        do {
            let result = try await api.days(start: start, end: last)
            guard stillSignedIn(account), result.degraded != true else { return }
            for day in result.days { dayValues[day.date] = day }
        } catch {
            // Without signal the days already here stay (the request is in ErrorLog).
            if Self.isCancellation(error) || Outbox.isNoConnection(error) || (error as? APIError) == .unauthorized { return }
            notice = error.localizedDescription
        }
    }

    /// The 91 days up to `end` for a detail's 3-month chart, in the server's
    /// month-long windows (src/app-days.js DAYS_MAX).
    func loadQuarter(ending end: String) async {
        for back in stride(from: 0, through: 60, by: 31) {
            await loadDays(from: ISODay.shift(end, -(back + 30)), to: ISODay.shift(end, -back))
        }
    }
}
