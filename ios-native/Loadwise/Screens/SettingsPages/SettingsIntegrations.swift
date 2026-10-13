import SwiftUI
import UserNotifications

/// A service to connect in the grid: its icon, name and how.
struct IntegrationTile: View {
    let id: String
    let name: String
    let note: String

    var body: some View {
        VStack(spacing: 8) {
            IntegrationIcon(id: id, size: 50)
            VStack(spacing: 1) {
                Text(verbatim: name).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(verbatim: note).font(Typo.tiny).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .padding(.vertical, 16).padding(.horizontal, 6)
        .frame(maxWidth: .infinity)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One connected service: its icon, name, what it brings and its state.
struct IntegrationCard: View {
    let provider: ConnectionsResponse.Provider
    let lastSync: String?
    var working = false

    var body: some View {
        HStack(spacing: 14) {
            IntegrationIcon(id: provider.id, size: 50)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: provider.name ?? provider.id).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                if let problem = provider.problemText {
                    Text(problem).font(Typo.caption).foregroundStyle(Palette.rust)
                } else {
                    Text(Self.brings(provider.id)).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            Text(working ? L10n.tr("připojuji…") : provider.needsAttention ? L10n.tr("Opravit") : L10n.tr("propojeno"))
                .font(Typo.caption.weight(.semibold))
                .foregroundStyle(provider.needsAttention ? Palette.onButton : working ? Palette.ink : Palette.green)
                .padding(.horizontal, 12).frame(height: 30)
                .background(provider.needsAttention ? Palette.rust : working ? Palette.ink.opacity(0.07) : Palette.greenSoft, in: Capsule())
        }
        .padding(14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .contentShape(Rectangle())
    }

    static func brings(_ id: String) -> String {
        switch id {
        case "apple": return L10n.tr("spánek, tréninky, srdce, pohyb")
        case "intervals": return L10n.tr("tréninky, plán, zóny")
        case "google": return L10n.tr("spánek, tep, kroky")
        case "ultrahuman": return L10n.tr("spánek, HRV, klidový tep, teplota")
        default: return L10n.tr("tréninky")
        }
    }
}

struct IntegrationIcon: View {
    let id: String
    var size: CGFloat = 40

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)
        ZStack {
            switch id {
            case "apple":
                shape.fill(Color.white).overlay(shape.stroke(Color.black.opacity(0.08), lineWidth: 1))
                Image(systemName: "heart.fill").font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(LinearGradient(colors: [Color(light: 0xFF5E7E, dark: 0xFF5E7E), Color(light: 0xF0283C, dark: 0xF0283C)], startPoint: .top, endPoint: .bottom))
            case "google":
                shape.fill(Color.white).overlay(shape.stroke(Color.black.opacity(0.08), lineWidth: 1))
                Image(systemName: "heart.fill").font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(AngularGradient(colors: [Color(light: 0x4285F4, dark: 0x4285F4), Color(light: 0x34A853, dark: 0x34A853), Color(light: 0xFBBC04, dark: 0xFBBC04), Color(light: 0xEA4335, dark: 0xEA4335), Color(light: 0x4285F4, dark: 0x4285F4)], center: .center))
            case "intervals":
                shape.fill(Color(light: 0x1E2A3B, dark: 0x1E2A3B))
                HStack(alignment: .bottom, spacing: size * 0.05) {
                    bar(0x3B8FE0, 0.18)
                    bar(0xE5533D, 0.30)
                    bar(0xF2B33D, 0.24)
                    bar(0xE5533D, 0.38)
                }
            case "strava":
                shape.fill(Color(light: 0xFC4C02, dark: 0xFC4C02))
                Image(systemName: "chevron.up").font(.system(size: size * 0.42, weight: .black)).foregroundStyle(.white)
            case "garmin":
                shape.fill(Color(light: 0x111111, dark: 0x111111))
                Image(systemName: "triangle.fill").font(.system(size: size * 0.38, weight: .bold)).foregroundStyle(.white)
            case "ultrahuman":
                shape.fill(Color(light: 0x111111, dark: 0x111111))
                Text(verbatim: "U").font(.system(size: size * 0.44, weight: .heavy)).foregroundStyle(.white)
            case "wahoo":
                shape.fill(Color(light: 0x0B6FE0, dark: 0x0B6FE0))
                Text(verbatim: "W").font(.system(size: size * 0.42, weight: .black)).foregroundStyle(.white)
            default:
                shape.fill(Palette.indigo)
                Image(systemName: "watch.analog").font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func bar(_ hex: UInt32, _ height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: size * 0.03).fill(Color(light: hex, dark: hex)).frame(width: size * 0.09, height: size * height)
    }
}

/// "Spravovat": the state of one connection, its permissions, sync and disconnect.
struct IntegrationDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let provider: ConnectionsResponse.Provider
    let store: SettingsStore
    let actions: SourceActions
    @State private var flow = ConnectFlowState()
    @State private var syncing = false

    /// The live state after a reconnect or a sync.
    private var current: ConnectionsResponse.Provider { store.connections.first { $0.id == provider.id } ?? provider }

    /// Google Health's permissions (src/google-scopes.js HEALTH_PERMISSIONS).
    static let googlePermissions: [(id: String, title: String)] = [
        ("activity", "Aktivita a tréninky"), ("metrics", "Zdravotní měření"), ("sleep", "Spánek"),
        ("nutritionRead", "Čtení jídla"), ("nutritionWrite", "Zápis jídla")
    ]

    var body: some View {
        SettingsPage(title: current.name ?? current.id) {
            HStack(spacing: 14) {
                IntegrationIcon(id: current.id, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: current.name ?? current.id).font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                    Text(current.connected == true ? (current.problemText ?? L10n.tr("připojeno")) : L10n.tr("nepřipojeno"))
                        .font(Typo.small).foregroundStyle(current.needsAttention ? Palette.rust : Palette.green)
                }
            }

            SettingsGroup(title: "Synchronizace") {
                if let at = current.lastSuccessAt.flatMap(SourceActions.when) {
                    SettingsRow(title: "Naposledy v pořádku", value: at, chevron: false)
                    SettingsDivider()
                }
                if let error = current.lastError, current.needsReconnect == true {
                    SettingsRow(title: "Poslední chyba", subtitle: error, chevron: false)
                    SettingsDivider()
                }
                Button {
                    Task { syncing = true; await store.syncNow(); await store.load(); syncing = false }
                } label: {
                    HStack {
                        Text(syncing ? "Synchronizuji…" : "Synchronizovat znovu").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if syncing { ProgressView() } else { Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Palette.faint) }
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(syncing || store.demo)
            }

            if let metrics = current.metrics, !metrics.isEmpty {
                SettingsGroup(title: "Co odsud bereme") {
                    ForEach(Array(metrics.enumerated()), id: \.offset) { index, metric in
                        if index > 0 { SettingsDivider() }
                        SettingsRow(title: metric, chevron: false)
                    }
                }
            }

            if current.id == "google" {
                let missing = Set((current.missingPermissions ?? []).compactMap(\.string))
                SettingsGroup(title: "Oprávnění", footer: "Oprávnění se mění na stránce Googlu: zaškrtni, co má Aurin číst a zapisovat.") {
                    ForEach(Array(Self.googlePermissions.enumerated()), id: \.offset) { index, permission in
                        if index > 0 { SettingsDivider() }
                        HStack {
                            Text(permission.title).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Image(systemName: missing.contains(permission.id) ? "xmark.circle" : "checkmark.circle.fill")
                                .foregroundStyle(missing.contains(permission.id) ? Palette.rust : Palette.green)
                                .accessibilityLabel(missing.contains(permission.id) ? L10n.tr("nepovoleno") : L10n.tr("povoleno"))
                        }
                        .padding(.horizontal, 16).frame(minHeight: 46)
                    }
                    SettingsDivider()
                    Button { flow.start("google", actions: actions, model: model, store: store, askKey: {}) } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "checklist", color: Palette.blue),
                                    title: missing.isEmpty ? "Upravit oprávnění" : "Povolit chybějící", chevron: false)
                    }
                    .buttonStyle(.plain)
                    .disabled(actions.working != nil || store.demo)
                }
            } else if current.id == "apple" {
                AppleHealthSettings(store: store)
            } else if current.id == "intervals" {
                SettingsGroup(title: "Přístup", footer: "Klíč najdeš v Intervals.icu v Settings → Developer Settings.") {
                    Button { flow.start("intervals", actions: actions, model: model, store: store, askKey: { flow.intervalsKey = true }) } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "link", color: Palette.rust), title: "Připojit znovu", chevron: false)
                    }
                    .buttonStyle(.plain)
                    SettingsDivider()
                    Button { flow.intervalsKey = true } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "key.fill", color: Palette.amberBar), title: "Vložit nový API klíč", chevron: false)
                    }
                    .buttonStyle(.plain)
                }
                .disabled(actions.working != nil || store.demo)
            }

            SettingsGroup {
                Button { flow.disconnecting = current } label: {
                    SettingsRow(title: current.id == "ultrahuman" ? "Odpojit a smazat data z prstenu" : "Odpojit", chevron: false, titleColor: Palette.rust)
                }
                .buttonStyle(.plain)
                .disabled(store.demo)
            }

            if let message = actions.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .connectFlow($flow, actions: actions, store: store, disconnected: { dismiss() })
    }
}

