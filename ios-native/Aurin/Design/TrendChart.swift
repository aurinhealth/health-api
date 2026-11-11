import Accessibility
import Charts
import SwiftUI

/// A value over days: each day a faint dot, the 7-day average as a line, the
/// usual range as a band, a finger to read any day ("8. října, 64 ms")
/// and 7 / 30 / 90 days to pick above it. Over the chart the average of the
/// picked days ("97 ms, 7-day average, rising", "average of 22 nights" when
/// fewer have a value), one day only while a finger is on it (chart review 2).
struct TrendChart: View {
    /// What one dot is: a night or a day.
    enum Per {
        case night, day

        fileprivate var averageOf: String {
            switch self {
            case .night: return "průměr %lld nocí"
            case .day: return "průměr %lld dní"
            }
        }

        fileprivate var one: String {
            switch self {
            case .night: return "jedna noc"
            case .day: return "jeden den"
            }
        }

        fileprivate var hint: String {
            switch self {
            case .night: return "Dotkni se grafu a uvidíš jednu noc."
            case .day: return "Dotkni se grafu a uvidíš jeden den."
            }
        }
    }

    /// Which side of the band is the bad one: its days get an amber dot.
    enum Worse {
        case none, below, above
    }

    let points: [Point]
    let color: Color
    let unit: String
    var band: ClosedRange<Double>? = nil
    var bandLabel: String? = nil
    var height: CGFloat = 190
    var digits = 0
    var worse: Worse = .none
    var per: Per = .night
    /// The trend beside the average ("↑ rising"), "–" or nil without one.
    var trend: String? = nil
    @State private var picked: Date?
    @State private var days = 30

    static let ranges = [7, 30, 90]

    private struct Sample: Identifiable {
        let date: Date
        let iso: String
        let value: Double
        /// The mean of this day and the 6 before it that have a value.
        var average: Double
        var id: String { iso }
    }

    /// Every day with its 7-day average, oldest first.
    private var allSamples: [Sample] {
        let sorted = points.compactMap { p in ISODay.date(p.date).map { Sample(date: $0, iso: p.date, value: p.value, average: p.value) } }
            .sorted { $0.date < $1.date }
        let window: TimeInterval = 6 * 86400
        var out = sorted
        var start = 0
        var sum = 0.0
        for i in sorted.indices {
            sum += sorted[i].value
            while sorted[start].date < sorted[i].date.addingTimeInterval(-window) {
                sum -= sorted[start].value
                start += 1
            }
            out[i].average = sum / Double(i - start + 1)
        }
        return out
    }

    /// The last `days` days up to the newest value.
    private func inRange(_ list: [Sample]) -> [Sample] {
        guard let last = list.last else { return [] }
        let from = last.date.addingTimeInterval(-Double(days - 1) * 86400)
        return list.filter { $0.date >= from }
    }

    private func dotColor(_ value: Double) -> Color {
        guard let band else { return color.opacity(0.4) }
        switch worse {
        case .below where value < band.lowerBound: return Palette.amber.opacity(0.85)
        case .above where value > band.upperBound: return Palette.amber.opacity(0.85)
        default: return color.opacity(0.4)
        }
    }

    private var dotSize: CGFloat { days <= 7 ? 40 : days <= 30 ? 22 : 12 }

