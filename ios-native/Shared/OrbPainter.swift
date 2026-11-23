import SwiftUI

/// How the Aurin Age orb is drawn, shared by Health (AurinOrb, which moves
/// it) and the Aurin Age widget (WidgetOrb, which draws one still frame).
enum OrbPainter {
    /// The glow from below: the dark-mode status colours, since the orb is dark in both modes.
    static let youngerGlow = Color(hex: 0x8FE6C4)
    static let olderGlow = Color(hex: 0xFF9238)
    static let rim = Color(hex: 0xE9B970)

    /// The estimate: dark body, gold rim with its glow, the glow from below, specks.
    static func lit(_ context: inout GraphicsContext, center: CGPoint, radius: CGFloat, t: Double, dark: Bool, glow: Color) {
        let shape = blob(center: center, radius: radius, t: t * 0.35)
        // Around it: a warm halo at night, a soft shadow on paper.
        var halo = context
        halo.addFilter(.blur(radius: radius * 0.3))
        halo.fill(blob(center: center, radius: radius * 1.15, t: t * 0.35),
                  with: .color(dark ? rim.opacity(0.22) : Color.black.opacity(0.16)))
        var warm = context
        warm.addFilter(.blur(radius: radius * 0.12))
        warm.stroke(blob(center: center, radius: radius * 1.02, t: t * 0.35), with: .color(rim.opacity(dark ? 0.35 : 0.45)), lineWidth: radius * 0.08)
        // The body, near black, a touch lighter towards the top.
        context.fill(shape, with: .radialGradient(
            Gradient(colors: [Color(white: 0.03), Color(white: 0.05), Color(white: 0.09)]),
            center: CGPoint(x: center.x, y: center.y - radius * 0.2), startRadius: 0, endRadius: radius * 1.15))
        // The glow from below, inside the shape only, under the words.
        var inside = context
        inside.clip(to: shape)
        inside.addFilter(.blur(radius: radius * 0.12))
        inside.fill(Path(ellipseIn: CGRect(x: center.x - radius * 0.8, y: center.y + radius * 0.78, width: radius * 1.6, height: radius * 0.7)),
                    with: .color(glow.opacity(0.8)))
        // The rim: a blurred gold glow and a thin bright line on it.
        var rimGlow = context
        rimGlow.addFilter(.blur(radius: 5))
        rimGlow.stroke(shape, with: .color(rim.opacity(0.75)), lineWidth: 5)
        context.stroke(shape, with: .linearGradient(
            Gradient(colors: [rim.opacity(0.95), rim.opacity(0.7), glow.opacity(0.9)]),
            startPoint: CGPoint(x: center.x, y: center.y - radius), endPoint: CGPoint(x: center.x, y: center.y + radius)), lineWidth: 1.4)
        // Specks of light just inside the rim, denser at the bottom.
        for i in 0..<150 {
            let seed = Double(i) * 12.9898
            let turn: Double = i % 2 == 0 ? 1 : -1
            let place = abs((sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1))
            let angle = place * 2 * Double.pi + t * 0.05 * turn
            let depth = 0.78 + 0.2 * abs((sin(seed * 1.7) * 9631.3).truncatingRemainder(dividingBy: 1))
            let reach = Double(radius) * depth * (1 + 0.05 * sin(3 * angle + t * 0.35))
            let point = CGPoint(x: Double(center.x) + cos(angle) * reach, y: Double(center.y) + sin(angle) * reach)
            let twinkle = 0.5 + 0.5 * sin(t * 1.3 + seed)
            let bright = 0.25 + 0.6 * twinkle * (0.55 + 0.45 * max(0, sin(angle)))
            let side = i % 7 == 0 ? 2.2 : 1.4
            let colour = sin(angle) > 0.45 ? glow : (i % 3 == 0 ? rim : Color.white)
            context.fill(Path(ellipseIn: CGRect(x: point.x - side / 2, y: point.y - side / 2, width: side, height: side)),
                         with: .color(colour.opacity(bright)))
        }
    }

    /// Locked (Pro concept, Petr 2026-11-13): cream dots in two blocks the size
    /// of two digits, drifting a little. Fixed places that never form a number,
    /// not the real one and not a sample (ios-designer); only the light moves.
    static func dots(_ context: inout GraphicsContext, center: CGPoint, radius: CGFloat, t: Double) {
        // Two blocks a digit's size apart, as the concept draws them.
        let block = CGSize(width: radius * 0.36, height: radius * 0.56)
        for (b, side) in [-1.0, 1.0].enumerated() {
            let origin = CGPoint(x: center.x + side * radius * 0.23 - block.width / 2, y: center.y - radius * 0.1 - block.height / 2)
            // A loose grid with jitter: even, but no strokes a number could be read from.
            for row in 0..<8 {
                for col in 0..<5 {
                    let seed = Double(b * 40 + row * 5 + col) * 7.31
                    let jx = (abs((sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1)) - 0.5) * 0.9
                    let jy = (abs((sin(seed * 1.93) * 24634.6345).truncatingRemainder(dividingBy: 1)) - 0.5) * 0.9
                    let drift = CGFloat(sin(t * 0.6 + seed)) * 0.8
                    let point = CGPoint(x: origin.x + block.width * (CGFloat(col) + 0.5 + jx) / 5 + drift,
                                        y: origin.y + block.height * (CGFloat(row) + 0.5 + jy) / 8 - drift)
                    let dot = (row + col) % 4 == 0 ? radius * 0.05 : radius * 0.036
                    let bright = 0.5 + 0.45 * (0.5 + 0.5 * sin(t * 1.1 + seed * 3))
                    context.fill(Path(ellipseIn: CGRect(x: point.x - dot / 2, y: point.y - dot / 2, width: dot, height: dot)),
                                 with: .color(Color(red: 0.96, green: 0.93, blue: 0.85).opacity(bright)))
                }
            }
        }
    }

    /// Collecting (concept 24): a dim pearl, dark at night and light on paper, no glow.
    static func pearl(_ context: inout GraphicsContext, center: CGPoint, radius: CGFloat, dark: Bool) {
        let circle = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        var shadow = context
        shadow.addFilter(.blur(radius: radius * 0.18))
        shadow.fill(circle.offsetBy(dx: 0, dy: radius * 0.06), with: .color(Color.black.opacity(dark ? 0.5 : 0.2)))
        context.fill(circle, with: .radialGradient(
            Gradient(colors: dark ? [Color(white: 0.10), Color(white: 0.06)] : [Color(white: 0.99), Color(white: 0.90)]),
            center: CGPoint(x: center.x - radius * 0.3, y: center.y - radius * 0.35), startRadius: 0, endRadius: radius * 1.5))
        context.stroke(circle, with: .color(dark ? Color.white.opacity(0.14) : Color.black.opacity(0.08)), lineWidth: 1)
    }

    /// A rounded shape that breathes: slow waves around its edge.
    static func blob(center: CGPoint, radius: CGFloat, t: Double) -> Path {
        var path = Path()
        let steps = 120
        for i in 0...steps {
            let a = Double(i) / Double(steps) * 2 * .pi
            let r = radius * (1 + 0.07 * sin(3 * a + t) + 0.035 * sin(5 * a - 1.3 * t) + 0.025 * sin(2 * a + 0.7 * t))
            let p = CGPoint(x: center.x + cos(a) * r, y: center.y + sin(a) * r)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}
