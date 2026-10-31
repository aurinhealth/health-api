import LocalAuthentication
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
    @State private var pausing = false
    @State private var stepUp: StepUpRequest?
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Soukromí a data") {
            // What happens to the data, in four lines (the policy says it in full).
            SettingsGroup {
                fact("globe.europe.africa", Palette.blue, "Uložená v EU", "Tvoje data leží v databázi Aurinu v Evropě, šifrovaná.")
                SettingsDivider()
                fact("nosign", Palette.amber, "Nikdy je neprodáme", "Žádné reklamy ani prodejci dat. Sdílíme je jen se službami, které připojíš.")
                SettingsDivider()
                fact("sparkles", Palette.indigo, "AI jen s tvým souhlasem", "Kouč a fotky jídla posílají jen to, co otázka potřebuje. OpenAI se na nich neučí.")
                SettingsDivider()
                fact("tray.and.arrow.down", Palette.green, "Stáhneš, pozastavíš, nebo smažeš", "Všechno si stáhneš, zdravotní data pozastavíš, nebo smažeš účet, přímo tady.")
            }
            // Paused health data takes the AI consent with it (src/health-pause.js).
            if !model.healthPaused {
                SettingsGroup(footer: "Kouč včetně fotek v chatu, čtení fotek jídla a dohledání potravin posílají potřebná data k AI. Bez souhlasu fungují ostatní části aplikace dál.") {
                    SettingsToggle(title: "AI funkce", isOn: Binding(get: { ai }, set: { setAI($0) }), disabled: !aiLoaded || model.demo)
                }
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
                            Image(systemName: "arrow.up.right.square").scaledFont(14).foregroundStyle(Palette.faint)
                                .padding(.trailing, 18).accessibilityHidden(true)
                        }
                }
                .buttonStyle(.plain)
            }
            // Taking back the consent to health data without deleting the account (GDPR art. 7(3)).
            if !model.healthPaused {
                SettingsGroup(footer: "Odvolá souhlas a smaže tvoje zdravotní data. Účet a Pro zůstanou.") {
                    Button { pausing = true } label: { SettingsRow(title: "Pozastavit zdravotní data") }
                        .buttonStyle(.plain)
                        .disabled(model.demo)
                }
            }
            SettingsGroup(footer: "Smaže účet i všechna data na serveru. Nejde vrátit. Data v Intervals.icu a Google zůstanou, kde jsou.") {
                Button { confirmDelete = true } label: { SettingsRow(title: "Smazat účet", chevron: false, titleColor: Palette.rust) }
                    .buttonStyle(.plain)
                    .disabled(model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .sheet(isPresented: $pausing) { HealthPauseSheet { dismiss() } }
        .task {
            guard !model.demo, !model.healthPaused else { return }
            ai = (try? await model.api.aiAllowed()) ?? false
            aiLoaded = true
        }
        // Shared or not, the export does not stay on the phone after the page.
        .onDisappear {
            guard exportURL != nil else { return }
            exportURL = nil
            APIClient.removeExports()
        }
        // One question with a red button, Face ID or the phone's code, then "Confirm it's you" when the server asks for it (delete()).
        .confirmationDialog("Smazat účet?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat účet", role: .destructive) { Task { await delete() } }
            Button("Zrušit", role: .cancel) {}
        } message: {
            Text("Všechno, co pro tebe Aurin uchovává, zmizí a nejde to obnovit.")
        }
        .stepUpSheet($stepUp)
    }

    private func fact(_ symbol: String, _ color: Color, _ title: String, _ text: String) -> some View {
        SettingsRow(icon: SettingsIcon(systemImage: symbol, color: color), title: title, subtitle: text, chevron: false)
            .accessibilityElement(children: .combine)
    }

    /// The policy on aurin.health, in Czech while the app speaks Czech.
    private static var policyURL: URL {
        URL(string: L10n.language == "cs" ? "https://aurin.health/privacy?lang=cs" : "https://aurin.health/privacy")!
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do {
            exportURL = try await model.api.exportData()
            error = nil
        } catch APIError.stepUpRequired(_, let info) {
            stepUp = StepUpRequest(info: info, reason: L10n.tr("Stažení všech dat potřebuje krátké ověření.")) { await export() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Only a change by the user is saved (not the value loaded from the server).
    private func setAI(_ value: Bool) {
        let before = ai
        ai = value
        Task {
            do { try await model.api.setAI(value); error = nil } catch { ai = before; self.error = L10n.f("Změna se neuložila: %@", error.localizedDescription) }
        }
    }

    /// Face ID, Touch ID or the phone's code, so someone holding an unlocked
    /// phone cannot delete the account in two taps (a sign-in a moment ago spares
    /// the server's check below, this one never). A phone with no code set has
    /// nothing to ask; the question before is the confirmation then.
    /// Pausing health data asks the same (HealthPauseSheet), with its own reason.
    static func ownerConfirms(_ reason: String = L10n.tr("Smazat účet Aurin")) async -> Bool {
        let context = LAContext()
        var unavailable: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &unavailable) else { return true }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }

    /// The phone's owner first (ownerConfirms), then the server asks to confirm
    /// it's you (a passkey or a code to the e-mail) unless that happened a moment
    /// ago, so neither someone holding the phone nor someone with a copied
    /// sign-in deletes the account. After that check the phone isn't asked again.
    private func delete(ownerConfirmed: Bool = false) async {
        if !ownerConfirmed {
            guard await Self.ownerConfirms() else { return }
        }
        do {
            let passkey = await model.api.passkeyHandle()
            try await model.api.deleteAccount()
            // The account's passkeys leave the Passwords app with it.
            if let passkey { PasskeyService.forgetAccount(rpId: passkey.rpId, userHandle: passkey.userHandle) }
            PasskeyService.remember(false)
            AvatarStore.remove()
            model.signOut()
        } catch APIError.stepUpRequired(_, let info) {
            stepUp = StepUpRequest(info: info, reason: L10n.tr("Smazání účtu potřebuje krátké ověření."), destructive: true) { await delete(ownerConfirmed: true) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
