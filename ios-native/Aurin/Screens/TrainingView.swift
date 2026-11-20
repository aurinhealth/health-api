import SwiftUI

struct TrainingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.tabActions) private var actions
    /// A moved or cancelled session with its undo (Tréninky týdne).
    @State private var toast: PlanToast?
    /// The day chosen in the calendar, shown in the pinned bar.
    @State private var calendarDay: String?
    /// A day set from the pinned bar, for the calendar.
    @State private var jumpDay: DayJump?
    /// Where today's Začít trénink is (NextSession writes, the floating copy reads).
    @State private var startSpot = StartSpot()
    /// Scrolled down: the tab bar is two circles and the floating button sits between them.
    @Environment(\.compactTabBar) private var compactBar
    @Environment(\.wideLayout) private var wide

    var body: some View {
        NavigationStack(path: model.path(.training)) {
            ZStack {
                ScreenBackground(glow: Palette.Glow.training)
                if let training = model.training {
                    PageScroll {
                        TrainingContent(training: training,
                                        showToday: { jumpDay = DayJump(date: training.date) }, toast: $toast, pickDay: { calendarDay = $0 }, jumpDay: jumpDay, day: calendarDay)
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
                        HeaderCapsule(coach: actions.coach, settings: actions.settings) { LibraryHeaderIcon() }
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
            // One object for the whole screen: its identity never changes, so a
            // redraw of Training does not redraw the cards that read it.
            .environment(startSpot)
            // The page's bottom from a background, which the floating button never moves.
            .background {
                Color.clear.onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY.rounded() } action: { bottom in
                    startSpot.place(bottom: bottom, compact: compactBar)
                }
            }
            .onChange(of: compactBar) { _, compact in startSpot.place(bottom: startSpot.bottom, compact: compact) }
            .overlay(alignment: .bottom) {
                floatingStartButton
            }
            // The card's own button steps aside while the floating one stands in,
            // so the two never show at once.
            .onChange(of: floatingStart, initial: true) { _, day in
                if startSpot.floating != day { startSpot.floating = day }
            }
            .navBarVisibility(.hidden)
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
        // Every planned session of the week done: the App Store rating (AurinTips.swift).
        .reviewAfterFinishedWeek(model.training?.sessions, demo: model.demo)
    }

    /// Today's Začít trénink while its place in the card is under the tab bar
    /// (or further down): the same button floats just above the bar, or with the
    /// bar scrolled to two circles in its row between them. Not with a hidden
    /// workout's bar there, nor over an undo toast.
    private var floatingStart: String? {
        guard toast == nil, model.minimizedGym == nil, !model.immersive else { return nil }
        return startSpot.underBar
    }

    /// The animation only on the button itself: the page under it never animates
    /// with it, so its own frames cannot flip the button back and forth.
    private var floatingStartButton: some View {
        ZStack(alignment: .bottom) {
            if let date = floatingStart {
                NavigationLink(value: AppRoute.trainingMode(date)) {
                    Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: compactBar ? StartButtonSpot.circle : 54)
                        .background(Palette.button, in: Capsule())
                        .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
                }
                .buttonStyle(.plain)
                // In the compact bar's row: between its circles, as wide as the bar (RootView).
                .padding(.horizontal, compactBar ? StartButtonSpot.circle + StartButtonSpot.gap : 28)
                .frame(maxWidth: compactBar && wide ? WideLayout.tabBarWidth : .infinity)
                .padding(.horizontal, compactBar ? StartButtonSpot.barSide : 0)
                .padding(.bottom, compactBar ? StartButtonSpot.barBottom : StartButtonSpot.barZone + StartButtonSpot.gap)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: floatingStart == nil)
        .animation(.snappy, value: compactBar)
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
    /// "Dnes" in the header: the calendar back on today.
    var showToday: () -> Void = {}
    var toast: Binding<PlanToast?> = .constant(nil)
    var pickDay: (String) -> Void = { _ in }
    var jumpDay: DayJump? = nil
    /// The day chosen in the calendar; nil is today.
    var day: String? = nil
    @Environment(\.tabActions) private var actions
    @State private var editing = false
    @State private var focusSheet = false
    @Environment(\.wideLayout) private var wide

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                // The same top as Dnes (TabHeader); the calendar picks the day, "Dnes" brings it back.
                // The coach first, then the Library (a book), the account last (redesign T, D-TRENINK-11).
                // Log a workout is in "+" (Tools = A, Petr 2026-11-14).
                TabHeader(date: day ?? training.date, followsDay: false,
                          showToday: shownDay == training.date ? nil : showToday,
                          coach: actions.coach, settings: actions.settings) {
                    LibraryHeaderIcon()
                }

                if wide {
                    // Petr, 2026-11-03: today's workout with its Start at the top on the
                    // right, seen without scrolling; the week, the plan and the load on the left.
                    HStack(alignment: .top, spacing: WideLayout.gap) {
                        VStack(alignment: .leading, spacing: 0) {
                            week
                            coachAndLoad
                        }
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        VStack(alignment: .leading, spacing: 0) {
                            todayList(top: 18)
                            // One column of widgets beside the week.
                            if shownDay == training.date {
                                board.environment(\.wideLayout, false).padding(.top, 28)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    }
                } else {
                    week
                    todayList(top: 24)
                    coachAndLoad
                    if shownDay == training.date { board.padding(.top, 28) }
                }
            } else {
                board
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .sheet(isPresented: $focusSheet) { FocusSheet { Task { await model.refreshTraining() } } }
    }

    /// The calendar and the plan under it (redesign T: no strain, no race card,
    /// no tools row; Strain lives on Today, the race in the plan).
    @ViewBuilder private var week: some View {
        // Until the main sport and goal are set (FocusSheet.swift).
        if training.profileIncomplete == true {
            FocusPromptCard { focusSheet = true }
                .padding(.top, 18)
        }

        TrainingCalendarCard(today: training.date, onPick: pickDay, jump: jumpDay,
                             plannedTodayBelow: Set(upcoming.filter { $0.date == training.date }.map(\.title)))
            .padding(.top, 18)

        PlanSummaryCard(training: training)
            .padding(.top, 14)
    }

    /// "TODAY" with Week plan on the right, then today's workouts still to do
    /// with Start workout. On another day the line that today holds the rest.
    @ViewBuilder private func todayList(top: CGFloat) -> some View {
        if shownDay == training.date {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Dnes")
                Spacer(minLength: 8)
                WeekPlanLink {
                    Text(verbatim: L10n.tr("Plán týdne")).font(Typo.body).foregroundStyle(Palette.secondary)
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
            }
            .padding(.top, top - 12)
            // The coach above the workout card (concept a-hlavni/000, D-TRENINK-3).
            CoachTextCard(screen: "training").padding(.top, 6)
            if !upcoming.isEmpty {
                TodaySessions(sessions: upcoming, today: training.date, week: training.sessions ?? [], strainNow: training.strain.score)
                    .padding(.top, 14)
            }
        } else {
            // D-TRENINK-8: the load and the overview are today's, never shown under another day.
            Button(action: showToday) {
                HStack {
                    Text(verbatim: L10n.tr("Zátěž a přehled jsou u dneška")).font(Typo.body).foregroundStyle(Palette.muted)
                    Spacer(minLength: 8)
                    Text(verbatim: L10n.tr("Dnes")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, top)
        }
    }

    /// The coach's card and, today, the two Load dials.
    @ViewBuilder private var coachAndLoad: some View {
        if shownDay != training.date {
            CoachTextCard(screen: "training").padding(.top, 18)
        } else {
            // The coach's conclusion over the load (src/load-advice.js, decision 6).
            if let advice = training.loadAdvice { LoadAdviceCard(advice: advice).padding(.top, 28) }
            LoadSection(training: training).padding(.top, training.loadAdvice == nil ? 28 : 14)
        }
    }

    private var board: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !editing { SectionLabel(text: "Přehled") }
            boardWidgets
        }
    }

    private var boardWidgets: some View {
        WidgetBoard(panel: .training,
                    data: WidgetData(panel: .training, today: model.today, health: model.health, training: training, food: model.food, planToast: toast),
                    editing: $editing, editTitle: "Upravit přehled")
    }

    private var shownDay: String { day ?? training.date }

    /// Today's workouts still to do, else the next planned one (older answers: only that).
    private var upcoming: [TrainingSnapshot.Session] {
        if let today = training.todaySessions, !today.isEmpty { return today }
        return training.next.map { [$0] } ?? []
    }
}

/// The Library in Training's header capsule, between the coach and the
/// account: a book, the same glyph as the Library tile of "+" (Tools = A).
struct LibraryHeaderIcon: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HeaderIcon(systemImage: "books.vertical", label: "Knihovna") { model.open(.library) }
            .accessibilityIdentifier("open.library")
    }
}

// MARK: - Strain

struct StrainHero: View {
    @Environment(AppModel.self) private var model
    let training: TrainingSnapshot
    /// The day chosen in the calendar; nil is today.
    var day: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(title).font(Typo.body).foregroundStyle(Palette.muted)
                if !isAhead {
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                }
            }
            if restDay {
                // A day ahead with nothing planned: said in words, not a faint dash.
                Text("Volný den")
                    .font(Typo.number(52)).lineLimit(1).minimumScaleFactor(0.5)
                    .foregroundStyle(Palette.faint)
                Text("Nic v plánu").font(Typo.small).foregroundStyle(Palette.faint)
            } else {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(score.map { Fmt.decimal($0) } ?? "–")
                        .font(Typo.number(116)).lineLimit(1).minimumScaleFactor(0.5)
                        .foregroundStyle(isAhead ? Palette.faint : Palette.ink)
                    if let note {
                        Pill(text: note, foreground: Palette.amber, background: Palette.amberSoft)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .task(id: day) {
            // A day before this week: its strain from Today of that day.
            if let day, !isToday, !isAhead, weekDay == nil { await model.loadPastStrain(day) }
        }
    }

    private var date: String { day ?? training.date }
    private var isToday: Bool { date == training.date }
    private var isAhead: Bool { date > training.date }
    private var weekDay: TrainingSnapshot.Day? { training.days.first { $0.date == date } }
    /// A day of this week ahead without a planned session: a rest day.
    private var restDay: Bool {
        guard isAhead, weekDay != nil, score == nil else { return false }
        return !(training.sessions ?? []).contains { $0.date == date }
    }

    private var title: String {
        if isToday { return L10n.tr("Námaha dnes") }
        if AppModel.shift(training.date, by: -1) == date { return L10n.tr("Námaha včera") }
        if AppModel.shift(training.date, by: 1) == date { return L10n.tr("Námaha zítra") }
        return L10n.f("Námaha %@", Fmt.dayShort(date, today: training.date))
    }

    /// Today's from the training answer; a past day of the week as its bar, an
    /// older one as Today shows it; a day ahead its planned strain.
    private var score: Double? {
        if isToday { return training.strain.score ?? 0 }
        if isAhead { return weekDay?.planned }
        return weekDay.map { $0.strain ?? 0 } ?? model.pastStrain[date]
    }

    /// The same goal as Dnes and the Námaha detail (the range from readiness, whole numbers);
    /// without it, where today's plan takes the strain, called a plan as on Dnes.
    /// Another day has no goal; a day ahead says its number is the plan.
    private var note: String? {
        if !isToday { return isAhead && score != nil ? L10n.tr("plán") : nil }
        if let today = model.today, today.date == training.date, let t = today.strain.target {
            return L10n.f("cíl %@–%@", Fmt.int(t.low), Fmt.int(t.high))
        }
        return training.strain.target.map { L10n.f("plán ~%@", Fmt.decimal($0)) }
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
                        .scaledFont(12, weight: day.today ? .semibold : .regular)
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

/// Today's workouts in one card that swipes between them, with the dots under
/// it (as a stack of widgets on the Home Screen); a single workout, or the
/// next planned day's, is the card alone.
struct TodaySessions: View {
    let sessions: [TrainingSnapshot.Session]
    let today: String
    /// The week's sessions: a card opens the same detail as Tréninky týdne.
    let week: [WeekSession]
    /// Today's strain so far: a workout today shows where it takes the day.
    var strainNow: Double? = nil
    @State private var current: Int?

    var body: some View {
        if sessions.count == 1, let session = sessions.first {
            NextSession(session: session, today: today, route: route(session), strainNow: strainNow)
        } else {
            VStack(spacing: 12) {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 24) {
                        ForEach(Array(sessions.enumerated()), id: \.offset) { index, session in
                            NextSession(session: session, today: today, route: route(session), strainNow: strainNow, fill: true)
                                .frame(maxHeight: .infinity)
                                .containerRelativeFrame(.horizontal)
                                .id(index)
                        }
                    }
                    // The cards as tall as the tallest, their shadow inside the scroll.
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 24)
                    .scrollTargetLayout()
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $current)
                .padding(.bottom, -24)
                HStack(spacing: 7) {
                    ForEach(sessions.indices, id: \.self) { index in
                        Circle()
                            .fill(index == (current ?? 0) ? Palette.ink : Palette.faint.opacity(0.35))
                            .frame(width: 7, height: 7)
                    }
                }
                // Only a marker for sight; VoiceOver swipes up or down through the workouts.
                .accessibilityElement()
                .accessibilityLabel(L10n.f("Trénink %@ z %@", String((current ?? 0) + 1), String(sessions.count)))
                .accessibilityAdjustableAction { direction in
                    let now = current ?? 0
                    switch direction {
                    case .increment: withAnimation { current = min(sessions.count - 1, now + 1) }
                    case .decrement: withAnimation { current = max(0, now - 1) }
                    @unknown default: break
                    }
                }
            }
        }
    }

    /// The gym plan opens the gym day, a planned ride or run its detail.
    private func route(_ s: TrainingSnapshot.Session) -> AppRoute? {
        let match = week.first { w in
            if let id = s.eventId { return w.eventId == id }
            return s.sport == "strength" && w.kind == "gym" && w.date == s.date
        }
        if let match { return WeekSessionsList.destination(match) }
        return s.sport == "strength" ? .gym(s.date) : nil
    }
}

/// Today's Začít trénink on Training floats above the tab bar while its place
/// in the card is under the bar or further down (review 2026-11-02, point 3).
/// Scrolled down, the bar is two circles and the button sits in their row, so
/// it no longer covers the last exercise and its "why today" (design review
/// 2026-11-10, point 11).
enum StartButtonSpot {
    /// The tab bar (60 pt, Dynamic Type can grow it) and its gap above the
    /// bottom of the safe area (RootView).
    static let barZone: CGFloat = 76
    /// The floating button's gap above the bar. The card's button hands over
    /// at the same line, so the swap happens where the two would overlap.
    static let gap: CGFloat = 8
    /// The compact bar (RootView, TabBar): its circles, its side and bottom gaps.
    static let circle: CGFloat = 52
    static let barSide: CGFloat = 20
    static let barBottom: CGFloat = 8

    /// The line the card's button hands over at, `gap` under it: the top of
    /// the bar, so the card's button never shows under the bar or its circles.
    static func floor(bottom: CGFloat, compact: Bool) -> CGFloat {
        guard bottom > 0 else { return 0 }
        return bottom - (compact ? barBottom + circle : barZone)
    }
}

extension EnvironmentValues {
    /// The tab bar is scrolled to its compact form (RootView), for Training's floating button.
    @Entry var compactTabBar = false
}

/// Where today's Začít trénink is on Training: NextSession writes, TrainingView's
/// floating copy reads. Writes happen only on a change, so scrolling redraws nothing.
@MainActor @Observable
final class StartSpot {
    /// The day of the button while it sits under the tab bar or further down.
    var underBar: String?
    /// The line the card's button hands over at (global), 0 before it is measured.
    var floor: CGFloat = 0
    /// The page's bottom (global), kept for when the bar changes its form.
    @ObservationIgnored var bottom: CGFloat = 0
    /// The day whose button floats right now: its button in the card is hidden.
    var floating: String?

    func place(bottom: CGFloat, compact: Bool) {
        self.bottom = bottom
        let floor = StartButtonSpot.floor(bottom: bottom, compact: compact)
        if self.floor != floor { self.floor = floor }
    }

    func report(_ day: String, under: Bool) {
        if under { if underBar != day { underBar = day } }
        else if underBar == day { underBar = nil }
    }
}

struct NextSession: View {
    @Environment(AppModel.self) private var model: AppModel?
    let session: TrainingSnapshot.Session
    let today: String
    /// Where a tap on the card opens (Start workout keeps its own tap).
    var route: AppRoute? = nil
    /// Today's strain so far (TodaySessions).
    var strainNow: Double? = nil
    /// In the swiping card: as tall as the tallest of today's.
    var fill = false
    @Environment(StartSpot.self) private var startSpot: StartSpot?
    /// A ride's, run's or swim's steps, for its parts (loaded for the card).
    @State private var blocks: [PlannedWorkout.Block]?
    /// The gym day, for its parts and their minutes.
    @State private var gymDay: GymDay?
    /// The floating copy above the tab bar stands in for this card's button.
    private var standIn: Bool { startSpot?.floating == session.date }

    private var sport: String { session.sport ?? "other" }
    private var isGym: Bool { sport == "strength" }

    // Card A of the redesign (T): the sport's wash, the serif title, the numbers,
    // the parts, Start workout as an ink pill.
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let route {
                RouteLink(route: route) { info }
            } else {
                info
            }
            if isGym && session.date == today {
                NavigationLink(value: AppRoute.trainingMode(session.date)) {
                    Text(verbatim: L10n.tr("Začít trénink")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                // While the floating copy is up, this one is hidden: scrolled to just
                // behind the bar it would otherwise peek out under the floating one.
                .opacity(standIn ? 0 : 1)
                .allowsHitTesting(!standIn)
                .accessibilityHidden(standIn)
                .onGeometryChange(for: Bool.self) { [floor = startSpot?.floor ?? 0] in
                    floor > 0 && $0.frame(in: .global).maxY > floor - StartButtonSpot.gap
                } action: { under in
                    startSpot?.report(session.date, under: under)
                }
                .onDisappear { startSpot?.report(session.date, under: false) }
            }
            if fill { Spacer(minLength: 0) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Palette.Sport.color(sport).opacity(0.16), .clear], startPoint: .topLeading, endPoint: .init(x: 0.6, y: 0.45)),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .task(id: [session.eventId ?? "", session.date, session.title]) { await loadParts() }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(session.title)
                        .font(Typo.heading(26, relativeTo: .title2))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(verbatim: when).font(Typo.small).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 4)
                if route != nil {
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint).padding(.top, 8)
                }
            }
            WorkoutNumberRow(cells: numbers)
            if !parts.isEmpty { WorkoutPartsRow(parts: parts) }
            if let advice = session.advice {
                Text(advice).font(Typo.small).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// Time, the sport's middle numbers, Strain est.
    private var numbers: [WorkoutNumberRow.Cell] {
        var cells: [WorkoutNumberRow.Cell] = []
        if let m = session.minutes { cells.append(.init(label: L10n.tr("Čas"), value: String(m), unit: "min")) }
        if isGym, let lines = session.lines, !lines.isEmpty {
            cells.append(.init(label: L10n.tr("Cviky"), value: String(lines.count)))
            cells.append(.init(label: L10n.tr("Série"), value: String(lines.reduce(0) { $0 + Self.left($1) })))
        } else if sport == "swim", let blocks, let m = WorkoutCardParts.meters(blocks) {
            cells.append(.init(label: L10n.tr("Vzdálenost"), value: Fmt.int(m), unit: "m"))
        } else if let blocks, (session.minutes ?? 0) < 45 {
            // Carbs per hour stands here from 45 min once the server has it (Carbs B);
            // a short workout shows its work minutes.
            let work = WorkoutCardParts.workMinutes(blocks, sport: sport)
            if work > 0 { cells.append(.init(label: L10n.tr("Práce"), value: String(work), unit: "min")) }
        }
        if let strain = strainValue { cells.append(.init(label: L10n.tr("Námaha"), value: Fmt.decimal(strain, digits: 1), unit: L10n.tr("odh."))) }
        return cells
    }

    /// Today: where the workout takes the day's strain, as the target band
    /// counts it (strain doesn't add up). Another day: the workout's own.
    private var strainValue: Double? {
        guard let strain = session.strain else { return nil }
        guard session.date == today, let now = strainNow else { return strain }
        return Self.dayStrain(now, adding: strain)
    }

    private var parts: [WorkoutCardPart] {
        if isGym {
            guard let day = gymDay else { return [] }
            let chosen = GymDayParts.resolved(day, stored: UserDefaults.standard.string(forKey: GymDayParts.storageKey) ?? "", date: session.date)
            let shown = chosen.visible(day).filter { chosen.isOn($0) }
            let others = shown.filter { $0 != .exercises }.reduce(0) { $0 + chosen.minutes($1, day: day) }
            return shown.map { part in
                let minutes = part == .exercises ? max(0, (session.minutes ?? 0) - others) : chosen.minutes(part, day: day)
                return WorkoutCardPart(name: Self.partName(part), minutes: minutes)
            }
            .filter { $0.minutes > 0 }
        }
        return blocks.map { WorkoutCardParts.endurance($0, sport: sport) } ?? []
    }

    static func partName(_ part: GymDayPart) -> String {
        switch part {
        case .warmup: return L10n.tr("Rozcvička")
        case .stretching: return L10n.tr("Protažení")
        case .exercises: return L10n.tr("Cviky")
        case .cardioStart, .cardioEnd: return L10n.tr("Kardio")
        }
    }

    /// The gym day or the planned steps, once; never in the sample day.
    private func loadParts() async {
        // Another workout in this place (the first one done): never its parts.
        blocks = nil
        gymDay = nil
        guard let model, !model.demo else { return }
        if isGym {
            guard session.date >= today else { return }
            gymDay = try? await model.gymDay(date: session.date)
        } else if let id = session.eventId {
            blocks = (try? await model.api.plannedWorkout(eventId: id))?.workout.steps
        }
    }

    /// "Today at 17:30", "Tomorrow", "Saturday at 8:00".
    private var when: String {
        let day = Fmt.capitalized(Fmt.relativeDay(session.date, today: today))
        // A plan without its own hour comes at midnight ("00:00"): only the day then.
        guard session.time != "00:00", let time = ClockText.format(optional: session.time) else { return day }
        return L10n.f("%@ v %@", day, time)
    }

    /// Two strains on one day: the loads add up on the saturating 0–21 curve
    /// (strainScore in src/recovery-model.js), 21, (1 − e^(−load / 225)).
    static func dayStrain(_ a: Double, adding b: Double) -> Double {
        let left = (1 - min(a, 20.9) / 21) * (1 - min(b, 20.9) / 21)
        return ((21 * (1 - left)) * 10).rounded() / 10
    }

    /// "8–10, 16 kg": the heaviest planned set's reps and weight.
    static func amount(_ line: TrainingSnapshot.Session.Line) -> String {
        [line.reps, line.kg.map(EquipmentView.kg)].compactMap { $0 }.joined(separator: ", ")
    }

    /// The exercise's work sets not yet ticked off.
    static func left(_ line: TrainingSnapshot.Session.Line) -> Int { max(0, line.sets - (line.done ?? 0)) }

}

