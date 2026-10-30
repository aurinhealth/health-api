import SwiftUI

// MARK: - Pausing health data (Settings → Soukromí a data, AppModel+HealthPause)

/// What stops, what is deleted at once and what stays, the download first,
/// then the pause behind Face ID or the phone's code (src/health-pause.js).
struct HealthPauseSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// Paused: the settings close too, the app shows the paused screen.
    let paused: () -> Void
    @State private var exportURL: URL?
    @State private var exporting = false
    @State private var pausing = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Pozastavit zdravotní data").font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Aurin přestane tvoje zdravotní data používat a smaže, co z nich uchovává.")
                    .font(Typo.sentence(17)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                section("Zastaví se")
                point("Čtení z Apple Health, Googlu a dalších služeb", mark: .stop)
                point("Posílání do Intervals.icu, AI kouči a v oznámeních", mark: .stop)
                section("Hned se smaže")
                point("Spánek, tep, HRV, váha, jídlo, tréninky, deník a cyklus", mark: .deleted)
                section("Zůstane")
                point("Účet, přihlášení, Pro, nastavení a připojené služby (pozastavené)", mark: .kept)
                point("Pro se dál obnovuje. Pokud chceš, zruš ho v App Store.", mark: .note)
                Text("Když to znovu zapneš, dáš nový souhlas a Aurin načte historii z Apple Health a Googlu. Co jsi zadal ručně, se vrátí jen ze staženého souboru.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
                if let exportURL {
                    ShareLink(item: exportURL) { outlined("Sdílet soubor s daty") }
                        .buttonStyle(.plain)
                        .padding(.top, 16)
                } else {
                    Button { Task { await export() } } label: { outlined(exporting ? "Připravuji…" : "Nejdřív stáhnout moje data") }
                        .buttonStyle(.plain)
                        .disabled(exporting || pausing)
                        .padding(.top, 16)
                }
                Button { Task { await pause() } } label: {
                    HStack(spacing: 8) {
                        if pausing { ProgressView().tint(.white) }
                        Text("Pozastavit a smazat")
                    }
                    .font(Typo.bodyStrong).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.rust, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(pausing || exporting || model.demo)
                .padding(.top, 10)
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .interactiveDismissDisabled(pausing)
    }

    private enum Mark { case stop, deleted, kept, note }

    private func section(_ title: LocalizedStringKey) -> some View {
        Text(title).font(Typo.caption).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.muted)
            .padding(.top, 18).padding(.bottom, 4)
    }

    private func point(_ text: LocalizedStringKey, mark: Mark) -> some View {
        let symbol = switch mark { case .stop, .deleted: "xmark"; case .kept: "checkmark"; case .note: "info.circle" }
        let color = switch mark { case .stop, .note: Palette.muted; case .deleted: Palette.rust; case .kept: Palette.green }
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol).font(.footnote.weight(.semibold)).foregroundStyle(color).frame(width: 16)
            Text(text).font(.body).foregroundStyle(mark == .note ? Palette.secondary : Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 5)
    }

    private func outlined(_ title: LocalizedStringKey) -> some View {
        Text(title).font(Typo.body).foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 46)
            .overlay { Capsule().stroke(Palette.ink.opacity(0.18)) }
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do { exportURL = try await model.api.exportData(); error = nil } catch { self.error = error.localizedDescription }
    }

    private func pause() async {
        guard await PrivacySettingsView.ownerConfirms(L10n.tr("Pozastavit zdravotní data")) else { return }
        pausing = true
        defer { pausing = false }
        do {
            try await model.pauseHealthData()
            dismiss()
            paused()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The app while health data is paused: no Today, coach, food or gym without
/// it. "Zapnout znovu" leads to the consent (SetupFlowView), Settings to the
/// account, Pro and Soukromí a data.
struct HealthPausedView: View {
    @Environment(AppModel.self) private var model
    @State private var showSettings = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(spacing: 0) {
                Spacer()
                Image(systemName: "pause.fill")
                    .scaledFont(30, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .frame(width: 84, height: 84)
                    .cardSurface(cornerRadius: 24)
                    .accessibilityHidden(true)
                Text("Zdravotní data jsou pozastavená")
                    .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .padding(.top, 22)
                Text("Aurin tvoje zdravotní data nečte ani neuchovává. Zapnout je můžeš kdykoli.")
                    .font(Typo.sentence(17)).foregroundStyle(Palette.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                Spacer()
                PrimaryButton(title: L10n.tr("Zapnout znovu")) { model.turnHealthBackOn() }
                Button { showSettings = true } label: {
                    Text("Nastavení").font(Typo.body).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18)) }
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .sheet(isPresented: $showSettings) { PausedSettingsView() }
    }
}

/// Settings while health data is paused: only what holds no health data.
struct PausedSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Nastavení") {
                ProSettingsRow()
                SettingsGroup {
                    NavigationLink { PrivacySettingsView() } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "lock", color: Palette.muted), title: "Soukromí a data")
                    }
                }
                .buttonStyle(.plain)
                SettingsGroup {
                    Button {
                        Task {
                            await model.logout()
                            dismiss()
                        }
                    } label: { SettingsRow(title: "Odhlásit se", chevron: false, titleColor: Palette.rust) }
                    .buttonStyle(.plain)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").scaledFont(14, weight: .semibold) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
    }
}
