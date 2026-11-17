import SwiftUI

// MARK: - Plan settings (redesign W, concept 05 "Plan settings")
//
// A sheet over Week plan: the sports per day for this week and the next
// (Auto, Ride, Run, Swim, Gym or Rest), "Rest until Sunday" and "Rest all
// week", the usual time per weekday as seven ink sliders, then the pinned
// Generate workouts. Done saves without replanning (the planned workouts stay
// until Generate); Generate saves and replans today to next Sunday, the
// finished workouts stay (WeekPlanGenerator).

/// One week's choices: the sports per weekday (empty: the coach picks) and the rest days.
struct WeekPlanChoice: Equatable {
    var days: [[String]]
    var rest: Set<Int>

    init(prefs: JSONValue?) {
        days = WeekPlanPrefs.days(prefs).map { Array($0.prefix(2)) }
        rest = Set(WeekPlanPrefs.minutes(prefs).enumerated().filter { $0.element == 0 }.map(\.offset))
    }

    init(days: [[String]], rest: Set<Int>) {
        self.days = days
        self.rest = rest
    }

    /// A tap on a sport of a day: on or off; one or two sports, a third replaces the first.
    mutating func toggle(_ sport: String, day: Int) {
        rest.remove(day)
        var list = days[day]
        if let i = list.firstIndex(of: sport) {
            list.remove(at: i)
        } else {
            list.append(sport)
            if list.count > 2 { list.removeFirst() }
        }
        days[day] = list
    }

    /// Auto: the coach picks the sport from the athlete's sports.
    mutating func auto(_ day: Int) {
        rest.remove(day)
        days[day] = []
    }

    mutating func makeRest(_ day: Int) {
        rest.insert(day)
        days[day] = []
    }

    /// The week's time per day for the server: the rest days 0, the others as before
    /// (a rest day cleared gets the usual time back).
    func minutes(base: [Int], usual: [Int], before: Set<Int>) -> [Int] {
        (0..<7).map { i in
            if rest.contains(i) { return 0 }
            if before.contains(i) { return usual[i] == 0 ? -1 : usual[i] }
            return base[i]
        }
    }
}

