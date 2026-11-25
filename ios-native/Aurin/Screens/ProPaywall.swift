import StoreKit
import SwiftUI

// The offer of Aurin Pro in the app's own look (the Pro concept, Petr
// 13-15 Nov 2026; night violet went with it): "Train with a coach that knows
// you" over one phone with the app's demo, the coach first, and Continue that
// skips it any time; then the same headline over what Pro brings, scrolling by
// itself, two plans, the button and what Apple asks for under it. Prices come
// from the App Store (ProStore), in the buyer's currency.

/// Night violet: Settings → Aurin Pro with Pro or in the pilot, until it moves to the app's look too.
enum Night {
    static let top = Color(red: 0.165, green: 0.153, blue: 0.290)
    static let bottom = Color(red: 0.086, green: 0.078, blue: 0.137)
    static let card = Color.white.opacity(0.07)
    static let line = Color.white.opacity(0.14)
    static let ink = Color(red: 0.965, green: 0.957, blue: 0.988)
    static let muted = Color(red: 0.965, green: 0.957, blue: 0.988).opacity(0.62)
    static let faint = Color(red: 0.965, green: 0.957, blue: 0.988).opacity(0.42)
    static let lavender = Color(red: 0.882, green: 0.867, blue: 0.976)
    static let violet = Color(red: 0.333, green: 0.302, blue: 0.588)
    static let mint = Color(red: 0.561, green: 0.902, blue: 0.769)
    static let amber = Color(red: 0.949, green: 0.706, blue: 0.420)
    /// The sparkle of what Pro adds.
    static let lilac = Color(red: 0.647, green: 0.631, blue: 1.0)

    static var background: some View {
        LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
    }
}

/// One plan of the offer, with the App Store's prices.
struct ProOffer: Identifiable, Equatable {
    enum Kind: String { case yearMonthly, yearOnce, monthly }
    let kind: Kind
    let title: String
    let price: String
    let unit: String
    let note: String
    let trial: Bool
    /// The 12 payments together (yearly paid monthly).
    var total: String? = nil
    /// What this plan saves against paying monthly, in whole percent; nil for monthly.
    var save: Int? = nil
    /// The yearly price a month ("124 Kč"), for the yearly plan's card.
    var perMonth: String? = nil
    var id: String { kind.rawValue }
    var product: String { kind == .monthly ? ProStore.monthlyID : ProStore.yearlyID }

    /// The price before the App Store answers (no signal, still loading): no
    /// fixed Czech price for a buyer in another country, and nothing to buy yet.
    static let unpriced = "–"
    var priced: Bool { price != Self.unpriced }

    /// Yearly paid monthly (where the App Store offers it), yearly paid once, monthly.
    /// The snapshot tests, without the App Store, show the fixed Czech prices.
    @MainActor
    static func all(_ store: ProStore) -> [ProOffer] {
        let fixed = ProStore.hostsUnitTests
        return plans(yearly: store.price(ProStore.yearlyID) ?? (fixed ? L10n.tr("1 490 Kč") : unpriced),
                     monthly: store.price(ProStore.monthlyID) ?? (fixed ? L10n.tr("199 Kč") : unpriced),
                     perMonth: store.perMonth(ProStore.yearlyID), commitment: store.commitment,
                     trial: store.trialEligible)
    }

    /// The plans from the shown prices; what each saves against paying monthly
    /// comes from the numbers in them (ProStore.number, whatever the phone's locale).
    static func plans(yearly: String, monthly: String, perMonth: String?, commitment: ProStore.Commitment?,
                      trial: Bool) -> [ProOffer] {
        let amount = ProStore.number
        let month = amount(monthly)
        var plans: [ProOffer] = []
        if let c = commitment {
            plans.append(ProOffer(kind: .yearMonthly, title: L10n.tr("Ročně, placeno měsíčně"), price: c.monthly, unit: L10n.tr("/měs."),
                                  note: L10n.f("12 plateb, celkem %@", c.total), trial: trial, total: c.total,
                                  save: saving(amount(c.monthly), months: 1, against: month)))
        }
        plans.append(ProOffer(kind: .yearOnce, title: L10n.tr("Ročně, placeno najednou"), price: yearly, unit: L10n.tr("/rok"),
                              note: perMonth.map { L10n.f("%@ měsíčně", $0) } ?? "", trial: trial,
                              save: saving(amount(yearly), months: 12, against: month), perMonth: perMonth))
        plans.append(ProOffer(kind: .monthly, title: L10n.tr("Měsíčně"), price: monthly, unit: L10n.tr("/měs."),
                              note: L10n.tr("Zrušíš kterýkoli měsíc"), trial: false))
        return plans
    }

