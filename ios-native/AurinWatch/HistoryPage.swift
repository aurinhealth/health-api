import Charts
import SwiftUI
import WatchKit

/// The page under a detail: 7, 30 or 90 days on a chart with the athlete's
/// normal as a band, the values on the right and the dates below.
struct HistoryPage: View {
    let metric: WatchMetric
    /// Oldest first, up to 90 days.
    let series: [WatchSnapshot.Day]
    let today: String
    let normal: ClosedRange<Double>?
    /// Sleep: the night's need in minutes.
    let need: Double?

    @State private var span = 30

    /// Only the spans the history fills: no 90 days from a fortnight.
    private var spans: [Int] {
        guard let first = series.first.flatMap({ W.dayValue($0.date) }), let end = W.dayValue(today) else { return [7] }
        let covered = Calendar(identifier: .gregorian).dateComponents([.day], from: first, to: end).day ?? 0
        return [7, 30, 90].filter { $0 == 7 || covered >= $0 / 2 }
    }

    private var shown: Int { spans.contains(span) ? span : spans.last ?? 7 }
    private var days: [WatchSnapshot.Day] { series.span(shown, upTo: today) }
    /// 90 days as weekly averages, so the trend shows rather than the noise.
    private var points: [WatchSnapshot.Day] { shown == 90 ? days.weekly : days }
    private var sleep: Bool { metric == .sleep }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text(header)
                    .font(W.label(10))
                    .tracking(0.6)
                    .foregroundStyle(metric.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 2)
                if band != nil, !sleep {
                    RoundedRectangle(cornerRadius: 2).fill(metric.color.opacity(0.35)).frame(width: 9, height: 5)
                    Text(W.tr("normál", "normal"))
                        .font(W.label(8))
                        .foregroundStyle(metric.color)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(days.average.map(format) ?? "–")
                    .font(W.serif(24))
                    .foregroundStyle(W.ink)
                Text(metric.unit + " " + W.tr("průměr", "avg"))
                    .font(.system(size: 11))
                    .foregroundStyle(W.secondary)
                if let need {
                    Spacer(minLength: 2)
                    // The dashed line in the chart.
                    Rectangle().fill(W.amber).frame(width: 8, height: 1.5)
                    Text(W.tr("potřeba", "need") + " " + W.clock(minutes: need))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(W.amber)
                } else if let change {
                    Text(change.0)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(change.1)
                }
            }
            if spans.count > 1 { picker.padding(.top, 2) }
            chart
                .padding(.top, 6)
                .frame(height: Self.chartHeight - (spans.count > 1 ? 26 : 0))
            if shown == 90 {
                Text(trend)
                    .font(.system(size: 11))
                    .foregroundStyle(W.secondary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            } else {
                Tiles(items: tiles, color: sleep ? W.amber : metric.color)
                    .padding(.top, 4)
            }
        }
        // Clear of the back button above and the page dots on the right;
        // the chart gives way to the 7D/30D/90D picker and on a small watch.
        .padding(.top, 8)
        .padding(.trailing, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    /// As tall as the watch allows next to the header, the picker and the tiles.
    private static let chartHeight: CGFloat = Swift.max(48, WKInterfaceDevice.current().screenBounds.height - 172)

    private var header: String {
        let unit = sleep ? W.tr("nocí", "nights") : W.tr("dní", "days")
        return (metric.name + " · \(shown) " + unit).uppercased()
    }

    private var picker: some View {
        HStack(spacing: 0) {
            ForEach(spans, id: \.self) { value in
                Button {
                    span = value
                } label: {
                    Text("\(value)D")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(value == shown ? Color.black : W.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: 22)
                        .background(value == shown ? metric.color : Color.clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(W.tile, in: Capsule())
    }

    /// A value in the metric's unit: "50", or "7:04" for sleep.
    private func format(_ value: Double) -> String {
        sleep ? W.clock(minutes: value) : W.number(value)
    }

    /// The last week of the span against its first: the number by the
    /// average and the sentence under 90 days say the same.
    private var diff: Double? {
        guard days.count >= 4 else { return nil }
        let part = Swift.min(7, days.count / 2)
        guard let before = Array(days.prefix(part)).average, let after = Array(days.suffix(part)).average else { return nil }
        return after - before
    }

    private var change: (String, Color)? {
        guard let diff else { return nil }
        let value = sleep ? diff : diff.rounded()
        if abs(value) < (sleep ? 5 : 1) { return (W.change(0), W.muted) }
        let good = metric.higherIsBetter ? value > 0 : value < 0
        return (sleep ? W.minutesChange(value) : W.change(value), good ? W.green : W.amber)
    }

    private var trend: String {
        guard let diff else { return "" }
        let lead = W.tr("Průměry týdnů. ", "Weekly averages. ")
        if abs(diff) < (sleep ? 10 : 1.5) { return lead + W.tr("Drží se stejně.", "Holding steady.") }
        switch metric {
        case .restingHR:
            return lead + (diff < 0 ? W.tr("Klesá, kondice roste.", "Going down: fitness up.")
                                    : W.tr("Stoupá, hlídej regeneraci.", "Going up: mind recovery."))
        case .hrv:
            return lead + (diff > 0 ? W.tr("Stoupá, regenerace dobrá.", "Going up: recovering well.")
                                    : W.tr("Klesá, hlídej regeneraci.", "Going down: mind recovery."))
        case .sleep:
            return lead + (diff > 0 ? W.tr("Spíš víc.", "You sleep more.") : W.tr("Spíš méně.", "You sleep less."))
        }
    }

    private var tiles: [Tiles.Item] {
        let values = days.map(\.value)
        let lowest = values.min().map(format) ?? "–"
        let highest = values.max().map(format) ?? "–"
        if sleep {
            let short = need.map { need in days.filter { $0.value < need - 30 }.count }
            return [Tiles.Item(label: W.tr("Krátké noci", "Short nights"), value: short.map { String($0) } ?? "–"),
                    Tiles.Item(label: W.tr("Nejkratší", "Shortest"), value: lowest),
                    Tiles.Item(label: W.tr("Nejdelší", "Longest"), value: highest)]
        }
        let range = normal.map { W.number($0.lowerBound) + "–" + W.number($0.upperBound) } ?? "–"
        return [Tiles.Item(label: W.tr("Normál", "Normal"), value: range),
                Tiles.Item(label: W.tr("Nejnižší", "Lowest"), value: lowest),
                Tiles.Item(label: W.tr("Nejvyšší", "Highest"), value: highest)]
    }

    // MARK: Chart

    private struct Plot: Identifiable {
        let date: Date
        let value: Double
        var id: Date { date }
    }

    private var plots: [Plot] {
        points.compactMap { p in W.dayValue(p.date).map { Plot(date: $0, value: sleep ? p.value / 60 : p.value) } }
    }

    private var band: ClosedRange<Double>? {
        normal.map { sleep ? ($0.lowerBound / 60)...($0.upperBound / 60) : $0 }
    }

    /// The chart's range: the points and the normal with a little room.
    private var domain: ClosedRange<Double> {
        let values = plots.map(\.value) + (sleep ? (need.map { [$0 / 60] } ?? []) : (band.map { [$0.lowerBound, $0.upperBound] } ?? []))
        guard var lo = values.min(), var hi = values.max() else { return 0...1 }
        if hi - lo < (sleep ? 1 : 4) { let mid = (lo + hi) / 2; lo = mid - (sleep ? 0.5 : 2); hi = mid + (sleep ? 0.5 : 2) }
        let pad = (hi - lo) * 0.12
        // Bars stand on zero, so a short night looks short.
        if sleep { return 0...(hi + Swift.max(pad, 0.4)) }
        return Swift.max(0, lo - pad)...(hi + pad)
    }

    /// Two or three round values inside the range, for the labels on the right.
    private var ticks: [Double] {
        let d = domain
        let steps = [0.1, 1, 10, 100, 1000].flatMap { power in [1.0, 2, 2.5, 5].map { $0 * power } }
        for step in steps {
            let first = (d.lowerBound / step).rounded(.up) * step
            let values = stride(from: first, through: d.upperBound, by: step).map { $0 }
            if values.count <= 3, values.count >= 2 { return values }
        }
        return [d.lowerBound, d.upperBound]
    }

    private func axisLabel(_ date: Date, last: Date) -> String {
        abs(date.timeIntervalSince(last)) < 3600 ? W.tr("Dnes", "Today") : W.axisDate(date, month: shown == 90)
    }

    private func tickLabel(_ value: Double) -> String {
        W.number(value, digits: value.rounded() == value ? 0 : 1) + (sleep ? "h" : "")
    }

    private var chart: some View {
        let plots = plots
        let ticks = ticks
        let domain = domain
        let first = plots.first?.date ?? Date()
        let last = plots.last?.date ?? Date()
        let middle = first.addingTimeInterval(last.timeIntervalSince(first) / 2)
        return VStack(spacing: 2) {
            Chart {
                if sleep, let need {
                    // The night's need as one dashed line over the bars.
                    RuleMark(y: .value("Potřeba", need / 60))
                        .foregroundStyle(W.amber)
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                        // Says what the line is, above it on the left, clear of the scale.
                        .annotation(position: .top, alignment: .leading, spacing: 1) {
                            Text(W.tr("potřeba", "need"))
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(W.amber)
                        }
                } else if let band {
                    RectangleMark(xStart: .value("Od", first), xEnd: .value("Do", last),
                                  yStart: .value("Nízko", band.lowerBound), yEnd: .value("Vysoko", band.upperBound))
                        .foregroundStyle(metric.color.opacity(0.16))
                }
                ForEach(plots) { p in
                    if sleep {
                        BarMark(x: .value("Den", p.date, unit: shown == 90 ? .weekOfYear : .day), y: .value("Hodnota", p.value))
                            .foregroundStyle(metric.color.opacity(p.date == last ? 1 : 0.65))
                            .cornerRadius(1)
                    } else {
                        LineMark(x: .value("Den", p.date), y: .value("Hodnota", p.value))
                            .foregroundStyle(metric.color)
                            .lineStyle(StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                    }
                }
                if !sleep, let end = plots.last {
                    PointMark(x: .value("Den", end.date), y: .value("Hodnota", end.value))
                        .foregroundStyle(metric.color)
                        .symbolSize(28)
                }
            }
            .chartYScale(domain: domain)
            // Bars of a night below the range end at its edge; the labels stay whole.
            .chartPlotStyle { $0.clipped() }
            .chartYAxis {
                AxisMarks(position: .trailing, values: ticks) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [2, 3]))
                        .foregroundStyle(W.track)
                    AxisValueLabel {
                        Text(tickLabel(value.as(Double.self) ?? 0))
                            .font(.system(size: 10))
                            .foregroundStyle(W.muted)
                    }
                }
            }
            // The dates under the chart, the last one always "Today".
            .chartXAxis(.hidden)
            HStack(spacing: 0) {
                Text(axisLabel(first, last: last))
                Spacer(minLength: 2)
                Text(axisLabel(middle, last: last))
                Spacer(minLength: 2)
                Text(W.tr("Dnes", "Today"))
            }
            .font(.system(size: 10))
            .foregroundStyle(W.muted)
            .lineLimit(1)
            .padding(.trailing, 24)
        }
    }
}