// MARK: - Event

struct EventCard: View {
    let event: TrainingSnapshot.Event

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: L10n.tr("Závod") + (event.date.map { ", " + Fmt.dayMonth($0) } ?? ""))
                Spacer()
            }
            HStack(alignment: .lastTextBaseline) {
                Text(event.name ?? "Hlavní závod")
                    .font(Typo.heading(26, relativeTo: .title2))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 12)
                if let left = event.daysLeft {
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text(String(left)).font(Typo.number(44)).foregroundStyle(Palette.ink)
                        Text(L10n.plural("dní", left)).font(Typo.small).foregroundStyle(Palette.faint)
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
        case "now": return phase.week.map { w in L10n.f("teď, týden %@/%@", String(w), String(phase.weeks ?? w)) } ?? L10n.tr("teď")
        default: return phase.from.map { L10n.f("od %@", Fmt.dayMonth($0)) } ?? ""
        }
    }
}

// MARK: - Widgets

struct FormWidget: View {
    let form: TrainingSnapshot.Form
    /// "Posledních 7 dní vs. obvyklých 28: Nad obvyklou, jednotvárný týden", only when worth a line.
    var loadNote: String? = nil
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Forma", color: Palette.amberBar)
            SizedWidgetBody(size: size) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(Fmt.signed(form.form)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                    Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                }
                Text(form.label).font(Typo.caption).foregroundStyle(zoneColor(form.zone)).lineLimit(1)
            } chart: { height in
                VStack(spacing: 6) {
                    FormLines(series: Array(form.series.suffix(size == .large ? 90 : 42)), height: height)
                    ChartLegend(items: [.init(color: Palette.green, text: L10n.tr("Kondice")), .init(color: Palette.amberBar, text: L10n.tr("Únava"))],
                                note: L10n.tr(size == .large ? "3 měsíce" : "6 týdnů"))
                }
            }
            if let loadNote {
                // In ink, never a warning colour (Today audit D4).
                Text(verbatim: loadNote).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otevře detail formy a kondice")
    }
}

