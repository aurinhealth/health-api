import SwiftUI
import UIKit

/// Režim tréninku: one exercise and one set at a time, big enough to use
/// between sets. "Hotovo" records the set (the planned weight and reps unless
/// changed, how hard it was in words) and starts the rest (the lengths from
/// Nastavení, longer before the next exercise); after the last set comes the
/// next exercise. The plan can be reordered, shortened or extended on the way.
/// The screen stays on meanwhile.
struct TrainingModeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var day: GymDay?
    @State private var loading = true
    @State private var error: String?
    @State private var index = 0
    @State private var kg = ""
    @State private var reps = ""
    @State private var rpe = 8
    @AppStorage("restSets") private var restSets = 90
    @AppStorage("restExercises") private var restExercises = 120
    @State private var restEnd: Date?
    @State private var catalog: [GymCatalogExercise] = []
    @State private var dumbbells: [Double] = []
    @State private var editing = false
    @State private var muscles: [String: [String: Double]] = [:]
    @State private var technique: String?
    @State private var saving = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            VStack(alignment: .leading, spacing: 0) {
                header
                if loading && day == nil {
                    Spacer()
                    ProgressView().frame(maxWidth: .infinity)
                    Spacer()
                } else if let day, !day.exercises.isEmpty {
                    if let exercise = current(day) {
                        session(day, exercise)
                    } else {
                        finished(day)
                    }
                } else {
                    empty
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; model.immersive = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false; model.immersive = false; Task { await Reminders.restEnds(at: nil) } }
        .onChange(of: restEnd) { _, end in Task { await Reminders.restEnds(at: end) } }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
        .sheet(isPresented: $editing) {
            if let day {
                PlanEditorSheet(day: day, catalog: catalog) { edited in Task { await saveEdited(edited) } }
            }
        }
    }

    private var header: some View {
        HStack {
            CircleButton(systemImage: "xmark", label: L10n.tr("Ukončit režim tréninku")) { dismiss() }
            Spacer()
            if let day {
                let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
                Text("\(done)/\(total) " + Fmt.plural(total, "série", "série", "sérií")).font(Typo.small).foregroundStyle(Palette.muted)
                if !day.exercises.isEmpty {
                    CircleButton(systemImage: "list.bullet", label: L10n.tr("Upravit plán")) { editing = true }
                        .padding(.leading, 8)
                }
            }
        }
    }

    // MARK: The set

    private func session(_ day: GymDay, _ exercise: GymExercise) -> some View {
        let set = nextSet(exercise)
        return VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: L10n.f("Cvik %@ z %@", String(index + 1), String(day.exercises.count)) + (exercise.superset.map { " · " + L10n.f("supersérie %@", $0) } ?? ""))
                .padding(.top, 18)
            HStack(alignment: .firstTextBaseline) {
                Text(exercise.name).font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button { technique = exercise.name } label: { Image(systemName: "info.circle").font(.system(size: 20)) }
                    .foregroundStyle(Palette.muted)
                    .accessibilityLabel("Technika")
            }
            .padding(.top, 6)

            if let map = muscles[exercise.name], !map.isEmpty {
                BodyMap(load: map, height: 170, legend: true).padding(.top, 10)
            }

            HStack(spacing: 6) {
                ForEach(exercise.sets.filter { !$0.warmup }) { s in
                    Capsule().fill(s.done ? Palette.green : s.row == set?.row ? Palette.amberBar : Palette.track).frame(height: 6)
                }
            }
            .padding(.top, 16)

            Spacer(minLength: 12)

            if let restEnd {
                rest(until: restEnd)
            } else if let set {
                VStack(spacing: 14) {
                    Text((set.warmup ? L10n.tr("Rozcvičovací série") : L10n.f("Série %@", set.number)) + plan(set))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    HStack(spacing: 12) {
                        stepper(uses(exercise, "dumbbells") && !dumbbells.isEmpty ? L10n.f("%@ na ruku", Units.weightUnit) : Units.weightUnit, $kg, step: Units.weightStep,
                                weights: uses(exercise, "dumbbells") ? dumbbells.map { LiftWeight.shownValue($0) } : [])
                        stepper("opakování", $reps, step: 1)
                    }
                    effort
                    PrimaryButton(title: saving ? "Ukládám…" : "Série hotová", systemImage: "checkmark", busy: saving) {
                        Task { await complete(set) }
                    }
                    .disabled(saving)
                }
                .frame(maxWidth: .infinity)
            }

            Spacer(minLength: 12)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
            HStack {
                Button { move(-1) } label: { Label("Předchozí", systemImage: "chevron.left") }
                    .disabled(index == 0)
                Spacer()
                Button { move(1) } label: { Label("Další cvik", systemImage: "chevron.right").labelStyle(TrailingIcon()) }
                    .disabled(index >= day.exercises.count - 1)
            }
            .font(Typo.bodyStrong)
            .foregroundStyle(Palette.ink)
        }
        .onChange(of: set?.row) { _, _ in prefill(set) }
        .onAppear { prefill(set) }
        .task(id: exercise.name) { await loadMuscles(day) }
    }

    private func rest(until end: Date) -> some View {
        VStack(spacing: 12) {
            Text("Pauza").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = max(0, Int(end.timeIntervalSince(context.date).rounded()))
                Text(String(format: "%d:%02d", left / 60, left % 60))
                    .font(Typo.number(96)).foregroundStyle(left == 0 ? Palette.green : Palette.ink)
                    .monospacedDigit()
            }
            HStack(spacing: 10) {
                SecondaryButton(title: "−15 s") { shiftRest(-15) }
                SecondaryButton(title: "+15 s") { shiftRest(15) }
            }
            PrimaryButton(title: "Přeskočit pauzu", systemImage: "forward.fill") { restEnd = nil }
        }
        .frame(maxWidth: .infinity)
        .task(id: end) {
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, restEnd == end else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private func finished(_ day: GymDay) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Spacer()
            Image(systemName: "checkmark.seal.fill").font(.system(size: 48)).foregroundStyle(Palette.green)
            Text("Trénink je hotový").font(Typo.sentence(36, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            let sets = day.exercises.reduce(0) { $0 + $1.doneCount }
            Text(L10n.f("%@ %@ v %@ %@. Série jsou uložené i pro příští plán.", String(sets), Fmt.plural(sets, "série", "série", "sérií"),
                        String(day.exercises.count), Fmt.plural(day.exercises.count, "cviku", "cvicích", "cvicích")))
                .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            BodyMap(load: muscles.values.reduce(into: [String: Double]()) { out, map in for (k, v) in map { out[k] = max(out[k] ?? 0, v) } }, height: 220, legend: true)
            Spacer()
            PrimaryButton(title: "Zavřít") { dismiss() }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            NavigationLink(value: AppRoute.gymBuilder) {
                Label("Sestavit trénink", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }

    // MARK: Parts

    /// How hard the set was, in words (stored as RPE 6–10 for the next plan).
    struct Effort {
        let rpe: Int
        let label: String
        let hint: String
    }

    static let efforts: [Effort] = [
        Effort(rpe: 6, label: "Lehké", hint: "zbývaly 4 a víc"), Effort(rpe: 7, label: "Akorát", hint: "zbývala 3"),
        Effort(rpe: 8, label: "Těžké", hint: "zbývala 2"), Effort(rpe: 9, label: "Na hraně", hint: "zbývalo 1"),
        Effort(rpe: 10, label: "Selhání", hint: "už ani jedno")
    ]

    /// "V zásobě zbývala 2 opakování · RPE 8".
    static func reserve(_ e: Effort) -> String {
        let reps = e.rpe == 10 ? "" : " opakování"
        return L10n.tr("V zásobě " + e.hint + reps) + " · RPE \(e.rpe)"
    }

    private var effort: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Jak to šlo?").font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(spacing: 6) {
                ForEach(Self.efforts, id: \.rpe) { e in
                    Button { rpe = e.rpe } label: {
                        Text(e.label).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
                            .foregroundStyle(rpe == e.rpe ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 40)
                            .background(rpe == e.rpe ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.tr(e.hint + " opakování"))
                    .accessibilityAddTraits(rpe == e.rpe ? .isSelected : [])
                }
            }
            if let e = Self.efforts.first(where: { $0.rpe == rpe }) {
                Text(Self.reserve(e))
                    .font(Typo.caption).foregroundStyle(Palette.faint)
            }
        }
    }

    private func uses(_ exercise: GymExercise, _ station: String) -> Bool {
        catalog.first { $0.name == exercise.name }?.stations?.contains(station) == true
    }

    /// kg with − and +: by 2.5, or through the dumbbells there are.
    private func stepper(_ unit: String, _ text: Binding<String>, step: Double, weights: [Double] = []) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                Button { bump(text, -step, weights) } label: { Image(systemName: "minus").frame(width: 40, height: 56) }
                TextField("–", text: text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(Typo.number(40))
                    .frame(maxWidth: .infinity)
                Button { bump(text, step, weights) } label: { Image(systemName: "plus").frame(width: 40, height: 56) }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Palette.ink)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(unit).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    private func bump(_ text: Binding<String>, _ by: Double, _ weights: [Double] = []) {
        let value = Double(text.wrappedValue.replacingOccurrences(of: ",", with: ".")) ?? 0
        let next: Double
        if !weights.isEmpty {
            next = (by > 0 ? weights.first { $0 > value + 0.01 } : weights.last { $0 < value - 0.01 }) ?? value
        } else {
            next = max(0, value + by)
        }
        text.wrappedValue = next.rounded() == next ? String(Int(next)) : String(next)
    }

    private func plan(_ set: GymSet) -> String {
        let reps = set.plannedReps.map { " · " + L10n.f("plán %@", $0) } ?? ""
        let kg = set.plannedKg.map { " × " + (LiftWeight.shown($0) ?? $0) + " " + Units.weightUnit } ?? ""
        return reps + kg
    }

    private func current(_ day: GymDay) -> GymExercise? {
        let list = day.exercises
        guard !list.isEmpty else { return nil }
        if list.allSatisfy({ $0.sets.allSatisfy(\.done) }) && restEnd == nil { return nil }
        return list[min(index, list.count - 1)]
    }

    private func nextSet(_ exercise: GymExercise) -> GymSet? {
        exercise.sets.first { !$0.done }
    }

    private func prefill(_ set: GymSet?) {
        guard let set else { return }
        kg = LiftWeight.shown(set.kg ?? set.plannedKg) ?? ""
        reps = set.reps ?? set.plannedReps.map { String($0.prefix { $0.isNumber }) } ?? ""
    }

    private func move(_ by: Int) {
        guard let count = day?.exercises.count else { return }
        index = min(max(0, index + by), count - 1)
        restEnd = nil
    }

    /// Only this rest: the default stays as set.
    private func shiftRest(_ seconds: Int) {
        guard let end = restEnd else { return }
        let next = end.addingTimeInterval(TimeInterval(seconds))
        restEnd = next.timeIntervalSinceNow <= 0 ? nil : next
    }

    // MARK: Server

    private func load() async {
        if model.demo { day = DemoData.gym; loading = false; startAtFirstOpen(); return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.gymDay(date: date)
            startAtFirstOpen()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Opens on the first exercise with a set left.
    private func startAtFirstOpen() {
        guard let list = day?.exercises else { return }
        index = list.firstIndex { $0.sets.contains { !$0.done } } ?? 0
    }

    private func loadMuscles(_ day: GymDay) async {
        guard !model.demo else { return }
        let missing = day.exercises.map(\.name).filter { muscles[$0] == nil }
        if !missing.isEmpty, let more = try? await model.api.gymMuscles(names: missing) { muscles.merge(more) { $1 } }
        guard catalog.isEmpty else { return }
        async let list = model.api.gymExercises()
        async let equipment = model.api.gymEquipment()
        catalog = (try? await list) ?? []
        dumbbells = (try? await equipment)?.dumbbellWeights ?? []
    }

    /// The plan as changed in "Upravit plán": saved, and back on the first
    /// exercise with a set left.
    private func saveEdited(_ edited: GymDay) async {
        day = edited
        restEnd = nil
        startAtFirstOpen()
        await loadMuscles(edited)
        guard !model.demo else { return }
        do {
            try await model.saveGym(edited, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    private func complete(_ set: GymSet) async {
        guard var next = day else { return }
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces)
        next.complete(row: set.row, kg: k.isEmpty ? (set.plannedKg ?? "") : k, reps: r.isEmpty ? (set.plannedReps ?? "") : r, rpe: String(rpe))
        day = next
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        // The last set of the exercise: on to the next one after a longer rest.
        var rest = set.warmup ? 60 : restSets
        if let exercise = next.exercises[safe: index], exercise.sets.allSatisfy(\.done), index < next.exercises.count - 1 {
            index += 1
            rest = restExercises
        }
        if next.exercises.contains(where: { $0.sets.contains { !$0.done } }), rest > 0 {
            restEnd = Date().addingTimeInterval(TimeInterval(rest))
        }
        guard !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Sérii se nepodařilo uložit: %@", error.localizedDescription)
        }
    }
}

struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
