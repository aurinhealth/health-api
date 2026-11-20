import SwiftUI

/// Aurin Pro at the top of Today, under the week (the Pro concept and the
/// onboarding concept's Today): the gold mark, "Try Aurin Pro free for 7 days"
/// or "Get Aurin Pro", what it brings, and an ✕. The server decides when it
/// shows (src/pro-banner.js: never with Pro or in the free week, back 7 days
/// after a close, after the third close once in 30). On the day of the setup
/// it waits: the setup's own offer came once already (part O, decision B).
struct ProBanner: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(FirstDays.sinceKey) private var setupSince: Double = 0
    @State private var banner: SubscriptionStatus.ProBanner?
    private let store = ProStore.shared

    /// banner: shown as given (the snapshot test).
    init(banner: SubscriptionStatus.ProBanner? = nil) {
        _banner = State(initialValue: banner)
    }

    /// The setup finished today (local day): the banner starts tomorrow.
    private var setupDay: Bool {
        setupSince > 0 && AppModel.localDate(Date(timeIntervalSince1970: setupSince)) == AppModel.localDate(Date())
    }

    /// The free week only when the server and the App Store both say it is still there (App Review 3.1.2).
    private var trial: Bool { banner?.offer == "trial" && (store.trialEligible || ProStore.hostsUnitTests) }

    var body: some View {
        // A VStack, not a Group: its task runs while the banner is still hidden.
        VStack(spacing: 0) {
            if banner?.show == true, !setupDay, !SetupProOffer.pending {
                HStack(spacing: 12) {
                    Button { Paywall.present(model) { Task { await load() } } } label: {
                        HStack(spacing: 12) {
                            AurinMark(size: 30, gold: true, glow: true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(trial ? "Vyzkoušej Aurin Pro 7 dní zdarma" : "Získej Aurin Pro")
                                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                Text("Kouč, Aurin age, tréninkové plány a další")
                                    .font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    // Always an ✕, never a countdown; the offer stays in Settings.
                    Button { Task { await close() } } label: {
                        Image(systemName: "xmark").scaledFont(12, weight: .semibold).foregroundStyle(Palette.muted)
                            .tapTarget(width: 28, height: 28)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Skrýt nabídku Aurin Pro"))
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .cardSurface(cornerRadius: 18)
                .padding(.top, 14)
                .transition(.opacity)
            }
        }
        .task { if banner == nil { await load() } }
    }

    private func load() async {
        guard !model.demo, let status = try? await model.api.subscription() else { return }
        await store.load()
        banner = status.proBanner
    }

    private func close() async {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy) {
            banner = SubscriptionStatus.ProBanner(show: false, offer: banner?.offer)
        }
        AccessibilityNotification.Announcement(L10n.tr("Nabídka zůstane v Nastavení.")).post()
        if let next = try? await model.api.closeProBanner() { banner = next }
    }
}
