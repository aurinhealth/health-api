import SwiftUI

// The welcome before the sign-in (LoginView): an opening and five pages of
// what Aurin does, each a few of the app's own cards with the sample day
// (DemoData) that move once the page is on screen. With Reduce Motion they
// stand still in their final state.

enum WelcomePage: Int, CaseIterable, Identifiable {
    case opening, readiness, training, food, sleep, coach

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .opening: return ""
        case .readiness: return "Připravenost"
        case .training: return "Trénink"
        case .food: return "Jídlo"
        case .sleep: return "Spánek"
        case .coach: return "Kouč"
        }
    }

    var text: String {
        switch self {
        case .opening: return ""
        case .readiness: return "Každé ráno víš, kolik tělo dnes zvládne."
        case .training: return "Tréninky podle únavy, svalů a vybavení, které máš."
        case .food: return "Vyfoť talíř nebo naskenuj kód. Hodnoty doplní AI."
        case .sleep: return "Večerka podle budíku a spánku, který dnes potřebuješ."
        case .coach: return "Zeptej se na cokoli. Zná tvůj spánek, trénink i jídlo."
        }
    }

    /// The tint at the top of the page; the sign-in after the last page has its own.
    var glow: Color {
        switch self {
        case .opening: return WelcomeGlow.sunrise
        case .readiness: return Palette.Glow.today
        case .training: return Palette.Glow.training
        case .food: return Palette.Glow.food
        case .sleep: return Palette.Glow.health
        case .coach: return WelcomeGlow.coach
        }
    }
}

enum WelcomeGlow {
    static let sunrise = Color(light: 0xF7DFC2, dark: 0x3A2A17)
    static let coach = Color(light: 0xE6E1F3, dark: 0x2A2740)
    static let signIn = Color(light: 0xF5E3CC, dark: 0x352818)
}

/// What a page's pieces need to move: `shown` turns true when the page comes
/// on screen (springs and counters run to it), `start` is that moment for the
/// pieces that run on a clock, `live` is false off screen and with Reduce Motion.
struct WelcomePlay {
    var shown: Bool
    var start: Date
    var live: Bool

    /// Seconds since the page came on screen; still pieces sit at their end.
    func elapsed(_ now: Date) -> Double { live ? now.timeIntervalSince(start) : 1000 }
}

/// One page: its title and sentence on top, its cards under them.
struct WelcomePageView: View {
    let page: WelcomePage
    let active: Bool
    /// Its final state at once, for the snapshot tests.
    var still = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var start = Date()

    var body: some View {
        let play = still ? WelcomePlay(shown: true, start: start, live: false)
            : WelcomePlay(shown: shown, start: start, live: active && !reduceMotion)
        Group {
            if page == .opening {
                WelcomeOpening(play: play)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text(LocalizedStringKey(page.title))
                        .font(Typo.sentence(42, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(LocalizedStringKey(page.text))
                        .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 18)
                    visual(play)
                        .accessibilityElement(children: .ignore)
                    Spacer(minLength: 8)
                }
                .padding(.top, 12)
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.denseCap)
        .onChange(of: active, initial: true) { _, now in
            // On screen it plays (with Reduce Motion it just stands there); off screen
            // it goes back to the start without animating, so it plays again.
            var transaction = Transaction()
            transaction.disablesAnimations = !now || reduceMotion
            if now { start = Date() }
            withTransaction(transaction) { shown = now }
        }
    }

    @ViewBuilder private func visual(_ play: WelcomePlay) -> some View {
        switch page {
        case .opening: EmptyView()
        case .readiness: WelcomeReadiness(play: play)
        case .training: WelcomeTraining(play: play)
        case .food: WelcomeFood(play: play)
        case .sleep: WelcomeSleep(play: play)
        case .coach: WelcomeCoach(play: play)
        }
    }
}

// MARK: - Pieces

/// A number that counts up to its value when it changes in an animation.
private struct CountingNumber: ViewModifier, @preconcurrency Animatable {
    var value: Double

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    func body(content: Content) -> some View {
        Text(verbatim: Fmt.int(value))
    }
}

private extension View {
    func counting(_ value: Double) -> some View {
        modifier(CountingNumber(value: value))
    }

