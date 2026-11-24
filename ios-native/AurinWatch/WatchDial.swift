import SwiftUI
import WatchKit

/// Today's dial on the wrist (watch concept 02, the iPhone's RangeDial in
/// TodayDials): an arc over three quarters of a circle, open at the bottom,
/// the usual range or the target in green, today as a filled dot with a dark
/// rim, the number in the serif in the middle and its unit under it.
struct WatchDial: View {
    var value: Double?
    var scale: ClosedRange<Double>
    var band: ClosedRange<Double>?
    var dot: Color
    var number: String
    var unit: String?
    var size: CGFloat = 50

    private static let sweep = 0.75
    private var line: CGFloat { max(3, size * 0.07) }

    private func part(_ v: Double) -> Double {
        let span = scale.upperBound - scale.lowerBound
        guard span > 0 else { return 0 }
        return min(max((v - scale.lowerBound) / span, 0), 1) * Self.sweep
    }

    var body: some View {
        let radius = size / 2 - line * 1.25
        ZStack {
            arc(0, Self.sweep, radius).stroke(W.track, style: StrokeStyle(lineWidth: line, lineCap: .round))
            if let band {
                arc(part(band.lowerBound), part(band.upperBound), radius)
                    .stroke(W.band, style: StrokeStyle(lineWidth: line, lineCap: .round))
            }
            if let value {
                let angle = (135 + 360 * part(value)) * .pi / 180
                Circle().fill(dot)
                    .overlay(Circle().stroke(W.rim, lineWidth: line * 0.5))
                    .frame(width: line * 1.9, height: line * 1.9)
                    .offset(x: radius * cos(angle), y: radius * sin(angle))
            }
            VStack(spacing: 1) {
                Text(verbatim: number)
                    .font(W.serif(size * 0.34))
                    .foregroundStyle(number == "–" ? W.muted : W.num)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let unit, number != "–" {
                    Text(verbatim: unit)
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(W.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, line * 2)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func arc(_ from: Double, _ to: Double, _ radius: CGFloat) -> Path {
        Path { path in
            path.addArc(center: CGPoint(x: size / 2, y: size / 2), radius: radius,
                        startAngle: .degrees(135 + 360 * from), endAngle: .degrees(135 + 360 * to), clockwise: false)
        }
    }
}

/// The coach's symbol on the watch (Two lights, as on the iPhone's
/// TwoLights at rest): an amber light over a mint one. Still: the watch's
/// corner button is small and redraws with the page.
struct WatchCoachLights: View {
    var size: CGFloat = 19

    var body: some View {
        let amberColor = W.lightAmber, mintColor = W.lightMint
        Canvas { context, canvas in
            let s = canvas.width / 25
            let amber = CGRect(x: 1.5 * s, y: 1 * s, width: 14 * s, height: 14 * s)
            let mint = CGRect(x: 9.5 * s, y: 3.5 * s, width: 14 * s, height: 14 * s)
            context.fill(Path(ellipseIn: amber), with: .color(amberColor))
            context.fill(Path(ellipseIn: mint), with: .color(mintColor))
            // The amber one shows through the mint one a little, as in the logo.
            context.opacity = 0.45
            context.fill(Path(ellipseIn: amber), with: .color(amberColor))
            context.opacity = 1
            let shine = Gradient(colors: [.white.opacity(0.5), .white.opacity(0)])
            for light in [amber, mint] {
                let inner = light.insetBy(dx: s, dy: s)
                context.fill(Path(ellipseIn: inner),
                             with: .radialGradient(shine, center: CGPoint(x: inner.minX + inner.width * 0.34, y: inner.minY + inner.height * 0.28),
                                                   startRadius: 0, endRadius: inner.width * 0.7))
            }
        }
        .frame(width: size, height: size * 0.72)
        .accessibilityHidden(true)
    }
}

extension W {
    /// The concept's numbers: a warm white, a touch lighter than the ink.
    static let num = Color(hex: 0xFFF4E2)
    /// The usual range or the target on a dial (watch concept 02).
    static let band = Color(hex: 0x5C9C88)
    /// The rim of a dial's dot, so it stands off the band.
    static let rim = Color(hex: 0x0B0C0D)
    /// The coach's two lights (AurinMark, dark).
    static let lightAmber = Color(hex: 0xF2B46B)
    static let lightMint = Color(hex: 0x8FE6C4)
    /// The dials' card (watch concept): a dark gradient with a hairline rim.
    static let card = LinearGradient(colors: [Color(hex: 0x1B1D1E), Color(hex: 0x151718)], startPoint: .top, endPoint: .bottom)
    static let hair = Color(hex: 0x2A2C2D)

    /// The 41 and 42 mm watches: the concept's smaller sizes (board 12).
    static var small: Bool { WKInterfaceDevice.current().screenBounds.width < 190 }
}
