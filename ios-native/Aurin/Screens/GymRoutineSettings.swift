import SwiftUI

// Nastavení → Posilovna → Rozcvička / Protažení: what a workout gets by default
// (automatic, one of the athlete's own, or nothing), the automatic one's length,
// and the own warm-ups and stretchings (src/stretching.js normalizeMyRoutines).

extension GymPreferences.MyRoutine {
    /// As the server saves it.
    var json: JSONValue {
        .object(["id": .string(id), "name": .string(name), "items": .array(items.map(\.json))])
    }

    /// Roughly as the server counts it: each hold and 5 s to move on.
    var estimatedMinutes: Int {
        let seconds = items.reduce(0) { $0 + ($1.seconds + 5) * ($1.sides == true ? 2 : 1) }
        return max(1, Int((Double(seconds) / 60).rounded(.up)))
    }
}

struct GymRoutineSettingsView: View {
    let kind: GymRoutineKind
    @Environment(AppModel.self) private var model
    @State private var prefs: GymPreferences?
    @State private var error: String?

    private var on: Bool { prefs?.isOn(kind) ?? true }
    private var current: String? { prefs?.routine(kind) }
    private var mine: [GymPreferences.MyRoutine] { prefs?.routines(kind) ?? [] }

    var body: some View {
        SettingsPage(title: kind.title) {
            SettingsGroup(title: "Ve výchozím stavu") {
                choice(L10n.tr("Automaticky"), selected: on && current == nil) {
                    save([kind.id: .bool(true), kind.id + "Routine": .string("auto")])
                }
                ForEach(mine) { own in
                    SettingsDivider()
                    choice(own.name, value: own.minutes.map { "\($0) min" }, selected: on && current == own.id) {
                        save([kind.id: .bool(true), kind.id + "Routine": .string(own.id)])
                    }
                }
                SettingsDivider()
                choice(L10n.tr("Vypnuto"), selected: !on) { save([kind.id: .bool(false)]) }
            }
            if on && current == nil {
                SettingsGroup {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Délka").font(.body).foregroundStyle(Palette.ink)
                        Picker("Délka", selection: Binding(get: { prefs?.length(kind) ?? 0 }, set: { value in
                            save([kind.id + "Length": value == 0 ? .string("auto") : .number(Double(value))])
                        })) {
                            ForEach(GymRoutineSheet.lengths, id: \.self) { m in
                                Text(verbatim: m == 0 ? L10n.tr("Auto") : "\(m) min").tag(m)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(16)
                }
            }
            SettingsGroup(title: kind == .warmup ? "Moje rozcvičky" : "Moje protažení") {
                ForEach(mine) { own in
                    NavigationLink { editor(own) } label: {
                        SettingsRow(title: own.name, value: own.minutes.map { "\($0) min" })
                    }
                    .buttonStyle(.plain)
                    SettingsDivider()
                }
                NavigationLink { editor(nil) } label: {
                    Label { Text(kind == .warmup ? "Nová rozcvička" : "Nové protažení") } icon: { Image(systemName: "plus") }
                        .font(.body).foregroundStyle(Palette.green)
                        .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                        .padding(.horizontal, 18)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
    }

    private func editor(_ routine: GymPreferences.MyRoutine?) -> some View {
        GymRoutineEditorView(kind: kind, routine: routine, all: mine) { list in
            save(["myRoutines": .object([kind.id: .array(list.map(\.json))])])
        }
    }

    private func choice(_ title: String, value: String? = nil, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(verbatim: title).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                if let value { Text(verbatim: value).font(.subheadline).foregroundStyle(Palette.muted) }
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.amber)
                }
            }
            .padding(.horizontal, 18).frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func load() async {
        guard !model.demo else { return }
        do { prefs = try await model.api.gymPreferences(); error = nil } catch { self.error = error.localizedDescription }
    }

    private func save(_ change: JSONObject) {
        guard !model.demo else { return }
        Task {
            do { prefs = try await model.api.saveGymPreferences(change); error = nil } catch { self.error = error.localizedDescription }
        }
    }
}

/// One own warm-up or stretching: its name and moves (from the catalog or the
/// athlete's own), dragged into order or swiped away. Uložit saves the list.
struct GymRoutineEditorView: View {
    let kind: GymRoutineKind
    let all: [GymPreferences.MyRoutine]
    let onSave: ([GymPreferences.MyRoutine]) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @State private var routine: GymPreferences.MyRoutine
    private let isNew: Bool
    @State private var library: GymRoutineMoves?
    @State private var picking = false
    @State private var writing = false
    @State private var confirmDelete = false

    init(kind: GymRoutineKind, routine: GymPreferences.MyRoutine?, all: [GymPreferences.MyRoutine], onSave: @escaping ([GymPreferences.MyRoutine]) -> Void) {
        self.kind = kind
        self.all = all
        self.onSave = onSave
        isNew = routine == nil
        _routine = State(initialValue: routine ?? GymPreferences.MyRoutine(id: kind.id + "-" + String(UUID().uuidString.prefix(8)).lowercased(), name: "", minutes: nil, items: []))
    }

    var body: some View {
        List {
            Section {
                TextField(L10n.tr("Název"), text: $routine.name)
                    .textInputAutocapitalization(.sentences)
            }
            Section {
                ForEach(Array(routine.items.enumerated()), id: \.offset) { _, item in
                    HStack(spacing: 8) {
                        Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(verbatim: item.duration).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                }
                .onMove { routine.items.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { routine.items.remove(atOffsets: $0) }
                Button { picking = true } label: {
                    Label("Přidat z knihovny", systemImage: "plus.circle.fill").foregroundStyle(Palette.green)
                }
                .disabled(library == nil && !model.demo)
                Button { writing = true } label: {
                    Label("Přidat vlastní", systemImage: "plus.circle.fill").foregroundStyle(Palette.green)
                }
            } header: {
                HStack {
                    Text("Cviky")
                    Spacer()
                    if !routine.items.isEmpty { Text(verbatim: "\(routine.estimatedMinutes) min") }
                }
            }
            if !isNew {
                Section {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Text(kind == .warmup ? "Smazat rozcvičku" : "Smazat protažení")
                    }
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle(routine.name.nilIfBlank ?? L10n.tr(kind == .warmup ? "Nová rozcvička" : "Nové protažení"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Uložit") { save() }.fontWeight(.semibold).disabled(routine.items.isEmpty)
            }
        }
        .confirmationDialog(Text(kind == .warmup ? "Smazat rozcvičku" : "Smazat protažení"), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) {
                onSave(all.filter { $0.id != routine.id })
                dismiss()
            }
        }
        .sheet(isPresented: $picking) {
            GymRoutineLibrarySheet(moves: library?.moves(kind) ?? []) { move in
                routine.items.append(GymPreferences.MyItem(move: move.id, name: move.name, seconds: move.seconds, sides: move.sides))
            }
        }
        .sheet(isPresented: $writing) {
            GymOwnMoveSheet { item in routine.items.append(item) }
        }
        .task {
            guard !model.demo, library == nil else { return }
            library = try? await model.api.gymRoutineMoves()
        }
    }

    private func save() {
        var saved = routine
        if saved.name.trimmingCharacters(in: .whitespaces).isEmpty {
            saved.name = L10n.tr(kind == .warmup ? "Moje rozcvička" : "Moje protažení") + (all.isEmpty ? "" : " \(all.count + 1)")
        }
        var list = all
        if let i = list.firstIndex(where: { $0.id == saved.id }) { list[i] = saved } else { list.append(saved) }
        onSave(list)
        dismiss()
    }
}

/// Přidat z knihovny: the catalog's moves to search, a tap adds one.
struct GymRoutineLibrarySheet: View {
    let moves: [GymRoutineMoves.Move]
    let onPick: (GymRoutineMoves.Move) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var shown: [GymRoutineMoves.Move] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? moves : moves.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            List(shown) { move in
                Button { onPick(move); dismiss() } label: {
                    HStack(spacing: 8) {
                        Text(verbatim: move.name).font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 6)
                        Text(verbatim: GymPreferences.MyItem(move: move.id, name: move.name, seconds: move.seconds, sides: move.sides).duration)
                            .font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .searchable(text: $query, prompt: Text("Hledat"))
            .navigationTitle(Text("Přidat z knihovny"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } } }
        }
    }
}

/// Přidat vlastní: any move with a name, a time and whether it goes on each side.
struct GymOwnMoveSheet: View {
    let onAdd: (GymPreferences.MyItem) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var seconds = 60
    @State private var sides = false

    private var item: GymPreferences.MyItem { GymPreferences.MyItem(move: nil, name: name.trimmingCharacters(in: .whitespaces), seconds: seconds, sides: sides) }

    var body: some View {
        NavigationStack {
            Form {
                TextField(L10n.tr("Název"), text: $name)
                    .textInputAutocapitalization(.sentences)
                Stepper(value: $seconds, in: 5...1800, step: seconds < 60 ? 5 : 30) {
                    HStack {
                        Text("Čas")
                        Spacer()
                        Text(verbatim: GymPreferences.MyItem(move: nil, name: "", seconds: seconds, sides: false).duration).monospacedDigit()
                    }
                }
                Toggle("Na každou stranu", isOn: $sides)
            }
            .navigationTitle(Text("Vlastní cvik"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Přidat") { onAdd(item); dismiss() }.disabled(item.name.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
