import SwiftUI

struct TrainingView: View {
    @Environment(AppModel.self) private var model
    @State private var addingWorkout = false
    /// A moved or cancelled session with its undo (Tréninky týdne).
    @State private var toast: PlanToast?
    /// The day chosen in the calendar, shown in the pinned bar.
    @State private var calendarDay: String?
    /// A day set from the pinned bar, for the calendar.
    @State private var jumpDay: DayJump?

    var body: some View {
        NavigationStack(path: model.path(.training)) {
            ZStack {
                ScreenBackground(glow: Palette.Glow.training)
                if let training = model.training {
                    PageScroll {
                        TrainingContent(training: training, addWorkout: { addingWorkout = true }, toast: $toast, pickDay: { calendarDay = $0 }, jumpDay: jumpDay)
                            .padding(.bottom, 100)
                    }
                    .refreshable { await model.refreshTraining() }
                    .tabTopBar {
                        let day = calendarDay ?? training.date
                        DayCapsule(date: day, today: training.date,
                                   canGoForward: day < ISODay.shift(training.date, TrainingCalendarCard.daysAhead),
                                   move: { jumpDay = DayJump(date: ISODay.shift(day, $0)) },
                                   showToday: { jumpDay = DayJump(date: training.date) })
                        Spacer(minLength: 0)
                        ChromeButton(systemImage: "plus", label: "Zapsat trénink") { addingWorkout = true }
                    }
                } else if let message = model.trainingError {
                    VStack(spacing: 16) {
                        Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                        Button("Zkusit znovu") { Task { await model.refreshTraining() } }.font(Typo.bodyStrong)
                    }
                    .padding(32)
                } else {
                    ProgressView()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .appRoutes()
        }
        .overlay(alignment: .bottom) {
            if let toast {
                PlanToastView(toast: toast) { undo(toast) }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: toast?.id)
        .task(id: toast?.id) {
            guard let current = toast else { return }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if toast?.id == current.id { toast = nil }
            // Also when the screen went away or another toast came: a cancel still reaches the server.
            if let commit = current.settle(undo: false) { Task { await commit() } }
        }
        .task { await model.refreshIfStale(.training) }
        .sheet(isPresented: $addingWorkout) { ManualWorkoutSheet() }
    }

    private func undo(_ t: PlanToast) {
        toast = nil
        if let work = t.settle(undo: true) { Task { await work() } }
    }
}

/// The Training screen without the scroll view, so tests can render it whole.
struct TrainingContent: View {
    @Environment(AppModel.self) private var model
    let training: TrainingSnapshot
    var addWorkout: () -> Void = {}
    var toast: Binding<PlanToast?> = .constant(nil)
    var pickDay: (String) -> Void = { _ in }
    var jumpDay: DayJump? = nil
    @State private var editing = false
    @State private var focusSheet = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                HStack {
                    SectionLabel(text: L10n.f("Trénink · týden %@", String(training.week)))
                    Spacer()
                    CircleButton(systemImage: "plus", label: L10n.tr("Zapsat trénink"), action: addWorkout)
                }

                // Until the main sport and goal are set (FocusSheet.swift).
                if training.profileIncomplete == true {
                    FocusPromptCard { focusSheet = true }
                        .padding(.top, 18)
                }

                TrainingCalendarCard(today: training.date, onPick: pickDay, jump: jumpDay)
                    .padding(.top, 18)

                StrainHero(training: training)
                    .padding(.top, 26)
                CoachTextCard(screen: "training").padding(.top, 18)

                WeekStrainBars(days: training.days)
                    .padding(.top, 22)

                if let next = training.next {
                    NextSession(session: next, today: training.date)
                        .padding(.top, 20)
                }

                MuscleCard()
                    .padding(.top, 20)

                if let event = training.event {
                    EventCard(event: event)
                        .padding(.top, 28)
                }

                TrainingTools(today: training.date, addWorkout: addWorkout)
                    .padding(.top, 28)
            }

            WidgetBoard(panel: .training,
                        data: WidgetData(panel: .training, today: model.today, health: model.health, training: training, food: model.food, planToast: toast),
                        editing: $editing)
                .padding(.top, editing ? 0 : 28)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .sheet(isPresented: $focusSheet) { FocusSheet { Task { await model.refreshTraining() } } }
    }
}

// MARK: - Strain

struct StrainHero: View {
    let training: TrainingSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Námaha dnes").font(Typo.body).foregroundStyle(Palette.muted)
            HStack(alignment: .lastTextBaseline, spacing: 14) {
                Text(Fmt.decimal(training.strain.score ?? 0))
                    .font(Typo.number(104)).lineLimit(1).minimumScaleFactor(0.5)
                    .foregroundStyle(Palette.ink)
                if let target = training.strain.target {
                    Pill(text: L10n.f("cíl ~%@", Fmt.decimal(target)), foreground: Palette.amber, background: Palette.amberSoft)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Monday to Sunday: done days filled, today's progress to its target, the
/// days ahead dashed at the planned strain.
struct WeekStrainBars: View {
    let days: [TrainingSnapshot.Day]
    private let barHeight: CGFloat = 60

    var body: some View {
        let top = max(14, days.map { max($0.strain ?? 0, $0.planned ?? 0) }.max() ?? 14)
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(days) { day in
                    VStack(spacing: 6) {
                        Text(value(day)).font(Typo.number(15))
                            .foregroundStyle(day.today ? Palette.ink : isAhead(day) ? Palette.faint : Palette.muted)
                            .lineLimit(1).fixedSize()
                        bar(day, top: top)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            HStack(spacing: 10) {
                ForEach(days) { day in
                    Text(Fmt.weekdayShort(day.date))
                        .font(.system(size: 12, weight: day.today ? .semibold : .regular))
                        .foregroundStyle(day.today ? Palette.ink : Palette.faint)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Námaha po dnech tohoto týdne")
        .accessibilityValue(days.map { Fmt.weekdayShort($0.date) + " " + value($0) }.joined(separator: ", "))
    }

    private func isAhead(_ day: TrainingSnapshot.Day) -> Bool { day.strain == nil && !day.today }

    private func value(_ day: TrainingSnapshot.Day) -> String {
        if let s = day.strain, s > 0 { return Fmt.decimal(s) }
        if let p = day.planned { return Fmt.decimal(p, digits: 0) }
        return "–"
    }

    @ViewBuilder
    private func bar(_ day: TrainingSnapshot.Day, top: Double) -> some View {
        let h = { (v: Double) in max(3, barHeight * CGFloat(min(v / top, 1))) }
        if day.today, let planned = day.planned, planned > (day.strain ?? 0) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 4).fill(Palette.amberBar.opacity(0.22)).frame(height: h(planned))
                RoundedRectangle(cornerRadius: 4).fill(Palette.amberBar).frame(height: h(day.strain ?? 0))
            }
            .frame(height: barHeight, alignment: .bottom)
        } else if let s = day.strain, s > 0 {
            RoundedRectangle(cornerRadius: 4).fill(day.today ? Palette.amberBar : Palette.amberBar.opacity(0.7))
                .frame(height: h(s)).frame(height: barHeight, alignment: .bottom)
        } else if let p = day.planned {
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(Palette.amberBar.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                .frame(height: h(p)).frame(height: barHeight, alignment: .bottom)
        } else {
            RoundedRectangle(cornerRadius: 2).fill(Palette.track).frame(height: 3).frame(height: barHeight, alignment: .bottom)
        }
    }
}

// MARK: - Next session

struct NextSession: View {
    let session: TrainingSnapshot.Session
    let today: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(Palette.hairline).frame(height: 1).padding(.bottom, 6)
            HStack(alignment: .firstTextBaseline) {
                Text(when).font(Typo.number(20)).foregroundStyle(Palette.ink)
                Spacer()
                Text(meta).font(Typo.small).foregroundStyle(Palette.muted)
            }
            Text(session.title)
                .font(Typo.sentence(30, relativeTo: .title))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail).font(Typo.body).foregroundStyle(Palette.muted).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let advice = session.advice {
                Text(advice).font(Typo.small).foregroundStyle(Palette.green)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if session.sport == "strength" && session.date == today {
                NavigationLink(value: AppRoute.trainingMode(session.date)) {
                    Text("Začít trénink").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
    }

    private var when: String {
        let day = Fmt.capitalized(Fmt.relativeDay(session.date, today: today))
        guard let time = ClockText.format(optional: session.time) else { return day }
        return session.date == today ? time : day + " " + time
    }

    private var meta: String {
        [session.minutes.map { Fmt.duration($0) }, session.strain.map { L10n.f("+%@ námahy", Fmt.decimal($0)) }]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private var detail: String? {
        if !session.exercises.isEmpty {
            let shown = session.exercises.prefix(3).joined(separator: " · ")
            let rest = session.exercises.count - 3
            return rest > 0 ? shown + " · " + L10n.f("a %@ %@", String(rest), Fmt.plural(rest, "další", "další", "dalších")) : shown
        }
        return session.description
    }
}

// MARK: - Event

struct EventCard: View {
    let event: TrainingSnapshot.Event

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: L10n.tr("Závod") + (event.date.map { " · " + Fmt.dayMonth($0) } ?? ""))
                Spacer()
            }
            HStack(alignment: .lastTextBaseline) {
                Text(event.name ?? "Hlavní závod")
                    .font(Typo.sentence(26, relativeTo: .title2))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 12)
                if let left = event.daysLeft {
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text(String(left)).font(Typo.number(44)).foregroundStyle(Palette.ink)
                        Text(Fmt.plural(left, "den", "dny", "dní")).font(Typo.small).foregroundStyle(Palette.faint)
                    }
                    .fixedSize()
                }
            }
            if !event.phases.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    ForEach(event.phases) { phase in
                        VStack(alignment: .leading, spacing: 6) {
                            Capsule()
                                .fill(phase.state == "next" ? Palette.track : phase.state == "now" ? Palette.amberBar : Palette.amberBar.opacity(0.45))
                                .frame(height: 5)
                            Text(phase.label).font(Typo.caption.weight(phase.state == "now" ? .semibold : .regular))
                                .foregroundStyle(phase.state == "next" ? Palette.faint : Palette.ink)
                            Text(caption(phase)).font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.top, 4)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func caption(_ phase: TrainingSnapshot.Phase) -> String {
        switch phase.state {
        case "done": return L10n.tr("hotovo")
        case "now": return phase.week.map { w in L10n.f("teď · týden %@/%@", String(w), String(phase.weeks ?? w)) } ?? L10n.tr("teď")
        default: return phase.from.map { L10n.f("od %@", Fmt.dayMonth($0)) } ?? ""
        }
    }
}

// MARK: - Widgets

struct FormWidget: View {
    let form: TrainingSnapshot.Form
    /// "Poměr zátěže 1,42 · jednotvárný týden", only when out of normal.
    var loadNote: String? = nil
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Forma", color: Palette.amberBar)
            SizedWidgetBody(size: size) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(Fmt.signed(form.form)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                Text(form.label).font(Typo.caption).foregroundStyle(zoneColor(form.zone)).lineLimit(1)
            } chart: { height in
                FormLines(series: Array(form.series.suffix(size == .large ? 90 : 42)), height: height)
            }
            if let loadNote {
                Text(verbatim: loadNote).font(Typo.caption).foregroundStyle(Palette.amber)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otevře detail formy a kondice")
    }
}

extension FormWidget {
    /// The acute:chronic load ratio when raised ("elevated", "high") and a
    /// monotonous week, in one line; nil when both are normal (a low ratio
    /// says nothing worth a line).
    static func loadNote(acwr: TrainingSnapshot.ACWR?, monotony: TrainingSnapshot.Monotony?) -> String? {
        var parts: [String] = []
        if let acwr, let value = acwr.value, acwr.zone == "elevated" || acwr.zone == "high" {
            parts.append(L10n.f("Poměr zátěže %@", Fmt.decimal(value, digits: 2)))
        }
        if monotony?.high == true {
            parts.append(L10n.tr(parts.isEmpty ? "Jednotvárný týden" : "jednotvárný týden"))
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

func zoneColor(_ zone: String) -> Color {
    switch zone {
    case "optimal", "fresh": return Palette.green
    case "risk": return Palette.rust
    default: return Palette.amber
    }
}

/// Fitness (green) and fatigue (amber) over time.
struct FormLines: View {
    let series: [TrainingSnapshot.FormPoint]
    var height: CGFloat = 40

    var body: some View {
        let values = series.flatMap { [$0.fitness, $0.fatigue] }
        let lo = (values.min() ?? 0) - 2, hi = (values.max() ?? 1) + 2
        ZStack {
            LineChart(values: series.map(\.fatigue), color: Palette.amberBar, lo: lo, hi: hi, lineWidth: 1.6, height: height)
            LineChart(values: series.map(\.fitness), color: Palette.green, lo: lo, hi: hi, height: height)
        }
        .frame(height: height)
    }
}

struct VO2maxWidget: View {
    let vo2: TrainingSnapshot.VO2max
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "VO2max", color: Palette.green)
            SizedWidgetBody(size: size) {
                NumberText(value: Fmt.decimal(vo2.value, digits: vo2.value.rounded() == vo2.value ? 0 : 1), unit: size == .small ? nil : "ml/kg/min")
                if let change = vo2.change, change != 0 {
                    Text((change > 0 ? "↑ " : "↓ ") + L10n.f("%@ za 4 týdny", Fmt.decimal(abs(change))))
                        .font(Typo.caption).foregroundStyle(change > 0 ? Palette.green : Palette.rust)
                } else {
                    Text("půl roku").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            } chart: { height in
                LineChart(values: values, color: Palette.green, lo: (values.min() ?? 40) - 1, hi: (values.max() ?? 50) + 1, fill: true, height: height)
            }
        }
    }

    private var values: [Double] { vo2.series.map(\.value) }
}

struct ThisWeekWidget: View {
    let week: TrainingSnapshot.ThisWeek
    let loads: [TrainingSnapshot.WeekLoad]
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Tento týden", color: Palette.ink, trailing: size != .small && week.plannedLoad > 0 ? L10n.f("%@ z %@ TSS", Fmt.int(week.doneLoad), Fmt.int(week.plannedLoad)) : nil)
            SizedWidgetBody(size: size, mediumChart: 52) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(week.done)").font(Typo.number(34)).foregroundStyle(Palette.ink)
                    Text(L10n.f("z %@", String(week.planned))).font(Typo.number(17)).foregroundStyle(Palette.faint)
                }
                Text(L10n.f("%@ hotovo", Fmt.plural(week.planned, "tréninku", "tréninků", "tréninků")))
                    .font(Typo.caption).foregroundStyle(Palette.amber).lineLimit(1)
            } chart: { height in
                if loads.count > 1 {
                    BarChart(values: values,
                             styles: loads.indices.map { i in
                                 i == loads.count - 1 ? BarStyle(fill: Palette.amberBar, dashed: (loads[i].planned ?? 0) > loads[i].load) : BarStyle(fill: Palette.sand)
                             },
                             hi: max(values.max() ?? 1, 1),
                             labels: loads.map { String($0.week) },
                             highlighted: loads.count - 1,
                             height: height)
                }
            }
        }
    }

    private var values: [Double] { loads.map { max($0.load, $0.planned ?? 0) } }
}

struct ActiveCaloriesWidget: View {
    let active: TrainingSnapshot.ActiveCalories
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Aktivní výdej", color: Palette.rust)
            SizedWidgetBody(size: size, mediumChart: 52) {
                NumberText(value: Fmt.int(active.today), unit: "kcal")
                if let excluded = active.excluded, excluded > 0 {
                    Text(L10n.f("bez %@ navíc z hodinek", Fmt.int(excluded))).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                if let usual = active.usual {
                    Text(L10n.f("obvykle %@ kcal", Fmt.int(usual))).font(Typo.caption).foregroundStyle(Palette.faint).lineLimit(1)
                }
            } chart: { height in
                BarChart(values: active.week.map(\.value),
                         styles: active.week.indices.map { i in BarStyle(fill: i == active.week.count - 1 ? Palette.rust : Palette.rust.opacity(0.3)) },
                         hi: max(active.week.map(\.value).max() ?? 1, active.usual ?? 0),
                         target: active.usual,
                         labels: active.week.map { Fmt.weekdayInitial($0.date) },
                         highlighted: active.week.count - 1,
                         spacing: size == .small ? 3 : 4,
                         height: height)
            }
        }
    }
}

/// Active minutes in the heart-rate zones this week (moderate, vigorous and
/// peak) against WHO's 150 minutes a week, the last 4 weeks as stacked bars.
/// Light activity (moving through the day) only as a side note.
struct ZonesWidget: View {
    let zones: TrainingSnapshot.Zones
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            if size == .small, let week = zones.weeks?.last {
                WidgetHeader(title: "Aktivní minuty", color: Palette.rust)
                VStack(alignment: .leading, spacing: 4) {
                    NumberText(value: Fmt.int(week.counted), unit: L10n.f("z %@", "150 min"))
                    Text(ZoneStyle.status(week)).font(Typo.caption).foregroundStyle(ZoneStyle.statusColor(week)).lineLimit(1)
                }
                ProgressLine(fraction: week.counted / TrainingSnapshot.ZoneWeek.whoTarget, color: Palette.rust)
            } else if let weeks = zones.weeks, let week = weeks.last {
                WidgetHeader(title: "Aktivní minuty v zónách", color: Palette.rust, trailing: L10n.tr("tento týden"))
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        NumberText(value: Fmt.int(week.counted), unit: L10n.f("z %@", "150 min"))
                        Text(ZoneStyle.status(week)).font(Typo.caption).foregroundStyle(ZoneStyle.statusColor(week))
                    }
                    .frame(width: 120, alignment: .leading)
                    ZoneWeekBars(weeks: weeks, height: 52)
                }
                ZoneLegend(week: week)
                Text(L10n.f("doporučení WHO 150 min týdně · lehká aktivita %@", Fmt.hoursMinutesLong(week.light)))
                    .font(Typo.tiny).foregroundStyle(Palette.faint)
            } else {
                // An answer from before the weeks were sent.
                WidgetHeader(title: "Čas v tepových zónách", color: Palette.rust, trailing: L10n.tr("4 týdny") + " · " + Fmt.hoursMinutesLong(zones.minutes))
                ZoneBar(parts: parts)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var parts: [(String, Double, Color)] {
        [("Lehká", zones.light, ZoneStyle.light), ("Střední", zones.moderate, ZoneStyle.moderate),
         ("Intenzivní", zones.vigorous, ZoneStyle.vigorous), ("Maximální", zones.peak, ZoneStyle.peak)]
    }
}

