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

    /// The coach about this value: today's number against the athlete's usual range.
    private var coach: CoachSubject {
        switch metric {
        case .hrv:
            let h = health.hrv
            var line: String? = h?.value.map { L10n.f("Dnes %@ ms", Fmt.int($0)) }
            if let line0 = line, let low = h?.low, let high = h?.high { line = line0 + " · " + L10n.f("obvyklé rozmezí %@–%@ ms", Fmt.int(low), Fmt.int(high)) }
            let isLow = h?.value != nil && h?.low != nil && h!.value! < h!.low!
            return .metric(metric, line: line, low: isLow, date: health.date)
        case .restingHR:
            let r = health.restingHR
            var line: String? = r?.value.map { L10n.f("Dnes %@ bpm", Fmt.int($0)) }
            let usual = r?.usual
            if let line0 = line, let usual { line = line0 + " · " + L10n.f("obvyklé rozmezí %@–%@ bpm", Fmt.int(usual.lowerBound), Fmt.int(usual.upperBound)) }
            let high = r?.value != nil && usual != nil && r!.value! > usual!.upperBound
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
/// number with its state, the athlete's usual range and the trend with the
/// period's average (chart review 2: no cells repeating it).
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
                DetailRange(value: value, low: low, high: high, label: L10n.f("obvyklé rozmezí %@–%@ ms", Fmt.int(low), Fmt.int(high)) + " · " + L10n.tr("posledních 60 dní"))
                    .padding(.top, 14)
            }
            MetricChart(title: "HRV po nocích", color: Palette.green) {
                TrendChart(points: hrv.series, color: Palette.green, unit: "ms",
                           band: MetricMath.range(hrv.low, hrv.high), bandLabel: MetricMath.usualLabel(hrv.low, hrv.high), worse: .below,
                           trend: MetricMath.trendText(hrv.trend))
            }
        } else {
            MetricEmpty()
        }
    }

    // MARK: Resting heart rate

    @ViewBuilder private var restingHR: some View {
        if let rhr = health.restingHR {
            MetricHeadline(caption: "Nejnižší tep dne v klidu", value: Fmt.int(rhr.value ?? rhr.series.last?.value), unit: "bpm",
                           status: rhr.value.flatMap { v in rhr.usual.map { MetricStatus.compare(v, low: $0.lowerBound, high: $0.upperBound, worseAbove: true) } })
            if let value = rhr.value, let usual = rhr.usual {
                DetailRange(value: value, low: usual.lowerBound, high: usual.upperBound,
                            label: L10n.f("obvyklé rozmezí %@–%@ bpm", Fmt.int(usual.lowerBound), Fmt.int(usual.upperBound)) + " · " + L10n.tr("posledních 60 dní"), worseAbove: true)
                    .padding(.top, 14)
            }
            MetricChart(title: "Klidový tep po dnech", color: Palette.rust) {
                TrendChart(points: rhr.series, color: Palette.rust, unit: "bpm",
                           band: rhr.usual, bandLabel: L10n.tr("obvyklé rozmezí"), worse: .above, per: .day,
                           trend: MetricMath.trend(rhr.series, step: 1))
            }
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
            MetricHeadline(caption: L10n.tr("Dechů za minutu ve spánku") + " · " + L10n.tr("odhad zařízení"), value: Fmt.decimal(r.value), unit: "/min",
                           status: r.baseline.map { MetricStatus.usual(r.value, low: $0 - 0.5, high: $0 + 0.5) }
                               ?? (r.elevated ? MetricStatus.usual(1, low: 0, high: 0) : nil))
            if let base = r.baseline {
                DetailRange(value: r.value, low: base - 0.5, high: base + 0.5,
                            label: L10n.f("obvyklé rozmezí %@–%@ /min", Fmt.decimal(base - 0.5), Fmt.decimal(base + 0.5)), tint: Palette.green)
                    .padding(.top, 14)
            }
            MetricChart(title: "Dech po nocích", color: Palette.green) {
                TrendChart(points: r.series, color: Palette.green, unit: "/min", band: r.baseline.map { ($0 - 0.5)...($0 + 0.5) },
                           bandLabel: L10n.tr("obvyklé rozmezí"), digits: 1, trend: MetricMath.trend(r.series, step: 0.3))
            }
        } else {
            MetricEmpty()
        }
    }

    // MARK: Temperature

    /// Apple Watch's wrist temperature, else Google's skin temperature: both as
    /// the night's distance from the athlete's own usual.
    @ViewBuilder private var temperature: some View {
        let unit = Units.temperatureUnit
        let change: (Double) -> Double = { Units.temperatureChange($0) }
        if let wrist = health.wristTemp {
            let nights = (wrist.deviations ?? []).map { Point(date: $0.date, value: change($0.value)) }
            if let d = wrist.deviation {
                temperatureTop(deviation: d)
            } else {
                MetricHeadline(caption: L10n.tr("Teplota zápěstí v noci") + " · " + L10n.tr("odhad zařízení"), value: Fmt.decimal(Units.temperature(wrist.value)), unit: unit)
            }
            if nights.count > 1 {
                temperatureChart(nights, trend: MetricMath.trend(nights, step: change(0.1)))
            } else {
                MetricChart(title: "Teplota po nocích", color: Palette.amber) {
                    TrendChart(points: wrist.series.map { Point(date: $0.date, value: Units.temperature($0.value)) }, color: Palette.amber, unit: unit, digits: 1,
                               trend: MetricMath.trend(wrist.series, step: change(0.1)))
                }
            }
            // The measured temperature, shown nowhere else once the headline is the deviation.
            if wrist.deviation != nil {
                StatRow(title: "Teplota", value: Fmt.decimal(Units.temperature(wrist.value)), unit: unit)
                    .padding(.top, 12)
            }
        } else if let skin = health.skinTemp {
            let nights = skin.series.map { Point(date: $0.date, value: change($0.value)) }
            temperatureTop(deviation: skin.deviation)
            temperatureChart(nights, trend: MetricMath.trend(nights, step: change(0.1)))
        } else {
            MetricEmpty()
        }
    }

    /// The usual night is within half a degree of the athlete's own average.
    @ViewBuilder private func temperatureTop(deviation d: Double) -> some View {
        let unit = Units.temperatureUnit
        MetricHeadline(caption: L10n.tr("Odchylka od obvyklé teploty v noci") + " · " + L10n.tr("odhad zařízení"), value: Fmt.signed(Units.temperatureChange(d), digits: 1), unit: unit,
                       status: MetricStatus.usual(d, low: -0.5, high: 0.5))
        DetailRange(value: d, low: -0.5, high: 0.5,
                    label: L10n.f("obvyklé rozmezí %@", "±" + Fmt.decimal(Units.temperatureChange(0.5)) + " " + unit), tint: Palette.amber)
            .padding(.top, 14)
    }

    private func temperatureChart(_ nights: [Point], trend: String) -> some View {
        let half = Units.temperatureChange(0.5)
        return MetricChart(title: "Teplota po nocích", color: Palette.amber) {
            TrendChart(points: nights, color: Palette.amber, unit: Units.temperatureUnit, band: -half...half,
                       bandLabel: L10n.tr("obvyklé rozmezí"), digits: 1, trend: trend)
        }
    }

    // MARK: Blood oxygen

    @ViewBuilder private var oxygen: some View {
        if let o = health.oxygen {
            let digits = o.value.rounded() == o.value ? 0 : 1
            // No fixed 95 % line: only the athlete's own nights before this one (MDR, Today audit 1;
            // audit 16.3: the shown night is not in its own range).
            MetricHeadline(caption: L10n.tr("Nasycení krve kyslíkem ve spánku") + " · " + L10n.tr("odhad zařízení"), value: Fmt.decimal(o.value, digits: digits), unit: "%",
                           status: o.high > o.low ? MetricStatus.usual(o.value, low: o.low, high: o.high) : nil)
            if o.high > o.low {
                DetailRange(value: o.value, low: o.low, high: o.high, label: L10n.f("obvyklé rozmezí %@–%@ %%", Fmt.int(o.low), Fmt.int(o.high)), tint: Palette.blue)
                    .padding(.top, 14)
            }
            MetricChart(title: "Kyslík po nocích", color: Palette.blue) {
                TrendChart(points: o.series, color: Palette.blue, unit: "%", band: o.high > o.low ? o.low...o.high : nil, bandLabel: L10n.tr("obvyklé rozmezí"), digits: 1,
                           trend: MetricMath.trend(o.series, step: 0.5))
            }
            // The lowest night, shown nowhere else.
            StatRow(title: "Nejnižší noc", value: Fmt.decimal(o.series.map(\.value).min(), digits: digits), unit: "%")
                .padding(.top, 12)
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
            // The change runs from the first measurement of the 60 days, so it says
            // since when (audit 16.8), not "za 2 měsíce".
            let since = value.series.first.map { Fmt.dayMonthShort($0.date) } ?? ""
            MetricHeadline(caption: caption, value: Fmt.decimal(convert(value.value)), unit: unit, status: Self.changeStatus(value.change, since: since, convert: convert, good: good == true))
            MetricChart(title: "Po měřeních", color: color) {
                CompositionChart(points: series, color: color, unit: unit)
            }
        } else {
            MetricEmpty()
        }
    }
}

