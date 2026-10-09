import SwiftUI

/// Režim tréninku → Upravit plán: the exercises in their order, to drag into
/// another order, swipe away, give a set more or fewer, or add one from the
/// catalog. "Uložit" hands the changed day back.
struct PlanEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var day: GymDay
    let catalog: [GymCatalogExercise]
    let save: (GymDay) -> Void
    @State private var adding = false

    init(day: GymDay, catalog: [GymCatalogExercise], save: @escaping (GymDay) -> Void) {
        _day = State(initialValue: day)
        self.catalog = catalog
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
                } footer: {
                    Text("Přetáhni cvik za úchyt, pro odebrání ho přejeď doleva. Hotové série zůstanou zapsané.")
                }
                Section {
                    Button { adding = true } label: {
                        Label("Přidat cvik", systemImage: "plus.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    }
                    .disabled(catalog.isEmpty)
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Plán tréninku")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { save(day); dismiss() }.fontWeight(.semibold)
                }
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(catalog: catalog, used: Set(day.exercises.map(\.name))) { ex in
                    day.addExercise(ex.name, sets: Self.count(ex.sets) ?? 3, reps: ex.reps?.string ?? "10")
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
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name).font(.body.weight(.medium)).foregroundStyle(left ? Palette.ink : Palette.muted)
                Text(Self.summary(sets: work.count, reps: reps, done: exercise.doneCount))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 6)
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

    /// "3 série × 8-12 · hotovo 1".
    static func summary(sets: Int, reps: String?, done: Int) -> String {
        var text = "\(sets) " + Fmt.plural(sets, "série", "série", "sérií")
        if let reps { text += " × " + reps }
        if done > 0 { text += " · hotovo \(done)" }
        return text
    }

    /// "3" or "3-4" sets in the catalog: the first number.
    static func count(_ value: JSONValue?) -> Int? {
        guard let text = value?.string else { return nil }
        return Int(String(text.prefix { $0.isNumber }))
    }
}

/// The catalog to pick an exercise to add, with search and the muscle chips.
struct ExercisePicker: View {
    @Environment(\.dismiss) private var dismiss
    let catalog: [GymCatalogExercise]
    let used: Set<String>
    let pick: (GymCatalogExercise) -> Void
    @State private var query = ""
    @State private var muscle: String?

    private var filtered: [GymCatalogExercise] {
        let words = ExerciseCatalog.fold(query).split(separator: " ")
        return catalog.filter { ex in
            let text = ExerciseCatalog.fold([ex.name, ex.muscle ?? "", ex.station ?? ""].joined(separator: " "))
            guard words.allSatisfy({ text.contains($0) }) else { return false }
            if let muscle, !ExerciseCatalog.works(ex, muscle) { return false }
            return true
        }
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
                    Button { pick(ex); dismiss() } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                Text([ex.muscle, ex.station].compactMap { $0?.nilIfBlank }.joined(separator: " · "))
                                    .font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            Spacer()
                            if used.contains(ex.name) { Text("v plánu").font(Typo.caption).foregroundStyle(Palette.faint) }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Hledat cvik nebo stroj")
            .navigationTitle("Přidat cvik")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { dismiss() } } }
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
