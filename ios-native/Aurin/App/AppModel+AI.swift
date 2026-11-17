import Foundation

// The AI consent as the app shows it (Settings → Privacy & data → AI features,
// src/consent.js): off, the coach's rows, its tile in "+" and the AI parts of
// the screens hide, and the coach top right asks for the consent instead of
// running into an error after a question. Read once a launch (GET /app/api/me)
// and set again when the athlete changes it.
extension AppModel {
    nonisolated static let aiOffKey = "aiOff"

    func loadAIConsent() async {
        guard !demo, let allowed = try? await api.aiAllowed() else { return }
        aiConsentLoaded = true
        setAIOff(!allowed)
    }

    func setAIOff(_ off: Bool) {
        if aiOff != off { aiOff = off }
        UserDefaults.standard.set(off, forKey: Self.aiOffKey)
    }
}
