import SwiftUI
import UIKit

// MARK: - App icon

/// Lifetime totals that unlock the sport icons (src/app-milestones.js).
struct Milestones: Decodable, Equatable {
    var runKm: Double = 0
    var rideKm: Double = 0
    var gymSessions: Int = 0
    var streakDays: Int = 0
}

extension APIClient {
    func milestones() async throws -> Milestones {
        try await get("/app/api/milestones", cacheKey: "milestones")
    }
}

/// One alternate icon (Resources/Assets.xcassets: AppIcon-<id>.appiconset and
/// IconPreview/<id> for the picker) and what unlocks it.
struct AppIconChoice: Identifiable, Equatable {
    enum Rule: Equatable {
        case free
        case runKm(Double), rideKm(Double), gym(Int)
        case season(Int)
        case streak(Int)
        case pro
    }

    let id: String
    let name: String
    let rule: Rule

    /// The name iOS knows the icon by; nil is the main Aurin icon.
    var iconName: String? { id == "default" ? nil : "AppIcon-" + id }
    var preview: String { "IconPreview/" + id }

    /// The main icon: white in light mode, dark in dark mode.
    static let aurin = AppIconChoice(id: "default", name: "Automaticky", rule: .free)

    /// Výchozí: the main icon switching with the phone's light and dark mode,
    /// the logo dark, white, and in glass (white by day, dark in dark mode).
    /// Each set has a tinted image, so iOS can also show it tinted and clear.
    static let defaults: [AppIconChoice] = [
        aurin,
        AppIconChoice(id: "dark", name: "Tmavá", rule: .free),
        AppIconChoice(id: "white", name: "Bílá", rule: .free),
        AppIconChoice(id: "glass", name: "Sklo", rule: .free)
    ]

    /// Automaticky was the AppIcon-auto alternate before it became the main
    /// icon; a phone still set to it shows the main icon.
    static func current(_ alternate: String?) -> String? {
        alternate == "AppIcon-auto" ? nil : alternate
    }

    /// One look of the icons: every style has the same sport, season and reward icons.
    struct Style {
        let key: String
        let name: String
        let gold: String
    }

    /// Odznak and Dráha; one row each in a section. Záře and Prstenec are kept for
    /// later in ios-native/IconsLater, outside the app.
    static let styles: [Style] = [
        Style(key: "badge", name: "Odznak", gold: "Zlatý odznak"),
        Style(key: "track", name: "Dráha", gold: "Zlatá dráha")
    ]

    /// Odznak, Zlatý odznak, Dráha, Zlatá dráha, … of one sport.
    static func sport(_ key: String, base: Rule, gold: Rule) -> [AppIconChoice] {
        styles.flatMap { style -> [AppIconChoice] in
            [AppIconChoice(id: style.key + "-" + key, name: style.name, rule: base),
             AppIconChoice(id: style.key + "-" + key + "-gold", name: style.gold, rule: gold)]
        }
    }

    /// The Aurin Pro icons from launch. The 13 later ones (Monochrom, Retro, Saturn, …)
    /// are kept in ios-native/IconsLater, outside the app.
    static let proIcons: [(id: String, name: String)] = [
        ("aurora", "Polární záře"), ("midnight", "Půlnoc"), ("eclipse", "Zatmění"), ("porcelain", "Porcelán"), ("sky", "Nebe")
    ]

    /// Spring 0, summer 1, autumn 2, winter 3 (northern seasons by month).
    static func season(of date: Date = .now) -> Int {
        switch Calendar.current.component(.month, from: date) {
        case 3...5: return 0
        case 6...8: return 1
        case 9...11: return 2
        default: return 3
        }
    }

    static let seasonKeys = ["spring", "summer", "autumn", "winter"]
    static let seasonNames = ["Jaro", "Léto", "Podzim", "Zima"]

    struct Section: Identifiable {
        let title: String
        let icons: [AppIconChoice]
        var id: String { title }
    }

    static let sections: [Section] = [
        Section(title: "Běh", icons: sport("run", base: .runKm(100), gold: .runKm(2500))),
        Section(title: "Kolo", icons: sport("ride", base: .rideKm(1000), gold: .rideKm(10000))),
        Section(title: "Posilovna", icons: sport("gym", base: .gym(50), gold: .gym(500))),
        Section(title: "Roční období", icons: styles.flatMap { style -> [AppIconChoice] in
            seasonKeys.indices.map { AppIconChoice(id: style.key + "-" + seasonKeys[$0], name: seasonNames[$0], rule: .season($0)) }
        }),
        Section(title: "Odměna", icons: styles.map { AppIconChoice(id: $0.key + "-streak", name: $0.name, rule: .streak(30)) }),
        Section(title: "Speciální · Aurin Pro", icons: proIcons.map { AppIconChoice(id: "pro-" + $0.id, name: $0.name, rule: .pro) })
    ]
}