    /// What `price` for `months` saves against paying `monthly` for as many months,
    /// in whole percent rounded down, so the label never promises more than the
    /// prices give (monetization review, 4 Nov 2026): 149 against 199 is 25,
    /// 1 490 against 12 × 199 is 37 (37.6), $59.99 against 12 × $6.99 is 28.
    /// Nil when it saves nothing, a price has no number or the saving is beyond
    /// belief (over 90 %: a price read wrong, never a label).
    static func saving(_ price: Decimal?, months: Int, against monthly: Decimal?) -> Int? {
        guard let price, let monthly, monthly > 0, price > 0 else { return nil }
        let full = monthly * Decimal(months)
        var share = (full - price) / full * 100, whole = Decimal()
        NSDecimalRound(&whole, &share, 0, .down)
        let percent = NSDecimalNumber(decimal: whole).intValue
        return (1...90).contains(percent) ? percent : nil
    }

    /// The two plans on the offer: the 12-month ones, or yearly and monthly where Apple has no monthly payments.
    @MainActor
    static func main(_ store: ProStore) -> [ProOffer] {
        let plans = all(store)
        return store.commitment != nil ? Array(plans.prefix(2)) : plans
    }

    /// What Apple asks for by the button (guideline 3.1.2): the price, the
    /// period, what is charged when, that it renews and how cancelling works.
    func terms(trialDays: Bool) -> String {
        guard priced else { return L10n.tr("Načítám ceny z App Store…") }
        switch kind {
        case .yearMonthly:
            let start = trialDays ? L10n.tr("Dnes se nic neúčtuje. Po 7 dnech ") : ""
            return start + L10n.f("%@ měsíčně po 12 měsíců (%@). Obnovuje se každých 12 měsíců, dokud ho nezrušíš; zrušení zastaví obnovení, platby za rok běží dál.", price, total ?? "")
        case .yearOnce:
            let start = trialDays ? L10n.tr("Dnes se nic neúčtuje. Po 7 dnech ") : ""
            return start + L10n.f("%@ ročně. Obnovuje se automaticky, zrušíš kdykoli.", price)
        case .monthly:
            return L10n.f("%@ měsíčně. Obnovuje se automaticky, zrušíš kdykoli.", price)
        }
    }
}

struct PaywallView: View {
    let close: () -> Void
    /// A fixed moment instead of the clock (the snapshot tests).
    var frozenTime: Double? = nil
    let store: ProStore
    /// Opened once at the end of the setup (SetupProOffer) with the AI features
    /// still off: the note says the coach needs them and the button allows them too.
    let allowAI: (() async throws -> Void)?
    @State private var demo = AppModel(demo: true)
    /// 0 the demo in the phone, 1 the offer.
    @State private var step: Int
    @State private var plan: ProOffer.Kind = .yearMonthly
    @State private var allPlans = false
    @State private var redeemCode = false
    @State private var notice: String?
    @State private var thanks: String?
    @State private var started = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Opened from an "Unlock with Pro" (Paywall.present with `from`): where it
    /// stood on screen. The pill goes to Continue, the rest comes in around it.
    var source: CGRect? = nil
    /// The Aurin age orb: the phone grows out of it (Pro concept, entry 3).
    var orb: CGRect? = nil
    @State private var arrived = true
    @State private var continueFrame: CGRect = .zero
    @State private var phoneFrame: CGRect = .zero

    init(close: @escaping () -> Void, frozenTime: Double? = nil, step: Int = 0, store: ProStore = .shared,
         allowAI: (() async throws -> Void)? = nil, source: CGRect? = nil, orb: CGRect? = nil) {
        self.close = close
        self.frozenTime = frozenTime
        self.store = store
        self.allowAI = allowAI
        self.source = source
        self.orb = orb
        _step = State(initialValue: step)
        _arrived = State(initialValue: source == nil)
    }

    private var offers: [ProOffer] { ProOffer.all(store) }
    /// The chosen plan; the first one when Apple has no monthly payments here.
    private var chosen: ProOffer {
        offers.first { $0.kind == plan } ?? offers[0]
    }
    private var withTrial: Bool { chosen.trial }

