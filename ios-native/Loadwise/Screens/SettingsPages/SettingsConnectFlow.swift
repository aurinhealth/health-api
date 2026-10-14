import SwiftUI
import UserNotifications

/// Connecting and disconnecting, shared by Zdroje dat and a service's page.
@MainActor
@Observable
final class SourceActions {
    /// The service being connected right now.
    var working: String?
    var message: String?

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
        // The time of day in the phone's 12/24-hour format.
        let time = ClockText.format(date)
        if Calendar.current.isDateInToday(date) { return L10n.tr("dnes") + " " + time }
        let out = DateFormatter()
        out.locale = Fmt.locale
        out.dateFormat = L10n.isEnglish ? "MMM d," : "d. M."
        return out.string(from: date) + " " + time
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

/// The sheets of connecting (the service's connect screen, the Intervals.icu
/// key) and the disconnect question, each view with its own.
struct ConnectFlowState {
    var connecting: ConnectTarget?
    var intervalsKey = false
    var disconnecting: ConnectionsResponse.Provider?

    /// Every service first shows what Aurin reads and writes (ServiceConnectSheet).
    mutating func start(_ provider: String) {
        connecting = ConnectTarget(id: provider)
    }
}

/// The service a connect screen is for; withKey opens Intervals.icu's API key straight away.
struct ConnectTarget: Identifiable {
    let id: String
    var withKey = false
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
            .sheet(item: $flow.connecting) { target in
                ServiceConnectSheet(target: target) { await store.load() }
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
                // Ultrahuman's data is deleted on disconnecting (src/ultrahuman.js).
                Text(flow.disconnecting?.id == "ultrahuman" ? "Data z prstenu se smažou a noc se zase bude brát z hodinek." : "Data, která už Aurin má, zůstanou. Nová přestanou chodit.")
            }
    }
}

