import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var model
    var openSettings: () -> Void = {}
    var openCoach: () -> Void = {}
    /// Sdílet: the day, a workout or the day's food as an image.
    @State private var sharing = false

    var body: some View {
        NavigationStack(path: model.path(.today)) {
            screen
                .toolbar(.hidden, for: .navigationBar)
                .appRoutes()
        }
        .journalMorningPrompt()
    }

    private var screen: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            if let today = model.today {
                PageScroll {
                    TodayContent(today: today, openSettings: openSettings, openCoach: openCoach, openShare: { sharing = true })
                        .padding(.bottom, 100)
                }
                .refreshable { await model.refresh(announce: true) }
                .tabTopBar {
                    DayBar(date: today.date)
                    Spacer(minLength: 0)
                    ChromeButton(systemImage: "square.and.arrow.up", label: "Sdílet") { sharing = true }
                    ChromeButton(systemImage: "bubble.left.and.text.bubble.right", label: "Kouč", action: openCoach)
                    Button(action: openSettings) { AvatarView(size: 36) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Profil a nastavení")
                }
            } else if let message = model.errorMessage {
                VStack(spacing: 16) {
                    Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                    Button("Zkusit znovu") { Task { await model.refresh() } }.font(Typo.bodyStrong)
                }
                .padding(32)
            } else {
                ProgressView()
            }
        }
        .task {
            await model.refreshIfStale(.today)
            await DeviceLocation.refreshIfFollowing(model)
        }
        .sheet(isPresented: $sharing) {
            if let today = model.today { ShareSheet(source: .today(today)) }
        }
    }
}

/// The Today screen without the scroll view, so tests can render it whole.
struct TodayContent: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot
    var openSettings: () -> Void = {}
    var openCoach: () -> Void = {}
    var openShare: () -> Void = {}
    /// The account's first letter on the settings button (GET /app/api/me).

    /// "Upravit přehled": the cards below wiggle and can be moved, removed and added.
    @State private var editing = false
    /// A neighbouring day drawn beside this one during a swipe (DayPager.swift).
    @Environment(\.dayPage) private var page
    private var selectedDate: String? { page.map(\.selectedDate) ?? model.selectedDate }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                header
            }

            WidgetBoard(panel: .today,
                        data: WidgetData(panel: .today, today: today, health: page.map(\.health) ?? model.health, training: model.training, food: page.map(\.food) ?? model.food),
                        editing: $editing,
                        editTitle: "Upravit přehled")
                .padding(.top, editing ? 0 : 28)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .daySwipe(date: today.date, enabled: !editing) { page in page.today.map { AnyView(TodayContent(today: $0)) } }
    }

    /// Everything above the widgets: the day, readiness, weather and the coach.
    @ViewBuilder private var header: some View {
        // B3 (Petr, 2026-10-15): the month as the title and the week below it.
        HStack(spacing: 10) {
            Text(verbatim: Fmt.monthTitle(today.date))
                .font(Typo.sentence(30, relativeTo: .title))
                .foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if selectedDate != nil {
                Button { Task { await model.showToday() } } label: {
                    Label("Dnes", systemImage: "arrow.uturn.backward").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10).frame(height: 30)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            CircleButton(systemImage: "square.and.arrow.up", label: "Sdílet", action: openShare)
            CircleButton(systemImage: "bubble.left.and.text.bubble.right", label: L10n.tr("Kouč"), action: openCoach)
            Button(action: openSettings) { AvatarView(size: 36) }
                .buttonStyle(.plain)
            .accessibilityLabel("Profil a nastavení")
        }
        WeekStrip(date: today.date, week: today.week).padding(.top, 14)

        if selectedDate == nil && !model.demo {
            DataAgePill()
            ConnectionProblemCard()
        }

        RouteLink(route: .readiness) {
            ReadinessHero(readiness: today.readiness, nightMissing: today.sleep == nil, isToday: today.steps.hour != nil)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .padding(.top, 40)

        // Today's weather at the week plan's place (or the offer to set
        // it) with the athlete's status, above the key numbers.
        if selectedDate == nil {
            TodayWeatherCard(weather: today.weather).padding(.top, 28)
        }

        KeyNumbers(today: today)
            .padding(.top, selectedDate == nil ? 12 : 28)

        // Cycle tracking under the numbers it explains: the morning question,
        // the day's bleeding, or perimenopause and menopause symptoms; on a
        // past day what was logged that day, tap to change it.
        if let cycle = today.cycle, TodayCycleCard.shows(cycle, past: selectedDate != nil) {
            TodayCycleCard(cycle: cycle, date: today.date, past: selectedDate != nil).padding(.top, 12)
        }
        // Aktivita dne: the day's activity from anything (CoachPick.swift).
        if selectedDate == nil { CoachPickCard().padding(.top, 16) }

        if selectedDate == nil {
            if let plan = today.trainingPlan {
                Label(([plan.name, plan.paused == true ? L10n.tr("pozastaveno") : L10n.f("týden %@/%@", String(plan.week), String(plan.weeksCount))] + (plan.paused == true ? [] : plan.phaseLabel.map { [$0] } ?? [])).joined(separator: " · "), systemImage: "flag")
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                    .padding(.top, 24)
            }
            if today.trainingPlan?.paused == true {
                PlanPausedCard().padding(.top, 10)
            } else if let proposal = today.trainingPlan?.proposal {
                PlanProposalCard(proposal: proposal).padding(.top, 10).id(proposal.type + proposal.text)
            }
            CoachCheckInCard(openCoach: openCoach).padding(.top, today.trainingPlan == nil ? 24 : 10)
            WeekRevisionCard().padding(.top, 12)
            ThresholdCheckCard().padding(.top, 12)
        }

        CoachTextCard(screen: "today", fallbackText: today.summary?.text, fallbackAdvice: today.summary?.recommendation, live: selectedDate == nil,
                      tip: RecoveryTipRows.hasTip(today, selectedDate: selectedDate) ? AnyView(RecoveryTipRows(today: today)) : nil)
            .padding(.top, 32)
    }
}

/// When the day changes, the new one slides in from its side (a later day
/// from the right) and fades in.
private struct DaySlide: ViewModifier {
    let date: String
    @State private var shift: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .offset(x: shift)
            .opacity(1 - Double(min(abs(shift) / 40, 1)) * 0.85)
            .onChange(of: date) { old, new in
                shift = new > old ? 40 : -40
                // After this frame, so the move starts from the side.
                Task { @MainActor in withAnimation(.snappy(duration: 0.3)) { shift = 0 } }
            }
    }
}

