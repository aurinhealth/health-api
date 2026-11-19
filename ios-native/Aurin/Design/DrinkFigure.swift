import SwiftUI

/// Jídlo → Pití: instead of a line, a figure fills up as the day's drinks add
/// up to the goal, and does something once the goal is reached (the whale
/// blows a spout, the flower blooms…). Chosen in Nastavení → Postavička pití.
enum DrinkFigureKind: String, CaseIterable, Identifiable {
    case bottle, whale, aquarium, flower, drop, glass, octopus, line

    static let storageKey = "drinkFigure"
    static let animateKey = "drinkFigureAnimate"
    static let fallback = DrinkFigureKind.whale

    /// Drawn with depth and moved by springs (DrinkMotion, DrinkFigureArt); the others keep the classic drawing.
    var lively: Bool { self == .whale || self == .octopus || self == .drop }

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
        case .drop: return "ráno spí, v cíli rozvlní hladinu"
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

/// A short move of a classic figure: an idle one between drinks, or its answer
/// to a drink (the lively ones have their own in DrinkMotion). Each starts and
/// ends in the figure's still pose, so stopping it any time leaves no jump.
enum DrinkGesture: Equatable {
    case sway, ripple, swim, bubbles, goal

    /// How long it plays, in seconds.
    var length: Double {
        switch self {
        case .swim: return 2.4
        case .goal: return 1.8
        case .sway, .ripple, .bubbles: return 1.6
        }
    }

    /// The idle moves of a figure at this fill: none at 0 %, at the goal a
    /// small version of the goal effect.
    static func idle(for kind: DrinkFigureKind, fraction: Double) -> [DrinkGesture] {
        if kind == .line || kind.lively || fraction <= 0 { return [] }
        if fraction >= 0.999 { return [.goal] }
        switch kind {
        case .aquarium: return [.swim, .bubbles]
        case .flower: return [.sway]
        case .bottle: return [.bubbles, .ripple]
        case .glass: return [.bubbles]
        case .whale, .octopus, .drop, .line: return []
        }
    }

    /// The answer to a drink below the goal (at the goal the goal effect plays).
    static func reaction(for kind: DrinkFigureKind) -> DrinkGesture? {
        switch kind {
        case .aquarium: return .swim
        case .flower: return .sway
        case .bottle, .glass: return .bubbles
        case .whale, .octopus, .drop, .line: return nil
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

    var body: some View {
        Group {
            if kind.lively {
                DrinkFigureLive(kind: kind, fraction: fraction, animate: animate, idle: idle, shown: shown).id(kind)
            } else {
                DrinkFigureClassic(kind: kind, fraction: fraction, animate: animate, idle: idle, shown: shown)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel(L10n.f("%@, %@ %% cíle", kind.label, Fmt.int(min(fraction, 9.99) * 100)))
    }
}

/// A lively figure (whale, octopus, drop). A drink falls in, the figure
/// squashes, the water rises past the new level and settles, and the figure
/// answers in its own way; at the goal it jumps once and keeps its mark. Its
/// motion is stepped by DrinkMotion while the timeline runs; once everything
/// rests the timeline pauses, so a still figure costs nothing.
private struct DrinkFigureLive: View {
    let kind: DrinkFigureKind
    let fraction: Double
    let animate: Bool
    let idle: DrinkFigureIdle
    let shown: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var motion: DrinkMotion
    /// Something moves, the timeline runs.
    @State private var moving = false
    @State private var onScreen = true

    init(kind: DrinkFigureKind, fraction: Double, animate: Bool, idle: DrinkFigureIdle, shown: Bool) {
        self.kind = kind
        self.fraction = fraction
        self.animate = animate
        self.idle = idle
        self.shown = shown
        _motion = State(initialValue: DrinkMotion(kind: kind, fraction: min(max(fraction, 0), 1)))
    }

    /// The figure may move now: no Reduce Motion or Low Power Mode, the app is open, its card shown and on screen.
    private var live: Bool {
        if reduceMotion || LowPower.shared.on { return false }
        if !shown || !onScreen { return false }
        return scenePhase == .active
    }

    private var stage: Int {
        if fraction <= 0 { return 0 }
        if fraction >= 0.999 { return 2 }
        return 1
    }

    private struct IdleRun: Hashable {
        let stage: Int
        let idle: DrinkFigureIdle
        let live: Bool
    }

    var body: some View {
        let level = min(max(fraction, 0), 1)
        let moves = animate && live
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !moving)) { context in
            DrinkFigureArt(kind: kind, pose: motion.advance(to: context.date, fraction: level, moves: moves))
        }
        .modifier(ScreenVisibility(onScreen: $onScreen))
        .onChange(of: fraction) {
            if moves { moving = true }
        }
        .onChange(of: live) {
            if !live {
                motion.rest()
                moving = false
            }
        }
        .task(id: moving) { await stopWhenResting() }
        .task(id: IdleRun(stage: stage, idle: idle, live: live)) { await idleMoves() }
    }

    /// Pauses the timeline once the motion rests (at the latest 6 s after its last move started).
    private func stopWhenResting() async {
        guard moving else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(100))
            if Task.isCancelled { return }
            let late = Date.now.timeIntervalSince(motion.started) > 6
            if !motion.active || late {
                if late { motion.rest() }
                moving = false
                return
            }
        }
    }

