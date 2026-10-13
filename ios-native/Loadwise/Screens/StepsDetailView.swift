import Charts
import SwiftUI

/// Pohyb from Today: steps today through the day, the week and 30 days
/// against the goal, the active energy and the active minutes.
struct StepsDetailView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            if let today = model.today {
                StepsDetailContent(steps: today.steps, date: today.date)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task { if model.today == nil { await model.refresh() } }
    }
}

struct StepsDetailContent: View {
    let steps: TodaySnapshot.Steps
    let date: String
    @State private var period = Period.day

    enum Period: String, CaseIterable, Identifiable {
        case day, week, month
        var id: String { rawValue }
        var title: String {
            switch self {
            case .day: return "Dnes"
            case .week: return "Týden"
            case .month: return "30 dní"
            }
        }
    }

    private struct Bar: Identifiable {
        let id: String
        let label: String
        let value: Double
        let color: Color
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Pohyb").font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink).padding(.top, 24)
            Picker("Období", selection: $period) {
                ForEach(Period.allCases) { r in Text(LocalizedStringKey(r.title)).tag(r) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 20)

            switch period {
            case .day: day
            case .week: days(points(7))
            case .month: days(points(30))
            }

            if let active = steps.activeMinutes {
                SectionLabel(text: "Aktivní minuty")
                    .padding(.top, 30)
                Card {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: Fmt.int(active.today) + " min").font(Typo.number(30)).foregroundStyle(Palette.ink)
                            Text("dnes").font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(verbatim: Fmt.int(active.week) + " min").font(Typo.number(30)).foregroundStyle(Palette.ink)
                            Text(verbatim: L10n.f("tento týden z %@", Fmt.int(active.target ?? 150))).font(Typo.caption)
                                .foregroundStyle(active.week >= (active.target ?? 150) ? Palette.green : Palette.muted)
                        }
                    }
                }
                .padding(.top, 12)
            }
        }
    }

    // MARK: Today

    @ViewBuilder private var day: some View {
        let today = steps.today ?? 0
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            Text(verbatim: Fmt.int(today)).font(Typo.number(84)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(verbatim: L10n.f("kroků z %@", Fmt.int(steps.goal))).font(Typo.small).foregroundStyle(Palette.muted)
        }
        .padding(.top, 26)
        HStack(alignment: .top, spacing: 12) {
            if let kcal = steps.activeKcal { stat("Aktivní výdej", Fmt.int(kcal) + " kcal") }
            if let hour = steps.hour, let usual = steps.usual, usual.count == 24 {
                stat(L10n.f("Obvykle v %@ h", String(hour + 1)), Fmt.int(usual[hour]))
            }
            stat("Do cíle", today >= steps.goal ? L10n.tr("splněno") : Fmt.int(steps.goal - today))
        }
        .padding(.top, 18)

        if let hourly = steps.hourly, hourly.count == 24 {
            SectionLabel(text: "Během dne")
                .padding(.top, 30)
            Card { dayChart(hourly) }.padding(.top, 12)
        }
    }

    private func dayChart(_ hourly: [Double]) -> some View {
        let now = steps.hour ?? 23
        var running: Double = 0
        let total: [Double] = hourly.map { v in running += v; return running }
        let bars: [Bar] = (6...22).map { h in
            if h <= now {
                return Bar(id: String(h), label: String(h), value: total[h], color: h == now ? Palette.amberBar : Palette.sand)
            }
            let usual = steps.usual.map { $0[h] } ?? total[now]
            return Bar(id: String(h), label: String(h), value: Swift.max(total[now], usual), color: Palette.amberBar.opacity(0.22))
        }
        return chart(bars, labels: ["6", "10", "14", "18", "22"], height: 170)
    }

    // MARK: Week and 30 days

    private func points(_ n: Int) -> [TodaySnapshot.Point] {
        let list = n > 7 ? (steps.month ?? steps.week) : steps.week
        let from = ISODay.shift(date, -(n - 1))
        let byDate = Dictionary(list.map { ($0.date, $0.value) }, uniquingKeysWith: { first, _ in first })
        return ISODay.range(from, date).map { TodaySnapshot.Point(date: $0, value: byDate[$0] ?? 0) }
    }

    @ViewBuilder private func days(_ list: [TodaySnapshot.Point]) -> some View {
        let counted = list.filter { $0.value > 0 }
        let average = counted.isEmpty ? 0 : counted.map(\.value).reduce(0, +) / Double(counted.count)
        let met = list.filter { $0.value >= steps.goal }.count
        HStack(alignment: .lastTextBaseline, spacing: 28) {
            VStack(alignment: .leading, spacing: 2) {
                Text("průměr").font(Typo.caption).foregroundStyle(Palette.muted)
                Text(verbatim: Fmt.int(average)).font(Typo.number(48)).foregroundStyle(Palette.ink)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("cíl splněn").font(Typo.caption).foregroundStyle(Palette.muted)
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text(verbatim: String(met)).font(Typo.number(48)).foregroundStyle(Palette.ink)
                    Text(verbatim: L10n.f("z %@ dní", String(list.count))).font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
        }
        .padding(.top, 26)

        let bars: [Bar] = list.map { p in
            Bar(id: p.date, label: list.count > 7 ? p.date : Fmt.weekdayShort(p.date), value: p.value,
                color: p.date == date ? Palette.ink : p.value >= steps.goal ? Palette.amberBar : Palette.sand)
        }
        let labels: [String] = list.count > 7
            ? [list.first?.date, list.count > 14 ? list[list.count / 2].date : nil, list.last?.date].compactMap { $0 }
            : bars.map(\.label)
        Card {
            chart(bars, labels: labels, height: 190)
            HStack {
                legend(Palette.amberBar, "nad cílem")
                Spacer()
                Text(verbatim: "– – " + L10n.f("cíl %@", Fmt.int(steps.goal))).font(Typo.tiny).foregroundStyle(Palette.muted)
            }
        }
        .padding(.top, 20)

        if list.count > 7 {
            SectionLabel(text: "Po dnech v týdnu").padding(.top, 30)
            Card { chart(weekdays(list), labels: nil, height: 140) }.padding(.top, 12)
        }
    }

    /// The average steps of each weekday, Monday first.
    private func weekdays(_ list: [TodaySnapshot.Point]) -> [Bar] {
        let names = L10n.isEnglish ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
        return names.indices.map { i in
            let values = list.filter { $0.value > 0 && ISODay.weekdayIndex($0.date) == i }.map(\.value)
            let mean = values.isEmpty ? 0 : values.reduce(0, +) / Double(values.count)
            return Bar(id: names[i], label: names[i], value: mean, color: mean >= steps.goal ? Palette.amberBar : Palette.sand)
        }
    }

    // MARK: Pieces

    private func chart(_ bars: [Bar], labels: [String]?, height: CGFloat) -> some View {
        let top = Swift.max(bars.map(\.value).max() ?? 0, steps.goal) * 1.08
        let dayLabels = labels.map { Set($0) }
        return Chart {
            ForEach(bars) { b in
                BarMark(x: .value("Den", b.id), y: .value("Kroky", b.value), width: .ratio(0.7))
                    .foregroundStyle(b.color)
                    .cornerRadius(3)
            }
            RuleMark(y: .value("Cíl", steps.goal))
                .foregroundStyle(Palette.faint.opacity(0.7))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
        .chartYScale(domain: 0...top)
        .chartXAxis {
            AxisMarks { value in
                if let id = value.as(String.self), let label = bars.first(where: { $0.id == id })?.label,
                   dayLabels == nil || dayLabels?.contains(label) == true {
                    AxisValueLabel { Text(verbatim: Self.axisText(label)) }.foregroundStyle(Palette.faint)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Palette.hairline)
                AxisValueLabel().foregroundStyle(Palette.faint)
            }
        }
        .frame(height: height)
    }

    /// A date label becomes "12. 9."; hours and weekdays stay as they are.
    private static func axisText(_ label: String) -> String {
        label.count == 10 ? Fmt.dayMonth(label) : label
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            Text(verbatim: value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(LocalizedStringKey(text)).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
    }
}
