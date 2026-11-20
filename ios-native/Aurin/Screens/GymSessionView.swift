import SwiftUI
import WebKit
import UIKit

/// Today's gym session: the exercises and their sets. Tick a set to record it
/// (the planned weight and reps unless changed), swap an exercise, see how to
/// do it. Without a plan it builds one for the chosen length.
struct GymSessionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    /// The done activity it was opened from: a day can have several lifting
    /// sessions (two merged, one more), and ⋯ changes this one.
    var session: WeekSession? = nil
    @State private var day: GymDay?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var technique: String?
    @State private var alternativesFor: String?
    @State private var minutes = 60
    /// The day's parts as changed in Dnešní trénink (GymDayParts).
    @AppStorage(GymDayParts.storageKey) private var dayParts = ""
    @State private var muscles: [String: [String: Double]] = [:]
    @State private var changing = false
    @State private var rating = false
    @State private var ratingDone = false
    @State private var finishing = false
    /// Opened on a workout already done: its sets as a table to fix (GymLog.swift).
    @State private var doneMode = false
    @State private var changingType = false
    /// What the warm-up and stretching add to each length, shown under the length picker.
    @State private var extra: [String: GymPreferences.Extra]?
    @State private var deleting = false
    @State private var unpairing = false
    @State private var editingKcal = false
    /// The set whose letter is being chosen (IntensitySheet), as in Režim tréninku.
    @State private var intensityFor: SetRef?
    @State private var history: GymHistory = .empty
    /// The planned detail's sheets: Why this workout, Reorder (Edit exercises), Add exercise.
    @State private var whyOpen = false
    @State private var reordering = false
    @State private var adding = false
    @State private var catalog: [GymCatalogExercise] = []

    init(date: String, session: WeekSession? = nil) {
        self.date = date
        self.session = session
    }

    /// Tests: the screen with this day and its muscles, nothing loaded.
    init(date: String, preview: GymDay, muscles: [String: [String: Double]] = [:]) {
        self.date = date
        _day = State(initialValue: preview)
        _muscles = State(initialValue: muscles)
        _loading = State(initialValue: false)
        previewing = true
    }

    private var previewing = false

    /// A plan to do (not done, not cancelled away): the concept's planned detail.
    private var planned: Bool { !showsDone && day?.exercises.isEmpty == false }

    /// The lifting session from the watch or Intervals.icu that day.
    private var doneSession: WeekSession? { session.map(model.liveSession) ?? model.doneStrengthSession(on: date) }

    /// What Smazat aktivitu and Upravit kalorie change: the done activity, so
    /// deleting one of the day's sessions leaves the exercises with the others;
    /// the plan saved in the app (gym:<date>, its sets hidden too) only without one.
    private var editTarget: (id: String, app: Bool)? {
        if let s = doneSession { return (s.id, s.id.hasPrefix("gym:")) }
        if !(day?.exercises.isEmpty ?? true) { return ("gym:" + date, true) }
        return nil
    }

    /// What Změnit typ aktivity changes: the plan saved in the app, else the watch's or Intervals.icu's session.
    private var typeTarget: (id: String, type: String?, source: String?)? {
        if !(day?.exercises.isEmpty ?? true) { return ("gym:" + date, "WeightTraining", "app") }
        guard let s = doneSession else { return nil }
        if s.activityId != nil { return (s.id, nil, "intervals") }
        if let watch = s.watch { return (watch.id, nil, watch.source) }
        return nil
    }

    /// A lifting session done that day shows as done even when the day's plan
    /// was cancelled: the workout happened, the cancellation is only the plan's.
    private var showsDone: Bool {
        if doneSession != nil { return true }
        return doneMode && day?.cancelled != true
    }

    /// Done: every set ticked, or a past day with sets ticked.
    private static func isDone(_ day: GymDay, date: String) -> Bool {
        let sets = day.exercises.flatMap { $0.sets }
        guard sets.contains(where: { $0.done }) else { return false }
        return date < AppModel.localDate(Date()) || sets.allSatisfy { $0.done }
    }

    private var load: [String: Double] {
        muscles.values.reduce(into: [String: Double]()) { out, map in for (k, v) in map { out[k] = max(out[k] ?? 0, v) } }
    }

    /// The plan note starts with "Zvolené partie: …." the figure shows instead.
    static func withoutMuscleList(_ note: String?) -> String? {
        guard var text = note else { return nil }
        if text.hasPrefix("Zvolené partie:") || text.hasPrefix("Chosen muscle groups:"), let end = text.firstIndex(of: ".") {
            text = String(text[text.index(after: end)...]).trimmingCharacters(in: .whitespaces)
        }
        return text.nilIfBlank
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: planned ? L10n.tr("Posilovna").uppercased(with: Fmt.locale) : day?.planName ?? "Posilovna",
                     pinTitle: planned) {
            content
        }
        // Start workout pinned at the bottom as an ink pill (concept K04/017).
        .overlay(alignment: .bottom) {
            if planned, let day, !model.demo || previewing { startPill(day) }
        }
        .task { if !previewing { await load() } }
        .sheet(isPresented: $whyOpen) { GymWhySheet(reasons: GymWhy.reasons(day?.note)) }
        .sheet(isPresented: $reordering) {
            if let day {
                EditExercisesSheet(day: day, catalog: catalog, current: nil) { edited in
                    self.day = edited
                    Task { await save() }
                }
            }
        }
        .sheet(isPresented: $adding) {
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day?.exercises.map(\.name) ?? [])) { name in
                Task { await add(name) }
            }
        }
        .sheet(item: $intensityFor) { ref in
            let set: GymSet? = day?.exercises.flatMap(\.sets).first(where: { $0.row == ref.id })
            IntensitySheet(title: set.map { $0.drop ? L10n.tr("Dropset") : $0.warmup ? L10n.tr("Rozcvička") : L10n.f("Série %@", $0.number) } ?? "",
                           selected: set?.intensity) { letter in
                Task { await pickIntensity(ref.id, letter) }
            }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name, replace: { Task { try? await Task.sleep(for: .milliseconds(450)); alternativesFor = item.name } })
        }
        .sheet(item: Binding(get: { alternativesFor.map { Named(name: $0) } }, set: { alternativesFor = $0?.name })) { item in
            AlternativesSheet(date: date, exercise: item.name, choose: { _ in },
                              chooseAlternative: { alt in Task { await replace(item.name, with: alt) } })
        }
        .sheet(isPresented: $changing) {
            GymPlanActionsSheet(date: date, title: day?.planName, cancelled: day?.cancelled == true) { Task { await load() } }
        }
        // Rated or skipped: the workout is done, back to where it was opened.
        .sheet(isPresented: $rating, onDismiss: { dismiss() }) {
            GymRatingSheet(date: date, exercises: day?.exerciseNames ?? [])
        }
        .sheet(isPresented: $ratingDone) {
            GymRatingSheet(date: date, exercises: day?.exerciseNames ?? [])
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The planned workout has its own hero (concept K04/017); the label and
            // ⋯ stay for a done one and for a day without a plan.
            if !planned {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: L10n.tr("Posilovna") + ", " + Fmt.relativeDay(date, today: AppModel.localDate(Date())))
                    Spacer()
                    // Move or cancel the day's session (GymPlanActions.swift).
                    if !model.demo && !showsDone && (day?.cancelled == true || !(day?.exercises.isEmpty ?? true)) {
                        Button { changing = true } label: {
                            Text("Změnit").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                        }
                        .accessibilityLabel("Změnit trénink")
                    }
                    // Done: the gym session was another sport (Crossfit, HIIT…).
                    if !model.demo && showsDone, let typeTarget, let editTarget {
                        Menu {
                            Button { changingType = true } label: { Label("Změnit typ aktivity", systemImage: "arrow.triangle.2.circlepath") }
                            if !editTarget.app {
                                Button { editingKcal = true } label: { Label("Upravit kalorie", systemImage: "flame") }
                            }
                            // Paired with the day's gym plan or a plan: apart again, the activity stays.
                            if doneSession?.unpairTarget != nil {
                                Button { unpairing = true } label: { Label("Odpárovat od plánu", systemImage: "minus.circle") }
                            }
                            Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                        } label: {
                            Image(systemName: "ellipsis").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                                .frame(width: 36, height: 32).contentShape(Rectangle())
                        }
                        .accessibilityLabel("Další volby")
                        .sheet(isPresented: $changingType) {
                            ActivityTypeSheet(activityId: typeTarget.id, current: typeTarget.type, source: typeTarget.source) { dismiss() }
                        }
                        .activityEditing(id: editTarget.id, title: day?.planName ?? doneSession?.title ?? L10n.tr("Posilovna"),
                                         kcal: doneSession?.kcal, edited: doneSession?.kcalEdited == true,
                                         deleting: $deleting, editingKcal: $editingKcal) { dismiss() }
                        .activityUnpairing(session: doneSession, asking: $unpairing) { dismiss() }
                    }
                }
                .padding(.top, 24)
            }
            if loading && day == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if showsDone {
                GymDoneDetail(date: date,
                              day: Binding(get: { day ?? GymDay(date: date, values: [], cancelled: nil) }, set: { day = $0 }),
                              session: doneSession,
                              save: { await save() })
                // Only a paused workout goes on; a finished one never offers Resume (device test 602).
                if !model.demo, date == AppModel.localDate(Date()), LiveWorkout.shared.running, LiveWorkout.shared.pausedAt != nil {
                    Button {
                        TrainingModeView.resumeOnOpen = date
                        model.push(.trainingMode(date))
                    } label: {
                        Label("Pokračovat v tréninku", systemImage: "play.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                            .frame(maxWidth: .infinity).frame(height: 54)
                            .background(Palette.green, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 24)
                }
                // A session done live, logged by hand or from the watch can be rated too.
                if !model.demo, !(day?.exerciseNames.isEmpty ?? true) {
                    Button { ratingDone = true } label: {
                        Label("Ohodnotit", systemImage: "hand.thumbsup")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 24)
                }
                // A done workout is kept or sent on too, without its weights.
                if let day, !day.exercises.isEmpty {
                    let kept = WorkoutTemplate.from(day, minutes: nil)
                    if !kept.isEmpty {
                        SaveWorkoutButton(template: kept).padding(.top, 10)
                        ShareWorkoutButton(template: kept, date: nil, groups: WorkoutSharing.groups(muscles, template: kept)).padding(.top, 10)
                    }
                }
            } else if let day, !day.exercises.isEmpty {
                plannedDetail(day)
            } else {
                Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                    .font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
                Picker("Délka", selection: $minutes) {
                    ForEach([30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.top, 18)
                .task { if !model.demo, extra == nil { extra = (try? await model.api.gymPreferences())?.extraMinutes } }
                if let added = extra?[String(minutes)], added.warmup + (added.cardio ?? 0) + added.stretching > 0 {
                    HStack(spacing: 8) {
                        if added.warmup > 0 { ExtraMinutesPill(text: L10n.f("+ %@ min rozcvička", String(added.warmup)), color: Palette.amber) }
                        if let cardio = added.cardio, cardio > 0 { ExtraMinutesPill(text: L10n.f("+ %@ min kardio", String(cardio)), color: Palette.rust) }
                        if added.stretching > 0 { ExtraMinutesPill(text: L10n.f("+ %@ min protažení", String(added.stretching)), color: Palette.indigo) }
                    }
                    .padding(.top, 10)
                }
                Button { Task { await generate() } } label: {
                    Text(saving ? "Sestavuji…" : "Sestavit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || model.demo || day?.cancelled == true)
                .padding(.top, 14)
                NavigationLink(value: AppRoute.gymBuilder) {
                    Label("Vybrat partie a sestavit trénink", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
        }
    }

    // MARK: The planned workout (concept K04/017)

    @ViewBuilder
    private func plannedDetail(_ day: GymDay) -> some View {
        let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
        let started = Self.started(day)
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                hero(day, parts)
                    .padding(.top, 8)
                if let line = GymWhy.coachLine(GymWhy.reasons(day.note)) {
                    Button { whyOpen = true } label: {
                        HStack(alignment: .center, spacing: 10) {
                            Text(verbatim: line).font(Typo.body).foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.tr("Proč tenhle trénink"))
                    .padding(.top, 16)
                }
                GymPartsCard(day: day, date: date) { withAnimation(.snappy) { proxy.scrollTo(Self.exercisesID, anchor: .top) } }
                    .padding(.top, 22)
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: "Cviky")
                    Spacer()
                    if !model.demo || previewing {
                        Button(LocalizedStringKey("Upravit pořadí")) { Task { await loadCatalog(); reordering = true } }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.muted)
                            .buttonStyle(.plain)
                    }
                }
                .padding(.top, 26)
                .id(Self.exercisesID)
                exerciseCards(day, started: started)
                    .padding(.top, 8)
                if !model.demo || previewing {
                    Button { Task { await loadCatalog(); adding = true } } label: {
                        Text(verbatim: "+ " + L10n.tr("Přidat cvik")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                }
                if !muscles.isEmpty { worked.padding(.top, 22) }
                // Sets ticked here before the live workout: they can still be finished here.
                if started {
                    PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: finishing) {
                        Task { await finish() }
                    }
                    .disabled(finishing)
                    .padding(.top, 24)
                }
                // The day's workout without weights: kept in Moje tréninky or sent to a friend.
                let kept = WorkoutTemplate.from(day, minutes: nil)
                SaveWorkoutButton(template: kept).padding(.top, 24)
                ShareWorkoutButton(template: kept, date: date, groups: WorkoutSharing.groups(muscles, template: kept)).padding(.top, 10)
                // Move or cancel the day's session (GymPlanActions.swift).
                if !model.demo {
                    Button { changing = true } label: {
                        Text("Změnit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                }
                // Room for the pinned Start workout.
                Color.clear.frame(height: 40)
            }
        }
    }

    private static let exercisesID = "gym-exercises"

    /// A set ticked: the workout is under way.
    static func started(_ day: GymDay) -> Bool { day.exercises.contains { $0.sets.contains(where: \.done) } }

    /// The sport's disc, the name in serif, "Today at 17:30, 45 min, about 4.2 strain".
    private func hero(_ day: GymDay, _ parts: GymDayParts) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 28, weight: .medium)).foregroundStyle(Palette.background)
                .frame(width: 60, height: 60)
                .background(Palette.Sport.color("strength"), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(day.planName ?? L10n.tr("Silový trénink")).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: heroLine(day, parts)).font(Typo.small).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func heroLine(_ day: GymDay, _ parts: GymDayParts) -> String {
        let today = AppModel.localDate(Date())
        var words: [String] = []
        let when = Fmt.capitalized(Fmt.relativeDay(date, today: today))
        let plan = planEntry
        // A plan without its own hour comes at midnight ("00:00"): only the day then.
        if let time = plan.time, time != "00:00", let clock = ClockText.format(optional: time) {
            words.append(L10n.f("%@ v %@", when, clock))
        } else {
            words.append(when)
        }
        let extra = (parts.before(day) + parts.after(day)).reduce(0) { $0 + parts.minutes($1, day: day) }
        if let minutes = day.plannedMinutes { words.append("\(minutes + extra) min") }
        if let strain = plan.strain { words.append(L10n.f("asi %@ námahy", Fmt.decimal(strain, digits: 1))) }
        return words.joined(separator: ", ")
    }

    /// The day's gym session in Training: its hour and its strain estimate.
    private var planEntry: (time: String?, strain: Double?) {
        let training = model.training
        let cards = (training?.todaySessions ?? []) + [training?.next].compactMap { $0 }
        let card = cards.first { $0.date == date && $0.sport == "strength" }
        let week = training?.sessions?.first { $0.date == date && $0.sport == "strength" && $0.status != "done" }
        return (card?.time ?? week?.time, card?.strain)
    }

    /// What you'll work: the figure, the Primary muscles filled, the Secondary outlined.
    private var worked: some View {
        let primary = Self.names(load.filter { $0.value >= BodyMap.primary })
        let secondary = Self.names(load.filter { $0.value >= BodyMap.secondary && $0.value < BodyMap.primary })
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Co procvičíš")
            VStack(alignment: .leading, spacing: 12) {
                BodyMap(load: load, height: 200)
                if !primary.isEmpty { muscleTags("Hlavně", primary, filled: true) }
                if !secondary.isEmpty { muscleTags("Pomocně", secondary, filled: false) }
            }
            .padding(18)
            .cardSurface(cornerRadius: 20)
        }
    }

    /// The muscles' names, each once, in the figure's order.
    static func names(_ load: [String: Double]) -> [String] {
        var seen = Set<String>()
        return load.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
            .map { BodyFigure.label($0.key) }
            .filter { seen.insert($0).inserted }
    }

    private func muscleTags(_ title: String, _ names: [String], filled: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(filled ? Palette.rust : Palette.rust.opacity(0.45)).frame(width: 7, height: 7)
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            FlowLayout(spacing: 6) {
                ForEach(names, id: \.self) { name in
                    Text(verbatim: name).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(filled ? Palette.rust.opacity(0.16) : .clear, in: Capsule())
                        .overlay { if !filled { Capsule().stroke(Palette.rust.opacity(0.4), lineWidth: 1) } }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Start workout (today) or Resume workout (the live workout still running), pinned.
    @ViewBuilder
    private func startPill(_ day: GymDay) -> some View {
        if date == AppModel.localDate(Date()) {
            // Resume only while the live workout runs (paused or not), never after it is finished.
            let resume = LiveWorkout.shared.running
            NavigationLink(value: AppRoute.trainingMode(date)) {
                Text(verbatim: L10n.tr(resume ? "Pokračovat v tréninku" : "Začít trénink")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Palette.button, in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
            // Start workout opens with 3, 2, 1 and starts (concept 08); a started one goes on.
            .simultaneousGesture(TapGesture().onEnded {
                if resume { TrainingModeView.resumeOnOpen = date } else { TrainingModeView.startOnOpen = date }
            })
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
    }

    private func loadCatalog() async {
        guard catalog.isEmpty, !model.demo else { return }
        catalog = (try? await model.api.gymExercises()) ?? []
    }

    /// An exercise added from the library: its sets as the coach suggests.
    private func add(_ name: String) async {
        guard var next = day else { return }
        let suggestion = GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name })
        next.appendExercise(name, suggestion: suggestion, sides: GymSides.oneSided(name))
        day = next
        await save()
        if !model.demo, let names = day?.exercises.map(\.name) {
            muscles = (try? await model.api.gymMuscles(names: names)) ?? muscles
        }
    }

    /// The exercises in order, a superset's together under its mark.
    private func exerciseCards(_ day: GymDay, started: Bool) -> some View {
        let all = day.exercises
        let list: [KeyedExercise] = ExerciseOrder.grouped(all.map { $0.superset }).map { KeyedExercise(all, at: $0) }
        let groups: [String?] = list.map { $0.exercise.superset }
        return VStack(spacing: 12) {
            ForEach(ExerciseOrder.runs(groups), id: \.lowerBound) { (run: Range<Int>) in
                let items = Array(list[run])
                if let letter = ExerciseOrder.letter(groups[run.lowerBound]), items.count == 2 {
                    // A pair clasped as in the live workout: violet edges, "Superset A" on the seam.
                    LiveSupersetClasp(letter: letter) {
                        card(day, items[0].exercise, started: started)
                    } second: {
                        card(day, items[1].exercise, started: started)
                    }
                } else if let letter = ExerciseOrder.letter(groups[run.lowerBound]) {
                    SupersetGroup(letter: letter, spacing: 12) {
                        ForEach(items, id: \.key) { (item: KeyedExercise) in card(day, item.exercise, started: started) }
                    }
                } else {
                    ForEach(items, id: \.key) { (item: KeyedExercise) in card(day, item.exercise, started: started) }
                }
            }
        }
    }

    /// An exercise named by its name and which time it comes in the plan, not by
    /// its first row (GymExercise.id): a set added or removed in an exercise above
    /// moves the rows, and the weights typed here must stay.
    private struct KeyedExercise {
        let key: String
        let exercise: GymExercise
        init(_ all: [GymExercise], at index: Int) {
            exercise = all[index]
            key = exercise.name + "#" + String(all[..<index].filter { $0.name == all[index].name }.count)
        }
    }

    private func card(_ day: GymDay, _ exercise: GymExercise, started: Bool) -> some View {
        // The exercise's place in the plan (the cards may be regrouped by superset).
        let offset: Int? = day.exercises.firstIndex { $0.id == exercise.id }
        let add: (() -> Void)? = offset.map { (at: Int) -> () -> Void in { Task { await addSet(at: at) } } }
        let remove: ((GymSet) -> Void)? = offset.map { (_: Int) -> (GymSet) -> Void in { set in Task { await deleteSet(set) } } }
        return ExerciseCard(exercise: exercise,
                            failure: Set(exercise.sets.map { $0.row }.filter { day.isToFailure(row: $0) }),
                            last: history.last(exercise.name, before: date),
                            started: started,
                            onSet: { set, kg, reps, rpe in Task { await record(set, kg: kg, reps: reps, rpe: rpe) } },
                            onUndo: { set in Task { await undo(set) } },
                            onIntensity: { set in intensityFor = SetRef(id: set.row) },
                            onTechnique: { technique = exercise.name },
                            onAlternatives: { alternativesFor = exercise.name },
                            onAddSet: add,
                            onRemoveSet: remove)
    }

    private func load() async {
        if model.demo { day = DemoData.gym; history = DemoGymHistory.history; loading = false; return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.gymDay(date: date)
            if let loaded = day, !doneMode { doneMode = Self.isDone(loaded, date: date) }
            if let names = day?.exercises.map(\.name), !names.isEmpty {
                muscles = (try? await model.api.gymMuscles(names: names)) ?? [:]
            }
            history = await model.gymHistory()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let day, !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.saveGym(day, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
        }
    }

    private func record(_ set: GymSet, kg: String, reps: String, rpe: String) async {
        day?.complete(row: set.row, kg: kg, reps: reps, rpe: rpe)
        await save()
    }

    private func pickIntensity(_ row: Int, _ letter: String) async {
        if letter == "D" {
            day?.addDrop(after: row)
        } else if day?.exercises.flatMap(\.sets).first(where: { $0.row == row })?.drop != true {
            day?.setIntensity(row: row, letter)
        }
        await save()
    }

    private func undo(_ set: GymSet) async {
        day?.undo(row: set.row)
        await save()
    }

    /// One set more, like the last one.
    private func addSet(at offset: Int) async {
        day?.addSet(at: offset)
        await save()
    }

    /// The set swiped away, just that one (with its drop sets).
    private func deleteSet(_ set: GymSet) async {
        day?.deleteSet(row: set.row)
        await save()
    }

    /// Everything ticked is saved already; the last save goes out, the week
    /// shows the session done, then the rating.
    private func finish() async {
        finishing = true
        defer { finishing = false }
        await save()
        guard error == nil else { return }
        if !model.demo { await model.refreshTraining() }
        rating = true
    }

    private func replace(_ exercise: String, with alt: GymAlternative) async {
        day?.replace(exercise: exercise, with: alt.name, kg: alt.kg.flatMap { $0 > 0 ? GymCoach.kgText($0) : nil })
        await save()
        await load()
    }

    private func generate() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.generateGym(date: date, minutes: minutes)
            await load()
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct Named: Identifiable {
    let name: String
    var id: String { name }
}

struct ExerciseCard: View {
    let exercise: GymExercise
    /// The rows of the sets that go to failure.
    var failure: Set<Int> = []
    /// The exercise last time (GymHistory), for Minule.
    var last: GymHistory.Session? = nil
    /// The workout is under way (a set ticked): the set at hand is marked and
    /// ticks; before that the sets are the plan to look at (concept K04/017).
    var started = true
    var onSet: (GymSet, String, String, String) -> Void
    var onUndo: (GymSet) -> Void
    /// The letter tapped: how hard the set was (IntensitySheet).
    var onIntensity: ((GymSet) -> Void)? = nil
    var onTechnique: () -> Void
    var onAlternatives: () -> Void
    var onAddSet: (() -> Void)? = nil
    var onRemoveSet: ((GymSet) -> Void)? = nil
    /// Cards start folded (Petr 2026-11-16); the sets unfold under the name.
    @State var open = false
    @State private var kg = ""
    @State private var reps = ""

    /// The note the server gives the first set of an exercise it has no weight for
    /// (strength-generator.js TEST_SET_NOTE).
    static func isTestSet(_ note: String) -> Bool { note.hasPrefix("zkušební série") || note.hasPrefix("test set") }

    /// "4 × 6–8, 62.5 kg" or "3 × 45 s, body weight": the work sets, their
    /// reps and the first one's weight.
    static func summary(_ exercise: GymExercise) -> String {
        let work = exercise.sets.filter(\.work)
        guard let first = work.first else { return L10n.plural("%lld sérií", exercise.sets.count) }
        let reps = Fmt.range(first.plannedReps ?? first.reps ?? "")
        let count = reps.isEmpty ? L10n.plural("%lld sérií", work.count) : "\(work.count) × " + reps
        let pounds = LiftUnits.pounds(exercise.name)
        let weight = LiftWeight.shown(first.plannedKg ?? first.kg, machineLb: pounds).map { $0 + " " + LiftWeight.unit(machineLb: pounds) }
        return count + ", " + (weight ?? L10n.tr("vlastní váha"))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Button { withAnimation(.snappy) { open.toggle() } } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(exercise.name).font(Typo.bodyStrong.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(2)
                        Text(verbatim: started ? L10n.plural("%lld/%lld sérií", exercise.doneCount, exercise.workCount) : Self.summary(exercise))
                            .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(L10n.tr(open ? "Sbalí cvik" : "Otevře cvik"))
                round("arrow.up.arrow.down", label: "Nahradit cvik", action: onAlternatives)
                round("info", label: "Technika", action: onTechnique)
                Button { withAnimation(.snappy) { open.toggle() } } label: {
                    Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Palette.faint)
                        .frame(width: 28, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
            .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 4)
            if open {
                VStack(alignment: .leading, spacing: 6) {
                    if !failure.isEmpty { GymTag.failure }
                    // No weight to start from (an exercise the app doesn't know): the test set's advice.
                    if let first = exercise.sets.first(where: { !$0.warmup }), !first.done, let note = first.note, Self.isTestSet(note) {
                        Text(Fmt.capitalized(note)).font(Typo.caption).foregroundStyle(Palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    // The same rows as Režim tréninku (GymSetRow): one way to log a set.
                    VStack(spacing: 2) {
                        GymSetTableHeader()
                        // By place in the exercise: rows renumbered elsewhere keep what is typed.
                        ForEach(Array(exercise.sets.enumerated()), id: \.offset) { _, set in
                            // Swiped left: just this set goes away.
                            row(set, current: started ? exercise.sets.first { !$0.done } : nil)
                                .modifier(SwipeToDelete(enabled: onRemoveSet != nil) { onRemoveSet?(set) })
                        }
                    }
                    .padding(.horizontal, -4)
                    if let onAddSet {
                        Button(action: onAddSet) {
                            Text(verbatim: "+ " + L10n.tr("Přidat sérii")).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted)
                                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14).padding(.bottom, 6)
                .transition(.opacity)
            }
        }
        .cardSurface(cornerRadius: 16)
    }

    private func round(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.footnote.weight(.semibold)).foregroundStyle(Palette.secondary)
                .frame(width: 32, height: 32).background(Palette.track, in: Circle())
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }

    private func row(_ s: GymSet, current: GymSet?) -> GymSetRow {
        let phase: GymSetRow.Phase = s.done ? .done : (s.row == current?.row ? .current : .next)
        let pick = onIntensity
        return GymSetRow(label: s.warmup ? (s.side == "P" ? "" : "W") : s.drop ? "↳" : s.side == "P" ? "" : s.number, side: s.side,
                         lastTime: GymSessionMath.lastTime(s, in: exercise, last: last),
                         kg: LiftWeight.shown(s.done ? s.kg : s.plannedKg) ?? "",
                         reps: Fmt.range((s.done ? s.reps : s.plannedReps) ?? ""),
                         state: phase, kgText: $kg, repsText: $reps, repsHint: s.plannedReps.map(Fmt.range),
                         drop: s.drop, intensity: s.done ? s.intensity ?? GymIntensity.from(rpe: s.rpe) : s.intensity, planned: !s.done,
                         onIntensity: pick == nil ? nil : { pick?(s) }) {
            switch phase {
            case .done: onUndo(s)
            case .current:
                onSet(s, kgValue(kg, s.plannedKg), value(reps, firstNumber(s.plannedReps)), "")
                kg = ""
                reps = ""
            case .next: break
            }
        }
    }

    /// Typed in the chosen unit (kg or lb), recorded in kg.
    private func kgValue(_ typed: String, _ planned: String?) -> String {
        let t = typed.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? (planned ?? "") : LiftWeight.kgText(t)
    }

    private func value(_ typed: String, _ planned: String?) -> String {
        let t = typed.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? (planned ?? "") : t.replacingOccurrences(of: ",", with: ".")
    }

    /// "8-10" → "10" is too optimistic; the lower end is what was planned for sure.
    private func firstNumber(_ text: String?) -> String? {
        guard let text else { return nil }
        let digits = text.prefix { $0.isNumber }
        return digits.isEmpty ? nil : String(digits)
    }
}

struct TechniqueSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let exercise: String
    /// "Nahradit": only where the exercise can be swapped (a generated workout,
    /// a plan, Režim tréninku). The sheet closes first, then this runs.
    var replace: (() -> Void)? = nil
    @State private var technique: GymTechnique?
    @State private var error: String?
    /// 0: the photo and how it's done, 1: the video.
    @State private var page = 0
    @State private var writingNote = false
    /// The thumb: true, false or nil, saved at once (src/exercise-feedback.js).
    @State private var liked: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(exercise).font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 24).padding(.top, 24)
            taste.padding(.horizontal, 24)
            Picker("Zobrazit", selection: $page) {
                Text("Jak na to").tag(0)
                Text("Video").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 24)
            TabView(selection: $page) {
                PageScroll { howTo.padding(.horizontal, 24).padding(.bottom, 24) }.tag(0)
                PageScroll { videoPage.padding(.horizontal, 24).padding(.bottom, 24) }.tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .sheet(isPresented: $writingNote) { ExerciseNoteSheet(exercise: exercise) }
        .task {
            await ExerciseNotes.shared.load(api: model.api, demo: model.demo)
            guard !model.demo else { error = "V ukázce se technika nenačítá."; return }
            do {
                technique = try await model.api.gymTechnique(exercise: exercise)
                liked = technique?.liked
            } catch { self.error = error.localizedDescription }
        }
    }

    /// Líbí, Nelíbí and Nahradit under the name: a disliked exercise stays out
    /// of the next plans, and Nahradit opens the swap sheet straight away.
    private var taste: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                tasteButton(up: true)
                tasteButton(up: false)
                if let replace {
                    Spacer(minLength: 0)
                    Button {
                        dismiss()
                        replace()
                    } label: {
                        Label("Nahradit", systemImage: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(liked == false ? Palette.onButton : Palette.ink)
                            .padding(.horizontal, 14).frame(height: 38)
                            .background(liked == false ? Palette.button : Palette.card, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            if liked == false {
                Text("V dalších plánech už nebude. Vrátit to jde v Nastavení → Posilovna → Cviky.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            // A thumb that did not save (a load error shows in the page itself).
            if technique != nil, let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
    }

    private func tasteButton(up: Bool) -> some View {
        let on = liked == up
        let tint: Color = on ? (up ? Palette.green : Palette.rust) : Palette.ink
        return Button { Task { await rate(on ? nil : up) } } label: {
            Label(L10n.tr(up ? "Líbí" : "Nelíbí"), systemImage: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .font(.subheadline.weight(.semibold)).foregroundStyle(tint)
                .padding(.horizontal, 14).frame(height: 38)
                .background(on ? tint.opacity(0.16) : Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The thumb moves at once; a failed save puts it back.
    private func rate(_ value: Bool?) async {
        let before = liked
        liked = value
        guard !model.demo else { return }
        do { try await model.api.rateExercises([(exercise: exercise, liked: value)]) } catch {
            liked = before
            self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
        }
    }

    private var videoId: String? { technique?.video?.id.flatMap { $0.isEmpty ? nil : $0 } }

    @ViewBuilder private var howTo: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let t = technique {
                photo
                muscleChips("Hlavní svaly", t.primaryMuscles, primary: true)
                muscleChips("Pomocné svaly", t.secondaryMuscles, primary: false)
                ownNote
                list("Příprava", t.setup)
                list("Provedení", t.steps)
                list("Časté chyby", t.mistakes)
                if let b = t.breathing, !b.isEmpty { list("Dýchání", [b]) }
                list("Kde to cítit", t.feel)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
        .padding(.top, 6)
    }

    /// Hlavní svaly as solid green chips, Pomocné svaly outlined; nothing when the exercise has none.
    @ViewBuilder
    private func muscleChips(_ title: String, _ ids: [String]?, primary: Bool) -> some View {
        if let ids, !ids.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: title)
                FlowLayout(spacing: 7) {
                    ForEach(ids, id: \.self) { id in
                        HStack(spacing: 7) {
                            if primary { Circle().fill(Palette.green).frame(width: 7, height: 7) }
                            Text(BodyFigure.label(id))
                        }
                        .font(Typo.small.weight(primary ? .semibold : .medium))
                        .foregroundStyle(primary ? Palette.green : Palette.secondary)
                        .padding(.horizontal, 13).frame(minHeight: 32)
                        .background(primary ? Palette.greenSoft : .clear, in: Capsule())
                        .overlay { if !primary { Capsule().stroke(Palette.green.opacity(0.3), lineWidth: 1.5) } }
                    }
                }
            }
            .padding(.top, 6)
        }
    }

    /// Moje poznámka: the athlete's note on the exercise, the pencil changes it.
    private var ownNote: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: "Moje poznámka")
            if let note = ExerciseNotes.shared.note(exercise) {
                Button { writingNote = true } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "note.text").foregroundStyle(Palette.brown)
                        Text(note).font(Typo.body).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "pencil").foregroundStyle(Palette.muted)
                    }
                    .padding(14)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityHint(L10n.tr("Upravit poznámku"))
            } else {
                ExerciseNoteLine(note: nil) { writingNote = true }
            }
        }
        .padding(.top, 6)
    }

    /// Photos of the start and end position, swiped between (frames picked from
    /// the technique video credit its channel); without them two
    /// frames YouTube takes from the video itself (at a quarter and three
    /// quarters of it), not the author's thumbnail with its text on top.
    @ViewBuilder private var photo: some View {
        if let photos = technique?.photos, photos.count >= 2 {
            VStack(spacing: 6) {
                ExercisePhotos(urls: photos.compactMap { URL(string: $0) }, aspect: CGFloat(technique?.photoAspect ?? 1.5))
                if let credit = technique?.photoCredit, !credit.isEmpty {
                    Text(L10n.f("Snímky z videa: %@", credit))
                        .font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
        } else if let id = videoId {
            ExercisePhotos(urls: ["hq1", "hq3"].compactMap { URL(string: "https://i.ytimg.com/vi/" + id + "/" + $0 + ".jpg") },
                           labeled: false, aspect: 16 / 9)
        }
    }

    @ViewBuilder private var videoPage: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let id = videoId {
                YouTubePlayer(id: id)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                if technique?.video?.similar == true {
                    Text("Podobný cvik").font(Typo.small.weight(.semibold)).foregroundStyle(Palette.muted)
                }
                if let title = technique?.video?.title, !title.isEmpty {
                    Text(verbatim: title).font(Typo.small).foregroundStyle(Palette.muted)
                }
                if let url = URL(string: "https://www.youtube.com/watch?v=" + id) {
                    Link(destination: url) { Label("Otevřít v YouTube", systemImage: "arrow.up.right.square").font(Typo.bodyStrong) }
                }
            } else if technique != nil {
                Text("K tomuhle cviku zatím video nemáme.").font(Typo.body).foregroundStyle(Palette.muted)
                if let s = technique?.searchUrl, let url = URL(string: s) {
                    Link(destination: url) { Label("Najít video", systemImage: "play.rectangle").font(Typo.bodyStrong) }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
        .padding(.top, 6)
    }

    @ViewBuilder
    private func list(_ title: String, _ items: [String]?) -> some View {
        if let items, !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: title)
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Palette.faint)
                        Text(item).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 6)
        }
    }
}

/// "Nahradit cvik": the replacements as cards (the dumbbell, a short line on
/// how it differs, the estimated load, "i"), and in Režim tréninku "Vybrat jiný
/// cvik" for any exercise from the catalog.
struct AlternativesSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let exercise: String
    /// The proposal's other exercises (not saved yet), so they are not offered.
    var inPlan: [String] = []
    /// Under the exercise's name: "Zadní ramena, Zbývají 2 série".
    var subtitle: String? = nil
    var footnote: String? = "Nahradí jen série, které ještě nejsou hotové."
    var choose: (String) -> Void
    /// The whole alternative (its estimated load), for a proposal not saved yet.
    var chooseAlternative: ((GymAlternative) -> Void)? = nil
    /// Only the first few (Režim tréninku: three), each with its estimated load.
    var limit: Int? = nil
    /// "Vybrat jiný cvik": the whole catalog instead (the sheet closes first).
    var chooseOther: (() -> Void)? = nil
    @State private var items: [GymAlternative] = []
    @State private var loading = true
    @State private var technique: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                header.padding(.bottom, 4)
                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                } else if items.isEmpty {
                    Text("Žádná náhrada se nenašla.").font(Typo.small).foregroundStyle(Palette.muted).padding(.vertical, 8)
                }
                ForEach(limit.map { Array(items.prefix($0)) } ?? items) { alt in
                    card(alt)
                }
                if let chooseOther {
                    SecondaryButton(title: "Vybrat jiný cvik", systemImage: "magnifyingglass") {
                        dismiss()
                        chooseOther()
                    }
                    .padding(.top, 2)
                }
                if let footnote {
                    Label(L10n.tr(footnote), systemImage: "checkmark")
                        .font(Typo.caption).foregroundStyle(Palette.faint)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.top, 6)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(alignment: .top) {
            RadialGradient(colors: [Palette.amberSoft, Palette.background.opacity(0)], center: .top, startRadius: 0, endRadius: 320)
                .frame(height: 260).ignoresSafeArea().allowsHitTesting(false)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            items = (try? await model.api.gymAlternatives(date: date, exercise: exercise, inPlan: inPlan)) ?? []
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Nahradit cvik")
                Text(verbatim: ExerciseCatalog.shownName(exercise))
                    .font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(verbatim: subtitle).font(Typo.body).foregroundStyle(Palette.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            CircleButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
        }
        .padding(.horizontal, 4)
    }

    private func card(_ alt: GymAlternative) -> some View {
        HStack(spacing: 12) {
            Button {
                choose(alt.name)
                chooseAlternative?(alt)
                dismiss()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "dumbbell.fill").scaledFont(16, cap: .denseCap).foregroundStyle(Palette.amber)
                        .frame(width: 44, height: 44).background(Palette.amberSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: ExerciseCatalog.shownName(alt.name))
                            .font(Typo.bodyStrong.weight(.semibold)).foregroundStyle(Palette.ink)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let line = Self.shortLine(alt) {
                            Text(verbatim: line).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 4)
                    if limit != nil, let kg = alt.kg, kg > 0 {
                        NumberText(value: GymCoach.shown(kg), unit: Units.weightUnit, size: 24).fixedSize()
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            SmallInfoButton(label: L10n.f("Jak na %@", alt.name)) { technique = alt.name }
        }
        .padding(.leading, 13).padding(.trailing, 12).padding(.vertical, 12)
        .cardSurface(cornerRadius: 22)
    }

    /// One short line on the alternative: the catalog's note without the
    /// muscle it starts with and the "kg = …" hint ("one-arm row with the elbow
    /// high and out"), else its station without the count ("Kladky").
    static func shortLine(_ alt: GymAlternative) -> String? {
        let note = alt.note ?? ""
        let afterMuscle = note.split(separator: ";", maxSplits: 1).count > 1 ? String(note.split(separator: ";", maxSplits: 1)[1]) : note
        let parts = afterMuscle.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.lowercased().hasPrefix("kg =") && !$0.lowercased().hasPrefix("kg=") }
        let text = parts.joined(separator: ", ")
        if !text.isEmpty, text.lowercased() != alt.muscle?.lowercased() { return Fmt.capitalized(text) }
        let station = (alt.station ?? "").replacingOccurrences(of: #"\s*\(\d+×\)"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        return station.isEmpty ? alt.muscle?.nilIfBlank : station
    }
}

/// "i" by an exercise: what it is and how to do it (TechniqueSheet).
struct ExerciseInfoButton: View {
    let name: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "info.circle").scaledFont(18, cap: .denseCap).foregroundStyle(Palette.muted)
                .frame(width: 32, height: 32).contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(L10n.f("Jak na %@", name))
    }
}

/// A small coloured mark: "Supersérie A" or "Do selhání".
struct GymTag: View {
    let text: String
    let systemImage: String
    let color: Color

    static func superset(_ letter: String) -> GymTag {
        GymTag(text: L10n.f("Supersérie %@", letter), systemImage: "link", color: Palette.indigo)
    }

    static var failure: GymTag { GymTag(text: L10n.tr("Do selhání"), systemImage: "flame.fill", color: Palette.rust) }

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(Typo.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(color.opacity(0.12), in: Capsule())
    }
}

/// The exercises of a superset, one right after the other: a bar along them
/// and the mark above.
struct SupersetGroup<Content: View>: View {
    let letter: String
    var spacing: CGFloat = 0
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            GymTag.superset(letter)
                .padding(.top, spacing == 0 ? 10 : 0)
            content
        }
        .padding(.leading, 12)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(Palette.indigo).frame(width: 4)
        }
    }
}

/// The exercise's YouTube video played inside the app. Only a video id
/// (eleven letters, digits, - and _) makes the page, and the page cannot go
/// anywhere else: the video plays in its frame, nothing else opens.
struct YouTubePlayer: UIViewRepresentable {
    let id: String

    static func isVideoId(_ id: String) -> Bool {
        id.count == 11 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.navigationDelegate = context.coordinator
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.loaded != id, Self.isVideoId(id) else { return }
        context.coordinator.loaded = id
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
        <body><iframe src="https://www.youtube-nocookie.com/embed/\(id)?playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>
        """
        context.coordinator.pageLoads = true
        // YouTube's player wants to know which site embeds it (without it, error 153).
        view.loadHTMLString(html, baseURL: APIClient.server)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate {
        var loaded: String?
        /// The page itself is loading; after it, the page stays where it is.
        var pageLoads = false

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            // The video's own frame navigates freely; the page and new windows do not.
            guard let frame = navigationAction.targetFrame else { return .cancel }
            if !frame.isMainFrame { return .allow }
            let allow = pageLoads
            pageLoads = false
            return allow ? .allow : .cancel
        }
    }
}

/// The start and end position of an exercise, one photo per page.
struct ExercisePhotos: View {
    let urls: [URL]
    /// Začátek and Konec on the photos (a stretch's two photos are one position).
    var labeled = true
    /// 16:9 for video frames: the bars YouTube pads them with fall outside.
    var aspect: CGFloat = 3 / 2
    @State private var page = 0

    var body: some View {
        VStack(spacing: 10) {
            TabView(selection: $page) {
                ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Rectangle().fill(Palette.track)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .overlay(alignment: .bottomLeading) {
                        if labeled {
                        Text(index == 0 ? L10n.tr("Začátek") : L10n.tr("Konec"))
                            .font(Typo.caption)
                            .foregroundStyle(Palette.ink)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Palette.background.opacity(0.65), in: Capsule())
                            .padding(10)
                        }
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .aspectRatio(aspect, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            HStack(spacing: 8) {
                ForEach(0..<urls.count, id: \.self) { i in
                    Circle().fill(i == page ? Palette.ink : Palette.faint).frame(width: 7, height: 7)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Fotky začátku a konce cviku"))
    }
}
