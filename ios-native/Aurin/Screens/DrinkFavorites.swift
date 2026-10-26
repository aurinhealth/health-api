import SwiftUI

/// The favourite drinks and the amounts each one is usually drunk in, kept on
/// the phone. A tap on a drink shows its amounts, a tap on an amount adds it.
enum DrinkPrefs {
    static let favoritesKey = "drinkFavorites"
    static let defaultFavorites = "water,coffee,tea"

    /// The amounts a drink comes in, ml.
    static let usual: [String: [Int]] = [
        "water": [250, 330, 500, 750], "tea": [250, 330, 500], "coffee": [60, 150, 200, 300],
        "juice": [200, 250, 330], "milk": [200, 250, 330], "sport": [500, 750],
        "soda": [330, 500], "beer": [300, 500], "wine": [100, 150, 200], "other": [250, 500]
    ]
    static let choices = [30, 60, 100, 150, 200, 250, 300, 330, 400, 500, 600, 750, 1000]

    static func list(_ text: String) -> [String] {
        text.split(separator: ",").map(String.init).filter { DrinkKind.find($0) != nil }
    }

    static func amountsKey(_ kind: String) -> String { "drinkAmounts." + kind }

    static func amounts(_ kind: String) -> [Int] {
        let saved = UserDefaults.standard.string(forKey: amountsKey(kind)).map { $0.split(separator: ",").compactMap { Int($0) } } ?? []
        return saved.isEmpty ? usual[kind] ?? [250, 500] : saved.sorted()
    }

    static func setAmounts(_ kind: String, _ values: [Int]) {
        UserDefaults.standard.set(Array(Set(values)).sorted().map(String.init).joined(separator: ","), forKey: amountsKey(kind))
    }

    /// The glass a drink is usually drunk in, for the one-tap choices.
    static let quick: [String: [Int]] = [
        "water": [250, 500], "tea": [250], "coffee": [200], "juice": [250], "milk": [250],
        "sport": [500], "soda": [330], "beer": [500], "wine": [150], "other": [250]
    ]

    /// The one-tap choices in Jídlo → Pití: the favourite drinks in the glasses
    /// they are usually drunk in (the amounts saved for a drink win), at most 8.
    static func presets(favorites: [String], saved: (String) -> [Int]? = DrinkPrefs.savedAmounts) -> [DrinkPreset] {
        let all = favorites.flatMap { kind -> [DrinkPreset] in
            let own = saved(kind) ?? []
            let amounts = own.isEmpty ? quick[kind] ?? [250] : Array(own.prefix(2))
            return amounts.map { DrinkPreset(kind: kind, ml: $0) }
        }
        return Array(all.prefix(8))
    }

    static func savedAmounts(_ kind: String) -> [Int]? {
        UserDefaults.standard.string(forKey: amountsKey(kind)).map { $0.split(separator: ",").compactMap { Int($0) }.sorted() }
    }
}

struct DrinkPreset: Hashable, Identifiable {
    let kind: String
    let ml: Int
    var id: String { kind + "." + String(ml) }
}

/// Jídlo → Pití: the favourite drinks in their usual glasses, one tap adds one.
struct DrinkPresetRow: View {
    /// true when the drink was saved (or waits for signal).
    let add: (Int, String) async -> Bool
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @State private var busy: String?
    @State private var done: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(DrinkPrefs.presets(favorites: DrinkPrefs.list(favorites))) { preset($0) }
            }
            .padding(.vertical, 1)
        }
    }

    private func preset(_ p: DrinkPreset) -> some View {
        let kind = DrinkKind.find(p.kind)
        return Button {
            Task {
                busy = p.id
                let saved = await add(p.ml, p.kind)
                busy = nil
                // The tick only when it was saved; the error shows on top.
                guard saved else { return }
                withAnimation(.easeOut(duration: 0.2)) { done = p.id }
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                withAnimation(.easeOut(duration: 0.2)) { if done == p.id { done = nil } }
            }
        } label: {
            HStack(spacing: 8) {
                Group {
                    if busy == p.id { ProgressView().controlSize(.small) }
                    else { Image(systemName: done == p.id ? "checkmark" : kind?.symbol ?? "drop.fill").font(.system(size: 14, weight: .semibold)) }
                }
                .foregroundStyle(Palette.blue)
                .frame(width: 18)
                VStack(alignment: .leading, spacing: 0) {
                    Text(kind?.label ?? p.kind).font(.caption2.weight(.medium)).foregroundStyle(Palette.muted)
                    Text(Units.volumeText(Double(p.ml))).font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(Palette.ink)
                }
            }
            .padding(.leading, 12).padding(.trailing, 14)
            .frame(height: 48)
            .background(Palette.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy != nil)
        .accessibilityLabel(L10n.f("Přidat %@ %@", L10n.tr(kind?.label ?? p.kind).lowercased(with: L10n.locale), Units.volumeText(Double(p.ml))))
    }
}

/// Nastavení → Oblíbené nápoje: which drinks are in the quick row and the
/// amounts each one shows.
struct DrinkSettingsView: View {
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @State private var amounts: [String: [Int]] = [:]

    var body: some View {
        SettingsPage(title: "Oblíbené nápoje") {
            SettingsGroup(title: "V rychlé nabídce") {
                ForEach(Array(DrinkKind.all.enumerated()), id: \.element.id) { index, d in
                    if index > 0 { SettingsDivider() }
                    SettingsToggle(title: d.label, isOn: Binding(
                        get: { DrinkPrefs.list(favorites).contains(d.id) },
                        set: { on in
                            var list = DrinkPrefs.list(favorites).filter { $0 != d.id }
                            if on { list.append(d.id) }
                            favorites = list.joined(separator: ",")
                        }))
                }
            }
            ForEach(DrinkPrefs.list(favorites), id: \.self) { id in
                if let d = DrinkKind.find(id) {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(L10n.f("%@: množství", L10n.tr(d.label)), systemImage: d.symbol).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        ChipFlow(items: DrinkPrefs.choices, label: { Units.volumeText(Double($0)) },
                                 isOn: { (amounts[id] ?? DrinkPrefs.amounts(id)).contains($0) },
                                 toggle: { ml in
                                     var list = amounts[id] ?? DrinkPrefs.amounts(id)
                                     if list.contains(ml) { if list.count > 1 { list.removeAll { $0 == ml } } } else if list.count < 5 { list.append(ml) }
                                     amounts[id] = list.sorted()
                                     DrinkPrefs.setAmounts(id, list)
                                 })
                    }
                }
            }
        }
    }
}