/// Whether an icon is open, and how far the athlete is to it.
struct AppIconUnlock {
    let milestones: Milestones
    let hasPro: Bool
    let season: Int
    /// Sport and streak icons stay open once reached (StoredIcons).
    let earned: Set<String>

    func isOpen(_ icon: AppIconChoice) -> Bool {
        switch icon.rule {
        case .free: return true
        case .pro: return hasPro
        case .season(let s): return s == season
        default: return earned.contains(icon.id) || progress(icon).map { $0.done >= $0.goal } == true
        }
    }

    /// Done and goal of a milestone, nil for the rest.
    func progress(_ icon: AppIconChoice) -> (done: Double, goal: Double)? {
        switch icon.rule {
        case .runKm(let goal): return (milestones.runKm, goal)
        case .rideKm(let goal): return (milestones.rideKm, goal)
        case .gym(let goal): return (Double(milestones.gymSessions), Double(goal))
        case .streak(let goal): return (Double(milestones.streakDays), Double(goal))
        default: return nil
        }
    }

    /// The short note under a locked icon: "2 500 km", "50 tréninků", "jen na jaře".
    static func lockNote(_ icon: AppIconChoice) -> String {
        switch icon.rule {
        case .runKm(let km), .rideKm(let km): return distance(km)
        case .gym(let n): return L10n.plural("%lld tréninků", n)
        case .streak(let n): return L10n.plural("%lld dní", n)
        case .season(let s): return L10n.tr(["jen na jaře", "jen v létě", "jen na podzim", "jen v zimě"][s])
        default: return ""
        }
    }

    static func distance(_ km: Double) -> String {
        Fmt.int(Units.distance(km).rounded()) + " " + Units.distanceUnit
    }
}

/// The icons reached once, kept when the totals later drop (old history
/// leaving the synced window).
enum StoredIcons {
    static let key = "appIconEarned"
    static func load() -> Set<String> { Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }
    static func save(_ ids: Set<String>) { UserDefaults.standard.set(Array(ids).sorted(), forKey: key) }
}

