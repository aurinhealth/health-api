import SwiftUI
import UserNotifications

// MARK: - Profile

/// Profil: who you are. The photo (on this phone only), the name, sex, birth
/// date and height, the e-mail of the account, signing out. What the
/// calculations need beyond that (heart rate, activity, the weight goal) is
/// on its own page, Tep a aktivita.
struct ProfileSettingsView: View {
    let store: SettingsStore
    var signOut: () -> Void = {}
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var sex = ""
    @State private var hasBirth = false
    @State private var birth = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
    @State private var age = ""
    @State private var height = ""
    @State private var original: JSONObject = [:]
    @State private var copied = false
    @AppStorage(AvatarStore.nameKey) private var accountName = ""
    @AppStorage(AvatarStore.emailKey) private var email = ""

    var body: some View {
        SettingsPage(title: "Profil") {
            AvatarEditor().padding(.top, 8)
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }

            SettingsGroup(title: "Osobní údaje") {
                SettingsField(title: "Jméno", text: $name, keyboard: .default, placeholder: accountName.isEmpty ? "tvé jméno" : accountName)
                    .textInputAutocapitalization(.words)
                SettingsDivider()
                SettingsPicker(title: "Pohlaví", selection: $sex, options: [("male", "muž"), ("female", "žena")])
                SettingsDivider()
                HStack(spacing: 8) {
                    Text("Datum narození").font(.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    if hasBirth {
                        DatePicker("", selection: $birth, in: Self.birthRange, displayedComponents: .date)
                            .labelsHidden()
                            .environment(\.locale, L10n.locale)
                    } else {
                        Button("Zadat") { hasBirth = true }.font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 8).frame(minHeight: 50)
                SettingsDivider()
                if hasBirth {
                    SettingsRow(title: "Věk", value: L10n.f("%@ let", String(Self.years(from: birth))), chevron: false)
                } else {
                    SettingsField(title: "Věk", text: $age, unit: "let", keyboard: .numberPad)
                }
                SettingsDivider()
                SettingsField(title: "Výška", text: $height, unit: Units.lengthUnit, keyboard: Units.imperial ? .decimalPad : .numberPad)
            }

            if !email.isEmpty {
                SettingsGroup(title: "Účet") {
                    Button {
                        UIPasteboard.general.string = email
                        copied = true
                    } label: {
                        HStack(spacing: 8) {
                            Text("E-mail").font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: email).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1).truncationMode(.middle)
                            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 13)).foregroundStyle(Palette.faint)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("E-mail %@, zkopírovat", email))
                }
            }

            SettingsGroup {
                Button(action: signOut) { SettingsRow(title: model.demo ? "Ukončit ukázku" : "Odhlásit se", chevron: false, titleColor: Palette.ink) }
                    .buttonStyle(.plain)
                if !model.demo {
                    SettingsDivider()
                    NavigationLink { PrivacySettingsView() } label: { SettingsRow(title: "Smazat účet", titleColor: Palette.rust) }
                        .buttonStyle(.plain)
                }
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
    }

    static var birthRange: ClosedRange<Date> {
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        return calendar.date(byAdding: .year, value: -100, to: now)!...calendar.date(byAdding: .year, value: -14, to: now)!
    }

    static func years(from birth: Date) -> Int {
        Calendar(identifier: .gregorian).dateComponents([.year], from: birth, to: Date()).year ?? 0
    }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func fill() {
        let p = store.profile
        name = p["displayName"]?.string ?? UserDefaults.standard.string(forKey: AppModel.displayNameKey) ?? ""
        sex = p["sex"]?.string ?? ""
        if let text = p["birthDate"]?.string, let date = Self.dayFormat.date(from: text) {
            hasBirth = true
            birth = date
        } else {
            hasBirth = false
        }
        age = p["age"]?.string ?? ""
        height = Units.imperial
            ? (p["height"]?.number).map { Fmt.decimal(Units.length($0), digits: 1) } ?? ""
            : p["height"]?.string ?? ""
        original = changes
    }

    private var changes: JSONObject {
        var c: JSONObject = [
            "displayName": .string(name.trimmingCharacters(in: .whitespaces)), "sex": .string(sex),
            "height": HeartActivitySettingsView.metric(height, Units.cm, scale: 1),
            "birthDate": .string(hasBirth ? Self.dayFormat.string(from: birth) : "")
        ]
        if !hasBirth { c["age"] = .field(age) }
        return c
    }

    private func save() async {
        let shown = name.trimmingCharacters(in: .whitespaces)
        if await store.saveProfile(changes) {
            UserDefaults.standard.set(shown.nilIfBlank, forKey: AppModel.displayNameKey)
            if let first = (shown.nilIfBlank ?? accountName.nilIfBlank ?? email).first {
                UserDefaults.standard.set(String(first).uppercased(), forKey: AppModel.accountInitialKey)
            }
            fill()
        }
    }
}