extension FormWidget {
    /// The last 7 days above the usual 28 and a monotonous week, in one line,
    /// in words without a ratio (Today audit D4); nil otherwise (a lighter
    /// week says nothing worth a line).
    static func loadNote(acwr: TrainingSnapshot.ACWR?, monotony: TrainingSnapshot.Monotony?) -> String? {
        var parts: [String] = []
        if let level = acwr?.level, level == "above" || level == "wellAbove", let word = TrainingSnapshot.ACWR.word(level) {
            parts.append(L10n.f("Posledních 7 dní vs. obvyklých 28: %@", word))
        }
        if monotony?.high == true {
            parts.append(parts.isEmpty ? L10n.tr("Jednotvárný týden") : L10n.tr("jednotvárný týden"))
        }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}

func zoneColor(_ zone: String) -> Color {
    switch zone {
    case "optimal", "fresh": return Palette.green
    case "risk": return Palette.rust
    default: return Palette.amber
    }
}

/// Fitness (green) and fatigue (amber) over time. The detail (`scale`) has
/// its scale on the right and the months underneath.
struct FormLines: View {
    let series: [TrainingSnapshot.FormPoint]
    var height: CGFloat = 40
    var scale = false

    var body: some View {
        let values = series.flatMap { [$0.fitness, $0.fatigue] }
        let lo = (values.min() ?? 0) - 2, hi = (values.max() ?? 1) + 2
        VStack(spacing: 6) {
            ZStack(alignment: .topLeading) {
                if scale {
                    GeometryReader { geo in
                        ChartScale(ticks: scaleTicks(lo, hi, count: 3), width: geo.size.width - scaleWidth) {
                            3 + (height - 6) * (1 - scaled($0, lo, hi))
                        }
                    }
                }
                ZStack {
                    LineChart(values: series.map(\.fatigue), color: Palette.amberBar, lo: lo, hi: hi, lineWidth: 1.6, height: height)
                    LineChart(values: series.map(\.fitness), color: Palette.green, lo: lo, hi: hi, height: height)
                }
                .padding(.trailing, scale ? scaleWidth : 0)
            }
            .frame(height: height)
            if scale {
                ChartDates(marks: monthMarks(series.map(\.date)), trailing: scaleWidth)
            }
        }
    }
}

struct VO2maxWidget: View {
    let vo2: TrainingSnapshot.VO2max
    /// Training's day: the scale ends "today" only when the last estimate is from it.
    var today: String? = nil
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "VO2max", color: Palette.green, trailing: L10n.tr("odhad"))
            SizedWidgetBody(size: size) {
                NumberText(value: Fmt.decimal(vo2.value, digits: vo2.value.rounded() == vo2.value ? 0 : 1), unit: size == .small ? nil : "ml/kg/min")
                if let change = vo2.change, change != 0 {
                    Text((change > 0 ? "↑ " : "↓ ") + L10n.f("%@ za 4 týdny", Fmt.decimal(abs(change))))
                        .font(Typo.caption).foregroundStyle(change > 0 ? Palette.green : Palette.rust)
                } else {
                    Text("půl roku").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            } chart: { height in
                VO2maxLine(values: vo2.series.map(\.value), last: vo2.series.last?.date, today: today, height: height)
            }
        }
    }
}

