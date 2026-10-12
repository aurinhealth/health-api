import SwiftUI
import UserNotifications

/// Connecting and disconnecting, shared by Zdroje dat and a service's page.
@MainActor
@Observable
final class SourceActions {
    /// The service being connected right now.
    var working: String?
    var message: String?

    /// true when Intervals.icu's sign-in failed and the API key should be asked for.
    func connect(_ provider: String, model: AppModel, store: SettingsStore) async -> Bool {
        working = provider
        defer { working = nil }
        do {
            guard let event = try await model.connect(provider: provider) else { return false }
            var askKey = false
            switch event {
            case "google", "intervals":
                message = L10n.f("%@ je připojené, data se začínají stahovat.", provider == "google" ? "Google" : "Intervals.icu")
            case "intervals-failed":
                message = L10n.tr("Připojení Intervals.icu se nepovedlo. Zkus vložit API klíč.")
                askKey = true
            case "expired": message = L10n.tr("Odkaz vypršel, zkus to znovu.")
            default: message = L10n.tr("Připojení se nedokončilo.")
            }
            await store.load()
            return askKey
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func disconnect(_ provider: String, model: AppModel, store: SettingsStore) async -> Bool {
        if provider == "apple" { AppleHealth.shared.disconnect() }
        do {
            try await model.api.disconnect(provider: provider)
            message = L10n.tr("Odpojeno.")
            await store.load()
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    /// "dnes 13:29" or "8. 10. 13:29" from the server's ISO or SQLite time.
    static func when(_ text: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: text) ?? ISO8601DateFormatter().date(from: text) ?? sqlite.date(from: text)
        guard let date else { return nil }
        let out = DateFormatter()
        out.locale = Fmt.locale
        if L10n.isEnglish {
            out.dateFormat = Calendar.current.isDateInToday(date) ? "'today' h:mm a" : "MMM d, h:mm a"
        } else {
            out.dateFormat = Calendar.current.isDateInToday(date) ? "'dnes' H:mm" : "d. M. H:mm"
        }
        return out.string(from: date)
    }

    /// "2026-10-08 12:02:00" (SQLite CURRENT_TIMESTAMP, UTC).
    private static let sqlite: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()
}

/// The sheets of connecting (Google's disclosure, the Intervals.icu key) and
/// the disconnect question, each view with its own.
struct ConnectFlowState {
    var googleDisclosure = false
    var intervalsKey = false
    var disconnecting: ConnectionsResponse.Provider?

    /// Google first shows what Loadwise does with the data (Google's policy).
    /// askKey: Intervals.icu's sign-in failed, show the API key sheet.
    @MainActor
    mutating func start(_ provider: String, actions: SourceActions, model: AppModel, store: SettingsStore, askKey: @escaping @MainActor () -> Void) {
        if provider == "google" {
            googleDisclosure = true
        } else {
            Task { @MainActor in if await actions.connect(provider, model: model, store: store) { askKey() } }
        }
    }
}

extension View {
    func connectFlow(_ flow: Binding<ConnectFlowState>, actions: SourceActions, store: SettingsStore, disconnected: @escaping () -> Void = {}) -> some View {
        modifier(ConnectFlowSheets(flow: flow, actions: actions, store: store, disconnected: disconnected))
    }
}

struct ConnectFlowSheets: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var flow: ConnectFlowState
    let actions: SourceActions
    let store: SettingsStore
    let disconnected: () -> Void

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $flow.googleDisclosure) {
                GoogleDisclosureSheet {
                    flow.googleDisclosure = false
                    // The browser sheet opens once this one has closed.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        Task { _ = await actions.connect("google", model: model, store: store) }
                    }
                }
            }
            .sheet(isPresented: $flow.intervalsKey) {
                IntervalsKeySheet { await store.load(); actions.message = L10n.tr("Intervals.icu je připojené.") }
            }
            .confirmationDialog(L10n.f("Odpojit %@?", flow.disconnecting?.name ?? ""),
                                isPresented: Binding(get: { flow.disconnecting != nil }, set: { if !$0 { flow.disconnecting = nil } }),
                                titleVisibility: .visible) {
                Button("Odpojit", role: .destructive) {
                    if let p = flow.disconnecting {
                        Task { if await actions.disconnect(p.id, model: model, store: store) { disconnected() } }
                    }
                }
            } message: {
                Text("Data, která už Loadwise má, zůstanou. Nová přestanou chodit.")
            }
    }
}

/// What Loadwise reads and writes in Google Health, before Google's own consent.
struct GoogleDisclosureSheet: View {
    @Environment(\.dismiss) private var dismiss
    var proceed: () -> Void
    @State private var agree = false

    private let items: [(String, String)] = [
        ("Co čteme", "Z Google Health aktivitu a kondici (kroky, vzdálenost, aktivní energii, tréninky), zdravotní měření (tep, HRV, okysličení krve, dech, VO₂max, váhu, výšku, tělesný tuk), spánek a záznamy jídla."),
        ("Co zapisujeme", "Do Google Health jen jídlo a pití, které si tady zapíšeš."),
        ("K čemu", "Jen pro funkce aplikace: přehled dne, regenerace, kalorický cíl, plán tréninků a osobní asistent."),
        ("Kdo data dostane", "Tvůj účet Intervals.icu, když ho připojíš. OpenAI, když použiješ AI funkce, a to jen data potřebná pro odpověď. Nikomu dalšímu je nedáváme, neprodáváme je a nepoužíváme k reklamě."),
        ("Kdykoli", "Google Health odpojíš v Nastavení → Zdroje dat, v Soukromí smažeš účet i se všemi daty.")
    ]

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Připojení Google Health").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    ForEach(items, id: \.0) { item in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.0).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(item.1).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Toggle("Souhlasím, aby Loadwise takto používal moje data z Google Health.", isOn: $agree)
                        .font(Typo.small).tint(Palette.green).padding(.top, 6)
                    Link("Zásady ochrany soukromí", destination: URL(string: "https://petrfitnessdata.eu/privacy")!).font(Typo.small)
                    PrimaryButton(title: "Pokračovat na Google", systemImage: "arrow.up.forward") { proceed() }
                        .disabled(!agree).opacity(agree ? 1 : 0.5).padding(.top, 6)
                }
                .padding(24)
            }
            .background(Palette.settingsBackground)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
    }
}

/// Intervals.icu by its personal API key (Settings → Developer Settings there),
/// when its sign-in is not set up for the app.
struct IntervalsKeySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var saved: () async -> Void
    @State private var key = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("API klíč Intervals.icu").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Najdeš ho v Intervals.icu v Settings → Developer Settings.").font(Typo.small).foregroundStyle(Palette.muted)
                SecureField("API klíč", text: $key)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: saving ? "Ověřuji…" : "Připojit", systemImage: "link", busy: saving) { Task { await save() } }
                    .disabled(saving || key.trimmingCharacters(in: .whitespaces).count < 8)
                Spacer()
            }
            .padding(24)
            .background(Palette.settingsBackground)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.connectIntervalsKey(key.trimmingCharacters(in: .whitespacesAndNewlines))
            await saved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
