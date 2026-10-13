import SwiftUI

/// GET /app/api/plans (src/training-plans.js): the plans to choose from and
/// the active one. The plan sets the week (key sessions, the long one, the
/// load); the coach still decides each day from readiness.
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
        let templateId: String
        let name: String
        let startDate: String
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
        let template: Template
    }

    struct Started: Decodable, Equatable {
        let firstWeek: Int
        let addedDays: [Int]
    }

    let templates: [Template]
    let active: Active?
    /// The gym plan runs beside a ride or run plan.
    let activeGym: Active?
    let started: Started?

    func active(for sport: String) -> Active? { sport == "gym" ? activeGym : active }
}

extension APIClient {
    func trainingPlans() async throws -> TrainingPlans {
        try await get("/app/api/plans")
    }

    func trainingPlanAction(_ body: JSONObject) async throws -> TrainingPlans {
        try await send("/app/api/plans", method: "POST", body: body)
    }
}

/// On Training: the active plan with its weeks, or a button to choose one.
struct TrainingPlanCard: View {
    @Environment(AppModel.self) private var model
    @State private var plans: TrainingPlans?
    @State private var showing = false
    /// Loaded or failed: "Vybrat plán" shows only then, so an active plan does not flash it.
    @State private var tried = false

    var body: some View {
        // A container that is always there: on an empty Group the task below
        // never runs, so the plans never loaded and the card stayed hidden.
        VStack(spacing: 12) {
            if let active = plans?.active { button(ActivePlanSummary(active: active)) }
            if let gym = plans?.activeGym { button(ActivePlanSummary(active: gym)) }
            if tried && plans?.active == nil && plans?.activeGym == nil { button(choose) }
        }
        .task {
            guard !model.demo else { return }
            await load()
        }
        .sheet(isPresented: $showing, onDismiss: { Task { await load() } }) {
            if let plans { TrainingPlansSheet(plans: plans) }
        }
    }

    /// Opens the plans; when they have not loaded yet (no signal), tries again first.
    private func button(_ label: some View) -> some View {
        Button {
            if plans != nil { showing = true; return }
            Task { await load(); showing = plans != nil }
        } label: { label }
        .buttonStyle(.plain)
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

    private func load() async {
        if let fresh = try? await model.api.trainingPlans() { plans = fresh }
        tried = true
    }
}

/// The active plan: its name, the weeks as a strip (done, now, ahead) and
/// this week's key sessions.
struct ActivePlanSummary: View {
    let active: TrainingPlans.Active

    var body: some View {
        Card {
            WidgetHeader(title: L10n.tr("Plán"), color: Palette.amberBar,
                         trailing: active.paused == true ? L10n.tr("pozastaveno") : active.started ? L10n.f("týden %@/%@", String(active.week), String(active.weeksCount)) : L10n.f("od %@", Fmt.dayMonth(active.startDate)))
            Text(active.name).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            WeekStrip(weeks: active.template.weeks, current: active.started ? active.week : 0)
            if active.started, let week = active.template.weeks.first(where: { $0.week == active.week }) {
                Text(([active.returning == true ? L10n.tr("návrat") : week.phaseLabel] + week.keys.prefix(active.returning == true ? 1 : week.keys.count)).joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One capsule a week: lighter weeks lower, the race week green.
struct WeekStrip: View {
    let weeks: [TrainingPlans.Week]
    let current: Int

    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(weeks) { w in
                Capsule()
                    .fill(color(w))
                    .frame(height: w.race ? 14 : w.load < 0.8 ? 7 : 12)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 14, alignment: .bottom)
        .accessibilityHidden(true)
    }

    private func color(_ w: TrainingPlans.Week) -> Color {
        if w.race { return w.week <= current ? Palette.green : Palette.green.opacity(0.4) }
        if w.week == current { return Palette.amberBar }
        return w.week < current ? Palette.amberBar.opacity(0.45) : Palette.track
    }
}

/// Choosing a plan: running or cycling, the plans, and one plan's weeks.
struct TrainingPlansSheet: View {
    @Environment(\.dismiss) private var dismiss
    let plans: TrainingPlans
    @State private var sport = "run"

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Tréninkové plány") {
                ForEach([plans.active, plans.activeGym].compactMap { $0 }, id: \.templateId) { active in
                    NavigationLink { PlanDetailView(template: active.template, active: active) } label: {
                        ActivePlanSummary(active: active)
                    }
                    .buttonStyle(.plain)
                }
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
                        NavigationLink { PlanDetailView(template: template, active: plans.active(for: template.sport == "gym" ? "gym" : "endurance")) } label: {
                            SettingsRow(title: template.name, value: "\(template.weeksCount) " + Fmt.plural(template.weeksCount, "týden", "týdny", "týdnů"))
                        }
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
}

/// One plan: its weeks, and starting it (on a race date for race plans) or
/// ending it when it is the active one.
struct PlanDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let template: TrainingPlans.Template
    let active: TrainingPlans.Active?
    @State private var raceDate = Date()
    @State private var raceKm: Double = 0
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
                    if isActive && template.sport != "gym" {
                        NavigationLink { PlanWeekView(week: week, sport: template.sport) } label: { weekRow(week) }
                            .buttonStyle(.plain)
                    } else {
                        weekRow(week)
                    }
                }
            }
            if let started {
                startedNote(started)
            } else if isActive {
                SecondaryButton(title: "Ukončit plán", systemImage: "xmark") { confirmStop = true }
                    .disabled(busy || model.demo)
            } else {
                startForm
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .onAppear {
            raceKm = template.race?.km ?? 0
            raceDate = Calendar.current.date(byAdding: .day, value: template.weeksCount * 7, to: Date()) ?? Date()
        }
        .confirmationDialog("Ukončit plán?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Ukončit plán", role: .destructive) { Task { await act(["action": .string("stop"), "sport": .string(template.sport)]) } }
        }
    }

