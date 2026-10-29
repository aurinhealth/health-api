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

    private var showsDone: Bool {
        if day?.cancelled == true { return false }
        return doneMode || doneSession != nil
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
        DetailScreen(glow: Palette.Glow.training, title: day?.planName ?? "Posilovna") {
            content
        }
        .task { await load() }
        .sheet(item: $intensityFor) { ref in
            let set: GymSet? = day?.exercises.flatMap(\.sets).first(where: { $0.row == ref.id })
            IntensitySheet(title: set.map { $0.drop ? L10n.tr("Dropset") : $0.warmup ? L10n.tr("Rozcvička") : L10n.f("Série %@", $0.number) } ?? "",
                           selected: set?.intensity) { letter in
                Task { await pickIntensity(ref.id, letter) }
            }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
        .sheet(item: Binding(get: { alternativesFor.map { Named(name: $0) } }, set: { alternativesFor = $0?.name })) { item in
            AlternativesSheet(date: date, exercise: item.name) { replacement in
                Task { await replace(item.name, with: replacement) }
            }
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
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: L10n.tr("Posilovna") + " · " + Fmt.relativeDay(date, today: AppModel.localDate(Date())))
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
            if loading && day == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if showsDone {
                GymDoneDetail(date: date,
                              day: Binding(get: { day ?? GymDay(date: date, values: [], cancelled: nil) }, set: { day = $0 }),
                              session: doneSession,
                              save: { await save() })
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
                Text(day.planName ?? "Silový trénink").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 12)
                progress(day)
                let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
                let before = parts.before(day).reduce(0) { $0 + parts.minutes($1, day: day) }
                let after = parts.after(day).reduce(0) { $0 + parts.minutes($1, day: day) }
                if let planned = day.plannedMinutes, before + after > 0 {
                    GymTimeCard(minutes: planned, warmup: before, stretching: after)
                        .padding(.top, 14)
                }
                if !muscles.isEmpty {
                    Card {
                        WidgetHeader(title: "Co procvičíš", color: Palette.amberBar)
                        BodyMap(load: load, height: 220)
                    }
                    .padding(.top, 16)
                }
                if let note = Self.withoutMuscleList(day.note) {
                    Text(note).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                }
                GymPartsCard(day: day, date: date).padding(.top, 18)
                NavigationLink(value: AppRoute.trainingMode(date)) {
                    // Green as in Režim tréninku: the one button that starts recording.
                    Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                        .frame(maxWidth: .infinity).frame(height: 54).background(Palette.green, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
                ForEach(parts.before(day)) { part in
                    if let routine = parts.routine(part, day: day) {
                        StretchingCard(stretching: routine, date: date, kind: part.kind).padding(.top, 16)
                    }
                }
                exerciseCards(day)
                    .padding(.top, 20)
                ForEach(parts.after(day)) { part in
                    if let routine = parts.routine(part, day: day) {
                        StretchingCard(stretching: routine, date: date, kind: part.kind).padding(.top, 16)
                    }
                }
                PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: finishing) {
                    Task { await finish() }
                }
                .disabled(finishing)
                .padding(.top, 24)
                // The day's workout without weights: kept in Moje tréninky or sent to a friend.
                let kept = WorkoutTemplate.from(day, minutes: nil)
                SaveWorkoutButton(template: kept).padding(.top, 10)
                ShareWorkoutButton(template: kept, date: date, groups: WorkoutSharing.groups(muscles, template: kept)).padding(.top, 10)
            } else {
                Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                    .font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
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

    /// The exercises in order, a superset's together under its mark.
    private func exerciseCards(_ day: GymDay) -> some View {
        let all = day.exercises
        let list: [KeyedExercise] = ExerciseOrder.grouped(all.map { $0.superset }).map { KeyedExercise(all, at: $0) }
        let groups: [String?] = list.map { $0.exercise.superset }
        return VStack(spacing: 12) {
            ForEach(ExerciseOrder.runs(groups), id: \.lowerBound) { (run: Range<Int>) in
                if let letter = ExerciseOrder.letter(groups[run.lowerBound]) {
                    SupersetGroup(letter: letter, spacing: 12) {
                        ForEach(list[run], id: \.key) { (item: KeyedExercise) in card(day, item.exercise) }
                    }
                } else {
                    ForEach(list[run], id: \.key) { (item: KeyedExercise) in card(day, item.exercise) }
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

    private func card(_ day: GymDay, _ exercise: GymExercise) -> some View {
        // The exercise's place in the plan (the cards may be regrouped by superset).
        let offset: Int? = day.exercises.firstIndex { $0.id == exercise.id }
        let add: (() -> Void)? = offset.map { (at: Int) -> () -> Void in { Task { await addSet(at: at) } } }
        let remove: ((GymSet) -> Void)? = offset.map { (_: Int) -> (GymSet) -> Void in { set in Task { await deleteSet(set) } } }
        return ExerciseCard(exercise: exercise,
                            failure: Set(exercise.sets.map { $0.row }.filter { day.isToFailure(row: $0) }),
                            last: history.last(exercise.name, before: date),
                            onSet: { set, kg, reps, rpe in Task { await record(set, kg: kg, reps: reps, rpe: rpe) } },
                            onUndo: { set in Task { await undo(set) } },
                            onIntensity: { set in intensityFor = SetRef(id: set.row) },
                            onTechnique: { technique = exercise.name },
                            onAlternatives: { alternativesFor = exercise.name },
                            onAddSet: add,
                            onRemoveSet: remove,
                            onRemoveExercise: offset.map { (at: Int) -> () -> Void in { Task { await removeExercise(at: at) } } })
    }

    private func progress(_ day: GymDay) -> some View {
        let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
        return VStack(alignment: .leading, spacing: 6) {
            Text(L10n.plural("%lld/%lld sérií · %lld cviků", done, total, day.exercises.count))
                .font(Typo.small).foregroundStyle(Palette.muted)
            ProgressLine(fraction: total > 0 ? Double(done) / Double(total) : 0, color: Palette.amberBar, height: 4)
        }
        .padding(.top, 10)
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

    /// The exercise out of the plan; its sets done stay recorded.
    private func removeExercise(at offset: Int) async {
        day?.removeExercise(at: offset)
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

    private func replace(_ exercise: String, with name: String) async {
        day?.replace(exercise: exercise, with: name)
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
    var onSet: (GymSet, String, String, String) -> Void
    var onUndo: (GymSet) -> Void
    /// The letter tapped: how hard the set was (IntensitySheet).
    var onIntensity: ((GymSet) -> Void)? = nil
    var onTechnique: () -> Void
    var onAlternatives: () -> Void
    var onAddSet: (() -> Void)? = nil
    var onRemoveSet: ((GymSet) -> Void)? = nil
    var onRemoveExercise: (() -> Void)? = nil
    @State private var kg = ""
    @State private var reps = ""

    /// The note the server gives the first set of an exercise it has no weight for
    /// (strength-generator.js TEST_SET_NOTE).
    static func isTestSet(_ note: String) -> Bool { note.hasPrefix("zkušební série") || note.hasPrefix("test set") }

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name).font(.headline).foregroundStyle(Palette.ink)
                    Text(L10n.plural("%lld/%lld sérií", exercise.doneCount, exercise.workCount))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if !failure.isEmpty { GymTag.failure.padding(.top, 4) }
                    // No weight to start from (an exercise the app doesn't know): the test set's advice.
                    if let first = exercise.sets.first(where: { !$0.warmup }), !first.done, let note = first.note, Self.isTestSet(note) {
                        Text(Fmt.capitalized(note)).font(Typo.caption).foregroundStyle(Palette.amber)
                            .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    }
                }
                Spacer()
                ExerciseInfoButton(name: exercise.name, action: onTechnique)
                Menu {
                    Button { onTechnique() } label: { Label("Technika", systemImage: "figure.strengthtraining.traditional") }
                    Button { onAlternatives() } label: { Label("Nahradit cvik", systemImage: "arrow.triangle.swap") }
                    if let onRemoveExercise, exercise.sets.contains(where: { !$0.done }) {
                        Button(role: .destructive, action: onRemoveExercise) { Label("Odebrat cvik", systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis").scaledFont(16, weight: .semibold, cap: .denseCap).frame(width: 36, height: 36)
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel("Možnosti cviku")
            }
            // The same rows as Režim tréninku (GymSetRow): one way to log a set.
            VStack(spacing: 2) {
                GymSetTableHeader()
                // By place in the exercise: rows renumbered elsewhere keep what is typed.
                ForEach(Array(exercise.sets.enumerated()), id: \.offset) { _, set in
                    // Swiped left: just this set goes away.
                    row(set, current: exercise.sets.first { !$0.done })
                        .modifier(SwipeToDelete(enabled: onRemoveSet != nil) { onRemoveSet?(set) })
                }
            }
            .padding(.horizontal, -10)
            if let onAddSet {
                Button(action: onAddSet) {
                    Label("Přidat sérii", systemImage: "plus").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
                        .padding(.horizontal, 12).frame(height: 30).overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
                        .tapTarget(width: 44, height: 30)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
    }

    private func row(_ s: GymSet, current: GymSet?) -> GymSetRow {
        let phase: GymSetRow.Phase = s.done ? .done : (s.row == current?.row ? .current : .next)
        let pick = onIntensity
        return GymSetRow(label: s.warmup ? "W" : s.drop ? "↳" : s.side == "P" ? "" : s.number, side: s.side,
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
    @State private var technique: GymTechnique?
    @State private var error: String?
    /// 0: the photo and how it's done, 1: the video.
    @State private var page = 0
    @State private var writingNote = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(exercise).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 24).padding(.top, 24)
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
            do { technique = try await model.api.gymTechnique(exercise: exercise) } catch { self.error = error.localizedDescription }
        }
    }

    private var videoId: String? { technique?.video?.id.flatMap { $0.isEmpty ? nil : $0 } }

    @ViewBuilder private var howTo: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let t = technique {
                photo
                ownNote
                if let muscles = t.muscles, !muscles.isEmpty {
                    Text(muscles.joined(separator: " · ")).font(Typo.small).foregroundStyle(Palette.muted)
                }
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

    /// Photos of the start and end position, swiped between; without them two
    /// frames YouTube takes from the video itself (at a quarter and three
    /// quarters of it), not the author's thumbnail with its text on top.
    @ViewBuilder private var photo: some View {
        if let photos = technique?.photos, photos.count >= 2 {
            ExercisePhotos(urls: photos.compactMap { URL(string: $0) }, aspect: CGFloat(technique?.photoAspect ?? 1.5))
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
    /// Under the exercise's name: "Zadní ramena · Zbývají 2 série".
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
                    .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
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

/// The exercise's YouTube video played inside the app.
struct YouTubePlayer: UIViewRepresentable {
    let id: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.loaded != id else { return }
        context.coordinator.loaded = id
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
        <body><iframe src="https://www.youtube-nocookie.com/embed/\(id)?playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>
        """
        view.loadHTMLString(html, baseURL: APIClient.server)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var loaded: String?
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
