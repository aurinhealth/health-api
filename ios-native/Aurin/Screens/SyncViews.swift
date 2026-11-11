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
                    // Other apps' workouts follow the server: disconnecting Wahoo
                    // or Google there turned them off (a new yes is needed).
                    var local = AppleHealthExport.shared.prefs
                    local.forward = apple.prefs.forward
                    AppleHealthExport.shared.setPrefs(local)
                    replace("apple", prefs: local)
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
            var local = prefs
            local.backfill = nil
            local.consent = nil
            AppleHealthExport.shared.setPrefs(local)
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
            // An app's workouts just turned on for Apple Health: the first ones now.
            if id == "apple", AppleHealthExport.forwards(saved.prefs) {
                Task { await AppleHealthExport.shared.writeForwarded(api: api, force: true) }
            }
            // Health data from other apps just allowed: the first now (with the last 14 days, maybe).
            if id == "apple", prefs.consent == true {
                Task { await AppleHealthExport.shared.writeOthers(api: api, days: prefs.backfill == true ? 14 : 2) }
            }
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
                        supports: all, healthTypes: ["weight", "bodyFat", "restingHR", "hrv", "sleep", "steps", "spO2", "respiration", "vo2max", "workouts"])
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
                Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(Palette.onAccent)
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
    /// Nastavení → Tréninkové zóny → Zapisovat do Wahoo.
    @AppStorage("writeWahoo") private var writeWahoo = true

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
                    // Intervals.icu: other apps' workouts have their own switches below.
                    SettingsToggle(title: "Hotové tréninky", subtitle: id == "intervals" ? L10n.tr("Zapsané v Aurinu") : nil, isOn: binding(\.pushActivities))
                }
                // Wahoo: FTP and power zones go with the switch in Tréninkové zóny (ZonesSettingsView).
                if id == "wahoo" {
                    if s.pushActivities || s.pushPlanned { SettingsDivider() }
                    NavigationLink { ZonesSettingsView(store: store) } label: {
                        SettingsRow(title: "FTP a výkonové zóny", value: L10n.tr(writeWahoo ? "Zapnuto" : "Vypnuto"))
                    }
                    .buttonStyle(.plain)
                }
                if s.health {
                    if s.pushActivities || s.pushPlanned { SettingsDivider() }
                    NavigationLink {
                        SyncHealthView(id: id, sync: sync, saved: { await ask() })
                    } label: {
                        SettingsRow(title: "Zdravotní data", value: SyncApp.healthValue(destination.prefs.health, of: SyncHealthView.listed(destination)))
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
                Image(systemName: "arrow.right").scaledFont(17, weight: .semibold).foregroundStyle(Palette.faint)
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
        .glassSheetBackground(Palette.settingsBackground)
    }
}

// MARK: - Intervals.icu: workouts from other apps

/// "Tréninky z jiných aplikací" on Intervals.icu's, Google Health's and Apple
/// Health's page: a switch for each connected app whose workouts Aurin can
/// pass on there (src/watch-forward.js). To Intervals.icu Apple Health's is its
/// health type "workouts"; Wahoo's and Google's ask first (their API terms want
/// the user's yes) and can bring the last 14 days.
struct SyncForwardGroup: View {
    /// intervals, google or apple.
    let to: String
    let sync: SyncSettingsStore
    @State private var asking: String?

    private var destination: SyncDestination? { sync.destination(to) }
    private var sources: [String] {
        guard let destination else { return [] }
        if to == "apple" { guard AppleHealthExport.shared.isAvailable else { return [] } } else if destination.connected != true { return [] }
        let others = (destination.forwardSources ?? []).filter { ["wahoo", "google"].contains($0) && $0 != to }
        return (to == "intervals" && AppleHealth.shared.isAvailable && destination.healthTypes.contains("workouts") ? ["apple"] : []) + others
    }

