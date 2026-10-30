import StoreKit
import SwiftUI

// The offer of Aurin Pro in night violet, as Petr approved it on 29 Oct 2026
// (mockups/paywall/P-cely-paywall-mobil.png and N3): a short opening (night,
// the mark rising as the sun, the readiness ring filling, the coach's good
// morning), then the offer with the app's screens to swipe and the two
// 12-month plans, "View more plans" with all three, and the free week as a
// calendar with the screens to try sliding by. Night violet belongs to the way
// to Pro only (the welcome, the offer, Settings → Aurin Pro); the daily app
// keeps its own colours. The phones show the app's dark screens with the
// sample day. Prices come from the App Store (ProStore), in the buyer's currency.

/// The colours of the way to Pro: night violet with lavender.
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
    var id: String { kind.rawValue }
    var product: String { kind == .monthly ? ProStore.monthlyID : ProStore.yearlyID }

    /// Yearly paid monthly (where the App Store offers it), yearly paid once, monthly.
    @MainActor
    static func all(_ store: ProStore) -> [ProOffer] {
        let yearly = store.price(ProStore.yearlyID) ?? L10n.tr("1 490 Kč")
        let monthly = store.price(ProStore.monthlyID) ?? L10n.tr("199 Kč")
        var plans: [ProOffer] = []
        if let c = store.commitment {
            plans.append(ProOffer(kind: .yearMonthly, title: L10n.tr("Ročně, placeno měsíčně"), price: c.monthly, unit: L10n.tr("/měs."),
                                  note: L10n.f("12 plateb · %@", c.total), trial: store.trialEligible, total: c.total))
        }
        plans.append(ProOffer(kind: .yearOnce, title: L10n.tr("Ročně, placeno najednou"), price: yearly, unit: L10n.tr("/rok"),
                              note: store.perMonth(ProStore.yearlyID).map { L10n.f("%@ měsíčně", $0) } ?? "", trial: store.trialEligible))
        plans.append(ProOffer(kind: .monthly, title: L10n.tr("Měsíčně"), price: monthly, unit: L10n.tr("/měs."),
                              note: L10n.tr("Zrušíš kterýkoli měsíc"), trial: false))
        return plans
    }

    /// The two plans on the offer: the 12-month ones, or yearly and monthly where Apple has no monthly payments.
    @MainActor
    static func main(_ store: ProStore) -> [ProOffer] {
        let plans = all(store)
        return store.commitment != nil ? Array(plans.prefix(2)) : plans
    }

    /// The short name on the offer's cards.
    var cardTitle: String {
        switch kind {
        case .yearMonthly: return L10n.tr("Placeno měsíčně")
        case .yearOnce: return L10n.tr("Placeno najednou")
        case .monthly: return L10n.tr("Měsíčně")
        }
    }

    /// What the first payment is after the free week: "5,99 € měsíčně", "59,99 € ročně".
    var afterTrial: String {
        kind == .yearOnce ? L10n.f("%@ ročně", price) : L10n.f("%@ měsíčně", price)
    }

    /// What Apple asks for by the button (guideline 3.1.2): the price, the
    /// period, what is charged when, that it renews and how cancelling works.
    func terms(trialDays: Bool) -> String {
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
    @State private var demo = AppModel(demo: true)
    /// 0 the opening, 1 the offer, 2 the free week.
    @State private var step: Int
    @State private var plan: ProOffer.Kind = .yearMonthly
    @State private var allPlans = false
    @State private var redeemCode = false
    @State private var notice: String?
    @State private var thanks: String?
    @State private var started = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(close: @escaping () -> Void, frozenTime: Double? = nil, step: Int = 0, store: ProStore = .shared) {
        self.close = close
        self.frozenTime = frozenTime
        self.store = store
        _step = State(initialValue: step)
    }

    private var offers: [ProOffer] { ProOffer.all(store) }
    /// The chosen plan; the first one when Apple has no monthly payments here.
    private var chosen: ProOffer {
        offers.first { $0.kind == plan } ?? offers[0]
    }
    private var withTrial: Bool { chosen.trial }

    var body: some View {
        ZStack {
            Night.background
            clock { time in NightSky(time: time) }.ignoresSafeArea().allowsHitTesting(false)
            switch step {
            case 0:
                clock { time in PaywallIntro(time: time) }
                    .contentShape(Rectangle())
                    .onTapGesture { go(1) }
                    .transition(.opacity)
            case 1:
                offer.transition(.opacity)
            default:
                freeWeek.transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .environment(\.colorScheme, .dark)
        .environment(demo)
        .sheet(isPresented: $allPlans) {
            AllProPlans(offers: offers, selected: $plan, buying: store.purchasing, start: { allPlans = false; next() },
                        redeem: { allPlans = false; redeemCode = true }, restore: restore)
                .presentationDetents([.medium, .large])
                .presentationBackground(Night.bottom)
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
            await store.load()
            if store.commitment == nil, plan == .yearMonthly { plan = .yearOnce }
        }
        .task(id: step) {
            // The opening moves on to the offer by itself.
            guard step == 0, frozenTime == nil else { return }
            if reduceMotion { go(1); return }
            try? await Task.sleep(for: .seconds(PaywallIntro.length))
            if step == 0 { go(1) }
        }
    }

    // MARK: - The offer

    private var offer: some View {
        VStack(spacing: 0) {
            topBar(back: false)
            HStack(spacing: 10) {
                AurinMark(size: 34, glow: true)
                AurinProTitle(size: 34)
            }
            .padding(.top, 2)
            clock { time in ScreenCarousel(time: time) }
                .frame(maxHeight: .infinity)
            if withTrial {
                Text(verbatim: L10n.tr(chosen.kind == .monthly ? "VYZKOUŠEJ 7 DNÍ ZDARMA" : "12MĚSÍČNÍ TARIF · VYZKOUŠEJ 7 DNÍ ZDARMA"))
                    .scaledFont(11, weight: .semibold).tracking(1.2).foregroundStyle(Night.faint)
                    .padding(.bottom, 8)
            }
            HStack(spacing: 10) {
                ForEach(ProOffer.main(store)) { o in
                    OfferCard(offer: o, selected: chosen.kind == o.kind) { plan = o.kind }
                }
            }
            .padding(.horizontal, 20)
            bottom(more: true)
        }
    }

    // MARK: - The free week

    private var freeWeek: some View {
        VStack(spacing: 0) {
            topBar(back: true)
            Text("Tvůj týden zdarma").font(Typo.sentence(36, relativeTo: .largeTitle)).foregroundStyle(Night.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: L10n.f("Celé Aurin Pro zdarma do %@.", Self.weekday(Self.firstPayment(from: today))))
                .font(Typo.sentence(16)).foregroundStyle(Night.muted).padding(.top, 4)
            WeekCalendar(today: today).padding(.horizontal, 20).padding(.top, 20)
            Text("VYZKOUŠEJ TENTO TÝDEN").scaledFont(11, weight: .semibold).tracking(1.2).foregroundStyle(Night.faint)
                .padding(.top, 22).padding(.bottom, 10)
            clock { time in ScreenBelt(time: time) }
                .frame(maxHeight: .infinity, alignment: .top)
            Text(verbatim: L10n.f("Od %@ %@", Self.dayMonth(Self.firstPayment(from: today)), chosen.afterTrial)
                 + (chosen.kind == .yearMonthly ? " · " + L10n.tr("12 měsíců") : ""))
                .font(Typo.small).foregroundStyle(Night.muted).padding(.bottom, 12)
            bottom(more: false)
        }
    }

    private var today: Date {
        frozenTime == nil ? Date() : Self.sampleDay
    }

    /// Thursday 29 Oct 2026 at noon: the snapshot tests' free week, like the mockup.
    static let sampleDay = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 12)) ?? Date()

    // MARK: - Parts

    private func topBar(back: Bool) -> some View {
        HStack {
            if back {
                roundButton("chevron.left", label: L10n.tr("Zpět")) { go(1) }
            }
            Spacer()
            roundButton("xmark", label: L10n.tr("Zavřít"), action: close)
        }
        .padding(.horizontal, 20).padding(.top, 8)
    }

    private func roundButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Night.ink)
                .frame(width: 36, height: 36).background(Night.card, in: Circle())
        }
        .accessibilityLabel(label)
    }

    private func bottom(more: Bool) -> some View {
        VStack(spacing: 8) {
            Button(action: next) {
                ZStack {
                    Text(verbatim: cta).font(Typo.bodyStrong).foregroundStyle(Night.violet).opacity(store.purchasing ? 0 : 1)
                    if store.purchasing { ProgressView().tint(Night.violet) }
                }
                .frame(maxWidth: .infinity).frame(height: 54).background(Night.lavender, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(store.purchasing)
            if more {
                if withTrial {
                    Text(verbatim: L10n.f("Zdarma do %@, pak %@", Self.dayMonth(Self.firstPayment(from: today)), chosen.afterTrial))
                        .font(Typo.small).foregroundStyle(Night.muted)
                }
                Button { allPlans = true } label: {
                    Text("Zobrazit další tarify").font(Typo.bodyStrong).foregroundStyle(Night.lavender)
                }
                .buttonStyle(.plain)
            }
            finePrint
        }
        .padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 10)
    }

    private var finePrint: some View {
        VStack(spacing: 3) {
            Text(verbatim: chosen.terms(trialDays: withTrial)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Link(destination: URL(string: "https://aurin.health/terms")!) { Text("Podmínky").underline() }
                Text(verbatim: "·")
                Link(destination: URL(string: "https://aurin.health/privacy")!) { Text("Soukromí").underline() }
                Text(verbatim: "·")
                Button(action: restore) { Text("Obnovit").underline() }.buttonStyle(.plain)
            }
        }
        .font(.caption2).foregroundStyle(Night.faint)
    }

    private var cta: String {
        L10n.tr(withTrial ? "Začít 7denní zkoušku zdarma" : "Předplatit")
    }

    private func next() {
        if step == 1, withTrial { go(2) } else { buy() }
    }

    private func go(_ next: Int) {
        if reduceMotion { step = next } else { withAnimation(.easeInOut(duration: 0.45)) { step = next } }
        started = Date()
    }

    private func buy() {
        let offer = chosen
        Task {
            do {
                switch try await store.purchase(offer.product, monthly: offer.kind == .yearMonthly) {
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

    /// Seconds since the step opened, frame by frame; still with Reduce Motion.
    @ViewBuilder
    private func clock<V: View>(@ViewBuilder _ content: @escaping (Double) -> V) -> some View {
        if let frozenTime {
            content(frozenTime)
        } else if reduceMotion {
            content(PaywallIntro.length)
        } else {
            TimelineView(.animation) { context in content(context.date.timeIntervalSince(started)) }
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

// MARK: - The opening

/// Night with stars, the mark rising as the sun with its reflection, the
/// readiness ring filling to 78 with the numbers behind it, then the coach's
/// good morning typed out. A function of time, so the tests can stop it anywhere.
struct PaywallIntro: View {
    let time: Double
    static let length = 9.0

    private static let line = L10n.tr("Dobré ráno. Spal jsi 7:12 a HRV je nahoře. Dnes klidně naplno.")

    var body: some View {
        let rise = PaywallIntro.ease((time - 0.6) / 2.4)
        let ring = PaywallIntro.ease((time - 2.6) / 2.0)
        let chips = PaywallIntro.ease((time - 3.6) / 1.0)
        let typed = Int(max(0, (time - 5.2) * 22))
        VStack(spacing: 18) {
            Spacer()
            ZStack {
                Circle().trim(from: 0, to: 0.78 * ring)
                    .stroke(Night.mint, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 250, height: 250)
                    .shadow(color: Night.mint.opacity(0.5), radius: 10)
                AurinMark(size: 190, glow: true)
                    .offset(y: 90 * (1 - rise))
                    .opacity(rise)
                chip("64", L10n.tr("HRV ↑")).offset(x: -95, y: -120)
                chip("7:12", L10n.tr("spánek")).offset(x: 105, y: -78)
                chip("48", L10n.tr("klidový tep")).offset(x: -100, y: 92)
                chip("8.4", L10n.tr("zátěž")).offset(x: 100, y: 130)
            }
            .opacity(1)
            .environment(\.chipShown, chips)
            VStack(spacing: 4) {
                Text(verbatim: "\(Int((78 * ring).rounded()))").font(Typo.number(64)).foregroundStyle(Night.ink)
                Text("PŘIPRAVENOST").scaledFont(12, weight: .semibold).tracking(1.4).foregroundStyle(Night.mint)
            }
            .opacity(ring > 0 ? 1 : 0)
            Text(verbatim: String(Self.line.prefix(typed)))
                .font(Typo.sentence(20)).foregroundStyle(Night.ink)
                .multilineTextAlignment(.center).frame(height: 60, alignment: .top)
                .padding(.horizontal, 36)
            Spacer()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.line)
        .accessibilityHint(L10n.tr("Klepnutím přejdeš na nabídku."))
        .accessibilityAddTraits(.isButton)
    }

    static func ease(_ x: Double) -> Double {
        let x = min(1, max(0, x))
        return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
    }

    private func chip(_ value: String, _ label: String) -> some View {
        ChipView(value: value, label: label)
    }
}

private struct ChipShownKey: EnvironmentKey { static let defaultValue: Double = 1 }
private extension EnvironmentValues {
    var chipShown: Double {
        get { self[ChipShownKey.self] }
        set { self[ChipShownKey.self] = newValue }
    }
}

private struct ChipView: View {
    let value: String
    let label: String
    @Environment(\.chipShown) private var shown

    var body: some View {
        HStack(spacing: 4) {
            Text(verbatim: value).font(Typo.number(20)).foregroundStyle(Night.ink)
            Text(verbatim: label).font(.caption).foregroundStyle(Night.muted)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Night.card, in: Capsule())
        .overlay(Capsule().stroke(Night.line))
        .opacity(shown).scaleEffect(0.9 + 0.1 * shown)
    }
}

/// Slow stars over the whole offer, dimmed to half.
struct NightSky: View {
    let time: Double

    var body: some View {
        Canvas { context, size in
            var seed: UInt64 = 11
            func next() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 33) / Double(1 << 31) }
            for _ in 0..<70 {
                let x = next() * size.width, y = next() * size.height * 0.75, phase = next() * 6, r = 0.4 + next() * 0.8
                let alpha = 0.08 + 0.22 * abs(sin(time * 0.6 + phase))
                context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r * 2, height: r * 2)), with: .color(Night.ink.opacity(alpha)))
            }
        }
    }
}

// MARK: - The app's screens

/// One of the app's screens in a phone, with the sample day.
enum ProScreen: CaseIterable {
    case training, today, food, readiness, sleep, health

    @ViewBuilder
    var content: some View {
        ZStack(alignment: .top) {
            ScreenBackground(glow: glow)
            switch self {
            case .today: TodayContent(today: DemoData.today).padding(.top, 54)
            case .training: TrainingContent(training: DemoData.training).padding(.top, 54)
            case .food: FoodContent(food: DemoData.food).padding(.top, 54)
            case .health: HealthContent(health: DemoData.health).padding(.horizontal, 24).padding(.top, 70)
            case .readiness: ReadinessDetailContent(health: DemoData.health).padding(.horizontal, 24).padding(.top, 70)
            case .sleep: SleepDetailContent(health: DemoData.health, detail: DemoData.night).padding(.horizontal, 24).padding(.top, 70)
            }
        }
        .frame(width: 390, height: 844, alignment: .top)
        .clipped()
    }

    private var glow: Color {
        switch self {
        case .today: return Palette.Glow.today
        case .training: return Palette.Glow.training
        case .food: return Palette.Glow.food
        default: return Palette.Glow.health
        }
    }

    var title: String {
        switch self {
        case .training: return L10n.tr("Tréninky postavené na dnešek")
        case .today: return L10n.tr("Plán, který jde s tvým tělem")
        case .food: return L10n.tr("Jídlo, které kouč dopočítá")
        case .readiness: return L10n.tr("Víš, kdy přidat")
        case .sleep: return L10n.tr("Spánek, který chystá zítřek")
        case .health: return L10n.tr("Všechna data na jednom místě")
        }
    }

    var subtitle: String {
        switch self {
        case .training: return L10n.tr("Podle tvého času a unavených svalů.")
        case .today: return L10n.tr("Každý den vysvětlený podle připravenosti.")
        case .food: return L10n.tr("Vyfoť talíř nebo etiketu, hodnoty doplní AI.")
        case .readiness: return L10n.tr("HRV, spánek a zátěž v jednom čísle.")
        case .sleep: return L10n.tr("Kolik spánku potřebuješ po dnešní zátěži.")
        case .health: return L10n.tr("Z hodinek bez přepisování.")
        }
    }

    /// The short name under a phone in the free week's belt.
    var label: String {
        switch self {
        case .training: return L10n.tr("Tréninky")
        case .today: return L10n.tr("Připravenost")
        case .food: return L10n.tr("Jídelní kouč")
        case .readiness: return L10n.tr("Regenerace")
        case .sleep: return L10n.tr("Spánek")
        case .health: return L10n.tr("Zdraví")
        }
    }
}

/// The offer's phones: the middle one large, its neighbours dimmed beside
/// it; they move on by themselves every 2.5 s and can be swiped.
struct ScreenCarousel: View {
    let time: Double
    static let screens: [ProScreen] = [.training, .today, .food, .readiness, .sleep]
    @State private var chosen: Int?
    @State private var shownAt: Double = 0

    var body: some View {
        let automatic = Int(time / 2.5) % Self.screens.count
        let index = chosen ?? automatic
        let screen = Self.screens[index]
        VStack(spacing: 10) {
            GeometryReader { geo in
                let height = max(160, geo.size.height)
                ZStack {
                    ForEach([-1, 1], id: \.self) { side in
                        let other = Self.screens[(index + side + Self.screens.count) % Self.screens.count]
                        PhoneMockup(height: height * 0.78) { other.content }
                            .opacity(0.35)
                            .offset(x: CGFloat(side) * height * 0.48)
                    }
                    PhoneMockup(height: height) { screen.content }
                        .id(index)
                        .transition(.opacity)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .animation(.easeInOut(duration: 0.5), value: index)
            }
            .padding(.top, 10)
            .gesture(DragGesture(minimumDistance: 20).onEnded { value in
                let step = value.translation.width < 0 ? 1 : -1
                chosen = (index + step + Self.screens.count) % Self.screens.count
            })
            VStack(spacing: 3) {
                Text(verbatim: screen.title).font(Typo.sentence(19)).foregroundStyle(Night.ink)
                Text(verbatim: screen.subtitle).font(Typo.small).foregroundStyle(Night.muted)
            }
            .multilineTextAlignment(.center).padding(.horizontal, 24)
            .accessibilityElement(children: .combine)
            HStack(spacing: 6) {
                ForEach(Self.screens.indices, id: \.self) { i in
                    Capsule().fill(i == index ? Night.lavender : Night.line).frame(width: i == index ? 18 : 6, height: 6)
                }
            }
            .padding(.bottom, 12)
            .accessibilityHidden(true)
        }
    }
}

/// The free week's belt: small phones of the app sliding by, round and round.
struct ScreenBelt: View {
    let time: Double
    static let screens: [ProScreen] = [.today, .training, .food, .readiness, .sleep, .health]
    private static let width: CGFloat = 92

    var body: some View {
        let step = Self.width + 14
        let span = step * CGFloat(Self.screens.count)
        let shift = (CGFloat(time) * 36).truncatingRemainder(dividingBy: span)
        HStack(alignment: .top, spacing: 14) {
            ForEach(0..<(Self.screens.count * 2), id: \.self) { i in
                let screen = Self.screens[i % Self.screens.count]
                VStack(spacing: 6) {
                    PhoneMockup(height: Self.width * 844 / 390) { screen.content }
                    Text(verbatim: screen.label).font(.caption2).foregroundStyle(Night.muted)
                }
            }
        }
        .offset(x: -shift)
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
        .drawingGroup()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.screens.map(\.label).joined(separator: ", "))
    }
}

// MARK: - The plans

/// A plan on the offer: "7 DAYS FREE" above, the price large, the selection mark.
struct OfferCard: View {
    let offer: ProOffer
    let selected: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(verbatim: offer.cardTitle).font(.subheadline.weight(.medium))
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                        .scaledFont(20, cap: .denseCap)
                        .foregroundStyle(selected ? Night.violet : Night.faint)
                }
                (Text(verbatim: offer.price).font(Typo.number(30)) + Text(verbatim: offer.unit).font(.caption))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(verbatim: offer.note).font(.caption2).opacity(0.7).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(selected ? Night.violet : Night.ink)
            .padding(14).padding(.top, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? Night.lavender : Night.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(selected ? .clear : Night.line))
            .overlay(alignment: .topLeading) {
                if offer.trial {
                    Text("7 DNÍ ZDARMA").scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(Night.bottom)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Night.mint, in: Capsule())
                        .offset(x: 10, y: -9)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "View more plans": all three plans, redeeming a code and restoring.
struct AllProPlans: View {
    let offers: [ProOffer]
    @Binding var selected: ProOffer.Kind
    let buying: Bool
    let start: () -> Void
    let redeem: () -> Void
    let restore: () -> Void

    private var chosen: ProOffer? { offers.first { $0.kind == selected } }

    var body: some View {
        VStack(spacing: 12) {
            Text("Všechny tarify").font(Typo.sentence(30, relativeTo: .largeTitle)).foregroundStyle(Night.ink)
                .padding(.top, 24).padding(.bottom, 4)
            ForEach(offers) { o in
                Button { selected = o.kind } label: {
                    HStack(spacing: 12) {
                        Image(systemName: selected == o.kind ? "checkmark.circle.fill" : "circle")
                            .scaledFont(22, cap: .denseCap).foregroundStyle(selected == o.kind ? Night.violet : Night.faint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: o.title).font(.subheadline.weight(.medium))
                            Text(verbatim: o.note).font(.caption).opacity(0.7)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            (Text(verbatim: o.price).font(Typo.number(24)) + Text(verbatim: o.unit).font(.caption2))
                            if o.trial {
                                Text("7 DNÍ ZDARMA").scaledFont(9, weight: .bold, cap: .denseCap).foregroundStyle(selected == o.kind ? Night.violet : Night.mint)
                            }
                        }
                    }
                    .foregroundStyle(selected == o.kind ? Night.violet : Night.ink)
                    .padding(14)
                    .background(selected == o.kind ? Night.lavender : Night.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(selected == o.kind ? .clear : Night.line))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected == o.kind ? .isSelected : [])
            }
            Button(action: start) {
                Text(verbatim: L10n.tr(chosen?.trial == true ? "Začít 7denní zkoušku zdarma" : "Předplatit"))
                    .font(Typo.bodyStrong).foregroundStyle(Night.violet)
                    .frame(maxWidth: .infinity).frame(height: 54).background(Night.lavender, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(buying)
            .padding(.top, 4)
            HStack(spacing: 22) {
                Button(action: redeem) { Text("Uplatnit promo kód") }
                Button(action: restore) { Text("Obnovit nákup") }
            }
            .font(Typo.bodyStrong).foregroundStyle(Night.lavender).buttonStyle(.plain)
            if let chosen {
                Text(verbatim: chosen.terms(trialDays: chosen.trial)).font(.caption2).foregroundStyle(Night.faint)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .environment(\.colorScheme, .dark)
    }
}

// MARK: - The free week's calendar

/// Today and the next six days: today free, a bell on day 5 (the reminder),
/// a line under them running to the first payment on day 8.
struct WeekCalendar: View {
    let today: Date
    var calendar: Calendar = .current

    var body: some View {
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: calendar.startOfDay(for: today)) }
        VStack(spacing: 12) {
            HStack(spacing: 0) {
                ForEach(days.indices, id: \.self) { i in
                    VStack(spacing: 6) {
                        Text(verbatim: i == 0 ? L10n.tr("DNES") : days[i].formatted(.dateTime.weekday(.abbreviated).locale(L10n.locale)).uppercased())
                            .scaledFont(10, weight: .semibold, cap: .denseCap)
                            .foregroundStyle(i == 0 ? Night.mint : Night.faint)
                        ZStack {
                            Circle().fill(i == 0 ? Night.mint : Night.card)
                            if i == 4 {
                                Circle().stroke(Night.amber, lineWidth: 1.5)
                                Image(systemName: "bell.fill").scaledFont(13, cap: .denseCap).foregroundStyle(Night.amber)
                            } else {
                                Text(verbatim: "\(calendar.component(.day, from: days[i]))").font(.subheadline.weight(.medium))
                                    .foregroundStyle(i == 0 ? Night.bottom : Night.ink)
                            }
                        }
                        .frame(width: 36, height: 36)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Capsule().fill(LinearGradient(colors: [Night.mint, Night.lavender, Night.amber], startPoint: .leading, endPoint: .trailing))
                .frame(height: 4).padding(.horizontal, 6)
            HStack {
                Text("Zdarma").foregroundStyle(Night.mint)
                Spacer()
                Text("Připomínka").foregroundStyle(Night.amber)
                Spacer()
                Text(verbatim: PaywallView.weekday(PaywallView.firstPayment(from: today, calendar: calendar))).foregroundStyle(Night.lavender)
            }
            .font(.caption.weight(.medium)).padding(.horizontal, 6)
        }
        .padding(16)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Night.line))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Dnes zdarma, připomínka za 4 dny, první platba %@.", PaywallView.weekday(PaywallView.firstPayment(from: today, calendar: calendar))))
    }
}