    /// A short move now and then while the figure may move; a new key (shown,
    /// hidden, another stage) starts over.
    private func idleMoves() async {
        guard idle != .off, live else { return }
        try? await Task.sleep(for: .seconds(idle == .once ? 0.6 : Double.random(in: 2...4)))
        var last: DrinkMotion.Move?
        while !Task.isCancelled {
            let all = motion.idleMoves
            let fresh = all.filter { $0 != last }
            guard let next = fresh.randomElement() ?? all.first else { return }
            last = next
            if !motion.active {
                motion.play(next)
                moving = true
            }
            if idle == .once { return }
            let pause = fraction <= 0 ? Double.random(in: 30...45) : Double.random(in: 20...40)
            try? await Task.sleep(for: .seconds(pause))
        }
    }
}

/// A classic figure (bottle, aquarium, flower, lemonade, the line).
private struct DrinkFigureClassic: View {
    let kind: DrinkFigureKind
    let fraction: Double
    let animate: Bool
    let idle: DrinkFigureIdle
    let shown: Bool
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
    var animatableData: Double {
        get { fraction }
        set { fraction = newValue }
    }

    private var water: Color { Color(light: 0x4FA3D9, dark: 0x3C8FCB) }
    private var waterDeep: Color { Color(light: 0x2E86C1, dark: 0x2A74A8) }
    private var empty: Color { Color(light: 0xEAF3F9, dark: 0x1D2932) }
    private var outline: Color { Palette.blue }
    private let face = Color(light: 0x1B1A17, dark: 0x101010)
    private let gold = Color(light: 0xF2B93B, dark: 0xF5C451)
    private let pink = Color(light: 0xF28AA0, dark: 0xF59BB0)
    private let orange = Color(light: 0xE8833A, dark: 0xF0954F)
    private let leaf = Color(light: 0x5BAE6A, dark: 0x6CC07B)

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

    private func stroke(_ ctx: inout GraphicsContext, _ path: Path, _ color: Color, _ width: CGFloat) {
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }

    // MARK: Figures

    private func draw(_ ctx: inout GraphicsContext) {
        switch kind {
        case .bottle: bottle(&ctx)
        case .aquarium: aquarium(&ctx)
        case .flower: flower(&ctx)
        case .glass: glass(&ctx)
        case .line: line(&ctx)
        case .whale, .octopus, .drop: break
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
                                Image(systemName: "checkmark").scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(Palette.onAccent)
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
