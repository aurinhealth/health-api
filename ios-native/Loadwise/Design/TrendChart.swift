import Charts
import SwiftUI

/// A value over days: each day a faint dot, the 7-day average as a line, the
/// personal normal as a band, a finger to read any day ("8. října · 64 ms")
/// and 7 / 30 / 90 days to pick above it.
struct TrendChart: View {
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
            rangePicker
            chart(list, lo: lo, hi: hi, selected: selected, shown: shown)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.summary(list.map { Point(date: $0.iso, value: $0.value) }, unit: unit, digits: digits))
        }
        .onChange(of: days) { picked = nil }
    }

    private func chart(_ list: [Sample], lo: Double, hi: Double, selected: Sample?, shown: Sample?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(shown.map { Fmt.decimal($0.value, digits: digits) } ?? "–").font(Typo.number(26)).foregroundStyle(Palette.ink)
                Text(unit).font(Typo.caption).foregroundStyle(Palette.faint)
                Spacer()
                Text(shown.map { selected == nil ? L10n.f("naposledy · %@", Fmt.dayMonth($0.iso)) : Fmt.dayMonth($0.iso) } ?? "")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Chart {
                if let band, let first = list.first, let last = list.last {
                    RectangleMark(xStart: .value("Od", first.date), xEnd: .value("Do", last.date),
                                  yStart: .value("Spodek", band.lowerBound), yEnd: .value("Vršek", band.upperBound))
                        .foregroundStyle(color.opacity(0.1))
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
            HStack(spacing: 14) {
                legendDot(color.opacity(0.4), "hodnota za den")
                legend(color, "průměr 7 dní")
                if band != nil { legend(color.opacity(0.25), bandLabel ?? "tvoje norma") }
                Spacer()
            }
        }
    }

    /// "7 dní · 30 dní · 90 dní", the chosen one filled.
    private var rangePicker: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 0)
            ForEach(Self.ranges, id: \.self) { n in
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

    private func legendDot(_ c: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(c).frame(width: 6, height: 6)
            Text(text).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
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
        let span = L10n.f("od %@ do %@", Fmt.decimal(lo, digits: digits), Fmt.decimal(hi, digits: digits)) + " " + shownUnit
        let latest = L10n.f("naposledy %@", Fmt.decimal(last, digits: digits)) + " " + shownUnit
        let days = String(values.count) + " " + Fmt.plural(values.count, "den", "dny", "dní")
        return [days, span, latest].joined(separator: ", ")
    }
}
