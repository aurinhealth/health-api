import SwiftUI
import UserNotifications

// MARK: - Privacy and the account

struct PrivacySettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var ai = false
    @State private var aiLoaded = false
    @State private var exportURL: URL?
    @State private var exporting = false
    @State private var confirmDelete = false
    @State private var deleteText = ""
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Soukromí a data") {
            SettingsGroup(footer: "Kouč včetně fotek v chatu, čtení fotek jídla a dohledání potravin posílají potřebná data k AI. Bez souhlasu fungují ostatní části aplikace dál.") {
                SettingsToggle(title: "AI funkce", isOn: Binding(get: { ai }, set: { setAI($0) }), disabled: !aiLoaded || model.demo)
            }
            SettingsGroup {
                if let exportURL {
                    ShareLink(item: exportURL) { SettingsRow(title: "Sdílet soubor s daty", chevron: false, titleColor: Palette.blue) }
                } else {
                    Button { Task { await export() } } label: {
                        SettingsRow(title: exporting ? "Připravuji…" : "Stáhnout moje data", chevron: false, titleColor: Palette.blue)
                    }
                    .buttonStyle(.plain)
                    .disabled(exporting || model.demo)
                }
            }
            SettingsGroup {
                Link(destination: Self.policyURL) {
                    SettingsRow(title: "Zásady ochrany soukromí", chevron: false)
                        .overlay(alignment: .trailing) {
                            Image(systemName: "arrow.up.right.square").font(.system(size: 14)).foregroundStyle(Palette.faint)
                                .padding(.trailing, 18).accessibilityHidden(true)
                        }
                }
                .buttonStyle(.plain)
            }
            SettingsGroup(footer: "Smaže účet i všechna data na serveru. Nejde vrátit. Data v Intervals.icu a Google zůstanou, kde jsou.") {
                Button { confirmDelete = true } label: { SettingsRow(title: "Smazat účet", chevron: false, titleColor: Palette.rust) }
                    .buttonStyle(.plain)
                    .disabled(model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task {
            guard !model.demo else { return }
            ai = (try? await model.api.aiAllowed()) ?? false
            aiLoaded = true
        }
        .alert("Smazat účet?", isPresented: $confirmDelete) {
            TextField("SMAZAT", text: $deleteText).textInputAutocapitalization(.characters)
            Button("Smazat", role: .destructive) { Task { await delete() } }
            Button("Zrušit", role: .cancel) { deleteText = "" }
        } message: {
            Text("Pro potvrzení napiš SMAZAT.")
        }
    }

    /// The policy on aurin.health, in Czech while the app speaks Czech.
    private static var policyURL: URL {
        URL(string: L10n.language == "cs" ? "https://aurin.health/privacy?lang=cs" : "https://aurin.health/privacy")!
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do { exportURL = try await model.api.exportData() } catch { self.error = error.localizedDescription }
    }

    /// Only a change by the user is saved (not the value loaded from the server).
    private func setAI(_ value: Bool) {
        let before = ai
        ai = value
        Task {
            do { try await model.api.setAI(value); error = nil } catch { ai = before; self.error = L10n.f("Změna se neuložila: %@", error.localizedDescription) }
        }
    }

    private func delete() async {
        guard ["SMAZAT", "DELETE"].contains(deleteText.trimmingCharacters(in: .whitespaces).uppercased()) else {
            error = L10n.tr("Účet zůstal: pro smazání je potřeba napsat SMAZAT.")
            return
        }
        do {
            let passkey = await model.api.passkeyHandle()
            try await model.api.deleteAccount()
            // The account's passkeys leave the Passwords app with it.
            if let passkey { PasskeyService.forgetAccount(rpId: passkey.rpId, userHandle: passkey.userHandle) }
            PasskeyService.remember(false)
            AvatarStore.remove()
            model.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