/// Settings → Ikona aplikace: the main icon, then by theme (sports, seasons,
/// the reward, Pro). A locked icon shows how far the athlete is; a Pro icon
/// without Pro opens the offer.
struct AppIconSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var current: String?
    @State private var milestones = Milestones()
    @State private var hasPro = false
    @State private var earned = StoredIcons.load()
    @State private var locked: AppIconChoice?
    @State private var failed = false

    private var unlock: AppIconUnlock {
        AppIconUnlock(milestones: milestones, hasPro: hasPro, season: AppIconChoice.season(), earned: earned)
    }

    var body: some View {
        SettingsPage(title: "Ikona aplikace") {
            SettingsGroup(title: "Výchozí") { grid(AppIconChoice.defaults) }
            ForEach(AppIconChoice.sections) { section in
                SettingsGroup(title: section.title) { grid(section.icons) }
            }
            if failed {
                Text("Ikonu se nepodařilo změnit. Zkus to znovu.").font(Typo.small).foregroundStyle(Palette.rust)
            }
        }
        .sheet(item: $locked) { icon in
            AppIconLockedSheet(icon: icon, unlock: unlock).presentationDetents([.height(320)])
        }
        .task { await load() }
    }

    private func grid(_ icons: [AppIconChoice]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4, alignment: .top), count: 4), alignment: .center, spacing: 16) {
            ForEach(icons) { icon in cell(icon) }
        }
        .padding(.horizontal, 6).padding(.vertical, 16)
    }

    private func cell(_ icon: AppIconChoice) -> some View {
        let open = unlock.isOpen(icon), selected = icon.iconName == current
        return Button { choose(icon, open: open) } label: {
            VStack(spacing: 5) {
                Image(icon.preview).resizable().scaledToFit()
                    .frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .opacity(open ? 1 : 0.32)
                    .overlay {
                        if selected {
                            RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(Palette.green, lineWidth: 2.5).padding(-4)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if icon.rule == .pro {
                            Text(verbatim: "PRO").scaledFont(9.5, weight: .bold).foregroundStyle(Color(red: 0.1, green: 0.07, blue: 0.03))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(AurinMark.amber, in: Capsule())
                                .offset(x: 6, y: -7)
                        }
                    }
                // Long Pro names ("Rýsovací deska bílá") wrap; the row stays aligned at the top.
                Text(icon.name).scaledFont(11, weight: .medium).foregroundStyle(Palette.ink)
                    .lineLimit(2).multilineTextAlignment(.center).minimumScaleFactor(0.8)
                if !open && icon.rule != .pro {
                    HStack(spacing: 2) {
                        Image(systemName: "lock.fill").scaledFont(8)
                        Text(verbatim: AppIconUnlock.lockNote(icon)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .scaledFont(10).foregroundStyle(Palette.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func choose(_ icon: AppIconChoice, open: Bool) {
        guard open else {
            if icon.rule == .pro { Paywall.present(model) } else { locked = icon }
            return
        }
        guard icon.iconName != current, UIApplication.shared.supportsAlternateIcons else { return }
        failed = false
        UIApplication.shared.setAlternateIconName(icon.iconName) { error in
            Task { @MainActor in
                if error == nil { current = icon.iconName } else { failed = true }
            }
        }
    }

    @MainActor private func load() async {
        current = AppIconChoice.current(UIApplication.shared.alternateIconName)
        guard !model.demo else { return }
        if let totals = try? await model.api.milestones() { milestones = totals }
        hasPro = (try? await model.api.subscription())?.hasAI == true
        // Remember what was reached, so a shorter synced history never locks it again.
        let reached = AppIconChoice.sections.flatMap { $0.icons }.filter { icon in
            unlock.progress(icon).map { $0.done >= $0.goal } == true
        }.map(\.id)
        if !Set(reached).isSubset(of: earned) {
            earned.formUnion(reached)
            StoredIcons.save(earned)
        }
    }
}

/// A locked icon: what opens it and how far the athlete is.
struct AppIconLockedSheet: View {
    let icon: AppIconChoice
    let unlock: AppIconUnlock

    var body: some View {
        VStack(spacing: 12) {
            Image(icon.preview).resizable().scaledToFit()
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
                .opacity(0.5)
            Text(verbatim: title).font(.headline).foregroundStyle(Palette.ink)
            Text(verbatim: rule).font(.subheadline).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            if let p = unlock.progress(icon) {
                VStack(spacing: 8) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.muted.opacity(0.2))
                            Capsule().fill(LinearGradient(colors: [AurinMark.amber, Palette.green], startPoint: .leading, endPoint: .trailing))
                                .frame(width: geo.size.width * min(1, max(0, p.done / p.goal)))
                        }
                    }
                    .frame(height: 8)
                    HStack {
                        Text(verbatim: L10n.f("%@ z %@", amount(p.done), amount(p.goal)))
                        Spacer()
                        Text(verbatim: L10n.f("zbývá %@", amount(max(0, p.goal - p.done))))
                    }
                    .font(.footnote.weight(.medium)).foregroundStyle(Palette.muted)
                }
                .padding(.horizontal, 10).padding(.top, 4)
            }
        }
        .padding(.horizontal, 22).padding(.top, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background { Palette.settingsBackground.ignoresSafeArea() }
    }

    private var section: String {
        AppIconChoice.sections.first { $0.icons.contains(icon) }.map { L10n.tr($0.title) } ?? ""
    }

    private var title: String {
        if case .season = icon.rule { return L10n.tr(icon.name) }
        return L10n.tr(icon.name) + " · " + section
    }

    private var rule: String {
        switch icon.rule {
        case .runKm(let km): return L10n.f("Odemkneš ji, až naběháš celkem %@.", AppIconUnlock.distance(km))
        case .rideKm(let km): return L10n.f("Odemkneš ji, až najezdíš na kole celkem %@.", AppIconUnlock.distance(km))
        case .gym(let n): return L10n.f("Odemkneš ji po %@ trénincích v posilovně.", Fmt.int(Double(n)))
        case .streak(let n): return L10n.f("Odemkneš ji, když budeš trénovat %@ dní v řadě.", String(n))
        case .season: return L10n.tr("Dá se vybrat jen v tomto ročním období.")
        default: return ""
        }
    }

    private func amount(_ value: Double) -> String {
        switch icon.rule {
        case .runKm, .rideKm: return AppIconUnlock.distance(value)
        default: return Fmt.int(value.rounded(.down))
        }
    }
}