    /// A card that rises into place `delay` seconds after the page shows.
    func rises(_ play: WelcomePlay, delay: Double) -> some View {
        opacity(play.shown ? 1 : 0)
            .offset(y: play.shown ? 0 : 26)
            .animation(.spring(response: 0.6, dampingFraction: 0.82).delay(delay), value: play.shown)
    }
}

/// Uncovers its content from the leading edge.
private struct Reveal: Shape {
    var fraction: Double
    var animatableData: Double {
        get { fraction }
        set { fraction = newValue }
    }

    func path(in rect: CGRect) -> Path {
        Path(CGRect(x: rect.minX, y: rect.minY - 20, width: rect.width * fraction, height: rect.height + 40))
    }
}

/// The cards' paper with the soft shadow of Card.
private struct WelcomeCard: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 22)
            .shadow(color: .black.opacity(0.06), radius: 18, y: 10)
            .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
    }
}

private extension View {
    func welcomeCard(padding: CGFloat = 16) -> some View { modifier(WelcomeCard(padding: padding)) }
}

// MARK: - Opening

/// The logo rising like the sun behind a few rings, and one sentence.
private struct WelcomeOpening: View {
    let play: WelcomePlay

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            TimelineView(.animation(paused: !play.live)) { context in
                let t = play.elapsed(context.date)
                ZStack {
                    ForEach(0..<3, id: \.self) { i in
                        let phase = play.live ? (t * 0.25 + Double(i) / 3).truncatingRemainder(dividingBy: 1) : Double(i + 1) / 4
                        Circle()
                            .stroke(AurinMark.amber.opacity(0.35 * (1 - phase)), lineWidth: 1.5)
                            .frame(width: 150 + 170 * phase, height: 150 + 170 * phase)
                    }
                    Circle().fill(RadialGradient(colors: [AurinMark.amber.opacity(0.28), AurinMark.amber.opacity(0)], center: .center, startRadius: 0, endRadius: 150))
                        .frame(width: 300, height: 300)
                    AurinMark(size: 140, glow: true)
                        .offset(y: play.live ? sin(t * 1.3) * 6 : 0)
                }
                .frame(height: 320)
            }
            .opacity(play.shown ? 1 : 0)
            .offset(y: play.shown ? 0 : 40)
            .animation(.spring(response: 0.9, dampingFraction: 0.8), value: play.shown)
            Spacer(minLength: 0)
            (Text("Kouč, který zná ")
             + Text("tvůj spánek.").font(Typo.sentenceItalic(44, relativeTo: .largeTitle)).foregroundColor(Palette.green))
                .font(Typo.sentence(44, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .rises(play, delay: 0.35)
                .padding(.bottom, 8)
        }
    }
}

// MARK: - Readiness

private struct WelcomeReadiness: View {
    let play: WelcomePlay

    var body: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Připravenost").font(Typo.body).foregroundStyle(Palette.muted)
                    Spacer()
                    Pill(text: L10n.tr("vysoká"))
                        .scaleEffect(play.shown ? 1 : 0.6).opacity(play.shown ? 1 : 0)
                        .animation(.spring(response: 0.4, dampingFraction: 0.55).delay(1.2), value: play.shown)
                }
                HStack(alignment: .bottom, spacing: 14) {
                    Color.clear.frame(width: 0, height: 0)
                        .counting(play.shown ? 78 : 0)
                        .font(Typo.number(96)).monospacedDigit().foregroundStyle(Palette.ink)
                        .frame(width: 108, alignment: .leading)
                        .animation(.easeOut(duration: 1.3).delay(0.2), value: play.shown)
                    (Text("Dobrá noc, třetí den. ")
                     + Text("Dnes klidně naplno do síly.").font(Typo.sentenceItalic(17)).foregroundColor(Palette.green))
                        .font(Typo.sentence(17)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 12)
                        .opacity(play.shown ? 1 : 0)
                        .animation(.easeOut(duration: 0.5).delay(1.4), value: play.shown)
                }
            }
            .welcomeCard(padding: 18)
            .rises(play, delay: 0)

            HStack(spacing: 12) {
                tile(title: "Spánek", value: "7:12", unit: nil, bar: RangeBar(value: play.shown ? 432 : 380, low: 473, high: 551, color: Palette.amberBar),
                     note: L10n.f("%d %% potřeby", 89), tone: Palette.amberBar)
                    .rises(play, delay: 0.25)
                tile(title: "HRV", value: "64", unit: "ms", bar: RangeBar(value: play.shown ? 64 : 49, low: 55, high: 61, color: Palette.green),
                     note: RangeBar.word(64, 55, 61), tone: Palette.green)
                    .rises(play, delay: 0.4)
            }
            .animation(.spring(response: 1.1, dampingFraction: 0.8).delay(0.7), value: play.shown)
        }
    }

    private func tile(title: String, value: String, unit: String?, bar: RangeBar, note: String, tone: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(LocalizedStringKey(title)).font(Typo.small).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: value).font(Typo.number(36)).foregroundStyle(Palette.ink)
                if let unit { Text(verbatim: unit).font(Typo.small).foregroundStyle(Palette.muted) }
            }
            bar
            Text(verbatim: note).font(Typo.caption.weight(.medium)).foregroundStyle(tone)
        }
        .welcomeCard(padding: 14)
    }
}