extension View {
    func daySlide(date: String) -> some View {
        modifier(DaySlide(date: date))
    }
}

/// "data ze včera 21:10 · obnovit" under the day when Apple Health last
/// reached the server more than 3 hours ago; nothing while it is fresh.
/// A tap syncs and reloads Today.
struct DataAgePill: View {
    @Environment(AppModel.self) private var model
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 300)) { context in
            if health.enabled, let last = health.lastSync, let text = Self.text(last: last, now: context.date) {
                Button { Task { await model.refresh() } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                        Text(verbatim: text + L10n.tr(" · obnovit"))
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Palette.amber)
                    .padding(.horizontal, 10)
                    .frame(height: 26)
                    .background(Palette.amberSoft, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(model.loading || health.syncing)
                // Under the day's name, past its back arrow.
                .padding(.leading, 34)
                .padding(.top, 2)
            }
        }
    }

    /// "data z 6:42", "data ze včera 21:10" or "data z 9. 10. 21:10" once the
    /// last sync is over 3 hours old; nil before.
    static func text(last: Date, now: Date, calendar: Calendar = .current) -> String? {
        guard now.timeIntervalSince(last) > 3 * 3600 else { return nil }
        let time = ClockText.format(last)
        if calendar.isDate(last, inSameDayAs: now) { return L10n.f("data z %@", time) }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(last, inSameDayAs: yesterday) {
            return L10n.f("data ze včera %@", time)
        }
        let day = DateFormatters.make(L10n.isEnglish ? "MMM d" : "d. M.", locale: Fmt.locale, timeZone: calendar.timeZone)
        return L10n.f("data z %@", day.string(from: last) + " " + time)
    }
}

