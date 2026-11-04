import SwiftUI

/// Jídlo → Pití: instead of a line, a figure fills up as the day's drinks add
/// up to the goal, and does something once the goal is reached (the whale
/// blows a spout, the flower blooms…). Chosen in Nastavení → Postavička pití.
enum DrinkFigureKind: String, CaseIterable, Identifiable {
    case bottle, whale, aquarium, flower, drop, glass, octopus, line

    static let storageKey = "drinkFigure"
    static let animateKey = "drinkFigureAnimate"
    static let fallback = DrinkFigureKind.whale

    var id: String { rawValue }

    var label: String { L10n.tr(czechLabel) }

    private var czechLabel: String {
        switch self {
        case .bottle: return "Láhev"
        case .whale: return "Velryba"
        case .aquarium: return "Akvárium"
        case .flower: return "Květina"
        case .drop: return "Kapka"
        case .glass: return "Limonáda"
        case .octopus: return "Chobotnice"
        case .line: return "Jen čára"
        }
    }

    /// What it does when the goal is reached.
    var goal: String { L10n.tr(czechGoal) }

    private var czechGoal: String {
        switch self {
        case .bottle: return "zajiskří a ukáže fajfku"
        case .whale: return "vyfoukne gejzír"
        case .aquarium: return "rybka vyskočí nad hladinu"
        case .flower: return "roste s každým douškem a vykvete"
        case .drop: return "ráno spí, v cíli se rozzáří"
        case .glass: return "přibude led, brčko a citron"
        case .octopus: return "zamává chapadly a pošle srdíčka"
        case .line: return "jen čára jako dřív"
        }
    }

    static func from(_ raw: String) -> DrinkFigureKind { DrinkFigureKind(rawValue: raw) ?? fallback }
}

/// Where a figure stands, and so how much it moves on its own between drinks.
enum DrinkFigureIdle: Hashable {
    /// Still between drinks (the gallery, the other figures in the picker).
    case off
    /// One move soon after it appears (the figure just picked, the card on another panel than Jídlo).
    case once
    /// A short move now and then while it is on screen (the card on Jídlo).
    case fidget
}

/// A short move of the figure: an idle one between drinks, or its answer to a
/// drink. Each starts and ends in the figure's still pose, so stopping it any
/// time leaves no jump.
enum DrinkGesture: Equatable {
    case blink, sway, wave, flick, ripple, swim, bubbles, puff, snooze, goal

    /// How long it plays, in seconds.
    var length: Double {
        switch self {
        case .blink: return 0.3
        case .flick: return 1.2
        case .swim: return 2.4
        case .goal: return 1.8
        case .sway, .wave, .ripple, .bubbles, .puff, .snooze: return 1.6
        }
    }

    /// The idle moves of a figure at this fill: at 0 % it only blinks (the drop
    /// sleeps), at the goal a small version of the goal effect.
    static func idle(for kind: DrinkFigureKind, fraction: Double) -> [DrinkGesture] {
        if kind == .line { return [] }
        if fraction >= 0.999 { return [.goal] }
        if fraction <= 0 {
            switch kind {
            case .whale, .octopus: return [.blink]
            case .drop: return [.snooze]
            default: return []
            }
        }
        switch kind {
        case .octopus: return [.sway, .blink]
        case .whale: return [.blink, .flick, .ripple]
        case .aquarium: return [.swim, .bubbles]
        case .flower: return [.sway]
        case .drop: return [.blink, .ripple]
        case .bottle: return [.bubbles, .ripple]
        case .glass: return [.bubbles]
        case .line: return []
        }
    }

    /// The answer to a drink below the goal (at the goal the goal effect plays).
    static func reaction(for kind: DrinkFigureKind) -> DrinkGesture? {
        switch kind {
        case .octopus: return .wave
        case .whale: return .puff
        case .aquarium: return .swim
        case .flower: return .sway
        case .drop: return .blink
        case .bottle, .glass: return .bubbles
        case .line: return nil
        }
    }
}

/// The figure, `fraction` 0…1 of the goal. With `animate` the water moves for
/// a few seconds when the figure appears and after each drink, the figure
/// answers a drink, and the goal effect plays when the goal is reached. With
/// `idle` it also makes a short move now and then (blinks, sways its arms,
/// flicks its tail): first 2–4 s after it appears, then every 20–40 s. Between
/// moves the picture stands still, so the screen can slow down (drawing it 30
/// times a second the whole time cost battery). It only moves while the app is
/// open, the card's tab is shown and the card is on screen. With Reduce Motion
/// and in Low Power Mode it always stands still.
struct DrinkFigure: View {
    let kind: DrinkFigureKind
    let fraction: Double
    var size: CGFloat = 96
    var animate = true
    var idle: DrinkFigureIdle = .off
    /// The card's tab is open with nothing pushed over it (RootView keeps the other tabs built).
    var shown = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    /// The water still moves (the seconds after appearing or a new drink).
    @State private var stirred = false
    @State private var onScreen = true
    @State private var gesture: DrinkGesture?
    @State private var started = Date.distantPast
    /// Counts the moves, so a move that ends does not stop a newer one.
    @State private var plays = 0

