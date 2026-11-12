import SwiftUI

/// Nastavení → Správa → Útraty AI (the owner only): what AI costs today, and
/// each group of accounts against its own daily brake (src/ai-total.js). A
/// group that reaches its brake waits until the day starts again; the others
/// go on. Měsíc shows each group's month so far and how often it reached its
/// brake.
struct AISpendingView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var spending: AISpending?
    @State private var error: String?
    @State private var month = false

    var body: some View {
        SettingsPage(title: "Útraty AI") {
            if let spending {
                if spending.monthGroups != nil {
                    Picker("Období", selection: $month) {
                        Text("Dnes").tag(false)
                        Text("Měsíc").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
                if month, let groups = spending.monthGroups {
                    monthView(spending, groups)
                } else {
                    todayView(spending)
                }
            } else if let error {
                Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func todayView(_ spending: AISpending) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SettingsTitle(text: "Dnes")
            Text(verbatim: Self.usd(spending.today)).font(Typo.number(58)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 4)
            Text(verbatim: L10n.f("Včera %@, %@ %@", Self.usd(spending.yesterday), Self.monthName, Self.usd(spending.month)))
                .font(Typo.small).foregroundStyle(Palette.muted).padding(.horizontal, 4)
        }
        if let error { Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust) }
        SettingsGroup {
            ForEach(Array(spending.groups.enumerated()), id: \.element.id) { index, group in
                if index > 0 { SettingsDivider() }
                row(group)
            }
        }
        if let resets = resetsAt {
            Text(verbatim: L10n.f("Den začíná znovu v %@", resets))
                .font(Typo.small).foregroundStyle(Palette.muted).frame(maxWidth: .infinity)
        }
    }

    /// The month so far: the biggest spender on top, a grey bar for its share
    /// of the month (the brakes are daily, so a month has nothing to fill).
    @ViewBuilder
    private func monthView(_ spending: AISpending, _ groups: [AISpending.MonthGroup]) -> some View {
        let days = max(1, spending.monthDays ?? 1)
        let sorted = groups.enumerated().sorted { ($1.element.spent, $0.offset) < ($0.element.spent, $1.offset) }.map(\.element)
        VStack(alignment: .leading, spacing: 6) {
            SettingsTitle(text: Self.monthName)
            Text(verbatim: Self.usd(spending.month)).font(Typo.number(58)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 4)
            Text(verbatim: L10n.f("%@, %@ denně", L10n.plural("%lld dní", days), Self.usd(spending.month / Double(days))))
                .font(Typo.small).foregroundStyle(Palette.muted).padding(.horizontal, 4)
        }
        if let error { Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust) }
        SettingsGroup {
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, group in
                if index > 0 { SettingsDivider() }
                monthRow(group, of: spending)
            }
        }
        Text("Měsíc ve dnech UTC jako pojistky")
            .font(Typo.small).foregroundStyle(Palette.muted).frame(maxWidth: .infinity)
    }

    private func monthRow(_ group: AISpending.MonthGroup, of spending: AISpending) -> some View {
        let share = spending.month > 0 ? min(1, group.spent / spending.month) : 0
        let today = spending.groups.first { $0.group == group.group }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Self.name(group.group)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(verbatim: Self.usd(group.spent)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                Text(verbatim: share.formatted(.percent.precision(.fractionLength(0)).locale(L10n.locale)))
                    .font(Typo.small).foregroundStyle(Palette.faint)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(Palette.muted).frame(width: proxy.size.width * share)
                }
            }
            .frame(height: 6)
            .accessibilityHidden(true)
            HStack {
                if let today { Text(verbatim: accounts(today)).font(Typo.caption).foregroundStyle(Palette.muted) }
                Spacer()
                if group.braked > 0 {
                    Text(verbatim: L10n.f("Na pojistce %lld×", group.braked)).font(Typo.caption).foregroundStyle(Palette.amber)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    private func row(_ group: AISpending.Group) -> some View {
        let share = group.brake.map { $0 > 0 ? group.spent / $0 : 1 } ?? 0
        let color = share >= 1 ? Palette.rust : share >= 0.5 ? Palette.amber : Palette.green
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Self.name(group.group)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(verbatim: Self.usd(group.spent)).font(Typo.number(20)).foregroundStyle(share >= 0.5 ? color : Palette.ink)
                if let brake = group.brake {
                    Text(verbatim: L10n.f("z %@", Self.usd(brake))).font(Typo.small).foregroundStyle(Palette.faint)
                }
            }
            if group.brake != nil {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.track)
                        Capsule().fill(color).frame(width: proxy.size.width * min(1, share))
                    }
                }
                .frame(height: 6)
                .accessibilityHidden(true)
            }
            HStack {
                Text(verbatim: accounts(group)).font(Typo.caption).foregroundStyle(Palette.muted)
                Spacer()
                if share >= 1, let resets = resetsAt {
                    Text(verbatim: L10n.f("Stojí do %@", resets)).font(Typo.caption).foregroundStyle(color)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    private func accounts(_ group: AISpending.Group) -> String {
        guard let count = group.accounts else { return L10n.tr("pevná") }
        return group.group == "testflight" ? L10n.plural("%lld testerů", count) : L10n.plural("%lld účtů", count)
    }

    /// The next UTC midnight in the phone's time (01:00 in Prague in winter).
    private var resetsAt: String? {
        guard let raw = spending?.resetsAt else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else { return nil }
        return date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale))
    }

    static func usd(_ value: Double) -> String { String(format: "$%.2f", value) }

    /// The UTC month, like the totals (at 00:30 on 1 December in Prague it is still November).
    private static var monthName: String {
        var style = Date.FormatStyle().month(.wide).locale(L10n.locale)
        style.timeZone = .gmt
        return Date().formatted(style).capitalized(with: L10n.locale)
    }

    static func name(_ group: String) -> String {
        switch group {
        case "paid": "Platící"
        case "gift": "Pilot, dárky a ty"
        case "trial": "Týden zdarma"
        case "testflight": "TestFlight"
        case "free": "Bez nákupu"
        case "new": "Nové účty"
        case "system": "Úlohy serveru"
        default: group
        }
    }

    private func load() async {
        do {
            let loaded = try await model.api.aiSpending()
            spending = loaded
            store.aiSpentToday = loaded.today
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
