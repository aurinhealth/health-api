import SwiftUI

// The welcome before the sign-in (LoginView): an opening and three pages of
// what Aurin does, each a few of the app's own cards with the sample day
// (DemoData) that move once the page is on screen. With Reduce Motion they
// stand still in their final state. Most people decide within the first
// pages, so Výživa and Spánek have no page of their own (review 2026-10-28).

enum WelcomePage: Int, CaseIterable, Identifiable {
    case opening, readiness, training, coach

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .opening: return ""
        case .readiness: return "Připravenost"
        case .training: return "Trénink"
        case .coach: return "Kouč"
        }
    }

    var text: String {
        switch self {
        case .opening: return ""
        case .readiness: return "Každé ráno víš, kolik tělo dnes zvládne."
        case .training: return "Tréninky podle únavy, svalů a vybavení, které máš."
        case .coach: return "Zeptej se na cokoli. Zná tvůj spánek, trénink i jídlo."
        }
    }

    /// The tint at the top of the page; the sign-in after the last page has its own.
    var glow: Color {
        switch self {
        case .opening: return WelcomeGlow.sunrise
        case .readiness: return Palette.Glow.today
        case .training: return Palette.Glow.training
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
            // Said up front, so nobody without an invite finds out only at the sign-in.
            Label {
                Text("Aurin je zatím jen na pozvánku. [Nemáš ji? Přidej se na čekací listinu.](https://aurin.health/#join)")
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                    .tint(Palette.blue)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "lock").foregroundStyle(Palette.amber)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .rises(play, delay: 0.6)
            .padding(.top, 10)
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
                    .scaleEffect(0.48)
                    .frame(width: 106, height: 106)
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
            .welcomeCard(padding: 12)
            .rises(play, delay: 0)

            loadedBar
                .welcomeCard(padding: 14)
                .rises(play, delay: 0.15)

            HStack(spacing: 12) {
                VStack(spacing: 5) {
                    ForEach(sets.indices, id: \.self) { i in
                        setRow(sets[i], index: i)
                    }
                }
                .welcomeCard(padding: 12)
                .rises(play, delay: 0.3)

                VStack(spacing: 6) {
                    MuscleFigurePair(colors: play.shown ? ["quads": Palette.rust, "chest": Palette.amberBar] : [:], spacing: 2)
                        .frame(height: 92)
                        .animation(.easeInOut(duration: 0.8).delay(1.0), value: play.shown)
                    Text(verbatim: L10n.tr("Stehna") + " · " + L10n.tr("Hrudník"))
                        .font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
                }
                .welcomeCard(padding: 12)
                .frame(width: 124)
                .rises(play, delay: 0.45)
            }
        }
    }

    /// The plate loader's bar with 80 kg: the plates slide on one after another.
    private var loadedBar: some View {
        let plates: [Double] = PlateLoad.plates(for: 80, bar: 20, sizes: PlateLoad.kgSizes)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: "80 kg").font(Typo.number(24)).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(L10n.f("%@ na stranu + tyč %@ kg", plates.map { GymCoach.shown($0) }.joined(separator: " + "), GymCoach.shown(20)))
                    .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3, style: .continuous).fill(PlateLoaderSheet.metal).frame(height: 10)
                HStack(spacing: 2) {
                    Rectangle().fill(PlateLoaderSheet.metal).frame(width: 64, height: 6)
                    RoundedRectangle(cornerRadius: 2, style: .continuous).fill(PlateLoaderSheet.metal).frame(width: 7, height: 22)
                    ForEach(Array(plates.enumerated()), id: \.offset) { i, plate in
                        let shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
                        Text(verbatim: GymCoach.shown(plate))
                            .scaledFont(10, weight: .semibold, cap: .denseCap).foregroundStyle(.white)
                            .lineLimit(1).minimumScaleFactor(0.6)
                            .frame(width: PlateLoaderSheet.width(plate) * 0.7, height: PlateLoaderSheet.height(plate) * 0.42)
                            .background(shape.fill(PlateLoaderSheet.fill(plate)))
                            .overlay(shape.stroke(PlateLoaderSheet.line(plate), lineWidth: 1.2))
                            .offset(x: play.shown ? 0 : 180)
                            .opacity(play.shown ? 1 : 0)
                            .animation(.spring(response: 0.5, dampingFraction: 0.75).delay(0.6 + Double(i) * 0.25), value: play.shown)
                    }
                }
            }
            .frame(height: 78)
            .clipped()
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
                    Image(systemName: "checkmark").scaledFont(10, weight: .bold).foregroundStyle(Palette.onAccent)
                } else {
                    Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1.5)
                }
            }
            .frame(width: 20, height: 20)
            .scaleEffect(set.done && !play.shown ? 0.3 : 1)
            .opacity(set.done && !play.shown ? 0 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.5).delay(0.5 + Double(index) * 0.22), value: play.shown)
        }
        .padding(.horizontal, 8).frame(height: 26)
        .background(set.done ? Color.clear : Palette.amberSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(set.done ? Color.clear : Palette.amberBar, lineWidth: 1.2))
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
                .scaledFont(18, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.amber)
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
