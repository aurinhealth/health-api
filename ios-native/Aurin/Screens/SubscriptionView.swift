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
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
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
                                .font(.system(size: 16, weight: .medium)).foregroundStyle(feature.color)
                                .frame(width: 36, height: 36)
                                .background(feature.color.opacity(0.14), in: Circle())
                            Spacer()
                            if !unlocked {
                                Image(systemName: "lock").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
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
                                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(plan.best ? AurinMark.amber : .clear, lineWidth: 1.5))
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

struct PaywallView: View {
    let close: () -> Void
    /// A fixed moment of the tour instead of the clock (the snapshot tests).
    var frozenTime: Double? = nil
    let store: ProStore
    @State private var demo = AppModel(demo: true)
    /// 0 the app playing in the phone, 1 what Pro brings and the plans, 2 how
    /// the free week goes (yearly with the free week only).
    @State private var step = 0
    @State private var plan = "annual"
    /// The free week, on the yearly plan for whoever can still have it.
    @State private var trial = true
    @State private var allPlans = false
    @State private var redeemCode = false
    @State private var notice: String?
    /// Bought: says so, then the offer closes.
    @State private var thanks: String?
    @State private var started = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(close: @escaping () -> Void, frozenTime: Double? = nil, step: Int = 0, store: ProStore = .shared) {
        self.close = close
        self.frozenTime = frozenTime
        self.store = store
        _step = State(initialValue: step)
    }

    /// The switch shows only when the yearly plan would start with the free week.
    private var offersTrial: Bool { plan == "annual" && store.trialEligible }
    private var withTrial: Bool { offersTrial && trial }

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            RadialGradient(colors: [Palette.indigo.opacity(0.35), .clear], center: .bottom, startRadius: 10, endRadius: 520).ignoresSafeArea()
            clock { time in Sparkles(time: time) }.ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack {
                    if step == 2 {
                        Button { go(1) } label: {
                            Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                                .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                        }
                        .accessibilityLabel("Zpět")
                    } else {
                        Button(action: close) {
                            Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                                .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                        }
                        .accessibilityLabel("Zavřít")
                    }
                    Spacer()
                    Menu {
                        Button("Všechny tarify") { allPlans = true }
                        Button("Uplatnit promo kód") { redeemCode = true }
                        Button("Obnovit nákup") { restore() }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                    }
                    .accessibilityLabel("Další možnosti")
                }
                .padding(.horizontal, 20).padding(.top, 8)

