import SwiftUI

// Today's widgets. Every widget has the same build: a dot and a name, the main
// number, one line of context and a chart (see the design's widget gallery).

struct FoodWidget: View {
    let nutrition: TodaySnapshot.Nutrition

    var body: some View {
        Card {
            WidgetHeader(title: "Jídlo a pití", color: Palette.amberBar)
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
                macro("Voda", nutrition.water.ml.map { Units.imperial ? Units.volume($0) : $0 / 1000 }, Units.imperial ? Units.volumeUnit : "l", fraction(nutrition.water.ml, nutrition.water.target), Palette.blue, digits: Units.imperial ? 0 : 1)
            }
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
                Text(unit).font(Typo.tiny).foregroundStyle(Palette.faint)
            }
            ProgressLine(fraction: progress, color: color, height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanWidget: View {
    @Environment(AppModel.self) private var model
    let items: [TodaySnapshot.PlanItem]
    var today: String = ""

    var body: some View {
        Card {
            WidgetHeader(title: "Plán dne", color: Palette.ink)
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    row(item)
                    if index < items.count - 1 { Divider().overlay(Palette.hairline) }
                }
            }
        }
    }

    /// Bedtime opens Nastavení spánku, a gym session its workout mode, a ride
    /// or run the Training tab.
    @ViewBuilder
    private func row(_ item: TodaySnapshot.PlanItem) -> some View {
        if item.kind == "bedtime" {
            NavigationLink(value: AppRoute.sleepSettings) { line(item) }.buttonStyle(.plain)
        } else if item.kind == "workout", item.sport == "strength", !item.done {
            NavigationLink(value: AppRoute.trainingMode(today.isEmpty ? AppModel.localDate(Date()) : today)) { line(item) }.buttonStyle(.plain)
        } else if item.kind == "workout" {
            Button { model.tab = .training } label: { line(item) }.buttonStyle(.plain)
        } else {
            line(item)
        }
    }

    private func line(_ item: TodaySnapshot.PlanItem) -> some View {
        HStack(spacing: 14) {
            Text(item.time ?? "–").font(Typo.number(19))
                .foregroundStyle(item.done ? Palette.faint : Palette.ink)
                .frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(Typo.bodyStrong).foregroundStyle(item.done ? Palette.muted : Palette.ink)
                if let detail = item.detail {
                    Text(detail).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            trailing(item)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func trailing(_ item: TodaySnapshot.PlanItem) -> some View {
        if item.done {
            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                .accessibilityLabel("Hotovo")
        } else if item.kind == "workout" {
            Text(item.sport == "strength" ? "Začít" : "Detail").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                .padding(.horizontal, 14).frame(height: 30)
                .background(Palette.button, in: Capsule())
        } else if item.kind == "bedtime" {
            Image(systemName: "alarm").font(.footnote.weight(.semibold)).foregroundStyle(Palette.indigo)
                .accessibilityLabel("Nastavit budík a cíl spánku")
        }
    }
}

struct StepsWidget: View {
    let steps: TodaySnapshot.Steps
    /// The hours shown in the day chart.
    private let hours = Array(6...22)

    var body: some View {
        Card {
            WidgetHeader(title: "Pohyb", color: Palette.amberBar)
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Fmt.int(steps.today)).font(Typo.number(34)).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(L10n.f("kroků z %@", Fmt.int(steps.goal)) + percent).font(Typo.caption).foregroundStyle(Palette.amber)
                }
                .frame(width: 120, alignment: .leading)
                if let hourly = steps.hourly, hourly.count == 24 {
                    dayChart(hourly)
                } else {
                    weekChart
                }
            }
            Text(steps.hourly == nil ? "7 dní" : "kroky během dne")
                .font(Typo.tiny).foregroundStyle(Palette.faint)
        }
    }

