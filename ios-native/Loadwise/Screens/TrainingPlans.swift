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

    var body: some View {
        Group {
            if let plans {
                Button { showing = true } label: {
                    VStack(spacing: 12) {
                        if let active = plans.active { ActivePlanSummary(active: active) }
                        if let gym = plans.activeGym { ActivePlanSummary(active: gym) }
                        if plans.active == nil && plans.activeGym == nil { choose }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .task {
            guard !model.demo else { return }
            await load()
        }
        .sheet(isPresented: $showing, onDismiss: { Task { await load() } }) {
            if let plans { TrainingPlansSheet(plans: plans) }
        }
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
        plans = try? await model.api.trainingPlans()
    }
}

/// The active plan: its name, the weeks as a strip (done, now, ahead) and
/// this week's key sessions.
struct ActivePlanSummary: View {
    let active: TrainingPlans.Active

    var body: some View {
        Card {
            WidgetHeader(title: L10n.tr("Plán"), color: Palette.amberBar,
                         trailing: active.started ? L10n.f("týden %@/%@", String(active.week), String(active.weeksCount)) : L10n.f("od %@", Fmt.dayMonth(active.startDate)))
            Text(active.name).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            WeekStrip(weeks: active.template.weeks, current: active.started ? active.week : 0)
            if active.started, let week = active.template.weeks.first(where: { $0.week == active.week }) {
                Text(([week.phaseLabel] + week.keys).joined(separator: " · "))
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
                    weekRow(week)
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
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
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
