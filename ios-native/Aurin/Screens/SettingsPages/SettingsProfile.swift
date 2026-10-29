import SwiftUI
import UserNotifications

// MARK: - Profile

/// Profil: who you are. The photo (on this phone only), the name, sex, birth
/// date and height, the e-mail of the account (and changing it), signing out.
/// What the calculations need beyond that (heart rate, activity, the weight
/// goal) is on its own page, Tep a aktivita.
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
    @State private var filled = false
    @State private var copied = false
    @State private var confirmOthers = false
    @State private var signingOutOthers = false
    @State private var othersMessage: String?
    @AppStorage(AvatarStore.nameKey) private var accountName = ""
    @AppStorage(AvatarStore.emailKey) private var email = ""

    var body: some View {
        SettingsPage(title: "Účet") {
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

            ExperienceGroup()

            if !email.isEmpty {
                SettingsGroup {
                    Button {
                        UIPasteboard.general.string = email
                        copied = true
                    } label: {
                        HStack(spacing: 8) {
                            Text("E-mail").font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: email).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1).truncationMode(.middle)
                            Image(systemName: copied ? "checkmark" : "doc.on.doc").scaledFont(13).foregroundStyle(Palette.faint)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("E-mail %@, zkopírovat", email))
                    // The owner's address comes from the server's settings (OWNER_EMAIL).
                    if !model.demo && !store.owner {
                        SettingsDivider()
                        NavigationLink { EmailChangeView() } label: { SettingsRow(title: "Změnit e-mail") }
                            .buttonStyle(.plain)
                    }
                }
            }

            if !model.demo {
                SettingsGroup(title: "Přihlášení") {
                    NavigationLink { PasskeysSettingsView() } label: { SettingsRow(title: "Face ID") }
                        .buttonStyle(.plain)
                    SettingsDivider()
                    Button { confirmOthers = true } label: { SettingsRow(title: signingOutOthers ? "Odhlašuji…" : "Odhlásit ostatní zařízení", chevron: false) }
                        .buttonStyle(.plain)
                        .disabled(signingOutOthers)
                }
                if let othersMessage { Text(othersMessage).font(Typo.small).foregroundStyle(Palette.muted).padding(.horizontal, 4) }
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
        // Once: back from Změnit e-mail, Face ID or Smazat účet, what was typed stays.
        .onAppear { if !filled { fill(); filled = true } }
        .confirmationDialog("Odhlásit ostatní zařízení?", isPresented: $confirmOthers, titleVisibility: .visible) {
            Button("Odhlásit", role: .destructive) { Task { await signOutOthers() } }
            Button("Zrušit", role: .cancel) {}
        } message: {
            Text("Tenhle iPhone zůstane přihlášený.")
        }
    }

    private func signOutOthers() async {
        signingOutOthers = true
        defer { signingOutOthers = false }
        do {
            try await model.api.signOutOtherDevices()
            othersMessage = L10n.tr("Ostatní zařízení jsou odhlášená.")
        } catch {
            othersMessage = APIClient.readable(error).localizedDescription
        }
    }

    static var birthRange: ClosedRange<Date> {
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        return calendar.date(byAdding: .year, value: -100, to: now)!...calendar.date(byAdding: .year, value: -14, to: now)!
    }

    static func years(from birth: Date) -> Int {
        Calendar(identifier: .gregorian).dateComponents([.year], from: birth, to: Date()).year ?? 0
    }

    static let dayFormat: DateFormatter = {
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
            "height": GoalsSettingsView.metric(height, Units.cm, scale: 1),
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

// MARK: - Changing the e-mail

/// Účet → Změnit e-mail: a six-digit code goes to the new address, and that
/// code moves the account there (src/email-login.js handleEmailChange). The
/// data, the subscription and the connections stay with the account; the
/// other devices are signed out, this one stays signed in.
struct EmailChangeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var changed: String?
    @State private var error: String?
    /// Each field its own value: after "Send code" the code field takes the keyboard
    /// (and the code from Mail) instead of it closing with the e-mail field.
    private enum Field { case email, code }
    @FocusState private var focused: Field?

    private var address: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        SettingsPage(title: "Změnit e-mail") {
            if let changed {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "checkmark.circle").scaledFont(36, weight: .light).foregroundStyle(Palette.green)
                        .accessibilityHidden(true)
                    Text(L10n.f("E-mail účtu je teď %@.", changed)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Ostatní zařízení jsou odhlášená.").font(Typo.small).foregroundStyle(Palette.muted)
                }
                PrimaryButton(title: L10n.tr("Hotovo"), systemImage: "checkmark") { dismiss() }
            } else if sent {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Zadej kód z e-mailu").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(L10n.f("Poslali jsme ho na %@. Platí 10 minut.", address)).font(Typo.small).foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    TextField("123456", text: $code)
                        .keyboardType(.numberPad).textContentType(.oneTimeCode)
                        .font(Typo.number(34)).multilineTextAlignment(.center)
                        .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .focused($focused, equals: .code)
                        // Set when the field is there: in the same step as `sent` it doesn't exist yet.
                        .onAppear { focused = .code }
                        .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    PrimaryButton(title: L10n.tr(busy ? "Moment…" : "Změnit"), systemImage: "checkmark", busy: busy) { Task { await verify() } }
                        .disabled(busy || code.count != 6)
                    HStack {
                        Button("Poslat nový kód") { Task { code = ""; await send() } }
                        Spacer()
                        Button("Zadat jinou adresu") { sent = false; code = ""; error = nil; focused = .email }
                    }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.muted).disabled(busy)
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    SettingsGroup(title: "Nový e-mail", footer: "Kód pošleme na novou adresu. Data, předplatné i propojení zůstanou u účtu. Ostatní zařízení se odhlásí.") {
                        TextField("nový e-mail", text: $email)
                            .keyboardType(.emailAddress).textContentType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .submitLabel(.send)
                            .onSubmit { if address.contains("@") { Task { await send() } } }
                            .focused($focused, equals: .email)
                            .onAppear { focused = .email }
                            .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 50)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    PrimaryButton(title: L10n.tr(busy ? "Moment…" : "Poslat kód"), systemImage: "envelope", busy: busy) { Task { await send() } }
                        .disabled(busy || !address.contains("@"))
                }
            }
        }
    }

    private func send() async {
        guard !model.demo, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.api.startEmailChange(email: address)
            sent = true
            error = nil
            focused = .code
        } catch {
            // The server's own words: taken, the same address, too soon…
            self.error = error.localizedDescription
        }
    }

    private func verify() async {
        guard !model.demo, !busy, code.count == 6 else { return }
        busy = true
        defer { busy = false }
        do {
            let moved = try await model.api.verifyEmailChange(email: address, code: code)
            UserDefaults.standard.set(moved, forKey: AvatarStore.emailKey)
            await model.loadAccountInitial()
            error = nil
            changed = moved
        } catch {
            self.error = error.localizedDescription
        }
    }
}
