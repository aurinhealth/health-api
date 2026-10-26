import SwiftUI

// Where Aurin sends what the user records: Apple Health, Google Health,
// Intervals.icu and Wahoo. Each service's page in Zdroje dat
// (IntegrationDetailView) shows "Aurin posílá" (planned workouts, done
// activities, health data) and the download of done activities under "Aurin
// čte". After a done activity a toast says where it went; its sheet shows
// each app's state.
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

    /// The server apps a done activity goes to, for the toast without signal,
    /// and what Google Health gets, so Apple Health does not carry it to Google twice.
    private func remember() {
        let ids = destinations.filter { $0.id != "apple" && $0.connected == true && $0.prefs.pushActivities }.map(\.id)
        UserDefaults.standard.set(ids, forKey: AppModel.activityDestinationsKey)
        AppleHealthExport.shared.setGoogle(destination("google"))
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

// MARK: - A service's page in Zdroje dat: what Aurin reads and sends

/// "Tréninky" under Aurin čte: the done activities downloaded from the service.
/// Apple Health's is the Tréninky switch of its reading, so it has none here.
struct SyncPullToggle: View {
    let id: String
    let sync: SyncSettingsStore

    var body: some View {
        if id != "apple", let destination = sync.destination(id), destination.supports.pullActivities {
            SettingsToggle(title: "Tréninky", isOn: SyncSendGroup.binding(id, \.pullActivities, sync: sync))
                .disabled(sync.working == id)
        }
    }
}

/// "Aurin posílá": planned workouts, done workouts and health data. For
/// Google a switch turned on without its write permission asks to go to
/// Google's page right away (google-extra).
struct SyncSendGroup: View {
    @Environment(AppModel.self) private var model
    let id: String
    let sync: SyncSettingsStore
    let store: SettingsStore
    @State private var asking = false
    @State private var connecting = false
    @State private var note: String?

    private var destination: SyncDestination? { sync.destination(id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) { content }
            .sheet(isPresented: $asking) {
                GoogleWriteSheet(missing: destination?.missingScopes ?? [], busy: connecting) { await extendGoogle() }
            }
    }

    @ViewBuilder
    private var content: some View {
        if let destination, destination.supports.pushPlanned || destination.supports.pushActivities || destination.supports.health {
            let s = destination.supports
            let missing = destination.missingScopes ?? []
            SettingsGroup(title: "Aurin posílá", footer: footer) {
                if s.pushPlanned {
                    SettingsToggle(title: "Plánované tréninky", isOn: binding(\.pushPlanned))
                }
                if s.pushActivities {
                    if s.pushPlanned { SettingsDivider() }
                    SettingsToggle(title: "Hotové tréninky", isOn: binding(\.pushActivities))
                }
                if s.health {
                    if s.pushActivities || s.pushPlanned { SettingsDivider() }
                    NavigationLink {
                        SyncHealthView(id: id, sync: sync, saved: { await ask() })
                    } label: {
                        SettingsRow(title: "Zdravotní data", value: SyncApp.healthValue(destination.prefs.health, of: destination.healthTypes))
                    }
                    .buttonStyle(.plain)
                }
                // "Teď ne" on Google's question: the switch stays, so does the way to allow it.
                if !missing.isEmpty {
                    SettingsDivider()
                    Button { asking = true } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust),
                                    title: "Google zatím nepovolil zápis", subtitle: Self.scopeList(missing))
                    }
                    .buttonStyle(.plain)
                }
            }
            .disabled(sync.working == id)
            if let note { Text(note).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
            if let message = sync.message { Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true) }
        }
    }

    private var footer: String? {
        switch id {
        case "intervals": return L10n.tr("Co v Intervals.icu už je odjinud, Aurin nepřepíše.")
        case "apple" where !Self.viaGoogle.isEmpty:
            let list = ListFormatter()
            list.locale = L10n.locale
            let names = Self.viaGoogle.map(L10n.tr)
            let text = L10n.f("%@ teď posílá Aurin do Google Health. Sem je neposílá, aby se nezdvojily.", list.string(from: names) ?? names.joined(separator: ", "))
            return text.prefix(1).uppercased() + text.dropFirst()
        default: return L10n.tr("Jen to, co odcvičíš nebo zapíšeš v Aurinu.")
        }
    }

    /// What Apple Health has switched on but goes to Google Health instead (#386).
    private static var viaGoogle: [String] {
        let export = AppleHealthExport.shared
        var names: [String] = []
        if export.prefs.health.allows("nutrition") && export.viaGoogle.contains("nutrition") { names.append("jídlo") }
        if export.prefs.health.allows("weight") && export.viaGoogle.contains("weight") { names.append("váhu") }
        if export.prefs.pushActivities && export.viaGoogle.contains("activities") { names.append("tréninky") }
        return names
    }

    private func binding(_ key: WritableKeyPath<SyncPrefs, Bool>) -> Binding<Bool> {
        Self.binding(id, key, sync: sync) { await ask() }
    }

    static func binding(_ id: String, _ key: WritableKeyPath<SyncPrefs, Bool>, sync: SyncSettingsStore, saved: @escaping () async -> Void = {}) -> Binding<Bool> {
        Binding(get: { sync.destination(id)?.prefs[keyPath: key] ?? false },
                set: { value in
                    guard var prefs = sync.destination(id)?.prefs else { return }
                    prefs[keyPath: key] = value
                    Task { [prefs] in
                        await sync.save(id, prefs)
                        if value { await saved() }
                    }
                })
    }

    /// After a switch turned on: Google's question when a write permission is missing.
    private func ask() async {
        if id == "google", !(destination?.missingScopes ?? []).isEmpty { asking = true }
    }

    static func scopeList(_ missing: [String]) -> String {
        missing.map(scopeName).joined(separator: ", ")
    }

    static func scopeName(_ scope: String) -> String {
        switch scope {
        case "activityWrite": return L10n.tr("tréninky")
        case "weightWrite": return L10n.tr("váhu")
        case "nutritionWrite": return L10n.tr("jídlo")
        default: return scope
        }
    }

    private func extendGoogle() async {
        connecting = true
        defer { connecting = false }
        do {
            guard let event = try await model.connect(provider: "google-extra") else { return }
            note = event == "google" ? L10n.tr("Oprávnění Google jsou rozšířená.") : L10n.tr("Připojení se nedokončilo.")
            asking = false
            await sync.load()
            await store.load()
        } catch {
            note = error.localizedDescription
        }
    }
}

