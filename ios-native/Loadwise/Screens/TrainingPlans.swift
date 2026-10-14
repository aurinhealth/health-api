import SwiftUI

/// GET /app/api/plans (src/training-plans.js): the plans to choose from, the
/// active one and a finished plan's result. The plan sets the week (key
/// sessions, the long one, the load); the coach still decides each day from
/// readiness.
struct TrainingPlans: Decodable, Equatable {
    struct Week: Decodable, Equatable, Identifiable {
        var id: Int { week }
        let week: Int
        let phase: String
        let phaseLabel: String
        let load: Double
        let keys: [String]
        let longMinutes: Int?
        let race: Bool
    }

    struct Race: Decodable, Equatable {
        let km: Double
        let options: [Double]?
    }

    struct Template: Decodable, Equatable, Identifiable {
        let id: String
        let sport: String
        let name: String
        let goal: String
        let description: String
        let level: String
        let weeksCount: Int
        let days: [Int]
        let race: Race?
        let weeks: [Week]
    }

    struct Active: Decodable, Equatable {
        var id: Int? = nil
        let templateId: String
        let name: String
        let startDate: String
        /// Started mid-week: the first week runs from this day.
        var firstDay: String? = nil
        var endDate: String? = nil
        let raceDate: String?
        let raceKm: Double?
        let week: Int
        let weeksCount: Int
        let phaseLabel: String?
        let started: Bool
        /// Sick, injured or on a break: the plan waits, then goes on.
        let paused: Bool?
        /// Weeks the plan moved later (a break, a week of missed sessions).
        let shiftedWeeks: Int?
        /// A lighter week after a break in a race plan.
        let returning: Bool?
        /// Fewer training days chosen for this week.
        var weekDays: Int? = nil
        /// Each past week done, in % (keys are week numbers).
        var completion: [String: Int]? = nil
        let template: Template

        func done(_ week: Int) -> Int? { completion?[String(week)] }
    }

    struct Started: Decodable, Equatable {
        let firstWeek: Int
        let addedDays: [Int]
    }

    let templates: [Template]
    let active: Active?
    /// The gym plan runs beside a ride or run plan.
    let activeGym: Active?
    var finished: PlanResult? = nil
    let started: Started?

    func active(for sport: String) -> Active? { sport == "gym" ? activeGym : active }
}

/// GET /app/api/plans/preview: the plan's weeks before it starts (or the
/// running plan's with ?active=1), an estimate from the athlete's days and fitness.
struct PlanPreview: Decodable, Equatable {
    struct Week: Decodable, Equatable, Identifiable {
        var id: Int { week }
        let week: Int
        let phase: String
        let phaseLabel: String
        let keys: [String]
        let race: Bool
        let sessions: Int
        let minutes: Int
        let tss: Int
    }
    struct Totals: Decodable, Equatable {
        let sessions: Int
        let minutes: Int
        let tss: Int
    }
    let startDate: String
    var firstDay: String? = nil
    let endDate: String
    let days: [Int]
    let weeks: [Week]
    let totals: Totals
    var raceDate: String? = nil
}

/// A finished plan: FTP and fitness before and after, what was done.
struct PlanResult: Decodable, Equatable {
    struct Next: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let goal: String
    }
    let id: Int
    let templateId: String
    let name: String
    let sport: String
    let startDate: String
    let endDate: String
    let ftpStart: Double?
    let ftpEnd: Double?
    let ctlStart: Double?
    let ctlEnd: Double?
    let sessionsDone: Int
    let sessionsPlanned: Int?
    let minutesDone: Int
    let minutesPlanned: Int?
    let completion: [String: Int]
    let weeks: [TrainingPlans.Week]
    let next: [Next]
}

extension APIClient {
    func trainingPlans() async throws -> TrainingPlans {
        try await get("/app/api/plans")
    }

    func trainingPlanAction(_ body: JSONObject) async throws -> TrainingPlans {
        try await send("/app/api/plans", method: "POST", body: body)
    }

