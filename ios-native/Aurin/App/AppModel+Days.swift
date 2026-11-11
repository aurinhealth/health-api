import Foundation

extension AppModel {
    /// The days from start to end (today at most) for the month calendar,
    /// once; force again after a sync. The server sends at most 42 days.
    func loadDays(from start: String, to end: String, force: Bool = false) async {
        let today = Self.localDate(Date())
        let last = min(end, today)
        guard start <= last, !demo, phase == .signedIn else { return }
        guard force || ISODay.range(start, last).contains(where: { dayValues[$0] == nil }) else { return }
        let account = scope
        do {
            let result = try await api.days(start: start, end: last)
            guard stillSignedIn(account) else { return }
            for day in result.days { dayValues[day.date] = day }
        } catch {
            // Without signal the days already here stay (the request is in ErrorLog).
            if Self.isCancellation(error) || Outbox.isNoConnection(error) || (error as? APIError) == .unauthorized { return }
            notice = error.localizedDescription
        }
    }
}
