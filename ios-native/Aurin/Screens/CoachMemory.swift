import SwiftUI

// What the coach remembers about the athlete ("Nechci běhat, bolí mě koleno"):
// the list behind the chat's ⋯ menu, and the line under an answer that says
// what the coach just remembered, forgot or rewrote, with "Zpět".

/// The list: tap to edit, swipe to delete, "Přidat" for a new one.
struct CoachMemoryView: View {
    @Environment(AppModel.self) private var model
    @State private var memories: [CoachMemory] = []
    @State private var loading = true
    @State private var error: String?
    @State private var editing: Editing?

    /// The sheet: an existing memory (`from`) or a new one.
    struct Editing: Identifiable {
        let id = UUID()
        let from: String?
    }

    var body: some View {
        List {
            Section {
                ForEach(memories) { memory in
                    Button { editing = Editing(from: memory.text) } label: {
                        HStack(spacing: 12) {
                            Text(memory.text).font(.body).foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Palette.card)
                }
                .onDelete { offsets in
                    let texts = offsets.map { memories[$0].text }
                    memories.remove(atOffsets: offsets)
                    Task { for text in texts { await run { try await model.api.forgetMemory(text) } } }
                }
                if !loading && memories.isEmpty {
                    Text("Kouč si zatím nic nepamatuje.").foregroundStyle(Palette.muted)
                        .listRowBackground(Palette.card)
                }
            }
            Section {
                Button { editing = Editing(from: nil) } label: {
                    Label("Přidat", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity)
                }
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
        .sheet(item: $editing) { e in
            CoachMemoryEditor(original: e.from) { text in
                if let from = e.from {
                    await run { try await model.api.editMemory(from: from, to: text) }
                } else {
                    await run { try await model.api.addMemory(text) }
                }
            } delete: {
                if let from = e.from { await run { try await model.api.forgetMemory(from) } }
            }
        }
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            await run { try await model.api.coachMemories() }
        }
    }

    /// Every change answers with the list as the server keeps it.
    private func run(_ call: () async throws -> [CoachMemory]) async {
        do {
            memories = try await call()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Editing one memory, or writing a new one.
struct CoachMemoryEditor: View {
    @Environment(\.dismiss) private var dismiss
    let original: String?
    var save: (String) async -> Void
    var delete: () async -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
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
                        Task { await save(value); dismiss() }
                    }
                    .fontWeight(.semibold)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text == original)
                }
            }
            .onAppear { text = original ?? ""; focused = true }
        }
        .presentationDetents([.medium])
    }
}

/// "Zapamatováno · Zpět" under an answer.
struct MemoryChipView: View {
    let chip: CoachMemoryChip
    var undo: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: chip.undone ? "arrow.uturn.backward" : symbol)
                .scaledFont(12, weight: .bold)
            Text(label).font(.footnote.weight(.medium)).lineLimit(2)
            if !chip.undone {
                Button(action: undo) {
                    Text("Zpět").font(.footnote.weight(.medium)).foregroundStyle(Palette.muted)
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
            }
        }
        .foregroundStyle(chip.undone ? Palette.muted : Palette.green)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background((chip.undone ? Palette.card : Palette.greenSoft), in: Capsule())
    }

    private var symbol: String {
        switch chip.kind {
        case .saved: return "checkmark"
        case .forgotten: return "xmark"
        case .updated: return "pencil"
        }
    }

    private var label: String {
        if chip.undone { return L10n.tr("Vráceno") }
        switch chip.kind {
        case .saved: return chip.showsText ? L10n.f("Zapamatováno: %@", chip.text) : L10n.tr("Zapamatováno")
        case .forgotten: return L10n.f("Zapomenuto: %@", chip.text)
        case .updated: return L10n.f("Upraveno: %@", chip.text)
        }
    }
}
