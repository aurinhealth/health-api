import SwiftUI

// Today's widgets. Every widget has the same build: a dot and a name, the main
// number, one line of context and a chart (see the design's widget gallery).

struct FoodWidget: View {
    let nutrition: TodaySnapshot.Nutrition
    var size: WidgetSize = .medium
    /// The drinks could not be read this time: "–" and a line saying so.
    var waterFailed = false

    var body: some View {
        Card {
            WidgetHeader(title: "Jídlo a pití", color: Palette.amberBar)
            if size == .small {
                VStack(alignment: .leading, spacing: 4) {
                    NumberText(value: Fmt.int(nutrition.kcal), unit: "kcal")
                    Text(L10n.f("z %@", Fmt.int(nutrition.target))).font(Typo.caption).foregroundStyle(Palette.faint)
                }
                ProgressLine(fraction: fraction(nutrition.kcal, nutrition.target), height: 5)
            } else {
                full
            }
        }
    }

    @ViewBuilder private var full: some View {
        HStack(alignment: .firstTextBaseline) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.int(nutrition.kcal)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                Text("/ " + Fmt.int(nutrition.target) + " kcal").font(Typo.number(17)).foregroundStyle(Palette.faint)
            }
            Spacer()
            if let bonus = nutrition.trainingBonus, bonus > 0 {
                Text(L10n.f("+%@ trénink", Fmt.int(bonus))).font(Typo.caption).foregroundStyle(Palette.amber)
            }
        }
        ProgressLine(fraction: fraction(nutrition.kcal, nutrition.target), height: 5)
        HStack(alignment: .top, spacing: 12) {
            macro("Bílkoviny", nutrition.protein.eaten, "g", fraction(nutrition.protein.eaten, nutrition.protein.target), Palette.brown)
            macro("Sacharidy", nutrition.carbs.eaten, "g", fraction(nutrition.carbs.eaten, nutrition.carbs.target), Palette.amberBar)
            macro("Tuky", nutrition.fat.eaten, "g", fraction(nutrition.fat.eaten, nutrition.fat.target), Palette.gold)
            macro("Voda", waterFailed ? nil : nutrition.water.ml.map { Units.imperial ? Units.volume($0) : $0 / 1000 }, Units.imperial ? Units.volumeUnit : "l", waterFailed ? 0 : fraction(nutrition.water.ml, nutrition.water.target), Palette.blue, digits: Units.imperial ? 0 : 1)
        }
        if waterFailed {
            Divider().overlay(Palette.hairline)
            PartUnavailableNote(text: "Pití se teď nepodařilo načíst").padding(.horizontal, -16).padding(.vertical, -6)
        }
    }

    private func fraction(_ value: Double?, _ target: Double?) -> Double {
        guard let value, let target, target > 0 else { return 0 }
        return value / target
    }

    private func macro(_ title: String, _ value: Double?, _ unit: String, _ progress: Double, _ color: Color, digits: Int = 0) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Typo.tiny).foregroundStyle(Palette.muted).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(digits == 0 ? Fmt.int(value) : Fmt.decimal(value, digits: digits)).font(Typo.number(19)).foregroundStyle(Palette.ink)
                if value != nil { Text(unit).font(Typo.tiny).foregroundStyle(Palette.faint) }
            }
            ProgressLine(fraction: progress, color: color, height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StepsWidget: View {
    let steps: TodaySnapshot.Steps
    var size: WidgetSize = .medium
    /// The hours shown in the day chart.
    private let hours = Array(6...22)

    var body: some View {
        Card {
            WidgetHeader(title: "Pohyb", color: Palette.amberBar)
            SizedWidgetBody(size: size) {
                Text(Fmt.int(steps.today)).font(Typo.number(34)).foregroundStyle(Palette.ink).lineLimit(1)
                Text(L10n.f("kroků z %@", Fmt.int(steps.goal)) + percent).font(Typo.caption).foregroundStyle(Palette.amber)
                    .lineLimit(1).minimumScaleFactor(0.8)
            } chart: { height in
                if let hourly = steps.hourly, hourly.count == 24 {
                    dayChart(hourly, height: height)
                } else {
                    weekChart(height: height)
                }
            }
        }
    }

    /// Running total through the day: past hours filled, the current hour
    /// highlighted, the rest of the day dashed at the usual level.
    private func dayChart(_ hourly: [Double], height: CGFloat) -> some View {
        let now = steps.hour ?? 23
        let total = hourly.indices.map { h in hourly[0...h].reduce(0, +) }
        let values = hours.map { h in h <= now ? total[h] : max(total[now], steps.usual?[h] ?? total[now]) }
        let styles = hours.map { h in
            h < now ? BarStyle(fill: Palette.sand) : h == now ? BarStyle(fill: Palette.amberBar) : BarStyle(fill: Palette.amberBar, dashed: true)
        }
        return BarChart(values: values, styles: styles,
                        hi: max(steps.goal * 1.05, values.max() ?? 0),
                        target: steps.goal,
                        labels: hours.map { [6, 10, 14, 18, 22].contains($0) ? String($0) : "" },
                        highlighted: hours.firstIndex(of: now),
                        spacing: size == .small ? 1.5 : 2.5,
                        height: height,
                        targetLabel: goalLabel)
    }

    private func weekChart(height: CGFloat) -> some View {
        BarChart(values: steps.week.map(\.value),
                 styles: steps.week.indices.map { i in
                     i == steps.week.count - 1 ? BarStyle(fill: Palette.amberBar)
                         : BarStyle(fill: steps.week[i].value >= steps.goal ? Palette.amberBar.opacity(0.75) : Palette.sand)
                 },
                 hi: max(steps.goal * 1.15, steps.week.map(\.value).max() ?? 0),
                 target: steps.goal,
                 labels: steps.week.map { Fmt.weekdayInitial($0.date) },
                 highlighted: steps.week.count - 1,
                 height: height,
                 targetLabel: goalLabel)
    }

    /// "cíl 10 000" over the dashed line.
    private var goalLabel: String { L10n.f("cíl %@", Fmt.int(steps.goal)) }

    private var percent: String {
        guard let today = steps.today, steps.goal > 0 else { return "" }
        return " · " + Fmt.int(today / steps.goal * 100) + " %"
    }
}

struct RestingHRWidget: View {
    let restingHR: TodaySnapshot.RestingHR
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Klidový tep", color: Palette.rust)
            SizedWidgetBody(size: size, smallShowsChart: range == nil) {
                NumberText(value: Fmt.int(restingHR.value), unit: "bpm")
                if let range, let value = restingHR.value {
                    TileRange(value: value, low: range.lowerBound, high: range.upperBound, worseAbove: true, edges: (Fmt.int(range.lowerBound), Fmt.int(range.upperBound)))
                }
            } chart: { height in
                LineChart(values: values, color: Palette.rust,
                          lo: (values.min() ?? 40) - 3, hi: (values.max() ?? 60) + 3,
                          band: range, height: height)
            }
        }
    }

    private var values: [Double] { restingHR.series.map(\.value) }

    /// The usual resting heart rate, ±2 beats around the baseline.
    private var range: ClosedRange<Double>? { restingHR.baseline.map { ($0 - 2)...($0 + 2) } }
}

