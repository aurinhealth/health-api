import SwiftUI

// MARK: - Week plan (redesign W, concept 05 "H")
//
// One screen in a sheet with [Coach, X]: this week's strip (the Training strip,
// DayCircle), "X of Y planned workouts done", the pills Show next week and Plan
// settings, then This week and Next week as two identical cards that fold their
// days. Days before today wait behind Show earlier days, so today comes first.
// A done workout is the Training row (result, time, % of plan, chevron to its
// detail); a planned one opens in place: Workout details (the Training detail,
// back to the same spot), the day tiles to move it (no dragging, Petr
// 2026-11-15), its length and Remove from the plan with Undo. Plan settings
// (WeekPlanSettings.swift) sets the sports, rest days and time; Generate there
// replans the two weeks here (WeekPlanGenerator).

/// One week of the plan, from the training calendar, so the strip and the list agree.
struct WeekPlanWeek: Equatable {
    let monday: String
    let today: String
    let days: [String]
    /// The workouts of the week by day: done ones first, then the planned and the missed.
    /// A walk counts only when it fulfils a plan.
    let sessions: [CalendarActivity]

    init(monday: String, today: String, calendar: [String: CalendarDay], hidden: Set<String> = []) {
        self.monday = monday
        self.today = today
        days = (0..<7).map { ISODay.shift(monday, $0) }
        sessions = days.flatMap { date -> [CalendarActivity] in
            let list = (calendar[date]?.activities ?? []).filter { a in
                !hidden.contains(a.id) && (a.sport != "walk" || a.plannedId != nil)
            }
            let rank = ["done": 0, "planned": 1, "missed": 2]
            return list.enumerated().sorted { x, y in
                let a = rank[x.element.status] ?? 3, b = rank[y.element.status] ?? 3
                return a == b ? x.offset < y.offset : a < b
            }.map(\.element)
        }
    }

    var sunday: String { days[6] }
    var count: Int { sessions.count }
    var minutes: Int { sessions.reduce(0) { $0 + Int(($1.minutes ?? 0).rounded()) } }
    /// The planned minutes still ahead, today included.
    var minutesToGo: Int {
        sessions.filter { $0.status == "planned" && $0.date >= today }.reduce(0) { $0 + Int(($1.minutes ?? 0).rounded()) }
    }
    var hasPlanned: Bool { sessions.contains { $0.status == "planned" } }
    /// Days before today with a workout: they wait behind "Show earlier days".
    var hasEarlier: Bool { sessions.contains { $0.date < today } }

    func sessions(on date: String) -> [CalendarActivity] { sessions.filter { $0.date == date } }
}

/// The screen's sentences, in one place for the tests.
enum WeekPlanText {
    /// "Nov 9 to Nov 15".
    static func range(_ monday: String) -> String {
        L10n.f("%@ až %@", Fmt.dayMonthShort(monday), Fmt.dayMonthShort(ISODay.shift(monday, 6)))
    }

    /// "8 workouts, 7 h 22".
    static func summary(count: Int, minutes: Int) -> String {
        guard count > 0 else { return L10n.tr("Žádný trénink") }
        return L10n.plural("%lld tréninků", count) + (minutes > 0 ? ", " + planDuration(minutes) : "")
    }

    /// The one count of the week, the same as Training's (server thisWeek).
    static func done(_ done: Int, of planned: Int) -> String {
        L10n.f("%@ z %@ naplánovaných tréninků hotovo", String(done), String(planned))
    }

    static func toGo(_ minutes: Int) -> String { L10n.f("zbývá %@", planDuration(minutes)) }

    /// The line under Generate: what it changes and what it keeps.
    static func replans(from today: String, to end: String) -> String {
        L10n.f("Přeplánuje %@ až %@. Hotové tréninky zůstanou.", Fmt.dayMonthShort(today), Fmt.dayMonthShort(end))
    }

    /// "Today" or "Fr", over the day's number.
    static func dayWord(_ date: String, today: String) -> String {
        date == today ? L10n.tr("Dnes") : Fmt.weekdayShort(date)
    }
}

// MARK: - The sheet

/// Week plan as Training opens it: a sheet with its own stack, so Workout
/// details pushes inside it and comes back to the same spot.
struct WeekPlanSheet: View {
    var body: some View {
        NavigationStack {
            WeekPlanView().appRoutes()
        }
        .presentationDragIndicator(.visible)
    }
}