                Text(verbatim: L10n.tr(step == 2 ? "Jak funguje týden zdarma" : "Začni naplno s Aurin Pro"))
                    .font(.system(size: 28, weight: .bold)).multilineTextAlignment(.center).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 24).padding(.top, 12)

                ZStack {
                    if step == 0 {
                        GeometryReader { geo in
                            clock { time in
                                PhoneMockup(height: max(200, geo.size.height - 40)) { AppTour(time: time) }
                            }
                            .environment(demo)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.94)))
                    } else if step == 1 {
                        features.transition(.opacity)
                    } else {
                        freeWeek.transition(.opacity)
                    }
                }
                .frame(maxHeight: .infinity)

                VStack(spacing: 10) {
                    if step == 1 {
                        HStack(spacing: 10) {
                            ForEach(ProPlans.priced(store)) { p in PlanCard(plan: p, selected: plan == p.id) { plan = p.id } }
                        }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        if offersTrial {
                            Toggle(isOn: $trial) {
                                Text("Týden zdarma").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            }
                            .toggleStyle(AurinToggleStyle())
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .transition(.opacity)
                        }
                    }
                    Button(action: next) {
                        ZStack {
                            Text(verbatim: cta).font(Typo.bodyStrong).foregroundStyle(Palette.onButton).opacity(store.purchasing ? 0 : 1)
                            if store.purchasing { ProgressView().tint(Palette.onButton) }
                        }
                        .frame(maxWidth: .infinity).frame(height: 54).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.purchasing)
                    if step > 0 { renewalTerms }
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: offersTrial)
            }
        }
        .sheet(isPresented: $allPlans) { AllPlansSheet(selected: $plan, store: store) }
        // Apple's own sheet for an offer code; what it redeems comes through Transaction.updates (ProStore).
        .offerCodeRedemption(isPresented: $redeemCode) { result in
            if case .failure(let error) = result { notice = error.localizedDescription }
            Task { await store.refresh() }
        }
        .alert(L10n.tr("Aurin Pro"), isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(notice ?? "") }
        .alert(L10n.tr("Aurin Pro"), isPresented: Binding(get: { thanks != nil }, set: { if !$0 { thanks = nil } })) {
            Button("OK", role: .cancel) { close() }
        } message: { Text(thanks ?? "") }
        .task { await store.load() }
    }

    private var cta: String {
        switch step {
        case 0: return L10n.tr("Pokračovat")
        case 1: return L10n.tr(withTrial ? "Vyzkoušet týden zdarma" : "Předplatit")
        default: return L10n.tr("Začít týden zdarma")
        }
    }

    private func next() {
        switch step {
        case 0: go(1)
        case 1: if withTrial { go(2) } else { buy() }
        default: buy()
        }
    }

    private func go(_ next: Int) {
        if reduceMotion { step = next } else { withAnimation(.easeInOut(duration: 0.4)) { step = next } }
        started = Date()
    }

    private func buy() {
        let id = plan == "annual" ? ProStore.yearlyID : ProStore.monthlyID
        Task {
            do {
                switch try await store.purchase(id) {
                case .purchased(let trial):
                    thanks = L10n.tr(trial ? "Týden zdarma začal. Kouč, jídlo z fotky a hodnocení jsou odemčené." : "Aurin Pro je aktivní. Díky!")
                case .pending:
                    notice = L10n.tr("Nákup čeká na schválení. Až ho App Store potvrdí, Aurin Pro se odemkne sám.")
                case .cancelled:
                    break
                }
            } catch {
                notice = error.localizedDescription
            }
        }
    }

    private func restore() {
        Task { notice = await store.restore() }
    }

    /// What Apple asks for by the button (guideline 3.1.2): the price, the
    /// period, that it renews by itself and can be cancelled, the terms, the
    /// privacy policy and restoring a purchase. The yearly plan starts with
    /// the free week whenever the App Store offers it, switch or not.
    private var renewalTerms: some View {
        let yearly = ProPlans.price("annual", store)
        let line = plan == "annual"
            ? (store.trialEligible ? L10n.f("7 dní zdarma, poté %@ ročně. Obnovuje se automaticky, zrušíš kdykoli.", yearly)
                                   : L10n.f("%@ ročně. Obnovuje se automaticky, zrušíš kdykoli.", yearly))
            : L10n.f("%@ měsíčně. Obnovuje se automaticky, zrušíš kdykoli.", ProPlans.price("monthly", store))
        return VStack(spacing: 3) {
            Text(verbatim: line).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Link(destination: URL(string: "https://aurin.health/terms")!) { Text("Podmínky").underline() }
                Text(verbatim: "·")
                Link(destination: URL(string: "https://aurin.health/privacy")!) { Text("Soukromí").underline() }
                Text(verbatim: "·")
                Button(action: restore) { Text("Obnovit").underline() }.buttonStyle(.plain)
            }
        }
        .font(.caption2).foregroundStyle(Palette.faint)
    }

    /// Seconds since the page (or its step) opened, frame by frame;
    /// still with Reduce Motion.
    @ViewBuilder
    private func clock<V: View>(@ViewBuilder _ content: @escaping (Double) -> V) -> some View {
        if let frozenTime {
            content(frozenTime)
        } else if reduceMotion {
            content(0.6)
        } else {
            TimelineView(.animation) { context in content(context.date.timeIntervalSince(started)) }
        }
    }

    /// What Pro brings, sliding slowly upwards round and round like Bevel's.
    private var features: some View {
        clock { time in
            FeatureMarquee(offset: reduceMotion ? 0 : CGFloat(max(0, time - 0.8)) * 22)
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.08), .init(color: .black, location: 0.88), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
    }

    /// The free week as a timeline: today, the reminder on day 5, the first
    /// payment on day 7. The rows rise in one after another.
    private var freeWeek: some View {
        let rows: [(Color, String, String, String)] = [
            (Palette.green, "checkmark", L10n.tr("Dnes"), L10n.tr("Odemkne se kouč, jídlo z fotky a hodnocení tréninků.")),
            (Palette.amberBar, "bell.fill", L10n.tr("Den 5"), L10n.tr("Připomeneme ti, že týden zdarma končí.")),
            (Palette.indigo, "sparkles", L10n.tr("Den 7"), L10n.f("Začne roční předplatné za %@. Do té doby ho zrušíš jedním klepnutím.", ProPlans.price("annual", store)))
        ]
        return clock { time in
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows.indices, id: \.self) { i in
                    let shown = reduceMotion ? 1 : min(1, max(0, (time - Double(i) * 0.15) / 0.5))
                    FreeWeekRow(color: rows[i].0, symbol: rows[i].1, title: rows[i].2, text: rows[i].3, next: i + 1 < rows.count ? rows[i + 1].0 : nil)
                        .opacity(shown).offset(y: 10 * (1 - shown))
                }
            }
            .padding(.horizontal, 30).padding(.top, 30)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }
}