/// VO2max over half a year: a line only, on a scale at least ±3 ml/kg/min
/// around it with its values on the right, so a change of 0.5 stays small.
/// The time ends at the last estimate's day ("Oct 28"), "today" only when it is.
struct VO2maxLine: View {
    let values: [Double]
    var last: String? = nil
    var today: String? = nil
    var height: CGFloat = 56

    var body: some View {
        let axis = Self.axis(values)
        VStack(spacing: 6) {
            ZStack(alignment: .topLeading) {
                GeometryReader { geo in
                    ChartScale(ticks: [axis.lo.rounded(.up), axis.hi.rounded(.down)].map { ScaleTick(value: $0, text: Fmt.int($0)) },
                               width: geo.size.width - scaleWidth) {
                        3 + (height - 6) * (1 - scaled($0, axis.lo, axis.hi))
                    }
                }
                LineChart(values: values, color: Palette.green, lo: axis.lo, hi: axis.hi, height: height)
                    .padding(.trailing, scaleWidth)
            }
            .frame(height: height)
            ChartSpan(start: L10n.tr("před půl rokem"), end: last.flatMap { $0 == today ? nil : Fmt.dayMonthShort($0) } ?? L10n.tr("dnes"))
        }
    }

    /// The values' middle ± half their spread, never less than ±3 ml/kg/min.
    static func axis(_ values: [Double]) -> (lo: Double, hi: Double) {
        guard let low = values.min(), let high = values.max() else { return (40, 50) }
        let middle = (low + high) / 2, half = max(3, (high - low) / 2 + 0.5)
        return (middle - half, middle + half)
    }
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
                Text(L10n.plural("tréninků hotovo", week.planned))
                    .font(Typo.caption).foregroundStyle(Palette.amber).lineLimit(1)
            } chart: { height in
                // Weekly load comes from Intervals.icu: without it eight empty weeks say nothing (audit 14.8).
                if loads.count > 1 && values.contains(where: { $0 > 0 }) {
                    BarChart(values: values,
                             styles: loads.indices.map { i in
                                 i == loads.count - 1 ? BarStyle(fill: Palette.amberBar, dashed: (loads[i].planned ?? 0) > loads[i].load, done: loads[i].load) : BarStyle(fill: Palette.sand)
                             },
                             hi: max(values.max() ?? 1, 1),
                             labels: loads.map { String($0.week) },
                             highlighted: loads.count - 1,
                             height: height,
                             caption: L10n.tr("TSS za týden"))
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
                         labels: active.week.map { Fmt.weekdayShort($0.date) },
                         highlighted: active.week.count - 1,
                         spacing: size == .small ? 3 : 4,
                         height: height,
                         targetTag: active.usual.map { (name: L10n.tr("obvykle"), value: Fmt.int($0)) })
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
                    Text(week.status).font(Typo.caption).foregroundStyle(week.statusColor).lineLimit(1)
                }
                ProgressLine(fraction: week.counted / TrainingSnapshot.ZoneWeek.whoTarget, color: Palette.rust)
            } else if let weeks = zones.weeks, let week = weeks.last {
                WidgetHeader(title: "Aktivní minuty v zónách", color: Palette.rust, trailing: L10n.tr("tento týden"))
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        NumberText(value: Fmt.int(week.counted), unit: L10n.f("z %@", "150 min"))
                        Text(week.status).font(Typo.caption).foregroundStyle(week.statusColor)
                    }
                    .frame(width: 120, alignment: .leading)
                    ZoneWeekBars(weeks: weeks, height: 52)
                }
                ZoneLegend(week: week)
                // Why 62 + 28 makes 118 (chart review point 12).
                Text("Intenzivní a maximální minuty se počítají dvakrát. WHO doporučuje 150 min týdně.")
                    .font(Typo.tiny).foregroundStyle(Palette.faint)
            } else {
                // An answer from before the weeks were sent.
                WidgetHeader(title: "Čas v tepových zónách", color: Palette.rust, trailing: L10n.tr("4 týdny") + ", " + Fmt.hoursMinutesLong(zones.minutes))
                ZoneBar(parts: parts)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var parts: [(String, Double, Color)] {
        [("Lehká", zones.light, TrainingSnapshot.ZoneWeek.lightColor), ("Střední", zones.moderate, TrainingSnapshot.ZoneWeek.moderateColor),
         ("Intenzivní", zones.vigorous, TrainingSnapshot.ZoneWeek.vigorousColor), ("Maximální", zones.peak, TrainingSnapshot.ZoneWeek.peakColor)]
    }
}