/// A link that opens Week plan as its sheet (Training's "Week plan", "Plan week").
struct WeekPlanLink<Label: View>: View {
    @ViewBuilder let label: () -> Label
    @State private var open = false

    var body: some View {
        Button { open = true } label: { label() }
            .buttonStyle(.plain)
            .sheet(isPresented: $open) { WeekPlanSheet() }
    }
}

struct WeekPlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var plans: TrainingPlans?
    /// The two weeks' plans (sports per day, time) and the usual week.
    @State private var weekPlans: [String: WeekPlanResponse] = [:]
    @State private var showNext = false
    /// The weeks unfolded; nil until the first tap: this week open.
    @State private var openWeeks: Set<String>?
    @State private var showEarlier = false
    /// The planned workout opened in place.
    @State private var opened: String?
    /// "Add workout": the week it adds to, then the sport.
    @State private var adding: String?
    @State private var addSport: String?
    @State private var working: String?
    @State private var error: String?
    @Environment(\.scenePhase) private var scenePhase
    @State private var toast: PlanToast?
    /// Removed, waiting for the toast to go without Undo.
    @State private var hidden: Set<String> = []
    @State private var settings = false
    /// Generate from Plan settings: the weeks are being built; a failure says so.
    @State private var generating = false
    @State private var generateFailed = false
    /// The day Generate replans from (Plan settings: the first day changed); Try again keeps it.
    @State private var generateFrom: String?

    private var today: String { model.demo ? (model.training?.date ?? AppModel.localDate(Date())) : AppModel.localDate(Date()) }
    private var monday: String { FreeTime.monday(today) }
    private var nextMonday: String { ISODay.shift(monday, 7) }
    private var thisWeek: WeekPlanWeek { WeekPlanWeek(monday: monday, today: today, calendar: model.calendar, hidden: hidden) }
    private var nextWeek: WeekPlanWeek { WeekPlanWeek(monday: nextMonday, today: today, calendar: model.calendar, hidden: hidden) }
    private var unfolded: Set<String> { openWeeks ?? [monday] }
    private var hasPlan: Bool { thisWeek.hasPlanned || nextWeek.hasPlanned || plans?.active != nil }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScreenBackground(glow: Palette.Glow.training)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header
                        strip(thisWeek) { date in jump(date, proxy) }
                            .padding(.top, 16)
                        if showNext && hasPlan && !generating {
                            nextStripLabel.padding(.top, 10)
                            strip(nextWeek) { date in jump(date, proxy) }
                        }
                        if hasPlan && !generating { caption.padding(.top, 8) }
                        if hasPlan && !generating { pills.padding(.top, 14) }
                        content.padding(.top, 22)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, hasPlan && !generating ? 60 : 120)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            if !hasPlan && !generating {
                bottomButton(L10n.tr("Nastavit můj plán")) { settings = true }
            }
            if let toast {
                PlanToastView(toast: toast) { settle(toast, undo: true) }
                    .padding(.horizontal, 16).padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .navBarVisibility(.hidden)
        .task { await load() }
        // The app going away settles the toast: a removal waiting for it is sent
        // now, not lost with the app (review 2026-11-24 point 9, as MissedWorkoutBlock).
        .onChange(of: scenePhase) { _, phase in if phase != .active, let toast { settle(toast, undo: false) } }
        .sheet(isPresented: $settings) {
            WeekPlanSettingsView(monday: monday, today: today, calendar: model.calendar) { from in
                Task {
                    await reload()
                    if let from { generateFrom = from; await runGenerate() }
                }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: L10n.tr("Plán týdne")).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                if let subtitle {
                    Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            CoachEntry(view: "training", companion: ChromeAction(systemImage: "xmark", label: "Zavřít") {
                // A removal waiting for its toast goes through (pushing Workout details keeps it pending).
                if let toast { settle(toast, undo: false) }
                dismiss()
            })
        }
    }

    /// "Half marathon, week 8 of 13, Build"; "No plan yet" without one.
    private var subtitle: String? {
        if let active = plans?.active ?? plans?.activeGym, active.started {
            let phase = active.template.weeks.first { $0.week == active.week }?.phaseLabel
            return [active.name, L10n.f("týden %@ z %@", String(active.week), String(active.weeksCount)), phase].compactMap { $0 }.joined(separator: ", ")
        }
        return hasPlan ? nil : L10n.tr("Zatím bez plánu")
    }

    // MARK: Strip

    /// The Training strip literally (DayCircle): today in its oval, a tap jumps to the day.
    private func strip(_ week: WeekPlanWeek, pick: @escaping (String) -> Void) -> some View {
        HStack(spacing: 0) {
            ForEach(week.days, id: \.self) { date in
                Button { pick(date) } label: {
                    DayCircle(date: date, today: today, selected: date == today, day: model.calendar[date])
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var nextStripLabel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(Palette.hairline).frame(height: 1)
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: L10n.tr("Příští týden")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: WeekPlanText.range(nextMonday)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
    }

    /// "4 of 8 planned workouts done" and "4 h to go"; while building, what is built.
    private var caption: some View {
        HStack(alignment: .firstTextBaseline) {
            if !generating, let week = model.training?.thisWeek, week.planned > 0 {
                Text(verbatim: WeekPlanText.done(week.done, of: week.planned)).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
            }
            Spacer(minLength: 8)
            if !generating, thisWeek.minutesToGo > 0 {
                Text(verbatim: WeekPlanText.toGo(thisWeek.minutesToGo)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .padding(.horizontal, 4)
    }

    /// Side by side; on a narrow phone or with large text one under the other.
    private var pills: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { pillPair }.frame(maxWidth: .infinity)
            VStack(spacing: 8) { pillPair }.frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder private var pillPair: some View {
        pill(showNext ? L10n.tr("Skrýt příští týden") : L10n.tr("Ukázat příští týden")) {
            withAnimation(.snappy) { showNext.toggle() }
        }
        pill(L10n.tr("Nastavení plánu")) { settings = true }
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if generating {
            building
        } else if generateFailed {
            failed
        } else if hasPlan {
            VStack(spacing: 14) {
                weekCard(thisWeek, title: L10n.tr("Tento týden"))
                weekCard(nextWeek, title: L10n.tr("Příští týden"))
                if let error {
                    Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
        } else {
            empty
        }
    }

    /// No plan: one sentence and the button; done workouts still show (D-PLAN-4).
    private var empty: some View {
        VStack(spacing: 8) {
            Text(verbatim: L10n.tr("Zatím žádné naplánované tréninky")).font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: L10n.tr("Nastav si další dva týdny. Vyber dny a čas, nebo nech všechno na kouči."))
                .font(Typo.small).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if !thisWeek.sessions.isEmpty {
                VStack(spacing: 8) { dayRows(thisWeek, earlier: true) }.padding(.top, 18)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }

    /// D-PLAN-5: one heading, the weeks' time, and grey rows in the shape of workouts.
    private var building: some View {
        VStack(spacing: 8) {
            Text(verbatim: L10n.tr("Sestavuji tvé tréninky")).font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Text(verbatim: L10n.tr("Dva týdny podle tvého nastavení")).font(Typo.small).foregroundStyle(Palette.muted)
            VStack(spacing: 10) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.track).frame(height: 62)
                }
            }
            .padding(.top, 16)
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    private var failed: some View {
        VStack(spacing: 12) {
            Text(verbatim: L10n.tr("Plán se nepodařilo sestavit. Nastavení je uložené."))
                .font(Typo.body).foregroundStyle(Palette.ink).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            pill(L10n.tr("Zkusit znovu")) { Task { await runGenerate() } }
                .disabled(model.offline)
            if model.offline {
                Text(verbatim: L10n.tr("Jsi offline. Připoj se a plán se sestaví.")).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }

    // MARK: A week

    private func weekCard(_ week: WeekPlanWeek, title: String) -> some View {
        let open = unfolded.contains(week.monday)
        return VStack(spacing: 8) {
            Button {
                withAnimation(.snappy) {
                    var set = unfolded
                    if open { set.remove(week.monday) } else { set.insert(week.monday) }
                    openWeeks = set
                }
            } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: WeekPlanText.summary(count: week.count, minutes: week.minutes)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    Text(verbatim: WeekPlanText.range(week.monday)).font(Typo.caption).foregroundStyle(Palette.muted)
                    Image(systemName: "chevron.up").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                        .rotationEffect(.degrees(open ? 0 : 180))
                }
                .padding(.horizontal, 16).frame(minHeight: 58)
                .cardSurface(cornerRadius: 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(Text(verbatim: L10n.tr(open ? "Rozbaleno" : "Sbaleno")))
            .accessibilityHint(Text(verbatim: L10n.tr(open ? "Sbalí týden" : "Rozbalí týden")))
            .id(week.monday)

            if open {
                if week.monday == monday && week.hasEarlier {
                    pill(showEarlier ? L10n.tr("Skrýt dřívější dny") : L10n.tr("Ukázat dřívější dny")) {
                        withAnimation(.snappy) { showEarlier.toggle() }
                    }
                }
                dayRows(week, earlier: week.monday != monday || showEarlier)
                addPanel(week)
            }
        }
    }

    @ViewBuilder private func dayRows(_ week: WeekPlanWeek, earlier: Bool) -> some View {
        ForEach(week.days.filter { earlier || $0 >= today }, id: \.self) { date in
            let list = week.sessions(on: date)
            if !list.isEmpty {
                HStack(alignment: .top, spacing: 10) {
                    VStack(spacing: 1) {
                        Text(verbatim: WeekPlanText.dayWord(date, today: today))
                            .scaledFont(11, weight: date == today ? .bold : .medium, cap: .denseCap)
                            .foregroundStyle(date == today ? Palette.ink : Palette.muted)
                        Text(verbatim: ISODay.day(date)).font(Typo.number(18)).foregroundStyle(Palette.ink)
                    }
                    .frame(width: 40)
                    .padding(.top, 14)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(verbatim: Fmt.capitalized(Fmt.weekdayName(date)) + " " + Fmt.dayMonth(date)))
                    VStack(spacing: 8) {
                        ForEach(list) { activity in row(activity, week: week) }
                    }
                }
                .id(date)
            }
        }
    }

    @ViewBuilder private func row(_ a: CalendarActivity, week: WeekPlanWeek) -> some View {
        if a.status == "done" || a.status == "missed" || !PlanSessionActions.upcoming(a.session) {
            if let route = CalendarDayList.route(a) {
                NavigationLink(value: route) { WeekPlanRow(activity: a, open: nil) }.buttonStyle(.plain)
            } else {
                WeekPlanRow(activity: a, open: nil)
            }
        } else {
            let open = opened == a.id
            VStack(spacing: 8) {
                Button {
                    withAnimation(.snappy) { opened = open ? nil : a.id }
                } label: { WeekPlanRow(activity: a, open: open) }
                .buttonStyle(.plain)
                if open {
                    WeekPlanEditor(activity: a, days: week.days, today: today, busy: working == a.id,
                                   move: { date in Task { await move(a, to: date) } },
                                   resize: { minutes in Task { await resize(a, minutes: minutes) } },
                                   remove: { remove(a) })
                }
            }
        }
    }

    // MARK: Add workout

    @ViewBuilder private func addPanel(_ week: WeekPlanWeek) -> some View {
        if adding == week.monday {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Přidat trénink")
                HStack(spacing: 8) {
                    ForEach(enabledSports, id: \.self) { sport in
                        SportTile(sport: sport, selected: addSport == sport) { addSport = sport }
                    }
                }
                if let sport = addSport {
                    WeekDayTiles(days: week.days, today: today, selected: nil) { date in Task { await add(sport, on: date) } }
                        .disabled(working != nil)
                    Text(verbatim: L10n.f("Vyber den. Kouč přidá jeden trénink (%@), který se k němu hodí.", WeekPlanSport.name(sport).lowercased(with: Fmt.locale)))
                        .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(verbatim: L10n.tr("Nejdřív vyber sport.")).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                if working == "add" { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")) }
            }
            .padding(14)
            .cardSurface(cornerRadius: 20)
            pill(L10n.tr("Zrušit")) { withAnimation(.snappy) { adding = nil; addSport = nil } }
                .disabled(working == "add")
        } else {
            pill(L10n.tr("Přidat trénink")) {
                withAnimation(.snappy) { adding = week.monday; addSport = nil; opened = nil }
            }
            .disabled(model.demo)
        }
    }

    /// The sports the athlete has on (Settings → Sports), Ride, Run, Swim, Gym.
    private var enabledSports: [String] {
        let chosen = (weekPlans[monday]?.sports ?? []).map { $0 == "strength" ? "gym" : $0 }
        let all = WeekPlanPrefs.sports
        return chosen.isEmpty ? all : all.filter { chosen.contains($0) }
    }

    // MARK: Pieces

    private func pill(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .padding(.horizontal, 16).frame(minHeight: 44)
                .background(Palette.track, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func bottomButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                .frame(maxWidth: .infinity).frame(height: 54)
                .background(Palette.button, in: Capsule())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20).padding(.bottom, 12)
    }

    private func jump(_ date: String, _ proxy: ScrollViewProxy) {
        let week = date >= nextMonday ? nextMonday : monday
        withAnimation(.snappy) {
            openWeeks = unfolded.union([week])
            if date < today { showEarlier = true }
        }
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            withAnimation(.snappy) { proxy.scrollTo(date, anchor: .top) }
        }
    }

    // MARK: Loading

    private func load() async {
        await model.loadCalendar(from: monday, to: ISODay.shift(nextMonday, 6))
        guard !model.demo else { return }
        plans = try? await model.api.trainingPlans()
        if let a = try? await model.api.weekPlan(start: monday) { weekPlans[monday] = a }
        if let b = try? await model.api.weekPlan(start: nextMonday) { weekPlans[nextMonday] = b }
    }

    private func reload() async {
        guard !model.demo else { return }
        await model.loadCalendar(from: monday, to: ISODay.shift(nextMonday, 6), force: true)
        await model.refreshTraining()
        if let a = try? await model.api.weekPlan(start: monday) { weekPlans[monday] = a }
        if let b = try? await model.api.weekPlan(start: nextMonday) { weekPlans[nextMonday] = b }
    }

    // MARK: Changes

    private func move(_ a: CalendarActivity, to date: String) async {
        guard date != a.date, !model.demo else { return }
        working = a.id
        defer { working = nil }
        do {
            let note = try await PlanSessionActions.move(model, session: a.session, to: date, time: nil)
            error = nil
            opened = nil
            await reload()
            show(PlanToast(title: L10n.f("Přesunuto na %@", Fmt.weekdayName(date)), note: note, cancelled: false, undo: {
                try? await PlanSessionActions.moveBack(model, session: a.session, from: date)
                await reload()
            }))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func resize(_ a: CalendarActivity, minutes: Int) async {
        guard !model.demo else { return }
        working = a.id
        defer { working = nil }
        do {
            try await WeekPlanGenerator.resize(model, a, minutes: minutes)
            error = nil
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Gone from the list at once; it leaves the plan when the toast goes without Undo.
    private func remove(_ a: CalendarActivity) {
        guard !model.demo else { return }
        withAnimation(.snappy) {
            hidden.insert(a.id)
            opened = nil
        }
        show(PlanToast(title: L10n.tr("Trénink odebrán"), note: nil, cancelled: true, undo: {
            withAnimation(.snappy) { _ = hidden.remove(a.id) }
        }, commit: {
            do {
                if a.sport == "strength" {
                    try await GymPlanActions.cancel(model, date: a.date, eventId: a.eventId)
                } else if let eventId = a.eventId {
                    try await model.api.deletePlanned(eventId: eventId)
                }
                await reload()
            } catch {
                self.error = error.localizedDescription
            }
            hidden.remove(a.id)
        }))
    }

    private func add(_ sport: String, on date: String) async {
        working = "add"
        defer { working = nil }
        let available = weekPlans[date >= nextMonday ? nextMonday : monday].map { WeekPlanPrefs.available($0.prefs)[ISODay.weekdayIndex(date)] } ?? -1
        do {
            try await WeekPlanGenerator.add(model, sport: sport, date: date, available: available)
            error = nil
            withAnimation(.snappy) { adding = nil; addSport = nil }
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func runGenerate() async {
        guard !model.demo else { return }
        withAnimation(.snappy) { generating = true; generateFailed = false; opened = nil; adding = nil }
        let ok = await WeekPlanGenerator.replan(model, weeks: [monday, nextMonday], today: today, from: generateFrom, calendar: model.calendar)
        await reload()
        withAnimation(.snappy) {
            generating = false
            generateFailed = !ok
            openWeeks = [monday, nextMonday]
        }
    }

    // MARK: Toast

    /// One toast at a time: a new one settles the one before (its remove goes through).
    private func show(_ next: PlanToast) {
        if let toast { settle(toast, undo: false) }
        withAnimation(.snappy) { toast = next }
        Task {
            try? await Task.sleep(for: .seconds(5))
            if toast?.id == next.id { settle(next, undo: false) }
        }
    }

    private func settle(_ t: PlanToast, undo: Bool) {
        if toast?.id == t.id { withAnimation(.snappy) { toast = nil } }
        if let action = t.settle(undo: undo) { Task { await action() } }
    }

    /// This week's Monday (the plan's weeks start on Monday).
    static func monday(_ date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return AppModel.localDate(start)
    }
}

// MARK: - Rows

/// One workout of the week. Done: the Training row (sport, result under the
/// name, time, % of plan, chevron). Planned: the pale sport, its time of day,
/// its length and a chevron that opens it in place.
struct WeekPlanRow: View {
    let activity: CalendarActivity
    /// nil for a row that opens its detail; else whether it is open in place.
    let open: Bool?

    var body: some View {
        HStack(spacing: 12) {
            // The concept's sport disc (as the week strip): pale while ahead, never a dashed ring.
            SportDisc(sport: activity.sport, type: activity.type, state: SportDisc.State(status: activity.status), size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: activity.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                if let line {
                    Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                if let m = activity.minutes, m > 0 {
                    Text(verbatim: planDuration(Int(m.rounded()))).font(Typo.number(20)).foregroundStyle(Palette.ink)
                }
                if activity.status == "done", let percent = activity.compliance {
                    Text(verbatim: L10n.f("%@ %% plánu", String(percent)))
                        .font(Typo.caption.weight(.semibold)).foregroundStyle(ComplianceScale.color(percent))
                } else if activity.status == "missed" {
                    Text(verbatim: L10n.tr(PlanState.missed.title)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Image(systemName: open == nil ? "chevron.right" : "chevron.down")
                .scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                .rotationEffect(.degrees(open == true ? 180 : 0))
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(minHeight: 60)
        .cardSurface(cornerRadius: 18)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(Text(verbatim: accessibilityState))
    }

    /// "Planned, collapsed" for VoiceOver; a done row says its % of plan already.
    private var accessibilityState: String {
        guard activity.status == "planned" else { return "" }
        let state = L10n.tr("Naplánováno")
        guard let open else { return state }
        return state + ", " + L10n.tr(open ? "Rozbaleno" : "Sbaleno")
    }

    /// Under the name: the result of a done one ("8.2 km, 520 kcal"), the time of a planned one.
    private var line: String? {
        if activity.status == "done" {
            let parts = [activity.km.flatMap { $0 > 0 ? Units.distanceText($0) : nil }, activity.kcal.flatMap { $0 > 0 ? Fmt.int($0) + " kcal" : nil }]
            let text = parts.compactMap { $0 }.joined(separator: ", ")
            return text.isEmpty ? nil : text
        }
        return activity.time.map { ClockText.format($0) }
    }
}

/// A planned workout opened in place: Workout details, the day tiles, the
/// length and Remove from the plan (concept 019, D-PLAN-7).
struct WeekPlanEditor: View {
    let activity: CalendarActivity
    let days: [String]
    let today: String
    let busy: Bool
    let move: (String) -> Void
    let resize: (Int) -> Void
    let remove: () -> Void
    @State private var length: Double = 60
    @State private var dragging = false
    /// VoiceOver's swipes change the value without a drag: saved after a pause.
    @State private var pending: Task<Void, Never>?

    private var sport: String { activity.sport == "strength" ? "gym" : activity.sport }
    private var range: ClosedRange<Double> {
        let current = activity.minutes ?? 60
        return Double(WeekPlanSport.minMinutes(sport))...max(Double(WeekPlanSport.maxMinutes(sport)), current)
    }
    /// The length changes for a ride, run or swim with its event, and for a gym plan.
    private var resizable: Bool { activity.eventId != nil || sport == "gym" }

    var body: some View {
        VStack(spacing: 8) {
            if let route = CalendarDayList.route(activity) {
                NavigationLink(value: route) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: L10n.tr("Detail tréninku")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(verbatim: L10n.tr(sport == "gym" ? "Cviky, série a váhy" : "Kroky, cíle a poznámky")).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 58)
                    .cardSurface(cornerRadius: 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Den")
                WeekDayTiles(days: days, today: today, selected: activity.date) { move($0) }
                Text(verbatim: L10n.tr("Klepni na jiný den a trénink se přesune.")).font(Typo.caption).foregroundStyle(Palette.muted)
                if resizable {
                    HStack(alignment: .firstTextBaseline) {
                        SectionLabel(text: "Délka")
                        Spacer()
                        Text(verbatim: planDuration(Int(length))).font(Typo.number(20)).foregroundStyle(Palette.ink)
                            .contentTransition(.numericText()).animation(.snappy, value: Int(length))
                    }
                    .padding(.top, 6)
                    Slider(value: $length, in: range, step: 5, onEditingChanged: { editing in
                        dragging = editing
                        if !editing { commitLength() }
                    })
                    .tint(Palette.ink)
                    .accessibilityLabel(Text(verbatim: L10n.tr("Délka")))
                    .accessibilityValue(Text(verbatim: planDuration(Int(length))))
                    HStack {
                        Text(verbatim: planDuration(Int(range.lowerBound)))
                        Spacer()
                        Text(verbatim: planDuration(Int(range.upperBound)))
                    }
                    .font(Typo.caption).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
                }
                if busy { CoachThinking(text: L10n.tr("Kouč upravuje trénink…")) }
            }
            .padding(14)
            .cardSurface(cornerRadius: 20)
            .disabled(busy)
            Button(action: remove) {
                Text(verbatim: L10n.tr("Odebrat z plánu")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 16).frame(minHeight: 44)
                    .background(Palette.track, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .onAppear { length = min(max(activity.minutes ?? 60, range.lowerBound), range.upperBound) }
        .onChange(of: length) {
            guard !dragging else { return }
            pending?.cancel()
            pending = Task {
                try? await Task.sleep(for: .milliseconds(900))
                if !Task.isCancelled { commitLength() }
            }
        }
    }

    private func commitLength() {
        pending?.cancel()
        if Int(length) != Int((activity.minutes ?? 0).rounded()) { resize(Int(length)) }
    }
}

/// The week's seven days to pick one; days before today are greyed and not
/// tappable. 44 pt tall (D-PLAN-7).
struct WeekDayTiles: View {
    let days: [String]
    let today: String
    let selected: String?
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(days, id: \.self) { date in
                let on = date == selected, past = date < today
                Button { pick(date) } label: {
                    VStack(spacing: 1) {
                        Text(verbatim: Fmt.weekdayShort(date)).scaledFont(11, weight: .medium, cap: .denseCap)
                        Text(verbatim: ISODay.day(date)).font(Typo.number(17))
                    }
                    .foregroundStyle(on ? Palette.onButton : Palette.ink)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .opacity(past ? 0.4 : 1)
                }
                .buttonStyle(.plain)
                .disabled(past || on)
                .accessibilityLabel(Text(verbatim: Fmt.capitalized(Fmt.weekdayName(date)) + " " + Fmt.dayMonth(date)))
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityHint(past ? Text(verbatim: L10n.tr("Minulý den, nejde změnit")) : Text(verbatim: ""))
            }
        }
    }
}

/// A sport to pick: its tinted disc and name (Add workout, Plan settings).
struct SportTile: View {
    let sport: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                WeekPlanSport.disc(sport, size: 32)
                Text(verbatim: WeekPlanSport.name(sport)).scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(selected ? Palette.ink : .clear, lineWidth: 2) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The plan's four sports: names, discs and the lengths the server takes.
enum WeekPlanSport {
    static func name(_ sport: String) -> String {
        L10n.tr(["ride": "Kolo", "run": "Běh", "swim": "Plavání", "gym": "Posilovna", "strength": "Posilovna"][sport] ?? sport)
    }

    /// The sport's disc as in Training's strip: the colour tinted, the glyph in the colour.
    static func disc(_ sport: String, size: CGFloat) -> some View {
        let color = Palette.Sport.color(sport == "gym" ? "strength" : sport)
        return Image(systemName: SportIcon.symbol(sport == "gym" ? "strength" : sport))
            .font(.system(size: size * 0.45, weight: .medium))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.14), in: Circle())
    }

    /// The server's shortest (src/week-ai.js MIN_MINUTES).
    static func minMinutes(_ sport: String) -> Int { ["ride": 30, "run": 20, "swim": 15, "gym": 30][sport] ?? 20 }

    /// The slider's end: long rides and runs fit, a swim and the gym stay short.
    static func maxMinutes(_ sport: String) -> Int { ["ride": 480, "run": 360, "swim": 120, "gym": 120][sport] ?? 180 }

    /// A new workout's length when the day's time is not set.
    static func usualMinutes(_ sport: String) -> Int { ["ride": 60, "run": 45, "swim": 45, "gym": 45][sport] ?? 45 }
}
