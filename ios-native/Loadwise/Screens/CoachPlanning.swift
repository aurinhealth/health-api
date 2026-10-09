import SwiftUI

// The coach beyond the chat: the week's sessions to prepare, the morning
// check-in, the review of a day and the records.

private func sportLabel(_ sport: String) -> String {
    ["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "strength": "Posilovna", "walk": "Chůze", "swim": "Plavání"][sport].map { L10n.tr($0) } ?? Fmt.capitalized(sport)
}

private func sportSymbol(_ sport: String) -> String {
    ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill", "strength": "dumbbell.fill", "walk": "figure.walk", "swim": "figure.pool.swim"][sport] ?? "figure.mixed.cardio"
}

// MARK: - The week

/// One proposed session as the athlete leaves it before preparing: the sport,
/// length and place can change, or it goes from the list.
struct WeekDraft: Identifiable, Equatable {
    let item: WeekProposalResponse.Item
    var sport: String
    var minutes: Int
    var environment: String?
    var id: String { item.id }

    init(_ item: WeekProposalResponse.Item) {
        self.item = item
        sport = item.sport == "strength" ? "gym" : item.sport
        minutes = item.minutes ?? (item.sport == "run" ? 45 : 60)
        environment = item.sport == "gym" || item.sport == "strength" ? nil : item.environment
    }

    /// The sport the coach proposed (its gym is "gym").
    var proposedSport: String { item.sport == "strength" ? "gym" : item.sport }

    var edited: Bool {
        sport != proposedSport || minutes != item.minutes || (sport != "gym" && environment != item.environment)
    }

    /// The lengths a plan chip offers (src/week-planner.js SESSION_MINUTES).
    static func lengths(_ sport: String, including current: Int) -> [Int] {
        let list = ["gym": [30, 45, 60, 75, 90], "run": [20, 30, 45, 60, 75, 90, 120]][sport] ?? [30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
        return list.contains(current) ? list : (list + [current]).sorted()
    }
}

/// Sessions this phone prepared a moment ago. The calendar and the coach learn
/// about them only after Intervals.icu syncs, so a second "Připravit" in the
/// meantime would schedule them twice.
enum PreparedSessions {
    struct Entry: Codable {
        let date: String
        let sport: String
        /// Sessions of the sport that day in the calendar before this one.
        let before: Int
        let at: Double
    }

    private static let key = "weekPlan.prepared"
    /// Long enough for the sync, short enough for a session deleted on purpose to come back.
    private static let lifetime: TimeInterval = 600

    static func all() -> [Entry] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let list = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        let now = Date().timeIntervalSince1970
        return list.filter { now - $0.at < lifetime }
    }

    static func remember(date: String, sport: String, before: Int) {
        let list = all() + [Entry(date: date, sport: sport, before: before, at: Date().timeIntervalSince1970)]
        if let data = try? JSONEncoder().encode(list) { UserDefaults.standard.set(data, forKey: key) }
    }
}

/// "Naplánovat týden": the coach proposes the rest of this week or the next
/// one from the readiness, load, plan and free time; the athlete can change or
/// drop a session, then one tap prepares the rest (rides and runs from the
/// library, gym days as a plan) into the calendar.
struct WeekPlanView: View {
    @Environment(AppModel.self) private var model
    @State private var weekStart = WeekPlanView.monday()
    @State private var response: WeekProposalResponse?
    @State private var plan: WeekPlanResponse?
    @State private var drafts: [WeekDraft] = []
    @State private var loading = false
    @State private var error: String?
    /// Per item: "busy", "done" or the error.
    @State private var progress: [String: String] = [:]
    @State private var preparing = false
    /// Sessions of each "date|sport" in the calendar when the proposal came.
    @State private var baseline: [String: Int] = [:]

    private var thisWeek: String { Self.monday() }
    private var nextWeek: String { ISODay.shift(Self.monday(), 7) }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · týden").padding(.top, 24)
                Text(weekStart == nextWeek ? "Plán na příští týden" : "Plán na zbytek týdne")
                    .font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                Picker("Týden", selection: $weekStart) {
                    Text("Tento týden").tag(thisWeek)
                    Text("Příští týden").tag(nextWeek)
                }
                .pickerStyle(.segmented)
                .disabled(preparing)
                .padding(.top, 18)

                availabilityLink.padding(.top, 14)

                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let proposal = response?.proposal {
                    content(proposal)
                }
            }
        }
        .task { if response == nil { await load() } }
        .onChange(of: weekStart) { _, _ in
            Task { await load() }
        }
    }

    /// "Kdy mám čas": the week's time for training, and the load it aims for.
    private var availabilityLink: some View {
        NavigationLink {
            AvailabilityView(weekStart: weekStart, onSave: { Task { await load() } })
        } label: {
            Card(padding: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "clock").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.amber)
                        .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Kdy mám čas").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        if let summary = availabilitySummary {
                            Text(verbatim: summary).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        if let load = loadSummary {
                            Text(verbatim: load).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var availabilitySummary: String? {
        guard let prefs = plan?.prefs else { return nil }
        let total = WeekPlanPrefs.minutes(prefs).filter { $0 > 0 }.reduce(0, +)
        var parts = [total > 0 ? L10n.f("%@ týdně", Fmt.duration(total)) : L10n.tr("Nenastaveno")]
        if WeekPlanPrefs.source(prefs) == "week" { parts.append(L10n.tr("jen tento týden")) }
        return parts.joined(separator: " · ")
    }

    private var loadSummary: String? {
        guard let t = plan?.targets, t.status == "ok", let target = t.target, target > 0 else { return nil }
        let text = L10n.f("Zátěž týdne %@ z %@", Fmt.int(t.committed ?? 0), Fmt.int(target))
        return t.recovery == true ? text + " · " + L10n.tr("odpočinkový týden") : text
    }

    @ViewBuilder
    private func content(_ proposal: WeekProposalResponse.Proposal) -> some View {
        ForEach(proposal.warnings ?? [], id: \.self) { w in
            if let text = w.text {
                Text((w.date.map { Fmt.dayHeading($0) + " · " } ?? "") + text)
                    .font(Typo.small).foregroundStyle(Palette.amber).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            }
        }
        if drafts.isEmpty {
            if proposal.missingAvailability == true {
                Text("Nejdřív nastav, kdy máš na trénink čas.")
                    .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).padding(.top, 20)
                NavigationLink {
                    AvailabilityView(weekStart: weekStart, onSave: { Task { await load() } })
                } label: {
                    Label("Nastavit čas", systemImage: "clock").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
            } else {
                Text(weekStart == nextWeek ? "Na příští týden není co připravit." : "Na zbytek týdne není co připravit.")
                    .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).padding(.top, 20)
            }
        } else {
            VStack(spacing: 10) {
                ForEach(drafts) { draft in row(draft) }
            }
            .padding(.top, 20)
            let finished = drafts.allSatisfy { progress[$0.id] == "done" }
            PrimaryButton(title: finished ? "Hotovo, je v kalendáři" : preparing ? "Připravuji…" : "Připravit tyto tréninky",
                          systemImage: finished ? "checkmark" : "calendar.badge.plus", busy: preparing) {
                Task { await prepare(prefs: proposal.prefs) }
            }
            .disabled(preparing || finished || model.demo)
            .padding(.top, 20)
        }
    }

    private func row(_ draft: WeekDraft) -> some View {
        let item = draft.item
        return Card {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: sportSymbol(draft.sport)).font(.system(size: 18)).foregroundStyle(Palette.amber)
                    .frame(width: 40, height: 40).background(Palette.amberSoft, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(Fmt.capitalized(Fmt.dayHeading(item.date))).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text([sportLabel(draft.sport), Fmt.duration(draft.minutes), draft.environment.map { L10n.tr($0 == "indoor" ? "uvnitř" : "venku") }]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if draft.sport == draft.proposedSport, let why = item.reason ?? item.label {
                        Text(why).font(Typo.caption).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 4)
                if let state = progress[draft.id] {
                    if state == "busy" {
                        ProgressView()
                    } else if state == "done" {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.green)
                    } else {
                        Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.rust)
                    }
                }
                if !preparing && progress[draft.id] != "done" && progress[draft.id] != "busy" {
                    editMenu(draft)
                }
            }
            if let message = progress[draft.id], message != "busy", message != "done" {
                Text(message).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Sport, length and place of one session, or away with it.
    private func editMenu(_ draft: WeekDraft) -> some View {
        Menu {
            Picker("Sport", selection: Binding(get: { draft.sport }, set: { setSport(draft.id, $0) })) {
                ForEach(WeekPlanPrefs.sports, id: \.self) { s in
                    Label(sportLabel(s), systemImage: sportSymbol(s)).tag(s)
                }
            }
            .pickerStyle(.menu)
            Picker("Délka", selection: Binding(get: { draft.minutes }, set: { v in update(draft.id) { $0.minutes = v } })) {
                ForEach(WeekDraft.lengths(draft.sport, including: draft.minutes), id: \.self) { m in
                    Text(verbatim: Fmt.duration(m)).tag(m)
                }
            }
            .pickerStyle(.menu)
            if draft.sport != "gym" {
                Picker("Kde", selection: Binding(get: { draft.environment ?? "outdoor" }, set: { v in update(draft.id) { $0.environment = v } })) {
                    Text("Venku").tag("outdoor")
                    Text("Uvnitř").tag("indoor")
                }
                .pickerStyle(.menu)
            }
            Divider()
            Button(role: .destructive) {
                withAnimation { drafts.removeAll { $0.id == draft.id } }
            } label: {
                Label("Odebrat", systemImage: "trash")
            }
        } label: {
            Image(systemName: "slider.horizontal.3").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36).overlay(Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
        }
        .accessibilityLabel(L10n.tr("Upravit trénink"))
    }

    private func update(_ id: String, _ change: (inout WeekDraft) -> Void) {
        guard let i = drafts.firstIndex(where: { $0.id == id }) else { return }
        change(&drafts[i])
        progress[id] = nil
    }

    private func setSport(_ id: String, _ sport: String) {
        update(id) { d in
            d.sport = sport
            let lengths = WeekDraft.lengths(sport, including: 0).filter { $0 > 0 }
            if !lengths.contains(d.minutes) {
                d.minutes = lengths.min(by: { abs($0 - d.minutes) < abs($1 - d.minutes) }) ?? d.minutes
            }
            d.environment = sport == "gym" ? nil : d.environment ?? "outdoor"
        }
    }

    private func load() async {
        guard !model.demo else { error = L10n.tr("V ukázce se týden neplánuje."); return }
        let start = weekStart
        loading = true
        defer { loading = false }
        do {
            let r = try await model.api.weekProposal(start: start)
            let weekPlan = try? await model.api.weekPlan(start: start)
            await model.loadCalendar(from: start, to: ISODay.shift(start, 6), force: true)
            guard start == weekStart else { return }
            response = r
            plan = weekPlan
            progress = [:]
            drafts = (r.proposal?.items ?? []).map(WeekDraft.init)
            baseline = [:]
            // Only days the calendar has: a day it could not load is not compared later.
            for d in drafts where model.calendar[d.item.date] != nil {
                for sport in WeekPlanPrefs.sports { baseline[d.item.date + "|" + sport] = sessions(on: d.item.date, sport: sport) }
            }
            // What this phone prepared and the calendar does not show yet is done already.
            var pending = PreparedSessions.all().filter { sessions(on: $0.date, sport: $0.sport) <= $0.before }
            for d in drafts {
                if let i = pending.firstIndex(where: { $0.date == d.item.date && $0.sport == d.sport }) {
                    pending.remove(at: i)
                    progress[d.id] = "done"
                }
            }
            error = nil
        } catch {
            guard start == weekStart else { return }
            self.error = error.localizedDescription
        }
    }

    /// Planned and done sessions of a sport on a day in the training calendar.
    private func sessions(on date: String, sport: String) -> Int {
        (model.calendar[date]?.activities ?? []).filter { ($0.sport == "strength" ? "gym" : $0.sport) == sport }.count
    }

    /// One session at a time: the server builds each one from the whole week.
    private func prepare(prefs: JSONValue?) async {
        preparing = true
        defer { preparing = false }
        let start = response?.start ?? weekStart
        if let prefs { try? await model.api.saveWeekPlan(start: start, prefs: adjusted(prefs)) }
        // Sessions that reached the calendar since the proposal (another tap,
        // the web or another device) are not scheduled again.
        await model.loadCalendar(from: start, to: ISODay.shift(start, 6), force: true)
        var added: [String: Int] = [:]
        for draft in drafts where progress[draft.id] != "done" {
            let key = draft.item.date + "|" + draft.sport
            let known = baseline[key]
            let before = (known ?? sessions(on: draft.item.date, sport: draft.sport)) + (added[key] ?? 0)
            added[key, default: 0] += 1
            if known != nil && sessions(on: draft.item.date, sport: draft.sport) > before {
                progress[draft.id] = "done"
                continue
            }
            progress[draft.id] = "busy"
            do {
                if draft.sport == "gym" {
                    let proposal = try await model.api.previewGym(date: draft.item.date, minutes: draft.minutes,
                                                                  focus: draft.item.role == "gym_upper" ? "upper" : nil, muscles: [])
                    if let id = proposal.draftId { try await model.api.confirmGym(draftId: id, rows: proposal.rows) }
                } else {
                    let generated = try await model.api.generateWorkout(date: draft.item.date, sport: draft.sport, minutes: draft.minutes, environment: draft.environment)
                    guard let workout = generated.workout else { throw APIError.message(generated.message ?? L10n.tr("Bez návrhu.")) }
                    try await model.api.scheduleWorkout(id: workout.id, date: draft.item.date, indoor: draft.environment == "indoor")
                }
                PreparedSessions.remember(date: draft.item.date, sport: draft.sport, before: before)
                progress[draft.id] = "done"
            } catch {
                progress[draft.id] = error.localizedDescription
            }
        }
        await model.refreshTraining()
        await model.loadCalendar(from: start, to: ISODay.shift(start, 6), force: true)
    }

    /// The proposal's plan with the athlete's changes: a dropped session leaves
    /// its day, a changed sport takes its place, and a changed length or place
    /// is kept for its plan chip ("weekday|sport|slot").
    private func adjusted(_ prefs: JSONValue) -> JSONValue {
        guard let items = response?.proposal?.items else { return prefs }
        var object = WeekPlanPrefs.object(prefs)
        var days = WeekPlanPrefs.days(prefs)
        let kept = Set(drafts.map(\.id))
        for item in items where !kept.contains(item.id) {
            let w = ISODay.weekdayIndex(item.date)
            let sport = item.sport == "strength" ? "gym" : item.sport
            if let k = days[w].lastIndex(of: sport) { days[w].remove(at: k) }
        }
        for d in drafts where d.sport != d.proposedSport {
            let w = ISODay.weekdayIndex(d.item.date)
            if let k = days[w].lastIndex(of: d.proposedSport) { days[w].remove(at: k) }
            if days[w].count < WeekPlanPrefs.maxPerDay { days[w].append(d.sport) }
        }
        var sessions: JSONObject = [:]
        if case .object(let o)? = object["sessions"] { sessions = o }
        for w in 0..<7 {
            for sport in WeekPlanPrefs.sports {
                // The open chips are the last of the sport that day.
                let mine = drafts.filter { ISODay.weekdayIndex($0.item.date) == w && $0.sport == sport }.sorted { ($0.item.slot ?? 0) < ($1.item.slot ?? 0) }
                let total = days[w].filter { $0 == sport }.count
                for (k, d) in mine.enumerated() where d.edited {
                    let slot = total - mine.count + k
                    guard (0..<WeekPlanPrefs.maxPerDay).contains(slot) else { continue }
                    var entry: JSONObject = ["minutes": .number(Double(d.minutes))]
                    if sport != "gym", let env = d.environment, env == "indoor" || env == "outdoor" { entry["environment"] = .string(env) }
                    sessions["\(w)|\(sport)|\(slot)"] = .object(entry)
                }
            }
        }
        object["days"] = WeekPlanPrefs.daysValue(days)
        object["sessions"] = .object(sessions)
        return .object(object)
    }

    /// This week's Monday (the plan's weeks start on Monday).
    static func monday(_ date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return AppModel.localDate(start)
    }
}

// MARK: - Check-in

/// The coach speaks first when several signs say the body needs a break.
struct CoachCheckInCard: View {
    @Environment(AppModel.self) private var model
    var openCoach: () -> Void = {}
    @State private var advice: CoachCheckIn.Advice?

    var body: some View {
        Group {
            if let advice {
                Card {
                    WidgetHeader(title: "Kouč", color: Palette.amberBar)
                    if let headline = advice.headline {
                        Text(headline).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(advice.reasons ?? [], id: \.self) { reason in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(Palette.faint)
                            Text(reason).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let message = advice.message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 10) {
                        PrimaryButton(title: "Probrat", systemImage: "bubble.left.and.text.bubble.right", action: openCoach)
                        SecondaryButton(title: "Teď ne") { Task { await dismiss(advice) } }
                    }
                }
            }
        }
        .task {
            guard !model.demo else { return }
            advice = try? await model.api.coachCheckIn()
        }
    }

    private func dismiss(_ advice: CoachCheckIn.Advice) async {
        withAnimation { self.advice = nil }
        if let id = advice.id { try? await model.api.dismissAdvice(id: id) }
    }
}

// MARK: - Review of a day

/// "Posoudit den": the AI reads the day's plan, readiness and load and says
/// whether to keep it, and what to change and why.
struct DayReviewView: View {
    @Environment(AppModel.self) private var model
    var date = AppModel.localDate(Date())
    @State private var review: DayReviewResponse.Review?
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.today) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: L10n.tr("Kouč") + " · " + Fmt.dayHeading(date)).padding(.top, 24)
                if loading {
                    HStack(spacing: 8) { ProgressView(); Text("Kouč čte tvůj den…").font(Typo.small).foregroundStyle(Palette.muted) }.padding(.top, 30)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let review {
                    content(review)
                }
            }
        }
        .task { if review == nil { await load() } }
    }

    @ViewBuilder
    private func content(_ review: DayReviewResponse.Review) -> some View {
        if let verdict = review.verdict {
            Pill(text: Self.verdictLabel(verdict), foreground: verdict == "go" ? Palette.green : Palette.amber,
                 background: verdict == "go" ? Palette.greenSoft : Palette.amberSoft)
                .padding(.top, 12)
        }
        if let headline = review.headline {
            Text(headline).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
        }
        if let reasons = review.reasons, !reasons.isEmpty {
            SectionLabel(text: "Proč").padding(.top, 22)
            ForEach(reasons, id: \.self) { r in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(Palette.faint)
                    Text(r).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 6)
            }
        }
        if let changes = review.changes, !changes.isEmpty {
            SectionLabel(text: "Co změnit").padding(.top, 22)
            VStack(spacing: 10) {
                ForEach(changes, id: \.self) { change in
                    Card {
                        if let what = change.what { Text(what).font(Typo.bodyStrong).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true) }
                        if let why = change.why { Text(why).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                    }
                }
            }
            .padding(.top, 8)
        }
        if let missing = review.missing?.nilIfBlank {
            Text(missing).font(Typo.caption).foregroundStyle(Palette.faint).fixedSize(horizontal: false, vertical: true).padding(.top, 16)
        }
    }

    static func verdictLabel(_ verdict: String) -> String {
        ["go": "Jak je v plánu", "keep": "Jak je v plánu", "adjust": "Upravit", "modify": "Upravit", "easier": "Ubrat", "rest": "Odpočinek", "swap": "Vyměnit"][verdict].map { L10n.tr($0) } ?? Fmt.capitalized(verdict)
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce kouč den nehodnotí."; return }
        loading = true
        defer { loading = false }
        do { review = try await model.api.reviewDay(date: date); error = nil } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Records

/// Records and where the cardio went: the longest ride, the best power, the
/// fastest 5 km, the strongest lifts and the intensity split of the last weeks.
struct InsightsView: View {
    @Environment(AppModel.self) private var model
    @State private var insights: FitnessInsights?
    @State private var error: String?

    private static let cardio: [(String, String)] = [
        ("longestRide", "Nejdelší jízda"), ("longestRideTime", "Nejdelší jízda časem"), ("mostElevation", "Nejvíc nastoupáno"),
        ("bestRidePower", "Nejlepší výkon (20+ min)"), ("longestRun", "Nejdelší běh"), ("fastestRun5k", "Nejrychlejší tempo na 5+ km")
    ]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · rekordy").padding(.top, 24)
                Text("Rekordy a zaměření").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let insights {
                    content(insights)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task {
            guard insights == nil else { return }
            guard !model.demo else { error = "V ukázce se rekordy nenačítají."; return }
            do { insights = try await model.api.fitnessInsights() } catch { self.error = error.localizedDescription }
        }
    }

    @ViewBuilder
    private func content(_ insights: FitnessInsights) -> some View {
        if let focus = insights.cardioFocus, let p = focus.percent {
            SectionLabel(text: L10n.f("Intenzita za %@ dní", String(focus.days ?? 28))).padding(.top, 24)
            Card {
                GeometryReader { geo in
                    let total = max(1, (p.low ?? 0) + (p.high ?? 0) + (p.anaerobic ?? 0))
                    HStack(spacing: 2) {
                        Rectangle().fill(Palette.green).frame(width: geo.size.width * (p.low ?? 0) / total)
                        Rectangle().fill(Palette.amberBar).frame(width: geo.size.width * (p.high ?? 0) / total)
                        Rectangle().fill(Palette.rust).frame(width: geo.size.width * (p.anaerobic ?? 0) / total)
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 10)
                HStack {
                    legend("Nízká", p.low, Palette.green)
                    Spacer()
                    legend("Vysoká", p.high, Palette.amberBar)
                    Spacer()
                    legend("Anaerobní", p.anaerobic, Palette.rust)
                }
                if let minutes = focus.minutes, let count = focus.activities {
                    Text("\(count) " + Fmt.plural(count, "aktivita", "aktivity", "aktivit") + " · " + Fmt.duration(minutes))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(.top, 8)
        }

        let cardio = cardioRecords(insights)
        if !cardio.isEmpty {
            SectionLabel(text: "Vytrvalost za rok").padding(.top, 24)
            Card {
                ForEach(Array(cardio.enumerated()), id: \.offset) { index, item in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow(item.0, value: Self.format(item.1), detail: item.1.date.map { Fmt.dayHeading($0) })
                }
            }
            .padding(.top, 8)
        }

        let lifts = (insights.records?.strength ?? []).filter { $0.e1rm != nil || $0.heaviest != nil }.prefix(8)
        if !lifts.isEmpty {
            SectionLabel(text: "Síla").padding(.top, 24)
            Card {
                ForEach(Array(lifts.enumerated()), id: \.element.id) { index, lift in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    let best = lift.heaviest
                    recordRow(Fmt.capitalized(lift.exercise),
                              value: best?.value.map { Units.weightText($0) } ?? "–",
                              detail: lift.e1rm?.value.map { L10n.f("odhad 1RM %@", Units.weightText($0, digits: 0)) },
                              fresh: !(lift.recent ?? []).isEmpty)
                }
            }
            .padding(.top, 8)
        }
    }

    private func cardioRecords(_ insights: FitnessInsights) -> [(String, FitnessInsights.Record)] {
        guard let map = insights.records?.cardio else { return [] }
        return Self.cardio.compactMap { key, title in
            guard let value = map[key], let record = value else { return nil }
            return (title, record)
        }
    }

    private func legend(_ title: String, _ value: Double?, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(verbatim: L10n.tr(title) + " " + Fmt.int(value) + " %").font(Typo.caption).foregroundStyle(Palette.secondary)
        }
    }

    private func recordRow(_ title: String, value: String, detail: String?, fresh: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(title).font(Typo.body).foregroundStyle(Palette.ink)
                    if fresh { Pill(text: "nový", foreground: Palette.green, background: Palette.greenSoft) }
                }
                if let detail { Text(detail).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            Text(value).font(Typo.number(20)).foregroundStyle(Palette.ink)
        }
        .padding(.vertical, 4)
    }

    private static func format(_ record: FitnessInsights.Record) -> String {
        guard let value = record.value else { return "–" }
        switch record.unit {
        case "s/km": return Units.paceText(value)
        case "km": return Units.distanceText(value)
        case "h": return Fmt.duration(Int(value * 60))
        case let unit?: return Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1) + " " + unit
        case nil: return Fmt.decimal(value)
        }
    }
}
