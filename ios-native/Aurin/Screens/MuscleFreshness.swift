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
    /// The most tired of them, first on the group's page.
    let open: String
    let lower: Bool
    let readyDate: String?
    let rested: Bool
    /// The last day one of its muscles was trained; nil without one in 4 weeks.
    let lastDate: String?

    func state(on day: String) -> Freshness { Freshness.of(readyDate: readyDate, rested: rested, on: day) }

    /// Where a tap on the row goes: the muscle itself, or the group's page
    /// when it has more (617 review #8: Shoulders opened "Rear shoulders").
    var route: AppRoute { members.count == 1 ? .muscle(members[0]) : .muscleGroup(id) }

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
            // The group's own muscles (Hips: adductors, abductors), not its body part
            // (Legs) as before the 617 review; an older server has only the part.
            let part = groups?.first { $0.id == row.part }
            let last = perMuscleDates ? found.compactMap(\.lastDate).max() : part?.lastDate
            return FreshnessGroup(id: row.id, label: L10n.tr(row.label), members: found.map(\.id), open: open, lower: row.lower,
                                  readyDate: latest, rested: tired.isEmpty, lastDate: last)
        }
        return list.enumerated().sorted { a, b in
            let sa = a.element.state(on: date), sb = b.element.state(on: date)
            return sa != sb ? sa.rawValue > sb.rawValue : a.offset < b.offset
        }.map(\.element)
    }

    /// The server sends each muscle's last training day (617 review on).
    private var perMuscleDates: Bool { (muscles ?? []).contains { $0.lastDate != nil } }

    /// One muscle as a row of a group's page.
    func freshnessRow(_ m: Muscle) -> FreshnessGroup {
        let tired = m.state != "rested" && (m.readyDate ?? "") > date
        return FreshnessGroup(id: m.id, label: L10n.tr(m.label), members: [m.id], open: m.id, lower: false,
                              readyDate: tired ? m.readyDate : nil, rested: !tired, lastDate: m.lastDate)
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

/// A group with more muscles (Shoulders, Arms, Hips, Upper back): each of its
/// muscles as on Svaly, the most tired first, each opening its own page.
struct MuscleGroupView: View {
    @Environment(AppModel.self) private var model
    let id: String

    private var group: FreshnessGroup? { model.muscles?.freshnessGroups.first { $0.id == id } }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: group?.label ?? MuscleFatigue.title, coach: .muscles(date: model.selectedDate)) {
            VStack(alignment: .leading, spacing: 0) {
                if let data = model.muscles, let group {
                    Text(verbatim: group.label).font(Typo.heading(40, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    Text(verbatim: group.state(on: data.date).title).font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(Array(rows(data, group).enumerated()), id: \.element.id) { index, row in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            Button { model.push(.muscle(row.id)) } label: { FreshnessRow(group: row, today: data.date) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18).padding(.vertical, 4)
                    .cardSurface()
                    .padding(.top, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task { if model.musclesStale { await model.loadMuscles() } }
    }

    /// The group's muscles, the most tired first, then in the catalogue's order.
    private func rows(_ data: MuscleFatigue, _ group: FreshnessGroup) -> [FreshnessGroup] {
        group.members.compactMap { data.muscle($0) }.map(data.freshnessRow).enumerated().sorted { a, b in
            let sa = a.element.state(on: data.date), sb = b.element.state(on: data.date)
            if sa != sb { return sa.rawValue > sb.rawValue }
            if (a.element.readyDate ?? "") != (b.element.readyDate ?? "") { return (a.element.readyDate ?? "") > (b.element.readyDate ?? "") }
            return a.offset < b.offset
        }.map(\.element)
    }
}
