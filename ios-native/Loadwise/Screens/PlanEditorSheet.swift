import SwiftUI

/// Režim tréninku → Upravit plán: the exercises in their order with how far
/// each is, to drag into another order, swipe away, give a set more or fewer,
/// swap for another, join into a superset, or add one from the catalog.
/// "Uložit" hands the changed day back.
struct PlanEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var day: GymDay
    let catalog: [GymCatalogExercise]
    /// The day (for the alternatives) and the exercise in progress.
    var date: String? = nil
    var current: Int? = nil
    /// "Přejít na cvik": the day as changed here and the exercise to go to.
    var go: ((GymDay, String) -> Void)? = nil
    let save: (GymDay) -> Void
    @State private var adding = false
    @State private var swapping: String?

    init(day: GymDay, catalog: [GymCatalogExercise], date: String? = nil, current: Int? = nil,
         go: ((GymDay, String) -> Void)? = nil, save: @escaping (GymDay) -> Void) {
        self.go = go
        _day = State(initialValue: day)
        self.catalog = catalog
        self.date = date
        self.current = current
        self.save = save
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(Array(day.exercises.enumerated()), id: \.element.id) { offset, exercise in
                        row(offset, exercise)
                    }
                    .onMove { from, to in
                        guard let source = from.first else { return }
                        day.moveExercise(from: source, to: to)
                    }
                    .onDelete { offsets in
                        for offset in offsets.sorted(by: >) { day.removeExercise(at: offset) }
                    }
                }
                Section {
                    Button { adding = true } label: {
                        Label("Přidat cvik", systemImage: "plus.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    }
                    .disabled(catalog.isEmpty)
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle(day.planName?.nilIfBlank ?? L10n.tr("Plán tréninku"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { save(day); dismiss() }.fontWeight(.semibold)
                }
            }
            .sheet(item: Binding(get: { swapping.map { Named(name: $0) } }, set: { swapping = $0?.name })) { item in
                if let date {
                    AlternativesSheet(date: date, exercise: item.name, inPlan: day.exercises.map(\.name)) { name in
                        day.replace(exercise: item.name, with: name)
                    }
                }
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(catalog: catalog, used: Set(day.exercises.map(\.name))) { ex in
                    day.insertExercise(ex.name, sets: Self.count(ex.sets) ?? 3, reps: ex.reps?.string ?? "10", catalog: catalog, sides: GymSides.oneSided(ex.name))
                }
            }
        }
        .presentationDetents([.large])
    }

    private func row(_ offset: Int, _ exercise: GymExercise) -> some View {
        let work = exercise.sets.filter { !$0.warmup }
        let reps = work.first?.plannedReps?.nilIfBlank
        let left = exercise.sets.contains { !$0.done }
        return HStack(spacing: 10) {
            status(offset, exercise)
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name).font(.body.weight(.medium)).foregroundStyle(left ? Palette.ink : Palette.muted)
                Text(Self.summary(sets: work.count, reps: reps, done: exercise.doneCount))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 6)
            Menu {
                if let go, left, offset != current {
                    Button { go(day, exercise.id); dismiss() } label: { Label("Přejít na cvik", systemImage: "arrow.right.circle") }
                }
                if date != nil, left {
                    Button { swapping = exercise.name } label: { Label("Vyměnit cvik", systemImage: "arrow.triangle.swap") }
                }
                if ExerciseOrder.letter(exercise.superset) != nil {
                    Button { day.toggleSuperset(at: offset) } label: { Label("Zrušit supersérii", systemImage: "link") }
                } else if offset + 1 < day.exercises.count {
                    Button { day.toggleSuperset(at: offset) } label: { Label("Supersérie s dalším cvikem", systemImage: "link") }
                }
            } label: {
                Image(systemName: "ellipsis").frame(width: 32, height: 32).background(Palette.track, in: Circle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Další volby")
            Button { day.removeSet(at: offset) } label: {
                Image(systemName: "minus").frame(width: 32, height: 32).background(Palette.track, in: Circle())
            }
            .buttonStyle(.borderless)
            .disabled(!left)
            .accessibilityLabel("O sérii méně")
            Button { day.addSet(at: offset) } label: {
                Image(systemName: "plus").frame(width: 32, height: 32).background(Palette.track, in: Circle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("O sérii víc")
        }
        .foregroundStyle(Palette.ink)
    }

    /// Done (a tick), in progress ("2/4") or not started (an empty circle).
    @ViewBuilder
    private func status(_ offset: Int, _ exercise: GymExercise) -> some View {
        if exercise.workCount > 0, exercise.doneCount >= exercise.workCount {
            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.onAccent)
                .frame(width: 28, height: 28).background(Palette.green, in: Circle())
        } else if offset == current || exercise.doneCount > 0 {
            Text("\(exercise.doneCount)/\(exercise.workCount)").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.amber)
                .frame(width: 28, height: 28).overlay(Circle().stroke(Palette.amber, lineWidth: 2))
        } else {
            Circle().stroke(Palette.hairline, lineWidth: 1.5).frame(width: 28, height: 28)
        }
    }

    /// "3 série × 8-12 · hotovo 1".
    static func summary(sets: Int, reps: String?, done: Int) -> String {
        var text = L10n.f("%@ %@", String(sets), Fmt.plural(sets, "série", "série", "sérií"))
        if let reps { text += " × " + reps }
        if done > 0 { text += " · " + L10n.f("hotovo %@", String(done)) }
        return text
    }

    /// "3" or "3-4" sets in the catalog: the first number.
    static func count(_ value: JSONValue?) -> Int? {
        guard let text = value?.string else { return nil }
        return Int(String(text.prefix { $0.isNumber }))
    }
}