// MARK: - Training

private struct WelcomeTraining: View {
    let play: WelcomePlay

    private let sets: [(label: String, kg: Int, done: Bool)] = [("W", 40, true), ("1", 80, true), ("2", 80, true), ("3", 80, false)]

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 16) {
                RestRing(end: play.start.addingTimeInterval(83), total: 90)
                    .frame(width: 220, height: 220)
                    .scaleEffect(0.54)
                    .frame(width: 119, height: 119)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Teď").font(Typo.small).foregroundStyle(Palette.muted)
                    Text(verbatim: L10n.tr("Dřep") + " · " + L10n.f("série %@", "3")).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                    Text(verbatim: "80 kg × 8").font(Typo.number(30)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                    HStack(spacing: 6) {
                        chip("−15 s")
                        chip("+15 s")
                    }
                    .padding(.top, 6)
                }
                Spacer(minLength: 0)
            }
            .welcomeCard(padding: 14)
            .rises(play, delay: 0)

            HStack(spacing: 12) {
                VStack(spacing: 7) {
                    ForEach(sets.indices, id: \.self) { i in
                        setRow(sets[i], index: i)
                    }
                }
                .welcomeCard(padding: 12)
                .rises(play, delay: 0.2)

                VStack(spacing: 6) {
                    MuscleFigurePair(colors: play.shown ? ["quads": Palette.rust, "chest": Palette.amberBar] : [:], spacing: 2)
                        .frame(height: 112)
                        .animation(.easeInOut(duration: 0.8).delay(1.0), value: play.shown)
                    Text(verbatim: L10n.tr("Stehna") + " · " + L10n.tr("Hrudník"))
                        .font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
                }
                .welcomeCard(padding: 12)
                .frame(width: 136)
                .rises(play, delay: 0.35)
            }
        }
    }

    private func chip(_ text: String) -> some View {
        Text(verbatim: text).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
            .padding(.horizontal, 10).frame(height: 26)
            .overlay(Capsule().stroke(Palette.ink.opacity(0.14), lineWidth: 1))
    }

    private func setRow(_ set: (label: String, kg: Int, done: Bool), index: Int) -> some View {
        HStack(spacing: 8) {
            Text(verbatim: set.label).font(Typo.caption.weight(.semibold))
                .foregroundStyle(set.label == "W" ? Palette.amber : Palette.muted)
                .frame(width: 16)
            Text(verbatim: "\(set.kg) kg × 8").font(.subheadline.weight(.medium)).monospacedDigit().foregroundStyle(Palette.ink)
            Spacer(minLength: 0)
            ZStack {
                if set.done {
                    Circle().fill(Palette.green)
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.onAccent)
                } else {
                    Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1.5)
                }
            }
            .frame(width: 20, height: 20)
            .scaleEffect(set.done && !play.shown ? 0.3 : 1)
            .opacity(set.done && !play.shown ? 0 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.5).delay(0.5 + Double(index) * 0.22), value: play.shown)
        }
        .padding(.horizontal, 8).frame(height: 30)
        .background(set.done ? Color.clear : Palette.amberSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(set.done ? Color.clear : Palette.amberBar, lineWidth: 1.2))
    }
}

// MARK: - Food

