import SwiftUI

// Small charts drawn with shapes, so widgets look the same in previews,
// screenshots and on the phone. Values outside lo...hi are clamped.

struct BarStyle {
    var fill: Color
    var dashed = false
    /// A dashed bar's part already done, filled from the bottom (this week's
    /// load inside its plan).
    var done: Double? = nil
}

/// Text in and around a chart: the app's smallest size (Typo.tiny), never less.
let chartText: CGFloat = 11

/// A value on a detail chart's scale: a hairline across (unless `line` is
/// false) and its text in a column on the right. With `name` the word stands
/// over the value ("goal" over "72"), for a line that isn't a round value.
struct ScaleTick: Hashable {
    let value: Double
    let text: String
    var color: Color = Palette.faint
    var line = true
    var name: String? = nil
}

/// The column on the right that holds a detail chart's scale.
let scaleWidth: CGFloat = 46

/// The column on the right that holds a small chart's line tag ("goal 150").
let tagWidth: CGFloat = 46

/// What a dashed line stands for, beside the chart and never over its bars:
/// the word over the value ("goal" over "150").
struct LineTag: View {
    let name: String
    let value: String
    var color: Color = Palette.muted

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: name).scaledFont(chartText, cap: .denseCap)
            Text(verbatim: value).scaledFont(chartText, weight: .semibold, cap: .denseCap)
        }
        .foregroundStyle(color)
        .lineLimit(1).fixedSize()
    }

    /// The tag's middle at the line's height, kept inside a chart `height` tall.
    static func center(_ y: CGFloat, height: CGFloat) -> CGFloat {
        min(max(y, 13), max(height - 13, 13))
    }
}

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
                if let name = t.name {
                    LineTag(name: name, value: t.text, color: t.color)
                        .frame(height: 28)
                        .offset(x: width + 6, y: y(t.value) - 14)
                } else {
                    Text(verbatim: t.text)
                        .scaledFont(chartText, weight: t.line ? .regular : .semibold, cap: .denseCap)
                        .foregroundStyle(t.color)
                        .lineLimit(1).fixedSize()
                        .frame(height: 14)
                        .offset(x: width + 6, y: y(t.value) - 7)
                }
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
                    .scaledFont(chartText, cap: .denseCap)
                    .foregroundStyle(Palette.faint)
                    .lineLimit(1).fixedSize()
                    .position(x: min(max(w * marks[i].at, 16), w - 16), y: 7)
            }
        }
        .frame(height: 14)
    }
}

/// A row of marks with their names ("— Fitness — Fatigue", "■ done ⬚ planned"),
/// then an optional note on the right ("6 wk") when the row has room for it.
struct ChartLegend: View {
    enum Mark { case line, dashedLine, dot, bar, dashedBar }

    struct Item {
        let color: Color
        let text: String
        var mark: Mark = .line
    }

    let items: [Item]
    var note: String? = nil

    var body: some View {
        ViewThatFits(in: .horizontal) {
            row(note: note)
            row(note: nil)
        }
        .scaledFont(chartText, cap: .denseCap)
        .foregroundStyle(Palette.faint)
    }

    private func row(note: String?) -> some View {
        HStack(spacing: 8) {
            ForEach(items.indices, id: \.self) { i in
                HStack(spacing: 4) {
                    mark(items[i])
                    Text(verbatim: items[i].text).fixedSize()
                }
            }
            Spacer(minLength: note == nil ? 0 : 6)
            if let note { Text(verbatim: note).fixedSize() }
        }
    }

    @ViewBuilder private func mark(_ item: Item) -> some View {
        switch item.mark {
        case .line:
            Capsule().fill(item.color).frame(width: 10, height: 2.5)
        case .dashedLine:
            DashedLine().stroke(item.color, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])).frame(width: 12, height: 2)
        case .dot:
            Circle().fill(item.color).frame(width: 5, height: 5)
        case .bar:
            RoundedRectangle(cornerRadius: 2).fill(item.color).frame(width: 9, height: 9)
        case .dashedBar:
            RoundedRectangle(cornerRadius: 2).strokeBorder(item.color, style: StrokeStyle(lineWidth: 1, dash: [2, 1.5])).frame(width: 9, height: 9)
        }
    }
}

/// The two ends of a small chart's time ("6 months ago" … "today").
struct ChartSpan: View {
    let start: String
    var end: String = L10n.tr("dnes")

    /// The first and the last day of a series ("Sep 24" … "Oct 8").
    init(dates: [String]) {
        start = dates.first.map(Fmt.dayMonthShort) ?? ""
        end = dates.last.map(Fmt.dayMonthShort) ?? ""
    }

    init(start: String, end: String = L10n.tr("dnes")) {
        self.start = start
        self.end = end
    }

    var body: some View {
        HStack {
            Text(verbatim: start)
            Spacer(minLength: 4)
            Text(verbatim: end)
        }
        .scaledFont(chartText, cap: .denseCap)
        .foregroundStyle(Palette.faint)
        .lineLimit(1)
    }
}

