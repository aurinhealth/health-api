import SwiftUI

/// Nastavení → Rychlé akce: what the menu on the app's icon offers (press and
/// hold Aurin on the home screen), up to four, in order. On the settings
/// cards: drag the handle to reorder, − hides, + adds while there is room.
struct QuickActionsSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(QuickAction.storageKey) private var stored = QuickAction.defaults.joined(separator: ",")

    private var shown: [QuickAction] { QuickAction.list(stored) }
    private var hidden: [QuickAction] { QuickAction.all.filter { !shown.contains($0) } }
    private var full: Bool { shown.count >= QuickAction.limit }

    var body: some View {
        SettingsPage(title: "Rychlé akce") {
            SettingsGroup(title: L10n.f("Na ikoně · %d ze %d", shown.count, QuickAction.limit)) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, action in
                    if i > 0 { SettingsDivider() }
                    HStack(spacing: 0) {
                        SettingsGrip()
                        row(action) {
                            withAnimation(.snappy) { save(shown.filter { $0 != action }) }
                        }
                        .padding(.leading, -4)
                    }
                    .contentShape(Rectangle())
                    .modifier(SettingsReorder(id: action.id, accepts: shown.map(\.id)) { moved in move(moved, to: action) })
                }
            }
            if !hidden.isEmpty {
                SettingsGroup(title: "Další") {
                    ForEach(Array(hidden.enumerated()), id: \.element.id) { i, action in
                        if i > 0 { SettingsDivider() }
                        row(action, adding: true) {
                            withAnimation(.snappy) { save(shown + [action]) }
                        }
                    }
                }
            }
        }
    }

    /// Symbol, name, and a quiet − (on the icon) or + (green while there is room).
    private func row(_ action: QuickAction, adding: Bool = false, tap: @escaping () -> Void) -> some View {
        let enabled = !adding || !full
        return HStack(spacing: 12) {
            Image(systemName: action.symbol)
                .scaledFont(17, cap: .denseCap)
                .foregroundStyle(Palette.ink)
                .frame(width: 26)
                .accessibilityHidden(true)
            Text(L10n.tr(action.title)).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Button(action: tap) {
                Image(systemName: adding ? "plus" : "minus")
                    .scaledFont(12, weight: .bold, cap: .denseCap)
                    .foregroundStyle(adding && enabled ? Palette.onAccent : Palette.muted)
                    .frame(width: 26, height: 26)
                    .background(adding && enabled ? Palette.green : Palette.track, in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!enabled)
            .accessibilityLabel(L10n.f(adding ? "Přidat %@" : "Odebrat %@", L10n.tr(action.title)))
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .frame(minHeight: 52)
    }

    /// Puts `moved` where `target` is.
    private func move(_ moved: String, to target: QuickAction) {
        var list = shown
        guard let from = list.firstIndex(where: { $0.id == moved }), let to = list.firstIndex(of: target), from != to else { return }
        withAnimation(.snappy) {
            let item = list.remove(at: from)
            list.insert(item, at: to)
            save(list)
        }
    }

    private func save(_ list: [QuickAction]) {
        stored = list.map(\.id).joined(separator: ",")
        QuickActions.update(model.today)
    }
}
