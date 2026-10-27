import SwiftUI

// Small charts drawn with shapes, so widgets look the same in previews,
// screenshots and on the phone. Values outside lo...hi are clamped.

struct BarStyle {
    var fill: Color
    var dashed = false
}

/// A value on a detail chart's scale: a hairline across (unless `line` is
/// false) and its text in a column on the right.
struct ScaleTick: Hashable {
    let value: Double
    let text: String
    var color: Color = Palette.faint
    var line = true
}

/// The column on the right that holds a detail chart's scale.
let scaleWidth: CGFloat = 40

/// Hairlines and their values for a chart `width` wide (the column comes on
/// top of it), `y` turning a value into its height from the chart's top.
struct ChartScale: View {
    let ticks: [ScaleTick]
    let width: CGFloat
    let y: (Double) -> CGFloat

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(ticks, id: \.self) { t in
                if t.line {
                    Rectangle().fill(Palette.hairline).frame(width: width, height: 1).offset(y: y(t.value))
                }
                Text(verbatim: t.text)
                    .font(.system(size: 9, weight: t.line ? .regular : .semibold))
                    .foregroundStyle(t.color)
                    .lineLimit(1).fixedSize()
                    .frame(height: 12)
                    .offset(x: width + 6, y: y(t.value) - 6)
            }
        }
    }
}

/// Labels under a chart at fractions of its width ("Aug 1" under its day).
struct ChartDates: View {
    let marks: [(at: Double, text: String)]
    var trailing: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width - trailing
            ForEach(marks.indices, id: \.self) { i in
                Text(verbatim: marks[i].text)
                    .font(.system(size: 9))
                    .foregroundStyle(Palette.faint)
                    .lineLimit(1).fixedSize()
                    .position(x: min(max(w * marks[i].at, 14), w - 14), y: 6)
            }
        }
        .frame(height: 12)
    }
}

/// A row of short coloured lines with their names ("— Fitness — Fatigue"),
/// then an optional note on the right ("6 wk") when the row has room for it.
struct ChartLegend: View {
    let items: [(color: Color, text: String)]
    var note: String? = nil

    var body: some View {
        ViewThatFits(in: .horizontal) {
            row(note: note)
            row(note: nil)
        }
        .font(.system(size: 9))
        .foregroundStyle(Palette.faint)
    }

    private func row(note: String?) -> some View {
        HStack(spacing: 8) {
            ForEach(items.indices, id: \.self) { i in
                HStack(spacing: 4) {
                    Capsule().fill(items[i].color).frame(width: 10, height: 2.5)
                    Text(verbatim: items[i].text).fixedSize()
                }
            }
            Spacer(minLength: note == nil ? 0 : 6)
            if let note { Text(verbatim: note).fixedSize() }
        }
    }
}

/// The two ends of a small chart's time ("6 months ago" … "today").
struct ChartSpan: View {
    let start: String
    var end: String = L10n.tr("dnes")

    var body: some View {
        HStack {
            Text(verbatim: start)
            Spacer(minLength: 4)
            Text(verbatim: end)
        }
        .font(.system(size: 9))
        .foregroundStyle(Palette.faint)
        .lineLimit(1)
    }
}

