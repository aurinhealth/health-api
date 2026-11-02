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

    /// What the server says (or a 403 health_paused): a pause is applied on this
    /// phone once; turned on again here or on another device, Apple Health reads
    /// its history again.
    func notePaused(_ paused: Bool) {
        let was = healthPaused
        UserDefaults.standard.set(paused, forKey: Self.healthPausedKey)
        if paused, !was { forgetHealthOnPhone() }
        healthPaused = paused
        if !paused, was {
            let client = api
            Task { await AppleHealth.shared.resumeAfterHealthPause(api: client) }
        }
    }

    /// "Zapnout znovu": the consent page of the setup (SetupFlowView).
    func turnHealthBackOn() {
        resumingHealth = true
        needsSetup = true
    }

    /// The consent was given again (SetupFlowView → finishSetup). Apple Health
    /// reads its history meanwhile; Today waits for it as at any start.
    func healthResumed() {
        resumingHealth = false
        notePaused(false)
    }

    /// The health data this phone keeps for the screens, the widgets, the watch,
    /// the writes waiting for signal and the cycle; the account and the settings stay.
    private func forgetHealthOnPhone() {
        forgetShownData()
        writes.clear()
        AppleHealth.shared.pauseForHealthData()
        forgetAccountData()
        syncStatus = nil
    }
}
