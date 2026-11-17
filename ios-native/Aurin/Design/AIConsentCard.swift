import SwiftUI

/// The words of the AI consent, the same in onboarding and on every card
/// that asks for it (redesign PRIV-1: the card shows the full onboarding
/// text, never a shorter one). AI_CONSENT_VERSION in src/consent.js.
enum AIConsentText {
    static let title = "Tvůj AI kouč"
    static let body = "Kouč, jeho denní shrnutí na Dnes, Tréninku a Jídle, jeho paměť po dni s chatem, rozpoznání jídla z fotky a hodnocení tréninku a týdne posílají potřebné údaje, včetně údajů o zdraví a fotek, které pošleš, společnosti OpenAI (USA). Ta je nepoužívá k trénování svých modelů. Cyklus a citlivé položky deníku jen po jejich zapnutí."
    static let note = "Jde to kdykoli vypnout v Nastavení."
}

/// The one AI consent card (redesign Z2): shown wherever the server answers
/// "ai_consent_required" (APIError.aiConsentRequired), in the coach chat and
/// on every coach entry while the AI is off, never as an error. "Allow AI"
/// gives the consent; `allowed` then carries on with what asked for it.
struct AIConsentCard: View {
    /// Gives the consent (APIClient.allowAI).
    let allow: () async throws -> Void
    /// After the consent: send the question again, open the coach.
    var allowed: () async -> Void = {}
    @State private var working = false
    @State private var failed: String?

    var body: some View {
        Card {
            Text(verbatim: L10n.tr(AIConsentText.title)).font(.headline).foregroundStyle(Palette.ink)
            Text(verbatim: L10n.tr(AIConsentText.body))
                .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Text(verbatim: L10n.tr(AIConsentText.note)).font(Typo.small).foregroundStyle(Palette.muted)
            Link(L10n.tr("Zásady ochrany soukromí"), destination: L10n.legalURL("privacy")).font(Typo.small)
            if let failed {
                Text(verbatim: failed).font(Typo.small).foregroundStyle(Palette.Status.bad)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button {
                Task {
                    working = true
                    defer { working = false }
                    do {
                        try await allow()
                        failed = nil
                        await allowed()
                    } catch {
                        failed = error.localizedDescription
                    }
                }
            } label: {
                ZStack {
                    Text(verbatim: L10n.tr("Povolit AI")).opacity(working ? 0 : 1)
                    if working { ProgressView().tint(Palette.onButton) }
                }
                .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                .frame(maxWidth: .infinity, minHeight: 46).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(working)
        }
    }
}