    /// Reduce Motion or Low Power Mode: no motion at all.
    private var still: Bool {
        if reduceMotion { return true }
        return LowPower.shared.on
    }

    /// The figure may move now: the app is open, its card shown and on screen.
    private var live: Bool {
        if still { return false }
        if !shown { return false }
        if !onScreen { return false }
        return scenePhase == .active
    }

    /// 0 empty, 1 filling, 2 at the goal: the idle moves differ.
    private var stage: Int {
        if fraction <= 0 { return 0 }
        if fraction >= 0.999 { return 2 }
        return 1
    }

    private struct IdleRun: Hashable {
        let kind: DrinkFigureKind
        let stage: Int
        let idle: DrinkFigureIdle
        let live: Bool
    }

    var body: some View {
        let done = fraction >= 0.999
        let stirring = animate && stirred && (done || fraction > 0) && !still
        let playing = gesture != nil && live
        let moving = stirring || playing
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !moving)) { context in
            let step = playing ? progress(at: context.date) : 0
            DrinkFigureCanvas(kind: kind, fraction: min(max(fraction, 0), 1),
                              phase: phase(at: context.date, stirring: stirring, playing: playing, progress: step),
                              gesture: playing ? gesture : nil, progress: step)
        }
        .frame(width: size, height: size)
        .modifier(ScreenVisibility(onScreen: $onScreen))
        // A drink changes the fraction: the water moves again, the goal's effect a little longer.
        .task(id: fraction) {
            guard animate, !still else { return }
            stirred = true
            try? await Task.sleep(for: .seconds(fraction >= 0.999 ? 4 : 3))
            if !Task.isCancelled { stirred = false }
        }
        .onChange(of: fraction) { old, new in
            guard animate, new > old, new < 0.999, live, let move = DrinkGesture.reaction(for: kind) else { return }
            Task { await perform(move) }
        }
        .task(id: IdleRun(kind: kind, stage: stage, idle: idle, live: live)) {
            await idleMoves()
        }
        .accessibilityElement()
        .accessibilityLabel(L10n.f("%@, %@ %% cíle", kind.label, Fmt.int(min(fraction, 9.99) * 100)))
    }

    private func progress(at date: Date) -> Double {
        guard let gesture else { return 0 }
        return min(max(date.timeIntervalSince(started) / gesture.length, 0), 1)
    }

    /// The waves' and the goal effect's clock: running while the water is
    /// stirred; during the goal move it swings out and back to the still pose.
    private func phase(at date: Date, stirring: Bool, playing: Bool, progress: Double) -> Double {
        if stirring { return date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 600) }
        if playing, gesture == .goal { return 2.5 * sin(.pi * progress) }
        return 0
    }

    /// The idle moves while the figure may move; a new key (shown, hidden,
    /// another stage) starts over.
    private func idleMoves() async {
        guard idle != .off, live else { return }
        let moves = DrinkGesture.idle(for: kind, fraction: fraction)
        guard !moves.isEmpty else { return }
        try? await Task.sleep(for: .seconds(idle == .once ? 0.6 : Double.random(in: 2...4)))
        var last: DrinkGesture?
        while !Task.isCancelled {
            let fresh = moves.filter { $0 != last }
            guard let next = fresh.randomElement() ?? moves.first else { return }
            last = next
            await perform(next)
            if idle == .once || Task.isCancelled { return }
            let pause = fraction <= 0 ? Double.random(in: 30...45) : Double.random(in: 20...40)
            try? await Task.sleep(for: .seconds(pause))
        }
    }

    private func perform(_ move: DrinkGesture) async {
        plays += 1
        let mine = plays
        started = .now
        gesture = move
        try? await Task.sleep(for: .seconds(move.length))
        if plays == mine { gesture = nil }
    }
}

/// Whether the figure is on screen in its scroll view (iOS 18); on iOS 17 it
/// counts as on screen and the tab and app checks still stop it.
private struct ScreenVisibility: ViewModifier {
    @Binding var onScreen: Bool

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollVisibilityChange(threshold: 0.1) { visible in onScreen = visible }
        } else {
            content
        }
    }
}

