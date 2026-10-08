import SwiftUI

// Small charts drawn with shapes, so widgets look the same in previews,
// screenshots and on the phone. Values outside lo...hi are clamped.

struct BarStyle {
    var fill: Color
    var dashed = false
}

/// Vertical bars with an optional dashed target line and labels underneath.
struct BarChart: View {
    let values: [Double]
    let styles: [BarStyle]
    var lo: Double = 0
    var hi: Double? = nil
    var target: Double? = nil
    var targetColor: Color = Palette.faint
    var labels: [String]? = nil
    var highlighted: Int? = nil
    var spacing: CGFloat = 4
    var height: CGFloat = 64

    var body: some View {
        let top = hi ?? (values.max() ?? 1)
        VStack(spacing: 4) {
            GeometryReader { geo in
                let h = geo.size.height
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: spacing) {
                        ForEach(values.indices, id: \.self) { i in
                            let style = styles[min(i, styles.count - 1)]
                            let barHeight = max(2.5, h * scaled(values[i], lo, top))
                            if style.dashed {
                                RoundedRectangle(cornerRadius: 2.5)
                                    .strokeBorder(style.fill.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                                    .frame(height: barHeight)
                            } else {
                                RoundedRectangle(cornerRadius: 2.5).fill(style.fill).frame(height: barHeight)
                            }
                        }
                    }
                    if let target {
                        DashedLine()
                            .stroke(targetColor, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .frame(height: 1)
                            .offset(y: -h * scaled(target, lo, top))
                    }
                }
            }
            .frame(height: height)
            if let labels {
                HStack(spacing: spacing) {
                    ForEach(labels.indices, id: \.self) { i in
                        Text(labels[i])
                            .font(.system(size: 9, weight: i == highlighted ? .semibold : .regular))
                            .foregroundStyle(i == highlighted ? Palette.ink : Palette.faint)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Line chart with an optional "your normal" band and a dot on the last value.
struct LineChart: View {
    let values: [Double]
    let color: Color
    var lo: Double
    var hi: Double
    var band: ClosedRange<Double>? = nil
    var fill = false
    var lastDot = true
    var lineWidth: CGFloat = 2
    var height: CGFloat = 64

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let points = values.indices.map { i in
                CGPoint(x: 3 + (size.width - 6) * CGFloat(i) / CGFloat(max(values.count - 1, 1)),
                        y: 3 + (size.height - 6) * (1 - scaled(values[i], lo, hi)))
            }
            ZStack(alignment: .topLeading) {
                if let band {
                    let y1 = (size.height - 6) * (1 - scaled(band.upperBound, lo, hi)) + 3
                    let y0 = (size.height - 6) * (1 - scaled(band.lowerBound, lo, hi)) + 3
                    Rectangle().fill(color.opacity(0.09)).frame(height: max(y0 - y1, 1)).offset(y: y1)
                }
                if fill, let first = points.first, let last = points.last {
                    Path { p in
                        p.move(to: CGPoint(x: first.x, y: size.height))
                        points.forEach { p.addLine(to: $0) }
                        p.addLine(to: CGPoint(x: last.x, y: size.height))
                        p.closeSubpath()
                    }
                    .fill(color.opacity(0.12))
                }
                Path { p in p.addLines(points) }
                    .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                if lastDot, let last = points.last {
                    Circle().fill(color).frame(width: 7, height: 7).position(last)
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Weighings as faint dots, the smoothed trend as a line, the goal dashed.
struct TrendDotsChart: View {
    let raw: [Double]
    let trend: [Double]
    var goal: Double? = nil
    var lo: Double
    var hi: Double
    var height: CGFloat = 64

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let x = { (i: Int, n: Int) in 3 + (size.width - 6) * CGFloat(i) / CGFloat(max(n - 1, 1)) }
            let y = { (v: Double) in 3 + (size.height - 6) * (1 - scaled(v, lo, hi)) }
            ZStack(alignment: .topLeading) {
                ForEach(raw.indices, id: \.self) { i in
                    Circle().fill(Palette.amberBar.opacity(0.4)).frame(width: 4, height: 4)
                        .position(x: x(i, raw.count), y: y(raw[i]))
                }
                Path { p in p.addLines(trend.indices.map { CGPoint(x: x($0, trend.count), y: y(trend[$0])) }) }
                    .stroke(Palette.amber, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                if let goal {
                    DashedLine()
                        .stroke(Palette.green, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(height: 1)
                        .offset(y: y(goal))
                    Text("cíl \(goal.formatted(.number.precision(.fractionLength(0))))")
                        .font(.system(size: 9))
                        .foregroundStyle(Palette.green)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .offset(y: y(goal) - 13)
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        }
    }
}

func scaled(_ v: Double, _ lo: Double, _ hi: Double) -> CGFloat {
    guard hi > lo else { return 0 }
    return CGFloat(min(max((v - lo) / (hi - lo), 0), 1))
}
