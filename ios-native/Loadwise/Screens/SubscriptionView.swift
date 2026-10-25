import SwiftUI
import UIKit

// Loadwise Pro, laid out like Bevel Pro: a row at the top of Settings, the
// subscription page (what Free has ✓ and lacks ✗, "Přejít na Loadwise Pro"),
// and the offer over the whole screen: the app in a phone, then what Pro
// brings and the plans. During the invitation-only pilot everything is free
// and nothing can be bought; the purchase (App Store) comes with the Apple
// Developer Program. The server decides who has AI (src/subscription.js).

/// The plans of the offer, prices with VAT in Czech crowns (App Store).
enum ProPlans {
    struct Plan: Identifiable, Equatable {
        let id: String
        let title: String
        let price: String?
        let note: String?
        var best = false
    }

    static let main: [Plan] = [
        Plan(id: "annual", title: "Ročně", price: "1 490 Kč / rok", note: "124 Kč měsíčně", best: true),
        Plan(id: "monthly", title: "Měsíčně", price: "199 Kč / měsíc", note: "placeno měsíčně")
    ]
    static let all: [Plan] = main
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
/// with the plan.
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
            hasPro = (try? await model.api.subscription())?.hasAI == true
        }
    }
}

/// Aurin Pro: the logo, the plan, a tile for each thing Pro brings (locked
/// without it) and, without Pro, the plans and the way to the offer.
struct SubscriptionView: View {
    @Environment(AppModel.self) private var model
    @State private var status: SubscriptionStatus?
    @State private var error: String?

    private var hasPro: Bool { status?.hasAI == true }
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

            if status != nil && !hasPro {
                VStack(spacing: 14) {
                    HStack(spacing: 10) {
                        ForEach(ProPlans.main) { plan in
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
            } else if status == nil && error == nil {
                ProgressView().frame(maxWidth: .infinity)
            }

            Link(destination: URL(string: "https://aurin.health/terms")!) {
                Text("Podmínky a ceny").font(Typo.caption).foregroundStyle(Palette.muted).underline()
            }
            .frame(maxWidth: .infinity)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
    }

    private var badge: String? {
        guard let status else { return nil }
        if status.hasAI { return L10n.tr("Aktivní") }
        if status.pilot { return L10n.tr("Pilot · vše zdarma") }
        return nil
    }

    private func load() async {
        if model.demo { status = .demo; return }
        do {
            status = try await model.api.subscription()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
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
    @State private var demo = AppModel(demo: true)
    /// 0 the app playing in the phone, 1 what Pro brings and the plans.
    @State private var step = 0
    @State private var plan = "annual"
    @State private var allPlans = false
    @State private var notYet: String?
    @State private var started = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(close: @escaping () -> Void, frozenTime: Double? = nil, step: Int = 0) {
        self.close = close
        self.frozenTime = frozenTime
        _step = State(initialValue: step)
    }

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            RadialGradient(colors: [Palette.indigo.opacity(0.35), .clear], center: .bottom, startRadius: 10, endRadius: 520).ignoresSafeArea()
            clock { time in Sparkles(time: time) }.ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack {
                    Button(action: close) {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                    }
                    .accessibilityLabel("Zavřít")
                    Spacer()
                    Menu {
                        Button("Všechny tarify") { allPlans = true }
                        Button("Uplatnit promo kód") { notYet = L10n.tr("Promo kódy půjdou uplatnit, až spustíme předplatné.") }
                        Button("Obnovit nákup") { notYet = L10n.tr("Zatím není co obnovit: předplatné ještě nejde koupit.") }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                    }
                    .accessibilityLabel("Další možnosti")
                }
                .padding(.horizontal, 20).padding(.top, 8)

                Text("Začni naplno s Aurin Pro")
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
                    } else {
                        features.transition(.opacity)
                    }
                }
                .frame(maxHeight: .infinity)

                VStack(spacing: 10) {
                    if step > 0 {
                        HStack(spacing: 10) {
                            ForEach(ProPlans.main) { p in PlanCard(plan: p, selected: plan == p.id) { plan = p.id } }
                        }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    Button {
                        if step == 0 { withAnimation(.easeInOut(duration: 0.4)) { step = 1 }; started = Date() }
                        else { notYet = L10n.tr("Během pilotu je všechno zdarma, i AI. Předplatné spustíme později a cenu oznámíme předem.") }
                    } label: {
                        Text("Pokračovat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 54).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $allPlans) { AllPlansSheet(selected: $plan) }
        .alert(L10n.tr("Aurin Pro"), isPresented: Binding(get: { notYet != nil }, set: { if !$0 { notYet = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(notYet ?? "") }
    }

    /// Seconds since the page (or its second step) opened, frame by frame;
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
        case .sleep: detail { SleepDetailContent(health: DemoData.health, detail: nil) }
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
            ForEach(ProPlans.all) { p in PlanCard(plan: p, selected: selected == p.id) { selected = p.id } }
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
