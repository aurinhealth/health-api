import SwiftUI

// Plán týdne: the athlete places sports on days ("Rozvrhnu sám") or lets the
// AI lay out the week ("Navrhne AI"). Either way the sessions are built as
// previews first; each can be opened, made longer or shorter, moved inside or
// changed with the AI, and "Uložit do kalendáře" schedules them all.

private func sportLabel(_ sport: String) -> String {
    ["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "strength": "Posilovna", "walk": "Chůze", "swim": "Plavání"][sport].map { L10n.tr($0) } ?? Fmt.capitalized(sport)
}

private func sportSymbol(_ sport: String) -> String {
    ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill", "strength": "dumbbell.fill", "walk": "figure.walk", "swim": "figure.pool.swim"][sport] ?? "figure.mixed.cardio"
}

/// The session kinds of src/week-ai.js KINDS.
private func kindLabel(_ kind: String?) -> String? {
    guard let kind else { return nil }
    return ["recovery": "Lehce / regenerace", "endurance": "Vytrvalost", "long": "Dlouhý trénink", "tempo": "Tempo",
            "sweet_spot": "Sweet spot", "threshold": "Práh", "vo2max": "VO₂max", "gym": "Posilovna"][kind].map { L10n.tr($0) }
}

/// One session of the week before it goes to the calendar: what it should be,
/// and the workout built for it.
struct WeekSessionDraft: Identifiable, Equatable {
    enum Status: Equatable { case waiting, building, ready, saved, failed(String) }

    let id = UUID()
    var date: String
    var sport: String
    var minutes: Int
    /// "outdoor" or "indoor"; nil for the gym.
    var environment: String?
    /// src/week-ai.js KINDS, when the AI or a change chose it.
    var kind: String?
    /// The generator's focus (FOCUS_OF), nil when the week plan's role decides.
    var focus: String?
    var label: String?
    var reason: String?
    var role: String?
    /// What the AI changed, in its words.
    var note: String?
    var workout: LibraryWorkout?
    var gym: GymProposal?
    var status: Status = .waiting

    var built: Bool { status == .ready || status == .saved }

    var title: String {
        if let gym { return gym.planName }
        return workout?.name ?? label ?? kindLabel(kind) ?? sportLabel(sport)
    }

    /// The lengths the detail offers (src/week-planner.js SESSION_MINUTES).
    static func lengths(_ sport: String, including current: Int) -> [Int] {
        let list = ["gym": [30, 45, 60, 75, 90], "run": [20, 30, 45, 60, 75, 90, 120]][sport] ?? [30, 45, 60, 75, 90, 120, 150, 180, 240]
        return list.contains(current) ? list : (list + [current]).sorted()
    }

    /// Builds the workout: a gym plan as a draft, a ride or run from the
    /// library. `resize` keeps the workout and only changes its length.
    func building(_ api: APIClient, resize: Bool = false) async -> WeekSessionDraft {
        var next = self
        do {
            if sport == "gym" {
                next.gym = try await api.previewGym(date: date, minutes: minutes, focus: role == "gym_upper" ? "upper" : nil, muscles: [])
            } else {
                let r = try await api.generateWeekSession(date: date, sport: sport, minutes: minutes, environment: environment, focus: focus,
                                                          resize: resize ? workout?.id : nil)
                guard let w = r.workout else { throw APIError.message(r.message ?? L10n.tr("Bez návrhu.")) }
                next.workout = w
            }
            next.status = .ready
        } catch {
            next.status = .failed(error.localizedDescription)
        }
        return next
    }
}

struct WeekPlanView: View {
    @Environment(AppModel.self) private var model
    @State private var weekStart = WeekPlanView.monday()
    @AppStorage("weekPlan.mode") private var mode = "manual"
    @State private var plan: WeekPlanResponse?
    /// "Rozvrhnu sám": the sports on each weekday, Monday first.
    @State private var days: [[String]] = Array(repeating: [], count: 7)
    @State private var picked: String?
    @State private var note = ""
    /// "Opravit návrh": what the AI should fix in its proposal.
    @State private var correction = ""
    @State private var summary: String?
    @State private var notice: String?
    @State private var warnings: [WeekProposalResponse.Warning] = []
    @State private var sessions: [WeekSessionDraft] = []
    @State private var loading = false
    @State private var working = false
    @State private var saving = false
    @State private var error: String?

    private var thisWeek: String { Self.monday() }
    private var nextWeek: String { ISODay.shift(Self.monday(), 7) }
    private var today: String { AppModel.localDate(Date()) }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Plán týdne") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · týden").padding(.top, 24)
                Text("Plán týdne").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                Picker("Týden", selection: $weekStart) {
                    Text("Tento týden").tag(thisWeek)
                    Text("Příští týden").tag(nextWeek)
                }
                .pickerStyle(.segmented)
                .disabled(working || saving)
                .padding(.top, 18)

                if sessions.isEmpty {
                    Picker("Způsob", selection: $mode) {
                        Text("Rozvrhnu sám").tag("manual")
                        Text("Navrhne AI").tag("ai")
                    }
                    .pickerStyle(.segmented)
                    .disabled(working)
                    .padding(.top, 10)
                }

                timeLink.padding(.top, 14)

                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
                    }
                    if !sessions.isEmpty {
                        generated
                    } else if mode == "ai" {
                        aiForm
                    } else {
                        layout
                    }
                }
            }
        }
        .task { if plan == nil { await load() } }
        .onChange(of: weekStart) { _, _ in
            sessions = []
            summary = nil
            Task { await load() }
        }
    }

    // MARK: Time

    /// "Čas tento týden": the usual time for training, changed for this week only.
    private var timeLink: some View {
        NavigationLink {
            AvailabilityView(weekStart: weekStart, onSave: { Task { await load() } })
        } label: {
            Card(padding: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "clock").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.amber)
                        .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(weekStart == nextWeek ? "Čas příští týden" : "Čas tento týden").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        if let summary = timeSummary {
                            Text(verbatim: summary).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(working || saving)
    }

    private var timeSummary: String? {
        guard let prefs = plan?.prefs else { return nil }
        let total = WeekPlanPrefs.minutes(prefs).filter { $0 > 0 }.reduce(0, +)
        var parts = [total > 0 ? Fmt.duration(total) : L10n.tr("Nenastaveno")]
        parts.append(WeekPlanPrefs.source(prefs) == "week" ? L10n.tr("upraveno jen pro tento týden") : L10n.tr("podle tvého běžného týdne"))
        if let t = plan?.targets, t.recovery == true { parts.append(L10n.tr("odpočinkový týden")) }
        return parts.joined(separator: " · ")
    }

    private func dayMinutes(_ w: Int) -> Int {
        WeekPlanPrefs.minutes(plan?.prefs)[w]
    }

    private func date(_ w: Int) -> String { ISODay.shift(weekStart, w) }

    // MARK: Rozvrhnu sám

    private var layout: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(picked.map { L10n.f("Klepni na den, kam dát: %@", sportLabel($0)) } ?? L10n.tr("Vyber sport a klepni na den."))
                .font(Typo.small).foregroundStyle(Palette.secondary).padding(.top, 18)
            HStack(spacing: 8) {
                ForEach(WeekPlanPrefs.sports, id: \.self) { sport in
                    Button {
                        picked = picked == sport ? nil : sport
                    } label: {
                        Label(sportLabel(sport), systemImage: sportSymbol(sport))
                            .font(Typo.small.weight(.semibold))
                            .foregroundStyle(picked == sport ? Palette.onButton : Palette.ink)
                            .padding(.horizontal, 12).frame(height: 36)
                            .background(picked == sport ? Palette.button : Palette.card, in: Capsule())
                            .overlay(Capsule().stroke(Palette.hairline, lineWidth: picked == sport ? 0 : 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 10)

            VStack(spacing: 8) {
                ForEach(0..<7, id: \.self) { w in dayRow(w) }
            }
            .padding(.top, 14)

            let open = (0..<7).filter { date($0) >= today }.reduce(0) { $0 + days[$1].count }
            PrimaryButton(title: working ? "Sestavuji…" : "Vytvořit tréninky", systemImage: "sparkles", busy: working) {
                Task { await buildLayout() }
            }
            .disabled(working || open == 0 || model.demo)
            .padding(.top, 20)
        }
    }

    private func dayRow(_ w: Int) -> some View {
        let past = date(w) < today
        let minutes = dayMinutes(w)
        return Button {
            guard let sport = picked, !past, days[w].count < WeekPlanPrefs.maxPerDay else { return }
            withAnimation(.snappy) { days[w].append(sport) }
        } label: {
            Card(padding: 12) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Fmt.capitalized(Fmt.weekdayShort(date(w)))).font(Typo.bodyStrong).foregroundStyle(past ? Palette.faint : Palette.ink)
                        Text(verbatim: minutes > 0 ? Fmt.duration(minutes) : minutes == 0 ? L10n.tr("volno") : "–")
                            .font(Typo.tiny).foregroundStyle(Palette.muted)
                    }
                    .frame(width: 58, alignment: .leading)
                    if days[w].isEmpty {
                        Text(past ? "" : picked == nil ? L10n.tr("Bez tréninku") : L10n.tr("Přidat sem"))
                            .font(Typo.caption).foregroundStyle(Palette.faint)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(Array(days[w].enumerated()), id: \.offset) { k, sport in
                                    chip(sport, removable: !past) { withAnimation(.snappy) { _ = days[w].remove(at: k) } }
                                }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .opacity(past ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .disabled(past || working)
    }

    private func chip(_ sport: String, removable: Bool, remove: @escaping () -> Void) -> some View {
        HStack(spacing: 5) {
            Image(systemName: sportSymbol(sport)).font(.system(size: 11, weight: .semibold))
            Text(sportLabel(sport)).font(Typo.caption.weight(.semibold))
            if removable {
                Button(action: remove) {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).padding(3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.f("Odebrat %@", sportLabel(sport)))
            }
        }
        .foregroundStyle(Palette.amber)
        .padding(.leading, 9).padding(.trailing, removable ? 5 : 9).frame(height: 28)
        .background(Palette.amberSoft, in: Capsule())
    }

    /// The layout becomes this week's own plan, the rules give each sport its
    /// length and role, and every session is built.
    private func buildLayout() async {
        guard let prefs = plan?.prefs else { return }
        working = true
        defer { working = false }
        error = nil
        do {
            var object = WeekPlanPrefs.object(prefs)
            object["days"] = WeekPlanPrefs.daysValue(days)
            object["sessions"] = .object([:])
            object["source"] = nil
            try await model.api.saveWeekPlan(start: weekStart, prefs: .object(object))
            let r = try await model.api.weekProposal(start: weekStart)
            warnings = r.proposal?.warnings ?? []
            summary = nil
            notice = nil
            sessions = (r.proposal?.items ?? []).map { item in
                let sport = item.sport == "strength" ? "gym" : item.sport
                return WeekSessionDraft(date: item.date, sport: sport, minutes: item.minutes ?? (sport == "run" ? 45 : 60),
                                        environment: sport == "gym" ? nil : item.environment ?? "outdoor",
                                        label: item.label, reason: item.reason, role: item.role)
            }
            if sessions.isEmpty { error = L10n.tr("Na zvolené dny není čas. Uprav čas tento týden.") }
            await buildAll()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Navrhne AI

    private var aiForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            Card(padding: 14) {
                if let score = model.today?.readiness.score {
                    HStack {
                        Text("Připravenost").font(Typo.body).foregroundStyle(Palette.secondary)
                        Spacer()
                        Text(verbatim: "\(score)").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    }
                    Divider().overlay(Palette.hairline)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Poznámka pro AI").font(Typo.caption).foregroundStyle(Palette.muted)
                    TextField(L10n.tr("Třeba: v sobotu jedu s kamarády, ve čtvrtek nemůžu"), text: $note, axis: .vertical)
                        .font(Typo.body).lineLimit(2...5)
                }
            }
            .padding(.top, 18)
            Text("AI vychází ze tvého času, zátěže, spánku, počasí a cíle.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
            PrimaryButton(title: working ? "Navrhuji…" : "Navrhnout týden", systemImage: "sparkles", busy: working) {
                Task { await proposeAI() }
            }
            .disabled(working || model.demo)
            .padding(.top, 18)
        }
    }

    /// With a correction the AI fixes its last proposal; a session it keeps
    /// as it was keeps its built workout.
    private func proposeAI(correction: String? = nil) async {
        working = true
        defer { working = false }
        error = nil
        do {
            let previous = sessions
            let r = try await model.api.weekAI(start: weekStart, note: note, correction: correction, previous: previous)
            summary = r.summary
            notice = r.ai == false ? r.message : nil
            warnings = r.warnings ?? []
            sessions = (r.items ?? []).map { item in
                let sport = item.sport == "strength" ? "gym" : item.sport
                let next = WeekSessionDraft(date: item.date, sport: sport, minutes: item.minutes ?? 60,
                                            environment: sport == "gym" ? nil : item.environment ?? "outdoor",
                                            kind: item.kind, focus: item.focus, label: item.label, reason: item.reason, role: item.role)
                if var same = previous.first(where: { $0.built && $0.date == next.date && $0.sport == next.sport && $0.minutes == next.minutes
                                                     && $0.environment == next.environment && $0.kind == next.kind }) {
                    same.reason = next.reason
                    same.note = nil
                    return same
                }
                return next
            }
            if sessions.isEmpty { error = L10n.tr("Na tento týden není co navrhnout.") }
            if correction != nil { self.correction = "" }
            await buildAll()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// "Opravit návrh": the athlete tells the AI what it got wrong.
    private var correctionCard: some View {
        Card(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Opravit návrh").font(Typo.caption).foregroundStyle(Palette.muted)
                TextField(L10n.tr("Třeba: v sobotu chci posilovnu, ne běh"), text: $correction, axis: .vertical)
                    .font(Typo.body).lineLimit(1...4)
            }
            HStack {
                Spacer()
                Button {
                    Task { await proposeAI(correction: correction.trimmingCharacters(in: .whitespacesAndNewlines)) }
                } label: {
                    Label(L10n.tr(working ? "Opravuji…" : "Opravit"), systemImage: "sparkles")
                        .font(Typo.small.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(working || saving || correction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.demo)
            }
        }
    }

    // MARK: The built week

    private var generated: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let summary {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    AIMark()
                    Text(summary).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 18)
            }
            if let notice {
                Text(notice).font(Typo.small).foregroundStyle(Palette.amber).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            }
            ForEach(warnings, id: \.self) { w in
                if let text = w.text {
                    Text((w.date.map { Fmt.dayHeading($0) + " · " } ?? "") + text)
                        .font(Typo.small).foregroundStyle(Palette.amber).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                }
            }
            VStack(spacing: 10) {
                ForEach($sessions) { $session in
                    NavigationLink {
                        WeekSessionDetailView(session: $session, others: sessions.filter { $0.id != session.id }, weekStart: weekStart)
                    } label: {
                        row(session)
                    }
                    .buttonStyle(.plain)
                    .disabled(session.status == .waiting || session.status == .building)
                }
            }
            .padding(.top, 18)

            if mode == "ai" && !sessions.contains(where: { $0.status == .saved }) {
                correctionCard.padding(.top, 14)
            }

            let open = sessions.filter { $0.status == .ready }
            let finished = !sessions.isEmpty && sessions.allSatisfy { $0.status == .saved }
            PrimaryButton(title: finished ? "Hotovo, je v kalendáři" : saving ? "Ukládám…" : "Uložit do kalendáře",
                          systemImage: finished ? "checkmark" : "calendar.badge.plus", busy: saving) {
                Task { await save() }
            }
            .disabled(saving || working || finished || open.isEmpty || model.demo)
            .padding(.top, 20)
            if !finished {
                SecondaryButton(title: mode == "ai" ? "Upravit sám" : "Změnit rozvržení", systemImage: "square.grid.2x2") {
                    editLayout()
                }
                .disabled(saving || working)
                .padding(.top, 10)
            } else {
                SecondaryButton(title: "Naplánovat znovu", systemImage: "arrow.counterclockwise") {
                    sessions = []
                    summary = nil
                }
                .padding(.top, 10)
            }
        }
    }

    private func row(_ s: WeekSessionDraft) -> some View {
        Card(padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: sportSymbol(s.sport)).font(.system(size: 17)).foregroundStyle(Palette.amber)
                    .frame(width: 38, height: 38).background(Palette.amberSoft, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(Fmt.capitalized(Fmt.dayHeading(s.date))).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(s.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                    Text([Fmt.duration(s.minutes), s.environment.map { L10n.tr($0 == "indoor" ? "uvnitř" : "venku") }, kindLabel(s.kind)]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if case .failed(let message) = s.status {
                        Text(message).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 4)
                switch s.status {
                case .waiting, .building: ProgressView()
                case .saved: Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.green)
                case .failed: Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.rust)
                case .ready: Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
        }
    }

    /// One at a time: the server builds each session from the whole week.
    private func buildAll() async {
        for i in sessions.indices where !sessions[i].built {
            sessions[i].status = .building
            let id = sessions[i].id
            let next = await sessions[i].building(model.api)
            if let k = sessions.firstIndex(where: { $0.id == id }) { sessions[k] = next }
        }
    }

    /// The AI's week (or the built one) back as a layout to change by hand.
    private func editLayout() {
        var next = Array(repeating: [String](), count: 7)
        for s in sessions where s.status != .saved {
            let w = ISODay.weekdayIndex(s.date)
            if next[w].count < WeekPlanPrefs.maxPerDay { next[w].append(s.sport) }
        }
        days = next
        sessions = []
        summary = nil
        mode = "manual"
    }

    private func save() async {
        saving = true
        defer { saving = false }
        for i in sessions.indices where sessions[i].status == .ready {
            let s = sessions[i]
            do {
                if let gym = s.gym {
                    guard let draftId = gym.draftId else { throw APIError.message(L10n.tr("Trénink se nepodařilo sestavit.")) }
                    try await model.api.confirmGym(draftId: draftId, rows: gym.rows)
                } else if let w = s.workout {
                    try await model.api.scheduleWorkout(id: w.id, date: s.date, indoor: s.environment == "indoor")
                }
                sessions[i].status = .saved
            } catch {
                sessions[i].status = .failed(error.localizedDescription)
            }
        }
        await model.refreshTraining()
        await model.loadCalendar(from: weekStart, to: ISODay.shift(weekStart, 6), force: true)
    }

    private func load() async {
        guard !model.demo else { error = L10n.tr("V ukázce se týden neplánuje."); return }
        let start = weekStart
        loading = true
        defer { loading = false }
        do {
            let p = try await model.api.weekPlan(start: start)
            guard start == weekStart else { return }
            plan = p
            if sessions.isEmpty { days = WeekPlanPrefs.days(p.prefs) }
            error = nil
        } catch {
            guard start == weekStart else { return }
            self.error = error.localizedDescription
        }
    }

    /// This week's Monday (the plan's weeks start on Monday).
    static func monday(_ date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return AppModel.localDate(start)
    }
}

// MARK: - One session

/// A session of the week before it is saved: the workout, its length and
/// place, and "Upravit s AI".
struct WeekSessionDetailView: View {
    @Environment(AppModel.self) private var model
    @Binding var session: WeekSessionDraft
    let others: [WeekSessionDraft]
    let weekStart: String
    @State private var asking = false
    @State private var busy = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: session.title) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: Fmt.dayHeading(session.date) + " · " + sportLabel(session.sport))
                    Text(session.title).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 24)

                HStack(spacing: 8) {
                    if let k = kindLabel(session.kind) ?? session.workout?.primary_system.map({ LibraryWorkout.systemLabel($0) }) {
                        Pill(text: k, foreground: Palette.amber, background: Palette.amberSoft)
                    }
                    if let load = session.workout?.target_load { Pill(text: Fmt.int(load) + " TSS", foreground: Palette.secondary, background: Palette.track) }
                }

                if let note = session.note ?? session.reason {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        AIMark()
                        Text(note).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }

                if case .failed(let message) = session.status {
                    Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }

                if busy || session.status == .building {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                } else if let gym = session.gym {
                    Card {
                        ForEach(Array(gym.exercises.enumerated()), id: \.offset) { _, e in
                            HStack(alignment: .firstTextBaseline) {
                                Text(e.name).font(Typo.body).foregroundStyle(Palette.ink)
                                Spacer(minLength: 8)
                                Text(verbatim: [e.sets > 0 ? "\(e.sets) × \(e.reps)" : e.reps, e.kg].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                        }
                    }
                } else if let blocks = session.workout?.steps, !blocks.isEmpty {
                    Card { WorkoutProfile(blocks: blocks, sport: session.sport) }
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                }

                if session.status != .saved {
                    SectionLabel(text: "Délka").padding(.top, 6)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(WeekSessionDraft.lengths(session.sport, including: session.minutes), id: \.self) { m in
                                Button {
                                    guard m != session.minutes else { return }
                                    session.minutes = m
                                    Task { await rebuild(resize: true) }
                                } label: {
                                    Text(verbatim: Fmt.duration(m)).font(Typo.small.weight(.semibold))
                                        .foregroundStyle(m == session.minutes ? Palette.onButton : Palette.ink)
                                        .padding(.horizontal, 12).frame(height: 34)
                                        .background(m == session.minutes ? Palette.button : Palette.card, in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .disabled(busy)

                    if session.sport != "gym" {
                        Picker("Kde", selection: Binding(get: { session.environment ?? "outdoor" }, set: { v in
                            guard v != session.environment else { return }
                            session.environment = v
                            Task { await rebuild(resize: false) }
                        })) {
                            Text("Venku").tag("outdoor")
                            Text("Uvnitř").tag("indoor")
                        }
                        .pickerStyle(.segmented)
                        .disabled(busy)
                    }

                    SecondaryButton(title: "Upravit s AI", systemImage: "sparkles") { asking = true }
                        .disabled(busy)
                        .padding(.top, 4)
                }
            }
        }
        .sheet(isPresented: $asking) {
            AdjustSessionSheet(session: session, others: others) { changed in
                apply(changed)
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func apply(_ changed: AdjustedSession) {
        session.date = changed.date
        session.minutes = changed.minutes
        if let sport = changed.sport, sport != session.sport {
            // Another sport: the old workout goes and a new one is built.
            session.sport = sport
            session.workout = nil
            session.gym = nil
            session.role = nil
            session.environment = sport == "gym" ? nil : changed.environment ?? "outdoor"
            if sport == "gym" { session.kind = "gym"; session.focus = nil; session.label = kindLabel("gym") }
        }
        if session.sport != "gym" { session.environment = changed.environment ?? session.environment }
        if let kind = changed.kind {
            session.kind = kind
            session.focus = changed.focus
            session.label = kindLabel(kind)
        }
        session.note = changed.note
        Task { await rebuild(resize: false) }
    }

    private func rebuild(resize: Bool) async {
        busy = true
        defer { busy = false }
        session.status = .building
        session = await session.building(model.api, resize: resize)
    }
}

/// "Upravit s AI": quick changes, or what to change in the athlete's words.
private struct AdjustSessionSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSessionDraft
    let others: [WeekSessionDraft]
    let onChange: (AdjustedSession) -> Void
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    private var chips: [(String, String)] {
        var list = [("shorter", "Kratší"), ("easier", "Lehčí"), ("harder", "Těžší")]
        if session.sport != "gym" { list.append(session.environment == "indoor" ? ("outdoor", "Venku") : ("indoor", "Uvnitř")) }
        list.append(("day", "Jiný den"))
        return list
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(chips.indices, id: \.self) { i in
                            let chip = chips[i]
                            Button {
                                Task {
                                    if chip.0 == "day" { await send(chip: nil, text: L10n.tr("Přesuň trénink na jiný vhodný den tohoto týdne.")) }
                                    else { await send(chip: chip.0, text: nil) }
                                }
                            } label: {
                                Text(L10n.tr(chip.1)).font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink)
                                    .padding(.horizontal, 14).frame(height: 36)
                                    .background(Palette.card, in: Capsule())
                                    .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                TextField(L10n.tr("Třeba: bude pršet, chci kratší a uvnitř"), text: $text, axis: .vertical)
                    .font(Typo.body).lineLimit(2...5)
                    .padding(12).background(Palette.card, in: RoundedRectangle(cornerRadius: 14))
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
                PrimaryButton(title: busy ? "Upravuji…" : "Upravit", systemImage: "sparkles", busy: busy) {
                    Task { await send(chip: nil, text: text) }
                }
                .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Spacer(minLength: 0)
            }
            .padding(20)
            .disabled(busy)
            .navigationTitle(L10n.tr("Upravit s AI"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L10n.tr("Zavřít")) { dismiss() } }
            }
        }
    }

    private func send(chip: String?, text: String?) async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            let changed = try await model.api.adjustSession(session, chip: chip, text: text, others: others)
            onChange(changed)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