/// One service's connect screen, the same for every service
/// (mockups/pripojeni-sluzeb): the Aurin and service logos, what Aurin reads
/// and writes, the service's own sign-in in the browser sheet, then
/// "… je propojený". Google Health also asks for consent (Google's policy).
struct ServiceConnectSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let target: ConnectTarget
    /// After the service is connected, to reload what shows it.
    var connected: () async -> Void = {}
    @State private var phase = Phase.intro
    @State private var agree = false
    @State private var busy = false
    @State private var error: String?

    enum Phase { case intro, key, done }

    struct Service {
        let name: String
        let reads: String
        let writes: String
        /// Google Health: what for and who gets the data, and the consent switch.
        var google = false
    }

    static func service(_ id: String) -> Service {
        switch id {
        case "google":
            return Service(name: "Google Health",
                           reads: L10n.tr("Aktivitu a kondici (kroky, vzdálenost, aktivní energii, tréninky), zdravotní měření (tep, HRV, okysličení krve, dech, VO₂max, váhu, výšku, tělesný tuk), spánek a záznamy jídla."),
                           writes: L10n.tr("Jen jídlo a pití, které zapíšeš v Aurinu."), google: true)
        case "intervals":
            return Service(name: "Intervals.icu",
                           reads: L10n.tr("Tréninky, plán, zóny a váhu."),
                           writes: L10n.tr("Tréninky naplánované v Aurinu, kalorický cíl, váhu a denní hodnoty z Google Health."))
        case "ultrahuman":
            return Service(name: "Ultrahuman",
                           reads: L10n.tr("Spánek, klidový tep, HRV, VO₂max a teplotu z prstenu."),
                           writes: L10n.tr("Nic."))
        default:
            return Service(name: id, reads: "", writes: L10n.tr("Nic."))
        }
    }

    private var service: Service { Self.service(target.id) }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .intro: intro
                case .key:
                    ScrollView { IntervalsKeyForm { await finished() }.padding(24) }
                case .done: done
                }
            }
            .background(Palette.settingsBackground)
            .toolbar {
                if phase != .done {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { dismiss() } label: { Image(systemName: "xmark") }
                            .accessibilityLabel(Text("Zavřít"))
                    }
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .onAppear { if target.withKey { phase = .key } }
    }

    private func pair(connected: Bool = false) -> some View {
        HStack(spacing: 14) {
            Image("AurinLogo").resizable().interpolation(.high).scaledToFit()
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 72 * 0.26, style: .continuous))
            Text(verbatim: "• • •").font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.faint)
            IntegrationIcon(id: target.id, size: 72)
                .overlay(alignment: .bottomTrailing) {
                    if connected {
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Palette.onAccent)
                            .frame(width: 30, height: 30).background(Palette.green, in: Circle())
                            .overlay(Circle().stroke(Palette.settingsBackground, lineWidth: 3))
                            .offset(x: 8, y: 8)
                    }
                }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    private var intro: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    pair().padding(.top, 8).padding(.bottom, 20)
                    Text(L10n.f("Propojit %@ s Aurinem", service.name))
                        .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.bottom, 22)
                    row("arrow.down", L10n.tr("Aurin čte"), service.reads, first: true)
                    row("arrow.up", L10n.tr("Aurin zapisuje"), service.writes)
                    if service.google {
                        row("target", L10n.tr("K čemu"), L10n.tr("Jen pro funkce aplikace: přehled dne, regenerace, kalorický cíl, plán tréninků a osobní asistent."))
                        row("person.2", L10n.tr("Kdo data dostane"), L10n.tr("Tvůj účet Intervals.icu, když ho připojíš. OpenAI, když použiješ AI funkce, a to jen data potřebná pro odpověď. Nikomu dalšímu je nedáváme, neprodáváme je a nepoužíváme k reklamě."))
                    }
                    row("xmark", L10n.tr("Odpojit"), service.google
                        ? L10n.tr("Kdykoli v Nastavení → Zdroje dat, v Soukromí smažeš účet i se všemi daty.")
                        : L10n.tr("Kdykoli v Nastavení → Zdroje dat."))
                    if service.google {
                        Toggle("Souhlasím, aby Aurin takto používal moje data z Google Health.", isOn: $agree)
                            .font(Typo.small).tint(Palette.green).padding(.top, 14)
                    }
                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 24)
            }
            VStack(spacing: 14) {
                PrimaryButton(title: L10n.f("Pokračovat na %@", service.name), busy: busy) { Task { await connect() } }
                    .disabled(busy || (service.google && !agree))
                    .opacity(service.google && !agree ? 0.5 : 1)
                Link("Zásady ochrany soukromí", destination: URL(string: "https://aurin.health/privacy")!)
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 16)
        }
    }

    private func row(_ symbol: String, _ title: String, _ text: String, first: Bool = false) -> some View {
        VStack(spacing: 0) {
            if !first { Rectangle().fill(Palette.hairline).frame(height: 1) }
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.green)
                    .frame(width: 30, height: 30)
                    .background(Palette.track, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(text).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 13)
        }
    }

    private var done: some View {
        VStack(spacing: 0) {
            Spacer()
            pair(connected: true)
            Text(L10n.f("%@ je propojený", service.name))
                .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center).padding(.top, 22)
            Text("Data se začínají stahovat. Můžeš zatím pokračovat.")
                .font(Typo.small).foregroundStyle(Palette.muted).multilineTextAlignment(.center).padding(.top, 8)
            DownloadBar().padding(.horizontal, 40).padding(.top, 22)
            Spacer()
            PrimaryButton(title: L10n.tr("Hotovo")) { dismiss() }
                .padding(.horizontal, 24).padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
    }

    private func connect() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            guard let event = try await model.connect(provider: target.id) else { return }
            if event == target.id { await finished(); return }
            switch event {
            case "intervals-failed": phase = .key
            case "expired": error = L10n.tr("Odkaz vypršel, zkus to znovu.")
            case let cancelled where cancelled.hasSuffix("-cancelled"): break
            default: error = L10n.tr("Připojení se nedokončilo. Zkus to znovu.")
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func finished() async {
        withAnimation { phase = .done }
        await connected()
    }
}

/// A bar that runs while the first import starts (no progress to show yet).
private struct DownloadBar: View {
    @State private var moving = false

    var body: some View {
        GeometryReader { geo in
            Capsule().fill(Palette.track)
                .overlay(alignment: .leading) {
                    Capsule().fill(Palette.green).frame(width: geo.size.width * 0.35)
                        .offset(x: moving ? geo.size.width * 0.65 : 0)
                }
                .clipShape(Capsule())
        }
        .frame(height: 6)
        .onAppear { withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { moving = true } }
        .accessibilityHidden(true)
    }
}

/// Intervals.icu by its personal API key (Settings → Developer Settings there),
/// when its sign-in is not set up for the app.
struct IntervalsKeySheet: View {
    @Environment(\.dismiss) private var dismiss
    var saved: () async -> Void

    var body: some View {
        NavigationStack {
            VStack { IntervalsKeyForm { await saved(); dismiss() }; Spacer() }
                .padding(24)
                .background(Palette.settingsBackground)
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
    }
}

/// The key field and "Připojit", in its own sheet or on a service's connect screen.
struct IntervalsKeyForm: View {
    @Environment(AppModel.self) private var model
    var saved: () async -> Void
    @State private var key = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("API klíč Intervals.icu").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
            Text("Najdeš ho v Intervals.icu v Settings → Developer Settings.").font(Typo.small).foregroundStyle(Palette.muted)
            SecureField("API klíč", text: $key)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            PrimaryButton(title: saving ? "Ověřuji…" : "Připojit", systemImage: "link", busy: saving) { Task { await save() } }
                .disabled(saving || key.trimmingCharacters(in: .whitespaces).count < 8)
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.connectIntervalsKey(key.trimmingCharacters(in: .whitespacesAndNewlines))
            await saved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