/// The WHO intensity bands in the one zone palette (Palette.Zone): light Z1,
/// moderate Z2, vigorous Z4, peak Z5; and the week's state against WHO.
extension TrainingSnapshot.ZoneWeek {
    static let lightColor = Palette.Zone.color(0)
    static let moderateColor = Palette.Zone.color(1)
    static let vigorousColor = Palette.Zone.color(3)
    static let peakColor = Palette.Zone.color(4)

    /// "splněno" or "chybí 45 min".
    var status: String {
        let left = Self.whoTarget - counted
        return left <= 0 ? L10n.tr("doporučení splněno") : L10n.f("chybí %@ min", Fmt.int(left))
    }

    var statusColor: Color { counted >= Self.whoTarget ? Palette.Status.good : Palette.Status.warn }
}

/// The weeks' active minutes as stacked bars: moderate, then vigorous and peak
/// twice (as WHO counts them). The current week is the last one, highlighted;
/// the 150-minute recommendation is the dashed line, its tag beside the bars.
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
                let w = geo.size.width - tagWidth
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: spacing) {
                        ForEach(weeks.indices, id: \.self) { i in
                            bar(weeks[i], height: h, top: top)
                                .opacity(i == weeks.count - 1 ? 1 : 0.5)
                        }
                    }
                    .frame(width: w)
                    DashedLine()
                        .stroke(Palette.green, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .frame(width: w, height: 1)
                        .offset(y: -h * scaled(target, 0, top))
                    LineTag(name: L10n.tr("cíl"), value: Fmt.int(target), color: Palette.green)
                        .frame(height: 28)
                        .offset(x: w + 6, y: LineTag.center(h * (1 - scaled(target, 0, top)), height: h) - 14)
                        .frame(width: geo.size.width, height: h, alignment: .topLeading)
                }
                .frame(width: geo.size.width, height: h, alignment: .bottomLeading)
            }
            .frame(height: height)
            HStack(spacing: spacing) {
                ForEach(weeks.indices, id: \.self) { i in
                    Text(verbatim: Self.label(weeks[i]))
                        .scaledFont(chartText, weight: i == weeks.count - 1 ? .semibold : .regular, cap: .denseCap)
                        .foregroundStyle(i == weeks.count - 1 ? Palette.ink : Palette.faint)
                        .lineLimit(1)
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.trailing, tagWidth)
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func bar(_ week: TrainingSnapshot.ZoneWeek, height h: CGFloat, top: Double) -> some View {
        if week.counted <= 0 {
            RoundedRectangle(cornerRadius: 2.5).fill(Palette.track).frame(height: 2.5).frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 0) {
                Rectangle().fill(TrainingSnapshot.ZoneWeek.peakColor).frame(height: h * scaled(2 * week.peak, 0, top))
                Rectangle().fill(TrainingSnapshot.ZoneWeek.vigorousColor).frame(height: h * scaled(2 * week.vigorous, 0, top))
                Rectangle().fill(TrainingSnapshot.ZoneWeek.moderateColor).frame(height: h * scaled(week.moderate, 0, top))
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
            item("Střední", week.moderate, TrainingSnapshot.ZoneWeek.moderateColor)
            item("Intenzivní", week.vigorous, TrainingSnapshot.ZoneWeek.vigorousColor)
            item("Maximální", week.peak, TrainingSnapshot.ZoneWeek.peakColor)
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
                        Text(Fmt.int(parts[i].1 / total * 100) + Fmt.percentSign).font(Typo.number(17)).foregroundStyle(Palette.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parts.map { L10n.tr($0.0) + " " + Fmt.int($0.1 / total * 100) + Fmt.percentSign }.joined(separator: ", "))
    }
}