private struct WelcomeFood: View {
    let play: WelcomePlay

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                plate.rises(play, delay: 0)
                today.rises(play, delay: 0.15)
            }
            .frame(height: 176)
            HStack(spacing: 12) {
                barcode.rises(play, delay: 0.3)
                drinks.rises(play, delay: 0.45)
            }
            .frame(height: 140)
        }
    }

    /// The lunch photo with the scan's corners closing on it.
    private var plate: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle().fill(Palette.cardLift).overlay(Circle().stroke(Palette.ink.opacity(0.1), lineWidth: 1))
                Circle().fill(Palette.sand.opacity(0.45)).padding(12)
                Ellipse().fill(Color(light: 0xEAD7B0, dark: 0xCDB98E)).frame(width: 34, height: 26).offset(x: -11, y: -4)
                Ellipse().fill(Color(light: 0xC98A5C, dark: 0xB07A50)).frame(width: 30, height: 22).offset(x: 11, y: 6)
                Circle().fill(Color(light: 0x8AA58C, dark: 0x7A957C)).frame(width: 15, height: 15).offset(x: 4, y: -18)
                Circle().fill(Color(light: 0xC9614B, dark: 0xB4553F)).frame(width: 9, height: 9).offset(x: -12, y: 15)
                ScanCorners()
                    .stroke(Palette.amberBar, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .padding(-8)
                    .scaleEffect(play.shown ? 1 : 1.3)
                    .opacity(play.shown ? 1 : 0)
                    .animation(.spring(response: 0.5, dampingFraction: 0.6).delay(0.5), value: play.shown)
            }
            .frame(width: 92, height: 92)
            .padding(.top, 6)
            VStack(spacing: 1) {
                Text("Rýže s kuřecím masem").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                Text(verbatim: "640 kcal").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .opacity(play.shown ? 1 : 0)
            .animation(.easeOut(duration: 0.4).delay(1.0), value: play.shown)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .welcomeCard(padding: 10)
    }

    private var today: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Dnes").font(Typo.small).foregroundStyle(Palette.muted)
            Color.clear.frame(width: 0, height: 0)
                .counting(play.shown ? 1380 : 0)
                .font(Typo.number(42)).monospacedDigit().foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .animation(.easeOut(duration: 1.4).delay(0.4), value: play.shown)
            Text(L10n.f("z %@ kcal", Fmt.int(2650))).font(Typo.caption).foregroundStyle(Palette.muted)
            Spacer(minLength: 8)
            HStack(spacing: 8) {
                macro("Sacharidy", 177 / 330, Palette.carbs)
                macro("Bílkoviny", 84 / 150, Palette.protein)
                macro("Tuky", 36 / 80, Palette.fat)
            }
            .animation(.easeOut(duration: 1.2).delay(0.6), value: play.shown)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .welcomeCard(padding: 14)
    }

    private func macro(_ title: String, _ fraction: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(LocalizedStringKey(title)).font(.system(size: 10, weight: .medium)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
            ProgressLine(fraction: play.shown ? fraction : 0, color: color, height: 4)
        }
    }

    private var barcode: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Čárový kód").font(Typo.small).foregroundStyle(Palette.muted)
            TimelineView(.animation(paused: !play.live)) { context in
                let t = play.elapsed(context.date)
                GeometryReader { geo in
                    ZStack {
                        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.background)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.ink.opacity(0.08), lineWidth: 1))
                        HStack(spacing: 2) {
                            ForEach(Array([2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1].enumerated()), id: \.offset) { _, w in
                                Rectangle().fill(Palette.ink).frame(width: CGFloat(w), height: 38)
                            }
                        }
                        Capsule().fill(AurinMark.amber)
                            .frame(height: 2).padding(.horizontal, 12)
                            .shadow(color: AurinMark.amber.opacity(0.9), radius: 5)
                            .offset(y: CGFloat(play.live ? sin(t * 2.2) : 0) * (geo.size.height / 2 - 10))
                    }
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .welcomeCard(padding: 14)
    }

    /// Pití: the water's level as a slow wave, how much is left under it.
    private var drinks: some View {
        TimelineView(.animation(paused: !play.live)) { context in
            let t = play.elapsed(context.date)
            ZStack(alignment: .topLeading) {
                Canvas { ctx, size in
                    let rise = play.shown ? min(1, max(0, (t - 0.6) / 1.4)) : 0
                    let level = size.height * (1 - 0.15 - 0.47 * rise)
                    var wave = Path()
                    wave.move(to: CGPoint(x: 0, y: size.height))
                    for x in stride(from: 0, through: size.width, by: 4) {
                        wave.addLine(to: CGPoint(x: x, y: level + CGFloat(sin(Double(x) / 26 + t * 2) * 4)))
                    }
                    wave.addLine(to: CGPoint(x: size.width, y: size.height))
                    wave.closeSubpath()
                    ctx.fill(wave, with: .linearGradient(Gradient(colors: [Palette.blue.opacity(0.55), Palette.blue]),
                                                         startPoint: CGPoint(x: 0, y: level), endPoint: CGPoint(x: 0, y: size.height)))
                }
                HStack {
                    Circle().fill(Palette.blue).frame(width: 8, height: 8)
                    Text("Pití").font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "plus").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(Palette.blue, in: Circle())
                }
                .padding(12)
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: Units.volumeText(1500)).font(Typo.number(26))
                    Text(L10n.f("zbývá %@", Units.volumeText(1100))).font(Typo.caption.weight(.medium)).opacity(0.9)
                }
                .foregroundStyle(.white)
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .cardSurface(cornerRadius: 22)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 18, y: 10)
    }
}