/// A day of the free week: its coloured icon, a line down to the next day.
struct FreeWeekRow: View {
    let color: Color
    let symbol: String
    let title: String
    let text: String
    let next: Color?

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: symbol).font(.system(size: 17, weight: .bold)).foregroundStyle(Palette.onAccent)
                .frame(width: 44, height: 44).background(color, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.ink)
                Text(text).font(.subheadline).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
        .background(alignment: .topLeading) {
            if let next {
                LinearGradient(colors: [color, next], startPoint: .top, endPoint: .bottom)
                    .frame(width: 3).frame(maxHeight: .infinity)
                    .padding(.top, 44).padding(.leading, 20.5)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The two lists one after the other, twice, so the slide never runs out.
struct FeatureMarquee: View {
    let offset: CGFloat
    @State private var height: CGFloat = 0

    var body: some View {
        GeometryReader { _ in
            VStack(spacing: 0) {
                list.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                list.accessibilityHidden(true)
            }
            .padding(.horizontal, 24)
            .offset(y: 20 - (height > 0 ? offset.truncatingRemainder(dividingBy: height) : 0))
        }
        .clipped()
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(ProFeature.pro) { FeatureLine(feature: $0) }
            HStack {
                Rectangle().fill(Palette.hairline).frame(height: 1)
                Text("také obsahuje").font(Typo.caption).foregroundStyle(Palette.faint).fixedSize()
                Rectangle().fill(Palette.hairline).frame(height: 1)
            }
            ForEach(ProFeature.included) { FeatureLine(feature: $0) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 32)
    }
}

/// Specks of light drifting up behind the offer.
struct Sparkles: View {
    let time: Double

    var body: some View {
        Canvas { context, size in
            var seed: UInt64 = 7
            func next() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 33) / Double(1 << 31) }
            for _ in 0..<60 {
                let x = next() * size.width, y0 = next() * size.height, phase = next() * 6, r = 0.6 + next() * 0.9
                let y = (y0 - (time * 7 + phase * 40)).truncatingRemainder(dividingBy: size.height)
                let alpha = 0.12 + 0.4 * abs(sin(time * 0.8 + phase))
                context.fill(Path(ellipseIn: CGRect(x: x, y: y < 0 ? y + size.height : y, width: r * 2, height: r * 2)), with: .color(Palette.ink.opacity(alpha)))
            }
        }
    }
}

/// The app using itself in the phone on the offer: Today, a tap on
/// Připravenost and back, the tabs one after another, a tap on sleep. Drawn
/// from the real screens with the sample data, as a function of time, so it
/// runs frame by frame and the tests can stop it anywhere.
struct AppTour: View {
    let time: Double

