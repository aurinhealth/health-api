import SwiftUI

// What the coach remembers about the athlete ("Nechci běhat, bolí mě koleno"):
// the list behind the chat's side panel, in four groups like WHOOP's My Memory,
// with the notes of the last days' chats, what no longer holds (Past) and the
// "Use memory" switch; and the line under an answer that says what the coach
// just remembered, forgot or rewrote, with "Zpět".

/// The list: tap to edit, swipe to delete, + for a new one.
struct CoachMemoryView: View {
    @Environment(AppModel.self) private var model
    @State private var screen = CoachMemoryScreen()
    @State private var loading = true
    @State private var error: String?
    @State private var editing: Editing?

    /// The sheet: an existing memory (`from`) or a new one.
    struct Editing: Identifiable {
        let id = UUID()
        let from: CoachMemory?
    }

    var body: some View {
        List {
            ForEach(CoachMemoryGroup.allCases) { group in
                let items = screen.memories.filter { ($0.group ?? CoachMemoryGroup.training.rawValue) == group.rawValue }
                if !items.isEmpty {
                    Section(group.title) {
                        ForEach(items) { memory in
                            Button { editing = Editing(from: memory) } label: { MemoryRow(memory: memory) }
                                .buttonStyle(.plain)
                                .listRowBackground(Palette.card)
                        }
                        .onDelete { offsets in
                            let texts = offsets.map { items[$0].text }
                            screen.memories.removeAll { texts.contains($0.text) }
                            Task { for text in texts { await run(["forget": .string(text)]) } }
                        }
                    }
                }
            }
            if !loading && screen.memories.isEmpty {
                Section {
                    Text("Kouč si zatím nic nepamatuje.").foregroundStyle(Palette.muted)
                        .listRowBackground(Palette.card)
                }
            }
            if !screen.recentChats.isEmpty {
                Section("Nedávné chaty") {
                    ForEach(screen.recentChats) { note in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(verbatim: note.note).font(.body).foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Text(Fmt.dayMonthShort(note.day)).font(.subheadline).foregroundStyle(Palette.faint)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Palette.card)
                    }
                    .onDelete { offsets in
                        let days = offsets.map { screen.recentChats[$0].day }
                        screen.recentChats.removeAll { days.contains($0.day) }
                        Task { for day in days { await run(["forgetNote": .string(day)]) } }
                    }
                }
            }
            Section {
                if !screen.pastMemories.isEmpty {
                    NavigationLink {
                        PastMemoriesView(past: screen.pastMemories) { text in await run(["forgetPast": .string(text)]); return screen.pastMemories }
                    } label: {
                        HStack {
                            Text("Minulé").foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: "\(screen.pastMemories.count)").foregroundStyle(Palette.faint)
                        }
                    }
                    .listRowBackground(Palette.card)
                }
                Toggle("Používat paměť", isOn: Binding(get: { !screen.memoryOff }, set: { on in
                    screen.memoryOff = !on
                    Task { await run(["memoryOff": .bool(!on)]) }
                }))
                .tint(Palette.green)
                .listRowBackground(Palette.card)
                .disabled(model.demo)
            }
            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background { Palette.settingsBackground.ignoresSafeArea() }
        .navigationTitle(L10n.tr("Co si kouč pamatuje"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { editing = Editing(from: nil) } label: { Image(systemName: "plus") }
                    .accessibilityLabel(L10n.tr("Přidat"))
                    .disabled(model.demo)
            }
        }
        .sheet(item: $editing) { e in
            CoachMemoryEditor(original: e.from?.text, originalGroup: e.from?.group ?? CoachMemoryGroup.training.rawValue) { text, group in
                if let from = e.from {
                    if text != from.text {
                        await run(["edit": .object(["from": .string(from.text), "to": .string(text), "group": .string(group)])])
                    } else {
                        await run(["regroup": .object(["text": .string(from.text), "group": .string(group)])])
                    }
                } else {
                    await run(["memory": .string(text), "group": .string(group)])
                }
            } delete: {
                if let from = e.from { await run(["forget": .string(from.text)]) }
            }
        }
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            do { screen = try await model.api.coachMemoryScreen() } catch { self.error = error.localizedDescription }
        }
    }

    /// Every change answers with the screen as the server keeps it.
    private func run(_ body: [String: JSONValue]) async {
        do {
            screen = try await model.api.changeMemoryScreen(body)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One memory: its text and New or Updated for a week after the coach changed it.
private struct MemoryRow: View {
    let memory: CoachMemory

    var body: some View {
        HStack(spacing: 10) {
            Text(memory.text).font(.body).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if memory.badge == "new" {
                Pill(text: L10n.tr("Nové"))
            } else if memory.badge == "updated" {
                Pill(text: L10n.tr("Upraveno"), foreground: Palette.amber, background: Palette.amberSoft)
            }
            Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// What no longer holds (a pain that passed): the coach knows it, swipe to erase.
struct PastMemoriesView: View {
    @State var past: [CoachMemoryScreen.PastMemory]
    var forget: (String) async -> [CoachMemoryScreen.PastMemory]

    var body: some View {
        List {
            Section {
                ForEach(past) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(verbatim: item.text).font(.body).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        if let ended = item.ended {
                            Text(Fmt.dayMonthShort(ended)).font(.subheadline).foregroundStyle(Palette.faint)
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(Palette.card)
                }
                .onDelete { offsets in
                    let texts = offsets.map { past[$0].text }
                    past.removeAll { texts.contains($0.text) }
                    Task { for text in texts { past = await forget(text) } }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background { Palette.settingsBackground.ignoresSafeArea() }
        .navigationTitle(L10n.tr("Minulé"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Editing one memory with its group, or writing a new one.
struct CoachMemoryEditor: View {
    @Environment(\.dismiss) private var dismiss
    let original: String?
    var originalGroup = CoachMemoryGroup.training.rawValue
    var save: (String, String) async -> Void
    var delete: () async -> Void
    @State private var text = ""
    @State private var group = CoachMemoryGroup.training.rawValue
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 8) {
                    ForEach(CoachMemoryGroup.allCases) { g in
                        Button { group = g.rawValue } label: {
                            Text(g.title).font(.subheadline.weight(.medium))
                                .foregroundStyle(group == g.rawValue ? Palette.onButton : Palette.secondary)
                                .padding(.horizontal, 14).frame(height: 34)
                                .background(group == g.rawValue ? Palette.button : Palette.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(group == g.rawValue ? .isSelected : [])
                    }
                }
                TextField("Co si má kouč pamatovat", text: $text, axis: .vertical)
                    .lineLimit(3...6)
                    .focused($focused)
                    .padding(.horizontal, 16).padding(.vertical, 14)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if original != nil {
                    Button(role: .destructive) {
                        Task { await delete(); dismiss() }
                    } label: {
                        Text("Smazat").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
                }
                Spacer()
            }
            .padding(20)
            .background { Palette.settingsBackground.ignoresSafeArea() }
            .navigationTitle(L10n.tr(original == nil ? "Přidat" : "Upravit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Uložit") {
                        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task { await save(value, group); dismiss() }
                    }
                    .fontWeight(.semibold)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (text == original && group == originalGroup))
                }
            }
            .onAppear { text = original ?? ""; group = originalGroup; focused = original == nil }
        }
        .presentationDetents([.medium])
    }
}

/// "Zapamatováno, Zpět" under an answer.
struct MemoryChipView: View {
    let chip: CoachMemoryChip
    var undo: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: chip.undone ? "arrow.uturn.backward" : chip.kept ? "checkmark" : symbol)
                .scaledFont(12, weight: .bold)
            Text(label).font(.footnote.weight(.medium)).lineLimit(2)
            if !chip.undone && !chip.kept {
                Button(action: undo) {
                    Text("Zpět").font(.footnote.weight(.medium)).foregroundStyle(Palette.muted)
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
            }
        }
        .foregroundStyle(chip.undone || chip.kept ? Palette.muted : Palette.green)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background((chip.undone || chip.kept ? Palette.card : Palette.greenSoft), in: Capsule())
    }

    private var symbol: String {
        switch chip.kind {
        case .saved: return "checkmark"
        case .forgotten: return "xmark"
        case .updated: return "pencil"
        case .sportOff: return "nosign"
        }
    }

    private var label: String {
        if chip.undone { return L10n.tr("Vráceno") }
        if chip.kept { return L10n.tr("Ponecháno") }
        switch chip.kind {
        case .saved: return chip.showsText ? L10n.f("Zapamatováno: %@", chip.text) : L10n.tr("Zapamatováno")
        case .forgotten: return L10n.f("Zapomenuto: %@", chip.text)
        case .updated: return L10n.f("Upraveno: %@", chip.text)
        case .sportOff: return PickMenuText.never(chip.text == "strength" ? "gym" : chip.text)
        }
    }
}

/// "Zapomenout tohle?" or "Přepsat tohle?" under an answer: the coach proposes,
/// the memory changes only when the athlete confirms.
struct MemoryProposalCard: View {
    let chip: CoachMemoryChip
    var decide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Image(systemName: chip.kind == .updated ? "pencil" : "xmark").scaledFont(12, weight: .bold)
                Text(chip.kind == .updated ? "Přepsat tohle?" : "Zapomenout tohle?").font(.subheadline.weight(.semibold))
            }
            if chip.kind == .updated, let from = chip.from {
                Text(verbatim: from).font(Typo.caption).foregroundStyle(Palette.muted).strikethrough()
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: chip.text).font(Typo.caption).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(verbatim: chip.text).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Button { decide(true) } label: {
                    Text(chip.kind == .updated ? "Přepsat" : "Zapomenout").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 16).frame(height: 34).background(Palette.button, in: Capsule())
                }
                Button { decide(false) } label: {
                    Text("Nechat").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 16).frame(height: 34).overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                }
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Palette.ink.opacity(0.1), lineWidth: 1) }
    }
}
