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
                fact("globe.europe.africa", "Uložená v EU", "Tvoje data leží v databázi Aurinu v Evropě, šifrovaná.")
                SettingsDivider()
                fact("nosign", "Nikdy je neprodáme", "Žádné reklamy ani prodejci dat. Sdílíme je jen se službami, které připojíš, s OpenAI po tvém souhlasu a s firmami, které pro nás Aurin provozují.")
                SettingsDivider()
                fact(nil, "AI jen s tvým souhlasem", "Kouč a fotky jídla posílají jen to, co otázka potřebuje. OpenAI se na nich neučí.")
            }
            SettingsGroup {
                if let exportURL {
                    ShareLink(item: exportURL) { SettingsRow(title: "Sdílet soubor s daty", chevron: false) }
                } else {
                    Button { Task { await export() } } label: {
                        SettingsRow(title: exporting ? "Připravuji…" : "Stáhnout moje data", chevron: false)
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
                        // Ink with a chevron: it opens a sheet that explains first (602 point 106).
                        SettingsRow(title: "Odvolat souhlas se zdravotními daty")
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

    /// A fact with its symbol in a small square tile (the concept's 40 pt tile
    /// for things); the AI fact carries the coach's two lights (nil symbol).
    private func fact(_ symbol: String?, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Group {
                if let symbol {
                    Image(systemName: symbol).font(.system(size: 17, weight: .regular)).foregroundStyle(Palette.secondary)
                } else {
                    TwoLights(size: 18)
                }
            }
            .frame(width: 40, height: 40)
            .background(Palette.track, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Text(text).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
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
            // A later account with the same id never counts as the one that connected Apple Health here.
            AppleHealth.shared.disconnect()
            model.signOut()
        } catch APIError.stepUpRequired(_, let info) {
            stepUp = StepUpRequest(info: info, reason: L10n.tr("Smazání účtu potřebuje krátké ověření."), destructive: true) { await delete(ownerConfirmed: true) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