    static let length = 16.4
    private static let width: CGFloat = 390
    private static let tabY: CGFloat = 772

    enum Screen { case today, readiness, training, food, health, sleep }
    enum Move { case push, pop, tab }

    struct Shot {
        let screen: Screen
        let tab: AppTab
        let start: Double
        let move: Move
        /// The page's scroll at moments of the shot, eased in between.
        let scroll: [(Double, CGFloat)]
        /// The finger that ends the shot.
        var tap: (Double, CGPoint)? = nil
    }

    static let shots: [Shot] = [
        Shot(screen: .today, tab: .today, start: 0, move: .tab, scroll: [(0, 0)], tap: (1.15, CGPoint(x: 110, y: 290))),
        Shot(screen: .readiness, tab: .today, start: 1.35, move: .push, scroll: [(1.9, 0), (3.4, 360)], tap: (3.65, CGPoint(x: 42, y: 88))),
        Shot(screen: .today, tab: .today, start: 3.85, move: .pop, scroll: [(4.3, 0), (5.9, 560)], tap: (6.1, CGPoint(x: 125, y: tabY))),
        Shot(screen: .training, tab: .training, start: 6.3, move: .tab, scroll: [(6.6, 0), (8.5, 700)], tap: (8.75, CGPoint(x: 265, y: tabY))),
        Shot(screen: .food, tab: .food, start: 8.95, move: .tab, scroll: [(9.3, 0), (11.0, 620)], tap: (11.25, CGPoint(x: 335, y: tabY))),
        Shot(screen: .health, tab: .health, start: 11.45, move: .tab, scroll: [(11.5, 0), (12.3, 140)], tap: (12.55, CGPoint(x: 195, y: 320))),
        Shot(screen: .sleep, tab: .health, start: 12.75, move: .push, scroll: [(13.3, 0), (15.6, 520)])
    ]

