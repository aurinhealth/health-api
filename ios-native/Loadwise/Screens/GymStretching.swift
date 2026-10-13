import SwiftUI

// Trénink na míru (the gym goal, the experience, stretching at the end) and
// the stretching card at the end of a gym session (src/stretching.js).

/// The stretching the plan keeps in its sixth row: ["Protažení", "<json>"].
struct GymStretching: Decodable, Equatable {
    let minutes: Int
    let items: [Item]

    struct Item: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let seconds: Int
        let sides: Bool

        /// "2 × 30 s" (once per side) or "45 s".
        var duration: String { (sides ? "2 × " : "") + "\(seconds) s" }
    }

    static let row = 5

    init?(values: [[JSONValue]]) {
        guard values.count > Self.row, values[Self.row].count > 1, values[Self.row][0].string == "Protažení",
              let data = values[Self.row][1].string?.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(GymStretching.self, from: data), !parsed.items.isEmpty else { return nil }
        self = parsed
    }

    init(minutes: Int, items: [Item]) {
        self.minutes = minutes
        self.items = items
    }
}

/// Protažení: the stretches in order, each ticked when done (kept for the day).
struct StretchingCard: View {
    let stretching: GymStretching
    let date: String
    @AppStorage("gym.stretching.done") private var stored = ""

    private var done: Set<String> {
        let prefix = date + ":"
        return Set(stored.split(separator: ",").map(String.init).filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) })
    }

    var body: some View {
        Card {
            HStack(spacing: 10) {
                Image(systemName: "figure.flexibility").font(.system(size: 17, weight: .medium)).foregroundStyle(Palette.indigo)
                    .frame(width: 36, height: 36)
                    .background(Palette.indigo.opacity(0.14), in: Circle())
                    .accessibilityHidden(true)
                Text("Protažení").font(.headline).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: "\(stretching.minutes) min").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            VStack(spacing: 0) {
                ForEach(Array(stretching.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider().overlay(Palette.hairline) }
                    Button { toggle(item.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: done.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 21)).foregroundStyle(done.contains(item.id) ? Palette.green : Palette.faint)
                            Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink)
                                .strikethrough(done.contains(item.id), color: Palette.muted)
                            Spacer(minLength: 8)
                            Text(verbatim: item.duration).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        .frame(minHeight: 46)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(done.contains(item.id) ? .isSelected : [])
                }
            }
        }
    }

    /// Ticks or unticks a stretch; only the last week's days are kept.
    private func toggle(_ id: String) {
        var all = stored.split(separator: ",").map(String.init)
        let key = date + ":" + id
        if let i = all.firstIndex(of: key) { all.remove(at: i) } else { all.append(key) }
        let oldest = Calendar.current.date(byAdding: .day, value: -7, to: Date()).map { Self.isoDay.string(from: $0) } ?? ""
        stored = all.filter { String($0.prefix(10)) >= oldest }.joined(separator: ",")
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

// MARK: - Trénink na míru (GET/POST /app/api/gym/preferences, src/routes-gym.js)

struct GymPreferences: Decodable, Equatable {
    var goal: String
    /// "auto" or the chosen beginner / regular / experienced.
    var experience: String
    /// What the training history says while the experience is "auto".
    var autoExperience: String?
    var stretching: Bool
}

extension APIClient {
    func gymPreferences() async throws -> GymPreferences {
        try await get("/app/api/gym/preferences")
    }

    func saveGymPreferences(_ changes: JSONObject) async throws -> GymPreferences {
        try await send("/app/api/gym/preferences", method: "POST", body: changes)
    }
}

/// Cíl, Zkušenost and Protažení na konci: each saved as soon as it changes.
struct GymPreferencesGroup: View {
    @Environment(AppModel.self) private var model
    @State private var prefs: GymPreferences?
    @State private var goal = "auto"
    @State private var experience = "auto"
    @State private var stretching = true
    @State private var error: String?

    static let goals = [("auto", "Automaticky"), ("strength", "Síla"), ("muscle", "Svaly"), ("fitness", "Kondice")]
    static let levels = [("beginner", "začátečník"), ("regular", "pravidelně"), ("experienced", "zkušený")]

    var body: some View {
        SettingsGroup(title: "Trénink na míru") {
            SettingsPicker(title: "Cíl", selection: $goal, options: Self.goals)
            SettingsDivider()
            SettingsPicker(title: "Zkušenost", selection: $experience, options: experienceOptions)
            SettingsDivider()
            SettingsToggle(title: "Protažení na konci", isOn: $stretching)
        }
        .disabled(prefs == nil && !model.demo)
        .task { await load() }
        .onChange(of: goal) { _, value in save(["goal": .string(value)], unchanged: prefs?.goal == value) }
        .onChange(of: experience) { _, value in save(["experience": .string(value)], unchanged: prefs?.experience == value) }
        .onChange(of: stretching) { _, value in save(["stretching": .bool(value)], unchanged: prefs?.stretching == value) }
        if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
    }

    /// "automaticky · pravidelně": the level Aurin reads from the training history.
    private var experienceOptions: [(String, String)] {
        let guess = prefs?.autoExperience.flatMap { id in Self.levels.first { $0.0 == id }?.1 }
        let auto = guess.map { L10n.tr("automaticky") + " · " + L10n.tr($0) } ?? L10n.tr("automaticky")
        return [("auto", auto)] + Self.levels
    }

    private func load() async {
        guard !model.demo, prefs == nil else { return }
        do { apply(try await model.api.gymPreferences()) } catch { self.error = error.localizedDescription }
    }

    private func apply(_ value: GymPreferences) {
        prefs = value
        goal = value.goal
        experience = value.experience
        stretching = value.stretching
    }

    private func save(_ change: JSONObject, unchanged: Bool) {
        guard !model.demo, prefs != nil, !unchanged else { return }
        Task {
            do { apply(try await model.api.saveGymPreferences(change)); error = nil } catch { self.error = error.localizedDescription }
        }
    }
}
