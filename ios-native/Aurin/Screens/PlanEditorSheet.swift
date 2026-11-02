import SwiftUI

/// Režim tréninku → Upravit plán: the exercises in their order with how far
/// each is, to drag into another order, swipe away, give a set more or fewer,
/// swap for another, join into a superset with any other (a swipe to the
/// right), see how one is done ("i"), or add one from the catalog. A swipe to
/// the left (or Odebrat cvik) takes the whole exercise out, its done sets too.
/// Under way, Zahodit trénink at the bottom throws the workout away.
/// "Uložit" hands the changed day back. Po cvicích turns the stretching and the
/// cardio at the end on or off for the day (and changes them) right away.
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
    @AppStorage(GymDayParts.storageKey) private var dayParts = ""
    @State private var cardioEditing: GymDayPart?
    @State private var choosing: GymDayPart?
    @State private var technique: String?
    /// The exercise (by its id) to join into a superset with one picked next.
    @State private var pairing: String?
    /// Zahodit trénink: the workout mode throws the workout away (nil: not offered).
    var discard: (() -> Void)? = nil
    @State private var confirmDiscard = false

    init(day: GymDay, catalog: [GymCatalogExercise], date: String? = nil, current: Int? = nil,
         go: ((GymDay, String) -> Void)? = nil, discard: (() -> Void)? = nil, save: @escaping (GymDay) -> Void) {
        self.go = go
        self.discard = discard
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
                }
                Section {
                    Button { adding = true } label: {
                        Label("Přidat cvik", systemImage: "plus.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    }
                    .disabled(catalog.isEmpty)
                }
                if let date {
                    Section {
                        if day.stretching != nil { afterRow(.stretching, date: date) }
                        afterRow(.cardioEnd, date: date)
                    } header: {
                        Text("Po cvicích")
                    }
                }
                if discard != nil {
                    Section {
                        Button(role: .destructive) { confirmDiscard = true } label: {
                            Text("Zahodit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.rust).frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .confirmationDialog("Zahodit trénink?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Zahodit trénink", role: .destructive) { dismiss(); discard?() }
            } message: {
                Text("Trénink zmizí z plánu dne, smažou se zapsané série i trénink uložený do Apple Health.")
            }
            // No edit mode: a row swipes (Superset to the right, delete to the
            // left) and a long press drags it into another place.
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
            .sheet(item: $cardioEditing) { part in
                if let date {
                    GymCardioSheet(choice: GymDayParts.resolved(day, stored: dayParts, date: date).choice(part), options: []) { choice in
                        var next = GymDayParts.resolved(day, stored: dayParts, date: date)
                        next.cardio[part.rawValue] = choice
                        dayParts = GymDayParts.saving(next, date: date, into: dayParts)
                    }
                }
            }
            .sheet(item: $choosing) { part in
                if let date { GymRoutineSheet(part: part, day: day, date: date) }
            }
            .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
                TechniqueSheet(exercise: item.name)
            }
            .sheet(item: Binding(get: { pairing.map { Named(name: $0) } }, set: { pairing = $0?.name })) { item in
                if let offset = day.exercises.firstIndex(where: { $0.id == item.name }) {
                    SupersetPicker(day: day, offset: offset) { other in day.superset(offset, with: other) }
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

    /// Protažení or Kardio after the exercises: its switch, and a tap changes it.
    private func afterRow(_ part: GymDayPart, date: String) -> some View {
        let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
        let on = parts.isOn(part)
        return HStack(spacing: 12) {
            Button { if part.isCardio { cardioEditing = part } else { choosing = part } } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(part == .stretching ? "Protažení" : "Kardio").font(.body).foregroundStyle(Palette.ink)
                    if on {
                        HStack(spacing: 3) {
                            Text(verbatim: parts.subtitle(part, day: day)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                            Image(systemName: "chevron.right").scaledFont(9, weight: .semibold).foregroundStyle(Palette.faint)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!on)
            Toggle(isOn: Binding(get: { on }, set: { value in
                var next = parts
                next.off.removeAll { $0 == part }
                if !value { next.off.append(part) }
                dayParts = GymDayParts.saving(next, date: date, into: dayParts)
            })) { EmptyView() }
                .toggleStyle(AurinToggleStyle())
                .fixedSize()
                .accessibilityLabel(Text(part == .stretching ? "Protažení" : "Kardio"))
        }
    }

    private func row(_ offset: Int, _ exercise: GymExercise) -> some View {
        let work = exercise.sets.filter(\.work)
        let reps = work.first?.plannedReps?.nilIfBlank
        let left = exercise.sets.contains { !$0.done }
        return HStack(spacing: 10) {
            status(offset, exercise)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 0) {
                    Text(exercise.name).font(.body.weight(.medium)).foregroundStyle(left ? Palette.ink : Palette.muted)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    ExerciseInfoButton(name: exercise.name) { technique = exercise.name }
                }
                summaryLine(exercise, work: work.count, reps: reps)
                if let letter = ExerciseOrder.letter(exercise.superset) { GymTag.superset(letter).padding(.top, 2) }
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
                } else if left, SupersetPicker.offers(day, offset) {
                    Button { pairing = exercise.id } label: { Label("Supersérie s…", systemImage: "link") }
                }
                Button(role: .destructive) { day.deleteExercise(at: offset) } label: { Label("Odebrat cvik", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis").frame(width: 32, height: 32).background(Palette.track, in: Circle()).tapTarget(width: 44, height: 32)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Další volby")
            Button { day.removeSet(at: offset) } label: {
                Image(systemName: "minus").frame(width: 32, height: 32).background(Palette.track, in: Circle()).tapTarget(width: 44, height: 32)
            }
            .buttonStyle(.borderless)
            .disabled(!left)
            .accessibilityLabel("O sérii méně")
            Button { day.addSet(at: offset) } label: {
                Image(systemName: "plus").frame(width: 32, height: 32).background(Palette.track, in: Circle()).tapTarget(width: 44, height: 32)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("O sérii víc")
        }
        .foregroundStyle(Palette.ink)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if left, ExerciseOrder.letter(exercise.superset) == nil, SupersetPicker.offers(day, offset) {
                Button { pairing = exercise.id } label: { Label("Supersérie", systemImage: "link") }
                    .tint(Palette.indigo)
            }
        }
        // A leading swipe action turns off onDelete's own: the delete is here.
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) { day.deleteExercise(at: offset) } label: { Label("Smazat", systemImage: "trash") }
        }
    }

    /// Done (a tick), in progress ("2/4") or not started (an empty circle).
    @ViewBuilder
    private func status(_ offset: Int, _ exercise: GymExercise) -> some View {
        if exercise.workCount > 0, exercise.doneCount >= exercise.workCount {
            Image(systemName: "checkmark").scaledFont(12, weight: .bold, cap: .denseCap).foregroundStyle(Palette.onAccent)
                .frame(width: 28, height: 28).background(Palette.green, in: Circle())
        } else if offset == current || exercise.doneCount > 0 {
            Text("\(exercise.doneCount)/\(exercise.workCount)").scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(Palette.amber)
                .frame(width: 28, height: 28).overlay { Circle().stroke(Palette.amber, lineWidth: 2) }
        } else {
            Circle().stroke(Palette.hairline, lineWidth: 1.5).frame(width: 28, height: 28)
        }
    }

    /// The summary, then the warm-ups not done yet in amber: they follow the
    /// order (GymDay.balanceWarmups), so a move shows what changed.
    private func summaryLine(_ exercise: GymExercise, work: Int, reps: String?) -> some View {
        let warmups = exercise.sets.filter { $0.warmup && !$0.done }.count
        var line = Text(Self.summary(sets: work, reps: reps, done: exercise.doneCount)).foregroundStyle(Palette.muted)
        if warmups > 0 {
            line = line + Text(verbatim: " · ").foregroundStyle(Palette.muted)
                + Text(L10n.plural("%lld rozcvičovacích sérií", warmups)).foregroundStyle(Palette.amber)
        }
        return line.font(Typo.caption)
    }

    /// "3 série × 8-12 · hotovo 1".
    static func summary(sets: Int, reps: String?, done: Int) -> String {
        var text = L10n.plural("%lld sérií", sets)
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

/// Supersérie s…: the other exercises of the day not finished yet, to do in
/// turns with the one swiped; the picked one moves right after it.
struct SupersetPicker: View {
    @Environment(\.dismiss) private var dismiss
    let day: GymDay
    let offset: Int
    let pick: (Int) -> Void
    @State private var technique: String?

    static func candidates(_ day: GymDay, _ offset: Int) -> [Int] {
        day.exercises.indices.filter { $0 != offset && day.exercises[$0].sets.contains { !$0.done } }
    }

    static func offers(_ day: GymDay, _ offset: Int) -> Bool { !candidates(day, offset).isEmpty }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(Self.candidates(day, offset), id: \.self) { i in
                        let exercise = day.exercises[i]
                        HStack(spacing: 8) {
                            Button { pick(i); dismiss() } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                    Text(PlanEditorSheet.summary(sets: exercise.workCount, reps: exercise.sets.first(where: \.work)?.plannedReps?.nilIfBlank, done: exercise.doneCount))
                                        .font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.borderless)
                            ExerciseInfoButton(name: exercise.name) { technique = exercise.name }
                        }
                    }
                } header: {
                    Text(L10n.f("%@, pak cvik, který vybereš, a teprve potom pauza.", day.exercises[offset].name))
                        .textCase(nil)
                } footer: {
                    Text("Hotové cviky tu nejsou.")
                }
            }
            .navigationTitle("Supersérie s…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } } }
            .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
                TechniqueSheet(exercise: item.name)
            }
        }
        .presentationDetents([.medium, .large])
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
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            chip("Vše", muscle == nil) { muscle = nil }
                            ForEach(BodyFigure.muscles.indices, id: \.self) { i in
                                let m = BodyFigure.muscles[i]
                                chip(m.label, muscle == m.id) { muscle = muscle == m.id ? nil : m.id }
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
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
                                    Image(systemName: liked ? "hand.thumbsup" : "hand.thumbsdown").scaledFont(13)
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