    var body: some View {
        let looped = time.truncatingRemainder(dividingBy: Self.length)
        let index = Self.shots.lastIndex { $0.start <= looped } ?? 0
        let shot = Self.shots[index]
        // The loop starts again on Today with a fade from the sleep page.
        let previous: Shot? = index > 0 ? Self.shots[index - 1] : (time >= Self.length ? Self.shots.last : nil)
        let p = Self.ease((looped - shot.start) / 0.42)
        let w = Self.width

        ZStack(alignment: .top) {
            if let previous, p < 1 {
                switch shot.move {
                case .push:
                    page(previous, at: looped).offset(x: -w * 0.3 * p).overlay(Color.black.opacity(0.25 * p))
                    page(shot, at: looped).offset(x: w * (1 - p)).shadow(color: .black.opacity(0.25), radius: 12)
                case .pop:
                    page(shot, at: looped).offset(x: -w * 0.3 * (1 - p)).overlay(Color.black.opacity(0.25 * (1 - p)))
                    page(previous, at: looped).offset(x: w * p).shadow(color: .black.opacity(0.25), radius: 12)
                case .tab:
                    page(previous, at: looped).opacity(1 - p)
                    page(shot, at: looped).opacity(p)
                }
            } else {
                page(shot, at: looped)
            }

            LinearGradient(colors: [Palette.background, Palette.background.opacity(0)], startPoint: .top, endPoint: .bottom)
                .frame(height: 56)
            statusBar

            TabBar(tab: .constant(shot.tab), onAdd: {})
                .padding(.horizontal, 20)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 42)

            ForEach(Array(Self.shots.enumerated()), id: \.offset) { _, s in
                if let tap = s.tap {
                    let q = (looped - tap.0) / 0.4
                    if q > 0, q < 1 {
                        Circle().fill(Palette.ink.opacity(0.3 * (1 - q)))
                            .frame(width: 54, height: 54)
                            .scaleEffect(0.5 + 0.7 * q)
                            .position(tap.1)
                    }
                }
            }
        }
        .frame(width: w, height: 844, alignment: .top)
        .clipped()
    }

    private var statusBar: some View {
        HStack {
            Text(verbatim: "9:41").font(.system(size: 16, weight: .semibold))
            Spacer()
            HStack(spacing: 5) {
                Image(systemName: "cellularbars")
                Image(systemName: "wifi")
                Image(systemName: "battery.100")
            }
            .font(.system(size: 14, weight: .semibold))
        }
        .foregroundStyle(Palette.ink)
        .padding(.horizontal, 34).padding(.top, 18)
    }

    @ViewBuilder
    private func page(_ shot: Shot, at time: Double) -> some View {
        ZStack(alignment: .top) {
            ScreenBackground(glow: Self.glow(shot.screen))
            content(shot.screen)
                .frame(width: Self.width, alignment: .top)
                .offset(y: -Self.scroll(shot.scroll, at: time))
        }
        .frame(width: Self.width, height: 844, alignment: .top)
        .clipped()
    }

    @ViewBuilder
    private func content(_ screen: Screen) -> some View {
        switch screen {
        case .today: TodayContent(today: DemoData.today).padding(.top, 54)
        case .readiness: detail { ReadinessDetailContent(health: DemoData.health) }
        case .training: TrainingContent(training: DemoData.training).padding(.top, 54)
        case .food: FoodContent(food: DemoData.food).padding(.top, 54)
        case .health: HealthContent(health: DemoData.health).padding(.horizontal, 24).padding(.top, 70)
        case .sleep: detail { SleepDetailContent(health: DemoData.health, detail: DemoData.night) }
        }
    }

    /// DetailScreen's column without its scroll view.
    private func detail<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CircleButton(systemImage: "chevron.left", label: L10n.tr("Zpět"))
            content()
        }
        .padding(.horizontal, 24)
        .padding(.top, 70)
    }

    private static func glow(_ screen: Screen) -> Color {
        switch screen {
        case .today: return Palette.Glow.today
        case .training: return Palette.Glow.training
        case .food: return Palette.Glow.food
        default: return Palette.Glow.health
        }
    }

    static func ease(_ x: Double) -> Double {
        let x = min(1, max(0, x))
        return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
    }

    static func scroll(_ keys: [(Double, CGFloat)], at time: Double) -> CGFloat {
        guard let first = keys.first else { return 0 }
        if time <= first.0 { return first.1 }
        for (a, b) in zip(keys, keys.dropFirst()) where time < b.0 {
            return a.1 + (b.1 - a.1) * CGFloat(ease((time - a.0) / (b.0 - a.0)))
        }
        return keys.last?.1 ?? 0
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
            .overlay(RoundedRectangle(cornerRadius: 56 * scale + bezel, style: .continuous).stroke(Palette.ink.opacity(0.22), lineWidth: 1.5))
            .shadow(color: Palette.indigo.opacity(0.35), radius: 30)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

struct FeatureLine: View {
    let feature: ProFeature

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: feature.symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Palette.onAccent)
                .frame(width: 42, height: 42)
                .background(feature.color, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(feature.title).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(feature.subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct PlanCard: View {
    let plan: ProPlans.Plan
    let selected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(plan.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Palette.ink : Palette.faint)
                }
                Text(plan.price ?? L10n.tr("cena bude oznámena")).font(.headline).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let note = plan.note { Text(note).font(.caption2).foregroundStyle(Palette.muted) }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(selected ? Palette.ink.opacity(0.6) : Palette.hairline, lineWidth: selected ? 1.5 : 1))
            .overlay(alignment: .top) {
                if plan.best {
                    Text("Nejvýhodnější").font(.caption2.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Palette.button, in: Capsule())
                        .offset(y: -10)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "Všechny tarify" from the ⋯ menu.
struct AllPlansSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selected: String
    var store: ProStore = .shared

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                }
                .accessibilityLabel("Zavřít")
                Spacer()
            }
            ForEach(ProPlans.priced(store)) { p in PlanCard(plan: p, selected: selected == p.id) { selected = p.id } }
            Button { dismiss() } label: {
                Text("Pokračovat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 52).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .padding(20)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
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
