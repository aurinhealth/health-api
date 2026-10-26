import SwiftUI

/// Nastavení → Rychlé akce: what the menu on the app's icon offers (press and
/// hold Aurin on the home screen), up to four, in order. Drag to reorder,
/// − hides, + adds while there is room.
struct QuickActionsSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(QuickAction.storageKey) private var stored = QuickAction.defaults.joined(separator: ",")

    private var shown: [QuickAction] { QuickAction.list(stored) }
    private var hidden: [QuickAction] { QuickAction.all.filter { !shown.contains($0) } }
    private var full: Bool { shown.count >= QuickAction.limit }

    var body: some View {
        List {
            Section {
                ForEach(shown) { action in row(action) }
                    .onMove { from, to in
                        var list = shown
                        list.move(fromOffsets: from, toOffset: to)
                        save(list)
                    }
                    .onDelete { offsets in
                        var list = shown
                        list.remove(atOffsets: offsets)
                        save(list)
                    }
            } header: {
                Text(L10n.f("Na ikoně · %d ze %d", shown.count, QuickAction.limit))
            }
            if !hidden.isEmpty {
                Section {
                    ForEach(hidden) { action in
                        HStack(spacing: 12) {
                            Button { withAnimation { save(shown + [action]) } } label: {
                                Image(systemName: "plus.circle.fill").font(.title3)
                                    .foregroundStyle(.white, full ? Palette.muted : Palette.green)
                            }
                            .buttonStyle(.plain)
                            .disabled(full)
                            .accessibilityLabel(L10n.f("Přidat %@", L10n.tr(action.title)))
                            row(action)
                        }
                    }
                } header: {
                    Text("Další")
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle(L10n.tr("Rychlé akce"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ action: QuickAction) -> some View {
        Label(L10n.tr(action.title), systemImage: action.symbol).foregroundStyle(Palette.ink)
    }

    private func save(_ list: [QuickAction]) {
        stored = list.map(\.id).joined(separator: ",")
        QuickActions.update(model.today)
    }
}
