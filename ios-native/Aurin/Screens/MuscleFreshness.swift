import SwiftUI

// Muscle freshness as the Training concept draws it (trenink-koncept
// muscles(), "MUSCLE FRESHNESS" on the main page): every muscle on the
// figure in one of three colours, Fresh, Recovering (fresh tomorrow) and
// Tired (later), a sentence of what is fresh when, and the muscle groups
// with today and the next two days. From GET /app/api/muscles as before.

enum Freshness: Int, CaseIterable, Hashable {
    case fresh, recovering, tired

    var title: String {
        switch self {
        case .fresh: return L10n.tr("Čerstvé")
        case .recovering: return L10n.tr("Zotavuje se")
        case .tired: return L10n.tr("Unavené")
        }
    }

    /// On the figure, the dots and the day blocks.
    var color: Color {
        switch self {
        case .fresh: return Palette.Freshness.fresh
        case .recovering: return Palette.Freshness.recovering
        case .tired: return Palette.Freshness.tired
        }
    }

    /// A muscle on `day`: fresh once its ready day has come, recovering the day
    /// before it, tired earlier.
    static func of(readyDate: String?, rested: Bool, on day: String) -> Freshness {
        guard !rested, let ready = readyDate, ready > day else { return .fresh }
        return MuscleFatigue.days(from: day, to: ready) == 1 ? .recovering : .tired
    }
}

/// One row of the list: a muscle group of the concept (Quads, Upper back,
/// Arms…), as fresh as its most tired muscle.
struct FreshnessGroup: Identifiable, Hashable {
    let id: String
    let label: String
    /// The muscles of /app/api/muscles in it.
    let members: [String]
    /// The most tired of them: a tap on the row opens it.
    let open: String
    let lower: Bool
    let readyDate: String?
    let rested: Bool
    /// Its body part's last training day; nil without one in 4 weeks.
    let lastDate: String?

    func state(on day: String) -> Freshness { Freshness.of(readyDate: readyDate, rested: rested, on: day) }

    /// The concept's eleven groups from the server's seventeen muscles.
    static let layout: [(id: String, label: String, members: [String], lower: Bool, part: String)] = [
        ("lower_back", "Spodní záda", ["lower_back"], true, "back"),
        ("quads", "Přední stehna", ["quads"], true, "legs"),
        ("hamstrings", "Zadní stehna", ["hamstrings"], true, "legs"),
        ("glutes", "Hýždě", ["glutes"], true, "glutes"),
        ("calves", "Lýtka", ["calves"], true, "legs"),
        ("hips", "Kyčle", ["adductors", "abductors"], true, "legs"),
        ("chest", "Hrudník", ["chest"], false, "chest"),
        ("upper_back", "Horní záda", ["back", "traps"], false, "back"),
        ("shoulders", "Ramena", ["shoulders", "side_delts", "rear_delts"], false, "shoulders"),
        ("arms", "Paže", ["biceps", "triceps", "forearms"], false, "arms"),
        ("core", "Střed těla", ["core"], false, "core")
    ]
}

extension MuscleFatigue {
    /// The eleven groups, the most tired first, then in the concept's order
    /// (concept muscles(): tired, recovering, fresh).
    var freshnessGroups: [FreshnessGroup] {
        let list: [FreshnessGroup] = FreshnessGroup.layout.compactMap { row in
            let found = row.members.compactMap { muscle($0) }
            guard !found.isEmpty else { return nil }
            let tired = found.filter { $0.state != "rested" && ($0.readyDate ?? "") > date }
            let latest = tired.compactMap(\.readyDate).max()
            let open = tired.max { ($0.readyDate ?? "") < ($1.readyDate ?? "") }?.id ?? found[0].id
            let part = groups?.first { $0.id == row.part }
            return FreshnessGroup(id: row.id, label: L10n.tr(row.label), members: row.members, open: open, lower: row.lower,
                                  readyDate: latest, rested: tired.isEmpty, lastDate: part?.lastDate)
        }
        return list.enumerated().sorted { a, b in
            let sa = a.element.state(on: date), sb = b.element.state(on: date)
            return sa != sb ? sa.rawValue > sb.rawValue : a.offset < b.offset
        }.map(\.element)
    }

