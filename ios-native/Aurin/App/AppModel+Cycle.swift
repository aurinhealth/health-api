import Foundation

// Cycle tracking in the app state: the cycle screens read `cycle`, every
// write answers with the new view and loads Today (and Health) again, since
// the readiness, the day's plan and the pill follow it.
extension AppModel {
    func loadCycle(month: String? = nil) async {
        guard !demo, phase == .signedIn else { return }
        let account = signInRound
        guard let response = try? await api.cycle(month: month), stillSignedIn(account) else { return }
        cycle = response
        Reminders.storePill(response.enabled ? response.settings : nil)
        if response.enabled && !cycleHealthSynced {
            cycleHealthSynced = true
            await CycleHealth.sync(api: api)
        }
    }

    func saveCycleSettings(_ changes: JSONObject) async throws {
        guard !demo else { return }
        let response = try await api.saveCycleSettings(changes)
        cycle = response
        Reminders.storePill(response.enabled ? response.settings : nil)
        if response.enabled && !cycleHealthSynced {
            cycleHealthSynced = true
            await CycleHealth.sync(api: api)
        }
        await afterCycleChange()
    }

    /// Logs a day (flow, symptoms, pill, noPeriod, keepPlan; `date` is added).
    func logCycleDay(_ date: String, _ changes: JSONObject) async throws {
        guard !demo else { return }
        var body = changes
        body["date"] = .string(date)
        if let month = cycle?.month { body["month"] = .string(month) }
        cycle = try await api.saveCycleDay(body)
        await afterCycleChange()
    }

    /// The pill taken now (Today, Health, the calendar).
    func takePill(on date: String? = nil) async throws {
        try await logCycleDay(date ?? Self.localDate(Date()), ["pill": .string(Self.clockNow())])
    }

    private func afterCycleChange() async {
        await refresh()
        if health != nil { await refreshHealth() }
    }

    nonisolated static func clockNow() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }
}
