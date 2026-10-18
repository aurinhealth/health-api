import SwiftUI

// Settings → Synchronizace: where Loadwise sends what the user records.
// A list of the apps it can send to (Apple Zdraví, Google Health,
// Intervals.icu, Wahoo), each with its page: Posílat (planned workouts, done
// activities, health data) and Stahovat (done activities). After a done
// activity a toast says where it went; its sheet shows each app's state.
// Server side: src/sync-destinations.js; Apple Health: AppleHealthExport.swift.

// MARK: - The data behind the screens

@MainActor
@Observable
final class SyncSettingsStore {
    private(set) var destinations: [SyncDestination] = []
    private(set) var loaded = false
    var message: String?
    var working: String?
    let demo: Bool
    private let api: APIClient

    init(api: APIClient, demo: Bool) {
        self.api = api
        self.demo = demo
    }

    func destination(_ id: String) -> SyncDestination? { destinations.first { $0.id == id } }

    func load() async {
        guard !demo else {
            destinations = Self.demoDestinations
            loaded = true
            return
        }
        do {
            destinations = try await api.syncOverview().destinations
            message = nil
            remember()
            // Apple Health's switches live on the iPhone too (writing works without signal).
            if let apple = destination("apple") {
                if apple.prefs != AppleHealthExport.shared.prefs && AppleHealthExport.shared.prefs != .off {
                    replace("apple", prefs: AppleHealthExport.shared.prefs)
                } else {
                    AppleHealthExport.shared.setPrefs(apple.prefs)
                }
            }
        } catch {
            message = error.localizedDescription
            if destinations.isEmpty { destinations = [Self.localApple] }
        }
        loaded = true
    }

    /// Saves one app's switches; for Apple Health iOS asks for permission first.
    func save(_ id: String, _ prefs: SyncPrefs) async {
        guard let before = destination(id)?.prefs else { return }
        replace(id, prefs: prefs)
        if id == "apple" {
            do {
                try await AppleHealthExport.shared.requestAccess(prefs)
            } catch {
                message = error.localizedDescription
                replace(id, prefs: before)
                return
            }
            AppleHealthExport.shared.setPrefs(prefs)
        }
        guard !demo else { return }
        working = id
        defer { working = nil }
        do {
            let saved = try await api.saveSyncPrefs(id, prefs)
            if let i = destinations.firstIndex(where: { $0.id == id }) {
                destinations[i].prefs = saved.prefs
                destinations[i].missingScopes = saved.missingScopes
            }
            message = nil
            remember()
        } catch {
            // Apple Health keeps its switches on the iPhone anyway.
            if id != "apple" { replace(id, prefs: before) }
            message = error.localizedDescription
        }
    }

    private func replace(_ id: String, prefs: SyncPrefs) {
        if let i = destinations.firstIndex(where: { $0.id == id }) { destinations[i].prefs = prefs }
    }

    /// The server apps a done activity goes to, for the toast without signal.
    private func remember() {
        let ids = destinations.filter { $0.id != "apple" && $0.connected == true && $0.prefs.pushActivities }.map(\.id)
        UserDefaults.standard.set(ids, forKey: AppModel.activityDestinationsKey)
    }

    private static let all = SyncSupports(pushPlanned: true, pushActivities: true, pullActivities: true, health: true)
    private static let appleSupports = SyncSupports(pushPlanned: false, pushActivities: true, pullActivities: true, health: true)

    static var localApple: SyncDestination {
        SyncDestination(id: "apple", connected: nil, prefs: AppleHealthExport.shared.prefs, supports: appleSupports, healthTypes: AppleHealthExport.healthTypes)
    }

