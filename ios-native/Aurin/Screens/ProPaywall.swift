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
                                  note: L10n.f("12 plateb · %@", c.total), trial: trial, total: c.total,
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
    /// Opened on the free week at the end of the setup (SetupProOffer): no way
    /// back to the plans, and "Teď ne" across the whole width under the button.
    let notNow: Bool
    /// The account has not allowed the AI features yet (the setup's free week):
    /// the free week says the coach needs them and its button allows them too.
    let allowAI: (() async throws -> Void)?
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

    init(close: @escaping () -> Void, frozenTime: Double? = nil, step: Int = 0, store: ProStore = .shared, notNow: Bool = false,
         allowAI: (() async throws -> Void)? = nil) {
        self.close = close
        self.frozenTime = frozenTime
        self.store = store
        self.notNow = notNow
        self.allowAI = allowAI
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
            AllProPlans(offers: offers, selected: $plan, buying: store.purchasing || !chosen.priced, start: { allPlans = false; next() },
                        redeem: { allPlans = false; redeemCode = true }, restore: restore)
                .presentationDetents([.large])
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
            carouselClock { time in ScreenCarousel(time: time) }
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
            topBar(back: !notNow)
            Text("Tvůj týden zdarma").font(Typo.sentence(36, relativeTo: .largeTitle)).foregroundStyle(Night.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: L10n.f("Celé Aurin Pro zdarma do %@", Self.dayMonth(Self.firstPayment(from: today))))
                .font(Typo.sentence(16)).foregroundStyle(Night.muted).padding(.top, 4)
            WeekCalendar(today: today).padding(.horizontal, 20).padding(.top, 20)
            // With the AI note the belt's heading gives way, so the price line still fits on a 6.1" phone.
            if allowAI == nil {
                Text("VYZKOUŠEJ TENTO TÝDEN").scaledFont(11, weight: .semibold).tracking(1.2).foregroundStyle(Night.faint)
                    .padding(.top, 22).padding(.bottom, 10)
            }
            clock { time in ScreenBelt(time: time) }
                .padding(.top, allowAI == nil ? 0 : 18)
                .frame(maxHeight: .infinity, alignment: .top)
            if allowAI != nil { aiNote.padding(.horizontal, 20).padding(.bottom, 10) }
            Text(verbatim: L10n.f("Od %@ %@", Self.dayMonth(Self.firstPayment(from: today)), chosen.afterTrial)
                 + (chosen.kind == .yearMonthly ? " · " + L10n.tr("12 měsíců") : ""))
                .font(Typo.small).foregroundStyle(Night.muted).padding(.bottom, 12)
            bottom(more: false)
        }
    }

    /// What allowing the AI features sends where, in the words of the setup's AI
    /// point (AI_CONSENT_VERSION in src/consent.js), shortened.
    private var aiNote: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Aurin Pro potřebuje AI").font(.footnote.weight(.semibold)).foregroundStyle(Night.amber)
            Text("Kouč, jídlo z fotky a hodnocení pošlou potřebné údaje, včetně zdravotních a fotek, které pošleš, společnosti OpenAI v USA, a to i každý den kvůli shrnutí kouče a v noci kvůli jeho paměti. Vypneš to kdykoli v Nastavení → Soukromí a data.")
                .font(.caption).foregroundStyle(Night.muted).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Night.amber.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Night.amber.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        .accessibilityElement(children: .combine)
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
            .disabled(store.purchasing || !chosen.priced)
            if notNow && !more {
                Button(action: close) {
                    Text("Teď ne").font(Typo.bodyStrong).foregroundStyle(Night.ink)
                        .frame(maxWidth: .infinity).frame(height: 54)
                        .overlay { Capsule().stroke(Night.ink.opacity(0.25), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(store.purchasing)
            }
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
                Link(destination: L10n.legalURL("terms")) { Text("Podmínky").underline() }
                Text(verbatim: "·")
                Link(destination: L10n.legalURL("privacy")) { Text("Soukromí").underline() }
                Text(verbatim: "·")
                Button(action: restore) { Text("Obnovit").underline() }.buttonStyle(.plain)
            }
        }
        .font(.caption2).foregroundStyle(Night.faint)
    }

    private var cta: String {
        if step == 2, allowAI != nil { return L10n.tr("Povolit AI a začít týden zdarma") }
        return L10n.tr(withTrial ? "Začít 7denní zkoušku zdarma" : "Předplatit")
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
                    // The button said so; should it fail, the thanks says where to turn AI on.
                    if let allowAI, (try? await allowAI()) == nil {
                        thanks = L10n.tr("Týden zdarma začal. AI se nepodařilo zapnout, zapneš ji v Nastavení → Soukromí a data.")
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

    /// Seconds since the step opened, frame by frame; still with Reduce Motion.
    @ViewBuilder
    private func clock<V: View>(@ViewBuilder _ content: @escaping (Double) -> V) -> some View {
        if let frozenTime {
            content(frozenTime)
        } else if reduceMotion {
            content(PaywallIntro.length)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in content(context.date.timeIntervalSince(started)) }
        }
    }

    /// The carousel's clock: like `clock`, but frame by frame at the screen's rate,
    /// and with Reduce Motion it still ticks twice a second, so the phones move on
    /// as a fade without any sliding.
    @ViewBuilder
    private func carouselClock<V: View>(@ViewBuilder _ content: @escaping (Double) -> V) -> some View {
        if let frozenTime {
            content(frozenTime)
        } else if reduceMotion {
            TimelineView(.periodic(from: .now, by: 0.5)) { context in content(context.date.timeIntervalSince(started)) }
        } else {
            // At the screen's own rate, so the sliding phones stay smooth.
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

/// One of the app's screens in a phone, with the sample day. The offer opens on
/// what Pro adds (the coach, then the race plan), then the day it works from
/// (approved mockup pro-nabidka-obrazovky, 3 Nov 2026).
enum ProScreen: CaseIterable {
    case coach, plan, training, food, readiness, sleep

    var content: some View { ProScreenPage(screen: self) }

    /// The screen's page without its background, as tall as it is in the app.
    @ViewBuilder
    fileprivate var page: some View {
        switch self {
        case .coach: ProCoachSample().padding(.top, 54)
        case .plan: ProPlanSample().padding(.horizontal, 24).padding(.top, 70)
        case .training: TrainingContent(training: DemoData.training).padding(.top, 54)
        case .food: FoodContent(food: DemoData.food).padding(.top, 54)
        case .readiness: ReadinessDetailContent(health: DemoData.health).padding(.horizontal, 24).padding(.top, 70)
        case .sleep: SleepDetailContent(health: DemoData.health, detail: DemoData.night).padding(.horizontal, 24).padding(.top, 70)
        }
    }

    fileprivate var glow: Color {
        switch self {
        case .coach: return Palette.Glow.today
        case .plan, .training: return Palette.Glow.training
        case .food: return Palette.Glow.food
        case .readiness, .sleep: return Palette.Glow.health
        }
    }

    var title: String {
        switch self {
        case .coach: return L10n.tr("Kouč jen pro tebe")
        case .plan: return L10n.tr("Plány na závody a cíle")
        case .training: return L10n.tr("Tréninky postavené na dnešek")
        case .food: return L10n.tr("Jídlo, které kouč dopočítá")
        case .readiness: return L10n.tr("Víš, kdy přidat")
        case .sleep: return L10n.tr("Spánek, který chystá zítřek")
        }
    }

    var subtitle: String {
        switch self {
        case .coach: return L10n.tr("Zeptej se na cokoli. Zná tvůj spánek, trénink i jídlo.")
        case .plan: return L10n.tr("Podle tvé regenerace a pokroku.")
        case .training: return L10n.tr("Podle tvého času a unavených svalů.")
        case .food: return L10n.tr("Vyfoť talíř a hodnoty se doplní.")
        case .readiness: return L10n.tr("HRV, spánek a zátěž v jednom čísle.")
        case .sleep: return L10n.tr("Kolik spánku potřebuješ po dnešní zátěži.")
        }
    }

    /// The short name under a phone in the free week's belt.
    var label: String {
        switch self {
        case .coach: return L10n.tr("Kouč")
        case .plan: return L10n.tr("Plán")
        case .training: return L10n.tr("Tréninky")
        case .food: return L10n.tr("Jídelní kouč")
        case .readiness: return L10n.tr("Regenerace")
        case .sleep: return L10n.tr("Spánek")
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
            screen.page
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                .offset(y: -max(0, height - 844) * scroll)
        }
        .frame(width: 390, height: 844, alignment: .top)
        .clipped()
    }
}

/// The coach mid-conversation on the sample day: two of the questions the demo
/// answers (DemoData.coachAnswer), in the chat's own bubbles.
struct ProCoachSample: View {
    private static let questions = ["Jak mám dnes trénovat?", "Co sníst po tréninku?"]

    var body: some View {
        VStack(spacing: 14) {
            Text("Kouč").font(.headline).foregroundStyle(Palette.ink).padding(.bottom, 4)
            ForEach(Self.questions, id: \.self) { question in
                let asked = L10n.tr(question)
                BubbleView(bubble: CoachView.Bubble(mine: true, text: asked), decide: { _, _ in })
                BubbleView(bubble: CoachView.Bubble(mine: false, text: DemoData.coachAnswer(asked)), decide: { _, _ in })
            }
        }
        .padding(.horizontal, 16)
        // A sample in a capped page: the bubbles stay at the page's size.
        .environment(\.fullTypeSize, nil)
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

/// The offer's phones as a short video (Petr, 7 Nov 2026): a belt with the
/// front phone large and its neighbours dimmed beside it. The front screen
/// scrolls down, then the belt slides on to the next phone, every 2.5 s. The
/// phones follow a finger and settle on the nearest one; the carousel counts on
/// from there. With Reduce Motion nothing moves by itself: the phones change as
/// a fade, and only a finger moves the belt.
struct ScreenCarousel: View {
    let time: Double
    static let screens: [ProScreen] = ProScreen.allCases
    static let interval = 2.5
    /// The end of each interval, when the belt slides on.
    static let slide = 0.6
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The phone in front at `shownAt`; the carousel counts on from it.
    @State private var start = 0
    @State private var shownAt: Double = 0
    /// How far from `start` the belt was when the finger let go, in phones; it settles from there.
    @State private var settleFrom: Double = 0
    @State private var drag: Drag?
    @GestureState private var touching = false

    /// A finger on the belt: where the belt was when it came down, and how far it has moved.
    private struct Drag {
        var base: Double
        var held: Int
        var scroll: Double
        var at: Double
        var spacing: CGFloat
        var width: CGFloat = 0
        var predicted: CGFloat = 0
    }

    private struct Belt {
        /// In phones, fractional while the belt slides.
        var position: Double
        /// The phone whose screen scrolls, and how far.
        var held: Int
        var scroll: Double
    }

    private static var count: Int { screens.count }
    private static func wrap(_ i: Int) -> Int { (i % count + count) % count }
    /// From the belt's position to phone `i`, the short way round.
    private static func distance(_ i: Int, _ position: Double) -> Double {
        let n = Double(count)
        var d = (Double(i) - position).truncatingRemainder(dividingBy: n)
        if d < -n / 2 { d += n } else if d >= n / 2 { d -= n }
        return d
    }

    private var belt: Belt {
        if touching, let drag {
            // The scrolled screen goes back to its top as the finger takes the belt.
            let back = drag.scroll * (1 - PaywallIntro.ease((time - drag.at) / Self.slide))
            return Belt(position: drag.base - Double(drag.width / drag.spacing), held: drag.held, scroll: reduceMotion ? 0 : back)
        }
        let elapsed = max(0, time - shownAt)
        let step = Int(elapsed / Self.interval)
        if reduceMotion { return Belt(position: Double(start + step), held: start + step, scroll: 0) }
        let phase = elapsed - Double(step) * Self.interval
        let hold = Self.interval - Self.slide
        let advance = PaywallIntro.ease((phase - hold) / Self.slide)
        let settle = settleFrom * (1 - PaywallIntro.ease(elapsed / Self.slide))
        // Down while the phone is in front, back up as it slides away.
        let scroll = phase < hold ? PaywallIntro.ease(phase / hold) : 1 - advance
        return Belt(position: Double(start + step) + advance + settle, held: start + step, scroll: scroll)
    }

    var body: some View {
        let belt = self.belt
        let index = Self.wrap(Int(belt.position.rounded()))
        let screen = Self.screens[index]
        VStack(spacing: 10) {
            GeometryReader { geo in
                let height = max(160, geo.size.height)
                let spacing = height * 0.48
                Group {
                    if reduceMotion, !touching { fade(index, height: height, spacing: spacing) } else { phones(belt, height: height, spacing: spacing) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // The phones themselves take no touches (PhoneMockup), so the swipe needs its own area.
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 10)
                    .updating($touching) { _, touching, _ in touching = true }
                    .onChanged { value in
                        if drag == nil {
                            let now = self.belt
                            drag = Drag(base: now.position, held: now.held, scroll: now.scroll, at: time, spacing: spacing)
                        }
                        drag?.width = value.translation.width
                        drag?.predicted = value.predictedEndTranslation.width
                    })
            }
            .padding(.top, 10)
            .onChange(of: touching) { _, touching in if !touching { release() } }
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

    /// Every phone on the belt, placed by its distance from the front.
    private func phones(_ belt: Belt, height: CGFloat, spacing: CGFloat) -> some View {
        ZStack {
            ForEach(Self.screens.indices, id: \.self) { i in
                let d = Self.distance(i, belt.position)
                let near = min(abs(d), 1)
                PhoneMockup(height: height) {
                    ProScreenPage(screen: Self.screens[i], scroll: Self.wrap(belt.held) == i ? belt.scroll : 0)
                }
                .scaleEffect(1 - 0.22 * near)
                .opacity(abs(d) <= 1 ? 1 - 0.65 * near : 0.35 * max(0, 2 - abs(d)))
                .offset(x: CGFloat(d) * spacing)
                .zIndex(-abs(d))
            }
        }
    }

    /// With Reduce Motion: the front phone fades into the next, its neighbours change with it.
    private func fade(_ index: Int, height: CGFloat, spacing: CGFloat) -> some View {
        ZStack {
            ForEach([-1, 1], id: \.self) { side in
                PhoneMockup(height: height * 0.78) { Self.screens[Self.wrap(index + side)].content }
                    .opacity(0.35)
                    .offset(x: CGFloat(side) * spacing)
            }
            PhoneMockup(height: height) { Self.screens[index].content }
                .id(index)
                .transition(.opacity)
        }
        .animation(.easeInOut(duration: 0.5), value: index)
    }

    /// The finger let go: the belt settles on the nearest phone, or on the next
    /// one after a flick, and the carousel counts on from there.
    private func release() {
        guard let drag else { return }
        self.drag = nil
        let position = drag.base - Double(drag.width / drag.spacing)
        var target = position.rounded()
        if target == drag.base.rounded(), abs(drag.predicted) > drag.spacing * 0.3 {
            target += drag.predicted < 0 ? 1 : -1
        }
        start = Self.wrap(Int(target))
        settleFrom = reduceMotion ? 0 : position - target
        shownAt = time
    }
}

/// The free week's belt: small phones of the app sliding by, round and round.
struct ScreenBelt: View {
    let time: Double
    /// What Pro adds; readiness and sleep are in Aurin for everyone.
    static let screens: [ProScreen] = AllProPlans.included
    private static let phoneHeight: CGFloat = 199
    /// PhoneMockup's width at that height (a 7 pt bezel around the 390 × 844 screen), so
    /// the label under a phone has its width and the belt's loop is as long as the phones.
    private static let width: CGFloat = (phoneHeight - 14) / 844 * 390 + 14

    var body: some View {
        let step = Self.width + 14
        let span = step * CGFloat(Self.screens.count)
        let shift = (CGFloat(time) * 36).truncatingRemainder(dividingBy: span)
        HStack(alignment: .top, spacing: 14) {
            ForEach(0..<(Self.screens.count * 2), id: \.self) { i in
                let screen = Self.screens[i % Self.screens.count]
                VStack(spacing: 6) {
                    PhoneMockup(height: Self.phoneHeight) { screen.content }
                    Text(verbatim: screen.label).font(.caption2).foregroundStyle(Night.muted)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                .frame(width: Self.width)
            }
        }
        .offset(x: -shift)
        // minWidth 0: the frame takes the screen's width, not the whole belt's (twelve phones),
        // which otherwise widened the free week past the screen.
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
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

    /// What Pro includes: the offer's first four screens, in the same words.
    static let included: [ProScreen] = [.coach, .plan, .training, .food]

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
                        Image(systemName: "xmark").scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Night.ink)
                            .frame(width: 36, height: 36).background(Night.card, in: Circle())
                            .frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                }
                .padding(.top, 16)
                Text("Všechny tarify").font(Typo.sentence(30, relativeTo: .largeTitle)).foregroundStyle(Night.ink)
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
                        .font(Typo.bodyStrong).foregroundStyle(Night.violet)
                        .frame(maxWidth: .infinity).frame(minHeight: 54).background(Night.lavender, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(buying)
                .padding(.top, 18)
                HStack(spacing: 22) {
                    Button(action: redeem) { Text("Uplatnit promo kód") }
                    Button(action: restore) { Text("Obnovit nákup") }
                }
                .font(Typo.bodyStrong).foregroundStyle(Night.lavender).buttonStyle(.plain)
                .padding(.top, 14)
                if let chosen {
                    Text(verbatim: chosen.terms(trialDays: chosen.trial)).font(.caption2).foregroundStyle(Night.faint)
                        .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                }
                HStack(spacing: 6) {
                    Link(destination: L10n.legalURL("terms")) { Text("Podmínky").underline() }
                    Text(verbatim: "·")
                    Link(destination: L10n.legalURL("privacy")) { Text("Soukromí").underline() }
                }
                .font(.caption2).foregroundStyle(Night.faint).padding(.top, 3).padding(.bottom, 16)
            }
            .padding(.horizontal, 20)
        }
        .scrollBounceBehavior(.basedOnSize)
        // Half-width cards: the price stays whole up to the size the app's screens stop at.
        .dynamicTypeSize(...DynamicTypeSize.screenCap)
        .environment(\.colorScheme, .dark)
    }

    /// "V PRO JE" and four rows with a sparkle: title and one line each.
    private var includedList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("V PRO JE").scaledFont(11, weight: .semibold).tracking(1.2).foregroundStyle(Night.faint)
                .padding(.bottom, 8)
            ForEach(Self.included, id: \.self) { screen in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Image(systemName: "sparkle").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Night.lilac)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: screen.title).font(.subheadline.weight(.medium)).foregroundStyle(Night.ink)
                        Text(verbatim: screen.subtitle).font(.caption).foregroundStyle(Night.muted)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 9)
                .overlay(alignment: .top) { Rectangle().fill(Night.line).frame(height: 1) }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "Měsíčně · zrušíš kterýkoli měsíc  199 Kč/měs.": a small row, selectable like a card.
    private func monthlyRow(_ o: ProOffer) -> some View {
        let on = selected == o.kind
        return Button { selected = o.kind } label: {
            HStack(spacing: 8) {
                (Text(verbatim: o.title).font(.subheadline.weight(.medium))
                 + Text(verbatim: " · " + L10n.tr("zrušíš kterýkoli měsíc")).font(.subheadline).foregroundStyle(on ? Night.violet.opacity(0.75) : Night.muted))
                Spacer(minLength: 4)
                (Text(verbatim: o.price).font(Typo.number(18)) + Text(verbatim: o.unit).font(.caption2))
                    .lineLimit(1).fixedSize()
            }
            .foregroundStyle(on ? Night.violet : Night.ink)
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(on ? Night.lavender : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(on ? .clear : Night.line))
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
                        .foregroundStyle(selected ? Night.violet : Night.faint)
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
            .foregroundStyle(selected ? Night.violet : Night.ink)
            // Room under the SAVE pill on the card's top edge, also with large text.
            .padding(.horizontal, 12).padding(.top, 22).padding(.bottom, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(selected ? Night.lavender : Night.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(selected ? .clear : Night.line))
            .overlay(alignment: .topLeading) {
                if let save = offer.save {
                    Text(verbatim: L10n.f("UŠETŘÍŠ %d %%", save)).scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(Night.bottom)
                        .lineLimit(1).fixedSize()
                        .padding(.horizontal, 9).padding(.vertical, 3)
                        .background(Night.mint, in: Capsule())
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
                Text(verbatim: PaywallView.dayMonth(PaywallView.firstPayment(from: today, calendar: calendar))).foregroundStyle(Night.lavender)
            }
            .font(.caption.weight(.medium)).padding(.horizontal, 6)
        }
        .padding(16)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Night.line))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Dnes zdarma, připomínka za 4 dny, první platba %@.", PaywallView.dayMonth(PaywallView.firstPayment(from: today, calendar: calendar))))
    }
}