/// "+": the services that can still be connected, in sections.
struct AddIntegrationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let available: [ConnectionsResponse.Provider]
    var appleConnected = false
    let connect: (String) -> Void

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Přidat propojení") {
                let health = available.filter { $0.id == "google" }
                let training = available.filter { $0.id == "intervals" }
                SettingsGroup(title: "Zdraví a spánek") {
                    ForEach(health) { provider in
                        row(provider, subtitle: L10n.tr("spánek, tep, HRV, kroky, váha a jídlo"))
                        SettingsDivider()
                    }
                    if appleConnected {
                        SettingsRow(icon: SettingsIcon(systemImage: "heart.fill", color: Color(light: 0xE5484D, dark: 0xF2777A)), title: "Apple Health",
                                    subtitle: L10n.tr("připojeno"), chevron: false)
                    } else if AppleHealth.shared.isAvailable {
                        appleRow
                    }
                }
                // A connected Intervals.icu is in Zdroje dat already; nothing to add here then.
                if !training.isEmpty {
                    SettingsGroup(title: "Tréninky") {
                        ForEach(Array(training.enumerated()), id: \.element.id) { index, provider in
                            if index > 0 { SettingsDivider() }
                            row(provider, subtitle: L10n.tr("aktivity, plán tréninků, forma a wellness"))
                        }
                    }
                }
                SettingsGroup(title: "Hodinky a další aplikace", footer: "Garmin, Polar, Suunto, Coros, Wahoo, Oura nebo Strava připoj v Intervals.icu. Aurin jejich data dostane odtamtud.") {
                    Link(destination: URL(string: "https://intervals.icu/settings")!) {
                        SettingsRow(icon: SettingsIcon(systemImage: "applewatch", color: Palette.indigo), title: "Přes Intervals.icu",
                                    subtitle: "Garmin, Polar, Suunto, Coros, Wahoo, Oura, Strava")
                    }
                    .buttonStyle(.plain)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
    }

    /// Apple Health is read on the phone, so it is not in the server's list until connected.
    private var appleRow: some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: "apple", size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Health").font(.body).foregroundStyle(Palette.ink)
                Text("spánek, tréninky, tep, HRV, kroky a váha").font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button(L10n.tr("Připojit")) { connect("apple") }
                .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(Palette.ink.opacity(0.07), in: Capsule())
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 50)
    }

    private func row(_ provider: ConnectionsResponse.Provider, subtitle: String) -> some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: provider.id, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: provider.name ?? provider.id).font(.body).foregroundStyle(Palette.ink)
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button(L10n.tr("Připojit")) { connect(provider.id) }
                .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(Palette.ink.opacity(0.07), in: Capsule())
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 50)
    }
}
