import SwiftUI

// MARK: - The week's sessions

/// Training → Tento týden: every session of the week, tap for its detail.
struct WeekSessionsList: View {
    let sessions: [WeekSession]
    let today: String

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(sessions.enumerated()), id: \.element.id) { index, session in
                NavigationLink(value: destination(session)) {
                    SessionRow(session: session, today: today)
                }
                .buttonStyle(.plain)
                .disabled(destination(session) == nil)
                if index < sessions.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
        }
    }

    private func destination(_ s: WeekSession) -> AppRoute? {
        if s.sport == "strength" && s.status != "done" { return .gym(s.date) }
        if s.kind == "activity" { return s.activityId != nil ? .activity(s) : nil }
        if s.kind == "planned", s.eventId != nil { return .planned(s) }
        return nil
    }
}

struct SessionRow: View {
    let session: WeekSession
    let today: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: SportIcon.symbol(session.sport))
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(session.status == "done" ? Palette.onButton : Palette.ink)
                .frame(width: 36, height: 36)
                .background(session.status == "done" ? Palette.amberBar : Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title).font(.subheadline.weight(.medium)).foregroundStyle(session.status == "missed" ? Palette.muted : Palette.ink).lineLimit(1)
                Text(subtitle).font(Typo.caption).foregroundStyle(session.status == "missed" ? Palette.rust : Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let tss = session.tss, tss > 0 {
                Text(Fmt.int(tss)).font(Typo.number(18)).foregroundStyle(Palette.ink)
            }
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        var parts = [session.date < today ? Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date)
                                          : Fmt.capitalized(Fmt.relativeDay(session.date, today: today))]
        if let t = session.time { parts.append(t) }
        if let m = session.minutes { parts.append(Fmt.duration(m)) }
        if session.status == "missed" { parts.append(L10n.tr("nesplněno")) }
        if session.status == "done" { parts.append(L10n.tr("hotovo")) }
        return parts.joined(separator: " · ")
    }
}

enum SportIcon {
    static func symbol(_ sport: String) -> String {
        switch sport {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "strength": return "dumbbell.fill"
        case "swim": return "figure.pool.swim"
        case "walk": return "figure.walk"
        default: return "figure.mixed.cardio"
        }
    }
}

// MARK: - Activity detail

struct ActivityDetailView: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    @State private var detail: ActivityDetail?
    @State private var error: String?
    @State private var feedback = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date) + (session.time.map { " · " + $0 } ?? "")).padding(.top, 24)
                Text(detail?.activity.name ?? session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let detail {
                    ActivityDetailContent(detail: detail)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 50)
                    Text("Detail se načítá z Intervals.icu.").font(Typo.caption).foregroundStyle(Palette.faint).frame(maxWidth: .infinity)
                }
                Button { feedback = true } label: {
                    Label("Jak to šlo?", systemImage: "text.bubble")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .padding(.top, 28)
            }
        }
        .sheet(isPresented: $feedback) { FeedbackSheet(session: session) }
        .task {
            guard detail == nil, let id = session.activityId, !model.demo else {
                if model.demo { error = "V ukázce se detail nenačítá." }
                return
            }
            do { detail = try await model.api.activityDetail(id: id) } catch { self.error = error.localizedDescription }
        }
    }
}

struct ActivityDetailContent: View {
    let detail: ActivityDetail

    var body: some View {
        let a = detail.activity
        VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 16) {
                if let t = a.moving_time { stat("Čas", Fmt.duration(Int(t / 60))) }
                if let d = a.distance, d > 0 { stat("Vzdálenost", Units.distanceText(d / 1000)) }
                if let load = a.icu_training_load { stat("Zátěž", Fmt.int(load) + " TSS") }
                if let w = a.icu_normalized_watts ?? a.average_watts { stat(a.icu_normalized_watts != nil ? "NP" : "Výkon", Fmt.int(w) + " W") }
                if let hr = a.average_heartrate { stat("Tep", Fmt.int(hr) + (a.max_heartrate.map { " / " + Fmt.int($0) } ?? "")) }
                if let i = a.icu_intensity { stat("IF", Fmt.decimal(i > 2 ? i / 100 : i, digits: 2)) }
                if let pace = runPace { stat(L10n.isEnglish ? "Pace" : "Tempo", pace) }
                if let e = a.total_elevation_gain, e > 0 { stat("Převýšení", Fmt.int(e) + " m") }
                if let c = a.calories { stat("Energie", Fmt.int(c) + " kcal") }
            }
            .padding(.top, 22)