    var body: some View {
        if let destination, !sources.isEmpty {
            SettingsGroup(title: L10n.tr("Tréninky z jiných aplikací"), footer: L10n.tr(footer)) {
                ForEach(Array(sources.enumerated()), id: \.element) { index, id in
                    if index > 0 { SettingsDivider() }
                    HStack(spacing: 14) {
                        IntegrationIcon(id: id, size: 30)
                        SettingsToggle(title: Self.name(id), subtitle: L10n.tr(subtitle(id)), isOn: binding(id, destination))
                            .padding(.leading, -16)
                    }
                    .padding(.leading, 16)
                }
            }
            .disabled(sync.working == to || sync.demo)
            .sheet(item: Binding(get: { asking.map(SourceID.init) }, set: { asking = $0?.id })) { source in
                ForwardConsentSheet(source: source.id, to: to) { backfill in
                    asking = nil
                    save(source.id, on: true, backfill: backfill)
                }
            }
        }
    }

    private struct SourceID: Identifiable { let id: String }

    static func name(_ id: String) -> String {
        id == "apple" ? L10n.tr("Apple Health") : SyncApp.name(id)
    }

    private var footer: String {
        switch to {
        case "apple": return "Posílá se dvě hodiny po konci tréninku. Když už v Apple Health ve stejném čase nějaký trénink je, třeba z aplikace Wahoo, Aurin ho přeskočí."
        case "google": return "Apple Health tu není: aplikace Google Health si ho čte sama. Když už v Google Health ve stejném čase nějaký trénink je, Aurin ho přeskočí."
        default: return "Posílá se dvě hodiny po konci tréninku a jen když ho Intervals.icu ještě nemá. Aplikaci, která do Intervals.icu posílá sama, nech vypnutou."
        }
    }

    /// What goes there of each app (ForwardConsentSheet lists it in full).
    private func subtitle(_ id: String) -> String {
        switch id {
        case "apple": return "Apple Watch a další aplikace"
        case "wahoo" where to == "intervals": return "Jízdy s výkonem, tepem a trasou"
        // Going to Apple Health too: the Google Health app reads it there (src/watch-forward.js forwardToGoogle).
        case "wahoo" where to == "google" && (sync.destination("apple")?.prefs.forward ?? []).contains("wahoo"): return "Jde přes Apple Health"
        case "wahoo" where to == "google": return "Jízdy s časem, vzdáleností a tepem"
        case "wahoo": return "Jízdy s časem, vzdáleností a kaloriemi"
        default: return "Fitbit a další hodinky"
        }
    }

    private func isOn(_ id: String, _ destination: SyncDestination) -> Bool {
        id == "apple" ? destination.prefs.health.allows("workouts") : (destination.prefs.forward ?? []).contains(id)
    }

    private func binding(_ id: String, _ destination: SyncDestination) -> Binding<Bool> {
        Binding(get: { isOn(id, destination) },
                set: { on in
                    // Wahoo and Google: first the question, the switch moves on its yes.
                    if on && id != "apple" { asking = id } else { save(id, on: on, backfill: false) }
                })
    }

    private func save(_ id: String, on: Bool, backfill: Bool) {
        guard var prefs = sync.destination(to)?.prefs else { return }
        if id == "apple" {
            var chosen: [String]
            switch prefs.health {
            case .all: chosen = destination?.healthTypes ?? []
            case .some(let types): chosen = types
            }
            chosen.removeAll { $0 == "workouts" }
            if on { chosen.append("workouts") }
            prefs.health = on && prefs.health == .all ? .all : .some(chosen)
        } else {
            var list = prefs.forward ?? []
            list.removeAll { $0 == id }
            if on { list.append(id) }
            prefs.forward = list
            prefs.backfill = on && backfill ? true : nil
        }
        Task { [prefs] in await sync.save(to, prefs) }
    }
}

