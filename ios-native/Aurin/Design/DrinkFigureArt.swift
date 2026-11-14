import SwiftUI

/// Draws a lively figure (whale, octopus, drop) for one frame of its motion
/// (DrinkPose), in a 110 × 110 box scaled to the frame: water with a gradient
/// and a light surface, eyes on a white ground (readable in dark mode too), and
/// each figure's own mark at the goal: the whale's spout, the octopus's hearts
/// and raised arms, the drop's rings on the water.
struct DrinkFigureArt: View {
    let kind: DrinkFigureKind
    let pose: DrinkPose
    @Environment(\.colorScheme) private var scheme

    private var dark: Bool { scheme == .dark }
    private var shape: DrinkFigureShape { DrinkFigureShape.of(kind) }
    private var happy: Double { min(pose.happy, 1) }

    private let waterTop = Color(light: 0x74BEEC, dark: 0x57A9E0)
    private let waterDeep = Color(light: 0x2F86C4, dark: 0x256FA6)
    private let waterBack = Color(light: 0x9BD1F2, dark: 0x2E7FB8)
    private let emptyTop = Color(light: 0xF6FAFD, dark: 0x26333D)
    private let emptyBottom = Color(light: 0xDDEAF3, dark: 0x1A242C)
    private let ink = Color(light: 0x1B4F72, dark: 0x8CC4EA)
    private let part = Color(light: 0x8CC3E8, dark: 0x3F7FAE)
    private let face = Color(light: 0x14181C, dark: 0x14181C)
    private let pink = Color(light: 0xFF8FA6, dark: 0xFFA3B8)
    private let heartRed = Color(light: 0xE5536B, dark: 0xF06A80)
    private let purple = Color(light: 0x7C5CE0, dark: 0xA794F5)
    private let purpleDeep = Color(light: 0x6548C9, dark: 0x8C79E0)
    private let headTop = Color(light: 0xF8F1FB, dark: 0x352A45)
    private let headBottom = Color(light: 0xE7D8F1, dark: 0x241C30)
    private let ring = Color(light: 0x74BEEC, dark: 0x8CC4EA)
    private let shade = Color(red: 10.0 / 255, green: 40.0 / 255, blue: 70.0 / 255)

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 110
            ctx.scaleBy(x: s, y: s)
            draw(&ctx)
        }
    }

    private func draw(_ ctx: inout GraphicsContext) {
        if kind == .drop, pose.done, pose.happy > 0.02 { rings(&ctx) }
        // The body squashes and stretches from its foot and jumps at the goal.
        var body = ctx
        let q = pose.squash
        body.translateBy(x: shape.centre, y: 101 + pose.jump)
        body.scaleBy(x: 1 - q * 0.6, y: 1 + q)
        body.translateBy(x: -shape.centre, y: -101)
        switch kind {
        case .octopus: octopus(&body)
        case .drop: drop(&body)
        default: whale(&body)
        }
        if pose.asleep { snore(&ctx) }
        if kind == .whale { spout(&ctx) }
        if kind == .octopus, pose.done, pose.happy > 0.02 { hearts(&ctx) }
        if let fall = pose.fall { fallingDrop(&ctx, fall) }
        for particle in pose.particles where particle.kind != .bubble { draw(&ctx, particle) }
    }

    // MARK: Shapes

    private func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }

    private func ellipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double) -> Path {
        Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
    }

    private func circle(_ cx: Double, _ cy: Double, _ r: Double) -> Path { ellipse(cx, cy, r, r) }

    private func curve(_ from: CGPoint, _ control: CGPoint, _ to: CGPoint) -> Path {
        var p = Path()
        p.move(to: from)
        p.addQuadCurve(to: to, control: control)
        return p
    }

    private func turned(_ path: Path, about pivot: CGPoint, by angle: Double) -> Path {
        let turn = CGAffineTransform(translationX: pivot.x, y: pivot.y).rotated(by: angle).translatedBy(x: -pivot.x, y: -pivot.y)
        return path.applying(turn)
    }

    private func stroke(_ ctx: inout GraphicsContext, _ path: Path, _ color: Color, _ width: Double) {
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }

    private func heart(_ x: Double, _ y: Double, _ k: Double) -> Path {
        var p = Path()
        p.move(to: pt(x, y + 4 * k))
        p.addCurve(to: pt(x - 3 * k, y - 6 * k), control1: pt(x - 6 * k, y - 1 * k), control2: pt(x - 6 * k, y - 6 * k))
        p.addCurve(to: pt(x, y - 3.5 * k), control1: pt(x - 1.5 * k, y - 6 * k), control2: pt(x, y - 4.5 * k))
        p.addCurve(to: pt(x + 3 * k, y - 6 * k), control1: pt(x, y - 4.5 * k), control2: pt(x + 1.5 * k, y - 6 * k))
        p.addCurve(to: pt(x, y + 4 * k), control1: pt(x + 6 * k, y - 6 * k), control2: pt(x + 6 * k, y - 1 * k))
        p.closeSubpath()
        return p
    }

    // MARK: Water

    /// The surface at `x`: the level, tilted and waved while the water still moves.
    private func surface(_ x: Double, _ level: Double, shift: Double) -> Double {
        let tilt = pose.slosh * (x - shape.centre) * 0.12
        let wave = (1 + 1.9 * pose.energy) * sin(x / 110 * 4.2 * .pi + shift - pose.wavePhase)
        return level + tilt + wave
    }

    private func waterPath(_ level: Double, shift: Double) -> Path {
        var p = Path()
        p.move(to: pt(-2, 120))
        var x = -2.0
        while x <= 112 {
            p.addLine(to: pt(x, surface(x, level, shift: shift)))
            x += 3
        }
        p.addLine(to: pt(112, 120))
        p.closeSubpath()
        return p
    }

    /// The inside of the body: its empty colour, the water up to the level with
    /// a lighter wave behind and a light line on the surface, bubbles rising
    /// beside the face, and a soft shade towards the bottom.
    private func water(_ ctx: inout GraphicsContext, clip: Path, empty: [Color]) {
        var inner = ctx
        inner.clip(to: clip)
        let box = Path(CGRect(x: -10, y: -10, width: 130, height: 130))
        inner.fill(box, with: .linearGradient(Gradient(colors: empty), startPoint: pt(0, shape.top), endPoint: pt(0, shape.bottom)))
        let level = shape.bottom - (shape.bottom - shape.top) * pose.level
        if pose.level > 0.002 {
            inner.fill(waterPath(level - 2.6, shift: 2.1), with: .color(waterBack.opacity(0.75)))
            inner.fill(waterPath(level, shift: 0),
                       with: .linearGradient(Gradient(colors: [waterTop, waterDeep]), startPoint: pt(0, level), endPoint: pt(0, shape.bottom + 4)))
            var line = Path()
            line.move(to: pt(-2, surface(-2, level + 0.9, shift: 0)))
            var x = 1.0
            while x <= 112 {
                line.addLine(to: pt(x, surface(x, level + 0.9, shift: 0)))
                x += 3
            }
            stroke(&inner, line, .white.opacity(0.6), 1.1)
            for bubble in pose.particles where bubble.kind == .bubble && bubble.y >= level + 3 {
                let k = sin(.pi * min(max(bubble.age / bubble.life, 0), 1))
                let x = bubble.x + 1.6 * sin(bubble.age * 8 + bubble.seed)
                inner.stroke(circle(x, bubble.y, bubble.size), with: .color(.white.opacity(0.75 * k)), lineWidth: 1)
            }
        }
        let from = shape.top + (shape.bottom - shape.top) * 0.55
        inner.fill(box, with: .linearGradient(Gradient(colors: [shade.opacity(0), shade.opacity(dark ? 0.3 : 0.16)]),
                                              startPoint: pt(0, from), endPoint: pt(0, shape.bottom)))
    }

    /// A soft light spot on the body, in light mode only (in dark it reads as a grey smudge).
    private func gloss(_ ctx: inout GraphicsContext, clip: Path, at centre: CGPoint, _ rx: Double, _ ry: Double, turn: Double) {
        guard !dark else { return }
        var inner = ctx
        inner.clip(to: clip)
        let spot = ellipse(0, 0, rx, ry).applying(CGAffineTransform(translationX: centre.x, y: centre.y).rotated(by: turn))
        inner.fill(spot, with: .color(.white.opacity(0.5)))
    }

    // MARK: Face

    /// An open eye on a white ground with one light spot; it blinks, looks
    /// aside now and then, and at the goal closes into a happy arc.
    private func eye(_ ctx: inout GraphicsContext, _ x: Double, _ y: Double, _ r: Double) {
        if pose.happy > 0.5 {
            stroke(&ctx, curve(pt(x - r * 1.2, y + r * 0.4), pt(x, y - r * 1.4), pt(x + r * 1.2, y + r * 0.4)), face, r * 0.58)
            return
        }
        let open = 1 - 0.93 * pose.blink
        let gx = pose.gaze * 1.2
        let gy = pose.gaze < 0 ? pose.gaze * 4 : 0
        ctx.fill(ellipse(x, y, r + 1.25, (r + 1.25) * open), with: .color(.white))
        ctx.fill(ellipse(x + gx, y + gy, r, r * open), with: .color(face))
        if open > 0.6 {
            ctx.fill(circle(x + gx + r * 0.34, y + gy - r * 0.36, r * 0.34), with: .color(.white))
        }
    }

    /// A sleeping eye: an arc on a light ground, so it shows on the dark empty body too.
    private func sleepingEye(_ ctx: inout GraphicsContext, _ x: Double, _ y: Double, _ r: Double) {
        let arc = curve(pt(x - r * 1.15, y), pt(x, y + r * 0.95), pt(x + r * 1.15, y))
        stroke(&ctx, arc, .white.opacity(0.9), r * 0.6 + 1.7)
        stroke(&ctx, arc, face, r * 0.6)
    }

    /// The blush, only with the goal's happy face.
    private func blush(_ ctx: inout GraphicsContext, _ x: Double, _ y: Double, _ rx: Double, _ ry: Double) {
        guard pose.happy > 0.05 else { return }
        ctx.fill(ellipse(x, y, rx, ry), with: .color(pink.opacity(0.95 * happy)))
    }

    /// The mouth's colour: dark on the water, the outline's colour while the dark-mode body above the water is dark.
    private func mouth(_ outline: Color, until level: Double) -> Color {
        dark && pose.level < level ? outline : face
    }

    // MARK: Whale

    private func whale(_ ctx: inout GraphicsContext) {
        // A little smaller than its box, so the swinging tail stays inside.
        ctx.translateBy(x: 50, y: 101)
        ctx.scaleBy(x: 0.9, y: 0.9)
        ctx.translateBy(x: -50, y: -101)
        // The tail and the fin take colour as the whale fills.
        let filled = min(max(pose.level * 2, 0), 1)

        var tail = Path()
        tail.move(to: pt(80, 56))
        tail.addCurve(to: pt(95, 37), control1: pt(88, 53), control2: pt(93, 46))
        tail.addCurve(to: pt(77, 21), control1: pt(90, 31), control2: pt(85, 23))
        tail.addCurve(to: pt(97, 29), control1: pt(84, 19), control2: pt(92, 22))
        tail.addCurve(to: pt(109, 21), control1: pt(100, 23), control2: pt(104, 20))
        tail.addCurve(to: pt(100, 42), control1: pt(108, 30), control2: pt(104, 38))
        tail.addCurve(to: pt(86, 68), control1: pt(99, 52), control2: pt(94, 62))
        tail.closeSubpath()
        tail = turned(tail, about: pt(86, 60), by: pose.tail)
        ctx.fill(tail, with: .color(emptyBottom))
        ctx.fill(tail, with: .color(part.opacity(filled)))
        stroke(&ctx, tail, ink, 2.3)

        var body = Path()
        body.move(to: pt(12, 64))
        body.addCurve(to: pt(54, 31), control1: pt(12, 42), control2: pt(32, 31))
        body.addCurve(to: pt(87, 54), control1: pt(70, 31), control2: pt(82, 40))
        body.addCurve(to: pt(82, 80), control1: pt(90, 62), control2: pt(88, 72))
        body.addCurve(to: pt(46, 95), control1: pt(74, 90), control2: pt(60, 95))
        body.addCurve(to: pt(12, 64), control1: pt(26, 95), control2: pt(12, 82))
        body.closeSubpath()
        water(&ctx, clip: body, empty: [emptyTop, emptyBottom])
        gloss(&ctx, clip: body, at: pt(33, 42), 12, 4.6, turn: -0.5)
        stroke(&ctx, body, ink, 2.4)

        var fin = Path()
        fin.move(to: pt(46, 77))
        fin.addCurve(to: pt(62, 91), control1: pt(53, 75), control2: pt(61, 80))
        fin.addCurve(to: pt(46, 77), control1: pt(54, 91), control2: pt(48, 86))
        fin.closeSubpath()
        fin = turned(fin, about: pt(47, 78), by: pose.fin)
        ctx.fill(fin, with: .color(emptyBottom))
        ctx.fill(fin, with: .color(part.opacity(filled)))
        stroke(&ctx, fin, ink, 2)

        blush(&ctx, 20, 69.5, 4.6, 2.7)
        if pose.asleep {
            sleepingEye(&ctx, 29, 59.5, 4)
            stroke(&ctx, curve(pt(21, 73), pt(26, 76.4), pt(31, 73.5)), dark ? ink : face, 2)
        } else {
            eye(&ctx, 29, 58, 4.1)
            stroke(&ctx, curve(pt(18, 72), pt(27, 77.5 + 3 * happy), pt(38, 72 - 1.5 * happy)), mouth(ink, until: 0.38), 2)
        }
        ctx.fill(ellipse(52, 31.6, 2.6, 1.1), with: .color(ink.opacity(0.55)))
    }

    /// The whale's spout: standing at the goal, a small one after each drink.
    private func spout(_ ctx: inout GraphicsContext) {
        let k = pose.done ? happy : 0.55 * pose.puff
        guard k > 0.02 else { return }
        let lift = 1.6 * pose.twinkle
        var inner = ctx
        inner.translateBy(x: shape.hole.x, y: Double(shape.hole.y) + pose.jump)
        inner.scaleBy(x: k, y: k)
        var jets = Path()
        jets.move(to: .zero)
        jets.addCurve(to: pt(-12, -15 - lift), control1: pt(-1.5, -10), control2: pt(-6, -16 - lift))
        jets.move(to: .zero)
        jets.addCurve(to: pt(12, -16 - lift), control1: pt(1.5, -11), control2: pt(6, -18 - lift))
        jets.move(to: .zero)
        jets.addLine(to: pt(0, -19 - lift))
        stroke(&inner, jets, waterTop, 2.6)
        let tips: [(Double, Double)] = [(-13.5, -12.5), (13.5, -13.5), (0, -23.5)]
        for tip in tips {
            let y = tip.1 - lift * 1.4
            inner.fill(circle(tip.0, y, 2.3), with: .color(waterTop))
            inner.fill(circle(tip.0 - 0.7, y - 0.7, 0.7), with: .color(.white.opacity(0.7)))
        }
    }

    // MARK: Octopus

    private func octopus(_ ctx: inout GraphicsContext) {
        let roots: [Double] = [29, 42, 55, 68, 81]
        for (n, root) in roots.enumerated() { arm(&ctx, n, root) }

        var head = Path()
        head.move(to: pt(19, 58))
        head.addCurve(to: pt(91, 58), control1: pt(19, 20), control2: pt(91, 20))
        head.addCurve(to: pt(55, 76), control1: pt(91, 71), control2: pt(80, 76))
        head.addCurve(to: pt(19, 58), control1: pt(30, 76), control2: pt(19, 71))
        head.closeSubpath()
        water(&ctx, clip: head, empty: [headTop, headBottom])
        gloss(&ctx, clip: head, at: pt(37, 34), 11, 4.4, turn: -0.62)
        stroke(&ctx, head, purpleDeep, 2.4)

        blush(&ctx, 35, 61, 4.2, 2.6)
        blush(&ctx, 75, 61, 4.2, 2.6)
        if pose.asleep {
            sleepingEye(&ctx, 44, 53, 3.8)
            sleepingEye(&ctx, 66, 53, 3.8)
            stroke(&ctx, curve(pt(51, 62), pt(55, 64.4), pt(59, 62)), dark ? purple : face, 2)
        } else {
            eye(&ctx, 44, 52, 3.9)
            eye(&ctx, 66, 52, 3.9)
            stroke(&ctx, curve(pt(49, 61), pt(55, 64 + 3.5 * happy), pt(61, 61)), mouth(purple, until: 0.32), 2)
        }
    }

    /// One arm, thinner towards its tip: a wave runs down it, asleep it is
    /// tucked in, and at the goal the two outer arms are raised.
    private func arm(_ ctx: inout GraphicsContext, _ n: Int, _ root: Double) {
        let side: Double = n < 2 ? -1 : (n > 2 ? 1 : 0)
        let spread = abs(Double(n) - 2)
        let outer = n == 0 || n == 4
        let raise = outer ? max(pose.raise, pose.done ? 0.85 * happy : 0) : 0
        let tuck = pose.tuck
        let steps = 10
        var last = pt(root, 70)
        for i in 1...steps {
            let s = Double(i) / Double(steps)
            let wave = pose.wave * 4.2 * s * sin(5.2 * pose.clock - s * 3.2 - Double(n) * 0.9)
            let fan = side * (spread * 1.3 * s + 4.5 * s * s) * (1 - tuck)
            let downX = root + fan + (55 - root) * 0.3 * tuck * s + wave
            let downY = 70 + (29 - 13 * tuck) * s - 4.5 * s * s * s * (1 - tuck)
            let upX = root + side * (3 + 14 * sin(s * .pi * 0.62)) + side * 3 * pose.flap * s * s
            let upY = 70 - 30 * s + 5 * s * s
            let next = pt(downX + (upX - downX) * raise, downY + (upY - downY) * raise)
            var piece = Path()
            piece.move(to: last)
            piece.addLine(to: next)
            stroke(&ctx, piece, purple, 8.2 - 4.2 * (s - 0.05))
            last = next
        }
    }

    /// The octopus's three hearts at the goal; they appear after the landing.
    private func hearts(_ ctx: inout GraphicsContext) {
        let spots: [(Double, Double, Double)] = [(22, 17, 1), (89, 14, 0.85), (55, 8.5, 0.7)]
        for (n, spot) in spots.enumerated() {
            let bob = 2.2 * pose.twinkle * sin(1.6 + Double(n) * 2)
            let path = heart(spot.0, spot.1 - bob, spot.2 * happy * pose.hearts)
            ctx.fill(path, with: .color(heartRed.opacity(happy * pose.hearts)))
        }
    }

    // MARK: Drop

    private func drop(_ ctx: inout GraphicsContext) {
        var body = Path()
        body.move(to: pt(55, 8))
        body.addCurve(to: pt(24, 68), control1: pt(44, 26), control2: pt(24, 46))
        body.addCurve(to: pt(55, 99), control1: pt(24, 85.1), control2: pt(37.9, 99))
        body.addCurve(to: pt(86, 68), control1: pt(72.1, 99), control2: pt(86, 85.1))
        body.addCurve(to: pt(55, 8), control1: pt(86, 46), control2: pt(66, 26))
        body.closeSubpath()
        water(&ctx, clip: body, empty: [emptyTop, emptyBottom])
        gloss(&ctx, clip: body, at: pt(40, 47), 4.6, 11, turn: 0.42)
        stroke(&ctx, body, ink, 2.4)

        if pose.asleep {
            sleepingEye(&ctx, 44, 66, 3.8)
            sleepingEye(&ctx, 66, 66, 3.8)
            stroke(&ctx, curve(pt(51, 80), pt(55, 82.4), pt(59, 80)), dark ? ink : face, 2)
        } else {
            blush(&ctx, 35, 74, 4.2, 2.8)
            blush(&ctx, 75, 74, 4.2, 2.8)
            eye(&ctx, 44, 64, 3.9)
            eye(&ctx, 66, 64, 3.9)
            stroke(&ctx, curve(pt(47 - 2 * happy, 77), pt(55, 83 + 4 * happy), pt(63 + 2 * happy, 77)), mouth(ink, until: 0.25), 2.1)
        }
    }

    /// The drop's mark at the goal: it stands on the water and two rings spread
    /// under it after the landing; now and then one more ring runs out.
    private func rings(_ ctx: inout GraphicsContext) {
        let reveal = pose.rings
        let grow = 0.4 + 0.6 * reveal
        let sizes: [(Double, Double, Double)] = [(33, 3.6, 0.95), (46, 5.4, 0.7)]
        for size in sizes {
            let alpha = size.2 * happy * reveal
            ctx.stroke(ellipse(55, 101, size.0 * grow, size.1 * grow), with: .color(ring.opacity(alpha)), lineWidth: 2.2)
        }
        let run = pose.twinkleProgress
        if run >= 0 {
            ctx.stroke(ellipse(55, 101, 22 + 26 * run, 2.4 + 3.2 * run), with: .color(ring.opacity(0.8 * (1 - run))), lineWidth: 1.8)
        }
    }

    // MARK: Around the figure

    /// Asleep at 0: two small z's beside the figure.
    private func snore(_ ctx: inout GraphicsContext) {
        let at = shape.snore
        ctx.draw(Text(verbatim: "z").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint), at: at)
        ctx.draw(Text(verbatim: "z").font(.system(size: 8, weight: .semibold)).foregroundStyle(Palette.faint),
                 at: CGPoint(x: at.x + 8, y: at.y - 9))
    }

    /// A drink falling in from above.
    private func fallingDrop(_ ctx: inout GraphicsContext, _ progress: Double) {
        let x = Double(shape.hole.x)
        let y = -5 + (Double(shape.hole.y) + 2) * progress * progress
        var p = Path()
        p.move(to: pt(x, y - 5.5))
        p.addCurve(to: pt(x, y + 3.4), control1: pt(x + 4.5, y), control2: pt(x + 3, y + 3.4))
        p.addCurve(to: pt(x, y - 5.5), control1: pt(x - 3, y + 3.4), control2: pt(x - 4.5, y))
        ctx.fill(p, with: .color(waterTop))
        ctx.fill(ellipse(x - 1, y + 0.6, 0.8, 1.2), with: .color(.white.opacity(0.7)))
    }

    private func draw(_ ctx: inout GraphicsContext, _ particle: DrinkParticle) {
        let u = particle.age / particle.life
        switch particle.kind {
        case .droplet:
            let alpha = u > 0.5 ? 1 - (u - 0.5) / 0.5 : 1
            let long = 1 + min(0.5, abs(particle.vy) / 160)
            ctx.fill(ellipse(particle.x, particle.y, particle.size, particle.size * long), with: .color(waterTop.opacity(alpha)))
            let spot = particle.size * 0.3
            ctx.fill(circle(particle.x - spot, particle.y - spot, spot), with: .color(.white.opacity(alpha * 0.7)))
        case .heart:
            // It pops in a little too large, then drifts up and fades.
            let a = particle.age / 0.28
            let pop = a < 1 ? 1 + 0.35 * sin(.pi * a) - (1 - a) * (1 - a) : 1
            let alpha = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1
            let x = particle.x + 2.5 * sin(particle.age * 4 + particle.seed)
            ctx.fill(heart(x, particle.y, particle.size * max(pop, 0.05)), with: .color(heartRed.opacity(alpha)))
        case .snore:
            var inner = ctx
            inner.opacity = sin(.pi * u)
            inner.draw(Text(verbatim: "z").font(.system(size: particle.size, weight: .semibold)).foregroundStyle(Palette.faint),
                       at: pt(particle.x, particle.y))
        case .bubble:
            break
        }
    }
}
