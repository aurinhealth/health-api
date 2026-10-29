import SwiftUI

/// Training → a done activity → ⋯ → Změnit typ aktivity: a walk the watch
/// logged as a run. Favourites first (the star), then every sport A–Z, with
/// search. Intervals.icu gets the change; Google Health and Apple Health let
/// only the app that recorded a workout change it (src/activity-type.js).
struct ActivityTypeSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The activity's id in the calendar (its external id on the server).
    let activityId: String
    /// Its type now (Intervals.icu's name, e.g. "Run"), when known.
    let current: String?
    /// "google-wearables" or "apple-health": the change stays in the app.
    let source: String?
    var onSaved: () -> Void = {}
    @State private var types: [ActivityTypeOption] = []
    @State private var chosen: String?
    @State private var query = ""
    @State private var saving = false
    @State private var error: String?
    @AppStorage("favoriteActivityTypes") private var favoritesText = "Run,Walk,Ride,WeightTraining"

    private var favorites: [String] { favoritesText.split(separator: ",").map(String.init) }
    private var sorted: [ActivityTypeOption] {
        types.sorted { a, b in
            // "Jiné" (Workout) last, the rest by name.
            if (a.type == "Workout") != (b.type == "Workout") { return b.type == "Workout" }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }
    private var found: [ActivityTypeOption] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? sorted : sorted.filter { $0.name.localizedStandardContains(q) || $0.type.localizedStandardContains(q) }
    }
    private var footer: String? {
        switch source {
        case "google-wearables": return L10n.tr("Google Health dovolí změnu jen ve své aplikaci.")
        case "apple-health": return L10n.tr("Apple Health dovolí změnu jen v aplikaci, která trénink zapsala.")
        default: return nil
        }
    }

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                        TextField(L10n.tr("Hledat sport"), text: $query)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                    .font(.body)
                    .padding(.horizontal, 12).frame(height: 42)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    if types.isEmpty && error == nil {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                    } else if query.trimmingCharacters(in: .whitespaces).isEmpty {
                        let favs = favorites.compactMap { f in types.first { $0.type == f } }
                        if !favs.isEmpty { group(favs, title: L10n.tr("Oblíbené")) }
                        group(sorted, title: L10n.tr("Všechny sporty"))
                    } else {
                        group(found, title: nil)
                    }
                    if let footer { Text(footer).font(Typo.caption).foregroundStyle(Palette.muted) }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
                .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 40)
            }
            .background(Palette.settingsBackground.ignoresSafeArea())
            .navigationTitle(L10n.tr("Typ aktivity"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await save() } } label: { Text("Uložit").fontWeight(.semibold) }
                        .disabled(saving || chosen == nil || chosen == current)
                }
            }
        }
        .tint(Palette.ink)
        .task { await load() }
    }

    private func group(_ list: [ActivityTypeOption], title: String?) -> some View {
        SettingsGroup(title: title) {
            ForEach(Array(list.enumerated()), id: \.element.id) { index, option in
                if index > 0 { SettingsDivider() }
                row(option)
            }
        }
    }

    private func row(_ option: ActivityTypeOption) -> some View {
        let favorite = favorites.contains(option.type)
        return HStack(spacing: 12) {
            Button { chosen = option.type } label: {
                HStack(spacing: 12) {
                    Image(systemName: SportIcon.symbol(option.group, type: option.type)).scaledFont(16, cap: .denseCap).frame(width: 24)
                    Text(verbatim: option.name).font(.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 6)
                    if chosen == option.type {
                        Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(chosen == option.type ? .isSelected : [])
            Button { toggleFavorite(option.type) } label: {
                Image(systemName: favorite ? "star.fill" : "star")
                    .scaledFont(17, cap: .denseCap).foregroundStyle(favorite ? Palette.amber : Palette.faint)
                    .frame(width: 32, height: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr(favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"))
        }
        .padding(.horizontal, 16).frame(minHeight: 50)
    }

    private func toggleFavorite(_ type: String) {
        var list = favorites
        if let i = list.firstIndex(of: type) { list.remove(at: i) } else { list.append(type) }
        favoritesText = list.joined(separator: ",")
    }

    private func load() async {
        chosen = current
        guard types.isEmpty else { return }
        do { types = try await model.api.activityTypes() } catch { self.error = error.localizedDescription }
    }

    private func save() async {
        guard let chosen, !model.demo else { dismiss(); return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let change = try await model.api.changeActivityType(id: activityId, type: chosen)
            if let key = change.key { await AppleHealthExport.shared.changeWorkoutType(key: key, type: chosen) }
            await model.activityTypeChanged()
            dismiss()
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