/// "Posílat do Google Health": Google asks on its own page for the writing.
struct GoogleWriteSheet: View {
    @Environment(\.dismiss) private var dismiss
    let missing: [String]
    let busy: Bool
    let go: () async -> Void

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                IntegrationIcon(id: "aurin", size: 52)
                Image(systemName: "arrow.right").font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.faint)
                IntegrationIcon(id: "google", size: 52)
            }
            .padding(.top, 8)
            Text("Posílat do Google Health").font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: L10n.f("Google se na své stránce zeptá, jestli může Aurin do Google Health zapisovat %@.", SyncSendGroup.scopeList(missing)))
                .font(Typo.body).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            PrimaryButton(title: L10n.tr("Pokračovat na Google"), busy: busy) { Task { await go() } }
                .disabled(busy)
            Button("Teď ne") { dismiss() }.font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationBackground(Palette.settingsBackground)
    }
}

// MARK: - Zdravotní data

struct SyncHealthView: View {
    let id: String
    let sync: SyncSettingsStore
    var saved: () async -> Void = {}

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
        case "apple": return "Do Apple Health jde jen to, co v Aurinu sám zapíšeš."
        case "google": return "Váhu a jídlo zapsané v Aurinu."
        case "intervals": return "Z Google Health a Apple Health do wellness v Intervals.icu. Co tam už je odjinud, Aurin nepřepíše."
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
        Task { [prefs] in
            await sync.save(id, prefs)
            if health.any { await saved() }
        }
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
            .cardSurface(cornerRadius: 18)
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