extension MetricDetailContent {
    /// "↓ 0,8 od 12. 9.", green when it moved the good way.
    static func changeStatus(_ change: Double?, since: String, convert: (Double) -> Double, good: Bool) -> MetricStatus? {
        guard let change, change != 0 else { return nil }
        return MetricStatus(text: L10n.f("%@ %@ od %@", change > 0 ? "↑" : "↓", Fmt.decimal(abs(convert(change))), since),
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

    /// Breathing, temperature and blood oxygen: where the value is against the
    /// athlete's usual range, in ink, never better or worse (MDR, Today audit 1).
    static func usual(_ value: Double, low: Double, high: Double) -> MetricStatus {
        if value > high { return MetricStatus(text: "↑ " + L10n.tr("nad obvyklým rozmezím"), color: Palette.ink) }
        if value < low { return MetricStatus(text: "↓ " + L10n.tr("pod obvyklým rozmezím"), color: Palette.ink) }
        return MetricStatus(text: L10n.tr("v obvyklém rozmezí"), color: Palette.ink)
    }

    static func compare(_ value: Double, low: Double, high: Double, worseAbove: Bool) -> MetricStatus {
        if value > high { return MetricStatus(text: "↑ " + L10n.tr("nad obvyklým rozmezím"), color: worseAbove ? Palette.rust : Palette.green) }
        if value < low { return MetricStatus(text: "↓ " + L10n.tr("pod obvyklým rozmezím"), color: worseAbove ? Palette.green : Palette.rust) }
        return MetricStatus(text: L10n.tr("v obvyklém rozmezí"), color: Palette.green)
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
    /// The last 7 values against the 7 before them.
    static func trend(_ points: [Point], step: Double) -> String {
        let last = points.suffix(7).map(\.value), before = points.dropLast(7).suffix(7).map(\.value)
        guard !last.isEmpty, !before.isEmpty else { return "–" }
        let change = last.reduce(0, +) / Double(last.count) - before.reduce(0, +) / Double(before.count)
        return trendText(change > step ? "up" : change < -step ? "down" : "stable")
    }

    /// "obvyklé rozmezí 56–66 ms".
    static func usualLabel(_ low: Double?, _ high: Double?) -> String {
        guard let low, let high else { return L10n.tr("obvyklé rozmezí") }
        return L10n.f("obvyklé rozmezí %@–%@ ms", Fmt.int(low), Fmt.int(high))
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
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
            }
            .padding(.vertical, 13)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
    }
}

/// Body fat and muscle as the weight's chart: each weigh-in a dot, the trend
/// through them as a line, 30 or 60 days (what the server sends). A 7-day
/// average over a few weigh-ins only repeated the dots (chart review 13).
private struct CompositionChart: View {
    let points: [Point]
    let color: Color
    let unit: String
    @State private var days = 60

    var body: some View {
        let from = points.last.map { ISODay.shift($0.date, -days) } ?? ""
        let shown = points.filter { $0.date > from }
        let raw = shown.map(\.value)
        let lo = (raw.min() ?? 0) - 0.5, hi = (raw.max() ?? 1) + 0.5
        VStack(alignment: .leading, spacing: 10) {
            RangePicker(ranges: [30, 60], days: $days)
            TrendDotsChart(raw: raw, trend: WeightDetailContent.smoothed(raw), lo: lo, hi: hi, height: 160, scale: scaleTicks(lo, hi), color: color)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(TrendChart.summary(shown, unit: unit, digits: 1))
                .accessibilityChartDescriptor(TrendAudioGraph(points: shown, unit: unit, digits: 1, days: days))
            ChartSpan(dates: shown.map(\.date)).padding(.trailing, scaleWidth)
            HStack(spacing: 14) {
                HStack(spacing: 5) {
                    Circle().fill(color.opacity(0.4)).frame(width: 7, height: 7)
                    Text("vážení").font(Typo.tiny).foregroundStyle(Palette.muted)
                }
                HStack(spacing: 5) {
                    Capsule().fill(color).frame(width: 14, height: 2.6)
                    Text("trend").font(Typo.tiny).foregroundStyle(Palette.muted)
                }
            }
        }
    }
}