    var body: some View {
        ZStack {
            // From an "Unlock with Pro" the page under it fades out as this comes in.
            ScreenBackground(glow: Palette.Glow.today).opacity(arrived ? 1 : 0)
            VStack(spacing: 0) {
                topBar.opacity(arrived ? 1 : 0)
                // The heading gathers out of a blur, as the concept's grains.
                Text("Trénuj s koučem, který tě zná")
                    .font(Typo.heading(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).padding(.horizontal, 24).padding(.top, 14)
                    .accessibilityAddTraits(.isHeader)
                    .blur(radius: arrived ? 0 : 14).opacity(arrived ? 1 : 0).scaleEffect(arrived ? 1 : 1.08)
                let demoShown = step == 0 && (!reduceMotion || frozenTime != nil)
                if demoShown {
                    // The end of the demo: the phone gets smaller and goes (Pro concept).
                    demoPhone
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { if source != nil, !arrivedSettled { phoneFrame = $0 } }
                        .scaleEffect(arrived ? 1 : 0.35, anchor: phoneAnchor)
                        .opacity(arrived ? 1 : 0)
                        .transition(.asymmetric(insertion: .opacity, removal: .scale(scale: 0.3).combined(with: .opacity)))
                } else {
                    ProFeatureList(frozen: frozenTime != nil)
                        .frame(minHeight: 120, maxHeight: .infinity)
                        .transition(.opacity.animation(.easeOut(duration: 0.4).delay(0.2)))
                    // The plans come in as the list settles.
                    offer.transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity).animation(.easeOut(duration: 0.45).delay(0.35)),
                                                 removal: .opacity))
                }
                // One button: Continue becomes the purchase where it stands (Pro concept).
                button(demoShown ? L10n.tr("Pokračovat") : cta, busy: !demoShown && store.purchasing) { if demoShown { go(1) } else { buy() } }
                    .disabled(!demoShown && (store.purchasing || !chosen.priced))
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { continueFrame = $0 }
                    .opacity(arrived ? 1 : 0)
                    .padding(.horizontal, 16).padding(.bottom, demoShown ? 10 : 0)
                if !demoShown {
                    finePrint.padding(.horizontal, 16).padding(.bottom, 6)
                        .transition(.opacity.animation(.easeOut(duration: 0.3).delay(0.4)))
                }
            }
        }
        .overlay { if source != nil && !arrivedSettled { travellingPill } }
        .task(id: "arrive") { await arrive() }
        .environment(demo)
        // Opened from UIKit too (Paywall.present), so the app's cap is set here: the button always fits.
        .dynamicTypeSize(...DynamicTypeSize.screenCap)
        .sheet(isPresented: $allPlans) {
            AllProPlans(offers: offers, selected: $plan, buying: store.purchasing || !chosen.priced, start: { allPlans = false; buy() },
                        redeem: { allPlans = false; redeemCode = true }, restore: restore)
                .presentationDetents([.large])
                .presentationBackground(Palette.background)
        }
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
        .task {
            // Reduce Motion: no demo, the offer at once (D-PRO-6).
            if reduceMotion, frozenTime == nil { step = 1 }
            await store.load()
            if store.commitment == nil, plan == .yearMonthly { plan = .yearOnce }
        }
    }

    // MARK: - The demo

    /// One conversation with the coach in a loop (Pro concept, Petr 2026-11-14:
    /// the demo always starts at the coach): a half marathon and its plan, the
    /// plan in Training, food after the run by photo, then how to tell it works,
    /// with Aurin age. Continue skips it any time (D-PRO-6).
    private var demoPhone: some View {
        clock { time in
            let now = ProScreen.at(time)
            GeometryReader { geo in
                PhoneMockup(height: max(200, geo.size.height - 24)) {
                    ProScreenPage(screen: now.screen, scroll: frozenTime == nil ? now.progress : 0)
                }
                .id(now.screen.page)
                .transition(.opacity)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .animation(.easeInOut(duration: 0.5), value: now.screen.page)
            .animation(.snappy, value: now.screen)
        }
        .padding(.top, 18).padding(.bottom, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Ukázka aplikace"))
    }

    // MARK: - The way in

    @State private var arrivedSettled = false

    /// The phone grows from the orb (Aurin age) or from the pill (a subpage).
    private var phoneAnchor: UnitPoint {
        guard let from = orb ?? source, phoneFrame.width > 0, phoneFrame.height > 0 else { return .bottom }
        // In the phone's own bounds; outside 0...1 when the orb is above it.
        return UnitPoint(x: (from.midX - phoneFrame.minX) / phoneFrame.width, y: (from.midY - phoneFrame.minY) / phoneFrame.height)
    }

    /// "Unlock with Pro" travelling down from where it was tapped, widening into
    /// Continue and taking its ink (Pro concept, entries 2 and 3).
    private var travellingPill: some View {
        let from = source ?? .zero
        let to = continueFrame == .zero ? from : continueFrame
        let box = arrived ? to : from
        return ZStack {
            Capsule().fill(arrived ? Palette.ink : Palette.card)
                .shadow(color: .black.opacity(arrived ? 0 : 0.12), radius: 10, y: 4)
            Label { Text("Odemknout s Pro") } icon: { Image(systemName: "lock.fill").scaledFont(12, weight: .semibold) }
                .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                .opacity(arrived ? 0 : 1)
            Text("Pokračovat").font(Typo.bodyStrong).foregroundStyle(Palette.background)
                .opacity(arrived ? 1 : 0)
        }
        .frame(width: box.width, height: box.height)
        .position(x: box.midX, y: box.midY)
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Plays the way in once the button has its place, then hands over to it.
    private func arrive() async {
        guard source != nil, !arrived else { return }
        // Until Continue has its place (at most about half a second).
        for _ in 0..<30 where continueFrame == .zero { try? await Task.sleep(for: .milliseconds(16)) }
        withMotion(.smooth(duration: 0.7)) { arrived = true }
        try? await Task.sleep(for: .milliseconds(720))
        arrivedSettled = true
        started = Date()
    }

    // MARK: - The offer

    private var offer: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(ProOffer.main(store)) { o in
                    OfferPlanCard(offer: o, selected: chosen.kind == o.kind) { plan = o.kind }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            if allowAI != nil { aiNote }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 10)
    }

    /// What allowing the AI features sends where, in the words of the setup's AI
    /// point (AI_CONSENT_VERSION in src/consent.js), shortened.
    private var aiNote: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Aurin Pro potřebuje AI").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
            Text("Kouč, jídlo z fotky a hodnocení pošlou potřebné údaje, včetně zdravotních a fotek, které pošleš, společnosti OpenAI v USA, a to i každý den kvůli shrnutí kouče a v noci kvůli jeho paměti. Vypneš to kdykoli v Nastavení → Soukromí a data.")
                .font(.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .cardSurface(cornerRadius: 14)
        .accessibilityElement(children: .combine)
    }

    /// What Apple asks for by the button (3.1.2, Schedule 2 3.8(b)): the price, the
    /// renewal and how cancelling works, Terms, Privacy and Restore (D-PRO-1).
    private var finePrint: some View {
        VStack(spacing: 0) {
            Text(verbatim: chosen.terms(trialDays: withTrial)).font(.caption2).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            // Not at the end of the setup: the sheet's button would allow the AI without saying so.
            if allowAI == nil {
            Button { allPlans = true } label: {
                Text("Zobrazit všechny tarify").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            }
            HStack(spacing: 18) {
                Link(destination: L10n.legalURL("terms")) { Text("Podmínky").underline().frame(minHeight: 44) }
                Link(destination: L10n.legalURL("privacy")) { Text("Soukromí").underline().frame(minHeight: 44) }
                Button(action: restore) { Text("Obnovit").underline().frame(minHeight: 44) }.buttonStyle(.plain)
            }
            .font(.caption2).foregroundStyle(Palette.muted)
            .padding(.top, -8)
        }
    }

    private var cta: String {
        // At the end of the setup the purchase also allows the AI features, so the button says so whatever the plan.
        if allowAI != nil { return L10n.tr(withTrial ? "Povolit AI a začít týden zdarma" : "Povolit AI a předplatit") }
        return L10n.tr(withTrial ? "Vyzkoušet 7 dní zdarma" : "Získej Aurin Pro")
    }

    // MARK: - Parts

    /// ✕ on the left takes you back where you came from; ⋯ has the promo code and restore (Petr, D-PRO-2).
    private var topBar: some View {
        HStack {
            roundButton("xmark", label: L10n.tr("Zavřít"), action: close)
            Spacer()
            Menu {
                Button("Uplatnit promo kód") { redeemCode = true }
                Button("Obnovit nákup", action: restore)
            } label: {
                Image(systemName: "ellipsis").scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                    .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                    .frame(width: 44, height: 44).contentShape(Circle())
            }
            .accessibilityLabel(L10n.tr("Další možnosti"))
        }
        .padding(.horizontal, 12).padding(.top, 4)
    }

    private func roundButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                .frame(width: 44, height: 44).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// The ink button across the width, as Continue and the purchase.
    private func button(_ title: String, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.background).opacity(busy ? 0 : 1)
                    .contentTransition(.opacity)
                if busy { ProgressView().tint(Palette.background) }
            }
            .frame(maxWidth: .infinity).frame(minHeight: 54).background(Palette.ink, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func go(_ next: Int) {
        if reduceMotion { step = next } else { withMotion(.easeInOut(duration: 0.45)) { step = next } }
        started = Date()
    }

    private func buy() {
        let offer = chosen
        Task {
            do {
                switch try await store.purchase(offer.product, monthly: offer.kind == .yearMonthly) {
                case .purchased(let trial):
                    // The button said so; should it fail, the thanks says where to turn AI on.
                    if let allowAI, (try? await allowAI()) == nil {
                        thanks = L10n.tr(trial ? "Týden zdarma začal. AI se nepodařilo zapnout, zapneš ji v Nastavení → Soukromí a data."
                                         : "Aurin Pro je aktivní. AI se nepodařilo zapnout, zapneš ji v Nastavení → Soukromí a data.")
                    } else {
                        thanks = L10n.tr(trial ? "Týden zdarma začal. Kouč, jídlo z fotky a hodnocení jsou odemčené." : "Aurin Pro je aktivní. Díky!")
                    }
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

    /// Seconds since the step opened, frame by frame (a few times a second is enough
    /// for the phone); still with Reduce Motion or in the tests.
    @ViewBuilder
    private func clock<V: View>(@ViewBuilder _ content: @escaping (Double) -> V) -> some View {
        if let frozenTime {
            content(frozenTime)
        } else if reduceMotion {
            content(0)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in content(context.date.timeIntervalSince(started)) }
        }
    }

    // MARK: - Dates

    /// The free week ends after 7 days: the first payment is on the eighth.
    static func firstPayment(from day: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: day)) ?? day
    }

    /// "5. 11." / "5 Nov".
    static func dayMonth(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).locale(L10n.locale))
    }

    /// "čtvrtka" is too hard to inflect; the short weekday and date: "čt 5. 11." / "Thu 5 Nov".
    static func weekday(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(L10n.locale))
    }
}

