import SwiftUI

// MARK: - Plan settings (redesign W, concept 05 "Plan settings")
//
// A sheet over Week plan: the sports per day for this week and the next
// (Auto, Ride, Run, Swim, Gym or Rest), "Rest until Sunday" and "Rest all
// week", the usual time per weekday as seven ink sliders, then the pinned
// Generate workouts. Done saves without replanning (the planned workouts stay
// until Generate); Generate saves and replans from the first day changed
// (today when nothing changed) to next Sunday, the finished workouts stay
// (WeekPlanGenerator).

/// One week's choices: the sports per weekday (empty: the coach picks), the rest
/// days and the athlete's other sports (a football practice or match) per weekday.
struct WeekPlanChoice: Equatable {
    var days: [[String]]
    var rest: Set<Int>
    var events = Array(repeating: [OtherSportEvent](), count: 7)

    init(prefs: JSONValue?) {
        days = WeekPlanPrefs.days(prefs)
        rest = Set(WeekPlanPrefs.minutes(prefs).enumerated().filter { $0.element == 0 }.map(\.offset))
        events = OtherSports.events(prefs)
    }

    init(days: [[String]], rest: Set<Int>, events: [[OtherSportEvent]]? = nil) {
        self.days = days
        self.rest = rest
        if let events { self.events = events }
    }

    /// A tap on an other sport of a day: on (a practice of its usual length) or off;
    /// two a day at most, a third replaces the first. The day's own sports stay.
    mutating func toggleEvent(_ type: String, day: Int) {
        var list = events[day]
        if let i = list.firstIndex(where: { $0.type == type }) {
            list.remove(at: i)
        } else {
            list.append(OtherSportEvent(type: type))
            while list.count > OtherSports.maxPerDay { list.removeFirst() }
        }
        events[day] = list
    }

