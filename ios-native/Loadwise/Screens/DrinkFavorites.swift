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
}

/// The favourite drinks in a row; the chosen one shows its amounts below.
struct DrinkQuickRow: View {
    let add: (Int, String) async -> Void
    var other: () -> Void = {}
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @State private var open: String?
    @State private var busy: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(DrinkPrefs.list(favorites), id: \.self) { id in
                        if let d = DrinkKind.find(id) { drink(d) }
                    }
                    Button(action: other) {
                        VStack(spacing: 4) {
                            Image(systemName: "ellipsis").font(.system(size: 17, weight: .semibold))
                            Text("Jiný").font(.caption2.weight(.medium))
                        }
                        .foregroundStyle(Palette.ink)
                        .frame(width: 64, height: 58)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.ink.opacity(0.15), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Jiný nápoj a množství")
                }
                .padding(.vertical, 1)
            }
            if let open, let d = DrinkKind.find(open) {
                HStack(spacing: 6) {
                    ForEach(DrinkPrefs.amounts(open), id: \.self) { ml in
                        Button {
                            Task {
                                busy = ml
                                await add(ml, open)
                                busy = nil
                                withAnimation(.easeOut(duration: 0.2)) { self.open = nil }
                            }
                        } label: {
                            Group {
                                if busy == ml { ProgressView().tint(Palette.onButton) } else { Text("\(ml) ml").font(.footnote.weight(.semibold)) }
                            }
                            .foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 38)
                            .background(Palette.blue, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(busy != nil)
                        .accessibilityLabel("Přidat \(d.label.lowercased()) \(ml) mililitrů")
                    }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private func drink(_ d: DrinkKind) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.2)) { open = open == d.id ? nil : d.id }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: d.symbol).font(.system(size: 17))
                Text(d.label).font(.caption2.weight(.medium)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(open == d.id ? Palette.onButton : Palette.ink)
            .frame(width: 64, height: 58)
            .background(open == d.id ? Palette.blue : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(open == d.id ? .isSelected : [])
        .accessibilityHint("Ukáže obvyklá množství")
    }
}

/// Nastavení → Oblíbené nápoje: which drinks are in the quick row and the
/// amounts each one shows.
struct DrinkSettingsView: View {
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @State private var amounts: [String: [Int]] = [:]

    var body: some View {
        SettingsPage(title: "Oblíbené nápoje") {
            SettingsGroup(title: "V rychlé nabídce", footer: "Oblíbené nápoje jsou v Jídle a v nabídce „+“. Klepnutím na nápoj se ukážou jeho množství.") {
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
                        Label(d.label + ": množství", systemImage: d.symbol).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        ChipFlow(items: DrinkPrefs.choices, label: { "\($0) ml" },
                                 isOn: { (amounts[id] ?? DrinkPrefs.amounts(id)).contains($0) },
                                 toggle: { ml in
                                     var list = amounts[id] ?? DrinkPrefs.amounts(id)
                                     if list.contains(ml) { if list.count > 1 { list.removeAll { $0 == ml } } } else if list.count < 5 { list.append(ml) }
                                     amounts[id] = list.sorted()
                                     DrinkPrefs.setAmounts(id, list)
                                 })
                        Text("Nejvýš 5 množství.").font(Typo.caption).foregroundStyle(Palette.faint)
                    }
                }
            }
        }
    }
}
