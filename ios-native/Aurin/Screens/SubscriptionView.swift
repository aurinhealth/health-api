import StoreKit
import SwiftUI
import UIKit

// Aurin Pro, laid out like Bevel Pro: a row at the top of Settings, the
// subscription page (what Free has ✓ and lacks ✗, "Přejít na Aurin Pro"),
// and the offer over the whole screen: the app in a phone, then what Pro
// brings and the plans, then how the free week goes. It is bought from the
// App Store (ProStore.swift); during the invitation-only pilot everything is
// free anyway and TestFlight buys with Apple's test purchases. The server
// decides who has AI (src/subscription.js, src/app-store.js).

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

/// One thing Pro adds, with its icon.
struct ProFeature: Identifiable {
    let symbol: String
    let color: Color
    let title: String
    let subtitle: String
    var id: String { title }

    static let pro: [ProFeature] = [
        ProFeature(symbol: "bubble.left.and.text.bubble.right.fill", color: Palette.indigo, title: "AI kouč", subtitle: "Ptej se kdykoli, odpoví z tvých dat."),
        ProFeature(symbol: "calendar.badge.clock", color: Palette.rust, title: "Plán vlastními slovy", subtitle: "Řekni, co se změnilo, a týden se přizpůsobí."),
        ProFeature(symbol: "chart.line.uptrend.xyaxis", color: Palette.green, title: "Hodnocení tréninků a dne", subtitle: "Co se povedlo a co příště jinak."),
        ProFeature(symbol: "camera.fill", color: Palette.amberBar, title: "Jídlo z fotky", subtitle: "Vyfoť talíř nebo etiketu, hodnoty doplní AI."),
        ProFeature(symbol: "text.bubble.fill", color: Palette.blue, title: "Jídlo vlastními slovy", subtitle: "Napiš, co máš na talíři, a najde se i to, co katalog nezná."),
        ProFeature(symbol: "figure.strengthtraining.traditional", color: Palette.brown, title: "Technika každého cviku", subtitle: "Popis provedení i pro cviky mimo katalog.")
    ]
    static let included: [ProFeature] = [
        ProFeature(symbol: "heart.fill", color: Palette.rust, title: "Regenerace a spánek", subtitle: "Připravenost, HRV a potřeba spánku každý den."),
        ProFeature(symbol: "flame.fill", color: Palette.amberBar, title: "Kalorický cíl a makra", subtitle: "Cíl, který roste s tím, jak se hýbeš."),
        ProFeature(symbol: "dumbbell.fill", color: Palette.brown, title: "Plán posilovny a tréninků", subtitle: "Týden podle času, který máš."),
        ProFeature(symbol: "arrow.triangle.2.circlepath", color: Palette.indigo, title: "Google Health a Intervals.icu", subtitle: "Data z hodinek bez přepisování.")
    ]
}

/// Settings → the first row: the logo and "Aurin Pro", a gold "Aktivní"
/// once it is bought.
struct ProSettingsRow: View {
    @Environment(AppModel.self) private var model
    @State private var hasPro = false

    var body: some View {
        NavigationLink { SubscriptionView() } label: {
            HStack(spacing: 12) {
                AurinMark(size: 22, gold: hasPro, glow: true)
                AurinProTitle(size: 21, gold: hasPro)
                Spacer()
                if hasPro {
                    Text("Aktivní").font(.subheadline).foregroundStyle(AurinMark.goldTop)
                }
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 18).frame(minHeight: 52)
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
            hasPro = (try? await model.api.subscription())?.purchased == true || ProStore.shared.entitled
        }
    }
}

/// Aurin Pro: the logo, the plan, a tile for each thing Pro brings (locked
/// without it) and, without Pro, the plans and the way to the offer; with it,
/// when it renews and Apple's sheet to change or cancel it.
struct SubscriptionView: View {
    @Environment(AppModel.self) private var model
    @State private var status: SubscriptionStatus?
    @State private var error: String?
    @State private var manage = false
    @State private var restoring = false
    @State private var notice: String?
    private let store = ProStore.shared

    private var hasPro: Bool { status?.purchased == true || store.entitled }
    private var unlocked: Bool { hasPro || status?.aiAccess == true }

