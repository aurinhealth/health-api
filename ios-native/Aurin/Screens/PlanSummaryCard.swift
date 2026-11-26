import SwiftUI

/// Training (redesign T): the plan card under the week strip. The plan's name,
/// "Plan, week 8 of 13, Build", the race countdown and the phases as a row of
/// bars (done pale, the current one full, the rest grey). Without a plan one
/// row, "No training plan" with "Choose a plan". It replaces the race card and
/// the plan tile of the old tools row.
struct PlanSummaryCard: View {
    @Environment(AppModel.self) private var model
    let training: TrainingSnapshot
    @State private var plans: TrainingPlans?
    @State private var tried = false
    @State private var choosing = false

    var body: some View {
        Group {
            if let card {
                RouteLink(route: .trainingPlan) { PlanCardBody(card: card) }
            } else if tried || model.demo {
                Button(action: open) {
                    HStack(spacing: 8) {
                        Text(verbatim: L10n.tr("Žádný tréninkový plán")).font(Typo.body).foregroundStyle(Palette.muted)
                        Spacer(minLength: 8)
                        Text(verbatim: L10n.tr("Vybrat plán")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 52)
                    .cardSurface(cornerRadius: 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableCardStyle())
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
            }
        }
        .task {
            guard !model.demo else { return }
            await load()
        }
        // Back from a plan (started, stopped, finished): its state again.
        .onAppear { if tried, !model.demo { Task { await load() } } }
        .sheet(isPresented: $choosing, onDismiss: { Task { await load() } }) {
            if let plans { TrainingPlansSheet(plans: plans) }
        }
    }

    /// The running plan once loaded; before that (and in the sample day) the
    /// race from the training answer, so the card never jumps in later.
    private var card: PlanCardData? {
        if let plans {
            if let active = plans.active ?? plans.activeGym { return .init(active: active, event: training.event) }
            return nil
        }
        return training.event.flatMap(PlanCardData.init(event:))
    }

    private func open() {
        if plans != nil { choosing = true; return }
        Task { await load(); choosing = plans != nil }
    }

    private func load() async {
        if let fresh = try? await model.api.trainingPlans() { plans = fresh }
        tried = true
    }
}

/// What the plan card shows, from the running plan or from the race alone.
struct PlanCardData: Equatable {
    struct Phase: Equatable {
        /// Weeks, the bar's width.
        let weeks: Int
        /// "done", "now" or "next".
        let state: String
    }

    let name: String
    /// "Plan, week 8 of 13, Build".
    let line: String
    var daysLeft: Int? = nil
    var raceDate: String? = nil
    let phases: [Phase]

    init(name: String, line: String, daysLeft: Int? = nil, raceDate: String? = nil, phases: [Phase]) {
        self.name = name
        self.line = line
        self.daysLeft = daysLeft
        self.raceDate = raceDate
        self.phases = phases
    }

    init(active: TrainingPlans.Active, event: TrainingSnapshot.Event?) {
        let current = active.started ? active.week : 0
        var phases: [Phase] = []
        var run: (phase: String, weeks: Int, first: Int)?
        func close() {
            guard let r = run else { return }
            let last = r.first + r.weeks - 1
            phases.append(.init(weeks: r.weeks, state: last < current ? "done" : r.first <= current ? "now" : "next"))
        }
        for week in active.template.weeks {
            if run?.phase == week.phase { run?.weeks += 1 } else { close(); run = (week.phase, 1, week.week) }
        }
        close()
        let label = active.paused == true ? L10n.tr("pozastaveno") : active.template.weeks.first { $0.week == active.week }?.phaseLabel
        let line = active.started
            ? L10n.f("Plán, týden %@ z %@", String(active.week), String(active.weeksCount)) + (label.map { ", " + $0 } ?? "")
            : L10n.f("Plán od %@", Fmt.dayMonth(active.firstDay ?? active.startDate))
        var days: Int?
        if active.template.race != nil, let race = active.raceDate, let day = ISODay.date(race), let today = ISODay.date(APIClient.localToday()) {
            days = Int((day.timeIntervalSince(today) / 86400).rounded())
        }
        self.init(name: active.name, line: line, daysLeft: days.flatMap { $0 >= 0 ? $0 : nil } ?? (active.template.race != nil ? event?.daysLeft : nil),
                  raceDate: active.raceDate, phases: phases.count > 1 ? phases : [])
    }

    /// The race alone (the sample day, or until the plans load).
    init?(event: TrainingSnapshot.Event) {
        guard let name = event.name, !event.phases.isEmpty else { return nil }
        let now = event.phases.first { $0.state == "now" }
        let line = [L10n.tr("Plán"), now?.label].compactMap { $0 }.joined(separator: ", ")
        self.init(name: name, line: line, daysLeft: event.daysLeft, raceDate: event.date,
                  phases: event.phases.map { .init(weeks: max(1, $0.weeks ?? 1), state: $0.state) })
    }
}

struct PlanCardBody: View {
    let card: PlanCardData

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: card.name).font(Typo.heading(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                        .lineLimit(2).minimumScaleFactor(0.8)
                    Text(verbatim: card.line).font(Typo.small).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 8)
                if let days = card.daysLeft {
                    VStack(alignment: .trailing, spacing: 3) {
                        if days > 0 { Text(verbatim: String(days)).font(Typo.number(30)).foregroundStyle(Palette.ink) }
                        Text(verbatim: countdown(days)).font(Typo.small).foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.trailing)
                    }
                }
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                    .padding(.top, 8)
            }
            if !card.phases.isEmpty {
                GeometryReader { geo in
                    let total = max(1, card.phases.reduce(0) { $0 + $1.weeks })
                    let gap: CGFloat = 4, width = geo.size.width - gap * CGFloat(card.phases.count - 1)
                    HStack(spacing: gap) {
                        ForEach(Array(card.phases.enumerated()), id: \.offset) { _, phase in
                            Capsule().fill(color(phase.state))
                                .frame(width: max(4, width * CGFloat(phase.weeks) / CGFloat(total)), height: 4)
                        }
                    }
                }
                .frame(height: 4)
                .accessibilityHidden(true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .accessibilityElement(children: .combine)
    }

    /// "days to go, Dec 20".
    private func countdown(_ days: Int) -> String {
        // "dní do závodu": the unit as on the Training race card (review 2026-11-25).
        let word = days == 0 ? L10n.tr("závod dnes") : L10n.f("%@ do závodu", L10n.plural("dní", days))
        guard days > 0, let date = card.raceDate else { return word }
        return word + ", " + Fmt.dayMonth(date)
    }

    private func color(_ state: String) -> Color {
        switch state {
        case "done": return Palette.amberBar.opacity(0.45)
        case "now": return Palette.amberBar
        default: return Palette.track
        }
    }
}
