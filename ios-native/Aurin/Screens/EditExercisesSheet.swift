import SwiftUI

/// Live workout → "…" → Edit exercises (concept 08): the exercises done, and
/// those still to do to drag into another order (the handle) or take out (the
/// minus); Add exercise, and Make superset, which picks the exercises that go
/// together (not started or the one under way, not paired yet) and puts them next to each other.
/// A superset's Unpair takes it apart. Done hands the changed day back with
/// the day as it came (the caller keeps sets ticked meanwhile); unchanged it
/// only closes.
struct EditExercisesSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var day: GymDay
    let catalog: [GymCatalogExercise]
    /// The exercise under way ("Now"), by name: its place changes as the list is edited.
    let currentName: String?
    let save: (_ edited: GymDay, _ original: GymDay) -> Void
    /// The day as it came: Cancel shows once something changed.
    private let original: GymDay
    @State private var adding = false
    /// Make superset: the exercises picked so far (by id); nil while editing.
    @State private var picking: Set<String>?

    init(day: GymDay, catalog: [GymCatalogExercise], current: Int? = nil, save: @escaping (_ edited: GymDay, _ original: GymDay) -> Void) {
        _day = State(initialValue: day)
        original = day
        self.catalog = catalog
        currentName = current.flatMap { day.exercises[safe: $0]?.name }
        self.save = save
    }

    private var doneIndices: [Int] { day.exercises.indices.filter { !Self.left(day.exercises[$0]) } }
    private var leftIndices: [Int] { day.exercises.indices.filter { Self.left(day.exercises[$0]) } }
    /// Rows by the exercise, so a removed or moved one animates as itself.
    private struct Row: Identifiable { let index: Int; let id: String }
    private func rows(_ indices: [Int]) -> [Row] { indices.map { Row(index: $0, id: day.exercises[$0].name) } }

    static func left(_ exercise: GymExercise) -> Bool { exercise.sets.contains { !$0.done } }

    var body: some View {
        NavigationStack {
            List {
                // The title as a header: a row clipped its first letter.
                Section {
                } header: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(picking == nil ? "Upravit cviky" : "Udělat supersérii").font(Typo.heading(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                        Text(picking == nil ? "Táhni za úchyt a změníš pořadí. Mínus cvik odebere."
                             : "Vyber cviky, které jdou spolu. Přesunou se k sobě. Hotový cvik nebo cvik, který už je v páru, vybrat nejde.")
                            .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    .textCase(nil)
                    .padding(.horizontal, -12)
                }
                if !doneIndices.isEmpty {
                    Section {
                        ForEach(rows(doneIndices)) { row in doneRow(day.exercises[row.index]) }
                    } header: {
                        SectionLabel(text: "Hotové")
                    }
                    .opacity(picking == nil ? 1 : 0.45)
                }
                Section {
                    ForEach(rows(leftIndices)) { row in leftRow(row.index) }
                        .onDelete(perform: deleteAction)
                        .onMove(perform: moveAction)
                } header: {
                    SectionLabel(text: "Zbývá udělat")
                }
                if picking == nil {
                    Section {
                        HStack(spacing: 10) {
                            footerButton("Přidat cvik") { adding = true }.disabled(catalog.isEmpty)
                            footerButton("Udělat supersérii") { withMotion(.snappy) { picking = [] } }
                                // Also to take a superset apart (Unpair is there).
                                .disabled(leftIndices.filter(pickable).count < 2
                                          && !leftIndices.contains { ExerciseOrder.letter(day.exercises[$0].superset) != nil })
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
            }
            .listStyle(.insetGrouped)
            .listRowSpacing(8)
            .scrollContentBackground(.hidden)
            .background { ScreenBackground(glow: Palette.Glow.gym) }
            .environment(\.editMode, .constant(picking == nil ? .active : .inactive))
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let picking {
                    PrimaryButton(title: picking.count < 2 ? L10n.tr("Vyber dva nebo víc") : L10n.f("Spojit %@ do supersérie", String(picking.count))) {
                        day.makeSuperset(Array(picking), anchor: currentName.flatMap { name in day.exercises.first { $0.name == name }?.id })
                        withMotion(.snappy) { self.picking = nil }
                    }
                    .disabled(picking.count < 2)
                    .opacity(picking.count < 2 ? 0.5 : 1)
                    .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 6)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if picking != nil {
                    ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { withMotion(.snappy) { picking = nil } } }
                } else {
                    if day.values != original.values {
                        ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            if day.values != original.values { save(day, original) }
                            dismiss()
                        } label: { Text("Hotovo").fontWeight(.semibold).foregroundStyle(Palette.green) }
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

    // MARK: Rows

    private func doneRow(_ exercise: GymExercise) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: exercise.name).font(.body.weight(.medium)).foregroundStyle(Palette.muted).lineLimit(2)
                Text(verbatim: L10n.plural("%lld sérií", exercise.doneCount)).font(Typo.caption).foregroundStyle(Palette.faint)
            }
            Spacer(minLength: 6)
            Image(systemName: "checkmark").scaledFont(13, weight: .semibold).foregroundStyle(Palette.green).accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text("Hotovo"))
        .moveDisabled(true)
        .deleteDisabled(true)
    }

    private func leftRow(_ i: Int) -> some View {
        let exercise = day.exercises[i]
        let letter = ExerciseOrder.letter(exercise.superset)
        let canPick = pickable(i)
        let picked = picking?.contains(exercise.id) == true
        return HStack(spacing: 10) {
            if picking != nil, canPick {
                Image(systemName: picked ? "checkmark.circle.fill" : "circle").scaledFont(22)
                    .foregroundStyle(picked ? Palette.indigo : Palette.faint)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: exercise.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                Text(verbatim: detail(exercise)).font(Typo.caption).foregroundStyle(Palette.muted)
                if let letter, letter != previousLetter(i) || !Self.left(day.exercises[i - 1]) {
                    supersetTag(letter, index: i).padding(.top, 4)
                }
            }
            Spacer(minLength: 6)
            if exercise.name == currentName {
                Text("Teď").font(.footnote.weight(.semibold)).foregroundStyle(Palette.amber)
            }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onTapGesture {
            guard picking != nil, canPick else { return }
            if picked { picking?.remove(exercise.id) } else { picking?.insert(exercise.id) }
        }
        .opacity(picking != nil && !canPick ? 0.45 : 1)
        .listRowBackground(
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Palette.card)
                .overlay {
                    if letter != nil {
                        RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.indigo.opacity(0.7), lineWidth: 1.5)
                    }
                }
        )
        .accessibilityAddTraits(picking != nil && canPick ? (picked ? [.isButton, .isSelected] : .isButton) : [])
    }

    /// "Superset B" on the first exercise of the pair; in Make superset it unpairs them.
    @ViewBuilder
    private func supersetTag(_ letter: String, index: Int) -> some View {
        if picking != nil {
            Button { day.toggleSuperset(at: index) } label: {
                Text(verbatim: L10n.f("Zrušit supersérii %@", letter)).font(.caption.weight(.semibold)).foregroundStyle(Palette.indigo)
                    .padding(.horizontal, 10).frame(height: 26)
                    .overlay { Capsule().stroke(Palette.indigo, lineWidth: 1) }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
        } else {
            Text(verbatim: L10n.f("Supersérie %@", letter)).font(.caption.weight(.semibold)).foregroundStyle(Palette.indigo)
                .padding(.horizontal, 10).frame(height: 24)
                .overlay { Capsule().stroke(Palette.indigo, lineWidth: 1) }
        }
    }

    private func previousLetter(_ i: Int) -> String? {
        i > 0 ? ExerciseOrder.letter(day.exercises[i - 1].superset) : nil
    }

    /// "1 of 3 sets done" once begun, else "3 × 12".
    private func detail(_ exercise: GymExercise) -> String {
        if exercise.doneCount > 0 {
            return L10n.f("%@ z %@ sérií hotovo", String(exercise.doneCount), String(exercise.workCount))
        }
        let reps = exercise.sets.first(where: \.work)?.plannedReps?.nilIfBlank
        return reps.map { "\(exercise.workCount) × " + $0 } ?? L10n.plural("%lld sérií", exercise.workCount)
    }

    /// Not started, or the one under way (its sets left go round with the others:
    /// Petr 2026-11-24, after set 1 of 3), in no superset yet.
    private func pickable(_ i: Int) -> Bool {
        let exercise = day.exercises[i]
        // Warm-up sets count as begun too.
        return (!exercise.sets.contains(where: \.done) || exercise.name == currentName) && ExerciseOrder.letter(exercise.superset) == nil
    }

    private func footerButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Palette.ink.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
    }

    // MARK: Changes

    /// Minus and the handle only while editing, not while picking a superset.
    private var deleteAction: ((IndexSet) -> Void)? { picking == nil ? { remove($0) } : nil }
    private var moveAction: ((IndexSet, Int) -> Void)? { picking == nil ? { move($0, $1) } : nil }

    private func remove(_ offsets: IndexSet) {
        let list = leftIndices
        // An exercise begun keeps its done sets in the record; only what is
        // left goes (608: the minus took the done sets with it).
        for offset in offsets.sorted(by: >) where list.indices.contains(offset) {
            if day.exercises[safe: list[offset]]?.sets.contains(where: \.done) == true {
                day.removeExercise(at: list[offset])
            } else {
                day.deleteExercise(at: list[offset])
            }
        }
    }

    /// The still-to-do list's move as a move in the whole day (List.onMove semantics).
    private func move(_ from: IndexSet, _ to: Int) {
        let list = leftIndices
        guard let source = from.first, list.indices.contains(source) else { return }
        let target = to < list.count ? list[to] : (list.last.map { $0 + 1 } ?? day.exercises.count)
        day.moveExercise(from: list[source], to: target)
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
    var title = "Přidat cvik"
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
        SheetFrame(title: title, fitted: false) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                    TextField(L10n.tr("Hledat cvik nebo stroj"), text: $query)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                .font(.body)
                .padding(.horizontal, 12).frame(height: 42)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        chip("Vše", muscle == nil) { muscle = nil }
                        ForEach(BodyFigure.choices, id: \.self) { id in
                            chip(BodyFigure.name(id), muscle == id) { muscle = muscle == id ? nil : id }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                // The whole catalog: rows are built as they scroll in.
                LazyVStack(spacing: 0) {
                    ForEach(Array(filtered.enumerated()), id: \.element.id) { index, ex in
                        if index > 0 { SettingsDivider() }
                        HStack(spacing: 8) {
                            Button { pick(ex); dismiss() } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                        Text([ex.muscle, ex.station].compactMap { $0?.nilIfBlank }.joined(separator: ", "))
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
                                .frame(minHeight: 52)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            ExerciseInfoButton(name: ex.name) { technique = ex.name }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .cardSurface(cornerRadius: 22)
            }
        }
        .glassSheetBackground()
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
    }

    private func chip(_ title: String, _ on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.footnote.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .tapTarget(width: 44, height: 30)
                .background(on ? Palette.button : Palette.track, in: Capsule())
        }
        .buttonStyle(.borderless)
    }
}