// MARK: - The app's screens

/// One of the app's screens in a phone, with the sample day: the coach's chat
/// with its first `chat` messages, or a page it opens.
enum ProScreen: Equatable {
    case chat(Int), plan, training, food, age

    /// The script, a screen and its seconds; the chat grows one message at a time.
    static let script: [(screen: ProScreen, seconds: Double)] = [
        (.chat(0), 1.6), (.chat(1), 1.3), (.chat(2), 3.0), (.plan, 3.0), (.training, 3.0),
        (.chat(3), 1.3), (.chat(4), 3.0), (.food, 3.0),
        (.chat(5), 1.3), (.chat(6), 3.0), (.age, 3.4)
    ]

    /// The screen `time` seconds in, looping, and how far through it (0 to 1).
    static func at(_ time: Double) -> (screen: ProScreen, progress: Double) {
        let total = script.reduce(0) { $0 + $1.seconds }
        var left = max(0, time).truncatingRemainder(dividingBy: total)
        for step in script {
            if left < step.seconds { return (step.screen, left / step.seconds) }
            left -= step.seconds
        }
        return (script[0].screen, 0)
    }

    /// The page it is on: the chat stays one page while it grows.
    var page: Int {
        switch self {
        case .chat: return 0
        case .plan: return 1
        case .training: return 2
        case .food: return 3
        case .age: return 4
        }
    }

