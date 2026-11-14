import SwiftUI

/// Where the parts of a lively figure sit in the 110 × 110 box.
struct DrinkFigureShape {
    /// The water's top and bottom inside the body.
    let top: Double
    let bottom: Double
    /// The body's middle, for squashing and the tilt of the water.
    let centre: Double
    /// Where a drink lands and the whale's spout starts.
    let hole: CGPoint
    /// Where bubbles rise, beside the face.
    let bubbles: [Double]
    let bubbleY: Double
    /// The sleeping figure's first "z".
    let snore: CGPoint

    static func of(_ kind: DrinkFigureKind) -> DrinkFigureShape {
        switch kind {
        case .octopus:
            return DrinkFigureShape(top: 22, bottom: 76, centre: 55, hole: CGPoint(x: 55, y: 24), bubbles: [25, 85, 26], bubbleY: 68, snore: CGPoint(x: 83, y: 15))
        case .drop:
            return DrinkFigureShape(top: 10, bottom: 99, centre: 55, hole: CGPoint(x: 55, y: 12), bubbles: [27, 83, 28], bubbleY: 72, snore: CGPoint(x: 81, y: 29))
        default:
            return DrinkFigureShape(top: 31, bottom: 95, centre: 50, hole: CGPoint(x: 52, y: 38), bubbles: [60, 69, 77], bubbleY: 84, snore: CGPoint(x: 63, y: 27))
        }
    }
}

/// A droplet, heart, bubble or "z" in the air around the figure.
struct DrinkParticle {
    enum Kind { case droplet, heart, bubble, snore }

    let kind: Kind
    var x: Double
    var y: Double
    var vx = 0.0
    var vy = 0.0
    var gravity = 0.0
    var age = 0.0
    var life = 1.0
    var size = 1.0
    /// Its own offset in a sway, so two do not move together.
    var seed = 0.0
}

/// One frame of a lively figure, all the drawing needs (DrinkFigureArt).
struct DrinkPose {
    /// The water's level, 0…1 (a little over while it settles).
    var level = 0.0
    /// The surface's tilt and how much it still moves, 0…1.
    var slosh = 0.0
    var energy = 0.0
    var wavePhase = 0.0
    /// Squash (below 0) and stretch (above 0) of the body, and its jump (points, up is negative).
    var squash = 0.0
    var jump = 0.0
    /// 0…1 with a small overshoot: the goal's happy face and mark.
    var happy = 0.0
    /// −1…1: where the eyes look (right is positive, up at a falling drop negative).
    var gaze = 0.0
    /// 1 asleep with the arms tucked in, 0 awake.
    var tuck = 0.0
    var blink = 0.0
    /// The whale's tail and fin, in radians.
    var tail = 0.0
    var fin = 0.0
    /// The octopus's arms: the wave running down them, its clock, how far the outer two are raised and their flap.
    var wave = 0.0
    var clock = 0.0
    var raise = 0.0
    var flap = 0.0
    /// The goal's mark moving a little now and then: 0…1…0, and how far through (−1 when it rests).
    var twinkle = 0.0
    var twinkleProgress = -1.0
    /// The whale's small spout after a drink, 0…1.
    var puff = 0.0
    /// The goal's mark appearing after the landing, 0…1: the drop's rings and the octopus's hearts.
    var rings = 1.0
    var hearts = 1.0
    var asleep = false
    var done = false
    /// A drink falling in, 0…1 through its fall.
    var fall: Double?
    var particles: [DrinkParticle] = []
}

/// What a lively drink figure (whale, octopus, drop) is doing: its springs, the
/// move it plays and the droplets around it. Stepped from the figure's timeline
/// while something moves; at rest every spring sits on its target, so the
/// picture can stop redrawing.
@MainActor
final class DrinkMotion {
    struct Spring {
        var x: Double
        var v = 0.0

        mutating func step(to target: Double, stiffness: Double, damping: Double, dt: Double) {
            v += (-stiffness * (x - target) - damping * v) * dt
            x += v * dt
        }