/// Vertical bars with an optional dashed target line and labels underneath.
/// The dashed line says what it is in a column on the right (`targetTag`,
/// "goal" over "10,000"); a caption above the bars says what they count
/// ("TSS per week"); a detail screen adds its scale on the right (`scale`).
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
    var targetTag: (name: String, value: String)? = nil
    var caption: String? = nil
    var scale: [ScaleTick] = []

    var body: some View {
        let top = hi ?? (values.max() ?? 1)
        let trailing = !scale.isEmpty ? scaleWidth : targetTag == nil ? 0 : tagWidth
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
                                    .overlay(alignment: .bottom) {
                                        if let done = style.done, done > 0 {
                                            RoundedRectangle(cornerRadius: 2.5).fill(style.fill)
                                                .frame(height: min(barHeight, max(2.5, h * scaled(done, lo, top))))
                                        }
                                    }
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
                        if let targetTag, scale.isEmpty {
                            LineTag(name: targetTag.name, value: targetTag.value)
                                .frame(height: 28)
                                .offset(x: w + 6, y: LineTag.center(h * (1 - scaled(target, lo, top)), height: h) - 14)
                                .frame(width: geo.size.width, height: h, alignment: .topLeading)
                        }
                    }
                }
            }
            .frame(height: height)
            .overlay(alignment: .topLeading) {
                if let caption {
                    Text(verbatim: caption)
                        .scaledFont(chartText, cap: .denseCap)
                        .foregroundStyle(Palette.faint)
                        .lineLimit(1).fixedSize()
                        .offset(y: -17)
                }
            }
            if let labels {
                HStack(spacing: spacing) {
                    ForEach(labels.indices, id: \.self) { i in
                        // Wider than its bar when the bars are thin ("14" over 2.5 pt
                        // gaps): it may overflow sideways, it must not wrap.
                        Text(labels[i])
                            .scaledFont(chartText, weight: i == highlighted ? .semibold : .regular, cap: .denseCap)
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
/// one of its values; without it the goal's tag stands beside the line.
struct TrendDotsChart: View {
    let raw: [Double]
    let trend: [Double]
    var goal: Double? = nil
    var lo: Double
    var hi: Double
    var height: CGFloat = 64
    var scale: [ScaleTick] = []
    /// The line's colour (weight's amber unless given), its dots a faint shade of it.
    var color: Color? = nil

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let width = size.width - (!scale.isEmpty ? scaleWidth : goal == nil ? 0 : tagWidth)
            let x = { (i: Int, n: Int) in 3 + (width - 6) * CGFloat(i) / CGFloat(max(n - 1, 1)) }
            let y = { (v: Double) in 3 + (size.height - 6) * (1 - scaled(v, lo, hi)) }
            ZStack(alignment: .topLeading) {
                if !scale.isEmpty {
                    ChartScale(ticks: scale, width: width, y: y)
                }
                ForEach(raw.indices, id: \.self) { i in
                    Circle().fill((color ?? Palette.amberBar).opacity(0.4)).frame(width: 4, height: 4)
                        .position(x: x(i, raw.count), y: y(raw[i]))
                }
                Path { p in p.addLines(trend.indices.map { CGPoint(x: x($0, trend.count), y: y(trend[$0])) }) }
                    .stroke(color ?? Palette.amber, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                if let goal {
                    DashedLine()
                        .stroke(Palette.green, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(width: width, height: 1)
                        .offset(y: y(goal))
                    if scale.isEmpty {
                        LineTag(name: L10n.tr("cíl"), value: Fmt.int(goal), color: Palette.green)
                            .frame(height: 28)
                            .offset(x: width + 6, y: LineTag.center(y(goal), height: size.height) - 14)
                    }
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Nights against the usual as bars up and down from a zero line, in one
/// colour, the usual band (±`band`) shaded with dashed edges and the last
/// night in full colour. A warmer and a cooler night look the same: no colour
/// says better or worse (MDR, chart review 4).
struct DeviationBars: View {
    let values: [Double]
    let band: Double
    var color: Color = Palette.amber
    var spacing: CGFloat = 4
    var height: CGFloat = 48

    var body: some View {
        let top = max(values.map(abs).max() ?? 0, band) * 1.15
        GeometryReader { geo in
            let mid = geo.size.height / 2
            let y: (Double) -> CGFloat = { mid - CGFloat($0 / top) * mid }
            ZStack(alignment: .topLeading) {
                Rectangle().fill(color.opacity(0.12)).frame(height: y(-band) - y(band)).offset(y: y(band))
                ForEach([band, -band], id: \.self) { edge in
                    DashedLine().stroke(color.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(height: 1).offset(y: y(edge))
                }
                Rectangle().fill(Palette.hairline).frame(height: 1).offset(y: mid)
                HStack(alignment: .top, spacing: spacing) {
                    ForEach(values.indices, id: \.self) { i in
                        let bar = max(2, abs(y(values[i]) - mid))
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i == values.count - 1 ? color : color.opacity(0.45))
                            .frame(height: bar)
                            .offset(y: values[i] >= 0 ? mid - bar : mid)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    }
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// "warmer ↑, cooler ↓" and "band ±0.5 °C of your usual" under a temperature tile's bars.
struct DeviationLegend: View {
    var body: some View {
        HStack {
            Text("teplejší ↑, chladnější ↓")
            Spacer(minLength: 6)
            Text(verbatim: L10n.f("pás ±%@ od tvého obvyklého", Fmt.decimal(Units.temperatureChange(0.5)) + " " + Units.temperatureUnit))
        }
        .scaledFont(chartText, cap: .denseCap)
        .foregroundStyle(Palette.faint)
        .lineLimit(1).minimumScaleFactor(0.8)
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