            let hr = detail.stream("heartrate"), watts = detail.stream("watts")
            if hr.count > 10 || watts.count > 10 {
                Card {
                    if watts.count > 10 {
                        Text("Výkon").font(Typo.caption).foregroundStyle(Palette.muted)
                        LineChart(values: smooth(watts), color: Palette.amberBar, lo: 0, hi: (watts.max() ?? 300) * 0.8, lastDot: false, lineWidth: 1.4, height: 80)
                    }
                    if hr.count > 10 {
                        Text("Tep").font(Typo.caption).foregroundStyle(Palette.muted)
                        LineChart(values: smooth(hr), color: Palette.rust, lo: (hr.min() ?? 60) - 5, hi: (hr.max() ?? 180) + 5, lastDot: false, lineWidth: 1.4, height: 70)
                    }
                }
                .padding(.top, 22)
            }

            if let zones = detail.analysis?.zones, !zones.isEmpty {
                SectionLabel(text: "Čas v zónách").padding(.top, 28)
                ZoneBar(parts: zones.enumerated().map { i, z in ("Z\(i + 1)", z.seconds ?? 0, zoneColor(i, zones.count)) })
                    .padding(.top, 12)
            }

            if let laps = detail.intervals, !laps.isEmpty {
                SectionLabel(text: "Úseky").padding(.top, 28)
                VStack(spacing: 0) {
                    ForEach(Array(laps.prefix(30).enumerated()), id: \.offset) { i, lap in
                        HStack {
                            Text(lap.label ?? "\(i + 1)").font(.subheadline).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer()
                            if let s = lap.seconds { Text(Fmt.duration(max(1, Int(s / 60)))).font(Typo.caption).foregroundStyle(Palette.muted) }
                            if let w = lap.watts { Text(Fmt.int(w) + " W").font(Typo.number(17)).frame(width: 64, alignment: .trailing) }
                            if let h = lap.hr { Text(Fmt.int(h)).font(Typo.number(17)).foregroundStyle(Palette.rust).frame(width: 40, alignment: .trailing) }
                        }
                        .padding(.vertical, 9)
                        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
                .padding(.top, 8)
            }

            if let hrr = detail.hrr, let drop = hrr.drop {
                StatRow(title: "Zotavení tepu", value: Fmt.int(drop), unit: L10n.f("tepů za %@ s", Fmt.int(hrr.seconds ?? 60)))
                    .padding(.top, 18)
            }
        }
    }

    private var runPace: String? {
        let a = detail.activity
        guard (a.type ?? "").lowercased().contains("run"), let v = a.average_speed, v > 0 else { return nil }
        return Units.paceText(1000 / v)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    /// Averages of about 200 points, enough for a phone-wide line.
    private func smooth(_ values: [Double]) -> [Double] {
        let step = max(1, values.count / 200)
        return stride(from: 0, to: values.count, by: step).map { i in
            let slice = values[i..<min(values.count, i + step)]
            return slice.reduce(0, +) / Double(slice.count)
        }
    }

    private func zoneColor(_ i: Int, _ n: Int) -> Color {
        let colors = [Palette.sand, Palette.green.opacity(0.5), Palette.amberBar.opacity(0.6), Palette.amberBar, Palette.rust, Palette.rust.opacity(0.8), Palette.indigo]
        return colors[min(i, colors.count - 1)]
    }
}

// MARK: - Planned session

struct PlannedWorkoutView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSession
    @State private var plan: PlannedWorkout?
    @State private var moveDate = Date()
    @State private var moving = false
    @State private var working = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var rating = false