    /// The screen's page without its background, as tall as it is in the app.
    @ViewBuilder
    fileprivate var view: some View {
        switch self {
        case .chat(let shown): ProCoachScript(shown: shown)
        case .plan: ProPlanSample().padding(.horizontal, 24).padding(.top, 70)
        case .training: TrainingContent(training: DemoData.training).padding(.top, 54)
        case .food: FoodContent(food: DemoData.food).padding(.top, 54)
        case .age: ProAgeSample().padding(.horizontal, 20).padding(.top, 70)
        }
    }

    fileprivate var glow: Color {
        switch self {
        case .chat: return Palette.Glow.today
        case .plan, .training: return Palette.Glow.training
        case .food: return Palette.Glow.food
        case .age: return Palette.Glow.health
        }
    }
}

/// A phone's screen: the page at its full height, as in the app's scroll view,
/// scrolled down by `scroll` (0 the top, 1 its end) under a still background.
struct ProScreenPage: View {
    let screen: ProScreen
    var scroll: Double = 0
    @State private var height: CGFloat = 844

    var body: some View {
        ZStack(alignment: .top) {
            ScreenBackground(glow: screen.glow)
            screen.view
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                .offset(y: -max(0, height - 844) * scroll)
        }
        .frame(width: 390, height: 844, alignment: .top)
        .clipped()
    }
}

/// The coach's chat of the demo, `shown` messages in: the greeting, then the
/// questions and answers at the bottom over the field, as in the chat.
struct ProCoachScript: View {
    let shown: Int

    private static let messages: [(mine: Bool, text: String)] = [
        (true, "Zvládnu půlmaraton za 1:45?"),
        (false, "Na Pražský půlmaraton je 1:45 reálný cíl. Upravil jsem ti plán: dva tempové běhy týdně a sobotní dlouhý běh."),
        (true, "Co sníst po běhu?"),
        (false, "Do hodiny bílkoviny se sacharidy, třeba kuře s rýží. Vyfoť oběd a zapíšu ho za tebe."),
        (true, "Jak poznám, že to funguje?"),
        (false, "Podle Aurin age. Za posledních 12 týdnů klesá, nejvíc díky kondici.")
    ]

    var body: some View {
        VStack(spacing: 0) {
            Text(verbatim: L10n.tr("Kouč").uppercased(with: Fmt.locale))
                .font(.caption.weight(.semibold)).tracking(1.6).foregroundStyle(Palette.ink)
                .padding(.top, 66)
            if shown < 3 {
                VStack(spacing: 10) {
                    TwoLights(size: 64)
                    Text("Dobré ráno.").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Text("Na co se chceš zeptat?").font(Typo.body).foregroundStyle(Palette.muted)
                }
                .padding(.top, 70)
                .transition(.opacity)
            }
            Spacer(minLength: 0)
            VStack(spacing: 12) {
                // The last three: older ones have scrolled away under the top.
                ForEach(Array(Self.messages.prefix(shown).enumerated()).suffix(3), id: \.offset) { index, message in
                    VStack(spacing: 8) {
                        BubbleView(bubble: CoachView.Bubble(mine: message.mine, text: L10n.tr(message.text)), decide: { _, _ in })
                        if index == 1 { card("flag.fill", DemoData.training.event?.name ?? L10n.tr("Půlmaraton"), L10n.tr("Plán upravený")) }
                        if index == 3 { card("camera.fill", L10n.tr("Kuře s rýží"), L10n.tr("asi 640 kcal, přidáno k obědu")) }
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 16)
            field.padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 40)
        }
        .frame(width: 390, height: 844)
        .clipped()
        // A sample in a capped page: the bubbles stay at the page's size.
        .environment(\.fullTypeSize, nil)
    }

    /// What the answer did: the plan, the meal.
    private func card(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).scaledFont(14, weight: .semibold).foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36).background(Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .cardSurface(cornerRadius: 18)
    }

