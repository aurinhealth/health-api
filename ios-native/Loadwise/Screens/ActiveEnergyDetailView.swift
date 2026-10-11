import SwiftUI

/// Active energy: the drill-down from the widget on Training. The last 28
/// days as bars against their average, then day by day, the newest first,
/// the active kcal and the day's activities from the training calendar.
struct ActiveEnergyDetailView: View {
    @Environment(AppModel.self) private var model
    let training: TrainingSnapshot

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            if let active = training.activeCalories {
                ActiveEnergyContent(active: active, today: training.date, calendar: model.calendar)
            } else {
                Text("Aktivní výdej zatím není k dispozici. Bere se z Google Health.")
                    .font(Typo.body).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 60)
            }
        }
        .task { await model.loadCalendar(from: ISODay.shift(training.date, -27), to: training.date) }
    }
}

struct ActiveEnergyContent: View {
    let active: TrainingSnapshot.ActiveCalories
    let today: String
    /// The training calendar's days by date (AppModel.calendar).
    let calendar: [String: CalendarDay]

    /// The 28 days, the oldest first.
    private var dates: [String] { ISODay.range(ISODay.shift(today, -27), today) }

    private var points: [TodaySnapshot.Point] { active.days ?? active.week }

    /// The average of the finished days: today is still running.
    private var average: Double? {
        let values = points.filter { $0.date < today }.map(\.value)
        return values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    var body: some View {
        let byDate = Dictionary(points.map { ($0.date, $0.value) }, uniquingKeysWith: { first, _ in first })
        let all = dates
        let series = all.map { byDate[$0] ?? 0 }
        let mean = average
        VStack(alignment: .leading, spacing: 0) {
            Text("Aktivní výdej dnes").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 36)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(verbatim: Fmt.int(active.today)).font(Typo.number(96)).foregroundStyle(Palette.ink)
                Text(verbatim: "kcal").font(Typo.small).foregroundStyle(Palette.muted)
            }
            if let mean {
                Pill(text: L10n.f("průměr %@ kcal za den", Fmt.int(mean)), foreground: Palette.rust, background: Palette.rust.opacity(0.14))
            }

            Card {
                WidgetHeader(title: "Posledních 28 dní", color: Palette.rust, trailing: L10n.f("celkem %@ kcal", Fmt.int(series.reduce(0, +))))
                BarChart(values: series,
                         styles: all.map { BarStyle(fill: $0 == today ? Palette.rust : Palette.rust.opacity(0.35)) },
                         hi: Swift.max(series.max() ?? 0, mean ?? 0, 1),
                         target: mean,
                         labels: all.map { ISODay.weekdayIndex($0) == 0 ? Self.dayNumber($0) : "" },
                         highlighted: all.count - 1,
                         spacing: 2,
                         height: 140)
                Text("Čárkovaně průměr za den, pod sloupci pondělky.").font(Typo.caption).foregroundStyle(Palette.faint)
            }
            .padding(.top, 20)

            SectionLabel(text: "Po dnech").padding(.top, 30)
            Card(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(all.reversed().enumerated()), id: \.element) { index, date in
                        if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                        ActiveEnergyDayRow(date: date, today: today, kcal: byDate[date], day: calendar[date])
                    }
                }
            }
            .padding(.top, 10)

            Text("Aktivní výdej je energie nad klidovým metabolismem za celý den, včetně běžného pohybu (Google Health). Kalorie u aktivit pochází z hodinek nebo Intervals.icu a často zahrnují i klidovou energii, proto se s aktivním výdejem dne nemusí sečíst.")
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
        }
    }

    /// "5" for 2026-10-05: the day of the month under a Monday.
    static func dayNumber(_ iso: String) -> String {
        Int(iso.suffix(2)).map { String($0) } ?? ""
    }
}

/// One day: its active kcal and the activities done that day.
struct ActiveEnergyDayRow: View {
    let date: String
    let today: String
    let kcal: Double?
    let day: CalendarDay?

    var body: some View {
        let done = (day?.activities ?? []).filter { $0.status == "done" }
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: heading).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                if let kcal {
                    Text(verbatim: L10n.f("%@ kcal aktivně", Fmt.int(kcal))).font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                } else {
                    Text("bez dat").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            .padding(.vertical, 12)
            ForEach(done) { activity in
                if let route = CalendarDayList.route(activity) {
                    NavigationLink(value: route) { CalendarActivityRow(activity: activity, chevron: true) }.buttonStyle(.plain)
                } else {
                    CalendarActivityRow(activity: activity, chevron: false)
                }
            }
            if day != nil && done.isEmpty {
                Text("Bez zaznamenané aktivity, jen běžný pohyb.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .padding(.bottom, 12)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, done.isEmpty ? 0 : 4)
    }

    private var heading: String {
        if date == today { return L10n.tr("Dnes") }
        if date == ISODay.shift(today, -1) { return L10n.tr("Včera") }
        return Fmt.weekdayShort(date) + " " + Fmt.dayMonth(date)
    }
}
