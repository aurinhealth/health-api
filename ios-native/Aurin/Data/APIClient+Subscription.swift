import Foundation

// The AI subscription (src/subscription.js). During the invitation-only pilot
// everything is free (mode "pilot"); once AI_PAYWALL_ENABLED is on, AI features
// answer 402 without the "ai" plan and the app offers the subscription.
// Aurin Pro is bought in the app (ProStore.swift); the server keeps what the
// App Store says about it (purchase, src/app-store.js).

struct SubscriptionStatus: Decodable, Equatable {
    /// "pilot" (all free) or "paid" (AI needs the plan).
    let mode: String?
    /// "free" or "ai".
    let plan: String?
    let aiAccess: Bool?
    let aiConsent: Bool?
    let billingActive: Bool?
    /// The App Store is set up on the server (src/app-store.js).
    let checkoutAvailable: Bool?
    let features: [Feature]?
    let terms: String?
    /// This week's messages to the coach; nil for the owner.
    var coachAllowance: CoachAllowance? = nil
    /// The account's UUID that every purchase carries, so the server knows whose it is.
    var appAccountToken: String? = nil
    /// Aurin Pro as the App Store last told the server; nil when never bought.
    var purchase: Purchase? = nil

    struct Purchase: Decodable, Equatable {
        let active: Bool
        let productId: String?
        /// ISO 8601: the end of the paid period (or of the free week).
        let expiresAt: String?
        /// "Production" or "Sandbox" (TestFlight).
        let environment: String?
        let autoRenew: Bool?
    }

    struct Feature: Decodable, Equatable, Hashable {
        let name: String
        /// Part of the AI plan; false: free for everyone.
        let ai: Bool
    }

    var pilot: Bool { mode != "paid" }
    var hasAI: Bool { plan == "ai" }
    /// Aurin Pro bought (or its free week); in the pilot everyone has AI without it.
    var purchased: Bool { purchase?.active == true || (!pilot && hasAI) }

    static let demo = SubscriptionStatus(mode: "pilot", plan: "free", aiAccess: true, aiConsent: true, billingActive: false, checkoutAvailable: false,
        features: [Feature(name: "Profil, kalorické cíle a přehledy", ai: false), Feature(name: "Ruční zápis jídla, váhy a tréninků", ai: false),
                   Feature(name: "Propojení a synchronizace služeb", ai: false), Feature(name: "AI trenér a úpravy plánů vlastními slovy", ai: true),
                   Feature(name: "Rozpoznání jídla a etikety z fotky pomocí AI", ai: true)],
        terms: nil)
}

/// The weekly allowance of messages to the coach (src/coach-allowance.js).
/// The app says nothing about it until 75 % is used.
struct CoachAllowance: Decodable, Equatable {
    let limit: Int
    let used: Int
    let left: Int
    /// The Monday a new week's messages come, "YYYY-MM-DD".
    let resetsOn: String?
    /// 75 % used: the counter and the Settings line show.
    let near: Bool
    /// On the answer that crossed into the last quarter: the line in the chat, once.
    var notice: Bool? = nil
    /// false once not even the running conversation can go on.
    var more: Bool? = nil

    var usedUp: Bool { left <= 0 }

    /// The new messages come tomorrow when it is Sunday.
    static var tomorrow: Bool { Calendar.current.component(.weekday, from: Date()) == 1 }

    /// "zbývají 3 zprávy" by the input.
    var counter: String {
        L10n.plural("zbývá %lld zpráv", left)
    }
    /// The one-time line in the chat.
    var chatNotice: String {
        L10n.plural("Tento týden ti zbývá %lld zpráv koučovi.", left)
    }
    /// Settings → Aurin Pro: nothing under 75 %, then what is left and when it renews.
    var settingsLine: String? {
        if usedUp { return L10n.tr("Zprávy koučovi na tento týden jsou vyčerpané.") + "\n" + Self.comesBack }
        guard near else { return nil }
        let left = L10n.plural("Tento týden zbývá %lld zpráv koučovi.", self.left)
        return left + "\n" + L10n.tr(Self.tomorrow ? "Obnoví se zítra." : "Obnoví se v pondělí.")
    }
    static var comesBack: String { L10n.tr(tomorrow ? "Další přibudou zítra." : "Další přibudou v pondělí.") }
    static var placeholder: String { L10n.tr(tomorrow ? "Další zprávy zítra" : "Další zprávy v pondělí") }
}

extension APIClient {
    func subscription() async throws -> SubscriptionStatus {
        try await get("/app/api/subscription")
    }
}