        /// Close enough to the target and slow enough: it stops there. Returns whether it rests.
        mutating func settle(at target: Double, within: Double, speed: Double) -> Bool {
            guard abs(x - target) < within, abs(v) < speed else { return false }
            x = target
            v = 0
            return true
        }
    }

    /// A short move; each starts and ends in the still pose.
    enum Move: Equatable {
        case blink, blinkTwice, flick, glance, ripple, wobble, snooze, react, goal, twinkle

        var length: Double {
            switch self {
            case .blink: return 0.26
            case .blinkTwice: return 0.64
            case .flick, .react: return 1.2
            case .glance: return 1.3
            case .ripple: return 1.8
            case .wobble: return 0.8
            case .snooze: return 1.9
            case .goal: return 2.2
            case .twinkle: return 1
            }
        }
    }

    private enum Event {
        /// The falling drink lands: the level goes to the new fraction.
        case impact(Double)
        /// Waking up: a stretch after the first drink.
        case stretch
        case lookBack
        /// The whale's spout: one droplet from the blowhole.
        case spout(big: Bool)
        /// The octopus's heart, to the left or the right of the head.
        case heart(left: Bool, big: Bool)
        /// The drop lands in the water: droplets from its foot.
        case splash
        /// The landing after the goal's jump.
        case land
        case snore(Int)
        case bubble
    }

    let kind: DrinkFigureKind
    private let shape: DrinkFigureShape
    private var holeX: Double { Double(shape.hole.x) }
    private var holeY: Double { Double(shape.hole.y) }
    /// The fraction the water is on its way to; a drink still falling has not changed it yet.
    private(set) var target: Double
    /// The fraction last asked for.
    private var asked: Double
    /// Something still moves; the figure's timeline runs while this holds.
    private(set) var active = false
    /// When the last move started, so a figure that is never drawn can be put to rest.
    private(set) var started = Date.distantPast

    private var level: Spring
    private var slosh = Spring(x: 0)
    private var squash = Spring(x: 0)
    private var happy: Spring
    private var gaze = Spring(x: 0)
    private var tuck: Spring
    private var gazeTarget = 0.0
    private var move: (kind: Move, start: Double)?
    private var particles: [DrinkParticle] = []
    private var events: [(at: Double, event: Event)] = []
    private var wavePhase = 0.0
    private var fall: Double?
    private var woke = -10.0
    private var clock = 0.0
    private var last: Date?

    init(kind: DrinkFigureKind, fraction: Double) {
        self.kind = kind
        shape = DrinkFigureShape.of(kind)
        target = fraction
        asked = fraction
        level = Spring(x: fraction)
        happy = Spring(x: fraction >= 0.999 ? 1 : 0)
        tuck = Spring(x: fraction <= 0 ? 1 : 0)
    }

    private var happyTarget: Double { target >= 0.999 ? 1 : 0 }
    private var tuckTarget: Double { target <= 0 ? 1 : 0 }

    /// The idle moves at this fill: asleep at 0 the "z" drifts, at the goal the mark moves a little.
    var idleMoves: [Move] {
        if target >= 0.999 { return [.twinkle] }
        if target <= 0 { return [.snooze] }
        switch kind {
        case .whale: return [.blinkTwice, .flick, .glance, .wobble]
        case .octopus: return [.ripple, .blink, .glance]
        default: return [.blinkTwice, .wobble, .glance]
        }
    }

    // MARK: What happens to the figure

    /// The frame at `date` for `fraction`. A new fraction starts its move when
    /// `moves` (a drink falls in, less water sinks), otherwise it is shown at once.
    func advance(to date: Date, fraction: Double, moves: Bool) -> DrinkPose {
        if fraction != asked {
            let more = fraction > asked
            asked = fraction
            if !moves {
                rest()
            } else if more {
                drink(to: fraction)
            } else {
                // Less water (a drink taken back): the level sinks, a drink still falling is dropped.
                events.removeAll { if case .impact = $0.event { return true } else { return false } }
                fall = nil
                gazeTarget = 0
                target = fraction
                begin()
            }
        }
        let gap = last.map { date.timeIntervalSince($0) } ?? 0
        last = date
        // A long gap is the paused timeline starting again, not time the figure moved through.
        if active, gap > 0 { step(gap > 0.25 ? 1.0 / 30 : gap) }
        return pose()
    }