/// Today's week, Monday to Sunday: a dot in the readiness colour under every
/// day up to the shown one, today filled, an earlier day picked with a ring in
/// its colour. A tap opens that day; later days are faint and do nothing.
struct WeekStrip: View {
    @Environment(AppModel.self) private var model
    let date: String
    let week: [TodaySnapshot.WeekDay]?

    private var today: String { AppModel.localDate(Date()) }

    /// The server's week, or Monday to Sunday without zones (an older server).
    private var days: [TodaySnapshot.WeekDay] {
        if let week, week.count == 7 { return week }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parser = DateFormatters.iso(timeZone: calendar.timeZone)
        let weekday = parser.date(from: date).map { (calendar.component(.weekday, from: $0) + 5) % 7 } ?? 0
        let monday = AppModel.shift(date, by: -weekday) ?? date
        return (0..<7).map { TodaySnapshot.WeekDay(date: AppModel.shift(monday, by: $0) ?? monday, zone: nil) }
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(days, id: \.date) { day in
                Button { Task { await model.showDate(day.date) } } label: { cell(day) }
                    .buttonStyle(.plain)
                    .disabled(day.date > today || model.demo || model.loading)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, -6)
    }

    private func cell(_ day: TodaySnapshot.WeekDay) -> some View {
        let isToday = day.date == today, selected = day.date == date, future = day.date > today
        let color = ReadinessText.pill(day.zone)?.1
        return VStack(spacing: 5) {
            Text(verbatim: Fmt.weekdayShort(day.date)).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.muted)
            ZStack {
                if isToday && selected {
                    Circle().fill(Palette.ink)
                } else if selected {
                    Circle().stroke(color ?? Palette.ink.opacity(0.5), lineWidth: 2)
                } else if isToday {
                    Circle().stroke(Palette.ink.opacity(0.3), lineWidth: 1.5)
                }
                Text(verbatim: Fmt.dayNumber(day.date))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(isToday && selected ? Palette.background : selected ? (color ?? Palette.ink) : future ? Palette.faint : Palette.ink)
            }
            .frame(width: 38, height: 38)
            Circle().fill(color ?? .clear).frame(width: 5, height: 5)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.dayMonth(day.date))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "‹ Dnes" over "středa 14. října": the day as the screen's title, a day
/// back and a day forward (not past today; Food goes two weeks ahead for
/// planned and copied meals). Scrolled down, DayBar keeps the day on top.
struct DayNavigator: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var page
    let date: String
    var ahead = false

    private var today: String { AppModel.localDate(Date()) }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Button { Task { await model.showDay(offset: -1) } } label: {
                    Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold)).frame(width: 28, height: 36)
                }
                .foregroundStyle(Palette.muted)
                .accessibilityLabel("Předchozí den")
                Text(verbatim: Fmt.dayTitle(date, today: today))
                    .font(Typo.sentence(30, relativeTo: .title))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                if Self.canGoForward(model: model, date: date, ahead: ahead) {
                    Button { Task { await model.showDay(offset: 1, ahead: ahead) } } label: {
                        Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).frame(width: 28, height: 36)
                    }
                    .foregroundStyle(Palette.muted)
                    .accessibilityLabel("Další den")
                }
                if (page.map(\.selectedDate) ?? model.selectedDate) != nil {
                    Button { Task { await model.showToday() } } label: {
                        Text("Dnes").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 10).frame(height: 28)
                            .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                    }
                    .padding(.leading, 4)
                }
            }
            Text(verbatim: Fmt.daySubtitle(date, today: today))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Palette.muted)
                .padding(.leading, 34)
        }
        .disabled(model.demo || model.loading)
    }

    static func canGoForward(model: AppModel, date: String, ahead: Bool) -> Bool {
        guard ahead else { return model.selectedDate != nil }
        let last = AppModel.shift(AppModel.localDate(Date()), by: AppModel.foodDaysAhead) ?? date
        return date < last
    }
}

/// The day in the pinned glass bar of Dnes, Zdraví and Jídlo once their
/// header has scrolled away: "‹ Dnes · st 14. 10. ›", and an earlier (or
/// later) day tinted, with "Dnes" next to it.
struct DayBar: View {
    @Environment(AppModel.self) private var model
    let date: String
    var ahead = false

