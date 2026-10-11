import Foundation

// The AI subscription (src/subscription.js). During the invitation-only pilot
// everything is free (mode "pilot"); once AI_PAYWALL_ENABLED is on, AI features
// answer 402 without the "ai" plan and the app offers the subscription.

struct SubscriptionStatus: Decodable, Equatable {
    /// "pilot" (all free) or "paid" (AI needs the plan).
    let mode: String?
    /// "free" or "ai".
    let plan: String?
    let aiAccess: Bool?
    let aiConsent: Bool?
    let billingActive: Bool?
    /// Buying is possible in the app (false until payments are connected).
    let checkoutAvailable: Bool?
    let features: [Feature]?
    let terms: String?

    struct Feature: Decodable, Equatable, Hashable {
        let name: String
        /// Part of the AI plan; false: free for everyone.
        let ai: Bool
    }

    var pilot: Bool { mode != "paid" }
    var hasAI: Bool { plan == "ai" }

    static let demo = SubscriptionStatus(mode: "pilot", plan: "free", aiAccess: true, aiConsent: true, billingActive: false, checkoutAvailable: false,
        features: [Feature(name: "Profil, kalorické cíle a přehledy", ai: false), Feature(name: "Ruční zápis jídla, váhy a tréninků", ai: false),
                   Feature(name: "Propojení a synchronizace služeb", ai: false), Feature(name: "AI trenér a úpravy plánů vlastními slovy", ai: true),
                   Feature(name: "Rozpoznání jídla a etikety z fotky pomocí AI", ai: true)],
        terms: nil)
}

extension APIClient {
    func subscription() async throws -> SubscriptionStatus {
        try await get("/app/api/subscription")
    }
}