/// Draws in a 110 × 110 box, scaled to the frame. The level animates between
/// two values (Animatable), the phase moves the waves and the goal effect.
struct DrinkFigureCanvas: View, @preconcurrency Animatable {
    let kind: DrinkFigureKind
    var fraction: Double
    var phase: Double
    /// The move playing (DrinkGesture), `progress` 0…1 through it.
    var gesture: DrinkGesture? = nil
    var progress: Double = 0
    @Environment(\.colorScheme) private var scheme

    var animatableData: Double {
        get { fraction }
        set { fraction = newValue }
    }

    private var water: Color { Color(light: 0x4FA3D9, dark: 0x3C8FCB) }
    private var waterDeep: Color { Color(light: 0x2E86C1, dark: 0x2A74A8) }
    private var empty: Color { Color(light: 0xEAF3F9, dark: 0x1D2932) }
    private var outline: Color { Palette.blue }
    private var ink: Color { Color(light: 0x1B4F72, dark: 0x8CC4EA) }
    private let face = Color(light: 0x1B1A17, dark: 0x101010)
    private let gold = Color(light: 0xF2B93B, dark: 0xF5C451)
    private let pink = Color(light: 0xF28AA0, dark: 0xF59BB0)
    private let orange = Color(light: 0xE8833A, dark: 0xF0954F)
    private let leaf = Color(light: 0x5BAE6A, dark: 0x6CC07B)
    private let purple = Color(light: 0x7C5CE0, dark: 0xB3A1FF)

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 110
            ctx.scaleBy(x: s, y: s)
            draw(&ctx)
        }
    }

    private var done: Bool { fraction >= 0.999 }

    /// How far the move `kind` is out: 0 at its start and end, 1 halfway.
    private func amount(_ kind: DrinkGesture) -> CGFloat {
        guard gesture == kind else { return 0 }
        return CGFloat(sin(.pi * progress))
    }

    /// A light ring around the eyes in dark mode, where the dark eye would
    /// vanish on the dark empty part and the octopus's head.
    private let rim = Color.white.opacity(0.75)

    /// An open eye; during a blink it squeezes shut.
    private func eye(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, shine: Bool = false) {
        let open = 1 - 0.85 * amount(.blink)
        if scheme == .dark {
            ctx.stroke(ellipse(x, y, r + 0.9, (r + 0.9) * open), with: .color(rim), lineWidth: 1.2)
        }
        ctx.fill(ellipse(x, y, r, r * open), with: .color(face))
        if shine, open > 0.7 {
            ctx.fill(circle(x + r / 3, y - r / 3, r * 0.3), with: .color(.white))
        }
    }

    /// A closed eye's arc (asleep, happy at the goal), ringed in dark mode too.
    private func lid(_ ctx: inout GraphicsContext, _ path: Path, _ width: CGFloat) {
        if scheme == .dark { stroke(&ctx, path, rim, width + 1.8) }
        stroke(&ctx, path, face, width)
    }

    /// Three bubbles rising through the water to its surface.
    private func bubbles(_ ctx: inout GraphicsContext, clip: Path, level: CGFloat, bottom: CGFloat, xs: [CGFloat]) {
        guard gesture == .bubbles, fraction > 0 else { return }
        var inner = ctx
        inner.clip(to: clip)
        for (n, x) in xs.enumerated() {
            let t = progress * 1.4 - Double(n) * 0.2
            guard t > 0, t < 1 else { continue }
            let y = bottom - 4 - (bottom - 4 - level) * CGFloat(t)
            let r = CGFloat(1.6 + Double(n) * 0.5)
            inner.stroke(circle(x + CGFloat(sin(t * 9)) * 1.5, y, r), with: .color(.white.opacity(0.7)), lineWidth: 1.2)
        }
    }

    // MARK: Shapes

    private func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
    }

    private func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path { ellipse(cx, cy, r, r) }

    private func rounded(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r, style: .continuous)
    }

    private func curve(_ from: CGPoint, _ c: CGPoint, _ to: CGPoint) -> Path {
        var p = Path()
        p.move(to: from)
        p.addQuadCurve(to: to, control: c)
        return p
    }

    private func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }

    /// The water surface at `level` with a wave, down to the bottom of the box.
    private func waterPath(_ level: CGFloat, amplitude: CGFloat, waves: Double, shift: Double) -> Path {
        var p = Path()
        p.move(to: pt(0, 120))
        // A ripple: a small extra wave running across, in and out with the move.
        let ripple = 1.8 * amount(.ripple)
        var x: CGFloat = 0
        while x <= 110 {
            let angle = Double(x) / 110 * waves * 2 * .pi + phase * 2 + shift
            let run = Double(x) / 110 * 3 * 2 * .pi - progress * 4 * .pi + shift
            p.addLine(to: pt(x, level + amplitude * CGFloat(sin(angle)) + ripple * CGFloat(sin(run))))
            x += 4
        }
        p.addLine(to: pt(110, 120))
        p.closeSubpath()
        return p
    }

    /// The inside of a shape: its empty colour and the water up to the level.
    /// Returns the level (y of the surface).
    @discardableResult
    private func fill(_ ctx: inout GraphicsContext, clip: Path, top: CGFloat, bottom: CGFloat, background: Color? = nil) -> CGFloat {
        let level = bottom - (bottom - top) * CGFloat(fraction)
        var inner = ctx
        inner.clip(to: clip)
        inner.fill(Path(CGRect(x: 0, y: 0, width: 110, height: 110)), with: .color(background ?? empty))
        if fraction > 0 {
            let amplitude: CGFloat = done ? 0 : 2.5
            inner.fill(waterPath(level, amplitude: amplitude, waves: 2, shift: 0), with: .color(water))
            inner.fill(waterPath(level + 6, amplitude: done ? 0 : 2, waves: 3, shift: 1), with: .color(waterDeep.opacity(0.35)))
        }
        return level
    }

    private func sparkle(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ scale: CGFloat, _ i: Double) {
        let pulse = CGFloat(0.85 + 0.2 * sin(phase * 3 + i))
        let k = scale * pulse
        var p = Path()
        let points: [(CGFloat, CGFloat)] = [(0, -6), (1.5, -1.5), (6, 0), (1.5, 1.5), (0, 6), (-1.5, 1.5), (-6, 0), (-1.5, -1.5)]
        for (n, point) in points.enumerated() {
            let q = pt(x + point.0 * k, y + point.1 * k)
            if n == 0 { p.move(to: q) } else { p.addLine(to: q) }
        }
        p.closeSubpath()
        ctx.fill(p, with: .color(gold))
    }

    private func heart(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y0: CGFloat, _ k: CGFloat, _ i: Double) {
        let y = y0 - CGFloat(2 * sin(phase * 2 + i))
        var p = Path()
        p.move(to: pt(x, y + 4 * k))
        p.addCurve(to: pt(x - 3 * k, y - 6 * k), control1: pt(x - 6 * k, y - 1 * k), control2: pt(x - 6 * k, y - 6 * k))
        p.addCurve(to: pt(x, y - 3.5 * k), control1: pt(x - 1.5 * k, y - 6 * k), control2: pt(x, y - 4.5 * k))
        p.addCurve(to: pt(x + 3 * k, y - 6 * k), control1: pt(x, y - 4.5 * k), control2: pt(x + 1.5 * k, y - 6 * k))
        p.addCurve(to: pt(x, y + 4 * k), control1: pt(x + 6 * k, y - 6 * k), control2: pt(x + 6 * k, y - 1 * k))
        p.closeSubpath()
        ctx.fill(p, with: .color(Color(light: 0xE5536B, dark: 0xF06A80)))
    }

    private func stroke(_ ctx: inout GraphicsContext, _ path: Path, _ color: Color, _ width: CGFloat) {
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }

    // MARK: Figures

    private func draw(_ ctx: inout GraphicsContext) {
        switch kind {
        case .bottle: bottle(&ctx)
        case .whale: whale(&ctx)
        case .aquarium: aquarium(&ctx)
        case .flower: flower(&ctx)
        case .drop: drop(&ctx)
        case .glass: glass(&ctx)
        case .octopus: octopus(&ctx)
        case .line: line(&ctx)
        }
    }

    private func line(_ ctx: inout GraphicsContext) {
        ctx.fill(rounded(10, 52, 90, 6, 3), with: .color(Palette.track))
        ctx.fill(rounded(10, 52, 90 * CGFloat(fraction), 6, 3), with: .color(outline))
    }

    private func bottle(_ ctx: inout GraphicsContext) {
        var clip = rounded(33, 26, 44, 78, 14)
        clip.addPath(rounded(45, 10, 20, 20, 4))
        let level = fill(&ctx, clip: clip, top: 22, bottom: 104)
        bubbles(&ctx, clip: clip, level: level, bottom: 104, xs: [46, 58, 66])
        stroke(&ctx, rounded(33, 26, 44, 78, 14), outline, 2.5)
        stroke(&ctx, rounded(45, 10, 20, 18, 4), outline, 2.5)
        ctx.fill(rounded(42, 6, 26, 7, 3), with: .color(outline))
        if done {
            sparkle(&ctx, 22, 30, 1.1, 0)
            sparkle(&ctx, 90, 22, 0.8, 1.5)
            sparkle(&ctx, 92, 60, 0.9, 3)
            ctx.fill(circle(55, 66, 11), with: .color(.white))
            var check = Path()
            check.move(to: pt(49, 66))
            check.addLine(to: pt(53, 70))
            check.addLine(to: pt(61, 61))
            stroke(&ctx, check, outline, 3)
        }
    }

    /// The tail, turned a little while the whale flicks it.
    private func whaleTail() -> Path {
        let flick = amount(.flick) * CGFloat(sin(progress * 4 * .pi))
        let turn = CGAffineTransform(translationX: 82, y: 62).rotated(by: flick * .pi / 20).translatedBy(x: -82, y: -62)
        return whaleTailShape().applying(turn)
    }

    private func whaleTailShape() -> Path {
        var p = Path()
        p.move(to: pt(80, 58))
        p.addCurve(to: pt(104, 30), control1: pt(92, 52), control2: pt(96, 40))
        p.addCurve(to: pt(100, 52), control1: pt(106, 40), control2: pt(104, 48))
        p.addCurve(to: pt(106, 70), control1: pt(106, 54), control2: pt(108, 62))
        p.addCurve(to: pt(84, 70), control1: pt(98, 64), control2: pt(92, 64))
        return p
    }

    private func whale(_ ctx: inout GraphicsContext) {
        var clip = ellipse(50, 62, 38, 28)
        var tail = whaleTail()
        tail.closeSubpath()
        clip.addPath(tail)
        fill(&ctx, clip: clip, top: 30, bottom: 92)
        stroke(&ctx, ellipse(50, 62, 38, 28), ink, 2.5)
        stroke(&ctx, whaleTail(), ink, 2.5)
        if done {
            // Goal reached: the eye closes into a happy arc, a blush and a wider smile.
            lid(&ctx, curve(pt(26, 57), pt(30, 51.5), pt(34, 57)), 2.4)
            ctx.fill(ellipse(24, 66, 4, 2.4), with: .color(pink.opacity(0.45)))
            stroke(&ctx, curve(pt(21, 69), pt(32, 79), pt(43, 69)), ink, 2)
        } else {
            eye(&ctx, 30, 56, 3.6, shine: true)
            stroke(&ctx, curve(pt(22, 70), pt(32, 76), pt(42, 70)), ink, 2)
        }
        let puff = amount(.puff)
        if done || puff > 0 {
            // The goal's spout; a drink before the goal puffs a small one.
            var inner = ctx
            if !done {
                inner.opacity = Double(puff)
                inner.translateBy(x: 48, y: 32)
                inner.scaleBy(x: 0.4 + 0.5 * puff, y: 0.4 + 0.5 * puff)
                inner.translateBy(x: -48, y: -32)
            }
            whaleSpout(&inner)
        }
    }

    private func whaleSpout(_ ctx: inout GraphicsContext) {
        let lift = CGFloat(1.5 * sin(phase * 4))
        var spout = Path()
        spout.move(to: pt(48, 32))
        spout.addCurve(to: pt(34, 16 - lift), control1: pt(46, 20), control2: pt(40, 14 - lift))
        spout.move(to: pt(48, 32))
        spout.addCurve(to: pt(62, 14 - lift), control1: pt(50, 18), control2: pt(56, 12 - lift))
        spout.move(to: pt(48, 32))
        spout.addLine(to: pt(48, 12 - lift))
        stroke(&ctx, spout, water, 3)
        for (x, y) in [(32.0, 12.0), (64.0, 10.0), (48.0, 6.0)] {
            ctx.fill(circle(CGFloat(x), CGFloat(y) - lift * 1.5, 2.5), with: .color(water))
        }
    }

    private func fish(_ ctx: inout GraphicsContext, x: CGFloat = 55, y: CGFloat, angle: Double = 0, back: Bool = false) {
        var inner = ctx
        inner.translateBy(x: x, y: y)
        inner.rotate(by: .degrees(angle))
        if back { inner.scaleBy(x: -1, y: 1) }
        inner.fill(ellipse(0, 0, 11, 7), with: .color(orange))
        var tail = Path()
        tail.move(to: pt(10, 0))
        tail.addLine(to: pt(19, -6))
        tail.addLine(to: pt(19, 6))
        tail.closeSubpath()
        inner.fill(tail, with: .color(orange))
        inner.fill(circle(-5, -1.5, 1.8), with: .color(face))
    }

    private func aquarium(_ ctx: inout GraphicsContext) {
        var bowl = Path()
        bowl.move(to: pt(22, 30))
        bowl.addLine(to: pt(88, 30))
        bowl.addCurve(to: pt(92, 88), control1: pt(100, 44), control2: pt(102, 70))
        bowl.addCurve(to: pt(18, 88), control1: pt(84, 100), control2: pt(26, 100))
        bowl.addCurve(to: pt(22, 30), control1: pt(8, 70), control2: pt(10, 44))
        bowl.closeSubpath()
        let level = fill(&ctx, clip: bowl, top: 30, bottom: 100)
        stroke(&ctx, bowl, outline, 2.5)
        ctx.fill(rounded(18, 26, 74, 6, 3), with: .color(outline))
        if done {
            let jump = CGFloat(3 * sin(phase * 3))
            fish(&ctx, y: 12 - jump, angle: -25)
            stroke(&ctx, curve(pt(30, 36), pt(34, 26), pt(40, 30)), .white, 2)
            stroke(&ctx, curve(pt(80, 36), pt(76, 26), pt(70, 30)), .white, 2)
            sparkle(&ctx, 86, 12, 0.8, 0)
        } else {
            let swim = CGFloat(fraction > 0 ? 1.5 * sin(phase * 2) : 0)
            let y = fraction > 0 ? min(max(level + 12, 44), 88) + swim : 88
            // A lap: the fish swims to the left wall and back, turning round.
            let lap = gesture == .swim && fraction > 0
            let dx = lap ? -24 * CGFloat(sin(2 * .pi * progress)) : 0
            fish(&ctx, x: 55 + dx, y: y, back: lap && cos(2 * .pi * progress) < 0)
            bubbles(&ctx, clip: bowl, level: level, bottom: 96, xs: [40, 50, 60])
        }
    }

    private func flower(_ ctx: inout GraphicsContext) {
        var pot = Path()
        pot.move(to: pt(34, 74))
        pot.addLine(to: pt(76, 74))
        pot.addLine(to: pt(71, 104))
        pot.addLine(to: pt(39, 104))
        pot.closeSubpath()
        fill(&ctx, clip: pot, top: 76, bottom: 104, background: Color(light: 0xF3E2D3, dark: 0x3A2C22))

        let h = CGFloat(8 + 46 * fraction)
        let sway = done ? CGFloat(1.2 * sin(phase * 1.5)) : 2.4 * amount(.sway) * CGFloat(sin(progress * 3 * .pi))
        var stem = Path()
        stem.move(to: pt(55, 74))
        stem.addCurve(to: pt(55 + sway, 74 - h), control1: pt(53, 74 - h * 0.5), control2: pt(57, 74 - h * 0.8))
        stroke(&ctx, stem, Color(light: 0x3E8E4F, dark: 0x58A868), 3.5)
        if fraction >= 0.3 { leafPath(&ctx, y: 74 - h * 0.35, side: -1) }
        if fraction >= 0.6 { leafPath(&ctx, y: 74 - h * 0.6, side: 1) }
        let top = 74 - h
        if done {
            for n in 0..<6 {
                let a = Double(n) * .pi / 3 + phase * 0.3
                let cx = 55 + sway + CGFloat(9 * cos(a)), cy = top + CGFloat(9 * sin(a))
                var petal = ctx
                petal.translateBy(x: cx, y: cy)
                petal.rotate(by: .radians(a))
                petal.fill(ellipse(0, 0, 7, 5), with: .color(pink))
            }
            ctx.fill(circle(55 + sway, top, 5.5), with: .color(gold))
            sparkle(&ctx, 24, 22, 0.8, 0)
            sparkle(&ctx, 88, 30, 0.9, 2)
        } else if fraction > 0 {
            ctx.fill(ellipse(55 + sway, top - 2, 4, 6), with: .color(leaf))
        }
        stroke(&ctx, pot, Color(light: 0xB4532F, dark: 0xD0714A), 2.5)
        ctx.fill(rounded(31, 69, 48, 8, 3), with: .color(Color(light: 0xC8673D, dark: 0xD0714A)))
    }

    private func leafPath(_ ctx: inout GraphicsContext, y: CGFloat, side: CGFloat) {
        var p = Path()
        p.move(to: pt(55, y))
        p.addCurve(to: pt(55 + 13 * side, y - 16), control1: pt(55 + 11 * side, y - 4), control2: pt(55 + 15 * side, y - 12))
        p.addCurve(to: pt(55, y), control1: pt(55 + 5 * side, y - 14), control2: pt(55 + 1 * side, y - 8))
        p.closeSubpath()
        ctx.fill(p, with: .color(leaf))
    }

    private func drop(_ ctx: inout GraphicsContext) {
        var shape = Path()
        shape.move(to: pt(55, 8))
        shape.addCurve(to: pt(24, 68), control1: pt(44, 26), control2: pt(24, 46))
        shape.addCurve(to: pt(55, 99), control1: pt(24, 85.1), control2: pt(37.9, 99))
        shape.addCurve(to: pt(86, 68), control1: pt(72.1, 99), control2: pt(86, 85.1))
        shape.addCurve(to: pt(55, 8), control1: pt(86, 46), control2: pt(66, 26))
        shape.closeSubpath()
        fill(&ctx, clip: shape, top: 10, bottom: 99)
        stroke(&ctx, shape, outline, 2.5)
        if fraction <= 0 {
            lid(&ctx, curve(pt(40, 66), pt(44, 69), pt(48, 66)), 2.2)
            lid(&ctx, curve(pt(62, 66), pt(66, 69), pt(70, 66)), 2.2)
            var mouth = Path()
            mouth.move(to: pt(50, 80))
            mouth.addLine(to: pt(60, 80))
            stroke(&ctx, mouth, face, 2)
            // Asleep: now and then the z's drift up a little.
            let drift = 5 * amount(.snooze)
            ctx.draw(Text(verbatim: "z").font(.system(size: 11)).foregroundStyle(Palette.faint), at: pt(80 + drift * 0.4, 30 - drift))
            ctx.draw(Text(verbatim: "z").font(.system(size: 8)).foregroundStyle(Palette.faint), at: pt(88 + drift * 0.6, 22 - drift * 1.4))
        } else if !done {
            eye(&ctx, 44, 64, 3.4)
            eye(&ctx, 66, 64, 3.4)
            stroke(&ctx, curve(pt(48, 78), pt(55, 83), pt(62, 78)), face, 2.2)
        } else {
            lid(&ctx, curve(pt(39, 66), pt(44, 60), pt(49, 66)), 2.4)
            lid(&ctx, curve(pt(61, 66), pt(66, 60), pt(71, 66)), 2.4)
            var mouth = curve(pt(44, 76), pt(55, 88), pt(66, 76))
            mouth.closeSubpath()
            ctx.fill(mouth, with: .color(face))
            ctx.fill(circle(36, 74, 4), with: .color(pink.opacity(0.7)))
            ctx.fill(circle(74, 74, 4), with: .color(pink.opacity(0.7)))
            sparkle(&ctx, 18, 30, 1, 0)
            sparkle(&ctx, 94, 44, 0.9, 2)
            sparkle(&ctx, 86, 96, 0.7, 4)
        }
    }

    private func cube(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ side: CGFloat, _ angle: Double) {
        var inner = ctx
        inner.translateBy(x: x + side / 2, y: y + side / 2)
        inner.rotate(by: .degrees(angle))
        inner.fill(rounded(-side / 2, -side / 2, side, side, 2), with: .color(.white.opacity(0.75)))
    }

    private func glass(_ ctx: inout GraphicsContext) {
        var cup = Path()
        cup.move(to: pt(28, 24))
        cup.addLine(to: pt(82, 24))
        cup.addLine(to: pt(76, 102))
        cup.addLine(to: pt(34, 102))
        cup.closeSubpath()
        var inside = ctx
        inside.clip(to: cup)
        let level = fill(&ctx, clip: cup, top: 26, bottom: 102)
        let bob = done ? CGFloat(1.2 * sin(phase * 2)) : 1.5 * amount(.bubbles) * CGFloat(sin(progress * 4 * .pi))
        if fraction >= 0.5 { cube(&inside, 40, level + 4 + bob, 12, 12) }
        bubbles(&ctx, clip: cup, level: level, bottom: 100, xs: [46, 56, 66])
        if done {
            cube(&inside, 58, level + 8 - bob, 11, -10)
            var straw = Path()
            straw.move(to: pt(66, 92))
            straw.addLine(to: pt(84, 4))
            stroke(&ctx, straw, Color(light: 0xE5536B, dark: 0xF06A80), 4)
        }
        stroke(&ctx, cup, outline, 2.5)
        if done {
            ctx.fill(circle(30, 24, 13), with: .color(Color(light: 0xF2D23B, dark: 0xF2D23B)))
            ctx.fill(circle(30, 24, 10), with: .color(Color(light: 0xFBEA8C, dark: 0xFBEA8C)))
            var spokes = Path()
            for (a, b) in [((30.0, 14.0), (30.0, 34.0)), ((20.0, 24.0), (40.0, 24.0)), ((23.0, 17.0), (37.0, 31.0)), ((37.0, 17.0), (23.0, 31.0))] {
                spokes.move(to: pt(CGFloat(a.0), CGFloat(a.1)))
                spokes.addLine(to: pt(CGFloat(b.0), CGFloat(b.1)))
            }
            ctx.stroke(spokes, with: .color(Color(light: 0xF2D23B, dark: 0xF2D23B)), lineWidth: 1.2)
            var mint = Path()
            mint.move(to: pt(84, 40))
            mint.addCurve(to: pt(90, 48), control1: pt(92, 34), control2: pt(96, 44))
            mint.addCurve(to: pt(84, 54), control1: pt(96, 50), control2: pt(92, 60))
            mint.closeSubpath()
            ctx.fill(mint, with: .color(leaf))
        }
    }

    private func octopus(_ ctx: inout GraphicsContext) {
        var head = Path()
        head.move(to: pt(22, 58))
        head.addCurve(to: pt(88, 58), control1: pt(22, 24), control2: pt(88, 24))
        head.addCurve(to: pt(22, 58), control1: pt(88, 70), control2: pt(22, 70))
        head.closeSubpath()
        fill(&ctx, clip: head, top: 26, bottom: 68, background: Color(light: 0xF1E6F6, dark: 0x2A2236))
        let wave = CGFloat(done ? 3 * sin(phase * 4) : 0)
        for (n, x) in [30, 44, 58, 72, 84].map({ CGFloat($0) }).enumerated() {
            var arm = Path()
            arm.move(to: pt(x, 64))
            if done && (n == 0 || n == 4) {
                let side: CGFloat = n == 0 ? -1 : 1
                arm.addCurve(to: pt(x + 8 * side, 38 - wave), control1: pt(x + 12 * side, 58), control2: pt(x + 14 * side, 44 - wave))
            } else if n == 4, amount(.wave) > 0 {
                // A drink: the last arm lifts into its goal pose and waves.
                let w = amount(.wave)
                let flap = 3 * w * CGFloat(sin(progress * 6 * .pi))
                arm.addCurve(to: pt(x - 2 + 10 * w, 100 - 62 * w + flap),
                             control1: pt(x - 6 + 18 * w, 76 - 18 * w),
                             control2: pt(x + 6 + 8 * w, 86 - 42 * w + flap))
            } else {
                let idle = 4 * amount(.sway) * CGFloat(sin(progress * 3 * .pi + Double(n) * 1.1))
                let sway = CGFloat(fraction > 0 ? 1.5 * sin(phase * 2 + Double(n)) : 0) + idle
                arm.addCurve(to: pt(x - 2 + sway, 100), control1: pt(x - 6, 76), control2: pt(x + 6 + sway, 86))
            }
            stroke(&ctx, arm, purple, 6)
        }
        stroke(&ctx, head, purple, 2.5)
        if done {
            lid(&ctx, curve(pt(40, 52), pt(45, 46), pt(50, 52)), 2.4)
            lid(&ctx, curve(pt(60, 52), pt(65, 46), pt(70, 52)), 2.4)
            stroke(&ctx, curve(pt(48, 58), pt(55, 65), pt(62, 58)), face, 2.2)
            heart(&ctx, 30, 16, 1.2, 0)
            heart(&ctx, 80, 12, 1, 1.5)
            heart(&ctx, 55, 6, 0.8, 3)
        } else {
            eye(&ctx, 45, 50, 3.2)
            eye(&ctx, 65, 50, 3.2)
            stroke(&ctx, curve(pt(50, 58), pt(55, 61), pt(60, 58)), face, 2)
        }
    }
}