    var body: some View {
        DayCapsule(date: date, today: AppModel.localDate(Date()),
                   canGoForward: DayNavigator.canGoForward(model: model, date: date, ahead: ahead),
                   move: { offset in Task { await model.showDay(offset: offset, ahead: ahead) } },
                   showToday: { Task { await model.showToday() } })
            .disabled(model.demo || model.loading)
    }
}

/// The glass "‹ Po 12. 10. ›" of the tabs' pinned bars, with "Dnes" next to
/// it on another day (DayBar, and the calendar's day on Trénink).
struct DayCapsule: View {
    @Environment(AppModel.self) private var model
    let date: String
    let today: String
    var canGoForward = true
    let move: (Int) -> Void
    let showToday: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 0) {
                Button { move(-1) } label: {
                    Image(systemName: "chevron.left").frame(width: 30, height: 40).contentShape(Rectangle())
                }
                .accessibilityLabel("Předchozí den")
                Text(verbatim: Fmt.dayShort(date, today: today))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Button { move(1) } label: {
                    Image(systemName: "chevron.right").frame(width: 30, height: 40).contentShape(Rectangle())
                }
                .opacity(canGoForward ? 1 : 0.25)
                .disabled(!canGoForward)
                .accessibilityLabel("Další den")
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Palette.muted)
            .buttonStyle(.plain)
            .padding(.horizontal, 2)
            .background(date == today ? Color.clear : Palette.amberSoft.opacity(0.85), in: Capsule())
            .chromeGlass(in: Capsule())
            .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
            if date != today {
                ChromeButton(systemImage: "calendar", label: "Dnes", text: "Dnes", action: showToday)
            }
        }
        // While the sync pill shows (RootView), it takes the day's place.
        .opacity(model.syncStatus == nil ? 1 : 0)
    }
}

