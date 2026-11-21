import SwiftUI
import UserNotifications

// MARK: - Appearance and units

struct AppearanceSettingsView: View {
    @AppStorage("appearance") private var appearance = "system"

    private var heroText: String {
        switch appearance {
        case "light": return "Aurin zůstává světlý ve dne i v noci."
        case "dark": return "Aurin zůstává tmavý ve dne i v noci."
        default: return "Aurin se řídí vzhledem tvého iPhonu."
        }
    }

    /// Two small phones, a light one and a dark one (the concept's drawing).
    static var phones: some View {
        HStack(spacing: 12) {
            phone(screen: Color(light: 0xF3EFE8, dark: 0xF3EFE8), card: Color(light: 0xFFFFFF, dark: 0xFFFFFF), notch: Color(light: 0x15140F, dark: 0x15140F))
            phone(screen: Color(light: 0x15140F, dark: 0x15140F), card: Color(light: 0x2C2D2E, dark: 0x2C2D2E), notch: Color(light: 0x3A3B3C, dark: 0x3A3B3C))
        }
        .accessibilityHidden(true)
    }

    private static func phone(screen: Color, card: Color, notch: Color) -> some View {
        VStack(spacing: 4) {
            Capsule().fill(notch).frame(width: 12, height: 3).padding(.bottom, 3)
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 3, style: .continuous).fill(card).frame(width: 30, height: 9)
            }
        }
        .frame(width: 42, height: 74, alignment: .top)
        .padding(.top, 6)
        .background(screen, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Palette.faint.opacity(0.6), lineWidth: 1.5) }
    }

    static func label(_ value: String) -> String {
        switch value {
        case "light": return "světlý"
        case "dark": return "tmavý"
        default: return "automaticky"
        }
    }

    var body: some View {
        SettingsPage(title: "Vzhled", hero: SettingsHero(text: heroText, art: AnyView(Self.phones))) {
            SettingsGroup {
                ForEach(Array(["system", "light", "dark"].enumerated()), id: \.element) { index, value in
                    if index > 0 { SettingsDivider() }
                    Button { appearance = value } label: {
                        HStack {
                            Text(verbatim: Fmt.capitalized(L10n.tr(Self.label(value)))).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            if appearance == value { Image(systemName: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green) }
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(appearance == value ? .isSelected : [])
                }
            }
        }
    }
}

/// One choice of a short list, ticked.
struct SettingsChoiceList: View {
    let options: [(value: String, label: String)]
    let selected: String
    let choose: (String) -> Void

    var body: some View {
        ForEach(Array(options.enumerated()), id: \.element.value) { index, option in
            if index > 0 { SettingsDivider() }
            Button { choose(option.value) } label: {
                HStack {
                    Text(option.label).font(.body).foregroundStyle(Palette.ink)
                    Spacer()
                    if selected == option.value { Image(systemName: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green) }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected == option.value ? .isSelected : [])
        }
    }
}

struct UnitsSettingsView: View {
    @AppStorage(Units.key) private var units = "metric"

    static func label(_ value: String) -> String {
        value == "imperial" ? "imperiální" : "metrické"
    }

    var body: some View {
        SettingsPage(title: "Jednotky", hero: SettingsHero(systemImage: "ruler", color: Palette.blue, text: units == "imperial" ? "Všechno se ukazuje v imperiálních jednotkách." : "Všechno se ukazuje v metrických jednotkách.")) {
            SettingsGroup {
                SettingsChoiceList(options: [("metric", "Metrické"), ("imperial", "Imperiální")], selected: units) { value in
                    Units.setSystem(value)
                    units = value
                    WidgetBridge.reload()
                }
            }
            SettingsGroup {
                let imperial = units == "imperial"
                let rows = [("Vzdálenost", imperial ? "mi" : "km"), ("Výška", imperial ? "in" : "cm"), ("Váha", imperial ? "lb" : "kg"),
                            ("Teplota", imperial ? "°F" : "°C"), ("Energie", "kcal"), ("Pití", imperial ? "fl oz" : "ml")]
                ForEach(Array(rows.enumerated()), id: \.offset) { index, unit in
                    if index > 0 { SettingsDivider() }
                    SettingsRow(title: unit.0, value: unit.1, chevron: false)
                }
            }
        }
    }
}

struct LanguageSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(L10n.key) private var language = L10n.defaultLanguage

    static func label(_ value: String) -> String {
        value == "en" ? "English" : "čeština"
    }

    var body: some View {
        SettingsPage(title: "Jazyk", hero: SettingsHero(systemImage: "globe", color: Palette.blue, text: language == "en" ? "Aurin mluví anglicky." : "Aurin mluví česky.")) {
            SettingsGroup {
                SettingsChoiceList(options: [("cs", "Čeština"), ("en", "English")], selected: language) { value in
                    guard value != language else { return }
                    L10n.setLanguage(value)
                    language = value
                    WidgetBridge.reload()
                    // Every tab: the server writes its texts in the new language.
                    Task { await model.refreshAll() }
                }
            }
        }
    }
}
