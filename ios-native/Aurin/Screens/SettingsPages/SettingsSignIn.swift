import SwiftUI

// MARK: - Sign-in and security: the e-mail, Face ID and the other devices

/// Účet → Přihlášení a zabezpečení: the account's e-mail (copy it, change it),
/// Face ID and signing out the other devices.
struct SignInSecurityView: View {
    let store: SettingsStore
    @Environment(AppModel.self) private var model
    @State private var copied = false
    @State private var confirmOthers = false
    @State private var signingOutOthers = false
    @State private var othersMessage: String?
    @AppStorage(AvatarStore.emailKey) private var email = ""

    var body: some View {
        SettingsPage(title: "Přihlášení a zabezpečení", hero: SettingsHero(systemImage: "key.fill", color: Palette.blue, text: "Přihlašuješ se přes Face ID, nebo kódem poslaným na e-mail.")) {
            if !email.isEmpty {
                SettingsGroup(title: "E-mail") {
                    Button {
                        UIPasteboard.general.string = email
                        copied = true
                    } label: {
                        HStack(spacing: 8) {
                            Text(verbatim: email).font(.body).foregroundStyle(Palette.ink).lineLimit(1).truncationMode(.middle)
                            Spacer(minLength: 8)
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
        }
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
}

// MARK: - Sign-in: Face ID passkeys and the other devices

/// Účet → Face ID: the account's passkeys, where they came from and when they
/// were last used. Tapping one offers to remove it; adding one runs the
/// system sheet (Data/Passkeys.swift).
struct PasskeysSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var keys: [PasskeyInfo] = []
    @State private var loaded = false
    @State private var busy = false
    @State private var removing: PasskeyInfo?
    @State private var stepUp: StepUpRequest?
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Face ID", hero: SettingsHero(systemImage: "key.fill", color: Palette.blue, text: "Přihlášení přes Face ID místo kódu.")) {
            if !keys.isEmpty {
                SettingsGroup {
                    ForEach(Array(keys.enumerated()), id: \.element.id) { index, key in
                        if index > 0 { SettingsDivider() }
                        Button { removing = key } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "faceid", color: Palette.ink), title: key.name, subtitle: Self.when(key), chevron: false)
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                    }
                }
            } else if loaded {
                Text("Zatím žádný klíč.").font(Typo.small).foregroundStyle(Palette.muted).padding(.horizontal, 4)
            }
            SettingsGroup {
                Button { Task { await add() } } label: {
                    SettingsRow(title: "Přidat Face ID na tomto iPhonu", chevron: false, titleColor: Palette.blue)
                }
                .buttonStyle(.plain)
                .disabled(busy || !loaded)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
        .confirmationDialog(L10n.f("Odebrat %@?", removing?.name ?? ""), isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Odebrat", role: .destructive) {
                if let key = removing { Task { await remove(key) } }
            }
            Button("Zrušit", role: .cancel) { removing = nil }
        } message: {
            Text("Zařízení, které se s ním přihlásilo, se odhlásí.")
        }
        .stepUpSheet($stepUp)
    }

    private func load() async {
        do { keys = try await model.api.passkeys(); error = nil }
        catch { self.error = APIClient.readable(error).localizedDescription }
        loaded = true
    }

    private func add() async {
        busy = true
        defer { busy = false }
        do {
            try await model.passkeys.register(api: model.api)
            await load()
        } catch APIError.stepUpRequired(_, let info) {
            stepUp = StepUpRequest(info: info, reason: L10n.tr("Nový způsob přihlášení potřebuje krátké ověření.")) { await add() }
        } catch is CancellationError {
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    private func remove(_ key: PasskeyInfo) async {
        busy = true
        defer { busy = false; removing = nil }
        do {
            keys = try await model.api.removePasskey(id: key.id)
            if keys.isEmpty { PasskeyService.remember(false) }
            error = nil
        } catch APIError.stepUpRequired(_, let info) {
            // Removing a way to confirm it's you needs the same check as adding one (src/passkeys.js).
            stepUp = StepUpRequest(info: info, reason: L10n.tr("Odebrání Face ID potřebuje krátké ověření."), destructive: true) { await remove(key) }
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    /// "Přidán 12. 10., naposledy dnes".
    static func when(_ key: PasskeyInfo) -> String? {
        guard let added = day(key.createdAt) else { return nil }
        let first = L10n.f("Přidán %@", added)
        guard let used = day(key.lastUsedAt) else { return first }
        return first + ", " + L10n.f("naposledy %@", used)
    }

    private static func day(_ text: String?) -> String? {
        guard let text, text.count >= 19 else { return nil }
        let parser = DateFormatters.make("yyyy-MM-dd HH:mm:ss", timeZone: TimeZone(identifier: "UTC") ?? .gmt)
        guard let date = parser.date(from: String(text.prefix(19))) else { return nil }
        if Calendar.current.isDateInToday(date) { return L10n.tr("dnes") }
        let pattern = DateFormatter.dateFormat(fromTemplate: "dMMM", options: 0, locale: L10n.locale) ?? "d MMM"
        return DateFormatters.make(pattern, locale: L10n.locale).string(from: date)
    }
}
