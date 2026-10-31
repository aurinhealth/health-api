import Foundation

/// GET /app/api/onboarding as the setup flow reads it (src/onboarding.js):
/// `profile` is the saved profile with the connected services' suggestions
/// filled in, `savedProfile` only what the user set himself.
struct SetupStatus: Decodable {
    let completed: Bool?
    let profile: JSONObject?
    let savedProfile: JSONObject?
    let suggestions: JSONObject?
    let weightKg: Double?
    let training: Training?

    struct Training: Decodable {
        let experience: String?
        let experienceMode: String?
        let equipment: String?
        let limitations: String?
    }
}

// The first-run setup: consent, data sources and the profile.
extension APIClient {
    func setupStatus() async throws -> SetupStatus {
        try await get("/app/api/onboarding")
    }

    /// Whether the account still has to agree to the processing of health data
    /// (GET /app/api/me → consent.needed, src/consent.js). The owner never does.
    func healthConsentNeeded() async throws -> Bool {
        struct Consent: Decodable { let needed: Bool? }
        struct Me: Decodable { let consent: Consent? }
        let me: Me = try await get("/app/api/me")
        return me.consent?.needed ?? false
    }

    /// needed as above; paused: the user took the consent back in Settings →
    /// Soukromí a data (src/health-pause.js), so the app shows the paused screen.
    func healthConsentState() async throws -> (needed: Bool, paused: Bool) {
        struct Consent: Decodable { let needed: Bool?; let paused: Bool? }
        struct Me: Decodable { let consent: Consent? }
        let me: Me = try await get("/app/api/me")
        return (me.consent?.needed ?? false, me.consent?.paused ?? false)
    }

    /// Settings → Soukromí a data → Pozastavit zdravotní data: the consent is
    /// taken back and the server deletes the health data (src/health-pause.js).
    func pauseHealthData() async throws {
        let _: JSONValue = try await send("/app/api/health-pause", method: "POST", body: ["confirm": JSONValue.string("PAUSE")], timeout: 60)
    }

    /// The consent from the setup: health data, which covers the AI features too (as on the web).
    /// The health-data consent and, when the user ticked it, the separate one
    /// to send what an AI feature needs to OpenAI. Left unticked, an AI choice
    /// made earlier stays as it was.
    func giveHealthConsent(ai: Bool) async throws {
        var body: [String: JSONValue] = ["health": .bool(true)]
        if ai { body["ai"] = .bool(true) }
        let _: JSONValue = try await send("/app/api/consent", method: "POST", body: body)
    }
}
