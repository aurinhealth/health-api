import SwiftUI

// MARK: - Plan settings (redesign W, concept 05 "Plan settings")
//
// A sheet over Week plan: the sports per day for this week and the next
// (Auto, Ride, Run, Swim, Gym or Rest), "Rest until Sunday" and "Rest all
// week", the usual time per weekday as seven ink sliders, then the pinned
// Generate workouts. Done saves without replanning (the planned workouts stay
// until Generate); Generate saves and plans again only the days changed (the
// other planned workouts stay, Petr 2026-11-25), or with nothing changed
// today to next Sunday; the finished workouts stay (WeekPlanGenerator).

/// One week's choices: the sports per weekday (empty: the coach picks) and the rest days.
struct WeekPlanChoice: Equatable {
    var days: [[String]]
    var rest: Set<Int>

    init(prefs: JSONValue?) {
        days = WeekPlanPrefs.days(prefs)
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
            while list.count > 2 { list.removeFirst() }
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
    /// Closed: nil for Done; with Generate the days to plan again (after the save),
    /// empty for the whole plan from today.
    let onClose: ([String]?) -> Void

    @State private var loaded = false
    @State private var usualPrefs: JSONValue?
    @State private var weekPrefs: [String: JSONValue?] = [:]
    @State private var choices: [String: WeekPlanChoice] = [:]
    @State private var original: [String: WeekPlanChoice] = [:]
    @State private var usual = Array(repeating: -1, count: 7)
    @State private var usualBefore = Array(repeating: -1, count: 7)
    @State private var saving = false
    @State private var error: String?
    /// The day the tiles under the weeks set.
    @State private var selected: String?
    /// The settings did not load: no cards, Try again (nothing to save over).
    @State private var failed = false
    /// Generate asks first while planned workouts would go (606: it replaced own changes without a word).
    @State private var confirmGenerate = false

    private var nextMonday: String { ISODay.shift(monday, 7) }
    private var weeks: [String] { [monday, nextMonday] }
    private var dirty: Bool { choices != original || usual != usualBefore }
    /// A change of days or rest the planned workouts do not follow until Generate.
    private var conflicting: Bool { choices != original }
    /// Generate plans again only the days whose sports, rest or usual time changed;
    /// a workout on a day left as it was stays (Petr 2026-11-24: a gym added for
    /// today went when he set the days from Wednesday). Empty: the whole plan.
    private var changedDays: [String] {
        WeekPlanGenerator.changedDays(weeks: weeks, today: today, choices: choices, original: original,
                                      usual: usual, usualBefore: usualBefore)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScreenBackground(glow: Palette.Glow.training)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    if !loaded && !model.demo {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if failed {
                        VStack(spacing: 12) {
                            Text(verbatim: error ?? L10n.tr("Nastavení se nepodařilo načíst.")).font(Typo.body).foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                            Button { Task { loaded = false; failed = false; await load() } } label: {
                                Text(verbatim: L10n.tr("Zkusit znovu")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                    .padding(.horizontal, 16).frame(minHeight: 44)
                                    .background(Palette.track, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity).padding(.top, 40)
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

    /// Concept 027/028: per week a row of seven day discs (dashed: the coach
    /// picks, a sport's disc, grey with a dot: rest); a tap selects the day and
    /// the six tiles under the weeks set it.
    private var sportsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: L10n.tr("Sporty")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(verbatim: restLine ?? L10n.tr("Vybere je kouč")).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 4)
            VStack(alignment: .leading, spacing: 14) {
                weekSection(monday, title: "Tento týden")
                weekSection(nextMonday, title: "Příští týden")
                if let selected {
                    dayPicker(selected)
                } else {
                    Text(verbatim: L10n.tr("Klepni na den a dej mu sport nebo volno. Dny, které necháš prázdné, naplánuje kouč podle tvých sportů a toho, co obvykle děláš."))
                        .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .cardSurface(cornerRadius: 22)
        }
    }

    /// "Rest from today to Sunday." while this week rests to its end.
    private var restLine: String? {
        let choice = choices[monday] ?? WeekPlanChoice(prefs: nil)
        let open = (0..<7).filter { ISODay.shift(monday, $0) >= today }
        guard let first = open.first, open.allSatisfy({ choice.rest.contains($0) }) else { return nil }
        return WeekPlanSettingsText.rest(from: ISODay.shift(monday, first), today: today)
    }

    @ViewBuilder private func weekSection(_ week: String, title: String) -> some View {
        let choice = choices[week] ?? WeekPlanChoice(prefs: nil)
        let open = (0..<7).filter { ISODay.shift(week, $0) >= today }
        let allRest = !open.isEmpty && open.allSatisfy { choice.rest.contains($0) }
        VStack(alignment: .leading, spacing: 8) {
            HStack {
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
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(open.isEmpty || saving)
            }
            HStack(spacing: 2) {
                ForEach(0..<7, id: \.self) { i in dayCell(week, index: i, choice: choice) }
            }
        }
    }

    private func dayCell(_ week: String, index i: Int, choice: WeekPlanChoice) -> some View {
        let date = ISODay.shift(week, i)
        let past = date < today
        let on = selected == date
        return Button { withAnimation(.snappy) { selected = on ? nil : date } } label: {
            VStack(spacing: 5) {
                Text(verbatim: Fmt.weekdayShort(date)).scaledFont(11, weight: .medium, cap: .denseCap).foregroundStyle(Palette.muted)
                dayDisc(sports: choice.days[i], rest: choice.rest.contains(i), size: 36)
                Text(verbatim: ISODay.day(date)).font(Typo.number(17)).foregroundStyle(Palette.ink)
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 44)
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(on ? Palette.ink : .clear, lineWidth: 2) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(past ? 0.4 : 1)
        .disabled(past || saving)
        .accessibilityLabel(Text(verbatim: Fmt.capitalized(Fmt.weekdayName(date)) + " " + Fmt.dayMonth(date)))
        .accessibilityValue(Text(verbatim: dayValue(choice, i)))
        .accessibilityHint(past ? Text(verbatim: L10n.tr("Minulý den, nejde změnit")) : Text(verbatim: ""))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// What VoiceOver says a day holds: the sports, Day off or Coach picks the sport.
    private func dayValue(_ choice: WeekPlanChoice, _ i: Int) -> String {
        if choice.rest.contains(i) { return L10n.tr("Volno") }
        if choice.days[i].isEmpty { return L10n.tr("Sport vybere kouč") }
        return choice.days[i].map(WeekPlanSport.name).joined(separator: ", ")
    }

    /// Empty: a dashed ring (the coach picks); rest: grey with a dot; else the sport's disc (two side by side).
    @ViewBuilder private func dayDisc(sports: [String], rest: Bool, size: CGFloat) -> some View {
        if rest {
            Circle().fill(Palette.track).frame(width: size, height: size)
                .overlay { Circle().fill(Palette.faint).frame(width: 5, height: 5) }
        } else if let first = sports.first {
            if sports.count > 1 {
                // Two smaller discs side by side, barely touching (606: overlapping, unreadable).
                HStack(spacing: -size * 0.08) {
                    WeekPlanSport.disc(first, size: size * 0.54)
                    WeekPlanSport.disc(sports[1], size: size * 0.54)
                }
                .frame(width: size, height: size)
            } else {
                WeekPlanSport.disc(first, size: size)
            }
        } else {
            Circle().strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1, dash: [3, 3])).frame(width: size, height: size)
        }
    }

    /// The selected day: "THURSDAY, NOV 12" and Coach, Ride, Run, Swim, Gym, Rest.
    private func dayPicker(_ date: String) -> some View {
        let week = date >= nextMonday ? nextMonday : monday
        let i = ISODay.weekdayIndex(date)
        let choice = choices[week] ?? WeekPlanChoice(prefs: nil)
        return VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: (Fmt.weekdayName(date) + ", " + Fmt.dayMonthShort(date)).uppercased(with: Fmt.locale))
                .font(.caption.weight(.medium)).tracking(1.9).foregroundStyle(Palette.muted)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 6) {
                optionTile(L10n.tr("Kouč"), on: choice.days[i].isEmpty && !choice.rest.contains(i), hint: "Sport vybere kouč") {
                    dayDisc(sports: [], rest: false, size: 30)
                } action: { update(week) { $0.auto(i) } }
                ForEach(WeekPlanPrefs.sports, id: \.self) { sport in
                    optionTile(WeekPlanSport.name(sport), on: choice.days[i].contains(sport), hint: nil) {
                        WeekPlanSport.disc(sport, size: 30)
                    } action: { update(week) { $0.toggle(sport, day: i) } }
                }
                optionTile(L10n.tr("Volno"), on: choice.rest.contains(i), hint: nil) {
                    dayDisc(sports: [], rest: true, size: 30)
                } action: { update(week) { $0.makeRest(i) } }
            }
            Text(verbatim: L10n.tr("Vyber jeden nebo dva sporty na den. Třetí nahradí první."))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .disabled(saving)
    }

    private func optionTile<Disc: View>(_ title: String, on: Bool, hint: String?, @ViewBuilder disc: () -> Disc,
                                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                disc()
                Text(verbatim: title).scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(on ? Palette.ink : .clear, lineWidth: 2) }
            .contentShape(Rectangle())
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
            Button {
                if plannedAhead { confirmGenerate = true } else { Task { await close(generate: true) } }
            } label: {
                Text(verbatim: L10n.tr("Vygenerovat tréninky")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 54)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(saving || model.demo || model.offline || failed || !loaded)
            .confirmationDialog(changedDays.isEmpty ? L10n.tr("Nahradit naplánované tréninky?") : WeekPlanSettingsText.again(changedDays),
                                isPresented: $confirmGenerate, titleVisibility: .visible) {
                Button(L10n.tr("Vygenerovat tréninky"), role: changedDays.isEmpty ? .destructive : nil) { Task { await close(generate: true) } }
                Button(L10n.tr("Zrušit"), role: .cancel) {}
            } message: {
                Text(verbatim: changedDays.isEmpty
                     ? L10n.tr("Tréninky od dneška do příští neděle se nahradí novými, i s tvými úpravami. Hotové zůstanou.")
                     : L10n.tr("Nové tréninky dostanou jen dny, které jsi změnil. Ostatní naplánované tréninky zůstanou."))
            }
            Text(verbatim: model.offline ? L10n.tr("Jsi offline. Připoj se a plán se sestaví.")
                 : !changedDays.isEmpty ? WeekPlanSettingsText.plans(changedDays)
                 : WeekPlanText.replans(from: today, to: ISODay.shift(nextMonday, 6)) + " " + L10n.tr("Tvoje vlastní úpravy se nahradí."))
                .font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 12)
        .background(Palette.background.opacity(0.94).ignoresSafeArea(edges: .bottom))
    }

    /// A planned workout Generate would replace: on a changed day, else from today to next Sunday.
    private var plannedAhead: Bool {
        (changedDays.isEmpty ? ISODay.range(today, ISODay.shift(nextMonday, 6)) : changedDays).contains { date in
            (calendar[date]?.activities ?? []).contains { $0.status == "planned" }
        }
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
            failed = true
            loaded = true
        }
    }

    /// Done saves (no replanning); Generate saves, closes and the plan replans.
    private func close(generate: Bool) async {
        guard dirty, !model.demo else {
            dismiss()
            onClose(generate && !model.demo ? changedDays : nil)
            return
        }
        saving = true
        defer { saving = false }
        let days = changedDays
        do {
            if usual != usualBefore {
                let days = WeekPlanPrefs.days(usualPrefs)
                try await model.api.saveWeekPlan(start: nil, prefs: WeekPlanPrefs.edited(usualPrefs, minutes: usual, days: days,
                                                                                         weeklyActivities: WeekPlanPrefs.weeklyActivities(usualPrefs)))
            }
            for week in weeks {
                guard let choice = choices[week], choice != original[week] else { continue }
                let prefs = weekPrefs[week] ?? nil
                // A week without its own plan follows the usual week, the new time included.
                let base = WeekPlanPrefs.source(prefs) == "week" ? WeekPlanPrefs.minutes(prefs) : usual
                let before = (original[week]?.rest ?? []).subtracting(choice.rest)
                let minutes = choice.minutes(base: base, usual: usual, before: before)
                try await model.api.saveWeekPlan(start: week, prefs: WeekPlanPrefs.edited(prefs, minutes: minutes, days: choice.days,
                                                                                         weeklyActivities: WeekPlanPrefs.weeklyActivities(prefs)))
            }
            error = nil
            dismiss()
            onClose(generate ? days : nil)
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

    /// "8 h 15 min a week".
    static func total(_ minutes: [Int]) -> String {
        L10n.f("%@ týdně", planDuration(minutes.reduce(0) { $0 + max(0, $1) }))
    }

    /// Generate's question for the days changed: "Plan Sat, Nov 28 again?", "Plan 2 days again?".
    static func again(_ days: [String]) -> String {
        days.count == 1 ? L10n.f("Naplánovat znovu %@?", Fmt.weekdayDayMonthShort(days[0]))
            : L10n.f("Naplánovat znovu %@?", L10n.plural("%lld dní", days.count))
    }

    /// The line under Generate for the days changed: "Plans Sat, Nov 28. Your other workouts stay."
    static func plans(_ days: [String]) -> String {
        L10n.f("Naplánuje %@. Ostatní tréninky zůstanou.", days.count == 1 ? Fmt.weekdayDayMonthShort(days[0]) : L10n.plural("%lld dní", days.count))
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
/// the week's proposal (rules, no AI cost) is built as if the planned workouts
/// ahead were gone, and only once every workout of it is built do they go and
/// the new ones get saved as the old week planner saved them (review
/// 2026-11-24 point 1: offline or a server error leaves the week as it was).
enum WeekPlanGenerator {
    /// What Generate did: false when a week failed; `affects` when the days
    /// planned again touch the workouts kept around them (Recalculate / Keep as is).
    struct Result {
        var ok = true
        var affects: WeekProposalResponse.ReplanAffects?
    }

    /// Replans each week from `from` (today at the earliest) on, or with `days`
    /// only those days (the other planned workouts stay and count in); the
    /// finished workouts and the days before stay.
    @MainActor @discardableResult
    static func replan(_ model: AppModel, weeks: [String], today: String, from: String? = nil, days: [String]? = nil,
                       calendar: [String: CalendarDay]) async -> Result {
        let today = max(today, from ?? today)
        var result = Result()
        for week in weeks {
            // The days of this week to plan again; nil: all from today.
            let only = days.map { list in list.filter { $0 >= max(week, today) && $0 <= ISODay.shift(week, 6) }.sorted() }
            if only?.isEmpty == true { continue }
            let dates = only ?? ISODay.range(max(week, today), ISODay.shift(week, 6))
            do {
                var r = try await model.api.weekProposal(start: week, replanFrom: only == nil ? today : nil, replanDays: only)
                let replanned = r.replan == true
                if !replanned {
                    // A server without replan counts the planned workouts in: they go first, as before.
                    try await deletePlanned(model, dates: dates, calendar: calendar)
                    r = try await model.api.weekProposal(start: week)
                }
                if result.affects == nil { result.affects = r.affects }
                let bricks = WeekPlanPrefs.bricks(r.proposal?.prefs)
                var drafts = (r.proposal?.items ?? []).filter { dates.contains($0.date) }.map { item -> WeekSessionDraft in
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
                // Gym days kept around the days planned again, so a new gym follows on from them (critic 2026-11-25).
                let keptGym = ISODay.range(week, ISODay.shift(week, 6)).filter { date in
                    !dates.contains(date) && (calendar[date]?.activities ?? []).contains { $0.status == "planned" && $0.sport == "strength" }
                }.map { WeekSessionDraft(date: $0, sport: "gym", minutes: WeekPlanSport.usualMinutes("gym"), environment: nil) }
                for i in drafts.indices {
                    let id = drafts[i].id
                    let built = await drafts[i].building(model.api, others: drafts.filter { $0.id != id } + keptGym)
                    drafts[i] = built
                }
                if replanned {
                    // A workout that did not build: the week stays as it was.
                    guard drafts.allSatisfy({ $0.status == .ready }) else { result.ok = false; continue }
                    try await deletePlanned(model, dates: dates, calendar: calendar)
                }
                if try await save(model, drafts) == false { result.ok = false }
            } catch {
                result.ok = false
            }
        }
        return result
    }

    /// The days' planned workouts go; the finished ones stay.
    @MainActor
    private static func deletePlanned(_ model: AppModel, dates: [String], calendar: [String: CalendarDay]) async throws {
        for date in dates {
            for a in calendar[date]?.activities ?? [] where a.status == "planned" {
                if let eventId = a.eventId {
                    try await model.api.deletePlanned(eventId: eventId)
                } else if a.sport == "strength" {
                    try await model.api.cancelGym(date: date)
                }
            }
        }
    }

    /// The days from today whose sports, rest or usual time changed, in order (a weekday's
    /// usual time changes it in both weeks); empty when none did.
    static func changedDays(weeks: [String], today: String, choices: [String: WeekPlanChoice], original: [String: WeekPlanChoice],
                            usual: [Int], usualBefore: [Int]) -> [String] {
        let changed = weeks.flatMap { week in
            (0..<7).compactMap { i -> String? in
                let date = ISODay.shift(week, i)
                guard date >= today, let now = choices[week], let before = original[week] else { return nil }
                let day = now.days[i] != before.days[i] || now.rest.contains(i) != before.rest.contains(i)
                return day || usual[i] != usualBefore[i] ? date : nil
            }
        }
        return changed.sorted()
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
        if a.sport == "strength" {
            // The gym plan again at the length; one saved as an event leaves it after.
            let gym = try await model.api.previewGym(date: a.date, minutes: minutes, focus: nil, muscles: [], fromWeek: true)
            guard let draftId = gym.draftId else { throw APIError.message(L10n.tr("Trénink se nepodařilo sestavit.")) }
            try await model.api.confirmGym(draftId: draftId, rows: gym.rows)
            if let eventId = a.eventId { try await model.api.deletePlanned(eventId: eventId) }
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