    /// Plays an idle move.
    func play(_ kind: Move) {
        start(kind)
        begin()
    }

    /// Everything at rest at the fraction asked for, nothing in the air.
    func rest() {
        target = asked
        level = Spring(x: target)
        happy = Spring(x: happyTarget)
        tuck = Spring(x: tuckTarget)
        slosh = Spring(x: 0)
        squash = Spring(x: 0)
        gaze = Spring(x: 0)
        gazeTarget = 0
        move = nil
        particles = []
        events = []
        fall = nil
        woke = -10
        active = false
    }

    private func begin() {
        active = true
        started = .now
    }

    /// A drink: a drop falls in, then the figure answers (the `impact` event).
    private func drink(to fraction: Double) {
        fall = clock
        gazeTarget = -0.2
        after(0.26, .impact(fraction))
        begin()
    }

    private func after(_ delay: Double, _ event: Event) {
        events.append((at: clock + delay, event: event))
    }

    private func start(_ kind: Move) {
        move = (kind: kind, start: clock)
        switch kind {
        case .glance:
            gazeTarget = 1
            after(0.75, .lookBack)
        case .wobble:
            squash.v = -1
            slosh.v = 2.5
        case .snooze:
            after(0, .snore(0))
            after(0.55, .snore(1))
        case .react:
            if self.kind == .whale {
                for n in 0..<3 { after(0.22 + Double(n) * 0.04, .spout(big: false)) }
            } else if self.kind == .octopus {
                after(0.05, .heart(left: Bool.random(), big: false))
            }
        case .goal:
            switch self.kind {
            case .whale:
                for n in 0..<16 { after(0.14 + Double(n) * 0.04, .spout(big: true)) }
            case .octopus:
                for n in 0..<3 { after(0.14 + Double(n) * 0.13, .heart(left: n % 2 == 1, big: true)) }
            default:
                after(0.62, .splash)
            }
            after(0.62, .land)
        case .blink, .blinkTwice, .flick, .ripple, .twinkle:
            break
        }
    }

    private func run(_ event: Event) {
        switch event {
        case .impact(let fraction):
            let wasDone = target >= 0.999
            if target <= 0 {
                woke = clock
                after(0.3, .stretch)
            }
            target = fraction
            fall = nil
            gazeTarget = 0
            squash.v = -1.7
            slosh.v += Bool.random() ? 8 : -8
            for n in 0..<4 {
                let side: Double = n % 2 == 1 ? 1 : -1
                particles.append(DrinkParticle(kind: .droplet, x: holeX + Double.random(in: -3...3), y: holeY - 1,
                                               vx: side * Double.random(in: 16...36), vy: Double.random(in: -66 ... -46),
                                               gravity: 230, life: 0.38, size: Double.random(in: 1.2...2)))
            }
            after(0.1, .bubble)
            after(0.26, .bubble)
            start(fraction >= 0.999 && !wasDone ? .goal : .react)
        case .stretch:
            squash.v = 1.5
        case .lookBack:
            gazeTarget = 0
        case .spout(let big):
            let k = big ? 1 : 0.75
            particles.append(DrinkParticle(kind: .droplet, x: holeX + Double.random(in: -1.5...1.5), y: holeY - 2 + jump,
                                           vx: Double.random(in: -26...26) * k, vy: Double.random(in: -95 ... -68) * (big ? 1 : 0.7),
                                           gravity: 190, life: big ? 1.15 : 0.9, size: Double.random(in: 1.4...2.6) * (big ? 1 : 0.8)))
        case .heart(let left, let big):
            // The goal's hearts rise above the head, a drink's one beside it.
            particles.append(DrinkParticle(kind: .heart, x: left ? Double.random(in: 14...28) : Double.random(in: 82...96),
                                           y: big ? Double.random(in: 8...18) : Double.random(in: 22...34),
                                           vy: big ? Double.random(in: -7 ... -4) : Double.random(in: -10 ... -7),
                                           life: 1.3, size: Double.random(in: 0.75...1.2) * (big ? 1 : 0.8), seed: Double.random(in: 0...6)))
        case .splash:
            for n in 0..<6 {
                let side: Double = n % 2 == 1 ? 1 : -1
                particles.append(DrinkParticle(kind: .droplet, x: 55 + side * Double.random(in: 16...30), y: 97,
                                               vx: side * Double.random(in: 10...30), vy: Double.random(in: -75 ... -50),
                                               gravity: 210, life: 0.7, size: Double.random(in: 1.4...2.3)))
            }
        case .land:
            squash.v = -2.3
            slosh.v += 5
        case .snore(let n):
            particles.append(DrinkParticle(kind: .snore, x: Double(shape.snore.x) + 10 + Double(n) * 5, y: Double(shape.snore.y) - 13,
                                           vx: 5, vy: -9, life: 1.5, size: n == 0 ? 7 : 6))
        case .bubble:
            particles.append(DrinkParticle(kind: .bubble, x: shape.bubbles.randomElement() ?? shape.centre, y: shape.bubbleY,
                                           vy: -22, life: 1, size: Double.random(in: 1.3...2), seed: Double.random(in: 0...6)))
        }
    }