/// Nastavení → Postavička pití, and the sheet from holding the figure in the
/// card: every figure half full, the chosen one outlined, plus "Jen čára".
struct DrinkFigurePicker: View {
    @AppStorage(DrinkFigureKind.storageKey) private var chosen = DrinkFigureKind.fallback.rawValue
    @AppStorage(DrinkFigureKind.animateKey) private var animate = true
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Plní se, jak piješ. Po splnění cíle něco udělá.").font(Typo.small).foregroundStyle(Palette.muted)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(DrinkFigureKind.allCases) { kind in
                    let on = DrinkFigureKind.from(chosen) == kind
                    Button { chosen = kind.rawValue } label: {
                        VStack(spacing: 6) {
                            // The figure just picked shows one of its moves.
                            DrinkFigure(kind: kind, fraction: 0.6, size: 72, animate: false, idle: on && animate ? .once : .off)
                            Text(kind.label).font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .cardSurface(cornerRadius: 18)
                        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.blue, lineWidth: on ? 2.5 : 0) }
                        .overlay(alignment: .topTrailing) {
                            if on {
                                Image(systemName: "checkmark").scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(.white)
                                    .frame(width: 20, height: 20).background(Palette.blue, in: Circle()).padding(7)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(kind.label + ", " + kind.goal)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if DrinkFigureKind.from(chosen) != .line {
                Text(L10n.f("Po splnění cíle: %@.", DrinkFigureKind.from(chosen).goal)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            SettingsGroup {
                SettingsToggle(title: "Animace", subtitle: "Občas se pohne, vlnky a efekt v cíli", isOn: $animate)
            }
        }
    }
}

struct DrinkFigureSettingsView: View {
    var body: some View {
        SettingsPage(title: "Postavička pití") { DrinkFigurePicker() }
    }
}
