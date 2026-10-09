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

    /// The consent from the setup: health data, which covers the AI features too (as on the web).
    func giveHealthConsent() async throws {
        let _: JSONValue = try await send("/app/api/consent", method: "POST", body: ["health": JSONValue.bool(true), "ai": .bool(true)])
    }
}