/// The four corners of a camera's frame.
private struct ScanCorners: Shape {
    func path(in rect: CGRect) -> Path {
        let l = min(rect.width, rect.height) * 0.2, r: CGFloat = 8
        var p = Path()
        for (corner, dx, dy) in [(CGPoint(x: rect.minX, y: rect.minY), 1.0, 1.0), (CGPoint(x: rect.maxX, y: rect.minY), -1.0, 1.0),
                                 (CGPoint(x: rect.minX, y: rect.maxY), 1.0, -1.0), (CGPoint(x: rect.maxX, y: rect.maxY), -1.0, -1.0)] {
            p.move(to: CGPoint(x: corner.x, y: corner.y + dy * l))
            p.addLine(to: CGPoint(x: corner.x, y: corner.y + dy * r))
            p.addQuadCurve(to: CGPoint(x: corner.x + dx * r, y: corner.y), control: corner)
            p.addLine(to: CGPoint(x: corner.x + dx * l, y: corner.y))
        }
        return p
    }
}

// MARK: - Sleep

private struct WelcomeSleep: View {
    let play: WelcomePlay

    private let levels: [(title: String, minutes: Int)] = [("Dospat", 510), ("Normálně", 480), ("Aspoň", 420)]

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                tile(title: "Do postele", symbol: "moon.fill", color: Palette.indigo, minutes: 22 * 60 + 10)
                    .rises(play, delay: 0)
                tile(title: "Vstávání", symbol: "sun.max.fill", color: Palette.amber, minutes: 7 * 60 + 15)
                    .rises(play, delay: 0.12)
            }
            HStack(spacing: 8) {
                ForEach(levels.indices, id: \.self) { i in
                    let on = play.shown && i == 0
                    VStack(spacing: 3) {
                        Text(LocalizedStringKey(levels[i].title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: SleepPlanner.short(levels[i].minutes)).font(Typo.caption).monospacedDigit().foregroundStyle(on ? Palette.indigo : Palette.muted)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(on ? Palette.lilac : Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(on ? Palette.indigo : .clear, lineWidth: 1.5))
                    .shadow(color: .black.opacity(0.05), radius: 10, y: 6)
                    .animation(.spring(response: 0.4, dampingFraction: 0.7).delay(0.9), value: play.shown)
                }
            }
            .rises(play, delay: 0.24)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Minulá noc").font(Typo.small).foregroundStyle(Palette.muted)
                    Spacer()
                    Text(verbatim: "7:12").font(Typo.number(22)).foregroundStyle(Palette.ink)
                }
                Hypnogram(segments: DemoData.night.night?.segments ?? [])
                    .clipShape(Reveal(fraction: play.shown ? 1 : 0))
                    .animation(.easeInOut(duration: 1.6).delay(0.6), value: play.shown)
            }
            .welcomeCard(padding: 14)
            .rises(play, delay: 0.36)
        }
    }

    private func tile(title: String, symbol: String, color: Color, minutes: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 12, weight: .semibold)).foregroundStyle(color)
                Text(LocalizedStringKey(title)).font(Typo.small).foregroundStyle(Palette.muted)
            }
            Text(verbatim: ClockText.format(minutes: minutes)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .welcomeCard(padding: 14)
    }
}

// MARK: - Coach

private struct WelcomeCoach: View {
    let play: WelcomePlay

    private var parts: [String] {
        [L10n.tr("Připravenost je 61 po 5 h 40 spánku. "), L10n.tr("Nohy nech, jen lehčeji:"), L10n.tr(" dřep 3 × 8 se 70 kg.")]
    }

