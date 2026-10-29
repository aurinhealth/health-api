import SwiftUI

// Cycle tracking (src/cycle-model.js): Settings → Cyklus, the Health card,
// the calendar, the sheet that logs a day and the Cyklus widget. Open to
// everyone; with hormonal contraception there are no phases, ovulation or
// forecast, only what was logged and the pill.

// MARK: - The ring

/// The cycle as a ring of days coloured by phase (period pink, follicular
/// green, ovulation amber, luteal indigo), the days so far full.
struct CycleRing: View {
    let day: Int
    let length: Int
    var periodLength = 5
    var ovulationDay: Int? = nil
    var size: CGFloat = 130

    var body: some View {
        let total = max(length, day, 1)
        ZStack {
            ForEach(1...total, id: \.self) { d in
                Circle()
                    .trim(from: CGFloat(d - 1) / CGFloat(total) + 0.006, to: CGFloat(d) / CGFloat(total) - 0.006)
                    .stroke(color(d).opacity(d <= day ? 1 : 0.28), style: StrokeStyle(lineWidth: size * 0.07, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            VStack(spacing: 0) {
                Text(verbatim: "\(day).").font(Typo.number(size * 0.28)).foregroundStyle(Palette.ink)
                Text("den cyklu").font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .padding(size * 0.04)
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("%@. den cyklu", String(day)))
    }

    private func color(_ d: Int) -> Color {
        if d <= periodLength { return Palette.pink }
        if let o = ovulationDay, abs(d - o) <= 1 { return Palette.amber }
        if let o = ovulationDay, d < o { return Palette.green }
        return Palette.indigo
    }
}

extension CycleState {
    /// The day of the cycle ovulation is expected on.
    var ovulationDay: Int? {
        guard let ovulation, let cycleDay else { return nil }
        return cycleDay + CycleHealth.daysBetween(date, ovulation)
    }
}

// MARK: - Health

/// The cycle on Health under readiness: the ring (natural cycle) or the days
/// since the bleeding (hormonal contraception), on the expected days the
/// morning question, and the pill of the pack.
struct CycleHealthSection: View {
    let state: CycleState
    /// Today's cycle from Today, for "Začala menstruace?".
    var today: TodayCycle? = nil
    @State private var logging = false

    var body: some View {
        VStack(spacing: 12) {
            if today?.ask == true {
                // The question's buttons can't sit inside the link.
                Card {
                    NavigationLink(value: AppRoute.cycle) {
                        VStack(alignment: .leading, spacing: 12) {
                            WidgetHeader(title: "Cyklus", color: Palette.pink)
                            CycleStateSummary(state: state)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Text("Začala menstruace?").font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                    CyclePeriodButtons(date: state.date) { logging = true }
                }
            } else {
                RouteLink(route: .cycle) {
                    Card {
                        WidgetHeader(title: "Cyklus", color: Palette.pink)
                        CycleStateSummary(state: state)
                    }
                }
            }
            if let pill = state.pill, !pill.pause, pill.number != nil {
                PillCard(pill: pill, date: state.date)
            }
        }
        .sheet(isPresented: $logging) {
            CycleLogSheet(date: state.date, flow: 2, symptoms: today?.symptoms ?? [])
        }
    }
}

/// Where the cycle is today: the ring with the phase and the next period
/// (natural cycle), or the days since the bleeding (hormonal contraception).
struct CycleStateSummary: View {
    let state: CycleState
    var ringSize: CGFloat = 120

    var body: some View {
        if state.hormonal {
            if let days = state.daysSinceBleeding {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(verbatim: String(days)).font(Typo.number(40)).foregroundStyle(Palette.ink)
                    Text(L10n.plural("dní od krvácení", days))
                        .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                }
            } else {
                Text("Zapiš krvácení").font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
            }
        } else if let day = state.cycleDay, let length = state.length {
            HStack(spacing: 16) {
                CycleRing(day: day, length: length, periodLength: state.periodLength ?? 5, ovulationDay: state.ovulationDay, size: ringSize)
                VStack(alignment: .leading, spacing: 6) {
                    if let phase = CycleText.phase(state.phase) {
                        Text(phase).font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                    }
                    if let next = state.nextText {
                        Text(next).font(Typo.small).foregroundStyle(Palette.muted)
                    }
                }
            }
        } else {
            Text("Zapiš poslední menstruaci").font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
        }
    }
}

extension CycleState {
    /// "menstruace asi za 5 dní", "menstruace asi dnes" or "menstruace se čeká".
    var nextText: String? {
        guard let next else { return nil }
        if next.late { return L10n.tr("menstruace se čeká") }
        let days = daysToNext ?? 0
        if days == 0 { return L10n.tr("menstruace asi dnes") }
        return L10n.plural("menstruace asi za %lld dní", days)
    }
}

/// "Ano" opens the log, "Ještě ne" tells the server the period hasn't come.
struct CyclePeriodButtons: View {
    @Environment(AppModel.self) private var model
    let date: String
    let yes: () -> Void
    @State private var saving = false

    var body: some View {
        HStack(spacing: 10) {
            Button(action: yes) {
                Text("Ano").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 42).background(Palette.button, in: Capsule())
            }
            Button { notYet() } label: {
                Text("Ještě ne").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 42)
                    .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
            }
            .disabled(saving)
        }
        .buttonStyle(.plain)
    }

    private func notYet() {
        saving = true
        Task {
            do {
                try await model.logCycleDay(date, ["noPeriod": .bool(true)])
            } catch {
                model.notice = error.localizedDescription
            }
            saving = false
        }
    }
}

/// "7. prášek z 21" with Vzato, the pack as a row of bars.
struct PillCard: View {
    @Environment(AppModel.self) private var model
    let pill: PillDay
    let date: String
    @State private var saving = false

    init(pill: PillDay, date: String) {
        self.pill = pill
        self.date = date
    }

    var body: some View {
        Card {
            WidgetHeader(title: "Antikoncepce", color: Palette.indigo)
            HStack(alignment: .center, spacing: 10) {
                Text(verbatim: "\(pill.number ?? 0).").font(Typo.number(36)).foregroundStyle(Palette.ink)
                Text(L10n.f("prášek z %@", String(pill.of))).font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                Spacer(minLength: 8)
                PillButton(taken: pill.taken, saving: saving) { take() }
            }
            HStack(spacing: 3) {
                ForEach(1...max(pill.of, 1), id: \.self) { i in
                    let number = pill.number ?? 0
                    let done = i < number || (i == number && pill.taken != nil)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(done ? Palette.indigo : i == number ? Color.clear : Palette.track)
                        .overlay(RoundedRectangle(cornerRadius: 3).stroke(i == number && !done ? Palette.indigo : Color.clear, lineWidth: 1.5))
                        .frame(height: 7)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private func take() {
        saving = true
        Task {
            do {
                try await model.takePill(on: date)
            } catch {
                model.notice = error.localizedDescription
            }
            saving = false
        }
    }
}

/// "Vzato" until the pill is taken, then "Vzato 21:04" in green.
struct PillButton: View {
    let taken: String?
    var saving = false
    let action: () -> Void

    var body: some View {
        if let taken {
            Label(taken == "taken" ? L10n.tr("Vzato") : L10n.f("Vzato %@", ClockText.format(taken)), systemImage: "checkmark")
                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.green)
                .padding(.horizontal, 12).frame(height: 32)
                .background(Palette.greenSoft, in: Capsule())
        } else {
            Button(action: action) {
                Text("Vzato").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 16).frame(height: 32)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(saving)
        }
    }
}

// MARK: - The widget

/// Cyklus as a widget, added from the gallery (off until then): on the
/// expected days "Začala menstruace?", the day's bleeding or symptoms with
/// the coach's note, otherwise where the cycle is; on a past day what was
/// logged that day. A tap logs the day.
struct CycleWidget: View {
    @Environment(AppModel.self) private var model
    let cycle: TodayCycle
    let date: String
    /// A past day picked in the week strip: its log only.
    var past = false
    var size: WidgetSize = .medium
    @State private var logging = false

    static func logged(_ cycle: TodayCycle) -> Bool {
        cycle.flow > 0 || (cycle.stage != "regular" && !cycle.symptoms.isEmpty)
    }

    private var asks: Bool { cycle.ask && !past }
    /// Where the cycle is today (GET /app/api/cycle), not on a past day.
    private var state: CycleState? { past ? nil : model.cycle?.state }

    var body: some View {
        Group {
            if asks && size != .small {
                Card {
                    WidgetHeader(title: "Cyklus", color: Palette.pink)
                    Text("Začala menstruace?").font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                    CyclePeriodButtons(date: date) { logging = true }
                }
            } else {
                Button { logging = true } label: {
                    Card {
                        WidgetHeader(title: "Cyklus", color: Palette.pink)
                        if size == .small { small } else { medium }
                    }
                }
                .buttonStyle(PressableCardStyle())
            }
        }
        .sheet(isPresented: $logging) {
            CycleLogSheet(date: date, flow: cycle.flow > 0 ? cycle.flow : 2, symptoms: cycle.symptoms)
        }
        .task { if model.cycle == nil && !past { await model.loadCycle() } }
    }

    @ViewBuilder private var medium: some View {
        if Self.logged(cycle) {
            Text(verbatim: summary).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            if !past, let note = cycle.note {
                Text(note).font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else if let state {
            CycleStateSummary(state: state, ringSize: 96)
        } else {
            Text(past ? "Bez záznamu" : "Zapiš krvácení").font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
        }
    }

    /// The day of the cycle (or the days since the bleeding) and one line under it.
    @ViewBuilder private var small: some View {
        if asks {
            Text("Začala menstruace?").font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        } else if cycle.flow > 0 {
            if !cycle.hormonal, let day = cycle.cycleDay {
                NumberText(value: "\(day).", unit: L10n.tr("den"))
            } else {
                Text("Krvácení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            }
            line(cycle.symptoms.isEmpty ? L10n.tr("krvácení") : cycle.symptoms.map { CycleText.symptom($0) }.joined(separator: ", "))
        } else if Self.logged(cycle) {
            Text(verbatim: summary).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        } else if let state, state.hormonal, let days = state.daysSinceBleeding {
            NumberText(value: String(days), unit: L10n.plural("dní", days))
            line(L10n.tr("od krvácení"))
        } else if !past, !cycle.hormonal, let day = cycle.cycleDay {
            NumberText(value: "\(day).", unit: L10n.tr("den"))
            if let next = state?.nextText { line(next) } else if let phase = CycleText.phase(cycle.phase) { line(phase) }
        } else {
            Text(past ? "Bez záznamu" : "Zapiš krvácení").font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
        }
    }

    private func line(_ text: String) -> some View {
        Text(verbatim: text).font(Typo.caption).foregroundStyle(Palette.faint)
            .lineLimit(2).fixedSize(horizontal: false, vertical: true)
    }

    /// "1. den · křeče, únava", "Krvácení · křeče", or without bleeding "Návaly horka · noční pocení".
    private var summary: String {
        if cycle.flow == 0 {
            return Fmt.capitalized(cycle.symptoms.map { CycleText.symptom($0) }.joined(separator: " · "))
        }
        let head = cycle.hormonal || cycle.cycleDay == nil ? L10n.tr("Krvácení") : L10n.f("%@. den", String(cycle.cycleDay ?? 1))
        let symptoms = cycle.symptoms.map { CycleText.symptom($0) }
        return ([head] + (symptoms.isEmpty ? [] : [symptoms.joined(separator: ", ")])).joined(separator: " · ")
    }
}

// MARK: - Logging a day

/// Bleeding (light, medium, heavy) and symptoms for a day; with the pill also
/// whether it was taken (a forgotten day filled in from the calendar).
struct CycleLogSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    var pill: String? = nil
    @State private var flow: Int
    @State private var symptoms: Set<String>
    @State private var pillTaken: Bool
    @State private var saving = false
    @State private var error: String?

    /// `pill`: "taken" or "planned" when the day has a pill, nil otherwise.
    init(date: String, flow: Int, symptoms: [String], pill: String? = nil) {
        self.date = date
        self.pill = pill
        _flow = State(initialValue: flow)
        _symptoms = State(initialValue: Set(symptoms))
        _pillTaken = State(initialValue: pill == "taken")
    }

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(verbatim: Fmt.capitalized(Fmt.dayHeading(date).lowercased(with: Fmt.locale)))
                    .font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                if pill != nil {
                    SettingsToggle(title: "Prášek vzat", isOn: $pillTaken)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                Text("Krvácení").font(Typo.bodyStrong).foregroundStyle(Palette.muted).padding(.top, 8)
                HStack(spacing: 10) {
                    ForEach(1...3, id: \.self) { level in
                        tile(on: flow == level, symbols: Array(repeating: "drop", count: level), title: CycleText.flows[level - 1]) {
                            flow = flow == level ? 0 : level
                        }
                    }
                }
                Text("Potíže").font(Typo.bodyStrong).foregroundStyle(Palette.muted).padding(.top, 10)
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(CycleText.symptoms(for: model.cycle?.settings?.stage ?? "regular"), id: \.id) { s in
                        tile(on: symptoms.contains(s.id), symbols: [s.symbol], title: s.title) {
                            if symptoms.contains(s.id) { symptoms.remove(s.id) } else { symptoms.insert(s.id) }
                        }
                    }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Button { save() } label: {
                    Text(saving ? "Ukládám…" : "Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(saving)
                .padding(.top, 10)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    private func tile(on: Bool, symbols: [String], title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                HStack(spacing: 2) {
                    ForEach(Array(symbols.enumerated()), id: \.offset) { _, symbol in
                        Image(systemName: symbol).scaledFont(17, weight: .medium)
                    }
                }
                Text(L10n.tr(title)).font(.footnote.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Palette.pink : Palette.secondary)
            .frame(maxWidth: .infinity).frame(height: 74)
            .background(on ? Palette.pinkSoft : Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? Palette.pink : Color.clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save() {
        saving = true
        error = nil
        var body: JSONObject = ["flow": .number(Double(flow)), "symptoms": .array(CycleText.symptoms.map(\.id).filter { symptoms.contains($0) }.map { .string($0) })]
        // The pill only when its switch changed: taken now today, "taken"
        // (no time) on an earlier day.
        if pill != nil, pillTaken != (pill == "taken") {
            body["pill"] = !pillTaken ? .null : date == AppModel.localDate(Date()) ? .string(AppModel.clockNow()) : .bool(true)
        }
        Task {
            do {
                try await model.logCycleDay(date, body)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

// MARK: - The calendar

/// Health → Cyklus: the month with the periods (pink), ovulation (amber), the
/// forecast (dashed) and the pills (a bar under the day: full taken, empty to
/// come). A day up to today opens its log.
struct CycleCalendarView: View {
    @Environment(AppModel.self) private var model
    @State private var month: String = String(AppModel.localDate(Date()).prefix(7))
    @State private var editing: CycleDay?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
    private var today: String { AppModel.localDate(Date()) }

    var body: some View {
        DetailScreen {
            Text("Cyklus").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 8)
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left").font(.body.weight(.semibold)) }
                    .accessibilityLabel("Předchozí měsíc")
                Spacer()
                Text(verbatim: monthTitle).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right").font(.body.weight(.semibold)) }
                    .disabled(month >= String(today.prefix(7)))
                    .accessibilityLabel("Další měsíc")
            }
            .buttonStyle(.plain)
            .foregroundStyle(Palette.ink)
            .padding(.top, 6)

            Card {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(Array(weekdays.enumerated()), id: \.offset) { _, name in
                        Text(verbatim: name).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    ForEach(0..<blanks, id: \.self) { _ in Color.clear.frame(height: 40) }
                    ForEach(days) { day in
                        Button { if day.date <= today { editing = day } } label: { dayCell(day) }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 14)

            if let pill = model.cycle?.state?.pill, !pill.pause, pill.number != nil, let date = model.cycle?.state?.date {
                PillCard(pill: pill, date: date).padding(.top, 12)
            }

            Button { editing = days.first { $0.date == today } ?? CycleDay(date: today, flow: 0, symptoms: []) } label: {
                Label(model.cycle?.settings?.hormonal == true ? L10n.tr("Zapsat krvácení") : L10n.tr("Zapsat menstruaci"), systemImage: "plus")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
        }
        .task(id: month) { await model.loadCycle(month: month) }
        .sheet(item: $editing) { day in
            CycleLogSheet(date: day.date, flow: day.flow, symptoms: day.symptoms, pill: day.pill == "pause" ? nil : day.pill)
        }
    }

    private var days: [CycleDay] {
        guard let cycle = model.cycle, cycle.month == month else { return [] }
        return cycle.days ?? []
    }

    private func dayCell(_ day: CycleDay) -> some View {
        let number = Int(day.date.suffix(2)) ?? 0
        let isToday = day.date == today
        return VStack(spacing: 3) {
            ZStack {
                if day.flow > 0 {
                    Circle().fill(Palette.pink)
                } else if day.ovulation == true {
                    Circle().fill(Palette.amberSoft)
                } else if day.forecast == true {
                    Circle().strokeBorder(Palette.pink, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                }
                if isToday { Circle().strokeBorder(Palette.ink, lineWidth: 2) }
                Text(verbatim: String(number)).font(.footnote.weight(.medium))
                    .foregroundStyle(day.flow > 0 ? Palette.onAccent : day.ovulation == true ? Palette.amber : day.forecast == true ? Palette.pink : Palette.secondary)
            }
            .frame(width: 34, height: 34)
            Group {
                if day.pill == "taken" {
                    Capsule().fill(Palette.indigo)
                } else if day.pill == "planned" {
                    Capsule().strokeBorder(Palette.indigo.opacity(0.5), lineWidth: 1)
                } else {
                    Color.clear
                }
            }
            .frame(width: 12, height: 4)
        }
        .frame(height: 42)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.dayMonth(day.date))
    }

    private var weekdays: [String] {
        L10n.isEnglish ? ["M", "T", "W", "T", "F", "S", "S"] : ["P", "Ú", "S", "Č", "P", "S", "N"]
    }

    /// Empty cells before the 1st (weeks start on Monday).
    private var blanks: Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        guard let first = DateFormatters.iso(timeZone: calendar.timeZone).date(from: month + "-01") else { return 0 }
        return (calendar.component(.weekday, from: first) + 5) % 7
    }

    private var monthTitle: String {
        guard let date = DateFormatters.make("yyyy-MM").date(from: month) else { return month }
        let out = DateFormatters.make(month.prefix(4) == today.prefix(4) ? "LLLL" : "LLLL yyyy", locale: Fmt.locale)
        return Fmt.capitalized(out.string(from: date))
    }

    private func shift(_ by: Int) {
        let f = DateFormatters.make("yyyy-MM")
        guard let date = f.date(from: month), let next = Calendar(identifier: .gregorian).date(byAdding: .month, value: by, to: date) else { return }
        month = f.string(from: next)
    }
}

// MARK: - Settings → Cyklus

struct CycleSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var saving = false
    @State private var error: String?
    @State private var choosingDate = false
    @State private var choosingLength = false
    @State private var choosingPack = false
    @State private var askingConsent = false

    private var settings: CycleSettings? { model.cycle?.settings }
    private var enabled: Bool { settings?.enabled == true }

    var body: some View {
        SettingsPage(title: "Cyklus") {
            SettingsGroup {
                SettingsToggle(title: "Sledovat cyklus", isOn: Binding(get: { enabled }, set: { turn($0) }), disabled: saving)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if enabled, let settings {
                SettingsGroup {
                    NavigationLink { LifeStagePicker() } label: {
                        SettingsRow(title: "Fáze života", value: L10n.tr(CycleSettings.title(ofStage: settings.stage)))
                    }
                    .buttonStyle(.plain)
                }
                if let state = model.cycle?.state, !settings.hormonal, settings.stage == "regular", let day = state.cycleDay, let length = state.length {
                    HStack {
                        Spacer()
                        CycleRing(day: day, length: length, periodLength: state.periodLength ?? 5, ovulationDay: state.ovulationDay, size: 140)
                        Spacer()
                    }
                }
                // Menopause has no periods to date or count.
                if settings.stage != "menopause" { HStack(spacing: 10) {
                    tile(value: lastPeriodText, label: settings.hormonal ? "Poslední krvácení" : "Poslední menstruace") { choosingDate = true }
                    if settings.hormonal {
                        NavigationLink { ContraceptionPicker() } label: {
                            tileBody(value: CycleSettings.title(of: settings.contraception), label: "Antikoncepce", chevron: true)
                        }
                        .buttonStyle(.plain)
                    } else {
                        tile(value: lengthText, label: "Délka cyklu") { choosingLength = true }
                    }
                } }
                SettingsGroup {
                    if !settings.hormonal {
                        NavigationLink { ContraceptionPicker() } label: {
                            SettingsRow(title: "Antikoncepce", value: L10n.tr(CycleSettings.title(of: settings.contraception)))
                        }
                        .buttonStyle(.plain)
                        SettingsDivider()
                    }
                    if settings.contraception == "pill" {
                        Button { choosingPack = true } label: {
                            SettingsRow(title: "První den balení", value: settings.packStart.map { Fmt.dayMonth($0) } ?? L10n.tr("nastavit"))
                        }
                        .buttonStyle(.plain)
                        SettingsDivider()
                    }
                    SettingsToggle(title: "Upravit trénink podle cyklu",
                                   isOn: Binding(get: { settings.adaptTraining }, set: { save(["adaptTraining": .bool($0)]) }), disabled: saving)
                    SettingsDivider()
                    CoachCycleRow(isOn: settings.shareWithCoach == true, disabled: saving,
                                  info: { askingConsent = true },
                                  turn: { on in if on { askingConsent = true } else { save(["shareWithCoach": .bool(false)]) } })
                }
            }
        }
        .sheet(isPresented: $choosingDate) {
            DateChoiceSheet(title: settings?.hormonal == true ? "Poslední krvácení" : "Poslední menstruace", initial: lastPeriod) { save(["lastPeriod": .string($0)]) }
        }
        .sheet(isPresented: $choosingPack) {
            DateChoiceSheet(title: "První den balení", initial: settings?.packStart) { save(["packStart": .string($0)]) }
        }
        .sheet(isPresented: $askingConsent) {
            CoachCycleConsentSheet(isOn: settings?.shareWithCoach == true) { save(["shareWithCoach": .bool(true)]) }
        }
        .sheet(isPresented: $choosingLength) {
            LengthChoiceSheet(initial: settings?.cycleLength ?? model.cycle?.state?.length ?? 28) { save(["cycleLength": .number(Double($0))]) }
        }
        .task { if model.cycle == nil { await model.loadCycle() } }
    }

    private var lastPeriod: String? { model.cycle?.state?.lastStart ?? settings?.lastPeriod }
    private var lastPeriodText: String { lastPeriod.map { Fmt.dayMonth($0) } ?? "–" }
    private var lengthText: String {
        // Perimenopause: the range of the recent cycles, "24–45 dní".
        if settings?.stage == "perimenopause", let range = model.cycle?.state?.range {
            return L10n.plural("%lld–%lld dní", range.shortest, range.longest)
        }
        let n = model.cycle?.state?.length ?? settings?.cycleLength ?? 28
        return L10n.plural("%lld dní", n)
    }

    private func tile(value: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { tileBody(value: value, label: label, chevron: false) }.buttonStyle(.plain)
    }

    private func tileBody(value: String, label: String, chevron: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(verbatim: value).font(Typo.number(26)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 4)
                if chevron { Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint) }
            }
            Text(L10n.tr(label)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 18)
    }

    /// On: Health's permission sheet, then what Health knows fills the setup.
    private func turn(_ on: Bool) {
        guard on else { save(["enabled": .bool(false)]); return }
        saving = true
        Task {
            await CycleHealth.requestAccess()
            let found = await CycleHealth.setup()
            var changes: JSONObject = ["enabled": .bool(true)]
            if settings?.lastPeriod == nil, let last = found.lastPeriod { changes["lastPeriod"] = .string(last) }
            if settings?.cycleLength == nil, let length = found.cycleLength { changes["cycleLength"] = .number(Double(length)) }
            if (settings?.contraception ?? "none") == "none", let c = found.contraception { changes["contraception"] = .string(c) }
            await write(changes)
        }
    }

    private func save(_ changes: JSONObject) {
        saving = true
        Task { await write(changes) }
    }

    private func write(_ changes: JSONObject) async {
        do {
            try await model.saveCycleSettings(changes)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

/// Fáze života: regular cycle, perimenopause or menopause as cards, and
/// hormone therapy once it is not the regular cycle.
struct LifeStagePicker: View {
    @Environment(AppModel.self) private var model
    @State private var saving = false
    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    private var settings: CycleSettings? { model.cycle?.settings }

    var body: some View {
        SettingsPage(title: "Fáze života") {
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(CycleSettings.lifeStages, id: \.id) { option in
                    let on = (settings?.stage ?? "regular") == option.id
                    Button { choose(option.id) } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            Image(systemName: option.symbol).scaledFont(19, weight: .medium, cap: .denseCap)
                                .foregroundStyle(on ? Palette.pink : Palette.secondary)
                                .frame(width: 42, height: 42)
                                .background(on ? Palette.pink.opacity(0.18) : Palette.track, in: Circle())
                            Text(L10n.tr(option.title)).font(Typo.bodyStrong).foregroundStyle(on ? Palette.pink : Palette.ink)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
                        .background(on ? Palette.pinkSoft : Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Palette.pink : Color.clear, lineWidth: 1.5))
                        .overlay(alignment: .topTrailing) {
                            if on {
                                Image(systemName: "checkmark").scaledFont(11, weight: .heavy, cap: .denseCap).foregroundStyle(Palette.onAccent)
                                    .frame(width: 22, height: 22).background(Palette.pink, in: Circle()).padding(10)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if let settings, settings.stage != "regular" {
                SettingsGroup {
                    SettingsToggle(title: "Hormonální terapie", isOn: Binding(get: { settings.hrt == true }, set: { save(["hrt": .bool($0)]) }), disabled: saving)
                }
            }
        }
    }

    private func choose(_ id: String) {
        // Apple Health's hot flashes and night sweats need their permission.
        if id != "regular" { Task { await CycleHealth.requestAccess() } }
        save(["lifeStage": .string(id)])
    }

    private func save(_ changes: JSONObject) {
        saving = true
        Task {
            try? await model.saveCycleSettings(changes)
            saving = false
        }
    }
}

/// Antikoncepce: the choices as cards with icons, two to a row.
struct ContraceptionPicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        SettingsPage(title: "Antikoncepce") {
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(CycleSettings.contraceptions, id: \.id) { option in
                    let on = (model.cycle?.settings?.contraception ?? "none") == option.id
                    Button { choose(option.id) } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            Image(systemName: option.symbol).scaledFont(19, weight: .medium, cap: .denseCap)
                                .foregroundStyle(on ? Palette.pink : Palette.secondary)
                                .frame(width: 42, height: 42)
                                .background(on ? Palette.pink.opacity(0.18) : Palette.track, in: Circle())
                            Text(L10n.tr(option.title)).font(Typo.bodyStrong).foregroundStyle(on ? Palette.pink : Palette.ink)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
                        .background(on ? Palette.pinkSoft : Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Palette.pink : Color.clear, lineWidth: 1.5))
                        .overlay(alignment: .topTrailing) {
                            if on {
                                Image(systemName: "checkmark").scaledFont(11, weight: .heavy, cap: .denseCap).foregroundStyle(Palette.onAccent)
                                    .frame(width: 22, height: 22).background(Palette.pink, in: Circle()).padding(10)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func choose(_ id: String) {
        Task {
            try? await model.saveCycleSettings(["contraception": .string(id)])
            dismiss()
        }
    }
}

/// A day up to today, from a graphical calendar.
struct DateChoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let initial: String?
    let done: (String) -> Void
    @State private var date = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.tr(title)).font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
            DatePicker("", selection: $date, in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()
                .environment(\.locale, Fmt.locale)
            Button {
                done(AppModel.localDate(date))
                dismiss()
            } label: {
                Text("Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .onAppear {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy-MM-dd"
            if let initial, let d = f.date(from: initial) { date = d }
        }
    }
}

/// The cycle's length, 21–40 days.
struct LengthChoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    let initial: Int
    let done: (Int) -> Void
    @State private var length = 28

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Délka cyklu").font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
            Picker("", selection: $length) {
                ForEach(21...40, id: \.self) { n in
                    Text(verbatim: L10n.plural("%lld dní", n)).tag(n)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            Button {
                done(length)
                dismiss()
            } label: {
                Text("Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
        .onAppear { length = min(40, max(21, initial)) }
    }
}

// MARK: - Settings → Oznámení → Antikoncepce

/// The pill reminder: the time, the pack and the pause.
struct PillReminderView: View {
    @Environment(AppModel.self) private var model
    @State private var time = Date()
    @State private var loaded = false
    @State private var choosingPack = false

    private var settings: CycleSettings? { model.cycle?.settings }

    var body: some View {
        SettingsPage(title: "Antikoncepce") {
            VStack(spacing: 4) {
                DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 6)
            .cardSurface(cornerRadius: 18)
            .onChange(of: time) { _, new in
                guard loaded else { return }
                save(["pillReminderTime": .string(clock(new))])
            }

            SettingsGroup {
                SettingsToggle(title: "Připomínat", isOn: Binding(get: { settings?.pillReminder == true }, set: { on in
                    Task {
                        if on { _ = await Reminders.requestPermission() }
                        save(["pillReminder": .bool(on)])
                    }
                }))
            }

            SettingsGroup(title: "Balení") {
                Picker("", selection: Binding(get: { settings?.pillPack ?? "21+7" }, set: { save(["pillPack": .string($0)]) })) {
                    Text(verbatim: "21 + 7").tag("21+7")
                    Text(verbatim: "24 + 4").tag("24+4")
                    Text(verbatim: "28").tag("28")
                }
                .pickerStyle(.segmented)
                .padding(12)
            }

            SettingsGroup {
                Button { choosingPack = true } label: {
                    SettingsRow(title: "První den balení", value: settings?.packStart.map { Fmt.dayMonth($0) } ?? L10n.tr("nastavit"))
                }
                .buttonStyle(.plain)
                SettingsDivider()
                SettingsToggle(title: "Připomínat i v pauze", isOn: Binding(get: { settings?.pillReminderInPause == true }, set: { save(["pillReminderInPause": .bool($0)]) }))
            }
        }
        .sheet(isPresented: $choosingPack) {
            DateChoiceSheet(title: "První den balení", initial: settings?.packStart) { save(["packStart": .string($0)]) }
        }
        .onAppear {
            let parts = (settings?.pillReminderTime ?? "21:00").split(separator: ":").compactMap { Int($0) }
            if parts.count == 2, let d = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date()) { time = d }
            DispatchQueue.main.async { loaded = true }
        }
    }

    private func clock(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 21, c.minute ?? 0)
    }

    private func save(_ changes: JSONObject) {
        Task {
            try? await model.saveCycleSettings(changes)
            if let today = model.today { await Reminders.reschedule(from: today) }
        }
    }
}

/// Settings → Cyklus → "Kouč ví o cyklu": the switch with an "i". Turning it
/// on (or the "i") opens the consent sheet; turning it off needs no sheet.
struct CoachCycleRow: View {
    let isOn: Bool
    let disabled: Bool
    let info: () -> Void
    let turn: (Bool) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("Kouč ví o cyklu").font(.body).foregroundStyle(Palette.ink)
            Button(action: info) {
                Image(systemName: "info.circle").font(.body).foregroundStyle(Palette.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Co to znamená"))
            Spacer(minLength: 8)
            Toggle("", isOn: Binding(get: { isOn }, set: { turn($0) }))
                .labelsHidden()
                .toggleStyle(AurinToggleStyle())
                .disabled(disabled)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 50)
    }
}

/// What sharing the cycle with the AI coach brings, what the coach sees
/// (src/cycle-model.js cycleForCoach) and the explicit consent (GDPR art. 9).
struct CoachCycleConsentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let isOn: Bool
    let accept: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Kouč ví o cyklu").font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Kouč pak plánuje a vysvětluje trénink i podle toho, kde v cyklu jsi.")
                    .font(Typo.sentence(17)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                section("Co tím získáš")
                point("Trénink, který sedí na to, jak se zrovna cítíš")
                point("Srozumitelnější vysvětlení, proč ti kouč co radí")
                point("Ohled na menstruaci při plánování dalších dní")
                section("Co kouč uvidí")
                point("Kde v cyklu dnes jsi a co sis zapsala")
                point("Starší záznamy ani přesná data", included: false)
                Text("Jde o údaje o zdraví (čl. 9 GDPR). Zapnutím dáváš výslovný souhlas s jejich předáním AI kouči. Kdykoli ho vypneš a kouč je přestane dostávat.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
                if !isOn {
                    Button {
                        accept()
                        dismiss()
                    } label: {
                        Text("Zapnout").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 18)
                }
                Button { dismiss() } label: {
                    Text(isOn ? "Zavřít" : "Teď ne").font(Typo.body).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.18)))
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    private func section(_ title: LocalizedStringKey) -> some View {
        Text(title).font(Typo.caption).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.muted)
            .padding(.top, 18).padding(.bottom, 4)
    }

    private func point(_ text: LocalizedStringKey, included: Bool = true) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: included ? "checkmark" : "xmark").font(.footnote.weight(.semibold))
                .foregroundStyle(included ? Palette.green : Palette.muted)
            Text(text).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 5)
    }
}
