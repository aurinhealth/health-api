import StoreKit
import SwiftUI
import UIKit

// Aurin Pro: a row at the top of Settings, the subscription page in night
// violet (ProPage in ProSettings.swift: the plan's state, extra coach
// messages, what Pro brings) and the offer over the whole screen
// (ProPaywall.swift). It is bought from the App Store (ProStore.swift);
// during the invitation-only pilot everything is free anyway and TestFlight
// buys with Apple's test purchases. The server decides who has AI
// (src/subscription.js, src/app-store.js).

/// The plans of the offer. The prices come from the App Store (ProStore), in
/// the currency of the buyer's country; until it answers, the Czech ones with
/// VAT that App Store Connect starts from.
enum ProPlans {
    struct Plan: Identifiable, Equatable {
        let id: String
        let title: String
        let price: String?
        let note: String?
        var best = false
        /// The App Store product.
        var product: String { id == "annual" ? ProStore.yearlyID : ProStore.monthlyID }
    }

    static let main: [Plan] = [
        Plan(id: "annual", title: "Ročně", price: "1 490 Kč / rok", note: "124 Kč měsíčně", best: true),
        Plan(id: "monthly", title: "Měsíčně", price: "199 Kč / měsíc", note: "placeno měsíčně")
    ]
    static let all: [Plan] = main

    /// The plans with the App Store's prices where it has them.
    @MainActor
    static func priced(_ store: ProStore) -> [Plan] {
        main.map { plan in
            guard let price = store.price(plan.product) else { return plan }
            if plan.id == "annual" {
                return Plan(id: plan.id, title: plan.title, price: L10n.f("%@ / rok", price),
                            note: store.perMonth(plan.product).map { L10n.f("%@ měsíčně", $0) } ?? plan.note, best: plan.best)
            }
            return Plan(id: plan.id, title: plan.title, price: L10n.f("%@ / měsíc", price), note: plan.note, best: plan.best)
        }
    }

    /// "1 490 Kč" for the renewal line under the button.
    @MainActor
    static func price(_ plan: String, _ store: ProStore) -> String {
        let product = plan == "annual" ? ProStore.yearlyID : ProStore.monthlyID
        return store.price(product) ?? L10n.tr(plan == "annual" ? "1 490 Kč" : "199 Kč")
    }
}

/// What Aurin has for everyone and what Pro adds, on Settings → Aurin Pro. Pro is
/// "Aurin Intelligence" (everything that asks an AI model) and the plans that
/// adapt; without it there is one starter plan in every sport (Petr, 3 Nov 2026).
enum ProContents {
    static let free = [
        "Připravenost, spánek a zátěž",
        "Sledování cyklu",
        "Kalorický cíl a makra",
        // Exactly what Free gets (App Review 3.1.2): FOOD_PHOTO_TRIAL in src/food-photo-trial.js.
        "Zápis jídla, čárový kód a 5 fotek jídla s AI měsíčně",
        "Zápis posilovny a technika cviků",
        "Úvodní plán pro každý sport"
    ]

    struct Group: Identifiable {
        let title: String
        let items: [String]
        var id: String { title }
    }

    static let pro = [
        // The ones without items first, so none of them reads as part of the
        // last group (606 N4).
        Group(title: "Aurin Age", items: []),
        Group(title: "Vitamíny a minerály", items: []),
        Group(title: "Vlastní makra a cíle živin", items: []),
        Group(title: "Aurin Intelligence", items: [
            "Kouč jen pro tebe",
            "Změny plánu vlastními slovy",
            "Hodnocení tréninku, dne a týdne",
            "Jídlo z fotky, slov nebo webu",
            "Vybavení posilovny z fotky nebo webu"
        ]),
        Group(title: "Adaptivní tréninkové plány", items: [
            "Plány na závody a cíle",
            "Podle tvé regenerace a pokroku",
            "Podle času, který každý den máš"
        ])
    ]
}

/// Settings → the first row: the logo and "Aurin Pro", a gold "Aktivní"
/// once it is bought, and the extra coach messages when there are any.
struct ProSettingsRow: View {
    @Environment(AppModel.self) private var model
    @State private var hasPro = false
    @State private var extra = 0

