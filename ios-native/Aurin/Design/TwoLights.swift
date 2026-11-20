import SwiftUI

/// The coach's symbol (Two lights, approved 2026-11-12): an amber and a mint
/// light that circle each other, pull together and let go, with a soft halo.
/// The same colours as the Aurin logo. Idle moves slowly; typing (the athlete
/// writes) draws the lights together faster; thinking (the answer is on its
/// way) turns them faster. Reduce Motion: nothing moves, only the halo slowly
/// brightens and dims. Low Power Mode: it stands still.
private struct TabShownKey: EnvironmentKey { static let defaultValue = true }

extension EnvironmentValues {
    /// False on a tab kept built behind the open one (RootView): its
    /// animations stand still.
    var tabShown: Bool {
        get { self[TabShownKey.self] }
        set { self[TabShownKey.self] = newValue }
    }
}

struct TwoLights: View {
    enum Mode { case idle, typing, thinking }

    var size: CGFloat = 24
    var mode: Mode = .idle
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.tabShown) private var tabShown
    @Environment(\.dayPage) private var drawnAsNeighbour
    @State private var onScreen = true

    /// Moves only where it can be seen: the app open, its tab the open one, not
    /// on a day drawn beside (DayPager) and in sight in its scroll view. Each
    /// frame redraws a blur and the glass around it; about five of them ran on
    /// hidden tabs too (device test of build 602: 4 to 9 fps at launch).
    private var paused: Bool {
        scenePhase != .active || !tabShown || drawnAsNeighbour != nil || !onScreen
    }

    /// The halo reaches past the lights: the canvas is larger than the symbol,
    /// so the blur never ends in a straight edge, and lays out at `size`.
    private static let bleed: CGFloat = 1.6

    var body: some View {
        Group {
            if LowPower.shared.on {
                Canvas { context, canvas in draw(&context, canvas, time: 0, still: true) }
            } else {
                // A slow brightness change needs few frames; the symbol is small.
                TimelineView(.animation(minimumInterval: reduceMotion ? 1 / 10 : 1 / 24, paused: paused)) { timeline in
                    Canvas { context, canvas in
                        draw(&context, canvas, time: timeline.date.timeIntervalSinceReferenceDate, still: false)
                    }
                }
            }
        }
        .frame(width: size * Self.bleed, height: size * Self.bleed)
        .modifier(ScreenVisibility(onScreen: $onScreen))
        .padding(-size * (Self.bleed - 1) / 2)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Seconds of one swing (orbit) and of one pull together (drift).
    private var periods: (orbit: Double, drift: Double) {
        switch mode {
        case .idle: return (5.5, 2.8)
        case .typing: return (5.5, 1.4)
        case .thinking: return (2.2, 1.1)
        }
    }

    /// 0 → 1 → 0 over one period, eased like the concept's ease-in-out.
    private static func wave(_ time: Double, _ period: Double) -> Double {
        (1 - cos(2 * .pi * time / period)) / 2
    }

    private func draw(_ context: inout GraphicsContext, _ canvas: CGSize, time: Double, still: Bool) {
        // Drawn on the concept's 160-point box, inside the larger canvas.
        let s = canvas.width / (160 * Self.bleed)
        let moving = !still && !reduceMotion
        let drift = moving ? Self.wave(time, periods.drift) : 0
        let orbit = moving ? Self.wave(time, periods.orbit) : 0.45
        let angle = Angle.degrees(-28 + 62 * orbit)
        let scale = 1 + 0.08 * drift
        // Reduce Motion: only the brightness of the halo changes.
        let glowBase = scheme == .dark ? 0.55 : 0.18
        let glow = still ? glowBase : reduceMotion ? glowBase * (1 - 0.55 * Self.wave(time, mode == .thinking ? 3 : 6)) : glowBase

        context.translateBy(x: canvas.width / 2, y: canvas.height / 2)
        context.rotate(by: angle)
        context.scaleBy(x: scale, y: scale)

        let a = CGPoint(x: (-15 + 8 * drift) * s, y: (-12 + 7 * drift) * s)
        let b = CGPoint(x: -a.x, y: -a.y)

        var halo = context
        halo.addFilter(.blur(radius: 18 * s))
        halo.opacity = glow
        halo.fill(circle(at: CGPoint(x: -19 * s, y: -21 * s), radius: 37 * s), with: .color(AurinMark.amber))
        halo.fill(circle(at: CGPoint(x: 19 * s, y: 21 * s), radius: 37 * s), with: .color(AurinMark.green))

        context.fill(circle(at: a, radius: 33 * s), with: .color(AurinMark.amber))
        context.fill(circle(at: b, radius: 33 * s), with: .color(AurinMark.green))
        for centre in [a, b] {
            let shine = Gradient(colors: [.white.opacity(0.55), .white.opacity(0)])
            context.fill(circle(at: centre, radius: 29 * s),
                         with: .radialGradient(shine, center: CGPoint(x: centre.x - 10 * s, y: centre.y - 13 * s), startRadius: 0, endRadius: 35 * s))
        }
    }

    private func circle(at centre: CGPoint, radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2))
    }
}
