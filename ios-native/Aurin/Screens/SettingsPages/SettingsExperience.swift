import SwiftUI

// Zkušenost: the level per sport (cycling, running, gym) that the workouts are
// made for. "Auto" follows up to two years of history (src/training-history.js);
// a chosen level stays until it is set back to Auto.

/// One sport's experience from /app/api/gym/preferences (experienceBySport).
struct SportExperience: Decodable, Equatable {
    let mode: String
    let level: String
    let autoLevel: String
}

/// The group in Profil, under the personal details: Kolo, Běh, Posilovna
/// (the order of the workout library).
struct ExperienceGroup: View {
    @Environment(AppModel.self) private var model
    @State private var levels: [String: SportExperience] = [:]
    @State private var error: String?

    static let sports = [("ride", "Kolo"), ("run", "Běh"), ("strength", "Posilovna")]
    static let names = [("beginner", "Začátečník"), ("regular", "Mírně pokročilý"), ("experienced", "Pokročilý")]
    static func name(_ level: String) -> String { L10n.tr(names.first { $0.0 == level }?.1 ?? "Začátečník") }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SettingsGroup(title: "Zkušenost", footer: "Auto vychází z tréninků za poslední dva roky. Pauza kvůli nemoci nebo zranění úroveň nesníží.") {
                ForEach(Self.sports.indices, id: \.self) { i in
                    if i > 0 { SettingsDivider() }
                    row(Self.sports[i].0, title: Self.sports[i].1)
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
    }

    private func row(_ sport: String, title: String) -> some View {
        let current = levels[sport] ?? SportExperience(mode: "auto", level: "beginner", autoLevel: "beginner")
        return HStack(spacing: 12) {
            Text(title).font(.body).foregroundStyle(Palette.ink).layoutPriority(1)
            Spacer(minLength: 8)
            Menu {
                option(L10n.f("Auto · %@", Self.name(current.autoLevel)), selected: current.mode == "auto") { choose(sport, "auto") }
                ForEach(Self.names, id: \.0) { level in
                    option(L10n.tr(level.1), selected: current.mode == "manual" && current.level == level.0) { choose(sport, level.0) }
                }
            } label: {
                HStack(spacing: 4) {
                    Group {
                        if current.mode == "auto" {
                            Text(verbatim: "Auto · ").foregroundColor(Palette.faint) + Text(verbatim: Self.name(current.autoLevel)).foregroundColor(Palette.muted)
                        } else {
                            Text(Self.name(current.level)).foregroundStyle(Palette.muted)
                        }
                    }
                    .font(.subheadline).lineLimit(1).truncationMode(.tail)
                    Image(systemName: "chevron.up.chevron.down").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                }
            }
            .disabled(levels.isEmpty && !model.demo)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 50)
    }

    @ViewBuilder private func option(_ text: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if selected { Label(text, systemImage: "checkmark") } else { Text(verbatim: text) }
        }
    }

    private func load() async {
        guard !model.demo, levels.isEmpty else { return }
        do { levels = try await model.api.gymPreferences().experienceBySport ?? [:] } catch { self.error = error.localizedDescription }
    }

    private func choose(_ sport: String, _ value: String) {
        guard !model.demo else { return }
        let current = levels[sport]
        if current?.mode == "auto" && value == "auto" || current?.mode == "manual" && current?.level == value { return }
        Task {
            do {
                let prefs = try await model.api.saveGymPreferences(["experienceBySport": .object([sport: .string(value)])])
                levels = prefs.experienceBySport ?? levels; error = nil
            } catch { self.error = error.localizedDescription }
        }
    }
}

/// Posilovna → Trénink na míru: the experience lives in Profil; this page shows the same group.
struct ExperienceSettingsView: View {
    var body: some View {
        SettingsPage(title: "Zkušenost") { ExperienceGroup() }
    }
}
