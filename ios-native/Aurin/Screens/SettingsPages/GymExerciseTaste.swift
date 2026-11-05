import SwiftUI

/// Nastavení → Posilovna → Cviky: the exercises with a thumb (after a workout,
/// at a gym's machine, or "I příště" for a swap). The plans leave out the
/// disliked ones and prefer the liked ones (src/exercise-feedback.js); tapping
/// the thumb that is on takes it off.
struct GymExerciseTasteView: View {
    @Environment(AppModel.self) private var model
    @State private var catalog: [GymCatalogExercise] = []
    /// The thumbs as the page opened: the rows keep their group and place.
    @State private var opened: [String: Bool] = [:]
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Cviky") {
            let liked = catalog.filter { opened[$0.name] == true }, disliked = catalog.filter { opened[$0.name] == false }
            if loading && catalog.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if liked.isEmpty && disliked.isEmpty {
                Text("Zatím tu nic není. Palec dáš cviku po tréninku v Ohodnotit, nebo když ho vyměníš a zvolíš I příště.")
                    .font(.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                if !disliked.isEmpty { group("Nebaví mě", disliked, footer: "Plány je vynechají.") }
                if !liked.isEmpty { group("Baví mě", liked, footer: "Plány je dají o něco častěji.") }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
    }

    private func group(_ title: String, _ list: [GymCatalogExercise], footer: String) -> some View {
        SettingsGroup(title: title, footer: footer) {
            ForEach(list) { ex in
                if ex.id != list.first?.id { SettingsDivider() }
                row(ex)
            }
        }
    }

    private func row(_ ex: GymCatalogExercise) -> some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: ExerciseCatalog.shownName(ex.name)).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                if let muscle = ex.muscle?.nilIfBlank { Text(muscle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
            }
            Spacer(minLength: 8)
            thumb(ex, up: true)
            thumb(ex, up: false)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private func thumb(_ ex: GymCatalogExercise, up: Bool) -> some View {
        let on = ex.liked == up
        return Button { Task { await rate(ex, on ? nil : up) } } label: {
            Image(systemName: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .scaledFont(16, cap: .denseCap)
                .foregroundStyle(on ? (up ? Palette.green : Palette.rust) : Palette.muted)
                .frame(width: 38, height: 38)
                .background(on ? (up ? Palette.greenSoft : Palette.pinkSoft) : Palette.track, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(up ? "Baví mě" : "Nebaví mě"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func load() async {
        defer { loading = false }
        guard !model.demo else { return }
        do {
            catalog = try await model.api.gymExercises()
            opened = Dictionary(catalog.compactMap { ex in ex.liked.map { (ex.name, $0) } }) { a, _ in a }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Saved at once. An exercise whose thumb comes off or turns stays where
    /// it is until the page is opened again, so a tap by mistake can be put back.
    private func rate(_ ex: GymCatalogExercise, _ value: Bool?) async {
        guard let i = catalog.firstIndex(where: { $0.name == ex.name }) else { return }
        let old = catalog[i].liked
        catalog[i].liked = value
        guard !model.demo else { return }
        do {
            try await model.api.rateExercises([(exercise: ex.name, liked: value)])
            error = nil
        } catch {
            if let j = catalog.firstIndex(where: { $0.name == ex.name }) { catalog[j].liked = old }
            self.error = error.localizedDescription
        }
    }
}
