import SwiftUI

// Plán týdne: the athlete places sports on days ("Rozvrhnu sám") or lets the
// AI lay out the week ("Navrhne AI"). Either way the sessions are built as
// previews first; each can be opened, made longer or shorter, moved inside or
// changed with the AI, and "Uložit do kalendáře" schedules them all, and with
// "Zapisovat tréninky" also puts them into the iPhone calendar (CalendarTime).

private func sportLabel(_ sport: String) -> String {
    ["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "strength": "Posilovna", "walk": "Chůze", "swim": "Plavání", "stretch": "Protažení"][sport].map { L10n.tr($0) } ?? Fmt.capitalized(sport)
}

/// The sport's colour, as on the sport tiles in Tréninkové plány (TrainingPlansSheet.sports).
private func sportColor(_ sport: String) -> Color {
    let id = sport == "strength" ? "gym" : sport == "tri" ? "triathlon" : sport
    return TrainingPlansSheet.sports.first { $0.id == id }?.color ?? Palette.amber
}

private func sportSymbol(_ sport: String) -> String {
    ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill", "strength": "dumbbell.fill", "walk": "figure.walk", "swim": "figure.pool.swim", "stretch": "figure.flexibility"][sport] ?? "figure.mixed.cardio"
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
    /// "Přepočteno": the session changed when another one was removed;
    /// `previous` is what it was before, when the day had one of this sport.
    var recalculated = false
    var previous: String?
    /// The athlete changed it with "Upravit s AI": the asked kind passes the
    /// coach's load rules (48 h, two quality days…); red and illness still hold.
    var insisted = false
    /// The week's brick: a run straight after the day's ride, saved joined to it.
    var brick = false
    /// The time of day it goes to the calendar with ("HH:MM"); nil is any time.
    var time: String? = nil
    var workout: LibraryWorkout?
    var gym: GymProposal?
    var status: Status = .waiting

    var built: Bool { status == .ready || status == .saved }

    var title: String {
        if let gym { return gym.planName }
        return workout?.name ?? label ?? kindLabel(kind) ?? sportLabel(sport)
    }

    /// "Vytrvalost · 2 h", as the row shows what the session was before a recalculation.
    var line: String { title + " · " + Fmt.duration(minutes) }

    /// The lengths the detail offers (src/week-planner.js SESSION_MINUTES).
    static func lengths(_ sport: String, including current: Int) -> [Int] {
        let list = ["gym": [30, 45, 60, 75, 90], "run": [20, 30, 45, 60, 75, 90, 120]][sport] ?? [30, 45, 60, 75, 90, 120, 150, 180, 240]
        return list.contains(current) ? list : (list + [current]).sorted()
    }

    /// Builds the workout: a gym plan as a draft, a ride or run from the
    /// library. `resize` keeps the workout and only changes its length.
    /// `others`: the week's other sessions, so gym days follow on from each other.
    func building(_ api: APIClient, resize: Bool = false, others: [WeekSessionDraft] = []) async -> WeekSessionDraft {
        var next = self
        do {
            if sport == "gym" {
                let gymDays = others.filter { $0.sport == "gym" && $0.date != date }
                next.gym = try await api.previewGym(date: date, minutes: minutes, focus: role == "gym_upper" ? "upper" : nil, muscles: [], fromWeek: true,
                                                    gymDays: gymDays.map(\.date),
                                                    weekSessions: gymDays.compactMap { s in s.gym.map { (date: s.date, rows: $0.rows) } })
            } else {
                let r = try await api.generateWeekSession(date: date, sport: sport, minutes: minutes, environment: environment, focus: focus,
                                                          insisted: insisted, resize: resize ? workout?.id : nil)
                guard let w = r.workout else { throw APIError.message(r.message ?? L10n.tr("Bez návrhu.")) }
                next.workout = w
                // The coach still eased the kind (red, illness…): the pill and the
                // note say what the steps are, not what was asked.
                if let eased = r.eased {
                    next.kind = eased.kind
                    next.focus = eased.focus
                    next.label = kindLabel(eased.kind)
                    next.note = eased.why.map { L10n.f("Kouč nechal trénink lehčí: %@.", $0) } ?? L10n.tr("Kouč nechal trénink lehčí.")
                }
            }
            next.status = .ready
        } catch {
            next.status = .failed(error.localizedDescription)
        }
        return next
    }
}

/// "Plán týdne" built but not yet in the calendar, by the week's Monday: it
/// waits while the athlete leaves the screen (to the coach, the calendar…)
/// and comes back, until it is saved or planned again. Kept for this run of
/// the app; a sign-out clears it.
struct WeekPlanDraft {
    var mode: String
    var days: [[String]]
    var sessions: [WeekSessionDraft]
    var summary: String?
    var notice: String?
    var warnings: [WeekProposalResponse.Warning]
    var check: WeekCheck?
    var checkApplied: Bool
}

enum WeekPlanDraftMemory {
    static var drafts: [String: WeekPlanDraft] = [:]
}

struct WeekPlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
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
    /// "Přesně": the session whose exact time is being picked.
    @State private var exactFor: UUID?
    /// The sessions "Upravit sám" set aside: their times come back on the rebuilt week.
    @State private var timesBefore: [WeekSessionDraft] = []
    @State private var exactTime = Date()
    /// "Kontrola týdne" of the built week (WeekCheck.swift); `checkApplied`
    /// once "Upravit" changed the sessions.
    @State private var check: WeekCheck?
    @State private var checkApplied = false

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
        .task {
            if sessions.isEmpty { await restore() }
            if plan == nil { await load() }
        }
        .onChange(of: weekStart) { old, _ in
            keep(old)
            sessions = []
            check = nil
            summary = nil
            Task {
                await restore()
                await load()
            }
        }
        .onChange(of: sessions) { _, _ in keep(weekStart) }
        .onChange(of: check) { _, _ in keep(weekStart) }
        .onDisappear { keep(weekStart) }
        .sheet(isPresented: Binding(get: { exactFor != nil }, set: { if !$0 { exactFor = nil } })) { exactSheet }
    }

    // MARK: The unsaved week

    /// The built week waits for the athlete (WeekPlanDraftMemory); a saved or
    /// emptied one is forgotten.
    private func keep(_ week: String) {
        guard !model.demo else { return }
        if sessions.isEmpty || sessions.allSatisfy({ $0.status == .saved }) {
            WeekPlanDraftMemory.drafts[week] = nil
        } else {
            WeekPlanDraftMemory.drafts[week] = WeekPlanDraft(mode: mode, days: days, sessions: sessions, summary: summary, notice: notice,
                                                             warnings: warnings, check: check, checkApplied: checkApplied)
        }
    }

    /// The week the athlete left; sessions still being built when the screen
    /// closed are built now.
    private func restore() async {
        guard let d = WeekPlanDraftMemory.drafts[weekStart] else { return }
        mode = d.mode
        days = d.days
        sessions = d.sessions.map { s in
            var s = s
            if s.status == .building { s.status = .waiting }
            return s
        }
        summary = d.summary
        notice = d.notice
        warnings = d.warnings
        check = d.check
        checkApplied = d.checkApplied
        if sessions.contains(where: { $0.status == .waiting }) {
            working = true
            defer { working = false }
            await buildAll()
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
                    Image(systemName: "clock").scaledFont(16, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.amber)
                        .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(weekStart == nextWeek ? "Čas příští týden" : "Čas tento týden").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        if let summary = timeSummary {
                            Text(verbatim: summary).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(working || saving)
    }

    private var timeSummary: String? {
        guard let prefs = plan?.prefs else { return nil }
        let total = WeekPlanPrefs.available(prefs).filter { $0 > 0 }.reduce(0, +)
        var parts = [total > 0 ? Fmt.duration(total) : L10n.tr("Nenastaveno")]
        parts.append(WeekPlanPrefs.followsCalendar(prefs) ? L10n.tr("podle kalendáře")
                     : WeekPlanPrefs.source(prefs) == "week" ? L10n.tr("upraveno jen pro tento týden") : L10n.tr("podle tvého běžného týdne"))
        if let t = plan?.targets, t.recovery == true { parts.append(L10n.tr("odpočinkový týden")) }
        return parts.joined(separator: " · ")
    }

    private func dayMinutes(_ w: Int) -> Int {
        WeekPlanPrefs.available(plan?.prefs)[w]
    }

    private func date(_ w: Int) -> String { ISODay.shift(weekStart, w) }

    // MARK: Rozvrhnu sám

    private var layout: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(picked.map { L10n.f("Klepni na den, kam dát: %@", sportLabel($0)) } ?? L10n.tr("Vyber sport a klepni na den."))
                .font(Typo.small).foregroundStyle(Palette.secondary).padding(.top, 18)
            // Four sports don't fit one line on a small phone: they scroll.
            ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(WeekPlanPrefs.sports, id: \.self) { sport in
                    Button {
                        picked = picked == sport ? nil : sport
                    } label: {
                        let on = picked == sport
                        Label {
                            Text(sportLabel(sport)).foregroundStyle(on ? Palette.onAccent : Palette.ink)
                        } icon: {
                            Image(systemName: sportSymbol(sport)).foregroundStyle(on ? Palette.onAccent : sportColor(sport))
                        }
                            .font(Typo.small.weight(.semibold))
                            .padding(.horizontal, 12).frame(height: 36)
                            .background(on ? sportColor(sport) : Palette.card, in: Capsule())
                            .overlay { Capsule().stroke(Palette.hairline, lineWidth: on ? 0 : 1) }
                    }
                    .buttonStyle(.plain)
                }
            }
            }
            .scrollClipDisabled()
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
            if working { CoachThinking(text: L10n.tr("Kouč sestavuje tréninky…")).padding(.top, 12) }
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
                        ScrollView(.horizontal) {
                            HStack(spacing: 6) {
                                ForEach(Array(days[w].enumerated()), id: \.offset) { k, sport in
                                    chip(sport, removable: !past) { withAnimation(.snappy) { _ = days[w].remove(at: k) } }
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
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
            Image(systemName: sportSymbol(sport)).scaledFont(11, weight: .semibold)
            Text(sportLabel(sport)).font(Typo.caption.weight(.semibold))
            if removable {
                Button(action: remove) {
                    Image(systemName: "xmark").scaledFont(9, weight: .bold).padding(3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.f("Odebrat %@", sportLabel(sport)))
            }
        }
        .foregroundStyle(sportColor(sport))
        .padding(.leading, 9).padding(.trailing, removable ? 5 : 9).frame(height: 28)
        .background(sportColor(sport).opacity(0.16), in: Capsule())
    }

    /// The layout becomes this week's own plan, the rules give each sport its
    /// length and role, and every session is built.
    /// `previous`: the sessions before "Odebrat z plánu"; the ones the new
    /// layout keeps as they were keep their built workout.
    private func buildLayout(previous: [WeekSessionDraft]? = nil) async {
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
                let next = WeekSessionDraft(date: item.date, sport: sport, minutes: item.minutes ?? (sport == "run" ? 45 : 60),
                                            environment: sport == "gym" ? nil : item.environment ?? "outdoor",
                                            label: item.label, reason: item.reason, role: item.role)
                guard let previous else { return next }
                if let same = previous.first(where: { $0.built && $0.date == next.date && $0.sport == next.sport && $0.minutes == next.minutes
                                                     && $0.environment == next.environment && $0.role == next.role }) {
                    return same
                }
                return Self.recalculated(next, from: previous)
            }
            sessions = Self.keepingTimes(sessions, from: previous ?? timesBefore)
            timesBefore = []
            if sessions.isEmpty { error = L10n.tr("Na zvolené dny nezbývá dost času na trénink. Přidej čas nahoře.") }
            await buildAll()
            await runCheck()
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
            if working { CoachThinking(text: L10n.tr("Kouč navrhuje týden…")).padding(.top, 12) }
        }
    }

    /// With a correction the AI fixes its last proposal; a session it keeps
    /// as it was keeps its built workout.
    /// `removed`: the session "Odebrat z plánu" took out; it stays out and the
    /// sessions that changed around it are marked.
    private func proposeAI(correction: String? = nil, removed: WeekSessionDraft? = nil) async {
        timesBefore = []
        working = true
        defer { working = false }
        error = nil
        do {
            let r = try await model.api.weekAI(start: weekStart, note: note, correction: correction, previous: sessions)
            let previous = sessions.filter { $0.id != removed?.id }
            summary = r.summary
            notice = r.ai == false ? r.message : nil
            warnings = r.warnings ?? []
            sessions = (r.items ?? []).filter { item in
                guard let removed else { return true }
                return !(item.date == removed.date && (item.sport == "strength" ? "gym" : item.sport) == removed.sport)
            }.map { item in
                let sport = item.sport == "strength" ? "gym" : item.sport
                var next = WeekSessionDraft(date: item.date, sport: sport, minutes: item.minutes ?? 60,
                                            environment: sport == "gym" ? nil : item.environment ?? "outdoor",
                                            kind: item.kind, focus: item.focus, label: item.label, reason: item.reason, role: item.role)
                next.brick = item.brick
                if var same = previous.first(where: { $0.built && $0.date == next.date && $0.sport == next.sport && $0.minutes == next.minutes
                                                     && $0.environment == next.environment && $0.kind == next.kind }) {
                    same.reason = next.reason
                    same.note = nil
                    same.brick = next.brick
                    return same
                }
                return removed == nil ? next : Self.recalculated(next, from: previous)
            }
            sessions = Self.keepingTimes(sessions, from: previous)
            if sessions.isEmpty { error = L10n.tr("Na tento týden nevyšel žádný trénink.") }
            if correction != nil && removed == nil { self.correction = "" }
            await buildAll()
            await runCheck()
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
            if working { CoachThinking(text: L10n.tr("Kouč upravuje návrh…")).padding(.top, 10) }
        }
    }

    // MARK: The built week

    private var generated: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let check, !(check.changes ?? []).isEmpty, !sessions.contains(where: { $0.status == .saved }) {
                WeekCheckContent(check: check, today: today, applied: checkApplied,
                                 appliedText: L10n.tr("Upraveno. Tréninky níže jsou podle kontroly."), busy: working,
                                 onKeep: { withAnimation { self.check = nil } },
                                 onApply: { Task { await applyCheck(check) } })
                    .padding(.top, 18)
            }
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
                    if session.sport == "stretch" {
                        row(session)
                    } else {
                    NavigationLink {
                        WeekSessionDetailView(session: $session, others: sessions.filter { $0.id != session.id }, weekStart: weekStart,
                                              onRemove: removal(session.id))
                    } label: {
                        row(session)
                    }
                    .buttonStyle(.plain)
                    .disabled(session.status == .waiting || session.status == .building)
                    // The time chip sits over the card, outside the link.
                    .overlay(alignment: .trailing) {
                        if timeable(session) { timeChip(session).padding(.trailing, 48) }
                    }
                    }
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
                    timesBefore = []
                    summary = nil
                    check = nil
                }
                .padding(.top, 10)
            }
        }
    }

    private func row(_ s: WeekSessionDraft) -> some View {
        Card(padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: sportSymbol(s.sport)).scaledFont(17, cap: .denseCap).foregroundStyle(sportColor(s.sport))
                    .frame(width: 38, height: 38).background(sportColor(s.sport).opacity(0.16), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(Fmt.capitalized(Fmt.dayHeading(s.date))).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(s.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                    Text([Fmt.duration(s.minutes), timeable(s) ? nil : slot(s), s.environment.map { L10n.tr($0 == "indoor" ? "uvnitř" : "venku") }, kindLabel(s.kind)]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if s.brick {
                        Label(L10n.tr("Brick · hned po kole"), systemImage: "link").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.amber)
                    }
                    if case .failed(let message) = s.status {
                        Text(message).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                    if s.recalculated {
                        if let previous = s.previous {
                            Text(verbatim: previous).font(Typo.caption).foregroundStyle(Palette.faint).strikethrough().lineLimit(1)
                        }
                        Label(L10n.tr("Přepočteno"), systemImage: "sparkles").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.amber)
                    }
                    if let blocks = s.workout?.steps, !WorkoutProfile.segments(blocks).isEmpty {
                        WorkoutProfile(blocks: blocks, sport: s.sport, compact: true).padding(.top, 4)
                    }
                }
                Spacer(minLength: 4)
                if timeable(s) { chipLabel(s).hidden().accessibilityHidden(true) }
                Group {
                switch s.status {
                case .waiting, .building: ProgressView()
                case .saved: Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.green)
                case .failed: Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.rust)
                case .ready: Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                }
                }
                .frame(width: 22)
            }
        }
    }

    /// A ride, run or swim still to save gets a time of day (mockup B).
    private func timeable(_ s: WeekSessionDraft) -> Bool {
        ["ride", "run", "swim"].contains(s.sport) && s.status != .saved
    }

    /// The brick run starts when the day's ride ends, +5 min to change
    /// (src/planned-links.js followingTime); nil while the ride has no time.
    private func brickTime(_ s: WeekSessionDraft) -> String? {
        guard s.brick, let index = sessions.firstIndex(where: { $0.id == s.id }),
              let ride = sessions[..<index].last(where: { $0.date == s.date && $0.sport == "ride" }),
              let time = ride.time, let h = Int(time.prefix(2)), let m = Int(time.suffix(2)) else { return nil }
        let end = min(23 * 60 + 59, h * 60 + m + ride.minutes + 5)
        return String(format: "%02d:%02d", end / 60, end % 60)
    }

    /// The chip's face; the row keeps a hidden copy of it, so the space it
    /// leaves grows with the text size.
    private func chipLabel(_ s: WeekSessionDraft) -> some View {
        let shown = s.brick ? brickTime(s) : s.time
        return HStack(spacing: 4) {
            Image(systemName: "clock").scaledFont(11, weight: .medium, cap: .denseCap)
            Text(verbatim: shown.map { ClockText.format($0) } ?? L10n.tr("Kdykoli")).font(Typo.caption.weight(.medium))
        }
        .lineLimit(1)
        .fixedSize()
        .foregroundStyle(s.brick ? Palette.amber : Palette.ink)
        .padding(.horizontal, 10).frame(minHeight: 28)
        .background(Palette.track, in: Capsule())
    }

    private func timeChip(_ s: WeekSessionDraft) -> some View {
        let label = chipLabel(s)
        return Group {
            if s.brick {
                // Follows the ride; "Hned po sobě, nebo zvlášť" in Trénink changes it.
                label.accessibilityLabel(L10n.tr("Brick · hned po kole"))
            } else {
                Menu {
                    ForEach(MovePlannedSheet.Slot.allCases) { slot in
                        Button {
                            if slot == .exact {
                                exactTime = Self.date(s.time) ?? Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: Date()) ?? Date()
                                exactFor = s.id
                            } else {
                                setTime(s.id, slot.clock)
                            }
                        } label: {
                            let current = slot == .exact ? s.time != nil && !MovePlannedSheet.Slot.allCases.contains { $0.clock == s.time } : slot.clock == s.time
                            if current { Label(L10n.tr(slot.label), systemImage: "checkmark") } else { Text(verbatim: L10n.tr(slot.label) + (slot.clock.map { " · " + ClockText.format($0) } ?? "")) }
                        }
                    }
                } label: { label }
                .accessibilityLabel(L10n.tr("Čas"))
                // Fixed while the week saves: the time already went out.
                .disabled(saving || working)
            }
        }
    }

    private func setTime(_ id: UUID, _ time: String?) {
        guard let i = sessions.firstIndex(where: { $0.id == id }) else { return }
        sessions[i].time = time
    }

    private static func date(_ time: String?) -> Date? {
        guard let time, time.count == 5, let h = Int(time.prefix(2)), let m = Int(time.suffix(2)) else { return nil }
        return Calendar.current.date(bySettingHour: h, minute: m, second: 0, of: Date())
    }

    /// "Přesně": the wheel for one session's time.
    private var exactSheet: some View {
        VStack(spacing: 16) {
            DatePicker(L10n.tr("Přesný čas"), selection: $exactTime, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel).labelsHidden()
                .environment(\.locale, Fmt.locale)
            PrimaryButton(title: "Uložit", systemImage: "checkmark", busy: false) {
                let c = Calendar.current.dateComponents([.hour, .minute], from: exactTime)
                if let id = exactFor { setTime(id, String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)) }
                exactFor = nil
            }
        }
        .padding(24)
        .presentationDetents([.height(320)])
        .glassSheetBackground()
    }

    /// "18:30–19:15": the session's time in the day's free time, when the
    /// calendar is read; a day's sessions follow one another.
    private func slot(_ s: WeekSessionDraft) -> String? {
        let day = sessions.filter { $0.date == s.date }
        guard let index = day.firstIndex(where: { $0.id == s.id }) else { return nil }
        return CalendarTime.shared.slotText(date: s.date, minutes: day.map(\.minutes), index: index)
    }

    /// "Odebrat z plánu": the session goes. "Jen odebrat" keeps the rest as it
    /// is; "Odebrat a přepočítat" plans the rest of the week again without it:
    /// by the AI with its proposal, or the layout without that sport on the day.
    private func remove(_ id: UUID, recalculate: Bool) async {
        // The detail closes first: its session must not go while it shows it.
        try? await Task.sleep(for: .milliseconds(500))
        guard let i = sessions.firstIndex(where: { $0.id == id }) else { return }
        let gone = sessions[i], before = sessions
        check = nil
        if !recalculate {
            let w = ISODay.weekdayIndex(gone.date)
            if let k = days[w].firstIndex(of: gone.sport) { days[w].remove(at: k) }
            withAnimation { sessions.remove(at: i) }
            if !sessions.isEmpty { await runCheck() }
            return
        }
        if mode == "ai" {
            let correction = L10n.f("Odeber %@ (%@) a zbytek týdne přepočítej.", sportLabel(gone.sport).lowercased(), Fmt.dayHeading(gone.date).lowercased())
            await proposeAI(correction: correction, removed: gone)
        } else {
            let w = ISODay.weekdayIndex(gone.date)
            if let k = days[w].firstIndex(of: gone.sport) { days[w].remove(at: k) }
            sessions.remove(at: i)
            if days.allSatisfy(\.isEmpty) {
                sessions = []
                summary = nil
                return
            }
            await buildLayout(previous: before.filter { $0.id != id })
        }
    }

    /// The detail's "Odebrat z plánu" until the week is in the calendar.
    private func removal(_ id: UUID) -> ((Bool) -> Void)? {
        guard !sessions.contains(where: { $0.status == .saved }) else { return nil }
        return { recalculate in Task { await remove(id, recalculate: recalculate) } }
    }

    /// A session that is new or changed after a removal, with what the day had before.
    private static func recalculated(_ next: WeekSessionDraft, from previous: [WeekSessionDraft]) -> WeekSessionDraft {
        var next = next
        next.recalculated = true
        next.previous = previous.first { $0.date == next.date && $0.sport == next.sport }?.line
        return next
    }

    /// A recalculated week keeps the times the athlete gave: a new session takes
    /// the time of the one it replaced (same day and sport), each time once.
    private static func keepingTimes(_ list: [WeekSessionDraft], from previous: [WeekSessionDraft]) -> [WeekSessionDraft] {
        var left = previous.filter { $0.time != nil }
        left.removeAll { old in list.contains { $0.id == old.id } }
        return list.map { s in
            guard s.time == nil, !s.brick, let k = left.firstIndex(where: { $0.date == s.date && $0.sport == s.sport }) else { return s }
            var s = s
            s.time = left.remove(at: k).time
            return s
        }
    }

    /// One at a time: the server builds each session from the whole week.
    private func buildAll() async {
        for i in sessions.indices where !sessions[i].built {
            sessions[i].status = .building
            let id = sessions[i].id
            let next = await sessions[i].building(model.api, others: sessions.filter { $0.id != id })
            if let k = sessions.firstIndex(where: { $0.id == id }) { sessions[k] = next }
        }
    }

    /// "Kontrola týdne": the built week against the athlete's state and the form ahead.
    private func runCheck() async {
        checkApplied = false
        check = try? await model.api.weekCheckDraft(start: weekStart, sessions: sessions)
    }

    /// "Upravit": the check's changes on the built sessions; moved and eased
    /// ones are built again, a session swapped for stretching becomes one.
    private func applyCheck(_ c: WeekCheck) async {
        let focusOf = ["recovery": "recovery", "endurance": "endurance", "long": "long_endurance", "tempo": "tempo",
                       "sweet_spot": "sweet_spot", "threshold": "threshold", "vo2max": "vo2max"]
        for change in c.changes ?? [] {
            guard let i = sessions.firstIndex(where: { $0.id.uuidString == change.id }) else { continue }
            switch change.type {
            case "move":
                guard let date = change.to?.date else { continue }
                sessions[i].date = date
                sessions[i].gym = nil
                sessions[i].status = .waiting
            case "cancel":
                sessions.remove(at: i)
            case "recovery":
                let s = sessions[i]
                sessions[i] = WeekSessionDraft(date: s.date, sport: "stretch", minutes: change.to?.minutes ?? 12, environment: nil,
                                               label: L10n.tr("Protažení"), status: .ready)
            default:
                if let kind = change.to?.kind { sessions[i].kind = kind; sessions[i].focus = focusOf[kind] }
                if let minutes = change.to?.minutes { sessions[i].minutes = minutes }
                sessions[i].workout = nil
                sessions[i].status = .waiting
            }
        }
        sessions.sort { $0.date < $1.date }
        withAnimation { checkApplied = true }
        working = true
        defer { working = false }
        await buildAll()
    }

    /// The AI's week (or the built one) back as a layout to change by hand.
    private func editLayout() {
        var next = Array(repeating: [String](), count: 7)
        for s in sessions where s.status != .saved {
            let w = ISODay.weekdayIndex(s.date)
            if next[w].count < WeekPlanPrefs.maxPerDay { next[w].append(s.sport) }
        }
        days = next
        timesBefore = sessions.filter { $0.status != .saved }
        sessions = []
        summary = nil
        check = nil
        mode = "manual"
    }

    private func save() async {
        saving = true
        defer { saving = false }
        /// The day's last saved ride, which the brick run follows.
        var rides: [String: String] = [:]
        for i in sessions.indices where sessions[i].status == .ready {
            let s = sessions[i]
            do {
                if s.sport == "stretch" {
                    try await model.api.addStretching(date: s.date)
                } else if let gym = s.gym {
                    guard let draftId = gym.draftId else { throw APIError.message(L10n.tr("Trénink se nepodařilo sestavit.")) }
                    try await model.api.confirmGym(draftId: draftId, rows: gym.rows)
                } else if let w = s.workout {
                    // The brick run gets no time of its own: joining it to the
                    // saved ride sets it from the ride's real length (planned-links.js).
                    let event = try await model.api.scheduleWorkout(id: w.id, date: s.date, indoor: s.environment == "indoor",
                                                                    time: s.brick ? nil : s.time)
                    if s.sport == "ride", let event { rides[s.date] = event }
                    // Joined, it goes to the watch with the ride as one workout.
                    if s.brick, let event, let ride = rides[s.date] { try await model.api.linkPlanned(eventId: event, after: ride) }
                }
                sessions[i].status = .saved
            } catch {
                sessions[i].status = .failed(error.localizedDescription)
            }
        }
        await model.refreshTraining()
        await model.loadCalendar(from: weekStart, to: ISODay.shift(weekStart, 6), force: true)
        // All in the calendar: back to where the week was planned from (Trénink),
        // after a moment with "Hotovo, je v kalendáři" (Petr 2026-10-27).
        if sessions.allSatisfy({ $0.status == .saved }) {
            try? await Task.sleep(for: .milliseconds(700))
            dismiss()
        }
    }

    private func load() async {
        guard !model.demo else { error = L10n.tr("V ukázce se týden neplánuje."); return }
        let start = weekStart
        loading = true
        defer { loading = false }
        await CalendarTime.shared.send(api: model.api)
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
    /// "Odebrat z plánu" (true: and recalculate the rest), nil once the week is in the calendar.
    var onRemove: ((Bool) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var asking = false
    @State private var busy = false
    @State private var confirmRemove = false

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
                    CoachThinking(text: L10n.tr("Kouč upravuje trénink…")).padding(.vertical, 12)
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
                    ScrollView(.horizontal) {
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
                    .scrollIndicators(.hidden)
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

                    if let onRemove {
                        Button { confirmRemove = true } label: {
                            Label(L10n.tr("Odebrat z plánu"), systemImage: "trash")
                                .font(Typo.body.weight(.medium)).foregroundStyle(Palette.rust)
                                .frame(maxWidth: .infinity).frame(height: 44)
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                        .confirmationDialog(L10n.f("Odebrat „%@“?", session.title), isPresented: $confirmRemove, titleVisibility: .visible) {
                            Button("Jen odebrat", role: .destructive) {
                                dismiss()
                                onRemove(false)
                            }
                            Button("Odebrat a přepočítat") {
                                dismiss()
                                onRemove(true)
                            }
                        } message: {
                            Text("Ostatní tréninky můžeš nechat, jak jsou, nebo je nechat přepočítat.")
                        }
                    }
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
        session.insisted = true
        session.note = changed.note
        Task { await rebuild(resize: false) }
    }

    private func rebuild(resize: Bool) async {
        busy = true
        defer { busy = false }
        session.status = .building
        session = await session.building(model.api, resize: resize, others: others)
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
                ScrollView(.horizontal) {
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
                                    .overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
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
