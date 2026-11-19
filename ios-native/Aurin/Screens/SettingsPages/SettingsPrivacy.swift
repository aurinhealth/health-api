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
    /// A consent that did not save: shown under the consents, not at the bottom.
    @State private var consentError: String?

    var body: some View {
        SettingsPage(title: "Soukromí a data", hero: SettingsHero(systemImage: "lock.fill", color: Palette.brown, text: "Tvoje data jsou tvoje. Tady je, kde leží a co ovládáš.")) {
            // Every consent and data switch lives here (Petr 2026-11-13); the
            // feature pages only link here. Paused health data takes them all
            // with it (src/health-pause.js).
            if !model.healthPaused {
                PrivacyConsentsGroup(ai: $ai, aiLoaded: aiLoaded, setAI: setAI, error: $consentError)
                if let consentError {
                    Text(consentError).font(Typo.small).foregroundStyle(Palette.rust)
                        .onAppear { AccessibilityNotification.Announcement(consentError).post() }
                }
            }
            // What happens to the data, in three lines (the policy says it in full).
            SettingsGroup(title: "Tvoje data") {
                fact("globe.europe.africa", Palette.blue, "Uložená v EU", "Tvoje data leží v databázi Aurinu v Evropě, šifrovaná.")
                SettingsDivider()
                fact("nosign", Palette.amber, "Nikdy je neprodáme", "Žádné reklamy ani prodejci dat. Sdílíme je jen se službami, které připojíš.")
                SettingsDivider()
                fact("sparkles", Palette.indigo, "AI jen s tvým souhlasem", "Kouč a fotky jídla posílají jen to, co otázka potřebuje. OpenAI se na nich neučí.")
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
                SettingsDivider()
                Link(destination: L10n.legalURL("privacy")) {
                    SettingsRow(title: "Zásady ochrany soukromí", chevron: false)
                        .overlay(alignment: .trailing) {
                            Image(systemName: "arrow.up.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                                .padding(.trailing, 18).accessibilityHidden(true)
                        }
                }
                .buttonStyle(.plain)
            }
            // Taking back the consent to health data without deleting the account
            // (GDPR art. 7(3)); "withdraw", the word the onboarding promises (PRIV-3).
            if !model.healthPaused {
                SettingsGroup(footer: "Odvolá souhlas a smaže tvoje zdravotní data. Účet a Pro zůstanou. Nejdřív ti ukážeme, co se stane.") {
                    Button { pausing = true } label: {
                        SettingsRow(title: "Odvolat souhlas se zdravotními daty", chevron: false, titleColor: Palette.rust)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Nejdřív ukáže, co se smaže a co zůstane.")
                        .disabled(model.demo)
                }
            }
            SettingsGroup(footer: "Smaže účet i všechna data na serveru. Nejde vrátit. Data v Apple Health, Intervals.icu, Google a Wahoo zůstanou, kde jsou.") {
                Button { confirmDelete = true } label: { SettingsRow(title: "Smazat účet", chevron: false, titleColor: Palette.rust) }
                    .buttonStyle(.plain)
                    .disabled(model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .environment(\.inPrivacySettings, true)
        .sheet(isPresented: $pausing) { HealthPauseSheet { dismiss() } }
        .task {
            guard !model.demo, !model.healthPaused else { return }
            guard let allowed = try? await model.api.aiAllowed() else { return }
            ai = allowed
            aiLoaded = true
            model.setAIOff(!allowed)
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
            // Apple's account-deletion guidance: billing goes on until cancelled in the App Store.
            Text(verbatim: ProStore.shared.entitled
                 ? L10n.tr("Všechno, co pro tebe Aurin uchovává, zmizí a nejde to obnovit. Předplatné Aurin Pro se tím nezruší, zrušíš ho v App Store.")
                 : L10n.tr("Všechno, co pro tebe Aurin uchovává, zmizí a nejde to obnovit."))
        }
        .stepUpSheet($stepUp)
    }

    private func fact(_ symbol: String, _ color: Color, _ title: String, _ text: String) -> some View {
        SettingsRow(icon: SettingsIcon(systemImage: symbol, color: color), title: title, subtitle: text, chevron: false)
            .accessibilityElement(children: .combine)
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
    /// Turning it on goes through the consent card (PrivacyConsentsGroup), which gives the consent itself.
    private func setAI(_ value: Bool) {
        let before = ai
        ai = value
        Task {
            do { try await model.api.setAI(value); model.setAIOff(!value); consentError = nil } catch { ai = before; consentError = L10n.f("Změna se neuložila: %@", error.localizedDescription) }
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