struct WeekPlanSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let monday: String
    let today: String
    let calendar: [String: CalendarDay]
    /// Closed: true when Generate was tapped (the plan replans after the save).
    let onClose: (Bool) -> Void

    @State private var loaded = false
    @State private var usualPrefs: JSONValue?
    @State private var weekPrefs: [String: JSONValue?] = [:]
    @State private var choices: [String: WeekPlanChoice] = [:]
    @State private var original: [String: WeekPlanChoice] = [:]
    @State private var usual = Array(repeating: -1, count: 7)
    @State private var usualBefore = Array(repeating: -1, count: 7)
    @State private var saving = false
    @State private var error: String?

    private var nextMonday: String { ISODay.shift(monday, 7) }
    private var weeks: [String] { [monday, nextMonday] }
    private var dirty: Bool { choices != original || usual != usualBefore }
    /// A change of days or rest the planned workouts do not follow until Generate.
    private var conflicting: Bool { choices != original }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScreenBackground(glow: Palette.Glow.training)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    if !loaded && !model.demo {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        sportsCard.padding(.top, 22)
                        timeCard.padding(.top, 14)
                        if conflicting {
                            Text(verbatim: L10n.tr("Naplánované tréninky zůstanou, dokud je nevygeneruješ."))
                                .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 12).padding(.horizontal, 4)
                        }
                        if let error {
                            Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
                                .fixedSize(horizontal: false, vertical: true).padding(.top, 12)
                        }
                    }
                }
                .padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 150)
            }
            generateBar
        }
        .interactiveDismissDisabled(dirty)
        .presentationDragIndicator(.visible)
        .task { await load() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: L10n.tr("Nastavení plánu")).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text(verbatim: L10n.tr("Tvoje sporty, dny a čas")).font(Typo.small).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            CoachEntry(view: "training", companion: ChromeAction(systemImage: "checkmark", label: "Hotovo", enabled: !saving) {
                Task { await close(generate: false) }
            })
        }
    }

    // MARK: Sports

    private var sportsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(verbatim: L10n.tr("Sporty")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            weekSection(monday, title: "Tento týden")
            Rectangle().fill(Palette.hairline).frame(height: 1)
            weekSection(nextMonday, title: "Příští týden")
            Text(verbatim: L10n.tr("Klepni na den a dej mu sport nebo volno. Dny, které necháš prázdné, naplánuje kouč podle tvých sportů a toho, co obvykle děláš."))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    @ViewBuilder private func weekSection(_ week: String, title: String) -> some View {
        let choice = choices[week] ?? WeekPlanChoice(prefs: nil)
        let open = (0..<7).filter { ISODay.shift(week, $0) >= today }
        let allRest = !open.isEmpty && open.allSatisfy { choice.rest.contains($0) }
        HStack(alignment: .firstTextBaseline) {
            SectionLabel(text: title)
            Spacer()
            Button {
                update(week) { c in
                    for i in open { if allRest { c.rest.remove(i) } else { c.makeRest(i) } }
                }
            } label: {
                Text(verbatim: L10n.tr(week == monday ? (allRest ? "Zrušit volné dny" : "Volno do neděle") : (allRest ? "Zrušit volný týden" : "Volno celý týden")))
                    .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12).frame(minHeight: 32)
                    .background(Palette.track, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(open.isEmpty)
        }
        if week == monday, allRest, let first = open.first {
            Text(verbatim: WeekPlanSettingsText.rest(from: ISODay.shift(week, first), today: today))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        VStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                dayRow(week, index: i, choice: choice)
            }
        }
    }

    private func dayRow(_ week: String, index i: Int, choice: WeekPlanChoice) -> some View {
        let date = ISODay.shift(week, i)
        let past = date < today
        return HStack(spacing: 6) {
            VStack(spacing: 0) {
                Text(verbatim: WeekPlanText.dayWord(date, today: today)).scaledFont(10, weight: .medium, cap: .denseCap).foregroundStyle(Palette.muted)
                Text(verbatim: ISODay.day(date)).font(Typo.number(15)).foregroundStyle(Palette.ink)
            }
            .frame(width: 36)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: Fmt.capitalized(Fmt.weekdayName(date)) + " " + Fmt.dayMonth(date)))
            chip(L10n.tr("Auto"), on: choice.days[i].isEmpty && !choice.rest.contains(i), hint: "Sport vybere kouč") {
                update(week) { $0.auto(i) }
            }
            ForEach(WeekPlanPrefs.sports, id: \.self) { sport in
                chip(WeekPlanSport.name(sport), on: choice.days[i].contains(sport), hint: nil) {
                    update(week) { $0.toggle(sport, day: i) }
                }
            }
            chip(L10n.tr("Volno"), on: choice.rest.contains(i), hint: nil) {
                update(week) { $0.makeRest(i) }
            }
        }
        .opacity(past ? 0.4 : 1)
        .disabled(past || saving)
        .accessibilityHint(past ? Text(verbatim: L10n.tr("Minulý den, nejde změnit")) : Text(verbatim: ""))
    }

    private func chip(_ title: String, on: Bool, hint: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title).scaledFont(11, weight: .semibold, cap: .denseCap)
                .lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(on ? Palette.button : Palette.track, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityHint(hint.map { Text(verbatim: L10n.tr($0)) } ?? Text(verbatim: ""))
    }

    private func update(_ week: String, _ change: (inout WeekPlanChoice) -> Void) {
        var c = choices[week] ?? WeekPlanChoice(prefs: nil)
        change(&c)
        withAnimation(.snappy) { choices[week] = c }
    }

    // MARK: Time

    private var timeCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: L10n.tr("Čas na trénink")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: WeekPlanSettingsText.total(usual)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            ForEach(0..<7, id: \.self) { i in
                HStack(spacing: 10) {
                    Text(verbatim: Fmt.weekdayShort(ISODay.shift(monday, i))).scaledFont(12, weight: .medium, cap: .denseCap)
                        .foregroundStyle(Palette.muted).frame(width: 30, alignment: .leading)
                    Slider(value: Binding(get: { Double(max(0, usual[i])) }, set: { usual[i] = Int($0) }), in: 0...360, step: 15)
                        .tint(Palette.ink)
                        .accessibilityLabel(Text(verbatim: FreeTime.weekdayNames[i]))
                        .accessibilityValue(Text(verbatim: WeekPlanSettingsText.day(usual[i])))
                    Text(verbatim: WeekPlanSettingsText.day(usual[i])).font(Typo.number(15)).foregroundStyle(Palette.ink)
                        .frame(width: 54, alignment: .trailing)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
        .disabled(saving)
    }

    // MARK: Generate

    private var generateBar: some View {
        VStack(spacing: 8) {
            Button { Task { await close(generate: true) } } label: {
                Text(verbatim: L10n.tr("Vygenerovat tréninky")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 54)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(saving || model.demo || model.offline)
            Text(verbatim: model.offline ? L10n.tr("Jsi offline. Připoj se a plán se sestaví.")
                 : WeekPlanText.replans(from: today, to: ISODay.shift(nextMonday, 6)) + " " + L10n.tr("Tvoje vlastní úpravy se nahradí."))
                .font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 12)
        .background(Palette.background.opacity(0.94).ignoresSafeArea(edges: .bottom))
    }

    // MARK: Data

    private func load() async {
        guard !loaded else { return }
        guard !model.demo else {
            for w in weeks { choices[w] = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: []) }
            original = choices
            return
        }
        do {
            let usualPlan = try await model.api.weekPlan(start: nil)
            let thisPlan = try await model.api.weekPlan(start: monday)
            let nextPlan = try await model.api.weekPlan(start: nextMonday)
            usualPrefs = usualPlan.prefs
            usual = WeekPlanPrefs.minutes(usualPlan.prefs)
            usualBefore = usual
            weekPrefs = [monday: thisPlan.prefs, nextMonday: nextPlan.prefs]
            choices = [monday: WeekPlanChoice(prefs: thisPlan.prefs), nextMonday: WeekPlanChoice(prefs: nextPlan.prefs)]
            original = choices
            loaded = true
        } catch {
            self.error = error.localizedDescription
            loaded = true
        }
    }

    /// Done saves (no replanning); Generate saves, closes and the plan replans.
    private func close(generate: Bool) async {
        guard dirty, !model.demo else {
            dismiss()
            onClose(generate && !model.demo)
            return
        }
        saving = true
        defer { saving = false }
        do {
            if usual != usualBefore {
                let days = WeekPlanPrefs.days(usualPrefs)
                try await model.api.saveWeekPlan(start: nil, prefs: WeekPlanPrefs.edited(usualPrefs, minutes: usual, days: days,
                                                                                         weeklyActivities: WeekPlanPrefs.weeklyActivities(usualPrefs)))
            }
            for week in weeks {
                guard let choice = choices[week], choice != original[week] || usual != usualBefore else { continue }
                let prefs = weekPrefs[week] ?? nil
                // A week without its own plan follows the usual week, the new time included.
                let base = WeekPlanPrefs.source(prefs) == "week" ? WeekPlanPrefs.minutes(prefs) : usual
                let before = (original[week]?.rest ?? []).subtracting(choice.rest)
                // Nothing of its own: the week stays on the usual one.
                if choice == original[week], WeekPlanPrefs.source(prefs) != "week" { continue }
                let minutes = choice.minutes(base: base, usual: usual, before: before)
                try await model.api.saveWeekPlan(start: week, prefs: WeekPlanPrefs.edited(prefs, minutes: minutes, days: choice.days,
                                                                                         weeklyActivities: WeekPlanPrefs.weeklyActivities(prefs)))
            }
            error = nil
            dismiss()
            onClose(generate)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Plan settings' sentences, for the tests.
enum WeekPlanSettingsText {
    /// "1 h 30", "Off", "6 h+", "–" while not set.
    static func day(_ minutes: Int) -> String {
        if minutes < 0 { return "–" }
        if minutes == 0 { return L10n.tr("Volno") }
        return planDuration(minutes) + (minutes >= 360 ? "+" : "")
    }

    /// "8 h 15 a week".
    static func total(_ minutes: [Int]) -> String {
        L10n.f("%@ týdně", planDuration(minutes.reduce(0) { $0 + max(0, $1) }))
    }

    /// Whether the rest starts today: "Rest from today to Sunday." / "Rest from tomorrow to Sunday."
    static func rest(from date: String, today: String) -> String {
        if date == today { return L10n.tr("Volno od dneška do neděle.") }
        if date == ISODay.shift(today, 1) { return L10n.tr("Volno od zítřka do neděle.") }
        return L10n.f("Volno od %@ do neděle.", Fmt.dayMonthShort(date))
    }
}

// MARK: - Generate, add and change a workout

/// The client side of the plan's changes; the server has no replan of its own:
/// the planned workouts ahead go, the week's proposal (rules, no AI cost) is
/// built and saved as the old week planner saved it.
enum WeekPlanGenerator {
    /// Replans each week from today on; finished workouts stay. False when a week failed.
    @MainActor
    static func replan(_ model: AppModel, weeks: [String], today: String, calendar: [String: CalendarDay]) async -> Bool {
        var ok = true
        for week in weeks {
            do {
                for date in ISODay.range(max(week, today), ISODay.shift(week, 6)) {
                    for a in calendar[date]?.activities ?? [] where a.status == "planned" {
                        if let eventId = a.eventId {
                            try await model.api.deletePlanned(eventId: eventId)
                        } else if a.sport == "strength" {
                            try await model.api.discardGym(date: date)
                        }
                    }
                }
                let r = try await model.api.weekProposal(start: week)
                let bricks = WeekPlanPrefs.bricks(r.proposal?.prefs)
                var drafts = (r.proposal?.items ?? []).filter { $0.date >= today }.map { item -> WeekSessionDraft in
                    let sport = item.sport == "strength" ? "gym" : item.sport
                    return WeekSessionDraft(date: item.date, sport: sport, minutes: item.minutes ?? WeekPlanSport.usualMinutes(sport),
                                            environment: sport == "gym" ? nil : item.environment ?? "outdoor",
                                            label: item.label, reason: item.reason, role: item.role)
                }
                for i in drafts.indices where drafts[i].sport == "run" && bricks.contains(ISODay.weekdayIndex(drafts[i].date)) {
                    let date = drafts[i].date
                    let ride = drafts.contains { $0.sport == "ride" && $0.date == date }
                    drafts[i].brick = ride
                }
                for i in drafts.indices {
                    let id = drafts[i].id
                    let built = await drafts[i].building(model.api, others: drafts.filter { $0.id != id })
                    drafts[i] = built
                }
                if try await save(model, drafts) == false { ok = false }
            } catch {
                ok = false
            }
        }
        return ok
    }

    /// Saves the built workouts in order: a brick run joins the day's ride, a
    /// race leg the one before. False when one did not build or save.
    @MainActor
    static func save(_ model: AppModel, _ drafts: [WeekSessionDraft]) async throws -> Bool {
        var rides: [String: String] = [:]
        var raceLegs: [String: String] = [:]
        var ok = true
        for s in drafts {
            guard s.status == .ready else { ok = false; continue }
            do {
                if s.sport == "stretch" {
                    try await model.api.addStretching(date: s.date)
                } else if let gym = s.gym {
                    guard let draftId = gym.draftId else { ok = false; continue }
                    try await model.api.confirmGym(draftId: draftId, rows: gym.rows)
                } else if let w = s.workout {
                    let raceLeg = s.role == "race" ? raceLegs[s.date] : nil
                    let event = try await model.api.scheduleWorkout(id: w.id, date: s.date, indoor: s.environment == "indoor",
                                                                    time: s.brick || raceLeg != nil ? nil : s.time)
                    if s.sport == "ride", let event { rides[s.date] = event }
                    if s.role == "race", let event { raceLegs[s.date] = event }
                    if s.brick, let event, let ride = rides[s.date] { try await model.api.linkPlanned(eventId: event, after: ride) }
                    if s.role == "race", let event, let raceLeg { try await model.api.linkPlanned(eventId: event, after: raceLeg) }
                }
            } catch {
                ok = false
            }
        }
        return ok
    }

    /// "Add workout": one workout of the sport on the day, as long as the day's time allows.
    @MainActor
    static func add(_ model: AppModel, sport: String, date: String, available: Int) async throws {
        let minutes = available > 0 ? min(available, WeekPlanSport.maxMinutes(sport)) : WeekPlanSport.usualMinutes(sport)
        let draft = await WeekSessionDraft(date: date, sport: sport, minutes: max(minutes, WeekPlanSport.minMinutes(sport)),
                                           environment: sport == "gym" ? nil : "outdoor").building(model.api)
        if case .failed(let message) = draft.status { throw APIError.message(message) }
        if try await save(model, [draft]) == false { throw APIError.message(L10n.tr("Trénink se nepodařilo sestavit.")) }
    }

    /// A new length: the same workout (library) at the length, on the same day
    /// and time, then the old one goes; a gym plan is built again at the length.
    @MainActor
    static func resize(_ model: AppModel, _ a: CalendarActivity, minutes: Int) async throws {
        if a.sport == "strength" && a.eventId == nil {
            let gym = try await model.api.previewGym(date: a.date, minutes: minutes, focus: nil, muscles: [], fromWeek: true)
            guard let draftId = gym.draftId else { throw APIError.message(L10n.tr("Trénink se nepodařilo sestavit.")) }
            try await model.api.confirmGym(draftId: draftId, rows: gym.rows)
            return
        }
        guard let eventId = a.eventId else { return }
        let planned = try await model.api.plannedWorkout(eventId: eventId)
        let libraryId: String? = {
            switch planned.workout.id {
            case .string(let s)?: return s
            case .number(let n)?: return String(Int(n))
            default: return nil
            }
        }()
        let sport = a.sport == "strength" ? "gym" : a.sport
        let environment = planned.workout.environment ?? "outdoor"
        let r = try await model.api.generateWeekSession(date: a.date, sport: sport, minutes: minutes, environment: environment,
                                                        focus: nil, resize: libraryId)
        guard let w = r.workout else { throw APIError.message(r.message ?? L10n.tr("Bez návrhu.")) }
        _ = try await model.api.scheduleWorkout(id: w.id, date: a.date, indoor: environment == "indoor", time: a.time)
        try await model.api.deletePlanned(eventId: eventId)
    }
}
