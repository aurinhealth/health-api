import SwiftUI
import UserNotifications

// MARK: - Data sources

/// Zdroje dat, laid out like Bevel's: the connected services as cards, each
/// with its page (what Aurin reads and sends, permissions, sync, disconnect),
/// the rest right under them to connect, and syncing everything at the bottom.
struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var actions = SourceActions()
    @State private var syncing = false
    @State private var connectingApple = false
    @State private var flow = ConnectFlowState()
    @State private var choosing: PriorityPart?
    /// What Aurin sends where, for Zdravotní data.
    @State private var sync: SyncSettingsStore?

    /// Apple Health also when Aurin only writes to it (Aurin posílá on its page).
    private var connected: [ConnectionsResponse.Provider] {
        var list = store.connections.filter { $0.connected == true }
        if !list.contains(where: { $0.id == "apple" }) && !store.demo && AppleHealthExport.shared.isOn {
            list.append(ConnectionsResponse.Provider(id: "apple", name: "Apple Health", connected: true, configured: true, missingPermissions: nil, metrics: nil, note: nil))
        }
        return list
    }
    private var available: [ConnectionsResponse.Provider] { store.connections.filter { $0.connected != true && $0.configured != false } }

    var body: some View {
        SettingsPage(title: "Zdroje dat") {
            Text("Připojeno").font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)

            if connected.isEmpty && store.loaded {
                Text("Zatím není nic propojené.").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface(cornerRadius: 18)
            }
            VStack(spacing: 10) {
                ForEach(connected) { provider in
                    NavigationLink {
                        IntegrationDetailView(provider: provider, store: store, actions: actions)
                    } label: {
                        IntegrationCard(provider: provider, lastSync: lastSync, working: actions.working == provider.id)
                    }
                    .buttonStyle(.plain)
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
                    Task { syncing = true; await store.syncNow(); syncing = false }
                } label: {
                    HStack {
                        Text(syncing ? "Synchronizuji…" : "Synchronizovat vše").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if syncing { ProgressView() } else if let at = lastSync { Text(at).font(.subheadline).foregroundStyle(Palette.muted) }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(syncing || store.demo || connected.isEmpty)
                // The last sync left a source out (src/dashboard-sync.js results, googleStatus).
                // Each source that failed in the last day: what and when (src/dashboard-sync.js).
                if !syncing, let failures = store.sync?.failures(), !failures.isEmpty {
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust), title: "Poslední synchronizace s chybou", chevron: false)
                    ForEach(failures) { failure in
                        let detail = [failure.message, failure.at.map(SourceActions.when)].compactMap { $0 }.joined(separator: " · ")
                        SettingsRow(title: failure.name, subtitle: detail.isEmpty ? nil : detail, chevron: false)
                    }
                }
                SettingsDivider()
                SettingsToggle(title: "Sloučit stejné záznamy", subtitle: "Když stejnou noc nebo trénink pošle víc zdrojů, započítá se jednou.", isOn: .constant(true), disabled: true)
            }

            if let message = store.errorMessage, !syncing {
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
            list.append(Offer(id: id, name: provider.name ?? id, detail: Self.detail(id)))
        }
        return list
    }

    /// What each service gives Aurin, in a few words.
    private static func detail(_ id: String) -> String {
        switch id {
        case "google": return L10n.tr("spánek, tep, HRV, kroky, váha a jídlo")
        case "whoop": return L10n.tr("spánek, regenerace, HRV a zátěž")
        case "ultrahuman": return L10n.tr("spánek, HRV, teplota a pohyb")
        case "intervals": return L10n.tr("aktivity, plán tréninků, forma a wellness")
        case "wahoo": return L10n.tr("jízdy a trénink na trenažeru")
        default: return ""
        }
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
                Text(part.title).font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
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
