import SwiftUI

/// A value of Zdraví with its own detail. Its widget opens it, and so does
/// every row that shows it elsewhere (Spánek, Váha).
enum HealthMetric: String, Hashable, CaseIterable {
    case hrv, restingHR, respiration, temperature, oxygen, bodyFat, muscle

    var title: String {
        switch self {
        case .hrv: return "HRV"
        case .restingHR: return "Klidový tep"
        case .respiration: return "Dech ve spánku"
        case .temperature: return "Teplota zápěstí"
        case .oxygen: return "Kyslík v krvi"
        case .bodyFat: return "Tělesný tuk"
        case .muscle: return "Svalová hmota"
        }
    }
}

struct MetricDetailView: View {
    let metric: HealthMetric
    let health: HealthSnapshot

    /// The coach about this value: today's number against the athlete's normal.
    private var coach: CoachSubject {
        switch metric {
        case .hrv:
            let h = health.hrv
            var line: String? = h?.value.map { L10n.tr("Dnes") + " " + Fmt.int($0) + " ms" }
            if let line0 = line, let low = h?.low, let high = h?.high { line = line0 + " · " + L10n.f("normál %@–%@ ms", Fmt.int(low), Fmt.int(high)) }
            let isLow = h?.value != nil && h?.low != nil && h!.value! < h!.low!
            return .metric(metric, line: line, low: isLow, date: health.date)
        case .restingHR:
            let r = health.restingHR
            var line: String? = r?.value.map { L10n.tr("Dnes") + " " + Fmt.int($0) + " bpm" }
            if let line0 = line, let base = r?.baseline { line = line0 + " · " + L10n.f("normál %@ bpm", Fmt.int(base)) }
            let high = r?.value != nil && r?.baseline != nil && r!.value! > r!.baseline! + 3
            return .metric(metric, line: line, low: high, date: health.date)
        default:
            return .metric(metric, line: nil, date: health.date)
        }
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.health, title: metric.title, coach: coach) {
            MetricDetailContent(metric: metric, health: health)
        }
    }
}