    func trainingPlanPreview(templateId: String? = nil, startDate: String? = nil, days: [Int]? = nil, raceDate: String? = nil) async throws -> PlanPreview {
        var query = templateId == nil ? ["active=1"] : ["templateId=" + templateId!]
        if let startDate { query.append("startDate=" + startDate) }
        if let days, !days.isEmpty { query.append("days=" + days.map(String.init).joined(separator: ",")) }
        if let raceDate { query.append("raceDate=" + raceDate) }
        return try await get("/app/api/plans/preview?" + query.joined(separator: "&"))
    }
}

// MARK: - Colours

/// The plan's colours: weeks ahead by their phase, past weeks by how much was done.
enum PlanColors {
    static func phase(_ phase: String) -> Color {
        switch phase {
        case "test": Palette.blue
        case "peak": Palette.amber
        case "recovery", "taper": Palette.sand
        case "race": Palette.green
        default: Palette.amberBar
        }
    }

    /// 90 % and more green, 75–89 gold, 50–74 amber, less rust.
    static func done(_ percent: Int) -> Color {
        percent >= 90 ? Palette.green : percent >= 75 ? Palette.gold : percent >= 50 ? Palette.amber : Palette.rust
    }
}

/// "4,8 h" over a bar: hours with one decimal.
private func hoursLabel(_ minutes: Int) -> String {
    let hours = Double(minutes) / 60
    let text = hours.rounded() == hours ? String(Int(hours)) : String(format: "%.1f", locale: Fmt.locale, hours)
    return text + " h"
}

/// "4 h 50" in the plan's rows.
func planDuration(_ minutes: Int) -> String {
    minutes >= 60 ? "\(minutes / 60) h" + (minutes % 60 > 0 ? String(format: " %02d", minutes % 60) : "") : "\(minutes) min"
}

// MARK: - The weeks as bars

/// One bar a week: its height the time (or the load), past weeks coloured by
/// how much was done with the % above, weeks ahead by phase with the hours.
struct PlanWeeksChart: View {
    struct Bar: Identifiable {
        var id: Int { week }
        let week: Int
        let phase: String
        let value: Double
        let minutes: Int?
        let done: Int?
    }
    let bars: [Bar]
    var current = 0
    /// On Training's card: the bars only.
    var compact = false