struct ReadinessHero: View {
    let readiness: TodaySnapshot.Readiness
    var nightMissing = false
    var isToday = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Připravenost").font(Typo.body).foregroundStyle(Palette.muted)
            if let score = readiness.score {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(String(score))
                        .font(Typo.number(132)).lineLimit(1).minimumScaleFactor(0.5)
                        .foregroundStyle(Palette.ink)
                    if let pill = pill {
                        Pill(text: pill.text, foreground: pill.fg, background: pill.bg)
                    }
                }
                if readiness.provisional == true {
                    Text(provisionalLine)
                        .font(Typo.small).foregroundStyle(Palette.muted)
                }
            } else {
                Text(nightMissing && isToday ? "Čeká na dnešní noc" : "Zatím bez čísla")
                    .font(Typo.sentence(34, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 8)
                Text(nightMissing && isToday
                     ? "Ukáže se, až hodinky nahrají dnešní spánek. Předchozí den najdeš šipkou vlevo nahoře."
                     : "Připravenost potřebuje aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Why the number may still move: a new data source without 14 days of its own.
    private var provisionalLine: String {
        if let days = readiness.provisionalDays, days > 0 {
            return L10n.f("Orientační: nový zdroj dat, zpřesní se za %@.", String(days) + " " + Fmt.plural(days, "den", "dny", "dní"))
        }
        return L10n.tr("Orientační: nový zdroj dat, číslo se ještě zpřesní.")
    }

    private var pill: (text: String, fg: Color, bg: Color)? {
        switch readiness.zone {
        case "green": return ("vysoká", Palette.green, Palette.greenSoft)
        case "yellow": return ("střední", Palette.amber, Palette.amberSoft)
        case "red": return ("nízká", Palette.rust, Palette.rust.opacity(0.14))
        default: return nil
        }
    }
}

/// "Jak se dnes cítíš?" under the readiness: one tap (src/morning-checkin.js).
/// The answer can only lower the readiness, for Today and the coach alike.
/// Tapping the chosen one again clears it; "Nemocný" offers the status Nemoc.
/// On Today it goes away once answered; the readiness detail keeps it, so the
/// answer can be changed there.
struct MorningCheckinCard: View {
    @Environment(AppModel.self) private var model
    let feeling: String?
    var keepAnswered = false
    var top: CGFloat = 0
    @State private var chosen: String?
    @State private var saving = false
    @State private var offerSick = false
    @State private var answers = 0

    init(feeling: String?, keepAnswered: Bool = false, top: CGFloat = 0) {
        self.feeling = feeling
        self.keepAnswered = keepAnswered
        self.top = top
        _chosen = State(initialValue: feeling)
    }

    struct Option: Identifiable {
        let id: String
        let symbol: String
        let label: String
    }

    static let options: [Option] = [
        Option(id: "fresh", symbol: "⚡️", label: "Svěží"),
        Option(id: "normal", symbol: "🙂", label: "Normál"),
        Option(id: "tired", symbol: "🥱", label: "Unavený"),
        Option(id: "sick", symbol: "🤒", label: "Nemocný")
    ]

    var body: some View {
        if keepAnswered || chosen == nil || saving || offerSick {
            card.padding(.top, top)
        } else {
            // Holds onChange while the card is gone, so clearing the answer
            // elsewhere brings it back.
            Color.clear.frame(height: 0)
                .onChange(of: feeling) { _, new in chosen = new }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Jak se dnes cítíš?").font(Typo.small).foregroundStyle(Palette.muted)
            HStack(spacing: 8) {
                ForEach(Self.options) { (option: Option) in
                    let on: Bool = chosen == option.id
                    Button { Task { await choose(on ? nil : option.id) } } label: {
                        VStack(spacing: 4) {
                            Text(verbatim: option.symbol).font(.system(size: 22))
                            Text(L10n.tr(option.label)).font(.footnote.weight(.semibold))
                                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity).frame(height: 60)
                        .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        .onChange(of: feeling) { _, new in chosen = new }
        .sensoryFeedback(.impact(weight: .light), trigger: answers)
        .alert("Přepnout stav na Nemoc?", isPresented: $offerSick) {
            Button("Přepnout") { Task { try? await model.setAthleteStatus("sick", until: nil, note: nil) } }
            Button("Teď ne", role: .cancel) {}
        } message: {
            Text("Kouč do té doby nebude plánovat trénink.")
        }
    }

    private func choose(_ id: String?) async {
        let before = chosen
        chosen = id
        saving = true
        answers += 1
        defer { saving = false }
        do {
            try await model.setMorningCheckin(id)
            if id == "sick", model.athleteStatus?.status != "sick" { offerSick = true }
        } catch {
            chosen = before
            model.notice = error.localizedDescription
        }
    }
}

/// Sleep · Strain · HRV under the readiness number, each on a range bar:
/// sleep against the night's need, the strain against today's goal, the HRV
/// against the athlete's usual range.
struct KeyNumbers: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot

    var body: some View {
        HStack(spacing: 0) {
            RouteLink(route: .sleep) { cell("Spánek", Fmt.hoursMinutes(today.sleep?.minutes), nil, sleep) }
            Divider().overlay(Palette.hairline)
            RouteLink(route: .strain) { cell("Námaha", Fmt.decimal(today.strain.score), nil, strain) }
            Divider().overlay(Palette.hairline)
            RouteLink(route: .metric(.hrv)) { cell("HRV", Fmt.int(today.hrv?.value), "ms", hrv) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
    }

    /// A cell's bar (when it has a range) and the line under it.
    struct Gauge {
        var bar: (value: Double, low: Double, high: Double)?
        var note: String?
        var color: Color
    }

    /// The night against its need: the band is half an hour either side of it.
    private var sleep: Gauge {
        guard let minutes = today.sleep?.minutes else { return Gauge(note: nil, color: Palette.indigo) }
        guard let need = today.sleep?.need, need > 0 else {
            return Gauge(note: today.sleep?.index.map { L10n.f("index %@", "\($0)") }, color: Palette.indigo)
        }
        let low = Double(need) - 30, high = Double(need) + 30
        return Gauge(bar: (minutes, low, high),
                     note: L10n.f("%@ %% potřeby", Fmt.int(minutes / Double(need) * 100)),
                     color: minutes >= low ? Palette.green : Palette.amber)
    }

    private var strain: Gauge {
        if let t = today.strain.target {
            // Whole numbers: "cíl 10,8–13,8" does not fit a third of the phone's width.
            let note = L10n.f("cíl %@–%@", Fmt.int(t.low), Fmt.int(t.high))
            guard let score = today.strain.score else { return Gauge(note: note, color: Palette.green) }
            return Gauge(bar: (score, t.low, t.high), note: note,
                         color: RangeBar.side(score, t.low, t.high) == 0 ? Palette.green : Palette.amber)
        }
        return Gauge(note: today.strain.planned.map { L10n.f("plán ~%@", Fmt.decimal($0)) }, color: Palette.amber)
    }

    private var hrv: Gauge {
        guard let value = today.hrv?.value else { return Gauge(note: nil, color: Palette.green) }
        if let low = today.hrv?.low, let high = today.hrv?.high, high > low {
            return Gauge(bar: (value, low, high), note: RangeBar.word(value, low, high),
                         color: RangeBar.color(value, low, high, worseAbove: false))
        }
        guard let base = today.hrv?.baseline else { return Gauge(note: nil, color: Palette.green) }
        let d = (value - base).rounded()
        return Gauge(note: (d >= 0 ? "↑ " : "↓ ") + Fmt.int(abs(d)) + " ms", color: d >= 0 ? Palette.green : Palette.rust)
    }

    private func cell(_ title: String, _ value: String, _ unit: String?, _ gauge: Gauge) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(Typo.number(30)).foregroundStyle(Palette.ink)
                if let unit, value != "–" { Text(unit).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            if let bar = gauge.bar {
                RangeBar(value: bar.value, low: bar.low, high: bar.high, color: gauge.color).padding(.vertical, 4)
            }
            Text(gauge.note ?? " ").font(Typo.caption.weight(.medium)).foregroundStyle(gauge.color).lineLimit(1).minimumScaleFactor(0.75)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A whole card that opens another tab (Jídlo on Today).
struct TabLinkCard<Label: View>: View {
    @Environment(AppModel.self) private var model
    let tab: AppTab
    @ViewBuilder var label: Label

    var body: some View {
        Button { model.tab = tab } label: { label }
            .buttonStyle(PressableCardStyle())
    }
}

/// "Plán dne" without a bedtime: no alarm and no recorded nights yet.
struct BedtimeSetupCard: View {
    var body: some View {
        Card {
            HStack(spacing: 12) {
                Image(systemName: "moon.zzz").font(.system(size: 20)).foregroundStyle(Palette.indigo)
                Text("Kdy jít spát?").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
    }
}

// MARK: - Connections

/// A data source that stopped working (Google or Intervals.icu refused the
/// stored access, or Google permissions are missing), with a way to connect
/// it again right here. The problems come with Today; after connecting here
/// the card asks the connections itself until Today loads again.
struct ConnectionProblemCard: View {
    @Environment(AppModel.self) private var model
    @State private var checked: [ConnectionsResponse.Provider]?
    @State private var connecting: ConnectTarget?

    private var problems: [ConnectionsResponse.Provider] {
        checked ?? (model.today?.connectionProblems ?? []).map(\.asProvider)
    }

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if !problems.isEmpty {
                Card {
                    WidgetHeader(title: "Propojení", color: Palette.rust)
                    ForEach(problems) { provider in
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 16)).foregroundStyle(Palette.rust)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(provider.name ?? provider.id).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                if let problem = provider.problemText {
                                    Text(problem).font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                            }
                            Spacer(minLength: 8)
                            Button { start(provider.id) } label: {
                                Text("Připojit znovu")
                                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                                .padding(.horizontal, 14).frame(height: 34)
                                .background(Palette.button, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 20)
            }
        }
        .onChange(of: model.todayRevision) { checked = nil }
        .sheet(item: $connecting) { target in ServiceConnectSheet(target: target) { await load() } }
    }

    private func load() async {
        guard !model.demo, let response = try? await model.api.connections() else { return }
        withAnimation { checked = response.providers.filter(\.needsAttention) }
    }

    /// The service's connect screen (ServiceConnectSheet), the same as in Zdroje dat.
    private func start(_ provider: String) {
        connecting = ConnectTarget(id: provider)
    }
}