struct HRVWidget: View {
    let hrv: TodaySnapshot.HRV
    var restingHR: Double? = nil
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Srdce · HRV", color: Palette.green)
            SizedWidgetBody(size: size, smallShowsChart: band == nil || hrv.value == nil) {
                NumberText(value: Fmt.int(hrv.value ?? hrv.series.last?.value), unit: "ms")
                if let band, let value = hrv.value {
                    TileRange(value: value, low: band.lowerBound, high: band.upperBound, edges: (Fmt.int(band.lowerBound), Fmt.int(band.upperBound)))
                } else {
                    Text(note).font(Typo.caption).foregroundStyle(Palette.green).lineLimit(1)
                }
            } chart: { height in
                LineChart(values: values, color: Palette.green,
                          lo: min(values.min() ?? 40, hrv.low ?? 40) - 4, hi: max(values.max() ?? 70, hrv.high ?? 70) + 4,
                          band: band, height: height)
            }
        }
    }

    private var values: [Double] { hrv.series.map(\.value) }

    /// "30 dní" without a usual range, with the resting heart rate on the wider sizes.
    private var note: String {
        var text = L10n.tr(status)
        if size != .small, let rhr = restingHR { text += " · " + L10n.f("tep %@", Fmt.int(rhr)) }
        return text
    }

    private var band: ClosedRange<Double>? {
        guard let low = hrv.low, let high = hrv.high, low < high else { return nil }
        return low...high
    }

    private var status: String {
        guard let v = hrv.value, let low = hrv.low, let high = hrv.high else { return "30 dní" }
        return v > high ? "nad normou" : v < low ? "pod normou" : "v normě"
    }
}

extension TodaySnapshot.HRV {
    /// Health's HRV in the shape the Today widget takes (its last 30 days;
    /// Health sends 90 for the detail chart).
    init(_ h: HealthSnapshot.HRV) {
        self.init(value: h.value, baseline: h.baseline, low: h.low, high: h.high, trend: h.trend, series: h.series.lastDays(30))
    }
}

extension Array where Element == Point {
    /// The points of the last `days` days up to the newest one.
    func lastDays(_ days: Int) -> [Point] {
        guard let newest = self.last?.date else { return self }
        let from = ISODay.shift(newest, -(days - 1))
        return filter { $0.date >= from }
    }
}

struct WeightWidget: View {
    let weight: TodaySnapshot.Weight
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Váha", color: Palette.brown)
            SizedWidgetBody(size: size, mediumChart: 64, smallShowsChart: size != .small || goal == nil) {
                NumberText(value: Fmt.decimal(Units.weight(weight.latest)), unit: Units.weightUnit)
                if size == .small, let goal {
                    // The goal as the band, half a kilo (a pound) either side.
                    TileRange(value: Units.weight(weight.latest), low: goal - 0.5, high: goal + 0.5,
                              text: L10n.f("cíl %@", Fmt.decimal(goal)))
                } else if let change {
                    Text(L10n.f("%@ %@ za 30 dní", change <= 0 ? "↓" : "↑", Units.weightText(abs(change))))
                        .font(Typo.caption).foregroundStyle(change <= 0 ? Palette.green : Palette.amber)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            } chart: { height in
                TrendDotsChart(raw: raw, trend: trend(raw), goal: goal,
                               lo: (all.min() ?? 70) - 0.4, hi: (all.max() ?? 90) + 0.4, height: height)
            }
        }
    }

    private var raw: [Double] { weight.series.map { Units.weight($0.value) } }
    private var goal: Double? { weight.goal.map { Units.weight($0) } }
    private var all: [Double] { raw + [goal].compactMap { $0 } }

    private var change: Double? {
        let t = trend(weight.series.map(\.value))
        guard let first = t.first, let last = t.last, t.count > 1 else { return nil }
        return last - first
    }

    /// Exponentially smoothed weight, the trend most weight apps show.
    private func trend(_ values: [Double]) -> [Double] {
        var out: [Double] = []
        for v in values { out.append(out.last.map { $0 + 0.25 * (v - $0) } ?? v) }
        return out
    }
}