    var body: some View {
        NavigationLink { SubscriptionView() } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    AurinMark(size: 22, gold: hasPro, glow: true)
                    AurinProTitle(size: 21, gold: hasPro)
                    Spacer()
                    if extra > 0 {
                        Text(verbatim: L10n.f("%lld navíc", extra)).font(.subheadline).foregroundStyle(Palette.indigo)
                    }
                    if hasPro {
                        Text("Aktivní").font(.subheadline).foregroundStyle(AurinMark.goldTop)
                    }
                    Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                }
                .frame(minHeight: 52)
                // The 12 payments in the card, as on the Pro page (602 point 59).
                if hasPro, let payments = ProStore.shared.payments {
                    ProHubTimeline(payments: payments).padding(.bottom, 14)
                }
            }
            .padding(.horizontal, 18)
            .background(
                RadialGradient(colors: [(hasPro ? AurinMark.goldTop : AurinMark.amber).opacity(0.18), .clear],
                               center: .leading, startRadius: 0, endRadius: 180),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .cardSurface(cornerRadius: 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .task {
            guard !model.demo else { return }
            let status = try? await model.api.subscription()
            hasPro = status?.purchased == true || ProStore.shared.entitled
            extra = status?.coachAllowance?.extra ?? 0
        }
    }
}

/// Aurin Pro in night violet (ProPage): loads the account's plan from the
/// server and the App Store, opens the offer, the packs and Apple's sheet.
struct SubscriptionView: View {
    @Environment(AppModel.self) private var model
    @State private var status: SubscriptionStatus?
    @State private var error: String?
    @State private var manage = false
    @State private var restoring = false
    @State private var notice: String?
    @State private var morePacks = false
    @State private var redeemCode = false
    /// Opened inside Settings: the title in spaced capitals like its other pages (602 point 9).
    @Environment(\.settingsTitles) private var settingsTitles
    private let store = ProStore.shared