/// Vertical bars with an optional dashed target line and labels underneath.
/// The dashed line says what it is (`targetLabel`, "goal 10,000"); a caption
/// above the bars says what they count ("TSS per week"); a detail screen adds
/// its scale on the right (`scale`).
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
    var targetLabel: String? = nil
    /// Where the label sits over the line: on the left when the newest bar
    /// (on the right) would hide it.
    var targetLabelAlignment: Alignment = .trailing
    var caption: String? = nil
    var scale: [ScaleTick] = []

    var body: some View {
        let top = hi ?? (values.max() ?? 1)
        let trailing = scale.isEmpty ? 0 : scaleWidth
        VStack(spacing: 4) {
            GeometryReader { geo in
                let h = geo.size.height
                let w = geo.size.width - trailing
                ZStack(alignment: .bottomLeading) {
                    if !scale.isEmpty {
                        ChartScale(ticks: scale, width: w) { h * (1 - scaled($0, lo, top)) }
                            .frame(width: geo.size.width, height: h, alignment: .topLeading)
                    }
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
                    .frame(width: w)
                    if let target {
                        DashedLine()
                            .stroke(targetColor, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .frame(width: w, height: 1)
                            .offset(y: -h * scaled(target, lo, top))
                        if let targetLabel {
                            Text(verbatim: targetLabel)
                                .font(.system(size: 9))
                                .foregroundStyle(targetColor)
                                .lineLimit(1).fixedSize()
                                .padding(.horizontal, 2)
                                .background(Palette.card.opacity(0.85), in: Capsule())
                                .frame(width: w, alignment: targetLabelAlignment)
                                .offset(y: -h * scaled(target, lo, top) - 3)
                        }
                    }
                }
            }
            .frame(height: height)
            .overlay(alignment: .topLeading) {
                if let caption {
                    Text(verbatim: caption)
                        .font(.system(size: 9))
                        .foregroundStyle(Palette.faint)
                        .lineLimit(1).fixedSize()
                        .offset(y: -14)
                }
            }
            if let labels {
                HStack(spacing: spacing) {
                    ForEach(labels.indices, id: \.self) { i in
                        // Wider than its bar when the bars are thin ("14" over 2.5 pt
                        // gaps): it may overflow sideways, it must not wrap.
                        Text(labels[i])
                            .font(.system(size: 9, weight: i == highlighted ? .semibold : .regular))
                            .foregroundStyle(i == highlighted ? Palette.ink : Palette.faint)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.trailing, trailing)
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
                    Rectangle().fill(color.opacity(0.16)).frame(height: max(y0 - y1, 1)).offset(y: y1)
                    // Dashed edges, so the usual range reads even on a small tile.
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y1)); p.addLine(to: CGPoint(x: size.width, y: y1))
                        p.move(to: CGPoint(x: 0, y: y0)); p.addLine(to: CGPoint(x: size.width, y: y0))
                    }
                    .stroke(color.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
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
/// With `scale` (the detail) the scale stands on the right and the goal is
/// one of its values instead of a label over the line.
struct TrendDotsChart: View {
    let raw: [Double]
    let trend: [Double]
    var goal: Double? = nil
    var lo: Double
    var hi: Double
    var height: CGFloat = 64
    var scale: [ScaleTick] = []

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let width = size.width - (scale.isEmpty ? 0 : scaleWidth)
            let x = { (i: Int, n: Int) in 3 + (width - 6) * CGFloat(i) / CGFloat(max(n - 1, 1)) }
            let y = { (v: Double) in 3 + (size.height - 6) * (1 - scaled(v, lo, hi)) }
            ZStack(alignment: .topLeading) {
                if !scale.isEmpty {
                    ChartScale(ticks: scale, width: width, y: y)
                }
                ForEach(raw.indices, id: \.self) { i in
                    Circle().fill(Palette.amberBar.opacity(0.4)).frame(width: 4, height: 4)
                        .position(x: x(i, raw.count), y: y(raw[i]))
                }
                Path { p in p.addLines(trend.indices.map { CGPoint(x: x($0, trend.count), y: y(trend[$0])) }) }
                    .stroke(Palette.amber, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                if let goal {
                    DashedLine()
                        .stroke(Palette.green, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(width: width, height: 1)
                        .offset(y: y(goal))
                    if scale.isEmpty {
                        Text(L10n.f("cíl %@", goal.formatted(.number.precision(.fractionLength(0)).locale(Fmt.locale))))
                            .font(.system(size: 9))
                            .foregroundStyle(Palette.green)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .offset(y: y(goal) - 13)
                    }
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

/// Round values inside lo...hi for a detail's scale, about `count` of them,
/// 1, 2, 2.5 or 5 × 10ⁿ apart.
func scaleValues(_ lo: Double, _ hi: Double, count: Int = 4) -> [Double] {
    guard hi > lo, count > 0 else { return [] }
    let raw = (hi - lo) / Double(count)
    let magnitude = pow(10, floor(log10(raw)))
    let step = [1, 2, 2.5, 5, 10].map { $0 * magnitude }.first { $0 >= raw * 0.75 } ?? 10 * magnitude
    var value = (lo / step).rounded(.up) * step
    var out: [Double] = []
    while value <= hi + step * 1e-6 {
        out.append(value)
        value += step
    }
    return out
}

/// A detail scale's ticks: the round values with their text, `extra` (a goal,
/// an average) in place of any round value too close to it.
func scaleTicks(_ lo: Double, _ hi: Double, count: Int = 4, extra: [ScaleTick] = []) -> [ScaleTick] {
    let values = scaleValues(lo, hi, count: count)
    let step = values.count > 1 ? values[1] - values[0] : hi - lo
    let digits = step < 1 ? 1 : 0
    let near = (hi - lo) / 12
    let round = values.filter { v in !extra.contains { abs($0.value - v) < near } }
        .map { ScaleTick(value: $0, text: Fmt.decimal($0, digits: digits)) }
    return round + extra
}

/// The first point of each month along a chart drawn one point per step:
/// "Aug" at its place. The first point names its month only when the month
/// starts there; a month too close to the one before takes its place.
func monthMarks(_ dates: [String]) -> [(at: Double, text: String)] {
    guard dates.count > 1 else { return [] }
    var out: [(at: Double, text: String)] = []
    var month = ""
    for (i, iso) in dates.enumerated() {
        let m = String(iso.prefix(7))
        guard m != month, let date = ISODay.date(iso) else { continue }
        month = m
        if i == 0, Int(iso.suffix(2)) ?? 1 > 3 { continue }
        let at = Double(i) / Double(dates.count - 1)
        let text = DateFormatters.make("LLL", locale: Fmt.locale, timeZone: TimeZone(identifier: "UTC")!).string(from: date)
        if let last = out.last, at - last.at < 0.12 { out.removeLast() }
        out.append((at, text))
    }
    return out
}

func scaled(_ v: Double, _ lo: Double, _ hi: Double) -> CGFloat {
    guard hi > lo else { return 0 }
    return CGFloat(min(max((v - lo) / (hi - lo), 0), 1))
}