/// The catalog to pick an exercise to add, with search and the muscle chips;
/// "i" shows how to do it. Exercises given a thumb down come last.
struct ExercisePicker: View {
    @Environment(\.dismiss) private var dismiss
    let catalog: [GymCatalogExercise]
    let used: Set<String>
    let pick: (GymCatalogExercise) -> Void
    @State private var query = ""
    @State private var muscle: String?
    @State private var technique: String?

    private var filtered: [GymCatalogExercise] {
        let words = ExerciseCatalog.fold(query).split(separator: " ")
        let found: [GymCatalogExercise] = catalog.filter { ex in
            let text = ExerciseCatalog.fold([ex.name, ex.muscle ?? "", ex.station ?? ""].joined(separator: " "))
            guard words.allSatisfy({ text.contains($0) }) else { return false }
            if let muscle, !ExerciseCatalog.works(ex, muscle) { return false }
            return true
        }
        return found.filter { $0.liked != false } + found.filter { $0.liked == false }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            chip("Vše", muscle == nil) { muscle = nil }
                            ForEach(BodyFigure.muscles.indices, id: \.self) { i in
                                let m = BodyFigure.muscles[i]
                                chip(m.label, muscle == m.id) { muscle = muscle == m.id ? nil : m.id }
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
                ForEach(filtered) { ex in
                    HStack(spacing: 8) {
                        Button { pick(ex); dismiss() } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                    Text([ex.muscle, ex.station].compactMap { $0?.nilIfBlank }.joined(separator: " · "))
                                        .font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                if used.contains(ex.name) { Text("v plánu").font(Typo.caption).foregroundStyle(Palette.faint) }
                                if let liked = ex.liked {
                                    Image(systemName: liked ? "hand.thumbsup" : "hand.thumbsdown").font(.system(size: 13))
                                        .foregroundStyle(liked ? Palette.green : Palette.faint)
                                        .accessibilityLabel(L10n.tr(liked ? "Baví mě" : "Nebaví mě"))
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.borderless)
                        ExerciseInfoButton(name: ex.name) { technique = ex.name }
                    }
                }
            }
            .searchable(text: $query, prompt: "Hledat cvik nebo stroj")
            .navigationTitle("Přidat cvik")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { dismiss() } } }
            .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
                TechniqueSheet(exercise: item.name)
            }
        }
    }

    private func chip(_ title: String, _ on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.footnote.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(on ? Palette.button : Palette.track, in: Capsule())
        }
        .buttonStyle(.borderless)
    }
}
