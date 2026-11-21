import SwiftUI
import UserNotifications

// MARK: - Data sources

/// Zdroje dat (the Settings concept): the connected services on one card, each
/// with its page (what Aurin reads and sends, permissions, sync, disconnect),
/// the rest right under them to connect, and syncing everything at the bottom.
struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var actions = SourceActions()
    @State private var connectingApple = false
    @State private var flow = ConnectFlowState()
    @State private var choosing: PriorityPart?
    /// What Aurin sends where, for Zdravotní data.
    @State private var sync: SyncSettingsStore?

    /// Apple Health also when Aurin only writes to it (Aurin posílá on its page).
    private var connected: [ConnectionsResponse.Provider] { Self.connected(store) }

    static func connected(_ store: SettingsStore) -> [ConnectionsResponse.Provider] {
        var list = store.connections.filter { $0.connected == true }
        if !list.contains(where: { $0.id == "apple" }) && !store.demo && AppleHealthExport.shared.isOn {
            list.append(ConnectionsResponse.Provider(id: "apple", name: "Apple Health", connected: true, configured: true, missingPermissions: nil, metrics: nil, note: nil))
        }
        return list
    }
    private var available: [ConnectionsResponse.Provider] { store.connections.filter { $0.connected != true && $0.configured != false } }

    var body: some View {
        SettingsPage(title: "Zdroje dat", hero: hero) {
            if !connected.isEmpty {
                SettingsGroup(title: "Připojeno") {
                    ForEach(Array(connected.enumerated()), id: \.element.id) { index, provider in
                        if index > 0 { SettingsDivider() }
                        sourceRow(provider)
                    }
                }
            }

            // The one place to connect: what is not connected yet, right under what is.
            if store.loaded && !store.demo && !offers.isEmpty {
                SectionLabel(text: "Přidat zdroj").padding(.top, 10)
                VStack(spacing: 10) {
                    ForEach(offers, id: \.id) { offer in
                        IntegrationOfferCard(id: offer.id, name: offer.name, detail: offer.detail, working: actions.working == offer.id) {
                            start(offer.id)
                        }
                    }
                }
            }

            // Where the night and the day come from, once two devices can measure them.
            if nightChoices.count > 1 || dayChoices.count > 1 {
                SettingsGroup(title: "Odkud brát data") {
                    if nightChoices.count > 1 { priorityRow(.night) }
                    if nightChoices.count > 1 && dayChoices.count > 1 { SettingsDivider() }
                    if dayChoices.count > 1 { priorityRow(.day) }
                }
                .padding(.top, 10)
            }

            // Each type of data: where it comes from and where it goes (SettingsHealthData.swift).
            if store.loaded {
                HealthDataGroup(store: store, sync: sync).padding(.top, 10)
            }

            SettingsGroup(title: "Data") {
                Button {
                    Task { await store.syncNow() }
                } label: {
                    HStack {
                        Text(store.syncing ? "Synchronizuji…" : "Synchronizovat vše").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if store.syncing { ProgressView() } else {
                            if let at = lastSync { Text(at).font(.subheadline).foregroundStyle(Palette.muted) }
                            Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Palette.faint).accessibilityHidden(true)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(store.syncing || store.demo || connected.isEmpty)
                // The last sync left a source out (src/dashboard-sync.js results, googleStatus).
                // Each source that failed in the last day: what and when (src/dashboard-sync.js).
                if !store.syncing, let failures = store.sync?.failures(), !failures.isEmpty {
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust), title: "Poslední synchronizace s chybou", chevron: false)
                    ForEach(failures) { failure in
                        let detail = [failure.message, failure.at.map(SourceActions.when)].compactMap { $0 }.joined(separator: ", ")
                        SettingsRow(title: failure.name, subtitle: detail.isEmpty ? nil : detail, chevron: false)
                    }
                }
                SettingsDivider()
                SettingsToggle(title: "Sloučit stejné záznamy", subtitle: "Když stejnou noc nebo trénink pošle víc zdrojů, započítá se jednou.", isOn: .constant(true), disabled: true)
            }

            if let message = store.errorMessage, !store.syncing {
                Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
            if let message = actions.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(item: $choosing) { part in
            SourcePrioritySheet(part: part, choices: part == .night ? nightChoices : dayChoices,
                                selected: part == .night ? store.priority.night : store.priority.day) { choice in
                var next = store.priority
                if part == .night { next.night = choice } else { next.day = choice }
                Task { await store.savePriority(next) }
            }
        }
        .sheet(isPresented: $connectingApple) {
            AppleHealthConnectSheet { await store.load(); actions.message = L10n.tr("Apple Health je připojené.") }
        }
        // A service connected or disconnected here changes where data can go.
        .connectFlow($flow, actions: actions, store: store, connected: { await sync?.load() }, disconnected: { Task { await sync?.load() } })
        .task {
            guard sync == nil else { return }
            let s = SyncSettingsStore(api: model.api, demo: model.demo)
            sync = s
            await s.load()
        }
    }

    /// The connected sources' logos and how many there are, and how many need a look (the concept's top).
    private var hero: SettingsHero {
        guard !connected.isEmpty else {
            return SettingsHero(systemImage: "link", color: Palette.green, text: store.loaded ? "Zatím není nic propojené." : "Odkud Aurin bere tvoje data.")
        }
        let n = connected.count
        let count = n == 1 ? L10n.tr("Připojený je jeden zdroj")
            : n < 5 ? L10n.f("Připojené jsou %d zdroje", n) : L10n.f("Připojeno je %d zdrojů", n)
        let now = Date()
        let issues = connected.filter { IntegrationCard.issue($0, dataAt: dataAt($0), now: now) != nil }.count
        let attention = issues == 0 ? "." : issues == 1 ? L10n.tr(", jeden potřebuje tvou pozornost.") : L10n.tr(", některé potřebují tvou pozornost.")
        let logos = HStack(spacing: 8) {
            ForEach(connected) { IntegrationIcon(id: $0.id, size: 40) }
        }
        return SettingsHero(text: count + attention, art: AnyView(logos))
    }

    /// One source on the Connected card: its page, and Opravit when something is wrong.
    private func sourceRow(_ provider: ConnectionsResponse.Provider) -> some View {
        let at = dataAt(provider)
        let issue = IntegrationCard.issue(provider, dataAt: at, now: Date())
        return HStack(spacing: 10) {
            NavigationLink {
                IntegrationDetailView(provider: provider, store: store, actions: actions)
            } label: {
                IntegrationCard(provider: provider, dataAt: at, lastNight: lastNight(provider))
            }
            .buttonStyle(.plain)
            if actions.working == provider.id {
                Text(L10n.tr("připojuji…")).font(Typo.caption).foregroundStyle(Palette.muted)
            } else if issue != nil && provider.problemText != nil && !store.demo {
                // Fix reconnects, so only for an access problem; old data alone shows its line.
                Button { start(provider.id) } label: {
                    Text(L10n.tr("Opravit")).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(actions.working != nil)
            }
            Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
    }

    /// The connected sources that measure the night (the ring too) and the day, in the server's order.
    private var nightChoices: [String] { ["ultrahuman", "whoop", "google", "apple"].filter { id in connected.contains { $0.id == id } } }
    private var dayChoices: [String] { ["google", "apple"].filter { id in connected.contains { $0.id == id } } }

    private func priorityRow(_ part: PriorityPart) -> some View {
        let value = part == .night ? store.priority.night : store.priority.day
        return Button { choosing = part } label: {
            SettingsRow(title: part.title, value: SourcePrioritySheet.name(value))
        }
        .buttonStyle(.plain)
    }

    /// When the source's data last reached Aurin: Apple Health from the phone,
    /// the others the server's last good fetch.
    private func dataAt(_ provider: ConnectionsResponse.Provider) -> Date? { Self.dataAt(provider) }

    /// Some connected source needs a look (the hub's dot on Zdroje dat, 602 point 62).
    static func needsLook(_ store: SettingsStore, now: Date = Date()) -> Bool {
        connected(store).contains { IntegrationCard.issue($0, dataAt: dataAt($0), now: now) != nil }
    }

    static func dataAt(_ provider: ConnectionsResponse.Provider) -> Date? {
        if provider.id == "apple", let last = AppleHealth.shared.lastSync { return last }
        return provider.lastSuccessAt.flatMap(SourceActions.date)
    }

    /// This morning's night came from this source (Today's tonight.source,
    /// "apple-health", "google-wearables", "whoop" …).
    private func lastNight(_ provider: ConnectionsResponse.Provider) -> Bool {
        guard let today = model.today, today.date == AppModel.localDate(Date()), today.sleep?.minutes != nil,
              let source = today.tonight?.source else { return false }
        let id = ["apple-health": "apple", "google-wearables": "google"][source] ?? source
        return id == provider.id
    }

    /// The newest finished sync: a connected service's last good fetch (the server
    /// fetches every few minutes by itself) or the end of "Synchronizovat vše".
    private var lastSync: String? {
        var times = connected.compactMap { $0.lastSuccessAt.flatMap(SourceActions.date) }
        if store.sync?.status != "running", let end = store.sync?.finishedAt.flatMap(SourceActions.date) { times.append(end) }
        return times.max().map(SourceActions.when)
    }

    private func start(_ provider: String) {
        if provider == "apple" { connectingApple = true; return }
        flow.start(provider)
    }

    private struct Offer {
        let id: String
        let name: String
        let detail: String
    }

    /// What is not connected yet, health and sleep first, then training. Apple
    /// Health is read on the phone, so the server's list does not carry it.
    private var offers: [Offer] {
        var list: [Offer] = []
        if !connected.contains(where: { $0.id == "apple" }) && AppleHealth.shared.isAvailable {
            list.append(Offer(id: "apple", name: "Apple Health", detail: L10n.tr("spánek, tréninky, tep, HRV, kroky a váha")))
        }
        for id in ["google", "whoop", "ultrahuman", "intervals", "wahoo"] {
            guard let provider = available.first(where: { $0.id == id }) else { continue }
            list.append(Offer(id: id, name: provider.name ?? id, detail: Self.detail(provider.metrics ?? [])))
        }
        return list
    }

    /// What the service gives Aurin: the same list as on its page (src/connections.js
    /// metrics), in lower case where a word starts it ("HRV", "VO2max" stay).
    private static func detail(_ metrics: [String]) -> String {
        metrics.map { metric in
            guard metric.dropFirst().first?.isLowercase == true else { return metric }
            return metric.prefix(1).lowercased() + metric.dropFirst()
        }.joined(separator: ", ")
    }
}

enum PriorityPart: String, Identifiable {
    case night, day
    var id: String { rawValue }
    var title: String { self == .night ? L10n.tr("Spánek a noc") : L10n.tr("Pohyb přes den") }
}

/// Automaticky or one connected source for the night or the day (src/source-priority.js).
struct SourcePrioritySheet: View {
    let part: PriorityPart
    let choices: [String]
    let selected: String
    let choose: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    static func name(_ id: String) -> String {
        switch id {
        case "apple": "Apple Health"
        case "google": "Google Health"
        case "ultrahuman": "Ultrahuman"
        case "whoop": "WHOOP"
        default: L10n.tr("Automaticky")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(part.title).font(Typo.heading(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            SettingsGroup(footer: L10n.tr("Automaticky bere zdroj s nejúplnějšími a nejstabilnějšími daty.")) {
                ForEach(Array((["auto"] + choices).enumerated()), id: \.element) { index, id in
                    if index > 0 { SettingsDivider() }
                    Button {
                        choose(id)
                        dismiss()
                    } label: {
                        HStack(spacing: 14) {
                            if id == "auto" {
                                Image(systemName: "sparkle").scaledFont(16, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                                    .frame(width: 34, height: 34)
                                    .background(Palette.track, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            } else {
                                IntegrationIcon(id: id, size: 34)
                            }
                            Text(Self.name(id)).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            if id == selected {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                            }
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(id == selected ? .isSelected : [])
                }
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.medium])
        .glassSheetBackground(Palette.settingsBackground)
    }
}