    var body: some View {
        let list = inRange(allSamples)
        let values = list.map(\.value) + [band?.lowerBound, band?.upperBound].compactMap { $0 }
        let pad = max(((values.max() ?? 1) - (values.min() ?? 0)) * 0.15, 1)
        let lo = (values.min() ?? 0) - pad, hi = (values.max() ?? 1) + pad
        let selected = picked.flatMap { date in list.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) } }
        let shown = selected ?? list.last

        VStack(alignment: .leading, spacing: 12) {
            RangePicker(ranges: Self.ranges, days: $days)
            let points = list.map { Point(date: $0.iso, value: $0.value) }
            chart(list, lo: lo, hi: hi, selected: selected, shown: shown)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.summary(points, unit: unit, digits: digits))
                // Audio Graphs: VoiceOver plays the days as tones (chart review 18).
                .accessibilityChartDescriptor(TrendAudioGraph(points: points, unit: unit, digits: digits, days: days))
        }
        .onChange(of: days) { picked = nil }
    }

    private func chart(_ list: [Sample], lo: Double, hi: Double, selected: Sample?, shown: Sample?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(selected.map { Fmt.decimal($0.value, digits: digits) } ?? Self.average(list.map(\.value)).map { Fmt.decimal($0, digits: digits) } ?? "–")
                    .font(Typo.number(26)).foregroundStyle(Palette.ink)
                Text(unit).font(Typo.caption).foregroundStyle(Palette.faint)
                Spacer()
                Text(verbatim: selected.map { Fmt.dayMonth($0.iso) } ?? periodLabel(count: list.count))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            Chart {
                if let band, let first = list.first, let last = list.last {
                    RectangleMark(xStart: .value("Od", first.date), xEnd: .value("Do", last.date),
                                  yStart: .value("Spodek", band.lowerBound), yEnd: .value("Vršek", band.upperBound))
                        .foregroundStyle(color.opacity(0.16))
                    // Dashed edges, so the usual range reads at a glance.
                    ForEach([band.lowerBound, band.upperBound], id: \.self) { edge in
                        RuleMark(y: .value("Hrana", edge))
                            .foregroundStyle(color.opacity(0.45))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    }
                }
                ForEach(list) { s in
                    PointMark(x: .value("Den", s.date), y: .value("Hodnota", s.value))
                        .foregroundStyle(dotColor(s.value))
                        .symbolSize(dotSize)
                }
                ForEach(list) { s in
                    LineMark(x: .value("Den", s.date), y: .value("Průměr", s.average))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.monotone)
                }
                if let shown {
                    if selected != nil { RuleMark(x: .value("Den", shown.date)).foregroundStyle(Palette.faint.opacity(0.5)) }
                    PointMark(x: .value("Den", shown.date), y: .value("Hodnota", shown.value))
                        .foregroundStyle(color).symbolSize(60)
                }
            }
            .chartYScale(domain: lo...hi)
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: max(1, days / 3))) { _ in
                    AxisGridLine().foregroundStyle(Palette.hairline)
                    AxisValueLabel(format: .dateTime.day().month(.defaultDigits).locale(Fmt.locale)).foregroundStyle(Palette.faint)
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                    AxisGridLine().foregroundStyle(Palette.hairline)
                    AxisValueLabel().foregroundStyle(Palette.faint)
                }
            }
            .chartXSelection(value: $picked)
            .frame(height: height)
            // What the line and the dots are, then the band.
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 14) {
                    HStack(spacing: 5) {
                        Capsule().fill(color).frame(width: 14, height: 2.6)
                        Text("7denní průměr").font(Typo.tiny).foregroundStyle(Palette.muted)
                    }
                    HStack(spacing: 5) {
                        Circle().fill(color.opacity(0.4)).frame(width: 7, height: 7)
                        Text(per.one).font(Typo.tiny).foregroundStyle(Palette.muted)
                    }
                }
                if band != nil { legend(color.opacity(0.25), bandLabel ?? "obvyklé rozmezí") }
                Text(per.hint).font(Typo.tiny).foregroundStyle(Palette.faint)
            }
        }
    }

    /// "7-day average, rising", or "average of 22 nights, rising" when fewer
    /// of the picked days have a value.
    private func periodLabel(count: Int) -> String {
        guard count > 0 else { return "" }
        let span = count >= days ? L10n.f("průměr za %@ dní", String(days)) : L10n.plural(per.averageOf, count)
        return [span, trend == "–" ? nil : trend].compactMap { $0 }.joined(separator: ", ")
    }

    static func average(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    private func legend(_ c: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 14, height: 6)
            Text(text).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
    }

    /// "30 dní, od 56 do 66 ms, naposledy 64 ms" for VoiceOver.
    static func summary(_ points: [Point], unit: String, digits: Int) -> String {
        let values = points.map(\.value)
        guard let last = values.last, let lo = values.min(), let hi = values.max() else { return L10n.tr("Bez dat") }
        let shownUnit = L10n.tr(unit)
        let span = L10n.f("od %@ do %@ %@", Fmt.decimal(lo, digits: digits), Fmt.decimal(hi, digits: digits), shownUnit)
        let latest = L10n.f("naposledy %@ %@", Fmt.decimal(last, digits: digits), shownUnit)
        let days = L10n.plural("%lld dní", values.count)
        return [days, span, latest].joined(separator: ", ")
    }
}

/// "7 dní, 30 dní, 90 dní" over a detail chart, the chosen one filled.
struct RangePicker: View {
    let ranges: [Int]
    @Binding var days: Int

    var body: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 0)
            ForEach(ranges, id: \.self) { n in
                let on = n == days
                Button { days = n } label: {
                    Text(verbatim: L10n.f("%@ dní", String(n)))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(on ? Palette.background : Palette.secondary)
                        .padding(.horizontal, 14)
                        .frame(height: 30)
                        .background(on ? Palette.ink : Palette.track, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
    }
}

/// A detail chart's days for VoiceOver's Audio Graphs: a tone for each day,
/// its date and value read out.
struct TrendAudioGraph: AXChartDescriptorRepresentable {
    let points: [Point]
    let unit: String
    let digits: Int
    let days: Int

    func makeChartDescriptor() -> AXChartDescriptor {
        let values = points.map(\.value)
        let lo = values.min() ?? 0, hi = values.max() ?? 1
        let shownUnit = L10n.tr(unit)
        let x = AXCategoricalDataAxisDescriptor(title: L10n.tr("Den"), categoryOrder: points.map { Fmt.dayMonth($0.date) })
        let y = AXNumericDataAxisDescriptor(title: shownUnit, range: lo...(hi > lo ? hi : lo + 1), gridlinePositions: []) {
            Fmt.decimal($0, digits: digits) + " " + shownUnit
        }
        let series = AXDataSeriesDescriptor(name: shownUnit, isContinuous: true,
                                            dataPoints: points.map { AXDataPoint(x: Fmt.dayMonth($0.date), y: $0.value) })
        return AXChartDescriptor(title: L10n.f("%@ dní", String(days)), summary: TrendChart.summary(points, unit: unit, digits: digits),
                                 xAxis: x, yAxis: y, additionalAxes: [], series: [series])
    }
}
