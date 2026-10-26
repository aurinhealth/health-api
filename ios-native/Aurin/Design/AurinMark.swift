import SwiftUI

/// The Aurin logo (Rovnováha): an upper and a lower half disc, shifted
/// against each other. Amber over green; gold for Pro.
struct AurinMark: View {
    var size: CGFloat = 24
    var gold = false
    var glow = false

    static let amber = Color(light: 0xE09A55, dark: 0xF2B46B)
    static let green = Color(light: 0x3E9C78, dark: 0x8FE6C4)
    static let goldTop = Color(light: 0xD9A521, dark: 0xF7E2A6)
    static let goldBottom = Color(light: 0x9C6F1E, dark: 0xB8862F)

    var body: some View {
        ZStack {
            if glow { halves.blur(radius: size * 0.12).opacity(0.55) }
            halves
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var halves: some View {
        Canvas { context, canvas in
            let s = canvas.width / 100, r = 36 * s, dx = 8 * s, gap = 4 * s
            var top = Path()
            top.addArc(center: CGPoint(x: canvas.width / 2 - dx, y: canvas.height / 2 - gap), radius: r,
                       startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
            top.closeSubpath()
            var bottom = Path()
            bottom.addArc(center: CGPoint(x: canvas.width / 2 + dx, y: canvas.height / 2 + gap), radius: r,
                          startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
            bottom.closeSubpath()
            context.fill(top, with: .color(gold ? Self.goldTop : Self.amber))
            context.fill(bottom, with: .color(gold ? Self.goldBottom : Self.green))
        }
    }
}

/// "Aurin Pro" set like the logo: the name in Instrument Serif, Pro in italic.
struct AurinProTitle: View {
    var size: CGFloat = 21
    var gold = false

    var body: some View {
        (Text(verbatim: "Aurin ").font(Typo.number(size)).foregroundColor(Palette.ink)
         + Text(verbatim: "Pro").font(Typo.sentenceItalic(size * 0.92)).foregroundColor(gold ? AurinMark.goldTop : AurinMark.amber))
            .accessibilityLabel("Aurin Pro")
    }
}