    var body: some View {
        let top = max(bars.map(\.value).max() ?? 1, 0.01)
        let height: CGFloat = compact ? 40 : 96
        HStack(alignment: .bottom, spacing: compact ? 4 : 6) {
            ForEach(bars) { bar in
                let color = bar.done.map(PlanColors.done) ?? PlanColors.phase(bar.phase)
                VStack(spacing: 6) {
                    VStack(spacing: 4) {
                        Spacer(minLength: 0)
                        if !compact, let label = bar.done.map({ "\($0) %" }) ?? bar.minutes.map(hoursLabel) {
                            Text(label)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(bar.done != nil ? color : Palette.secondary)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                        RoundedRectangle(cornerRadius: compact ? 5 : 7, style: .continuous)
                            .fill(color)
                            .frame(height: max(4, height * CGFloat(bar.value / top)))
                            .overlay {
                                if bar.week == current {
                                    RoundedRectangle(cornerRadius: compact ? 5 : 7, style: .continuous).stroke(Palette.ink, lineWidth: 2)
                                }
                            }
                    }
                    .frame(height: height + (compact ? 0 : 18))
                    if !compact {
                        Text(String(bar.week))
                            .font(.caption.weight(bar.week == current ? .semibold : .medium).monospacedDigit())
                            .foregroundStyle(bar.week == current ? Palette.ink : Palette.faint)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    /// The plan's weeks; with a preview the bars are the time, else the load.
    static func bars(weeks: [TrainingPlans.Week], preview: PlanPreview? = nil, active: TrainingPlans.Active? = nil, completion: [String: Int]? = nil) -> [Bar] {
        weeks.map { w in
            let minutes = preview?.weeks.first { $0.week == w.week }?.minutes
            let done = (completion ?? active?.completion)?[String(w.week)]
            return Bar(week: w.week, phase: w.phase, value: minutes.map(Double.init) ?? w.load, minutes: minutes, done: done)
        }
    }
}

/// The phases the colours stand for, under the chart before the start.
struct PlanLegend: View {
    let weeks: [TrainingPlans.Week]

    var body: some View {
        let phases = weeks.reduce(into: [TrainingPlans.Week]()) { list, w in
            if !list.contains(where: { $0.phase == w.phase }) { list.append(w) }
        }
        HStack(spacing: 14) {
            ForEach(phases, id: \.phase) { w in
                HStack(spacing: 6) {
                    Circle().fill(PlanColors.phase(w.phase)).frame(width: 8, height: 8)
                    Text(w.phaseLabel).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
        }
    }
}

/// A row of a week: its number (coloured once done), phase, key sessions and
/// either the sessions and time or how much was done.
struct PlanWeekRow: View {
    let week: Int
    let phase: String
    let phaseLabel: String
    let keys: [String]
    var sessions: Int? = nil
    var minutes: Int? = nil
    var done: Int? = nil
    var current = false
    var chevron = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String(week))
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(done != nil || current ? Palette.onAccent : Palette.ink)
                .frame(width: 28, height: 28)
                .background(done.map(PlanColors.done) ?? (current ? Palette.button : Palette.track), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(phaseLabel).font(Typo.bodyStrong)
                        .foregroundStyle(phase == "recovery" || phase == "taper" ? Palette.muted : Palette.ink)
                    Spacer(minLength: 8)
                    if let done {
                        Text("\(done) %").font(.footnote.weight(.semibold)).foregroundStyle(PlanColors.done(done))
                    } else if let sessions, let minutes {
                        Text("\(sessions)× · " + planDuration(minutes)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                if !keys.isEmpty {
                    Text(keys.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint).padding(.top, 2)
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - On Training

/// On Training: the active plan (a tap opens it), a finished plan's result,
/// or a button to choose one.
struct TrainingPlanCard: View {
    @Environment(AppModel.self) private var model
    @State private var plans: TrainingPlans?
    @State private var choosing = false
    /// Loaded or failed: "Vybrat plán" shows only then, so an active plan does not flash it.
    @State private var tried = false

    var body: some View {
        // A container that is always there: on an empty Group the task below
        // never runs, so the plans never loaded and the card stayed hidden.
        VStack(spacing: 12) {
            if let plans, let active = plans.active {
                NavigationLink { ActivePlanView(plans: plans) } label: { ActivePlanSummary(active: active) }
                    .buttonStyle(.plain)
            } else if let result = plans?.finished {
                NavigationLink { PlanResultView(result: result, plans: plans) } label: { finishedCard(result) }
                    .buttonStyle(.plain)
            }
            if let plans, let gym = plans.activeGym {
                NavigationLink { PlanDetailView(template: gym.template, active: gym) } label: { ActivePlanSummary(active: gym) }
                    .buttonStyle(.plain)
            }
            if tried && plans?.active == nil && plans?.activeGym == nil && plans?.finished == nil {
                Button { open() } label: { choose }.buttonStyle(.plain)
            }
        }
        .task {
            guard !model.demo else { return }
            await load()
        }
        .onAppear { if tried, !model.demo { Task { await load() } } }
        .sheet(isPresented: $choosing, onDismiss: { Task { await load() } }) {
            if let plans { TrainingPlansSheet(plans: plans) }
        }
    }

    /// Opens the list; when the plans have not loaded yet (no signal), tries again first.
    private func open() {
        if plans != nil { choosing = true; return }
        Task { await load(); choosing = plans != nil }
    }

    private var choose: some View {
        Card {
            WidgetHeader(title: L10n.tr("Tréninkový plán"), color: Palette.amberBar)
            HStack {
                Text("Vybrat plán").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
    }

    private func finishedCard(_ result: PlanResult) -> some View {
        Card {
            WidgetHeader(title: L10n.tr("Plán splněn"), color: Palette.green)
            HStack {
                Text(result.name).font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
    }

    private func load() async {
        if let fresh = try? await model.api.trainingPlans() { plans = fresh }
        tried = true
    }
}

/// The active plan on Training: its name, the weeks as small bars (past ones
/// coloured by how much was done) and this week's key sessions.
struct ActivePlanSummary: View {
    let active: TrainingPlans.Active

    var body: some View {
        Card {
            WidgetHeader(title: L10n.tr("Plán"), color: Palette.amberBar,
                         trailing: active.paused == true ? L10n.tr("pozastaveno") : active.started ? L10n.f("týden %@/%@", String(active.week), String(active.weeksCount)) : L10n.f("od %@", Fmt.dayMonth(active.firstDay ?? active.startDate)))
            Text(active.name).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            PlanWeeksChart(bars: PlanWeeksChart.bars(weeks: active.template.weeks, active: active), current: active.started ? active.week : 0, compact: true)
            if active.started, let week = active.template.weeks.first(where: { $0.week == active.week }) {
                Text(([active.returning == true ? L10n.tr("návrat") : week.phaseLabel] + week.keys.prefix(active.returning == true ? 1 : week.keys.count)).joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Choosing a plan: running, cycling or the gym, and the plans with their goal.
struct TrainingPlansSheet: View {
    @Environment(\.dismiss) private var dismiss
    let plans: TrainingPlans
    @State private var sport = "run"

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Tréninkové plány") {
                Picker("Sport", selection: $sport) {
                    Text("Běh").tag("run")
                    Text("Kolo").tag("ride")
                    Text("Posilovna").tag("gym")
                }
                .pickerStyle(.segmented)
                SettingsGroup {
                    let list = plans.templates.filter { $0.sport == sport }
                    ForEach(Array(list.enumerated()), id: \.element.id) { index, template in
                        if index > 0 { SettingsDivider() }
                        NavigationLink {
                            if template.sport == "gym" {
                                PlanDetailView(template: template, active: plans.activeGym)
                            } else {
                                PlanPreviewView(template: template, replacing: plans.active, done: { dismiss() })
                            }
                        } label: { row(template) }
                        .buttonStyle(.plain)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { dismiss() } }
            }
        }
        .onAppear { sport = plans.active?.template.sport ?? "run" }
    }

    private func row(_ template: TrainingPlans.Template) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(template.name).font(.body).foregroundStyle(Palette.ink)
                Text(template.goal).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text("\(template.weeksCount) " + Fmt.plural(template.weeksCount, "týden", "týdny", "týdnů")).font(.body).foregroundStyle(Palette.muted)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// A gym plan: its weeks, and starting it or ending it when it is the active one.
struct PlanDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let template: TrainingPlans.Template
    let active: TrainingPlans.Active?
    @State private var busy = false
    @State private var error: String?
    @State private var started: TrainingPlans.Started?
    @State private var startDate: String?
    @State private var confirmStop = false

    private var isActive: Bool { active?.templateId == template.id }

    var body: some View {
        SettingsPage(title: template.name) {
            VStack(alignment: .leading, spacing: 6) {
                Text(template.goal).font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Text(template.description).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            SettingsGroup {
                ForEach(Array(template.weeks.enumerated()), id: \.element.id) { index, week in
                    if index > 0 { SettingsDivider() }
                    PlanWeekRow(week: week.week, phase: week.phase, phaseLabel: week.phaseLabel, keys: week.keys,
                                current: isActive && active?.started == true && active?.week == week.week)
                        .padding(.horizontal, 16)
                }
            }
            if let started {
                Card {
                    WidgetHeader(title: L10n.tr("Plán začíná"), color: Palette.green)
                    Text(started.firstWeek > 1 ? L10n.f("Začínáš týdnem %@.", String(started.firstWeek)) : L10n.f("První týden od %@.", Fmt.dayMonth(startDate ?? "")))
                        .font(Typo.sentence(20)).foregroundStyle(Palette.ink)
                }
            } else if isActive {
                SecondaryButton(title: "Ukončit plán", systemImage: "xmark") { confirmStop = true }
                    .disabled(busy || model.demo)
            } else {
                PrimaryButton(title: L10n.tr(active == nil ? "Začít plán" : "Začít tento plán"), systemImage: "flag", busy: busy) {
                    Task { await act(["action": .string("start"), "templateId": .string(template.id)]) }
                }
                .disabled(busy || model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .confirmationDialog("Ukončit plán?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Ukončit plán", role: .destructive) { Task { await act(["action": .string("stop"), "sport": .string(template.sport)]) } }
        }
    }

    private func act(_ body: JSONObject) async {
        busy = true
        defer { busy = false }
        do {
            let result = try await model.api.trainingPlanAction(body)
            error = nil
            await model.refreshTraining()
            if let s = result.started {
                startDate = result.activeGym?.startDate
                started = s
            } else {
                dismiss()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - The plan asks (Today)

/// On Today: what the plan proposes (a missed session moved, last week
/// repeated, a lighter week back from a break). Nothing changes until the
/// athlete chooses; the change can be undone.
struct PlanProposalCard: View {
    @Environment(AppModel.self) private var model
    let proposal: TodaySnapshot.PlanProposal
    @State private var choice: String?
    @State private var picking = false
    @State private var busy = false
    @State private var done: String?
    @State private var error: String?

    private var selected: TodaySnapshot.PlanProposal.Option? {
        proposal.options.first { $0.id == (choice ?? proposal.options.first { $0.recommended == true }?.id ?? proposal.options.first?.id) }
    }

    var body: some View {
        Card {
            if let done {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.onAccent)
                        .frame(width: 28, height: 28).background(Palette.green, in: Circle())
                    Text(done).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Button { Task { await undo() } } label: {
                        Label("Zpět", systemImage: "arrow.uturn.backward").font(Typo.bodyStrong).foregroundStyle(Palette.amber)
                    }
                    .disabled(busy)
                }
            } else {
                WidgetHeader(title: proposal.title, color: Palette.amberBar)
                Text(proposal.text).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 0) {
                    ForEach(Array(proposal.options.enumerated()), id: \.element.id) { index, option in
                        if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                        Button { choice = option.id } label: { row(option) }.buttonStyle(.plain)
                    }
                }
                HStack(spacing: 10) {
                    PrimaryButton(title: selected?.id == "pick" ? L10n.tr("Vybrat den") : proposal.button, busy: busy) {
                        if selected?.id == "pick" { picking = true } else { Task { await apply(selected) } }
                    }
                    SecondaryButton(title: "Nechat") { Task { await send(["choice": .string("keep")], done: nil) } }
                        .frame(width: 120)
                }
                .disabled(busy || model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .sheet(isPresented: $picking) {
            PlanDayPicker(title: proposal.text, days: proposal.days ?? []) { date in
                picking = false
                Task { await send(["choice": .string("move"), "date": .string(date)], done: L10n.f("Přesunuto na %@", Fmt.dayMonth(date))) }
            }
            .presentationDetents([.height(300)])
        }
    }

    private func row(_ option: TodaySnapshot.PlanProposal.Option) -> some View {
        let on = option.id == selected?.id
        return HStack(spacing: 12) {
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 21)).foregroundStyle(on ? Palette.amberBar : Palette.faint)
            Text(option.label).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            if option.recommended == true {
                Text("doporučeno").font(.caption2.weight(.medium)).foregroundStyle(Palette.amber)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(Palette.amberSoft, in: Capsule())
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func apply(_ option: TodaySnapshot.PlanProposal.Option?) async {
        guard let option else { return }
        var body: JSONObject = ["choice": .string(option.id)]
        if let date = option.date { body["date"] = .string(date) }
        await send(body, done: option.label)
    }

    private func send(_ body: JSONObject, done label: String?) async {
        busy = true
        defer { busy = false }
        do {
            var b = body
            b["action"] = .string("proposal")
            _ = try await model.api.trainingPlanAction(b)
            error = nil
            if let label { done = label } else { await model.refresh() }
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func undo() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.api.trainingPlanAction(["action": .string("undo")])
            done = nil
            await model.refresh()
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The days left in the week for a missed session, and its time (any time).
struct PlanDayPicker: View {
    let title: String
    let days: [String]
    let pick: (String) -> Void
    @State private var day: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Přesunout trénink").font(.headline).foregroundStyle(Palette.ink)
            HStack(spacing: 8) {
                ForEach(days, id: \.self) { d in
                    Button { day = d } label: {
                        VStack(spacing: 2) {
                            Text(Fmt.weekdayShort(d)).font(.caption.weight(.medium))
                            Text(String(Int(d.suffix(2)) ?? 0)).font(Typo.number(22))
                        }
                        .foregroundStyle(day == d ? Palette.onAccent : Palette.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(day == d ? Palette.amberBar : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            PrimaryButton(title: day.map { L10n.f("Přesunout na %@", Fmt.weekdayShort($0)) } ?? L10n.tr("Vyber den")) {
                if let day { pick(day) }
            }
            .disabled(day == nil)
        }
        .padding(20)
        .onAppear { day = days.first }
    }
}

/// On Today while sick, injured or on a break with a plan: the plan waits;
/// back to training, or the status for longer.
struct PlanPausedCard: View {
    @Environment(AppModel.self) private var model
    @State private var editing = false
    @State private var busy = false

    var body: some View {
        let status = model.athleteStatus ?? .active
        let kind = AthleteStatusKind.from(status.status)
        Card {
            WidgetHeader(title: L10n.tr("Stav"), color: kind.color)
            Text(kind.title + (status.statusUntil.map { " " + AthleteStatusSheet.untilText($0) } ?? ""))
                .font(Typo.sentence(20)).foregroundStyle(Palette.ink)
            HStack(spacing: 10) {
                SecondaryButton(title: "Už jsem v pořádku") {
                    Task {
                        busy = true
                        defer { busy = false }
                        try? await model.setAthleteStatus("active", until: nil, note: nil)
                    }
                }
                SecondaryButton(title: "Prodloužit") { editing = true }
            }
            .disabled(busy || model.demo)
        }
        .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
    }
}

// MARK: - One session of the plan

/// One session of the plan: its profile, steps and sending it to the watch.
struct PlanSessionView: View {
    @Environment(AppModel.self) private var model
    let session: PlanWeekDetail.Session
    let sport: String

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: session.workout?.name ?? session.label) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: Fmt.capitalized(Fmt.weekdayShort(session.date)) + " " + Fmt.dayMonth(session.date)).padding(.top, 24)
                Text(session.workout?.name ?? session.label ?? "").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                HStack(spacing: 18) {
                    if let m = session.workout?.duration_minutes ?? session.minutes { meta("Délka", Fmt.duration(Int(m))) }
                    if let t = session.workout?.target_load { meta("Zátěž", Fmt.int(t) + " TSS") }
                    if let f = session.workout?.intensity_factor { meta("IF", Fmt.decimal(f, digits: 2)) }
                }
                .padding(.top, 16)
                if let blocks = session.workout?.steps, !WorkoutProfile.segments(blocks).isEmpty {
                    Card { WorkoutProfile(blocks: blocks, sport: sport) }.padding(.top, 16)
                    SectionLabel(text: "Průběh").padding(.top, 26)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                    .padding(.top, 10)
                }
                if let description = session.workout?.description, !description.isEmpty {
                    Text(description).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
                }
                if let workout = session.workout, !model.demo {
                    WatchWorkoutButton(workout: workout, title: workout.name ?? session.label ?? "").padding(.top, 18)
                }
            }
        }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(LocalizedStringKey(title)).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }
}