    private func weekRow(_ week: TrainingPlans.Week) -> some View {
        let now = isActive && active?.started == true && active?.week == week.week
        return HStack(alignment: .top, spacing: 12) {
            Text(String(week.week))
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(now ? Palette.onButton : Palette.ink)
                .frame(width: 28, height: 28)
                .background(now ? Palette.button : Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(week.phaseLabel).font(.subheadline.weight(.semibold)).foregroundStyle(week.load < 0.8 ? Palette.muted : Palette.ink)
                let lines = week.keys + (week.longMinutes.map { [L10n.f("dlouhý %@", Fmt.duration($0))] } ?? []) + (week.race ? [L10n.tr("závod")] : [])
                if !lines.isEmpty {
                    Text(lines.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if isActive && template.sport != "gym" {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var startForm: some View {
        if let race = template.race {
            SettingsGroup {
                DatePicker("Datum závodu", selection: $raceDate, in: Date()..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
                    .padding(.horizontal, 16).frame(minHeight: 50)
                if let options = race.options, options.count > 1 {
                    SettingsDivider()
                    Picker("Vzdálenost", selection: $raceKm) {
                        ForEach(options, id: \.self) { Text(Units.distanceText($0)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(16)
                }
            }
        }
        PrimaryButton(title: L10n.tr(active == nil ? "Začít plán" : "Začít tento plán"), systemImage: "flag", busy: busy) {
            var body: JSONObject = ["action": .string("start"), "templateId": .string(template.id)]
            if template.race != nil {
                body["raceDate"] = .string(AppModel.localDate(raceDate))
                body["raceKm"] = .number(raceKm)
            }
            Task { await act(body) }
        }
        .disabled(busy || model.demo)
    }

    private func startedNote(_ s: TrainingPlans.Started) -> some View {
        Card {
            WidgetHeader(title: L10n.tr("Plán začíná"), color: Palette.green)
            Text(s.firstWeek > 1 ? L10n.f("Začínáš týdnem %@.", String(s.firstWeek)) : L10n.f("První týden od %@.", Fmt.dayMonth(startDate ?? "")))
                .font(Typo.sentence(20)).foregroundStyle(Palette.ink)
            if !s.addedDays.isEmpty, let monday = startDate {
                Text(L10n.f("Do týdenního plánu jsem přidal: %@.", s.addedDays.map { Fmt.weekdayShort(ISODay.shift(monday, $0)) }.joined(separator: ", ")))
                    .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
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
                startDate = result.active?.startDate
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

// MARK: - One week of the plan

/// GET /app/api/plans/week?week=N.
struct PlanWeekDetail: Decodable, Equatable {
    struct Session: Decodable, Equatable, Identifiable {
        var id: String { date + (workoutId ?? "") }
        let date: String
        let label: String?
        let kind: String
        let minutes: Double?
        let workoutId: String?
        let workout: PlannedWorkout.Workout?
    }
    let week: Int
    let weeksCount: Int
    let monday: String
    let phaseLabel: String?
    let sessions: [Session]
}

extension APIClient {
    func trainingPlanWeek(_ week: Int) async throws -> PlanWeekDetail {
        try await get("/app/api/plans/week?week=\(week)")
    }
}

/// A week of the plan: its sessions, each with its profile; tap for the session.
struct PlanWeekView: View {
    @Environment(AppModel.self) private var model
    let week: TrainingPlans.Week
    let sport: String
    @State private var detail: PlanWeekDetail?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: L10n.f("Týden %@", String(week.week)) + (detail.map { " · " + Fmt.dayMonth($0.monday) + "–" + Fmt.dayMonth(ISODay.shift($0.monday, 6)) } ?? "")).padding(.top, 24)
                Text(Fmt.capitalized(week.phaseLabel)).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let detail {
                    Card {
                        ForEach(Array(detail.sessions.enumerated()), id: \.element.id) { index, s in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            NavigationLink { PlanSessionView(session: s, sport: sport) } label: { row(s) }
                                .buttonStyle(.plain)
                                .disabled(s.workout == nil)
                        }
                    }
                    .padding(.top, 18)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 18)
                } else {
                    ProgressView().padding(.top, 30).frame(maxWidth: .infinity)
                }
            }
        }
        .task {
            guard detail == nil, !model.demo else { return }
            do { detail = try await model.api.trainingPlanWeek(week.week) } catch { self.error = error.localizedDescription }
        }
    }

    private func row(_ s: PlanWeekDetail.Session) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.workout?.name ?? s.label ?? "").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(Fmt.weekdayShort(s.date) + " " + Fmt.dayMonth(s.date) + (s.minutes.map { " · " + Fmt.duration(Int($0)) } ?? ""))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            if let blocks = s.workout?.steps, !WorkoutProfile.segments(blocks).isEmpty {
                WorkoutProfile(blocks: blocks, sport: sport, compact: true)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

/// One session of the plan: its profile, steps and sending it to the watch.
struct PlanSessionView: View {
    @Environment(AppModel.self) private var model
    let session: PlanWeekDetail.Session
    let sport: String

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
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