/// The yes before an app's workouts go to another, with the last 14 days if wanted.
struct ForwardConsentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let source: String
    let to: String
    let go: (Bool) -> Void
    /// Off at first: a ticked box is no consent (GDPR, Planet49).
    @State private var backfill = false

    private var since: String {
        Calendar.current.date(byAdding: .day, value: -14, to: Date())
            .map { $0.formatted(Date.FormatStyle().weekday(.abbreviated).month(.abbreviated).day().locale(L10n.locale)) } ?? ""
    }

    /// Exactly what goes (the privacy policy says the same).
    private var what: String {
        switch (source, to) {
        case ("wahoo", "intervals"): return "Aurin zkopíruje každý dokončený trénink z Wahoo do tvého účtu Intervals.icu jako jeho soubor: čas, délku, vzdálenost, trasu, výkon, tep, kadenci a kalorie."
        case ("google", "intervals"): return "Aurin zkopíruje každý dokončený trénink z Google Health do tvého účtu Intervals.icu: typ, název, čas, délku, vzdálenost, tep a kalorie."
        case ("wahoo", "google"): return "Aurin zkopíruje každý dokončený trénink z Wahoo do tvého účtu Google Health: typ, název, čas, délku, vzdálenost, tep a kalorie."
        case ("wahoo", _): return "Aurin zapíše každý dokončený trénink z Wahoo do Apple Health na tomhle iPhonu: typ, čas, délku, vzdálenost a kalorie."
        default: return "Aurin zapíše každý dokončený trénink z Google Health do Apple Health na tomhle iPhonu: typ, čas, délku, vzdálenost a kalorie."
        }
    }

    var body: some View {
        let target = SyncForwardGroup.name(to)
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IntegrationIcon(id: source, size: 40)
                Image(systemName: "arrow.right").scaledFont(15, weight: .semibold).foregroundStyle(Palette.faint)
                IntegrationIcon(id: to, size: 40)
            }
            .padding(.top, 8)
            Text(verbatim: L10n.f("Posílat tréninky z %@ do %@?", SyncForwardGroup.name(source), target))
                .font(Typo.sentence(24, relativeTo: .title)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: L10n.tr(what))
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Text(verbatim: L10n.f("Vypnout to můžeš kdykoli. Co už v %@ je, tam zůstane.", target))
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Button { backfill.toggle() } label: {
                HStack(spacing: 12) {
                    Image(systemName: backfill ? "checkmark.square.fill" : "square")
                        .font(.title3).foregroundStyle(backfill ? Palette.blue : Palette.faint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Poslat i posledních 14 dní").font(.body).foregroundStyle(Palette.ink)
                        Text(verbatim: L10n.f("Od %@", since)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            PrimaryButton(title: L10n.f("Poslat do %@", target)) { go(backfill) }
            Button("Teď ne") { dismiss() }.font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
        }
        .padding(24)
        .presentationDetents([.large])
        .glassSheetBackground(Palette.settingsBackground)
    }
}

/// The yes before data from other apps goes to Apple Health, with the last 14 days if wanted.
struct OthersConsentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let go: (Bool) -> Void
    /// Off at first: a ticked box is no consent (GDPR, Planet49).
    @State private var backfill = false

    private var since: String {
        Calendar.current.date(byAdding: .day, value: -14, to: Date())
            .map { $0.formatted(Date.FormatStyle().weekday(.abbreviated).month(.abbreviated).day().locale(L10n.locale)) } ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IntegrationIcon(id: "google", size: 40)
                Image(systemName: "arrow.right").scaledFont(15, weight: .semibold).foregroundStyle(Palette.faint)
                IntegrationIcon(id: "apple", size: 40)
            }
            .padding(.top, 8)
            Text("Posílat data z dalších aplikací do Apple Health?")
                .font(Typo.sentence(24, relativeTo: .title)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            // Exactly what goes (the privacy policy says the same).
            Text("Aurin zapíše do Apple Health na tomhle iPhonu, co mu posílá Google Health z tvých hodinek.")
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Text("Jen typy, které zaškrtneš: spánek, tep, klidový tep, okysličení krve, dechovou frekvenci a kroky.")
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Text("Vypnout to můžeš kdykoli a zápis tím skončí. Co už v Apple Health je, tam zůstane i po smazání účtu a mohou to číst aplikace, kterým čtení Apple Health povolíš.")
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Button { backfill.toggle() } label: {
                HStack(spacing: 12) {
                    Image(systemName: backfill ? "checkmark.square.fill" : "square")
                        .font(.title3).foregroundStyle(backfill ? Palette.blue : Palette.faint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Poslat i posledních 14 dní").font(.body).foregroundStyle(Palette.ink)
                        Text(verbatim: L10n.f("Od %@", since)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            PrimaryButton(title: L10n.f("Poslat do %@", L10n.tr("Apple Health"))) { go(backfill) }
            Button("Teď ne") { dismiss() }.font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
        }
        .padding(24)
        .presentationDetents([.large])
        .glassSheetBackground(Palette.settingsBackground)
    }
}

// MARK: - Zdravotní data

struct SyncHealthView: View {
    let id: String
    let sync: SyncSettingsStore
    var saved: () async -> Void = {}

    /// The choice waiting for the yes to Apple Health's data from other apps.
    @State private var asking: SyncHealth?

    private var destination: SyncDestination? { sync.destination(id) }

    /// Apple Health's types that come from other apps, not from what is logged in Aurin.
    static let others = ["sleep", "heartRate", "restingHR", "spO2", "respiration", "steps"]

    var body: some View {
        SettingsPage(title: "Zdravotní data") {
            if let destination {
                SettingsGroup {
                    // Off sends none: it used to keep every type ticked (only no longer the ones added later).
                    let types = Self.listed(destination)
                    SettingsToggle(title: "Vše", isOn: Binding(get: { types.allSatisfy(destination.prefs.health.allows) },
                                                              set: { on in set(on ? all(destination) : .some(kept(destination))) }))
                }
                let listed = Self.listed(destination)
                let own = listed.filter { !Self.others.contains($0) }, others = listed.filter(Self.others.contains)
                if others.isEmpty {
                    rows(own, destination)
                } else {
                    SettingsGroup(title: L10n.tr("Zapsané v Aurinu")) { rowList(own, destination) }
                    SettingsGroup(title: L10n.tr("Z tvých dalších aplikací"),
                                  footer: L10n.tr("Z hodinek, které posílají do Google Health. Nikdy nic z toho, co Aurin přečetl z Apple Health.")) {
                        rowList(others, destination)
                    }
                }
            }
        }
        .disabled(sync.working == id)
        .sheet(item: Binding(get: { asking.map(Asking.init) }, set: { asking = $0?.health })) { ask in
            OthersConsentSheet { backfill in
                asking = nil
                set(ask.health, consent: true, backfill: backfill)
            }
        }
    }

    private struct Asking: Identifiable { let health: SyncHealth; var id: String { "others" } }

    private func rows(_ types: [String], _ destination: SyncDestination) -> some View {
        SettingsGroup(footer: footer) { rowList(types, destination) }
    }

    @ViewBuilder
    private func rowList(_ types: [String], _ destination: SyncDestination) -> some View {
        ForEach(Array(types.enumerated()), id: \.element) { index, type in
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

    private var footer: String? {
        switch id {
        case "apple": return "Do Apple Health jde jen to, co v Aurinu sám zapíšeš."
        case "google": return "Váhu a jídlo zapsané v Aurinu."
        case "intervals": return "Z Google Health a Apple Health do wellness v Intervals.icu. Co tam už je odjinud, Aurin nepřepíše."
        default: return nil
        }
    }

    /// The types this list shows. Intervals.icu's Apple Health workouts are
    /// under Tréninky z jiných aplikací (SyncForwardGroup), not here.
    static func listed(_ destination: SyncDestination) -> [String] {
        destination.id == "intervals" ? destination.healthTypes.filter { $0 != "workouts" } : destination.healthTypes
    }

    /// What Vše and its switch-off leave as it is: the types not listed here.
    private func kept(_ destination: SyncDestination) -> [String] {
        destination.healthTypes.filter { !Self.listed(destination).contains($0) && destination.prefs.health.allows($0) }
    }

    private func all(_ destination: SyncDestination) -> SyncHealth {
        kept(destination).count == destination.healthTypes.count - Self.listed(destination).count ? .all : .some(Self.listed(destination) + kept(destination))
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

    private func set(_ health: SyncHealth, consent: Bool = false, backfill: Bool = false) {
        guard var prefs = destination?.prefs else { return }
        // Apple Health: the first type from other apps asks for the yes first (Google's terms).
        if id == "apple", !consent, Self.others.contains(where: health.allows), !Self.others.contains(where: prefs.health.allows) {
            asking = health
            return
        }
        prefs.health = health
        if consent { prefs.consent = true; prefs.backfill = backfill ? true : nil }
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
                            .overlay { RoundedRectangle(cornerRadius: 24 * 0.27, style: .continuous).stroke(Palette.card, lineWidth: 2) }
                    }
                }
                if report.failed {
                    Text(verbatim: L10n.f("Neodesláno do %@", report.failedNames.joined(separator: ", ")))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 8)
                    Text("Zkusit znovu").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
                } else {
                    Text(verbatim: L10n.plural("Odesláno do %lld aplikací", report.rows.count))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                }
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
        .glassSheetBackground(Palette.settingsBackground)
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