    /// How many groups are in each state today.
    func freshnessCount(_ state: Freshness) -> Int { freshnessGroups.filter { $0.state(on: date) == state }.count }

    /// Every muscle of the figure in its colour (the concept colours them all).
    var freshnessColors: [String: Color] {
        var colors: [String: Color] = [:]
        for m in muscles ?? [] { colors[m.id] = Freshness.of(readyDate: m.readyDate, rested: m.state == "rested", on: date).color }
        // The shins have no fatigue of their own: they go with the calves.
        colors["shins"] = colors["calves"] ?? Freshness.fresh.color
        return colors
    }

    /// "Legs fresh tomorrow" and under it "Upper body fresh today": the half
    /// that waits longer leads; all fresh, one line.
    var freshnessHeadline: (title: String, note: String?) {
        let all = freshnessGroups
        func ready(_ lower: Bool) -> String? { all.filter { $0.lower == lower && !$0.rested }.compactMap(\.readyDate).filter { $0 > date }.max() }
        func when(_ day: String?) -> String { day.map { Fmt.relativeDay($0, today: date) } ?? L10n.tr("dnes") }
        let legs = ready(true), upper = ready(false)
        guard legs != nil || upper != nil else { return (L10n.tr("Všechny svaly čerstvé"), nil) }
        let legsLine = L10n.f("Nohy čerstvé %@", when(legs)), upperLine = L10n.f("Horní část těla čerstvá %@", when(upper))
        return (legs ?? "") >= (upper ?? "") ? (legsLine, upperLine) : (upperLine, legsLine)
    }
}

/// "MUSCLE FRESHNESS ›" on Training's overview (concept a-hlavni): the figure,
/// the sentence and the three states with their counts.
struct MuscleFreshnessCard: View {
    let data: MuscleFatigue

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: L10n.tr("Čerstvost svalů").uppercased(with: Fmt.locale))
                    .font(.caption2.weight(.medium)).tracking(1.6).foregroundStyle(Palette.muted)
                Spacer()
                Image(systemName: "chevron.right").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
            }
            HStack(alignment: .center, spacing: 14) {
                MuscleFigurePair(colors: data.freshnessColors, spacing: 2).frame(height: 138)
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: data.freshnessHeadline.title).font(Typo.heading(22)).foregroundStyle(Palette.ink)
                        .lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                    ForEach(Freshness.allCases, id: \.self) { state in
                        HStack(spacing: 7) {
                            Circle().fill(state.color).frame(width: 8, height: 8)
                            Text(verbatim: state.title).font(Typo.small).foregroundStyle(Palette.secondary)
                            Spacer(minLength: 4)
                            Text(verbatim: String(data.freshnessCount(state))).font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink).monospacedDigit()
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Čerstvost svalů, odhad"))
        .accessibilityValue(([data.freshnessHeadline.title] + Freshness.allCases.map { $0.title + " " + String(data.freshnessCount($0)) }).joined(separator: ", "))
    }
}

/// One group in the list: its dot, name and last training, then today and
/// the next two days as blocks, and when it is fresh in words.
struct FreshnessRow: View {
    let group: FreshnessGroup
    let today: String

    var body: some View {
        let now = group.state(on: today)
        HStack(alignment: .center, spacing: 12) {
            Circle().fill(now.color).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: group.label).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                Text(verbatim: last).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 4, style: .continuous).fill(group.state(on: ISODay.shift(today, i)).color).frame(width: 34, height: 12)
                    }
                }
                Text(verbatim: when).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(group.label)
        .accessibilityValue([now.title, when, last].joined(separator: ", "))
    }

    /// "Fresh now", "Fresh tomorrow", "Fresh on Saturday".
    private var when: String {
        guard let ready = group.readyDate, !group.rested, ready > today else { return L10n.tr("Čerstvé teď") }
        return L10n.f("Čerstvé %@", Fmt.relativeDay(ready, today: today))
    }

    /// "Last trained yesterday", "Last trained Nov 10", or that it has not been in 4 weeks.
    private var last: String {
        guard let date = group.lastDate else { return L10n.tr("4 týdny bez tréninku") }
        return L10n.f("Naposledy %@", Fmt.relativeDay(date, today: today))
    }
}
