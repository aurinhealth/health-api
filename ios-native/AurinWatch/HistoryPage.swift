import Charts
import SwiftUI

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
            Text(header)
                .font(W.label(10))
                .tracking(0.6)
                .foregroundStyle(metric.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(days.average.map(format) ?? "–")
                    .font(W.serif(28))
                    .foregroundStyle(W.ink)
                Text(metric.unit + " " + W.tr("průměr", "avg"))
                    .font(.system(size: 11))
                    .foregroundStyle(W.secondary)
                Spacer(minLength: 2)
                if let need {
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
            chart.padding(.top, 4)
            Spacer(minLength: 2)
            if shown == 90 {
                Text(trend)
                    .font(W.news(12))
                    .foregroundStyle(W.secondary)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
            } else {
                Tiles(items: tiles, color: sleep ? W.amber : metric.color)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

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

    /// The second half of the span against the first.
    private var change: (String, Color)? {
        guard days.count >= 4 else { return nil }
        let half = days.count / 2
        guard let before = Array(days.prefix(half)).average, let after = Array(days.suffix(days.count - half)).average else { return nil }
        let diff = (after - before).rounded()
        let good = metric.higherIsBetter ? diff >= 0 : diff <= 0
        return (W.change(diff), diff == 0 ? W.muted : good ? W.green : W.amber)
    }

    private var trend: String {
        let weeks = days.weekly
        guard let first = weeks.first?.value, let last = weeks.last?.value, weeks.count > 2 else { return "" }
        let diff = last - first
        let flat = abs(diff) < (sleep ? 10 : 1.5)
        let lead = W.tr("Průměry týdnů. ", "Weekly averages. ")
        if flat { return lead + W.tr("Drží se stejně.", "Holding steady.") }
        switch metric {
        case .restingHR:
            return lead + (diff < 0 ? W.tr("Klesá: kondice se zlepšuje.", "Going down: your fitness is improving.")
                                    : W.tr("Stoupá: hlídej regeneraci.", "Going up: watch your recovery."))
        case .hrv:
            return lead + (diff > 0 ? W.tr("Stoupá: tělo se zotavuje dobře.", "Going up: you recover well.")
                                    : W.tr("Klesá: hlídej regeneraci.", "Going down: watch your recovery."))
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

    /// Three round values from below the lowest to above the highest point and the normal.
    private var ticks: [Double] {
        let values = plots.map(\.value) + (band.map { [$0.lowerBound, $0.upperBound] } ?? [])
        guard let lo = values.min(), let hi = values.max() else { return [0, 1, 2] }
        let step = Swift.max(niceStep((hi - lo) / 2), sleep ? 1 : 2)
        var low = (lo / step).rounded(.down) * step
        var high = (hi / step).rounded(.up) * step
        if high - low < 2 * step { high = low + 2 * step }
        // An even span, so the middle tick is round too.
        if Int(((high - low) / step).rounded()) % 2 == 1 { high += step }
        if sleep { low = Swift.max(0, low) }
        return [low, (low + high) / 2, high]
    }

    private func niceStep(_ raw: Double) -> Double {
        guard raw > 0 else { return 1 }
        let power = pow(10, (log10(raw)).rounded(.down))
        let unit = raw / power
        return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
    }

    private func axisLabel(_ date: Date?, last: Date) -> String {
        guard let date else { return "" }
        return abs(date.timeIntervalSince(last)) < 3600 ? W.tr("Dnes", "Today") : W.axisDate(date, month: shown == 90)
    }

    private var chart: some View {
        let plots = plots
        let ticks = ticks
        let first = plots.first?.date ?? Date()
        let last = plots.last?.date ?? Date()
        let middle = first.addingTimeInterval(last.timeIntervalSince(first) / 2)
        return VStack(alignment: .trailing, spacing: 1) {
            if band != nil {
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(metric.color.opacity(0.35)).frame(width: 10, height: 6)
                    Text(W.tr("tvůj normál", "your normal"))
                        .font(W.label(8))
                        .foregroundStyle(metric.color)
                }
                .padding(.trailing, 22)
            }
            Chart {
                if let band {
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
            .chartYScale(domain: ticks[0]...ticks[2])
            .chartYAxis {
                AxisMarks(position: .trailing, values: ticks) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [2, 3]))
                        .foregroundStyle(W.track)
                    AxisValueLabel {
                        Text(W.number(value.as(Double.self) ?? 0) + (sleep ? "h" : ""))
                            .font(.system(size: 8.5))
                            .foregroundStyle(W.muted)
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: [first, middle, last]) { value in
                    AxisValueLabel {
                        Text(axisLabel(value.as(Date.self), last: last))
                            .font(.system(size: 8.5))
                            .foregroundStyle(W.muted)
                    }
                }
            }
            .frame(height: 62)
        }
    }
}