    // MARK: Stepping

    private func step(_ dt: Double) {
        clock += dt
        // Small steps keep the stiff squash spring steady at 30 frames a second.
        let parts = max(1, Int((dt * 120).rounded(.up)))
        let h = dt / Double(parts)
        for _ in 0..<parts {
            level.step(to: target, stiffness: 70, damping: 8, dt: h)
            slosh.step(to: 0, stiffness: 50, damping: 6, dt: h)
            squash.step(to: 0, stiffness: 220, damping: 12, dt: h)
            happy.step(to: happyTarget, stiffness: 150, damping: 13, dt: h)
            gaze.step(to: gazeTarget, stiffness: 110, damping: 15, dt: h)
            tuck.step(to: tuckTarget, stiffness: 90, damping: 11, dt: h)
        }
        wavePhase += dt * 7 * min(1, energy * 2)

        let due = events.filter { $0.at <= clock }
        events.removeAll { $0.at <= clock }
        for item in due { run(item.event) }

        if let playing = move, clock - playing.start > playing.kind.length { move = nil }
        for n in particles.indices {
            particles[n].age += dt
            particles[n].vy += particles[n].gravity * dt
            particles[n].x += particles[n].vx * dt
            particles[n].y += particles[n].vy * dt
        }
        particles.removeAll { $0.age >= $0.life }

        var resting = slosh.settle(at: 0, within: 0.03, speed: 0.25)
        resting = squash.settle(at: 0, within: 0.004, speed: 0.06) && resting
        resting = gaze.settle(at: gazeTarget, within: 0.02, speed: 0.2) && resting
        resting = level.settle(at: target, within: 0.002, speed: 0.02) && resting
        resting = happy.settle(at: happyTarget, within: 0.01, speed: 0.1) && resting
        resting = tuck.settle(at: tuckTarget, within: 0.01, speed: 0.1) && resting
        active = !resting || move != nil || fall != nil || !particles.isEmpty || !events.isEmpty
    }

    /// How much the water still moves, 0…1.
    private var energy: Double {
        let speed = slosh.v / 7
        return min(1, (slosh.x * slosh.x + speed * speed).squareRoot())
    }

    /// The goal's jump: up and down again between 0.14 and 0.62 s of the move.
    private var jump: Double {
        guard let playing = move, playing.kind == .goal else { return 0 }
        let u = (clock - playing.start - 0.14) / 0.48
        guard u > 0, u < 1 else { return 0 }
        let height: Double = kind == .drop ? 4 : 9
        return -height * 4 * u * (1 - u)
    }