    /// Training or match, and the length, of a day's other sport.
    mutating func setEvent(_ type: String, day: Int, kind: String? = nil, minutes: Int? = nil) {
        guard let i = events[day].firstIndex(where: { $0.type == type }) else { return }
        if let kind, kind != events[day][i].kind {
            // A length left at the old kind's usual takes the new kind's usual.
            let usual = events[day][i].minutes == OtherSports.usualMinutes(events[day][i].kind)
            events[day][i].kind = kind
            if usual { events[day][i].minutes = OtherSports.usualMinutes(kind) }
        }
        if let minutes { events[day][i].minutes = min(OtherSports.maxMinutes, max(OtherSports.minMinutes, minutes)) }
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
    /// Closed: with Generate the day the plan replans from (after the save), nil for Done.
    let onClose: (String?) -> Void

    @State private var loaded = false
    @State private var usualPrefs: JSONValue?
    @State private var weekPrefs: [String: JSONValue?] = [:]
    @State private var choices: [String: WeekPlanChoice] = [:]
    @State private var original: [String: WeekPlanChoice] = [:]
    @State private var usual = Array(repeating: -1, count: 7)
    @State private var usualBefore = Array(repeating: -1, count: 7)
    /// The usual week's other sports ("Repeat every week"), and as loaded.
    @State private var usualEvents = Array(repeating: [OtherSportEvent](), count: 7)
    @State private var usualEventsBefore = Array(repeating: [OtherSportEvent](), count: 7)
    /// Settings → Sports: the sports the coach plans (Ride, Run, Swim, Gym order) and the other sports.
    @State private var sports = WeekPlanPrefs.sports
    @State private var otherSports: [String] = []
    /// The other sport whose Training or Match, Length and Repeat show under the tiles.
    @State private var editing: String?
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
    private var dirty: Bool { choices != original || usual != usualBefore || usualEvents != usualEventsBefore }
    /// A change of days or rest the planned workouts do not follow until Generate.
    private var conflicting: Bool { choices != original }
    /// Generate replans from the first day whose sports, rest or usual time changed,
    /// today when nothing did: a workout added for a day left as it was stays
    /// (Petr 2026-11-24: a gym for today went when he set the days from Wednesday).
    private var replanFrom: String {
        WeekPlanGenerator.replanFrom(weeks: weeks, today: today, choices: choices, original: original,
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
        return Button {
            withAnimation(.snappy) {
                selected = on ? nil : date
                // A day with its own practice or match opens it, so it can be changed right away.
                editing = choice.events[i].first?.type
            }
        } label: {
            VStack(spacing: 5) {
                Text(verbatim: Fmt.weekdayShort(date)).scaledFont(11, weight: .medium, cap: .denseCap).foregroundStyle(Palette.muted)
                dayDisc(sports: choice.days[i], rest: choice.rest.contains(i), size: 36, events: choice.events[i].map(\.type))
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
        let own = choice.events[i].map { OtherSports.title($0) }
        if choice.rest.contains(i) { return ([L10n.tr("Volno")] + own).joined(separator: ", ") }
        if choice.days[i].isEmpty { return (own + [L10n.tr("Sport vybere kouč")]).joined(separator: ", ") }
        return (choice.days[i].map(WeekPlanSport.name) + own).joined(separator: ", ")
    }

    /// Empty: a dashed ring (the coach picks); rest: grey with a dot; else the sport's disc (two side by side).
    /// The day's other sports (a match) come first: they are fixed, the coach plans around them.
    @ViewBuilder private func dayDisc(sports: [String], rest: Bool, size: CGFloat, events: [String] = []) -> some View {
        if let first = events.first {
            if events.count + sports.count > 1 {
                HStack(spacing: -size * 0.08) {
                    OtherSports.disc(first, size: size * 0.54)
                    if events.count > 1 { OtherSports.disc(events[1], size: size * 0.54) } else { WeekPlanSport.disc(sports[0], size: size * 0.54) }
                }
                .frame(width: size, height: size)
            } else {
                OtherSports.disc(first, size: size)
            }
        } else if rest {
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

    /// The selected day: "THURSDAY, NOV 12" and one row of tiles: Coach, the sports
    /// the coach plans (Settings order, a sport turned off is left out), the other
    /// sports, Day off; the row scrolls when they do not fit. A tapped other sport
    /// shows Training or Match, its length and Repeat every week under the row.
    private func dayPicker(_ date: String) -> some View {
        let week = date >= nextMonday ? nextMonday : monday
        let i = ISODay.weekdayIndex(date)
        let choice = choices[week] ?? WeekPlanChoice(prefs: nil)
        let wide = sports.count + otherSports.count + 2 > 6
        return VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: (Fmt.weekdayName(date) + ", " + Fmt.dayMonthShort(date)).uppercased(with: Fmt.locale))
                .font(.caption.weight(.medium)).tracking(1.9).foregroundStyle(Palette.muted)
                .accessibilityAddTraits(.isHeader)
            tileRow(wide) {
                    optionTile(L10n.tr("Kouč"), on: choice.days[i].isEmpty && !choice.rest.contains(i), hint: "Sport vybere kouč", fixed: wide) {
                        dayDisc(sports: [], rest: false, size: 30)
                    } action: { update(week) { $0.auto(i) } }
                    ForEach(sports, id: \.self) { sport in
                        optionTile(WeekPlanSport.name(sport), on: choice.days[i].contains(sport), hint: nil, fixed: wide) {
                            WeekPlanSport.disc(sport, size: 30)
                        } action: { update(week) { $0.toggle(sport, day: i) } }
                    }
                    ForEach(otherSports, id: \.self) { type in
                        let on = choice.events[i].contains { $0.type == type }
                        optionTile(OtherSports.name(type), on: on, hint: nil, fixed: wide) {
                            OtherSports.disc(type, size: 30)
                        } action: {
                            // On already: the tap opens its Training or Match, Length and Repeat
                            // (Remove from this day is there); off: on as a practice, opened.
                            if on { withAnimation(.snappy) { editing = type } } else {
                                update(week) { $0.toggleEvent(type, day: i) }
                                editing = type
                            }
                        }
                    }
                    optionTile(L10n.tr("Volno"), on: choice.rest.contains(i), hint: nil, fixed: wide) {
                        dayDisc(sports: [], rest: true, size: 30)
                    } action: { update(week) { $0.makeRest(i) } }
            }
            if let editing, let event = choice.events[i].first(where: { $0.type == editing }) {
                eventEditor(event, day: i, week: week)
            }
            if choice.rest.contains(i), !choice.events[i].isEmpty {
                Text(verbatim: L10n.tr("Od plánu volno, tvůj vlastní sport zůstává."))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Text(verbatim: L10n.tr("Vyber jeden nebo dva sporty na den. Třetí nahradí první."))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .disabled(saving)
    }

    /// The tiles side by side; more than fit (other sports added) scroll sideways.
    @ViewBuilder private func tileRow<Tiles: View>(_ wide: Bool, @ViewBuilder tiles: () -> Tiles) -> some View {
        let row = HStack(spacing: 6) { tiles() }
        if wide {
            // Clipped at the card's edge, the last tile cut: the row goes on (concept 2b).
            ScrollView(.horizontal, showsIndicators: false) { row.padding(2) }
                .padding(-2)
        } else {
            row
        }
    }

    /// Training or Match, Length and Repeat every week of the day's other sport.
    private func eventEditor(_ event: OtherSportEvent, day i: Int, week: String) -> some View {
        let repeats = usualEvents[i].contains { $0.type == event.type }
        return VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: OtherSports.name(event.type)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
            Picker(OtherSports.name(event.type), selection: Binding(get: { event.kind }, set: { kind in
                update(week) { $0.setEvent(event.type, day: i, kind: kind) }
                if repeats { setRepeat(event.type, day: i, week: week, on: true) }
            })) {
                Text(verbatim: L10n.tr("Trénink")).tag("training")
                Text(verbatim: L10n.tr("Zápas")).tag("match")
            }
            .pickerStyle(.segmented)
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Délka")
                Spacer()
                Text(verbatim: planDuration(event.minutes)).font(Typo.number(20)).foregroundStyle(Palette.ink)
            }
            Slider(value: Binding(get: { Double(event.minutes) }, set: { value in
                update(week) { $0.setEvent(event.type, day: i, minutes: Int(value)) }
                if repeats { setRepeat(event.type, day: i, week: week, on: true) }
            }), in: Double(OtherSports.minMinutes)...Double(OtherSports.maxMinutes), step: 5)
            .tint(Palette.ink)
            .accessibilityLabel(Text(verbatim: L10n.tr("Délka")))
            .accessibilityValue(Text(verbatim: planDuration(event.minutes)))
            Toggle(isOn: Binding(get: { repeats }, set: { setRepeat(event.type, day: i, week: week, on: $0) })) {
                Text(verbatim: L10n.tr("Opakovat každý týden")).font(.body).foregroundStyle(Palette.ink)
            }
            .tint(Palette.green)
            .frame(minHeight: 44)
            Text(verbatim: L10n.tr("Zápas, turnaj nebo závod je pro plán tvrdý den, trénink středně náročný."))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            // This day only: the usual week keeps it (Repeat every week off takes it out of every week).
            Button {
                update(week) { $0.toggleEvent(event.type, day: i) }
                editing = nil
            } label: {
                Text(verbatim: L10n.tr("Odebrat z tohoto dne")).font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                    .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// Repeat every week: the usual week holds the day's other sport as this week has it
    /// (both weeks shown follow the usual week where they hold no change of their own).
    private func setRepeat(_ type: String, day i: Int, week: String, on: Bool) {
        WeekPlanGenerator.setRepeat(type, day: i, week: week, on: on, weeks: weeks, choices: &choices, usualEvents: &usualEvents)
    }

    private func optionTile<Disc: View>(_ title: String, on: Bool, hint: String?, fixed: Bool = false, @ViewBuilder disc: () -> Disc,
                                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                disc()
                Text(verbatim: title).scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.horizontal, fixed ? 8 : 0)
            .frame(minWidth: fixed ? 58 : nil)
            .frame(maxWidth: fixed ? nil : .infinity, minHeight: 64)
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
            .confirmationDialog(L10n.tr("Nahradit naplánované tréninky?"), isPresented: $confirmGenerate, titleVisibility: .visible) {
                Button(L10n.tr("Vygenerovat tréninky"), role: .destructive) { Task { await close(generate: true) } }
                Button(L10n.tr("Zrušit"), role: .cancel) {}
            } message: {
                Text(verbatim: WeekPlanSettingsText.replaced(from: replanFrom, today: today))
            }
            Text(verbatim: model.offline ? L10n.tr("Jsi offline. Připoj se a plán se sestaví.")
                 : WeekPlanText.replans(from: replanFrom, to: ISODay.shift(nextMonday, 6)) + " " + L10n.tr("Tvoje vlastní úpravy se nahradí."))
                .font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 12)
        .background(Palette.background.opacity(0.94).ignoresSafeArea(edges: .bottom))
    }

    /// A planned workout from the replan's first day to next Sunday, which Generate would replace.
    private var plannedAhead: Bool {
        ISODay.range(replanFrom, ISODay.shift(nextMonday, 6)).contains { date in
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
            // The other sports for the tiles (Settings → Sports); without them the row is as before.
            // The other sports for the tiles (Settings → Sports), and any already in the plan
            // (a sport removed in Settings stays removable here); without them the row is as before.
            let plans = [usualPlan.prefs, thisPlan.prefs, nextPlan.prefs]
            let planned = plans.flatMap { OtherSports.events($0).flatMap { $0.map(\.type) } }
            otherSports = (OtherSports.list((try? await model.api.profile()) ?? [:]) + planned).reduce(into: []) { if !$0.contains($1) { $0.append($1) } }
            if !otherSports.isEmpty { await OtherSports.loadNames(model.api) }
            // The sports on in Settings, and any a day already holds (it stays visible to turn off).
            let chosen = (thisPlan.sports ?? []).map { $0 == "strength" ? "gym" : $0 }
            let inDays = Set(plans.flatMap { WeekPlanPrefs.days($0).flatMap { $0 } })
            sports = chosen.isEmpty ? WeekPlanPrefs.sports : WeekPlanPrefs.sports.filter { chosen.contains($0) || inDays.contains($0) }
            usualPrefs = usualPlan.prefs
            usual = WeekPlanPrefs.minutes(usualPlan.prefs)
            usualBefore = usual
            usualEvents = OtherSports.events(usualPlan.prefs)
            usualEventsBefore = usualEvents
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
            onClose(generate && !model.demo ? replanFrom : nil)
            return
        }
        saving = true
        defer { saving = false }
        let from = replanFrom
        do {
            if usual != usualBefore || usualEvents != usualEventsBefore {
                let days = WeekPlanPrefs.days(usualPrefs)
                let prefs = WeekPlanPrefs.edited(usualPrefs, minutes: usual, days: days, weeklyActivities: WeekPlanPrefs.weeklyActivities(usualPrefs))
                try await model.api.saveWeekPlan(start: nil, prefs: OtherSports.edited(prefs, events: usualEvents))
            }
            for week in weeks {
                guard let choice = choices[week], WeekPlanGenerator.needsSave(choice, original: original[week], usualEvents: usualEvents,
                                                                              usualEventsBefore: usualEventsBefore) else { continue }
                let prefs = weekPrefs[week] ?? nil
                // A week without its own plan follows the usual week, the new time included.
                let base = WeekPlanPrefs.source(prefs) == "week" ? WeekPlanPrefs.minutes(prefs) : usual
                let before = (original[week]?.rest ?? []).subtracting(choice.rest)
                let minutes = choice.minutes(base: base, usual: usual, before: before)
                let edited = WeekPlanPrefs.edited(prefs, minutes: minutes, days: choice.days, weeklyActivities: WeekPlanPrefs.weeklyActivities(prefs))
                try await model.api.saveWeekPlan(start: week, prefs: OtherSports.edited(edited, events: choice.events))
            }
            error = nil
            dismiss()
            onClose(generate ? from : nil)
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

    /// Generate's question: what goes, from today or from the first day changed.
    static func replaced(from date: String, today: String) -> String {
        date == today ? L10n.tr("Tréninky od dneška do příští neděle se nahradí novými, i s tvými úpravami. Hotové zůstanou.")
            : L10n.f("Tréninky od %@ do příští neděle se nahradí novými, i s tvými úpravami. Dřívější dny a hotové zůstanou.", Fmt.dayMonthShort(date))
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
    /// Replans each week from `from` (today at the earliest) on; finished workouts
    /// and the days before stay. False when a week failed.
    @MainActor
    static func replan(_ model: AppModel, weeks: [String], today: String, from: String? = nil, calendar: [String: CalendarDay]) async -> Bool {
        let today = max(today, from ?? today)
        var ok = true
        for week in weeks {
            do {
                var r = try await model.api.weekProposal(start: week, replanFrom: today)
                let replanned = r.replan == true
                if !replanned {
                    // A server without replan counts the planned workouts in: they go first, as before.
                    try await deletePlanned(model, week: week, today: today, calendar: calendar)
                    r = try await model.api.weekProposal(start: week)
                }
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
                if replanned {
                    // A workout that did not build: the week stays as it was.
                    guard drafts.allSatisfy({ $0.status == .ready }) else { ok = false; continue }
                    try await deletePlanned(model, week: week, today: today, calendar: calendar)
                }
                if try await save(model, drafts) == false { ok = false }
            } catch {
                ok = false
            }
        }
        return ok
    }

    /// The week's planned workouts from today on go; the finished ones stay.
    @MainActor
    private static func deletePlanned(_ model: AppModel, week: String, today: String, calendar: [String: CalendarDay]) async throws {
        for date in ISODay.range(max(week, today), ISODay.shift(week, 6)) {
            for a in calendar[date]?.activities ?? [] where a.status == "planned" {
                if let eventId = a.eventId {
                    try await model.api.deletePlanned(eventId: eventId)
                } else if a.sport == "strength" {
                    try await model.api.cancelGym(date: date)
                }
            }
        }
    }

    /// The first day from today whose sports, rest or usual time changed; today when none did.
    static func replanFrom(weeks: [String], today: String, choices: [String: WeekPlanChoice], original: [String: WeekPlanChoice],
                           usual: [Int], usualBefore: [Int]) -> String {
        // A day's practice or match, the next Monday's from the next week (none after the last week shown).
        func events(_ list: [String: WeekPlanChoice], _ week: String, _ i: Int) -> [OtherSportEvent] {
            i < 6 ? list[week]?.events[i + 1] ?? [] : list[ISODay.shift(week, 7)]?.events[0] ?? []
        }
        let changed = weeks.flatMap { week in
            (0..<7).compactMap { i -> String? in
                let date = ISODay.shift(week, i)
                guard date >= today, let now = choices[week], let before = original[week] else { return nil }
                // A practice or match added, changed or taken out changes the days around it too (the day before it).
                let own = now.events[i] != before.events[i] || events(choices, week, i) != events(original, week, i)
                let day = now.days[i] != before.days[i] || now.rest.contains(i) != before.rest.contains(i) || own
                return day || usual[i] != usualBefore[i] ? date : nil
            }
        }
        return changed.min() ?? today
    }

    /// A week is sent when it changed, or when the usual week's other sports changed
    /// and this week holds others (it keeps its own; the server stores only what differs).
    static func needsSave(_ choice: WeekPlanChoice, original: WeekPlanChoice?, usualEvents: [[OtherSportEvent]],
                          usualEventsBefore: [[OtherSportEvent]]) -> Bool {
        choice != original || (usualEvents != usualEventsBefore && choice.events != usualEvents)
    }

    /// Repeat every week on or off for a day's other sport: the usual week holds it as
    /// `week` has it, and the other week shown follows where it held the usual week's.
    static func setRepeat(_ type: String, day i: Int, week: String, on: Bool, weeks: [String],
                          choices: inout [String: WeekPlanChoice], usualEvents: inout [[OtherSportEvent]]) {
        var list = usualEvents[i].filter { $0.type != type }
        if on, let event = choices[week]?.events[i].first(where: { $0.type == type }) {
            list.append(event)
            while list.count > OtherSports.maxPerDay { list.removeFirst() }
        }
        for other in weeks where other != week && choices[other]?.events[i] == usualEvents[i] {
            choices[other]?.events[i] = list
        }
        usualEvents[i] = list
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