    var body: some View {
        ProPage(state: Self.state(status, store), error: error,
                morePacks: { morePacks = true }, goPro: { Paywall.present(model) }, manage: { manage = true })
            .navigationTitle(loading ? "" : L10n.tr(free ? "Správa předplatného" : "Aurin Pro"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(free || loading ? nil : .dark, for: .navigationBar)
            .toolbar {
                if settingsTitles && !loading {
                    ToolbarItem(placement: .principal) {
                        Text(L10n.tr(free ? "Správa předplatného" : "Aurin Pro").uppercased(with: L10n.locale))
                            .font(.footnote.weight(.semibold)).tracking(2.4).foregroundStyle(free ? Palette.ink : Night.ink)
                            .lineLimit(1).minimumScaleFactor(0.8)
                            .accessibilityAddTraits(.isHeader)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Uplatnit promo kód") { redeemCode = true }
                        Button("Obnovit nákup") {
                            restoring = true
                            Task { notice = await store.restore(); restoring = false; await load() }
                        }
                        .disabled(restoring)
                    } label: {
                        Image(systemName: "ellipsis").accessibilityLabel(L10n.tr("Další možnosti"))
                    }
                }
            }
            // Apple's own sheet for an offer code; what it redeems comes through Transaction.updates (ProStore).
            .offerCodeRedemption(isPresented: $redeemCode) { result in
                if case .failure(let error) = result { notice = error.localizedDescription }
                Task { await store.refresh(); await load() }
            }
            .navigationDestination(isPresented: $morePacks) { CoachPacksView() }
            .onAppear { ScreenTrail.visit("page/Aurin Pro") }
            .task { await load() }
            .onChange(of: morePacks) { _, open in if !open { Task { await load() } } }
            .manageSubscriptionsSheet(isPresented: $manage)
            .onChange(of: manage) { _, open in if !open { Task { await store.refresh(); await load() } } }
            .alert(L10n.tr("Aurin Pro"), isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(notice ?? "") }
    }

    /// No Pro and not the pilot: Manage Subscription in the app's own look (ManageFreePage).
    private var free: Bool {
        let state = Self.state(status, store)
        return state.loaded && !state.unlocked
    }

    /// Before the server answers (ProPage shows only a spinner then).
    private var loading: Bool { status == nil && error == nil }

    /// What the page shows, from the server's status and the App Store.
    static func state(_ status: SubscriptionStatus?, _ store: ProStore) -> ProPageState {
        let hasPro = status?.purchased == true || store.entitled
        var firstPayment: String?
        if let week = store.freeWeek {
            let price = store.payments != nil ? store.commitment?.monthly : store.price(ProStore.yearlyID)
            firstPayment = [PaywallView.weekday(week.end), price].compactMap { $0 }.joined(separator: ", ")
        }
        return ProPageState(hasPro: hasPro, unlocked: hasPro || status?.aiAccess == true, pilot: status?.pilot == true,
                            renewal: renewal(status), freeWeek: store.freeWeek, firstPayment: firstPayment,
                            payments: store.payments, allowance: status?.coachAllowance,
                            packsOnSale: status?.packsBuyable == true,
                            loaded: status != nil, trial: store.trialEligible)
    }

    /// "Obnoví se 1. prosince" or "Platí do 1. prosince".
    private static func renewal(_ status: SubscriptionStatus?) -> String? {
        guard let purchase = status?.purchase, purchase.active, let end = purchase.expiresAt, end.count >= 10 else { return nil }
        let day = Fmt.dayMonth(String(end.prefix(10)))
        return purchase.autoRenew == false ? L10n.f("Platí do %@", day) : L10n.f("Obnoví se %@", day)
    }

    private func load() async {
        if model.demo { status = .demo; await store.load(); return }
        do {
            status = try await model.api.subscription()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        await store.load()
    }
}

/// The offer over the whole screen, from wherever it is asked for: the page
/// above, the coach, or any AI feature the server turned down with 402. Shown
/// from UIKit on top of what is open, so a sheet does not block it.
@MainActor
enum Paywall {
    private static let tag = 0x10AD

    /// `from`: the "Unlock with Pro" tapped, in screen points; the offer then
    /// comes in around it over the page instead of sliding up (Pro concept).
    /// `orb`: the Aurin age orb it stood under.
    static func present(_ model: AppModel, from source: CGRect? = nil, orb: CGRect? = nil, closed: (() -> Void)? = nil) {
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        guard top.view.tag != tag else { return }
        let host = UIHostingController(rootView: AnyView(EmptyView()))
        // Reduce Motion: no way in, the offer at once as from anywhere else.
        let source = UIAccessibility.isReduceMotionEnabled ? nil : source
        host.rootView = AnyView(PaywallView(close: { [weak host] in host?.dismiss(animated: true) { closed?() } }, source: source, orb: orb).environment(model))
        host.view.tag = tag
        if source != nil {
            host.modalPresentationStyle = .overFullScreen
            host.view.backgroundColor = .clear
            top.present(host, animated: false)
        } else {
            host.modalPresentationStyle = .fullScreen
            top.present(host, animated: true)
        }
    }
}

/// A 390 × 844 screen in a phone, scaled to the given height, not touchable.
struct PhoneMockup<Content: View>: View {
    var height: CGFloat = 437
    @ViewBuilder var content: Content

    var body: some View {
        let bezel: CGFloat = 7
        let scale = (height - bezel * 2) / 844
        content
            .frame(width: 390, height: 844, alignment: .top)
            .clipShape(RoundedRectangle(cornerRadius: 56, style: .continuous))
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: 390 * scale, height: 844 * scale, alignment: .topLeading)
            .overlay(alignment: .top) { Capsule().fill(Color.black).frame(width: 122 * scale, height: 36 * scale).padding(.top, 11 * scale) }
            .padding(bezel)
            .background(Color.black, in: RoundedRectangle(cornerRadius: 56 * scale + bezel, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 56 * scale + bezel, style: .continuous).stroke(Palette.ink.opacity(0.22), lineWidth: 1.5) }
            .shadow(color: Palette.indigo.opacity(0.35), radius: 30)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// In an AI feature without Pro: what it is and the way to it, instead of an error.
struct AISubscriptionCard: View {
    let open: () -> Void

    var body: some View {
        Card {
            Label("AI je součástí Aurin Pro", systemImage: "sparkles").font(.headline).foregroundStyle(Palette.ink)
            Text("Kouč, jídlo z fotky a hodnocení tréninků patří do Aurin Pro. Zápisy a přehledy zůstávají zdarma.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button(action: open) {
                Text("Zobrazit Aurin Pro").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
