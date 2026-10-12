import SwiftUI
import UserNotifications

// MARK: - Appearance and units

struct AppearanceSettingsView: View {
    @AppStorage("appearance") private var appearance = "system"

    static func label(_ value: String) -> String {
        switch value {
        case "light": return "světlý"
        case "dark": return "tmavý"
        default: return "automaticky"
        }
    }

    var body: some View {
        SettingsPage(title: "Vzhled") {
            SettingsGroup(footer: "Automaticky se vzhled řídí nastavením iPhonu.") {
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
        SettingsPage(title: "Jednotky") {
            SettingsGroup {
                SettingsChoiceList(options: [("metric", "Metrické"), ("imperial", "Imperiální")], selected: units) { value in
                    Units.setSystem(value)
                    units = value
                    WidgetBridge.reload()
                }
            }
            SettingsGroup(footer: "Server ukládá hodnoty metricky, převádí se jen to, co vidíš a zadáváš.") {
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
        SettingsPage(title: "Jazyk") {
            SettingsGroup(footer: "Texty od kouče a ze serveru přijdou v novém jazyce s dalším načtením.") {
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
