import SwiftUI

/// The one dial of the new design (redesign Z2) for Today, Training and the
/// Health monitor: a three-quarter arc, the usual range as a soft grey band
/// on it, an open dot where the value is and, for a value that adds up
/// through the day (strain), the ink arc up to it. The dial never prints a
/// ratio or any number of its own (Load balance in words, Petr's decision
/// 2, option B); what it means goes in `center`, the server's words.
struct RangeDial<Center: View>: View {
    /// Where the value sits on `scale`; nil draws no dot (still learning).
    var value: Double?
    var scale: ClosedRange<Double> = 0...1
    /// The usual range, on the same scale.
    var band: ClosedRange<Double>? = nil
    /// Fill the arc in ink from the start to the value (a running total).
    var fill = false
    /// The words at the arc's two ends ("0", "21"; "Easier", "Harder").
    var ends: (String, String)? = nil
    var size: CGFloat = 232
    var lineWidth: CGFloat = 12
    /// What VoiceOver says for the whole dial ("Load balance, as usual").
    var spoken: String? = nil
    @ViewBuilder var center: Center

    /// The arc runs over three quarters of the circle, open at the bottom.
    private static var sweep: Double { 0.75 }

    private func part(_ v: Double) -> Double {
        let span = scale.upperBound - scale.lowerBound
        guard span > 0 else { return 0 }
        return min(max((v - scale.lowerBound) / span, 0), 1) * Self.sweep
    }

    var body: some View {
        ZStack {
            arc(0, Self.sweep).stroke(Palette.track, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            if let band {
                arc(part(band.lowerBound), part(band.upperBound))
                    .stroke(Palette.ink.opacity(0.22), style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
            }
            if fill, let value {
                arc(0, part(value)).stroke(Palette.ink, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            }
            if let value {
                let angle = Angle.degrees(135 + 360 * part(value))
                let radius = (size - lineWidth) / 2
                Circle().fill(Palette.background)
                    .overlay(Circle().strokeBorder(Palette.ink, lineWidth: 2.5))
                    .frame(width: lineWidth + 1, height: lineWidth + 1)
                    .offset(x: radius * cos(angle.radians), y: radius * sin(angle.radians))
            }
            // Inside the arc whatever the text size: two lines at most, shrinking before it spills.
            center
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .multilineTextAlignment(.center)
                .dynamicTypeSize(...DynamicTypeSize.denseCap)
                .frame(maxWidth: (size - 2 * lineWidth) * 0.78, maxHeight: size * 0.5)
            if let ends {
                HStack {
                    Text(verbatim: L10n.tr(ends.0))
                    Spacer()
                    Text(verbatim: L10n.tr(ends.1))
                }
                .scaledFont(12, cap: .denseCap)
                .foregroundStyle(Palette.muted)
                .frame(width: size * 0.78)
                .offset(y: size * 0.42)
                .accessibilityHidden(true)
            }
        }
        .frame(width: size, height: size)
        .modifier(DialSpoken(spoken: spoken))
    }

    /// From `a` to `b` of the whole circle, starting at the bottom left.
    private func arc(_ a: Double, _ b: Double) -> some Shape {
        Circle()
            .inset(by: lineWidth / 2)
            .trim(from: a, to: max(a, b))
            .rotation(.degrees(135))
    }
}

/// The dial read as one element: its own sentence when given, else what its centre says.
private struct DialSpoken: ViewModifier {
    let spoken: String?

    func body(content: Content) -> some View {
        if let spoken {
            content.accessibilityElement(children: .ignore).accessibilityLabel(spoken)
        } else {
            content.accessibilityElement(children: .combine)
        }
    }
}