    var body: some View {
        SettingsPage(title: "Aurin Pro") {
            VStack(spacing: 16) {
                AurinMark(size: 92, gold: hasPro, glow: true)
                AurinProTitle(size: 44, gold: hasPro)
                if let badge {
                    Text(badge).font(.footnote.weight(.semibold))
                        .foregroundStyle(hasPro ? AurinMark.goldTop : Palette.secondary)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background((hasPro ? AurinMark.goldTop : Palette.ink).opacity(0.12), in: Capsule())
                }
                if hasPro, let line = renewal {
                    Text(line).font(Typo.small).foregroundStyle(Palette.muted)
                }
                // The week's coach messages: nothing under 75 %, then one line.
                if let line = status?.coachAllowance?.settingsLine {
                    Text(line).font(Typo.small).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(ProFeature.pro) { feature in
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .top) {
                            Image(systemName: feature.symbol)
                                .scaledFont(16, weight: .medium, cap: .denseCap).foregroundStyle(feature.color)
                                .frame(width: 36, height: 36)
                                .background(feature.color.opacity(0.14), in: Circle())
                            Spacer()
                            if !unlocked {
                                Image(systemName: "lock").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                            }
                        }
                        Spacer(minLength: 14)
                        Text(feature.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, minHeight: 106, alignment: .leading)
                    .cardSurface(cornerRadius: 20)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(feature.title + (unlocked ? "" : ", " + L10n.tr("není v tarifu")))
                }
            }

            if hasPro {
                Button { manage = true } label: {
                    Text("Spravovat předplatné").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Palette.card, in: Capsule())
                }
                .buttonStyle(.plain)
            } else if status != nil {
                VStack(spacing: 14) {
                    HStack(spacing: 10) {
                        ForEach(ProPlans.priced(store)) { plan in
                            Button { Paywall.present(model) } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(plan.title).textCase(.uppercase).font(.caption.weight(.semibold))
                                        .foregroundStyle(plan.best ? AurinMark.amber : Palette.muted)
                                    if let price = plan.price { Text(price).font(.headline).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8) }
                                    if let note = plan.note { Text(note).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(plan.best ? AurinMark.amber.opacity(0.08) : Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(plan.best ? AurinMark.amber : .clear, lineWidth: 1.5) }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Button { Paywall.present(model) } label: {
                        Text("Přejít na Aurin Pro").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            } else if error == nil {
                ProgressView().frame(maxWidth: .infinity)
            }

            HStack(spacing: 14) {
                Link(destination: URL(string: "https://aurin.health/terms")!) {
                    Text("Podmínky a ceny").font(Typo.caption).foregroundStyle(Palette.muted).underline()
                }
                Button {
                    restoring = true
                    Task { notice = await store.restore(); restoring = false; await load() }
                } label: {
                    Text("Obnovit nákup").font(Typo.caption).foregroundStyle(Palette.muted).underline()
                }
                .buttonStyle(.plain)
                .disabled(restoring)
            }
            .frame(maxWidth: .infinity)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
        .manageSubscriptionsSheet(isPresented: $manage)
        .onChange(of: manage) { _, open in if !open { Task { await store.refresh(); await load() } } }
        .alert(L10n.tr("Aurin Pro"), isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(notice ?? "") }
    }

    private var badge: String? {
        guard let status else { return nil }
        if hasPro { return L10n.tr("Aktivní") }
        if status.pilot { return L10n.tr("Pilot · vše zdarma") }
        return nil
    }

    /// "Obnoví se 1. prosince" or "Platí do 1. prosince".
    private var renewal: String? {
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

    static func present(_ model: AppModel) {
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        guard top.view.tag != tag else { return }
        let host = UIHostingController(rootView: AnyView(EmptyView()))
        host.rootView = AnyView(PaywallView(close: { [weak host] in host?.dismiss(animated: true) }).environment(model))
        host.view.tag = tag
        host.modalPresentationStyle = .fullScreen
        top.present(host, animated: true)
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
            Text("Kouč, jídlo z fotky a hodnocení tréninků patří do Aurin Pro. Zápisy, přehledy a plány zůstávají zdarma.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button(action: open) {
                Text("Zobrazit Aurin Pro").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