    /// Running total through the day: past hours filled, the current hour
    /// highlighted, the rest of the day dashed at the usual level.
    private func dayChart(_ hourly: [Double]) -> some View {
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
                        spacing: 2.5,
                        height: 56)
    }

    private var weekChart: some View {
        BarChart(values: steps.week.map(\.value),
                 styles: steps.week.indices.map { i in
                     i == steps.week.count - 1 ? BarStyle(fill: Palette.amberBar)
                         : BarStyle(fill: steps.week[i].value >= steps.goal ? Palette.amberBar.opacity(0.75) : Palette.sand)
                 },
                 hi: max(steps.goal * 1.15, steps.week.map(\.value).max() ?? 0),
                 target: steps.goal,
                 labels: steps.week.map { Fmt.weekdayInitial($0.date) },
                 highlighted: steps.week.count - 1,
                 height: 56)
    }

    private var percent: String {
        guard let today = steps.today, steps.goal > 0 else { return "" }
        return " · " + Fmt.int(today / steps.goal * 100) + " %"
    }
}

struct RestingHRWidget: View {
    let restingHR: TodaySnapshot.RestingHR

    var body: some View {
        Card {
            WidgetHeader(title: "Klidový tep", color: Palette.rust)
            VStack(alignment: .leading, spacing: 4) {
                NumberText(value: Fmt.int(restingHR.value), unit: "bpm")
                if let note { Text(note.text).font(Typo.caption).foregroundStyle(note.good ? Palette.green : Palette.rust) }
            }
            let values = restingHR.series.map(\.value)
            LineChart(values: values, color: Palette.rust,
                      lo: (values.min() ?? 40) - 3, hi: (values.max() ?? 60) + 3,
                      band: restingHR.baseline.map { ($0 - 2)...($0 + 2) }, height: 40)
        }
    }

    private var note: (text: String, good: Bool)? {
        guard let value = restingHR.value, let base = restingHR.baseline else { return nil }
        let d = (value - base).rounded()
        if d == 0 { return (L10n.tr("v normě"), true) }
        return (L10n.f(d < 0 ? "↓ %@ pod normou" : "↑ %@ nad normou", Fmt.int(abs(d))), d < 0)
    }
}

struct HRVWidget: View {
    let hrv: TodaySnapshot.HRV

    var body: some View {
        Card {
            WidgetHeader(title: "Srdce · HRV", color: Palette.green)
            VStack(alignment: .leading, spacing: 4) {
                NumberText(value: Fmt.int(hrv.value), unit: "ms")
                Text(status).font(Typo.caption).foregroundStyle(Palette.green)
            }
            let values = hrv.series.map(\.value)
            LineChart(values: values, color: Palette.green,
                      lo: min(values.min() ?? 40, hrv.low ?? 40) - 4, hi: max(values.max() ?? 70, hrv.high ?? 70) + 4,
                      band: band, height: 40)
        }
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

struct WeightWidget: View {
    let weight: TodaySnapshot.Weight

    var body: some View {
        Card {
            WidgetHeader(title: "Váha", color: Palette.brown)
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    NumberText(value: Fmt.decimal(Units.weight(weight.latest)), unit: Units.weightUnit)
                    if let change {
                        Text(L10n.f("%@ %@ za 30 dní", change <= 0 ? "↓" : "↑", Units.weightText(abs(change))))
                            .font(Typo.caption).foregroundStyle(change <= 0 ? Palette.green : Palette.amber)
                    }
                }
                .frame(width: 120, alignment: .leading)
                let raw = weight.series.map { Units.weight($0.value) }
                let goal = weight.goal.map { Units.weight($0) }
                let all = raw + [goal].compactMap { $0 }
                TrendDotsChart(raw: raw, trend: trend(raw), goal: goal,
                               lo: (all.min() ?? 70) - 0.4, hi: (all.max() ?? 90) + 0.4, height: 64)
            }
            Text("30 dní · body = vážení, čára = trend").font(Typo.tiny).foregroundStyle(Palette.faint)
        }
    }

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
