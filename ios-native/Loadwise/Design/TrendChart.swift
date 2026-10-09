import Charts
import SwiftUI

/// A value over days with its dates and numbers on the axes, the personal
/// normal as a band and a finger to read any day ("8. října · 64 ms").
struct TrendChart: View {
    let points: [Point]
    let color: Color
    let unit: String
    var band: ClosedRange<Double>? = nil
    var bandLabel: String? = nil
    var height: CGFloat = 190
    var digits = 0
    @State private var picked: Date?

    private struct Sample: Identifiable {
        let date: Date
        let iso: String
        let value: Double
        var id: String { iso }
    }

    private var samples: [Sample] {
        points.compactMap { p in ISODay.date(p.date).map { Sample(date: $0, iso: p.date, value: p.value) } }.sorted { $0.date < $1.date }
    }

    var body: some View {
        let list = samples
        let values = list.map(\.value) + [band?.lowerBound, band?.upperBound].compactMap { $0 }
        let pad = max(((values.max() ?? 1) - (values.min() ?? 0)) * 0.15, 1)
        let lo = (values.min() ?? 0) - pad, hi = (values.max() ?? 1) + pad
        let selected = picked.flatMap { date in list.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) } }
        let shown = selected ?? list.last

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(shown.map { Fmt.decimal($0.value, digits: digits) } ?? "–").font(Typo.number(26)).foregroundStyle(Palette.ink)
                Text(unit).font(Typo.caption).foregroundStyle(Palette.faint)
                Spacer()
                Text(shown.map { (selected == nil ? "naposledy · " : "") + Fmt.dayMonth($0.iso) } ?? "")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Chart {
                if let band, let first = list.first, let last = list.last {
                    RectangleMark(xStart: .value("Od", first.date), xEnd: .value("Do", last.date),
                                  yStart: .value("Spodek", band.lowerBound), yEnd: .value("Vršek", band.upperBound))
                        .foregroundStyle(color.opacity(0.1))
                }
                ForEach(list) { s in
                    AreaMark(x: .value("Den", s.date), yStart: .value("Min", lo), yEnd: .value("Hodnota", s.value))
                        .foregroundStyle(LinearGradient(colors: [color.opacity(0.18), color.opacity(0.0)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("Den", s.date), y: .value("Hodnota", s.value))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
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
                AxisMarks(values: .stride(by: .day, count: max(1, list.count / 4))) { _ in
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
                legend(color, "hodnota za den", dashed: false)
                if band != nil { legend(color.opacity(0.25), bandLabel ?? "tvoje norma", dashed: false) }
                Spacer()
            }
            Text("Podrž a táhni prstem pro hodnotu v daný den.").font(Typo.tiny).foregroundStyle(Palette.faint)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.summary(points, unit: unit, digits: digits))
    }

    private func legend(_ c: Color, _ text: String, dashed: Bool) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 14, height: 6)
            Text(text).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
    }

    /// "30 dní, od 56 do 66 ms, naposledy 64 ms" for VoiceOver.
    static func summary(_ points: [Point], unit: String, digits: Int) -> String {
        let values = points.map(\.value)
        guard let last = values.last, let lo = values.min(), let hi = values.max() else { return "Bez dat" }
        let span = "od " + Fmt.decimal(lo, digits: digits) + " do " + Fmt.decimal(hi, digits: digits) + " " + unit
        let latest = "naposledy " + Fmt.decimal(last, digits: digits) + " " + unit
        return ["\(values.count) dní", span, latest].joined(separator: ", ")
    }
}
