import SwiftUI

/// The sports the athlete does and the main ones among them, as the profile
/// keeps them (src/athlete-focus.js: sports, mainSports and the single
/// mainSport the older parts read). The coach suggests only these sports.
struct SportsChoice: Equatable {
    /// Ride, Run, Swim, Gym: the sport order everywhere in the app.
    static let all = [("ride", "Kolo"), ("run", "Běh"), ("swim", "Plavání"), ("strength", "Posilovna")]
    private static let kindsOfMain = ["cycling": ["ride"], "running": ["run"], "swimming": ["swim"], "strength": ["strength"], "triathlon": ["ride", "run", "swim"]]

    var kinds: [String] = []
    var mains: [String] = []

    init(kinds: [String] = [], mains: [String] = []) {
        let ticked = Self.ordered(kinds)
        self.kinds = ticked
        self.mains = Self.ordered(mains).filter { ticked.contains($0) }
    }

    /// From the saved profile; a profile from before this list starts from its one main sport.
    init(profile: JSONObject) {
        let legacy = Self.kindsOfMain[profile["mainSport"]?.string ?? ""] ?? []
        let kinds = Self.list(profile["sports"]) ?? legacy
        self.init(kinds: kinds, mains: Self.list(profile["mainSports"]) ?? legacy)
    }

    /// "triathlon" for Main on Ride, Run and Swim; none is general fitness.
    var mainSport: String {
        if mains.isEmpty { return "general" }
        if ["ride", "run", "swim"].allSatisfy({ mains.contains($0) }) { return "triathlon" }
        return ["ride": "cycling", "run": "running", "swim": "swimming", "strength": "strength"][mains[0]] ?? "general"
    }

    /// Swimming is ticked: "Uplaveš 100 m bez zastavení?" is asked.
    var swims: Bool { kinds.contains("swim") }

    /// A tap on the row: ticked or not; the first sport ticked is the main one.
    mutating func toggle(_ kind: String) {
        if kinds.contains(kind) {
            kinds.removeAll { $0 == kind }
            mains.removeAll { $0 == kind }
        } else {
            if kinds.isEmpty { mains = [kind] }
            kinds = Self.ordered(kinds + [kind])
        }
    }

    /// "Main": on or off; a main sport is always one the athlete does.
    mutating func toggleMain(_ kind: String) {
        if mains.contains(kind) {
            mains.removeAll { $0 == kind }
        } else {
            mains = Self.ordered(mains + [kind])
            kinds = Self.ordered(kinds + [kind])
        }
    }

    /// The profile with the sports, the main ones and the single main sport.
    func applied(to profile: JSONObject) -> JSONObject {
        var next = profile
        next["sports"] = .array(kinds.map { .string($0) })
        next["mainSports"] = .array(mains.map { .string($0) })
        next["mainSport"] = .string(mainSport)
        return next
    }

    private static func ordered(_ list: [String]) -> [String] { all.map { $0.0 }.filter { list.contains($0) } }
    private static func list(_ value: JSONValue?) -> [String]? {
        guard case .array(let items)? = value else { return nil }
        return items.compactMap { $0.string }
    }

    static func name(_ kind: String) -> String { L10n.tr(all.first { $0.0 == kind }?.1 ?? kind) }
    static func symbol(_ kind: String) -> String {
        ["ride": "bicycle", "run": "figure.run", "swim": "figure.pool.swim", "strength": "dumbbell.fill"][kind] ?? "figure.mixed.cardio"
    }
    /// The sport colours of the plans and the week (TrainingPlansSheet.sports).
    static func color(_ kind: String) -> Color {
        ["ride": Palette.amberBar, "run": Palette.rust, "swim": Palette.blue, "strength": Palette.indigo][kind] ?? Palette.green
    }
}

/// "Which sports do you do?": one row per sport with its icon, a tick and a
/// "Main" pill (several may be main). The first-run setup, Zaměření and
/// Settings → Goals show the same rows.
struct SportsPicker: View {
    @Binding var choice: SportsChoice

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(SportsChoice.all, id: \.0) { item in
                row(item.0)
            }
            Text("Bez hlavního sportu je to obecná kondice. Hlavní kolo, běh i plavání je příprava na triatlon. Závod (duatlon, triatlon, maraton) nastavíš v cíli.")
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        }
        .sensoryFeedback(.selection, trigger: choice)
    }

    private func row(_ kind: String) -> some View {
        let on = choice.kinds.contains(kind), main = choice.mains.contains(kind)
        return HStack(spacing: 12) {
            Button { withAnimation(.snappy) { choice.toggle(kind) } } label: {
                HStack(spacing: 12) {
                    Image(systemName: SportsChoice.symbol(kind))
                        .scaledFont(16, weight: .semibold, cap: .denseCap)
                        .foregroundStyle(SportsChoice.color(kind))
                        .frame(width: 38, height: 38)
                        .background(SportsChoice.color(kind).opacity(0.14), in: Circle())
                    Text(SportsChoice.name(kind)).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(SportsChoice.name(kind))
            .accessibilityAddTraits(on ? .isSelected : [])

            Button { withAnimation(.snappy) { choice.toggleMain(kind) } } label: {
                HStack(spacing: 4) {
                    if main { Image(systemName: "star.fill").scaledFont(11, weight: .bold) }
                    Text("Hlavní").font(Typo.small.weight(.semibold))
                }
                .foregroundStyle(main ? Palette.onAccent : Palette.faint)
                .padding(.horizontal, 12).frame(height: 32)
                .background { Capsule().fill(main ? Palette.green : .clear) }
                .overlay { Capsule().stroke(main ? .clear : Palette.hairline, lineWidth: 1.5) }
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.f("Hlavní sport: %@", SportsChoice.name(kind)))
            .accessibilityAddTraits(main ? .isSelected : [])

            Button { withAnimation(.snappy) { choice.toggle(kind) } } label: {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .scaledFont(24).foregroundStyle(on ? Palette.green : Palette.faint)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHidden(true)
        }
        .padding(.leading, 12).padding(.trailing, 14).padding(.vertical, 10)
        .cardSurface(cornerRadius: 18)
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Palette.green : .clear, lineWidth: 1.5) }
    }
}