    private var field: some View {
        HStack {
            Text("Napiš kouči").font(Typo.body).foregroundStyle(Palette.faint)
            Spacer()
            Image(systemName: "arrow.up").scaledFont(13, weight: .bold).foregroundStyle(Palette.onButton)
                .frame(width: 30, height: 30).background(Palette.faint, in: Circle())
        }
        .padding(.leading, 18).padding(.trailing, 8).frame(height: 48)
        .background(Palette.card, in: Capsule())
    }
}

/// Aurin age on the sample day: its 12 weeks and what shapes it.
struct ProAgeSample: View {
    var body: some View {
        if let age = DemoData.health.aurinAge {
            VStack(alignment: .leading, spacing: 16) {
                AurinAgeTrendCard(age: age)
                AurinAgeShapes(age: age)
            }
        }
    }
}

/// The sample day's race and the weeks' load: what a plan for a race looks like.
struct ProPlanSample: View {
    var body: some View {
        let training = DemoData.training
        VStack(alignment: .leading, spacing: 0) {
            if let event = training.event { EventCard(event: event) }
            WeekStrainBars(days: training.days).padding(.top, 22)
        }
    }
}

// MARK: - What Pro brings

/// The offer's list (Petr's texts, 13 Nov 2026, and the approved icons): what
/// Pro adds, then "also included" and what Aurin has for everyone, so it shows
/// how much comes with it. It scrolls by itself in a loop (like Bevel's); a
/// finger takes over and it stays where it is left. Reduce Motion: a plain list.
struct ProFeatureList: View {
    /// The snapshot test: still, from the top.
    var frozen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var manual = false
    @State private var started = Date()
    @State private var height: CGFloat = 0
    /// Where the loop was when a finger took over, as a share of the list.
    @State private var pausedAt: CGFloat = 0

    struct Row: Hashable {
        let icon: String
        let title: String
        let line: String
    }

    static let pro = [
        Row(icon: "intelligence", title: "Aurin Intelligence", line: "Seznam se s koučem, který zná tvoje data."),
        Row(icon: "plans", title: "Adaptivní plány tréninku", line: "Řiď se plánem postaveným kolem tvých cílů."),
        Row(icon: "nutrition", title: "Chytrý zápis jídla", line: "Zapiš jídlo z jedné fotky."),
        Row(icon: "age", title: "Aurin Age", line: "Zjisti svůj kondiční věk."),
        Row(icon: "insights", title: "Kouč u tvých čísel", line: "Odpovědi přímo u tvých čísel."),
        Row(icon: "gym", title: "Tréninky pro tvoji posilovnu", line: "Přesně pro to, co tvoje posilovna má.")
    ]
    /// Free for everyone; the food row says only what Free has (D-PRO-4).
    static let free = [
        Row(icon: "readiness", title: "Znej svoji připravenost", line: "Každé ráno víš, jak moc přidat."),
        Row(icon: "sleep", title: "Rozuměj svému spánku", line: "Odhal, co ovlivňuje tvoje noci."),
        Row(icon: "fitness", title: "Pokročilé metriky kondice", line: "Měř svůj pokrok týden po týdnu."),
        Row(icon: "health", title: "Health monitor", line: "Sleduj signály svého těla."),
        Row(icon: "workouts", title: "Tréninky s průvodcem", line: "Každý trénink krok za krokem."),
        Row(icon: "foodlog", title: "Sleduj svoji výživu", line: "Zapisuj jídlo a plň svoje cíle."),
        Row(icon: "journal", title: "Buduj lepší návyky", line: "Zjisti, co opravdu pomáhá tvé regeneraci."),
        Row(icon: "cycle", title: "Přehled cyklu", line: "Zmapuj každou fázi a její vzorce.")
    ]

    /// Points a second.
    private static let speed = 22.0