/// The colours of the heart-rate zones and the week's state against WHO.
enum ZoneStyle {
    static let light = Palette.sand
    static let moderate = Palette.amberBar.opacity(0.55)
    static let vigorous = Palette.amberBar
    static let peak = Palette.rust

    /// "splněno" or "chybí 45 min".
    static func status(_ week: TrainingSnapshot.ZoneWeek) -> String {
        let left = TrainingSnapshot.ZoneWeek.whoTarget - week.counted
        return left <= 0 ? L10n.tr("doporučení splněno") : L10n.f("chybí %@ min", Fmt.int(left))
    }

    static func statusColor(_ week: TrainingSnapshot.ZoneWeek) -> Color {
        week.counted >= TrainingSnapshot.ZoneWeek.whoTarget ? Palette.green : Palette.amber
    }
}

/// The weeks' active minutes as stacked bars: moderate, then vigorous and peak
/// twice (as WHO counts them). The current week is the last one, highlighted;
/// the 150-minute recommendation is the dashed line.
struct ZoneWeekBars: View {
    let weeks: [TrainingSnapshot.ZoneWeek]
    var height: CGFloat = 52
    var spacing: CGFloat = 8

    var body: some View {
        let target = TrainingSnapshot.ZoneWeek.whoTarget
        let top = Swift.max(weeks.map(\.counted).max() ?? 0, target) * 1.1
        VStack(spacing: 4) {
            GeometryReader { geo in
                let h = geo.size.height
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: spacing) {
                        ForEach(weeks.indices, id: \.self) { i in
                            bar(weeks[i], height: h, top: top)
                                .opacity(i == weeks.count - 1 ? 1 : 0.5)
                        }
                    }
                    DashedLine()
                        .stroke(Palette.green, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(height: 1)
                        .offset(y: -h * scaled(target, 0, top))
                }
                .frame(width: geo.size.width, height: h, alignment: .bottomLeading)
            }
            .frame(height: height)
            HStack(spacing: spacing) {
                ForEach(weeks.indices, id: \.self) { i in
                    Text(verbatim: Self.label(weeks[i]))
                        .font(.system(size: 9, weight: i == weeks.count - 1 ? .semibold : .regular))
                        .foregroundStyle(i == weeks.count - 1 ? Palette.ink : Palette.faint)
                        .lineLimit(1)
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func bar(_ week: TrainingSnapshot.ZoneWeek, height h: CGFloat, top: Double) -> some View {
        if week.counted <= 0 {
            RoundedRectangle(cornerRadius: 2.5).fill(Palette.track).frame(height: 2.5).frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 0) {
                Rectangle().fill(ZoneStyle.peak).frame(height: h * scaled(2 * week.peak, 0, top))
                Rectangle().fill(ZoneStyle.vigorous).frame(height: h * scaled(2 * week.vigorous, 0, top))
                Rectangle().fill(ZoneStyle.moderate).frame(height: h * scaled(week.moderate, 0, top))
            }
            .clipShape(RoundedRectangle(cornerRadius: 2.5))
            .frame(maxWidth: .infinity)
        }
    }

    /// The week's number, as on the load bars.
    static func label(_ week: TrainingSnapshot.ZoneWeek) -> String {
        week.week.map { String($0) } ?? Fmt.dayMonth(week.start)
    }
}

/// The week's minutes in each active zone, with the zone's colour.
struct ZoneLegend: View {
    let week: TrainingSnapshot.ZoneWeek

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            item("Střední", week.moderate, ZoneStyle.moderate)
            item("Intenzivní", week.vigorous, ZoneStyle.vigorous)
            item("Maximální", week.peak, ZoneStyle.peak)
        }
    }

    private func item(_ name: String, _ minutes: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(name).font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
            }
            Text(verbatim: Fmt.int(minutes) + " min").font(Typo.number(17)).foregroundStyle(Palette.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// One bar split into parts with the share of each underneath.
struct ZoneBar: View {
    let parts: [(String, Double, Color)]

    var body: some View {
        let total = max(parts.map { $0.1 }.reduce(0, +), 1)
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(parts.indices, id: \.self) { i in
                        Rectangle().fill(parts[i].2).frame(width: max(0, (geo.size.width - 6) * parts[i].1 / total))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 12)
            HStack(alignment: .top, spacing: 8) {
                ForEach(parts.indices, id: \.self) { i in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(parts[i].0).font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
                        Text(Fmt.int(parts[i].1 / total * 100) + " %").font(Typo.number(17)).foregroundStyle(Palette.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parts.map { L10n.tr($0.0) + " " + Fmt.int($0.1 / total * 100) + " %" }.joined(separator: ", "))
    }
}
