import SwiftUI

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
        SettingsPage(title: "Face ID") {
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
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    /// "Přidán 12. 10. · naposledy dnes".
    static func when(_ key: PasskeyInfo) -> String? {
        guard let added = day(key.createdAt) else { return nil }
        let first = L10n.f("Přidán %@", added)
        guard let used = day(key.lastUsedAt) else { return first }
        return first + " · " + L10n.f("naposledy %@", used)
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
