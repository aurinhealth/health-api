import SwiftUI

/// Nastavení → Cíle → Sporty: the sports the coach suggests and the main ones
/// (SportsPicker), the one place to turn back on what ⋯ → "Nenavrhovat kolo"
/// or a word to the coach turned off, and what Aktivita dne suggests less often.
struct SportsSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var choice = SportsChoice()
    @State private var original = SportsChoice()
    @State private var swims100: Bool?
    @State private var originalSwims: Bool?
    @State private var less: [String] = []
    @State private var error: String?
    @State private var filled = false

    init(store: SettingsStore) {
        self.store = store
        let saved = SportsChoice(profile: store.profile)
        _choice = State(initialValue: saved)
        _original = State(initialValue: saved)
    }

    var body: some View {
        SettingsPage(title: "Sporty k navrhování") {
            if let message = error ?? store.errorMessage { Text(message).font(Typo.small).foregroundStyle(Palette.rust) }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Kouč navrhuje")
                SportsPicker(choice: $choice)
                Text("Platí pro aktivitu dne, týdenní plán i kouče. Tréninky, které si přidáš sám nebo přijdou z hodinek, se ukazují dál.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if choice.swims { SwimLevelGroup(swims100: $swims100) }
            if !less.isEmpty {
                SettingsGroup(title: "Navrhuji méně často") {
                    ForEach(Array(less.enumerated()), id: \.element) { index, kind in
                        if index > 0 { SettingsDivider() }
                        HStack(spacing: 12) {
                            Text(CoachPick.name(kind)).font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Button("Doporučovat znovu") { Task { await again(kind) } }
                                .font(.subheadline.weight(.medium)).foregroundStyle(Palette.green)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50)
                    }
                }
            }
        }
        .toolbar { SaveButton(enabled: (choice != original || swims100 != originalSwims) && !choice.kinds.isEmpty, saving: store.saving) { Task { await save() } } }
        .onAppear { if !filled { fill(); filled = true } }
        .task { await loadLess() }
    }

    private func fill() {
        choice = SportsChoice(profile: store.profile)
        original = choice
        if case .bool(let can)? = store.profile["swims100"] { swims100 = can }
        originalSwims = swims100
    }

    private func loadLess() async {
        guard !model.demo else { return }
        less = (try? await model.api.coachPick())?.less ?? CoachPick.stored?.less ?? []
    }

    private func save() async {
        var changes = choice.applied(to: [:])
        if let swims100, choice.swims { changes["swims100"] = .bool(swims100) }
        guard await store.saveProfile(changes) else { return }
        do { try await FocusSheet.saveSwimLevel(model.api, sports: choice, swims100: swims100 != originalSwims ? swims100 : nil) } catch { self.error = error.localizedDescription }
        fill()
        await model.refreshTraining()
        await model.reloadToday()
    }

    private func again(_ kind: String) async {
        guard !model.demo else { return }
        do {
            try await model.api.recommendLess(kind: kind, less: false)
            withAnimation { less.removeAll { $0 == kind } }
        } catch { self.error = error.localizedDescription }
    }
}