    // MARK: The frame

    private static func smooth(_ x: Double) -> Double {
        let t = min(max(x, 0), 1)
        return t * t * (3 - 2 * t)
    }

    /// A blink `a` seconds in: shut fast, open a little slower.
    private static func blink(_ a: Double) -> Double {
        if a < 0 || a > 0.26 { return 0 }
        if a < 0.08 { return smooth(a / 0.08) }
        if a < 0.12 { return 1 }
        return 1 - smooth((a - 0.12) / 0.14)
    }

    /// A swing that dies away, for the tail and the fin.
    private static func swing(_ a: Double, _ size: Double) -> Double {
        a > 0 ? size * exp(-3.2 * a) * sin(11 * a) : 0
    }

    private func pose() -> DrinkPose {
        var p = DrinkPose()
        p.level = min(max(level.x, 0), 1.03)
        p.slosh = slosh.x
        p.energy = energy
        p.wavePhase = wavePhase
        p.squash = squash.x
        p.jump = jump
        p.happy = min(max(happy.x, 0), 1.25)
        p.gaze = gaze.x
        p.tuck = min(max(tuck.x, 0), 1)
        p.done = target >= 0.999
        p.asleep = target <= 0 && p.level < 0.01
        p.fall = fall.map { min(max((clock - $0) / 0.26, 0), 1) }
        p.particles = particles
        let sinceWoke = clock - woke
        if sinceWoke < 0.4 { p.blink = 1 - Self.smooth(sinceWoke / 0.4) }

        guard let playing = move else { return p }
        let a = clock - playing.start
        let length = playing.kind.length
        p.clock = a
        switch playing.kind {
        case .blink:
            p.blink = max(p.blink, Self.blink(a))
        case .blinkTwice:
            p.blink = max(p.blink, Self.blink(a), Self.blink(a - 0.36))
        case .flick:
            p.tail = Self.swing(a, 0.2)
            p.fin = Self.swing(a - 0.07, 0.5)
        case .react:
            p.tail = Self.swing(a, 0.22)
            p.fin = Self.swing(a - 0.07, 0.6)
            p.wave = 0.6 * Self.smooth(a / 0.2) * Self.smooth((1.2 - a) / 0.5)
            if kind == .drop { p.blink = max(p.blink, Self.blink(a - 0.25)) }
            if kind == .whale { p.puff = Self.smooth(a / 0.14) * Self.smooth((0.8 - a) / 0.3) }
        case .ripple:
            p.wave = Self.smooth(a / 0.4) * Self.smooth((1.8 - a) / 0.6)
        case .wobble:
            p.wave = 0.35 * Self.smooth(a / 0.2) * Self.smooth((0.8 - a) / 0.4)
        case .twinkle:
            p.twinkle = sin(.pi * a / length)
            p.twinkleProgress = a / length
            p.tail = Self.swing(a, 0.12)
            p.flap = p.twinkle * sin(9 * a)
        case .goal:
            // Crouch, jump, land; the mark appears after the landing.
            if a < 0.14 {
                p.squash -= 0.11 * Self.smooth(a / 0.12)
            } else if a < 0.62 {
                p.squash += (kind == .drop ? 0.03 : 0.09) * sin(.pi * (a - 0.14) / 0.48)
            }
            p.tail = Self.swing(a - 0.14, 0.24)
            p.fin = Self.swing(a - 0.2, 0.8)
            p.raise = Self.smooth((a - 0.1) / 0.25) * Self.smooth((length - a) / 0.5)
            p.flap = sin(13 * a)
            p.wave = 0.8 * Self.smooth(a / 0.3) * Self.smooth((length - a) / 0.6)
            p.rings = Self.smooth((a - 0.62) / 0.8)
            p.hearts = Self.smooth((a - 0.9) / 0.3)
        case .glance, .snooze:
            break
        }
        return p
    }
}