/// The detail of one value, all in the same order: what is measured, the
/// number with its state, the athlete's normal, the trend and three cells.
struct MetricDetailContent: View {
    let metric: HealthMetric
    let health: HealthSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: metric.title).padding(.top, 24)
            switch metric {
            case .hrv: hrv
            case .restingHR: restingHR
            case .respiration: respiration
            case .temperature: temperature
            case .oxygen: oxygen
            case .bodyFat: composition(health.weight?.bodyFat, unit: "%", color: Palette.gold, caption: "Podíl tuku v těle", lowerIsBetter: true)
            case .muscle: composition(health.weight?.muscle, unit: Units.weightUnit, color: Palette.brown, caption: "Svalová hmota z chytré váhy", lowerIsBetter: false, weight: true)
            }
        }
    }

    // MARK: HRV

    @ViewBuilder private var hrv: some View {
        if let hrv = health.hrv {
            MetricHeadline(caption: "Variabilita srdečního tepu v noci", value: Fmt.int(hrv.value ?? hrv.series.last?.value), unit: "ms",
                           status: hrv.value.flatMap { v in hrv.low.flatMap { low in hrv.high.map { MetricStatus.compare(v, low: low, high: $0, worseAbove: false) } } })
            if let value = hrv.value, let low = hrv.low, let high = hrv.high, high > low {
                DetailRange(value: value, low: low, high: high, label: L10n.f("tvůj normál %@", Fmt.int(low) + "–" + Fmt.int(high) + " ms"))
                    .padding(.top, 14)
            }
            MetricChart(title: "HRV po nocích", color: Palette.green) {
                TrendChart(points: hrv.series, color: Palette.green, unit: "ms",
                           band: MetricMath.range(hrv.low, hrv.high), bandLabel: MetricMath.normLabel(hrv.low, hrv.high), worse: .below)
            }
            ThreeCells(cells: [("7 dní", Fmt.int(hrv.week)), ("Norma (60 dní)", Fmt.int(hrv.baseline)), ("Trend", MetricMath.trendText(hrv.trend))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
    }

    // MARK: Resting heart rate

    @ViewBuilder private var restingHR: some View {
        if let rhr = health.restingHR {
            MetricHeadline(caption: "Nejnižší tep dne v klidu", value: Fmt.int(rhr.value ?? rhr.series.last?.value), unit: "bpm",
                           status: rhr.value.flatMap { v in rhr.baseline.map { MetricStatus.compare(v, low: $0 - 2, high: $0 + 2, worseAbove: true) } })
            if let value = rhr.value, let base = rhr.baseline {
                DetailRange(value: value, low: base - 2, high: base + 2,
                            label: L10n.f("tvůj normál %@", Fmt.int(base - 2) + "–" + Fmt.int(base + 2) + " bpm"), worseAbove: true)
                    .padding(.top, 14)
            }
            MetricChart(title: "Klidový tep po dnech", color: Palette.rust) {
                TrendChart(points: rhr.series, color: Palette.rust, unit: "bpm",
                           band: rhr.baseline.map { ($0 - 2)...($0 + 2) }, bandLabel: L10n.tr("norma ± 2 bpm"), worse: .above)
            }
            ThreeCells(cells: [("7 dní", Fmt.int(MetricMath.week(rhr.series))), ("Norma", Fmt.int(rhr.baseline)), ("Trend", MetricMath.trend(rhr.series, step: 1))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
        if health.hrRecovery != nil || health.walkingHR != nil {
            SectionLabel(text: "Srdce a návyky").padding(.top, 32)
            VStack(spacing: 0) {
                if let r = health.hrRecovery { StatRow(title: "Zotavení tepu po tréninku", value: Fmt.int(r.value), unit: "bpm") }
                if let w = health.walkingHR { StatRow(title: "Tep při chůzi", value: Fmt.int(w.value), unit: "bpm") }
            }
            .padding(.top, 8)
        }
    }

    // MARK: Breathing

    @ViewBuilder private var respiration: some View {
        if let r = health.respiration {
            MetricHeadline(caption: "Dechů za minutu ve spánku", value: Fmt.decimal(r.value), unit: "/min",
                           status: r.baseline.map { MetricStatus.compare(r.value, low: $0 - 0.5, high: $0 + 0.5, worseAbove: true) }
                               ?? MetricStatus(text: L10n.tr(r.elevated ? "zrychlený" : "v normě"), color: r.elevated ? Palette.rust : Palette.green))
            if let base = r.baseline {
                DetailRange(value: r.value, low: base - 0.5, high: base + 0.5,
                            label: L10n.f("tvůj normál %@", Fmt.decimal(base - 0.5) + "–" + Fmt.decimal(base + 0.5) + " /min"), worseAbove: true)
                    .padding(.top, 14)
            }
            MetricChart(title: "Dech po nocích", color: Palette.green) {
                TrendChart(points: r.series, color: Palette.green, unit: "/min", band: r.baseline.map { ($0 - 0.5)...($0 + 0.5) },
                           bandLabel: L10n.tr("tvoje norma"), digits: 1, worse: .above)
            }
            ThreeCells(cells: [("7 dní", Fmt.decimal(MetricMath.week(r.series))), ("Norma", Fmt.decimal(r.baseline)), ("Trend", MetricMath.trend(r.series, step: 0.3))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
    }

    // MARK: Temperature

    /// Apple Watch's wrist temperature, else Google's skin temperature: both as
    /// the night's distance from the athlete's own normal.
    @ViewBuilder private var temperature: some View {
        let unit = Units.temperatureUnit
        let change: (Double) -> Double = { Units.temperatureChange($0) }
        if let wrist = health.wristTemp {
            let nights = (wrist.deviations ?? []).map { Point(date: $0.date, value: change($0.value)) }
            if let d = wrist.deviation {
                temperatureTop(deviation: d)
            } else {
                MetricHeadline(caption: "Teplota zápěstí v noci", value: Fmt.decimal(Units.temperature(wrist.value)), unit: unit)
            }
            if nights.count > 1 {
                temperatureChart(nights)
            } else {
                MetricChart(title: "Teplota po nocích", color: Palette.rust) {
                    TrendChart(points: wrist.series.map { Point(date: $0.date, value: Units.temperature($0.value)) }, color: Palette.rust, unit: unit, digits: 1)
                }
            }
            ThreeCells(cells: [("7 dní", nights.isEmpty ? "–" : Fmt.signed(MetricMath.week(nights) ?? 0, digits: 1)),
                               ("Teplota", Fmt.decimal(Units.temperature(wrist.value))),
                               ("Trend", MetricMath.trend(nights.isEmpty ? wrist.series : nights, step: change(0.1)))])
                .padding(.top, 20)
        } else if let skin = health.skinTemp {
            let nights = skin.series.map { Point(date: $0.date, value: change($0.value)) }
            temperatureTop(deviation: skin.deviation)
            temperatureChart(nights)
            ThreeCells(cells: [("7 dní", Fmt.signed(MetricMath.week(nights) ?? 0, digits: 1)),
                               ("Nocí", String(nights.count)),
                               ("Trend", MetricMath.trend(nights, step: change(0.1)))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
    }

    /// The usual night is within half a degree of the athlete's own average.
    @ViewBuilder private func temperatureTop(deviation d: Double) -> some View {
        let unit = Units.temperatureUnit
        MetricHeadline(caption: "Odchylka od tvého normálu v noci", value: Fmt.signed(Units.temperatureChange(d), digits: 1), unit: unit,
                       status: MetricStatus.compare(d, low: -0.5, high: 0.5, worseAbove: true))
        DetailRange(value: d, low: -0.5, high: 0.5,
                    label: L10n.f("tvůj normál %@", "±" + Fmt.decimal(Units.temperatureChange(0.5)) + " " + unit), worseAbove: true)
            .padding(.top, 14)
    }

    private func temperatureChart(_ nights: [Point]) -> some View {
        let half = Units.temperatureChange(0.5)
        return MetricChart(title: "Teplota po nocích", color: Palette.rust) {
            TrendChart(points: nights, color: Palette.rust, unit: Units.temperatureUnit, band: -half...half,
                       bandLabel: L10n.tr("tvoje norma"), digits: 1, worse: .above)
        }
    }

    // MARK: Blood oxygen

    @ViewBuilder private var oxygen: some View {
        if let o = health.oxygen {
            let digits = o.value.rounded() == o.value ? 0 : 1
            MetricHeadline(caption: "Nasycení krve kyslíkem ve spánku", value: Fmt.decimal(o.value, digits: digits), unit: "%",
                           status: o.value < 95 ? MetricStatus(text: L10n.tr("pod normou"), color: Palette.rust) : MetricStatus(text: L10n.tr("v normě"), color: Palette.green))
            if o.high > o.low {
                DetailRange(value: o.value, low: o.low, high: o.high, label: L10n.f("14 dní %@–%@ %%", Fmt.int(o.low), Fmt.int(o.high)))
                    .padding(.top, 14)
            }
            MetricChart(title: "Kyslík po nocích", color: Palette.blue) {
                TrendChart(points: o.series, color: Palette.blue, unit: "%", band: 95...100, bandLabel: L10n.tr("tvoje norma"), digits: 1, worse: .below)
            }
            ThreeCells(cells: [("7 dní", Fmt.decimal(MetricMath.week(o.series))), ("Nejníž", Fmt.decimal(o.series.map(\.value).min(), digits: digits)),
                               ("Trend", MetricMath.trend(o.series, step: 0.5))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
    }

    // MARK: Body composition

    @ViewBuilder private func composition(_ value: HealthSnapshot.BodyFat?, unit: String, color: Color, caption: String, lowerIsBetter: Bool, weight: Bool = false) -> some View {
        if let value {
            let convert: (Double) -> Double = { weight ? Units.weight($0) : $0 }
            let series = value.series.map { Point(date: $0.date, value: convert($0.value)) }
            let good = value.change.map { lowerIsBetter ? $0 < 0 : $0 > 0 }
            MetricHeadline(caption: caption, value: Fmt.decimal(convert(value.value)), unit: unit, status: Self.changeStatus(value.change, convert: convert, good: good == true))
            MetricChart(title: "Po měřeních", color: color) {
                TrendChart(points: series, color: color, unit: unit, digits: 1)
            }
            ThreeCells(cells: [("Měření", String(series.count)), ("Za 2 měsíce", value.change.map { Fmt.signed(convert($0), digits: 1) } ?? "–"),
                               ("Trend", MetricMath.trend(series, step: 0.3))])
                .padding(.top, 20)
        } else {
            MetricEmpty()
        }
    }
}

extension MetricDetailContent {
    /// "↓ 0,8 za 2 měsíce", green when it moved the good way.
    static func changeStatus(_ change: Double?, convert: (Double) -> Double, good: Bool) -> MetricStatus? {
        guard let change, change != 0 else { return nil }
        return MetricStatus(text: L10n.f("%@ %@ za 2 měsíce", change > 0 ? "↑" : "↓", Fmt.decimal(abs(convert(change)))),
                            color: good ? Palette.green : Palette.amber)
    }
}

/// What the value is, the big number, its unit and its state.
struct MetricHeadline: View {
    let caption: String
    let value: String
    let unit: String
    var status: MetricStatus? = nil

    var body: some View {
        Text(caption).font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 24)
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            Text(verbatim: value).font(Typo.number(104)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
            Text(verbatim: unit).font(Typo.small).foregroundStyle(Palette.faint)
            if let status { Pill(text: status.text, foreground: status.color, background: status.color.opacity(0.14)) }
        }
    }
}

struct MetricStatus {
    let text: String
    let color: Color

    static func compare(_ value: Double, low: Double, high: Double, worseAbove: Bool) -> MetricStatus {
        if value > high { return MetricStatus(text: L10n.tr("nad normou"), color: worseAbove ? Palette.rust : Palette.green) }
        if value < low { return MetricStatus(text: L10n.tr("pod normou"), color: worseAbove ? Palette.green : Palette.rust) }
        return MetricStatus(text: L10n.tr("v normě"), color: Palette.green)
    }
}

struct MetricChart<Chart: View>: View {
    let title: String
    let color: Color
    @ViewBuilder var chart: Chart

    var body: some View {
        Card {
            WidgetHeader(title: title, color: color)
            chart
        }
        .padding(.top, 20)
    }
}

private struct MetricEmpty: View {
    var body: some View {
        Text("Zatím žádné měření.").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 24)
    }
}

enum MetricMath {
    /// The mean of the last 7 values.
    static func week(_ points: [Point]) -> Double? {
        let values = points.suffix(7).map(\.value)
        return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    /// The last 7 values against the 7 before them.
    static func trend(_ points: [Point], step: Double) -> String {
        let last = points.suffix(7).map(\.value), before = points.dropLast(7).suffix(7).map(\.value)
        guard !last.isEmpty, !before.isEmpty else { return "–" }
        let change = last.reduce(0, +) / Double(last.count) - before.reduce(0, +) / Double(before.count)
        return trendText(change > step ? "up" : change < -step ? "down" : "stable")
    }

    /// "norma 56–66 ms".
    static func normLabel(_ low: Double?, _ high: Double?) -> String {
        guard let low, let high else { return L10n.tr("tvoje norma") }
        return L10n.f("norma %@–%@ ms", Fmt.int(low), Fmt.int(high))
    }

    static func range(_ low: Double?, _ high: Double?) -> ClosedRange<Double>? {
        guard let low, let high, high > low else { return nil }
        return low...high
    }

    static func trendText(_ t: String?) -> String {
        switch t {
        case "up": return L10n.tr("↑ stoupá")
        case "down": return L10n.tr("↓ klesá")
        case "stable": return L10n.tr("stabilní")
        default: return "–"
        }
    }
}

/// A row with a value that opens the value's own detail.
struct MetricRow: View {
    let metric: HealthMetric
    let title: String
    let value: String
    var unit: String? = nil

    var body: some View {
        RouteLink(route: .metric(metric)) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink)
                if let unit { Text(unit).font(Typo.small).foregroundStyle(Palette.faint) }
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.vertical, 13)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
    }
}
