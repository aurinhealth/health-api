import SwiftUI

// Today's widgets. Every widget has the same build: a dot and a name, the main
// number, one line of context and a chart (see the design's widget gallery).

struct FoodWidget: View {
    let nutrition: TodaySnapshot.Nutrition
    var size: WidgetSize = .medium

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
            macro("Voda", nutrition.water.ml.map { Units.imperial ? Units.volume($0) : $0 / 1000 }, Units.imperial ? Units.volumeUnit : "l", fraction(nutrition.water.ml, nutrition.water.target), Palette.blue, digits: Units.imperial ? 0 : 1)
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

/// Plán dne's long-press menu: "Smazat aktivitu" with the same questions as
/// the activity's detail, or "Smazat" for a stretching or sauna.
private struct PlanRowMenu: ViewModifier {
    @Environment(AppModel.self) private var model
    let item: TodaySnapshot.PlanItem
    @State private var deleting = false
    @State private var editingKcal = false

    func body(content: Content) -> some View {
        if model.demo {
            content
        } else if item.kind == "workout", item.done, let session = item.session, session.kind == "activity" {
            content
                .contextMenu {
                    Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                }
                .activityEditing(id: session.id, title: session.title, kcal: session.kcal,
                                 edited: session.kcalEdited == true, deleting: $deleting, editingKcal: $editingKcal)
        } else if item.kind == "recovery", let id = item.recoveryId {
            content.contextMenu {
                Button(role: .destructive) {
                    Task {
                        try? await model.api.deleteRecovery(id: id)
                        await model.refresh()
                    }
                } label: { Label("Smazat", systemImage: "trash") }
            }
        } else {
            content
        }
    }
}

struct PlanWidget: View {
    @Environment(AppModel.self) private var model
    let items: [TodaySnapshot.PlanItem]
    var today: String = ""
    /// A pill or "vrátit" being saved.
    @State private var busy = false

    init(items: [TodaySnapshot.PlanItem], today: String = "") {
        self.items = items
        self.today = today
    }

    private func act(_ work: @escaping () async throws -> Void) {
        busy = true
        Task {
            try? await work()
            busy = false
        }
    }

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
    /// or run its detail (done) or the planned workout.
    /// A long press deletes a done activity (as its detail's ⋯) or a saved
    /// stretching or sauna.
    private func row(_ item: TodaySnapshot.PlanItem) -> some View {
        rowContent(item).modifier(PlanRowMenu(item: item))
    }