    var body: some View {
        TimelineView(.animation(paused: !play.live)) { context in
            let t = play.elapsed(context.date)
            let total = parts.reduce(0) { $0 + $1.count }
            // The question, dots for a moment, the answer typed out, then its workout.
            let typed = play.shown ? min(total, max(0, Int((t - 1.6) * 38))) : 0
            let thinking = play.shown && play.live && t > 0.7 && t < 1.6
            VStack(alignment: .leading, spacing: 12) {
                Text("Špatná noc. Dneska nohy?")
                    .font(.body).foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Palette.button, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .rises(play, delay: 0.1)
                if thinking {
                    CoachDots()
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .cardSurface(cornerRadius: 18)
                } else if typed > 0 {
                    answer(typed)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface(cornerRadius: 18)
                        .padding(.trailing, 30)
                }
                workout
                    .opacity(typed == total ? 1 : 0)
                    .offset(y: typed == total ? 0 : 16)
                    .animation(.spring(response: 0.5, dampingFraction: 0.8), value: typed == total)
            }
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(height: 330)
    }

    /// The answer as far as it is typed, its middle part in the coach's italic.
    private func answer(_ typed: Int) -> Text {
        var left = typed
        var out = Text(verbatim: "")
        for (i, part) in parts.enumerated() {
            let shown = String(part.prefix(max(0, left)))
            left -= part.count
            let piece = Text(verbatim: shown)
            out = out + (i == 1 ? piece.font(Typo.sentenceItalic(18)).foregroundColor(Palette.green) : piece.font(Typo.sentence(18)).foregroundColor(Palette.ink))
        }
        return out
    }

    private var workout: some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.amber)
                .frame(width: 40, height: 40).background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Nohy, lehčeji").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(verbatim: "40 min · " + L10n.f("%@ cviky", "4")).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 0)
            Text("Přidat").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                .padding(.horizontal, 16).frame(height: 34).background(Palette.button, in: Capsule())
        }
        .welcomeCard(padding: 12)
    }
}

// MARK: - Sign-in pieces

/// A soft lock with the logo whose shackle clicks shut.
struct WelcomeLock: View {
    let shut: Bool

    var body: some View {
        ZStack {
            Circle().fill(RadialGradient(colors: [AurinMark.amber.opacity(0.25), AurinMark.amber.opacity(0)], center: .center, startRadius: 0, endRadius: 110))
                .frame(width: 220, height: 220)
            Shackle()
                .stroke(LinearGradient(colors: [Palette.sand, Palette.brown.opacity(0.6)], startPoint: .top, endPoint: .bottom),
                        style: StrokeStyle(lineWidth: 11, lineCap: .round))
                .frame(width: 62, height: 58)
                .offset(y: shut ? -44 : -58)
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(LinearGradient(colors: [Palette.cardLift, Palette.card], startPoint: .top, endPoint: .bottom))
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Palette.cardEdge, lineWidth: 1))
                .frame(width: 104, height: 84)
                .shadow(color: .black.opacity(0.1), radius: 18, y: 12)
                .offset(y: 10)
            AurinMark(size: 46).offset(y: 10)
        }
        .frame(height: 200)
        .animation(.spring(response: 0.35, dampingFraction: 0.5).delay(0.5), value: shut)
        .accessibilityHidden(true)
    }
}

/// The lock's bow: two legs and the arc over them.
private struct Shackle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = rect.width / 2
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.midX, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        return p
    }
}

/// How far the welcome is: a line with a dot per page, the current one glowing.
struct WelcomeProgress: View {
    let count: Int
    let index: Int

    var body: some View {
        GeometryReader { geo in
            let step = count > 1 ? geo.size.width / CGFloat(count - 1) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.ink.opacity(0.1)).frame(height: 2)
                Capsule().fill(LinearGradient(colors: [AurinMark.amber.opacity(0.4), AurinMark.amber], startPoint: .leading, endPoint: .trailing))
                    .frame(width: step * CGFloat(index), height: 2)
                ForEach(0..<count, id: \.self) { i in
                    Circle().fill(i <= index ? AurinMark.amber : Palette.ink.opacity(0.18))
                        .frame(width: 6, height: 6)
                        .offset(x: step * CGFloat(i) - 3)
                }
                Circle().fill(AurinMark.amber)
                    .frame(width: 12, height: 12)
                    .overlay(Circle().stroke(Palette.card, lineWidth: 2))
                    .shadow(color: AurinMark.amber.opacity(0.8), radius: 6)
                    .offset(x: step * CGFloat(index) - 6)
            }
            .frame(height: 12)
        }
        .frame(height: 12)
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: index)
        .accessibilityElement()
        .accessibilityLabel(L10n.f("Strana %@ z %@", String(index + 1), String(count)))
    }
}
