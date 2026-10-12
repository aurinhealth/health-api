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
    @State private var day: GymDay?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var technique: String?
    @State private var alternativesFor: String?
    @State private var minutes = 60
    @State private var muscles: [String: [String: Double]] = [:]
    @State private var changing = false
    @State private var rating = false
    @State private var ratingDone = false
    @State private var finishing = false
    /// Opened on a workout already done: its sets as a table to fix (GymLog.swift).
    @State private var doneMode = false

    /// The lifting session from the watch or Intervals.icu that day.
    private var doneSession: WeekSession? { model.doneStrengthSession(on: date) }

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
        DetailScreen(glow: Palette.Glow.training) {
            content
        }
        .task { await load() }
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
        .keyboardDoneButton()
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
            } else if let day, !day.exercises.isEmpty {
                Text(day.planName ?? "Silový trénink").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 12)
                progress(day)
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
                NavigationLink(value: AppRoute.trainingMode(date)) {
                    Label("Režim tréninku", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
                exerciseCards(day)
                    .padding(.top, 20)
                PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: finishing) {
                    Task { await finish() }
                }
                .disabled(finishing)
                .padding(.top, 24)
            } else {
                Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                    .font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
                Picker("Délka", selection: $minutes) {
                    ForEach([30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.top, 18)
                Button { Task { await generate() } } label: {
                    Text(saving ? "Sestavuji…" : "Sestavit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || model.demo || day?.cancelled == true)
                .padding(.top, 14)
                NavigationLink(value: AppRoute.gymBuilder) {
                    Label("Vybrat partie a sestavit trénink", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
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
        let list: [GymExercise] = ExerciseOrder.grouped(all.map { $0.superset }).map { all[$0] }
        let groups: [String?] = list.map { $0.superset }
        return VStack(spacing: 12) {
            ForEach(ExerciseOrder.runs(groups), id: \.lowerBound) { (run: Range<Int>) in
                if let letter = ExerciseOrder.letter(groups[run.lowerBound]) {
                    SupersetGroup(letter: letter, spacing: 12) {
                        ForEach(list[run]) { (exercise: GymExercise) in card(day, exercise) }
                    }
                } else {
                    ForEach(list[run]) { (exercise: GymExercise) in card(day, exercise) }
                }
            }
        }
    }

    private func card(_ day: GymDay, _ exercise: GymExercise) -> some View {
        // The exercise's place in the plan (the cards may be regrouped by superset).
        let offset: Int? = day.exercises.firstIndex { $0.id == exercise.id }
        let add: (() -> Void)? = offset.map { (at: Int) -> () -> Void in { Task { await changeSets(at: at, by: 1) } } }
        let remove: (() -> Void)? = offset.map { (at: Int) -> () -> Void in { Task { await changeSets(at: at, by: -1) } } }
        return ExerciseCard(exercise: exercise,
                            failure: Set(exercise.sets.map { $0.row }.filter { day.isToFailure(row: $0) }),
                            onSet: { set, kg, reps, rpe in Task { await record(set, kg: kg, reps: reps, rpe: rpe) } },
                            onUndo: { set in Task { await undo(set) } },
                            onTechnique: { technique = exercise.name },
                            onAlternatives: { alternativesFor = exercise.name },
                            onAddSet: add,
                            onRemoveSet: remove)
    }

    private func progress(_ day: GymDay) -> some View {
        let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
        return VStack(alignment: .leading, spacing: 6) {
            Text(L10n.f("%@ z %@ %@ · %@ %@", String(done), String(total), Fmt.plural(total, "série", "sérií", "sérií"),
                        String(day.exercises.count), Fmt.plural(day.exercises.count, "cvik", "cviky", "cviků")))
                .font(Typo.small).foregroundStyle(Palette.muted)
            ProgressLine(fraction: total > 0 ? Double(done) / Double(total) : 0, color: Palette.amberBar, height: 4)
        }
        .padding(.top, 10)
    }

    private func load() async {
        if model.demo { day = DemoData.gym; loading = false; return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.gymDay(date: date)
            if let loaded = day, !doneMode { doneMode = Self.isDone(loaded, date: date) }
            if let names = day?.exercises.map(\.name), !names.isEmpty {
                muscles = (try? await model.api.gymMuscles(names: names)) ?? [:]
            }
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

    private func undo(_ set: GymSet) async {
        day?.undo(row: set.row)
        await save()
    }

    /// One set more (like the last one) or one fewer (the last one not done).
    private func changeSets(at offset: Int, by step: Int) async {
        if step > 0 { day?.addSet(at: offset) } else { day?.removeSet(at: offset) }
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
    var onSet: (GymSet, String, String, String) -> Void
    var onUndo: (GymSet) -> Void
    var onTechnique: () -> Void
    var onAlternatives: () -> Void
    var onAddSet: (() -> Void)? = nil
    var onRemoveSet: (() -> Void)? = nil

    /// A set can go while one is not done and another stays.
    private var canRemoveSet: Bool { exercise.sets.count > 1 && exercise.sets.contains { !$0.done } }

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name).font(.headline).foregroundStyle(Palette.ink)
                    Text("\(exercise.doneCount)/\(exercise.workCount) " + Fmt.plural(exercise.workCount, "série", "série", "sérií"))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if !failure.isEmpty { GymTag.failure.padding(.top, 4) }
                }
                Spacer()
                ExerciseInfoButton(name: exercise.name, action: onTechnique)
                Menu {
                    Button { onTechnique() } label: { Label("Technika", systemImage: "figure.strengthtraining.traditional") }
                    Button { onAlternatives() } label: { Label("Nahradit cvik", systemImage: "arrow.triangle.swap") }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 16, weight: .semibold)).frame(width: 36, height: 36)
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel("Možnosti cviku")
            }
            VStack(spacing: 6) {
                ForEach(exercise.sets) { set in
                    SetRow(set: set, failure: failure.contains(set.row), onDone: { kg, reps, rpe in onSet(set, kg, reps, rpe) }, onUndo: { onUndo(set) })
                }
            }
            if let onAddSet {
                HStack(spacing: 16) {
                    Button(action: onAddSet) { Label("Přidat sérii", systemImage: "plus") }
                    Spacer()
                    if let onRemoveSet, canRemoveSet {
                        Button(action: onRemoveSet) { Label("Odebrat sérii", systemImage: "minus") }
                    }
                }
                .font(Typo.caption.weight(.semibold))
                .foregroundStyle(Palette.muted)
                .buttonStyle(.borderless)
                .padding(.top, 2)
            }
        }
    }
}

/// One set: planned "8–10 × 60 kg", fields for what was done, and the tick.
struct SetRow: View {
    let set: GymSet
    /// To failure: a flame by the number.
    var failure = false
    var onDone: (String, String, String) -> Void
    var onUndo: () -> Void
    @State private var kg = ""
    @State private var reps = ""
    @State private var rpe = ""

    var body: some View {
        HStack(spacing: 8) {
            Text(set.warmup ? "R" : set.number).font(Typo.number(17)).foregroundStyle(set.warmup ? Palette.faint : failure ? Palette.rust : Palette.muted)
                .frame(width: 22, alignment: .leading)
                .overlay(alignment: .topTrailing) {
                    if failure { Image(systemName: "flame.fill").font(.system(size: 9)).foregroundStyle(Palette.rust).offset(x: -2, y: -1) }
                }
                .accessibilityLabel((set.warmup ? L10n.tr("Rozcvičovací série") : L10n.f("Série %@", set.number)) + (failure ? ", " + L10n.tr("do selhání") : ""))
            field($kg, placeholder: LiftWeight.shown(set.plannedKg) ?? Units.weightUnit, unit: Units.weightUnit, width: 64)
            Text("×").foregroundStyle(Palette.faint)
            field($reps, placeholder: set.plannedReps ?? L10n.tr("op."), unit: nil, width: 54)
            field($rpe, placeholder: "RPE", unit: nil, width: 46)
            Spacer(minLength: 4)
            Button {
                if set.done { onUndo() } else { onDone(kgValue(kg, set.plannedKg), value(reps, firstNumber(set.plannedReps)), rpe) }
            } label: {
                Image(systemName: set.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26))
                    .foregroundStyle(set.done ? Palette.green : Palette.faint)
            }
            .sensoryFeedback(.impact(weight: .light), trigger: set.done) { was, now in !was && now }
            .accessibilityLabel(L10n.tr(set.done ? "Hotovo, klepnutím vrátit" : "Označit sérii jako hotovou"))
        }
        .opacity(set.done ? 0.75 : 1)
        .onAppear { fill(set) }
        // The plan reloads after a swap or a save: show what is stored now.
        .onChange(of: set) { _, next in fill(next) }
    }

    private func fill(_ set: GymSet) {
        kg = LiftWeight.shown(set.kg) ?? ""
        reps = set.reps ?? ""
        rpe = set.rpe ?? ""
    }

    private func field(_ text: Binding<String>, placeholder: String, unit: String?, width: CGFloat) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(Typo.number(18))
            .frame(width: width, height: 34)
            .background(Palette.track, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .disabled(set.done)
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
        .task {
            guard !model.demo else { error = "V ukázce se technika nenačítá."; return }
            do { technique = try await model.api.gymTechnique(exercise: exercise) } catch { self.error = error.localizedDescription }
        }
    }

    private var videoId: String? { technique?.video?.id.flatMap { $0.isEmpty ? nil : $0 } }

    @ViewBuilder private var howTo: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let t = technique {
                photo
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

    /// Photos of the start and end position, swiped between; without them a
    /// still from the exercise's video.
    @ViewBuilder private var photo: some View {
        if let photos = technique?.photos, photos.count >= 2 {
            ExercisePhotos(urls: photos.compactMap { URL(string: $0) })
        } else if let id = videoId, let url = URL(string: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg") {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Rectangle().fill(Palette.track)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    @ViewBuilder private var videoPage: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let id = videoId {
                YouTubePlayer(id: id)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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

struct AlternativesSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let exercise: String
    /// The proposal's other exercises (not saved yet), so they are not offered.
    var inPlan: [String] = []
    var footnote: String? = "Nahradí jen série, které ještě nejsou hotové."
    var choose: (String) -> Void
    /// The whole alternative (its estimated load), for a proposal not saved yet.
    var chooseAlternative: ((GymAlternative) -> Void)? = nil
    @State private var items: [GymAlternative] = []
    @State private var loading = true
    @State private var technique: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(L10n.f("Místo: %@", exercise)).font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
            } else if items.isEmpty {
                Text("Žádná náhrada se nenašla.").font(Typo.small).foregroundStyle(Palette.muted)
            }
            PageScroll {
                VStack(spacing: 0) {
                    ForEach(items) { alt in
                        Button {
                            choose(alt.name)
                            chooseAlternative?(alt)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(alt.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                    Text([alt.muscle, alt.station, alt.note].compactMap { $0 }.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                                }
                                Spacer()
                                Image(systemName: "arrow.triangle.swap").foregroundStyle(Palette.faint)
                            }
                            .padding(.vertical, 12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 36)
                        .overlay(alignment: .trailing) { ExerciseInfoButton(name: alt.name) { technique = alt.name } }
                        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
            }
            if let footnote { Text(footnote).font(Typo.caption).foregroundStyle(Palette.faint) }
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            items = (try? await model.api.gymAlternatives(date: date, exercise: exercise, inPlan: inPlan)) ?? []
        }
    }
}

/// "i" by an exercise: what it is and how to do it (TechniqueSheet).
struct ExerciseInfoButton: View {
    let name: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "info.circle").font(.system(size: 18)).foregroundStyle(Palette.muted)
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

extension View {
    /// "Hotovo" above the keyboard: the number pads have no return key.
    func keyboardDoneButton() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Hotovo") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                    .fontWeight(.semibold)
            }
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
        view.loadHTMLString(html, baseURL: URL(string: "https://petrfitnessdata.eu"))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var loaded: String?
    }
}

/// The start and end position of an exercise, one photo per page.
struct ExercisePhotos: View {
    let urls: [URL]
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
                        Text(index == 0 ? L10n.tr("Začátek") : L10n.tr("Konec"))
                            .font(Typo.caption)
                            .foregroundStyle(Palette.ink)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Palette.background.opacity(0.65), in: Capsule())
                            .padding(10)
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .aspectRatio(3 / 2, contentMode: .fit)
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
