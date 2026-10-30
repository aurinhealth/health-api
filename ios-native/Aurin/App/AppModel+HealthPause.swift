import Foundation

// Pausing health data (Settings → Soukromí a data, src/health-pause.js): the
// consent is taken back and the server deletes the health data, the account
// stays. The phone stops reading Apple Health and forgets what it shows; the
// app shows only the paused screen (HealthPausedView) until the consent is
// given again, after which Apple Health and the services bring the history in.
extension AppModel {
    nonisolated static let healthPausedKey = "healthPaused"

    func pauseHealthData() async throws {
        try await api.pauseHealthData()
        notePaused(true)
    }

    /// What the server says; a pause is applied on this phone once.
    func notePaused(_ paused: Bool) {
        UserDefaults.standard.set(paused, forKey: Self.healthPausedKey)
        guard paused else { healthPaused = false; return }
        // Paused at an earlier start: forgotten then already.
        if !healthPaused { forgetHealthOnPhone() }
        healthPaused = true
    }

    /// "Zapnout znovu": the consent page of the setup (SetupFlowView).
    func turnHealthBackOn() {
        resumingHealth = true
        needsSetup = true
    }

    /// The consent was given again (SetupFlowView → finishSetup).
    /// Apple Health reads its history meanwhile; Today waits for it as at any start.
    func healthResumed() {
        resumingHealth = false
        notePaused(false)
        let client = api
        Task { await AppleHealth.shared.resumeAfterHealthPause(api: client) }
    }

    /// The health data this phone keeps for the screens, the widgets, the watch
    /// and the writes waiting for signal; the account and the settings stay.
    private func forgetHealthOnPhone() {
        scope.end()
        scope = AccountScope()
        dropRefresh()
        AccountCaches.forget()
        writes.clear()
        AppleHealth.shared.pauseForHealthData()
        cycle = nil
        cycleHealthSynced = false
        Reminders.forgetPill()
        Reminders.cancelAll()
        WidgetBridge.clear()
        clearScreens()
        paths = [:]
        tab = .today
        selectedDate = nil
        athleteStatus = nil
        muscleFatigue = nil
        musclesAt = nil
        pastStrain = [:]
        syncStatus = nil
    }
}