    @ViewBuilder
    private func rowContent(_ item: TodaySnapshot.PlanItem) -> some View {
        if item.kind == "pill" || item.eased != nil {
            // The pill (Vzato) and a session the cycle eased (vrátit) act in the row.
            line(item)
        } else if item.kind == "bedtime" {
            NavigationLink(value: AppRoute.sleepSettings) { line(item) }.buttonStyle(.plain)
        } else if item.kind == "workout", item.sport == "strength", !item.done, item.status != "missed" {
            NavigationLink(value: AppRoute.trainingMode(today.isEmpty ? AppModel.localDate(Date()) : today)) { line(item) }.buttonStyle(.plain)
        } else if item.kind == "workout", let session = item.session, let route = WeekSessionsList.destination(session) {
            NavigationLink(value: route) { line(item) }.buttonStyle(.plain)
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
            // The kind's icon, with the clock under it (a planned session has
            // none: it comes after the last record).
            VStack(spacing: 3) {
                PlanItemIcon(item: item)
                if let time = item.time {
                    Text(ClockText.format(time)).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.faint)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .frame(width: 46)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(Typo.bodyStrong).foregroundStyle(item.done ? Palette.muted : Palette.ink)
                if let eased = item.eased {
                    Text(eased.title).font(Typo.caption).foregroundStyle(Palette.muted).strikethrough()
                } else if let detail = item.detail {
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
        if item.kind == "pill" {
            PillButton(taken: item.done ? (item.time ?? "taken") : nil, saving: busy) { act { try await model.takePill(on: today.isEmpty ? nil : today) } }
        } else if item.eased != nil {
            Button { act { try await model.logCycleDay(today.isEmpty ? AppModel.localDate(Date()) : today, ["keepPlan": .bool(true)]) } } label: {
                Label("vrátit", systemImage: "arrow.uturn.backward")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.pink)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Palette.pinkSoft, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        } else if item.done, let session = item.session, let kcal = session.countedKcal {
            // A done session with its calories; the device's number waits for a check.
            VStack(alignment: .trailing, spacing: 1) {
                NumberText(value: Fmt.int(kcal), unit: "kcal", size: 19)
                if session.kcalNeedsCheck {
                    Label("k ověření", systemImage: "exclamationmark.triangle")
                        .font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.amber)
                        .labelStyle(TitleAndOptionalIcon(hasIcon: true))
                }
            }
            .accessibilityElement(children: .combine)
        } else if item.done {
            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                .accessibilityLabel("Hotovo")
        } else if item.status == "missed" {
            Text("Nesplněno").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.rust)
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

/// Plán dne's icon: the sport, stretching, sauna, the pill or bedtime; a
/// missed session in rust.
private struct PlanItemIcon: View {
    let item: TodaySnapshot.PlanItem

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: 38, height: 38)
            .background(color.opacity(0.16), in: Circle())
            .opacity(item.done ? 0.7 : 1)
            .accessibilityHidden(true)
    }

    private var symbol: String {
        switch item.kind {
        case "workout": return item.status == "missed" ? "xmark" : SportIcon.symbol(item.sport ?? "")
        case "recovery": return item.recovery == "sauna" ? "flame.fill" : "figure.flexibility"
        case "bedtime": return "bed.double.fill"
        case "pill": return "pills.fill"
        default: return "circle"
        }
    }

    private var color: Color {
        if item.status == "missed" { return Palette.rust }
        switch item.kind {
        case "workout":
            switch item.sport {
            case "ride": return Palette.green
            case "run": return Palette.amber
            case "strength": return Palette.blue
            default: return Palette.muted
            }
        case "recovery": return item.recovery == "sauna" ? Palette.amber : Palette.green
        case "bedtime": return Palette.indigo
        case "pill": return Palette.pink
        default: return Palette.muted
        }
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
                        height: height)
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
                 height: height)
    }

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
            SizedWidgetBody(size: size) {
                NumberText(value: Fmt.int(restingHR.value), unit: "bpm")
                if let note { Text(note.text).font(Typo.caption).foregroundStyle(note.good ? Palette.green : Palette.rust) }
            } chart: { height in
                LineChart(values: values, color: Palette.rust,
                          lo: (values.min() ?? 40) - 3, hi: (values.max() ?? 60) + 3,
                          band: restingHR.baseline.map { ($0 - 2)...($0 + 2) }, height: height)
            }
        }
    }

    private var values: [Double] { restingHR.series.map(\.value) }

    private var note: (text: String, good: Bool)? {
        guard let value = restingHR.value, let base = restingHR.baseline else { return nil }
        let d = (value - base).rounded()
        if d == 0 { return (L10n.tr("v normě"), true) }
        return (L10n.f(d < 0 ? "↓ %@ pod normou" : "↑ %@ nad normou", Fmt.int(abs(d))), d < 0)
    }
}

struct HRVWidget: View {
    let hrv: TodaySnapshot.HRV
    var restingHR: Double? = nil
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Srdce · HRV", color: Palette.green)
            SizedWidgetBody(size: size) {
                NumberText(value: Fmt.int(hrv.value ?? hrv.series.last?.value), unit: "ms")
                Text(note).font(Typo.caption).foregroundStyle(Palette.green).lineLimit(1)
            } chart: { height in
                LineChart(values: values, color: Palette.green,
                          lo: min(values.min() ?? 40, hrv.low ?? 40) - 4, hi: max(values.max() ?? 70, hrv.high ?? 70) + 4,
                          band: band, height: height)
            }
        }
    }

    private var values: [Double] { hrv.series.map(\.value) }

    /// "v normě", with the resting heart rate on the wider sizes.
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
            SizedWidgetBody(size: size, mediumChart: 64) {
                NumberText(value: Fmt.decimal(Units.weight(weight.latest)), unit: Units.weightUnit)
                if let change {
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