    /// Today's or a past session can be rated: it may be done without being paired yet.
    private var ratable: Bool { session.date <= AppModel.localDate(Date()) && !model.demo }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: Fmt.capitalized(Fmt.relativeDay(session.date, today: AppModel.localDate(Date()))) + (session.time.map { " · " + $0 } ?? "")).padding(.top, 24)
                Text(session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                HStack(spacing: 18) {
                    if let m = session.minutes { meta("Délka", Fmt.duration(m)) }
                    if let t = session.tss { meta("Zátěž", Fmt.int(t) + " TSS") }
                    if let f = plan?.workout.intensity_factor { meta("IF", Fmt.decimal(f, digits: 2)) }
                }
                .padding(.top, 16)
                if let description = plan?.workout.description, !description.isEmpty {
                    Text(description).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
                }
                if let blocks = plan?.workout.steps, !blocks.isEmpty {
                    SectionLabel(text: "Průběh").padding(.top, 26)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                            StepBlockRow(block: block)
                        }
                    }
                    .padding(.top, 10)
                }

                if ratable {
                    Button { rating = true } label: {
                        Label("Ohodnotit", systemImage: "text.bubble")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 28)
                }

                SectionLabel(text: "Změnit").padding(.top, 30)
                VStack(spacing: 10) {
                    if moving {
                        DatePicker("Nový den", selection: $moveDate, in: Date()..., displayedComponents: .date)
                            .environment(\.locale, Fmt.locale)
                        Button { Task { await move() } } label: { action("Přesunout na tento den", filled: true) }
                    } else {
                        Button { moving = true } label: { action("Přesunout na jiný den", filled: false) }
                    }
                    if session.sport == "ride" || session.sport == "run" {
                        HStack(spacing: 10) {
                            Button { Task { await environment(indoor: true) } } label: { action("Uvnitř", filled: false) }
                            Button { Task { await environment(indoor: false) } } label: { action("Venku", filled: false) }
                        }
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Text("Smazat z plánu").font(Typo.bodyStrong).foregroundStyle(Palette.rust).frame(maxWidth: .infinity).frame(height: 46)
                    }
                }
                .disabled(working || model.demo)
                .padding(.top, 10)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
            }
        }
        .sheet(isPresented: $rating) { FeedbackSheet(session: session, workoutId: plan?.source == "library" ? plan?.workout.id?.string : nil) }
        .confirmationDialog("Smazat „\(session.title)“ z plánu?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Zmizí i z kalendáře v Intervals.icu.")
        }
        .task {
            guard let id = session.eventId, !model.demo, plan == nil else { return }
            plan = try? await model.api.plannedWorkout(eventId: id)
        }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }

    private func action(_ title: String, filled: Bool) -> some View {
        Text(title).font(Typo.bodyStrong).foregroundStyle(filled ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 46)
            .background(filled ? Palette.button : .clear, in: Capsule())
            .overlay(Capsule().stroke(Palette.ink.opacity(filled ? 0 : 0.2), lineWidth: 1))
    }

    private func run(_ work: () async throws -> Void) async {
        working = true
        defer { working = false }
        do {
            try await work()
            await model.refreshTraining()
            await model.refresh()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func move() async {
        guard let id = session.eventId else { return }
        await run { try await model.api.movePlanned(eventId: id, to: AppModel.localDate(moveDate)) }
    }

    private func delete() async {
        guard let id = session.eventId else { return }
        await run { try await model.api.deletePlanned(eventId: id) }
    }

    private func environment(indoor: Bool) async {
        guard let id = session.eventId else { return }
        await run { try await model.api.setPlannedEnvironment(eventId: id, indoor: indoor) }
    }
}

/// "3× · 12 min 88–94 %" for one block of a structured workout.
struct StepBlockRow: View {
    let block: PlannedWorkout.Block

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text((block.repeats ?? 1) > 1 ? "\(block.repeats!)×" : "·").font(Typo.number(18)).foregroundStyle(Palette.amber).frame(width: 30, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array((block.steps ?? []).enumerated()), id: \.offset) { _, step in
                    Text(describe(step)).font(Typo.small).foregroundStyle(Palette.secondary)
                }
                if let note = block.note { Text(note).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
        }
    }

    private func describe(_ s: PlannedWorkout.Step) -> String {
        var parts: [String] = []
        if let d = s.durationSeconds { parts.append(d >= 60 ? Fmt.duration(Int(d / 60)) : Fmt.int(d) + " s") }
        if let lo = s.wattsLow, let hi = s.wattsHigh { parts.append(Fmt.int(lo) + "–" + Fmt.int(hi) + " W") }
        else if let lo = s.percentLow, let hi = s.percentHigh { parts.append(Fmt.int(lo) + "–" + Fmt.int(hi) + " %") }
        if let slow = s.paceSlow, let fast = s.paceFast { parts.append(ZonesSettingsView.pace(Units.pace(fast)) + "–" + ZonesSettingsView.pace(Units.pace(slow)) + " " + Units.paceUnit) }
        if let note = s.note { parts.append(note) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Feedback and manual entry

/// "Jak to šlo?": RPE 1–10 and a note. A library workout from the calendar is
/// rated through /app/api/workouts/feedback (paired with its activity, the RPE
/// written to Intervals.icu, the coach asked in the background); any other
/// session goes to the coach directly (/app/api/coach/reflections). The
/// coach's note on the session shows under the form.
struct FeedbackSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSession
    /// The library workout of a planned session, when its plan names one.
    var workoutId: String? = nil
    @State private var rpe = 6.0
    @State private var notes = ""
    @State private var link: ScheduledWorkout?
    @State private var reflection: CoachReflection?
    @State private var known = 0
    @State private var loading = true
    @State private var saving = false
    @State private var saved = false
    @State private var waiting = false
    @State private var status: String?
    @State private var error: String?

    /// The library workout and its calendar day, when the session has one.
    private var target: (id: String, date: String)? {
        if let link, !link.workoutId.isEmpty { return (link.workoutId, link.scheduledDate) }
        if let workoutId, !workoutId.isEmpty { return (workoutId, session.date) }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Jak to šlo?").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text(session.title).font(Typo.small).foregroundStyle(Palette.muted)
                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                } else {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Náročnost").font(.body)
                        Spacer()
                        Text("\(Int(rpe)) / 10").font(Typo.number(24))
                    }
                    Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar).disabled(saved)
                    TextField("Poznámka pro trenéra (nohy těžké, spal jsem málo…)", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                        .padding(12)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .disabled(saved)
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    if let status { Text(status).font(Typo.small).foregroundStyle(Palette.muted) }
                    if saved {
                        PrimaryButton(title: "Hotovo") { dismiss() }
                    } else {
                        PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                            .disabled(saving)
                    }
                    coachNote
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .task { await load() }
    }

    @ViewBuilder private var coachNote: some View {
        if waiting {
            HStack(spacing: 10) {
                ProgressView()
                Text("Trenér píše zpětnou vazbu…").font(Typo.small).foregroundStyle(Palette.muted)
            }
            .padding(.top, 8)
        } else if let text = reflection?.text {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Trenér")
                CoachMarkdown(text: text)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(.top, 8)
        }
    }

    /// The calendar link (with a rating saved before) and the coach's notes on the day.
    private func load() async {
        defer { loading = false }
        guard !model.demo else { return }
        let api = model.api, date = session.date
        async let links = try? api.scheduledWorkouts()
        async let notesOfDay = try? api.coachReflections(date: date)
        let allLinks: [ScheduledWorkout] = (await links) ?? []
        let reflections: [CoachReflection] = (await notesOfDay) ?? []
        link = ScheduledWorkout.link(for: session, in: allLinks)
        known = reflections.count
        let id = target?.id
        reflection = reflections.first(where: { id != nil && $0.workoutId == id }) ?? reflections.first
        if let r = link?.feedbackRpe ?? reflection?.rpe { rpe = min(10, max(1, r.rounded())) }
        if let n = reflection?.notes?.nilIfBlank { notes = n }
    }

    private func save() async {
        if model.demo { dismiss(); return }
        saving = true
        error = nil
        defer { saving = false }
        let text = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let target, link?.rated != true {
                do {
                    // A session kept only in the app has no activity: its planned length counts.
                    let minutes: Int? = link?.local == true ? (session.minutes ?? link?.durationMinutes.map { Int($0) }) : nil
                    let result = try await model.api.workoutFeedback(workoutId: target.id, scheduledDate: target.date, rpe: Int(rpe), notes: text, minutes: minutes)
                    saved = true
                    status = Self.intervalsText(result.intervals)
                    await model.refreshTraining()
                    if result.reflection == "pending" { await awaitReflection(date: target.date) }
                    return
                } catch where session.kind == "activity" {
                    // The plan did not pair with this activity: the note still goes to the coach.
                }
            }
            if let note = try await model.api.coachReflection(date: session.date, rpe: Int(rpe), notes: text) { reflection = note }
            saved = true
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The coach writes in the background: the day's notes are asked again for a while.
    private func awaitReflection(date: String) async {
        waiting = true
        defer { waiting = false }
        for _ in 0..<8 {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            if let list = try? await model.api.coachReflections(date: date), list.count > known, let newest = list.first {
                reflection = newest
                return
            }
        }
    }

    static func intervalsText(_ intervals: WorkoutFeedbackResult.Intervals?) -> String? {
        switch intervals?.status {
        case "ok": return L10n.tr("RPE je uložené i v Intervals.icu.")
        case "error": return L10n.f("RPE je uložené, zápis do Intervals.icu selhal: %@", intervals?.message ?? "")
        default: return nil
        }
    }
}

/// A session typed in by hand: done today or before, or planned ahead.
struct ManualWorkoutSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var sport = "ride"
    @State private var minutes = "60"
    @State private var date = Date()
    @State private var rpe = 6.0
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    private var completed: Bool { AppModel.localDate(date) <= AppModel.localDate(Date()) }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Zapsat trénink") {
                Picker("Sport", selection: $sport) {
                    Text("Kolo").tag("ride")
                    Text("Běh").tag("run")
                    Text("Posilovna").tag("gym")
                }
                .pickerStyle(.segmented)
                SettingsGroup(footer: completed ? "Zapíše se jako odcvičený a pošle do Intervals.icu." : "Budoucí den: zapíše se jako plán do Intervals.icu.") {
                    SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: L10n.tr(sport == "ride" ? "Jízda" : sport == "run" ? "Běh" : "Posilovna"))
                    SettingsDivider()
                    SettingsField(title: "Délka", text: $minutes, unit: "min", keyboard: .numberPad)
                    SettingsDivider()
                    DatePicker("Den", selection: $date, displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                }
                if completed {
                    SettingsGroup(title: "Náročnost") {
                        HStack {
                            Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar)
                            Text("\(Int(rpe))").font(Typo.number(22)).frame(width: 30)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50)
                    }
                }
                TextField("Poznámka", text: $notes, axis: .vertical)
                    .lineLimit(2...5).padding(12)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Button { Task { await save() } } label: {
                    Text(saving ? "Ukládám…" : "Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || Int(minutes) == nil)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
            }
        }
        .tint(Palette.ink)
    }

    private func save() async {
        guard let m = Int(minutes), m > 0 else { return }
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? L10n.tr(sport == "ride" ? "Jízda" : sport == "run" ? "Běh" : "Posilovna") : name
        do {
            try await model.api.manualWorkout(name: title, date: AppModel.localDate(date), sport: sport, minutes: m, completed: completed, rpe: completed ? Int(rpe) : nil, notes: notes)
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