    var body: some View {
        Group {
            if manual || reduceMotion || voiceOver || frozen {
                ScrollViewReader { proxy in
                    ScrollView { list.padding(.vertical, 12) }
                        .scrollIndicators(.hidden)
                        // The hand starts where the loop was, not at the top.
                        .onAppear { if pausedAt > 0 { proxy.scrollTo(Self.rowAt(pausedAt), anchor: .top) } }
                }
            } else {
                GeometryReader { _ in
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                        let shift = height > 0 ? CGFloat(context.date.timeIntervalSince(started) * Self.speed).truncatingRemainder(dividingBy: height) : 0
                        VStack(spacing: 0) {
                            list.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                            list.accessibilityHidden(true)
                        }
                        .offset(y: 12 - shift)
                    }
                }
                .clipped()
                .contentShape(Rectangle())
                // A finger takes over: the same list, still, to scroll by hand.
                .gesture(DragGesture(minimumDistance: 4).onChanged { _ in takeOver() })
                .onTapGesture { takeOver() }
            }
        }
        .mask {
            LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.05),
                                   .init(color: .black, location: 0.9), .init(color: .clear, location: 1)],
                           startPoint: .top, endPoint: .bottom)
        }
        .accessibilityElement(children: .contain)
    }

    private func takeOver() {
        guard !manual else { return }
        if height > 0 { pausedAt = CGFloat(Date().timeIntervalSince(started) * Self.speed).truncatingRemainder(dividingBy: height) / height }
        manual = true
    }

    /// The row about `share` of the way down the list (rows are near the same height).
    static func rowAt(_ share: CGFloat) -> String {
        let rows = pro + free
        return rows[min(rows.count - 1, max(0, Int(share * CGFloat(rows.count + 1))))].title
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Self.pro, id: \.self) { row($0) }
            Text("také v ceně").font(.subheadline).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .accessibilityAddTraits(.isHeader)
            ForEach(Self.free, id: \.self) { row($0) }
        }
        .padding(.horizontal, 24)
        // The loop's seam: room before the Pro rows come round again.
        .padding(.bottom, 40)
    }

    private func row(_ row: Row) -> some View {
        HStack(spacing: 20) {
            ProIcon(name: row.icon, size: 50)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(row.title)).font(.headline).foregroundStyle(Palette.ink)
                Text(verbatim: L10n.tr(row.line)).font(.subheadline).foregroundStyle(Palette.muted)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .id(row.title)
    }
}

// MARK: - The plans

/// A plan on the offer: the name, the price a month or a year, and the total or
/// the price a month under it; the chosen one outlined (D-PRO-3: the year paid
/// monthly says it is a year).
struct OfferPlanCard: View {
    let offer: ProOffer
    let selected: Bool
    let choose: () -> Void

    private var name: String {
        switch offer.kind {
        case .yearMonthly: return L10n.tr("Ročně, placeno měsíčně")
        case .yearOnce: return L10n.tr("Na rok")
        case .monthly: return L10n.tr("Měsíčně")
        }
    }