    static let demoDestinations: [SyncDestination] = [
        SyncDestination(id: "apple", connected: nil, prefs: SyncPrefs(pushPlanned: false, pushActivities: true, pullActivities: true, health: .some(["weight"])),
                        supports: appleSupports, healthTypes: ["weight", "nutrition", "water"]),
        SyncDestination(id: "google", connected: false, prefs: SyncPrefs(pushPlanned: false, pushActivities: false, pullActivities: true, health: .all),
                        supports: SyncSupports(pushPlanned: false, pushActivities: true, pullActivities: true, health: true), healthTypes: ["weight", "nutrition"]),
        SyncDestination(id: "intervals", connected: true, prefs: SyncPrefs(pushPlanned: true, pushActivities: true, pullActivities: true, health: .all),
                        supports: all, healthTypes: ["weight", "bodyFat", "restingHR", "hrv", "sleep", "steps", "spO2", "respiration", "vo2max"])
    ]
}

// MARK: - The app tiles

/// Simple coloured tiles for the apps (not their logos).
struct SyncAppIcon: View {
    let id: String
    var size: CGFloat = 30

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
        ZStack {
            switch id {
            case "apple", "google", "intervals", "wahoo":
                IntegrationIcon(id: id, size: size)
            default:
                shape.fill(Palette.indigo)
                Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Settings → Synchronizace

struct SyncSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var sync: SyncSettingsStore?

    var body: some View {
        SettingsPage(title: "Synchronizace") {
            if let sync {
                if let message = sync.message { Text(message).font(Typo.small).foregroundStyle(Palette.rust) }
                SettingsGroup {
                    ForEach(Array(sync.destinations.enumerated()), id: \.element.id) { index, destination in
                        if index > 0 { SettingsDivider() }
                        NavigationLink {
                            SyncDestinationView(id: destination.id, sync: sync, store: store)
                        } label: {
                            SyncAppRow(id: destination.id, connected: SyncSettingsView.isConnected(destination))
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .task {
            if sync == nil {
                let s = SyncSettingsStore(api: model.api, demo: model.demo)
                sync = s
                await s.load()
            }
        }
    }

    /// "Připojeno": the server has the connection; Apple Health when something is written or read.
    @MainActor
    static func isConnected(_ destination: SyncDestination) -> Bool {
        if destination.id == "apple" {
            return AppleHealthExport.shared.isOn || (AppleHealth.shared.enabled && AppleHealth.shared.categories.contains(.workouts))
        }
        return destination.connected == true
    }
}

/// A row of the list: the tile, the name and "Připojeno" / "Připojit".
struct SyncAppRow: View {
    let id: String
    let connected: Bool

    var body: some View {
        HStack(spacing: 12) {
            SyncAppIcon(id: id)
            Text(verbatim: SyncApp.name(id)).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Text(connected ? "Připojeno" : "Připojit")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(connected ? Palette.green : Palette.blue)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }
}

// MARK: - One app

struct SyncDestinationView: View {
    @Environment(AppModel.self) private var model
    let id: String
    let sync: SyncSettingsStore
    let store: SettingsStore
    @State private var connecting = false
    @State private var note: String?

    private var destination: SyncDestination? { sync.destination(id) }

    var body: some View {
        SettingsPage(title: SyncApp.name(id)) {
            HStack(spacing: 14) {
                SyncAppIcon(id: id, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: SyncApp.name(id)).font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                    if let destination {
                        let on = SyncSettingsView.isConnected(destination)
                        Text(on ? "Připojeno" : "Nepřipojeno").font(Typo.small).foregroundStyle(on ? Palette.green : Palette.muted)
                    }
                }
            }
            if let message = sync.message { Text(message).font(Typo.small).foregroundStyle(Palette.rust) }
            if let note { Text(note).font(Typo.small).foregroundStyle(Palette.muted) }

            if let destination {
                if destination.connected == false {
                    connect(destination)
                } else {
                    if let missing = destination.missingScopes, !missing.isEmpty { googlePermission(missing) }
                    sections(destination)
                }
            }
        }
    }

    // MARK: Sections

    @ViewBuilder
    private func sections(_ destination: SyncDestination) -> some View {
        let s = destination.supports
        SettingsGroup(title: "Posílat") {
            if s.pushPlanned {
                SettingsToggle(title: "Plánované tréninky", isOn: binding(\.pushPlanned))
                SettingsDivider()
            }
            if s.pushActivities {
                SettingsToggle(title: "Hotové aktivity", isOn: binding(\.pushActivities))
            }
            if s.health {
                if s.pushActivities || s.pushPlanned { SettingsDivider() }
                NavigationLink {
                    SyncHealthView(id: id, sync: sync)
                } label: {
                    SettingsRow(title: "Zdravotní data", value: SyncApp.healthValue(destination.prefs.health, of: destination.healthTypes))
                }
                .buttonStyle(.plain)
            }
        }
        .disabled(sync.working == id)
        if s.pullActivities {
            SettingsGroup(title: "Stahovat") {
                if id == "apple" {
                    SettingsToggle(title: "Hotové aktivity", isOn: applePull)
                } else {
                    SettingsToggle(title: "Hotové aktivity", isOn: binding(\.pullActivities))
                }
            }
        }
    }

    private func binding(_ key: WritableKeyPath<SyncPrefs, Bool>) -> Binding<Bool> {
        Binding(get: { sync.destination(id)?.prefs[keyPath: key] ?? false },
                set: { value in
                    guard var prefs = sync.destination(id)?.prefs else { return }
                    prefs[keyPath: key] = value
                    Task { [prefs] in await sync.save(id, prefs) }
                })
    }

    /// Apple Health's download is the HealthKit reading of workouts (Zdroje dat → Apple Health).
    private var applePull: Binding<Bool> {
        Binding(get: { AppleHealth.shared.enabled && AppleHealth.shared.categories.contains(.workouts) },
                set: { value in
                    Task {
                        let health = AppleHealth.shared
                        if value {
                            if health.enabled {
                                await health.update(health.categories.union([.workouts]), api: model.api)
                            } else {
                                _ = await health.connect([.workouts], api: model.api)
                            }
                        } else {
                            let rest = health.categories.subtracting([.workouts])
                            if rest.isEmpty || !health.enabled { health.disconnect() } else { await health.update(rest, api: model.api) }
                        }
                        note = health.message
                    }
                })
    }

    // MARK: Not connected

    @ViewBuilder
    private func connect(_ destination: SyncDestination) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.f("%@ zatím není připojené.", SyncApp.name(id))).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Text("Připoj ho a vyber, co do něj Aurin posílá.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            NavigationLink { SourcesSettingsView(store: store) } label: {
                Text("Připojit ve Zdrojích dat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // MARK: Google permissions

    private func googlePermission(_ missing: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Google zatím nepovolil zápis").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Text(missing.map(Self.scopeName).joined(separator: ", "))
                .font(Typo.small).foregroundStyle(Palette.muted)
            Text("Google se zeptá na zápis váhy a tréninků a na čtení data narození a tras aktivit.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            PrimaryButton(title: L10n.tr("Rozšířit oprávnění Google"), busy: connecting) { Task { await extendGoogle() } }
                .disabled(connecting)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    static func scopeName(_ scope: String) -> String {
        switch scope {
        case "activityWrite": return L10n.tr("zápis tréninků")
        case "weightWrite": return L10n.tr("zápis váhy")
        case "nutritionWrite": return L10n.tr("zápis jídla")
        default: return scope
        }
    }

    private func extendGoogle() async {
        connecting = true
        defer { connecting = false }
        do {
            guard let event = try await model.connect(provider: "google-extra") else { return }
            note = event == "google" ? L10n.tr("Oprávnění Google jsou rozšířená.") : L10n.tr("Připojení se nedokončilo.")
            await sync.load()
            await store.load()
        } catch {
            note = error.localizedDescription
        }
    }
}

// MARK: - Zdravotní data

struct SyncHealthView: View {
    let id: String
    let sync: SyncSettingsStore

    private var destination: SyncDestination? { sync.destination(id) }

    var body: some View {
        SettingsPage(title: "Zdravotní data") {
            if let destination {
                SettingsGroup {
                    SettingsToggle(title: "Vše", isOn: Binding(get: { destination.prefs.health == .all },
                                                              set: { on in set(on ? .all : .some(destination.healthTypes)) }))
                }
                SettingsGroup(footer: footer) {
                    ForEach(Array(destination.healthTypes.enumerated()), id: \.element) { index, type in
                        if index > 0 { SettingsDivider() }
                        Button { toggle(type, in: destination) } label: {
                            HStack(spacing: 12) {
                                Text(verbatim: SyncApp.healthName(type)).font(.body).foregroundStyle(Palette.ink)
                                Spacer(minLength: 8)
                                if destination.prefs.health.allows(type) {
                                    Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                                }
                            }
                            .padding(.horizontal, 16).frame(minHeight: 50)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .disabled(sync.working == id)
            }
        }
    }

    private var footer: String? {
        switch id {
        case "apple": return "Do Apple Zdraví jde jen to, co v Aurinu sám zapíšeš."
        case "google": return "Váhu a jídlo zapsané v Aurinu."
        case "intervals": return "Z Google Health a Apple Zdraví do wellness v Intervals.icu. Co tam už je odjinud, Aurin nepřepíše."
        default: return nil
        }
    }

    private func toggle(_ type: String, in destination: SyncDestination) {
        var chosen: [String]
        switch destination.prefs.health {
        case .all: chosen = destination.healthTypes
        case .some(let types): chosen = types
        }
        if chosen.contains(type) { chosen.removeAll { $0 == type } } else { chosen.append(type) }
        set(.some(destination.healthTypes.filter { chosen.contains($0) }))
    }

    private func set(_ health: SyncHealth) {
        guard var prefs = destination?.prefs else { return }
        prefs.health = health
        Task { [prefs] in await sync.save(id, prefs) }
    }
}

// MARK: - After a done activity

/// "Odesláno do 2 aplikací" with the apps' tiles; tap for each app's state.
struct SyncToastView: View {
    let report: SyncReport
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                HStack(spacing: -8) {
                    ForEach(report.rows.prefix(4)) { row in
                        SyncAppIcon(id: row.destination, size: 24)
                            .overlay(RoundedRectangle(cornerRadius: 24 * 0.27, style: .continuous).stroke(Palette.card, lineWidth: 2))
                    }
                }
                Text(verbatim: L10n.f("Odesláno do %@ %@", String(report.rows.count), Fmt.plural(report.rows.count, "aplikace", "aplikací", "aplikací")))
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                if report.rows.contains(where: { $0.status == .error }) {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Palette.rust)
                        .accessibilityLabel("Něco se nepodařilo odeslat")
                }
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
        }
        .buttonStyle(.plain)
    }
}

/// Each app's state for the activity: ✓, "odešle se", or the error with "Zkusit znovu".
struct SyncStatusSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Odeslání").font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            if let report = model.syncReport {
                Text(verbatim: report.activity.name).font(Typo.small).foregroundStyle(Palette.muted)
                SettingsGroup {
                    ForEach(Array(report.rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { SettingsDivider() }
                        line(row)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.settingsBackground)
    }

    private func line(_ row: SyncReport.Row) -> some View {
        HStack(alignment: .top, spacing: 12) {
            SyncAppIcon(id: row.destination)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: SyncApp.name(row.destination)).font(.body).foregroundStyle(Palette.ink)
                if row.status == .error, let message = row.message {
                    Text(verbatim: message).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            switch row.status {
            case .sent:
                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                    .accessibilityLabel("Odesláno")
            case .pending:
                Text("odešle se").font(.subheadline).foregroundStyle(Palette.muted)
            case .error:
                if row.working {
                    ProgressView()
                } else {
                    Button("Zkusit znovu") { Task { await model.retrySync(row.destination) } }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.blue)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(minHeight: 50)
    }
}