    private var lines: (String, String?) {
        switch offer.kind {
        case .yearMonthly: return (L10n.f("%@ měsíčně", offer.price), offer.total.map { L10n.f("%@ celkem", $0) })
        case .yearOnce: return (L10n.f("%@ ročně", offer.price), offer.perMonth.map { L10n.f("%@ měsíčně", $0) })
        case .monthly: return (L10n.f("%@ měsíčně", offer.price), offer.note)
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        Button(action: choose) {
            VStack(spacing: 3) {
                Text(verbatim: name).font(.subheadline.weight(.semibold))
                Text(verbatim: lines.0).font(.headline)
                if let second = lines.1 { Text(verbatim: second).font(.caption).foregroundStyle(Palette.muted) }
            }
            .foregroundStyle(Palette.ink)
            .multilineTextAlignment(.center)
            .lineLimit(2).minimumScaleFactor(0.8)
            .padding(.horizontal, 8).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Palette.card, in: shape)
            .overlay(shape.strokeBorder(selected ? Palette.ink : Palette.hairline, lineWidth: selected ? 1.5 : 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "View more plans", like Bevel's (variant 8c, Petr 4 Nov 2026): what Pro
/// includes on top (App Store 3.1.2(c): say what the price buys), then two plans
/// side by side over the button with what each saves against paying monthly
/// (never "Most popular", which we could not back), and where the App Store has
/// the year paid monthly, the month without commitment as a small row under them.
/// In the US and Singapore (no year paid monthly) the two cards are yearly and monthly.
struct AllProPlans: View {
    let offers: [ProOffer]
    @Binding var selected: ProOffer.Kind
    let buying: Bool
    let start: () -> Void
    let redeem: () -> Void
    let restore: () -> Void
    @Environment(\.dismiss) private var dismiss

    /// The chosen plan; the yearly one while the year paid monthly is chosen where it isn't sold (the US, before the offer resets it).
    private var chosen: ProOffer? { offers.first { $0.kind == selected } ?? offers.first { $0.kind == .yearOnce } }
    /// The two cards: the 12-month plans where the year can be paid monthly, else yearly and monthly.
    private var cards: [ProOffer] { offers.count > 2 ? offers.filter { $0.kind != .monthly } : offers }
    /// The month without commitment under the cards, when it is not one of them.
    private var extra: ProOffer? { offers.count > 2 ? offers.first { $0.kind == .monthly } : nil }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                            .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                            .frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                }
                .padding(.top, 16)
                Text("Všechny tarify").font(Typo.heading(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                includedList.padding(.top, 18)
                HStack(alignment: .top, spacing: 10) {
                    ForEach(cards) { o in
                        PlanCard(offer: o, selected: chosen?.kind == o.kind) { selected = o.kind }
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 30)
                if let extra {
                    monthlyRow(extra).padding(.top, 12)
                }
                Button(action: start) {
                    Text(verbatim: L10n.tr(chosen?.trial == true ? "Začít 7denní zkoušku zdarma" : "Předplatit"))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.background)
                        .frame(maxWidth: .infinity).frame(minHeight: 54).background(Palette.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(buying)
                .padding(.top, 18)
                HStack(spacing: 22) {
                    Button(action: redeem) { Text("Uplatnit promo kód") }
                    Button(action: restore) { Text("Obnovit nákup") }
                }
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink).buttonStyle(.plain)
                .padding(.top, 14)
                if let chosen {
                    Text(verbatim: chosen.terms(trialDays: chosen.trial)).font(.caption2).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                }
                HStack(spacing: 16) {
                    Link(destination: L10n.legalURL("terms")) { Text("Podmínky").underline() }
                    Link(destination: L10n.legalURL("privacy")) { Text("Soukromí").underline() }
                }
                .font(.caption2).foregroundStyle(Palette.muted).padding(.top, 3).padding(.bottom, 16)
            }
            .padding(.horizontal, 20)
        }
        .scrollBounceBehavior(.basedOnSize)
        // Half-width cards: the price stays whole up to the size the app's screens stop at.
        .dynamicTypeSize(...DynamicTypeSize.screenCap)
    }

    /// "V PRO JE" and the offer's Pro rows, with their icons.
    private var includedList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("V PRO JE").scaledFont(11, weight: .semibold).tracking(1.2).foregroundStyle(Palette.muted)
                .padding(.bottom, 4)
            ForEach(ProFeatureList.pro, id: \.self) { row in
                HStack(spacing: 12) {
                    ProIcon(name: row.icon, size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: L10n.tr(row.title)).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                        Text(verbatim: L10n.tr(row.line)).font(.caption).foregroundStyle(Palette.muted)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 6)
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "Měsíčně, zrušíš kterýkoli měsíc  199 Kč/měs.": a small row, selectable like a card.
    private func monthlyRow(_ o: ProOffer) -> some View {
        let on = selected == o.kind
        return Button { selected = o.kind } label: {
            HStack(spacing: 8) {
                (Text(verbatim: o.title).font(.subheadline.weight(.medium))
                 + Text(verbatim: ", " + L10n.tr("zrušíš kterýkoli měsíc")).font(.subheadline).foregroundStyle(Palette.muted))
                Spacer(minLength: 4)
                (Text(verbatim: o.price).font(Typo.number(18)) + Text(verbatim: o.unit).font(.caption2))
                    .lineLimit(1).fixedSize()
            }
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(on ? Palette.ink : Palette.hairline, lineWidth: on ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A plan in "View more plans": "UŠETŘÍŠ 25 %" on its top edge, the name and the
/// selection mark, the price large and two short lines (12 payments and the
/// total; the yearly price a month).
struct PlanCard: View {
    let offer: ProOffer
    let selected: Bool
    let choose: () -> Void

    /// The two lines under the price.
    var lines: [String] {
        switch offer.kind {
        case .yearMonthly: return [L10n.tr("12 plateb"), offer.total.map { L10n.f("%@ celkem", $0) }].compactMap { $0 }
        case .yearOnce: return offer.perMonth.map { [L10n.f("%@/měs.", $0), L10n.tr("v přepočtu")] } ?? []
        case .monthly: return [offer.note]
        }
    }

    /// The name on the card: "Platíš měsíčně" (the year paid monthly), "Ročně", "Měsíčně".
    var name: String {
        switch offer.kind {
        case .yearMonthly: return L10n.tr("Platíš měsíčně")
        case .yearOnce: return L10n.tr("Ročně")
        case .monthly: return L10n.tr("Měsíčně")
        }
    }

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: name).font(.subheadline.weight(.medium)).lineLimit(2).minimumScaleFactor(0.8)
                    Spacer(minLength: 4)
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .scaledFont(18, cap: .denseCap)
                        .foregroundStyle(selected ? Palette.ink : Palette.muted)
                }
                (Text(verbatim: offer.price).font(Typo.number(24)) + Text(verbatim: offer.unit).font(.caption))
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .padding(.top, 8)
                VStack(alignment: .leading, spacing: 1) {
                    // Wrap, never cut: the 12 months' total must show whole (App Store 3.1.2).
                    ForEach(lines, id: \.self) { Text(verbatim: $0).fixedSize(horizontal: false, vertical: true) }
                }
                .font(.caption).opacity(0.85).padding(.top, 4)
            }
            .foregroundStyle(Palette.ink)
            // Room under the SAVE pill on the card's top edge, also with large text.
            .padding(.horizontal, 12).padding(.top, 22).padding(.bottom, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(selected ? Palette.ink : Palette.hairline, lineWidth: selected ? 1.5 : 1))
            .overlay(alignment: .topLeading) {
                if let save = offer.save {
                    Text(verbatim: L10n.f("UŠETŘÍŠ %d %%", save)).scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(Palette.background)
                        .lineLimit(1).fixedSize()
                        .padding(.horizontal, 9).padding(.vertical, 3)
                        .background(Palette.green, in: Capsule())
                        .offset(x: 12, y: -9)
                        .accessibilityLabel(L10n.f("Ušetříš %d %% proti měsíčnímu tarifu", save))
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
