import SwiftUI
import UserNotifications

// MARK: - Data sources

/// Zdroje dat, laid out like Bevel's: the connected services as cards, each
/// with its page (what Aurin reads and sends, permissions, sync, disconnect),
/// "+" for the rest in sections, and syncing everything at the bottom.
struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var actions = SourceActions()
    @State private var syncing = false
    @State private var adding = false
    @State private var connectingApple = false
    @State private var flow = ConnectFlowState()
    @State private var choosing: PriorityPart?

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
            HStack {
                Text("Propojení").font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                Button { adding = true } label: {
                    Image(systemName: "plus").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Přidat propojení")
            }

            if connected.isEmpty && store.loaded {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Zatím není nic propojené.").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    PrimaryButton(title: "Přidat propojení", systemImage: "plus") { adding = true }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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

            // Where the night and the day come from, once two devices can measure them.
            if nightChoices.count > 1 || dayChoices.count > 1 {
                SettingsGroup(title: "Odkud brát data") {
                    if nightChoices.count > 1 { priorityRow(.night) }
                    if nightChoices.count > 1 && dayChoices.count > 1 { SettingsDivider() }
                    if dayChoices.count > 1 { priorityRow(.day) }
                }
                .padding(.top, 10)
            }

            if store.loaded && !store.demo {
                SectionLabel(text: "Můžeš připojit").padding(.top, 10)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(offers, id: \.id) { offer in
                        if let url = offer.url {
                            Link(destination: url) { IntegrationTile(id: offer.id, name: offer.name, note: offer.note) }
                                .buttonStyle(.plain)
                        } else {
                            Button { start(offer.id) } label: { IntegrationTile(id: offer.id, name: offer.name, note: offer.note) }
                                .buttonStyle(.plain)
                        }
                    }
                }
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
                if !syncing, let failed = store.sync?.failedSources, !failed.isEmpty {
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust), title: "Poslední synchronizace s chybou",
                                subtitle: failed.joined(separator: ", "), chevron: false)
                }
                SettingsDivider()
                SettingsToggle(title: "Sloučit stejné záznamy", subtitle: "Když stejnou noc nebo trénink pošle víc zdrojů, započítá se jednou.", isOn: .constant(true), disabled: true)
            }

            if let message = actions.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(isPresented: $adding) {
            AddIntegrationSheet(available: available, appleConnected: connected.contains { $0.id == "apple" }) { provider in
                adding = false
                // The service's connect screen once this sheet has closed.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { start(provider) }
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
        .connectFlow($flow, actions: actions, store: store)
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

    private var lastSync: String? { store.sync?.updatedAt.flatMap(SourceActions.when) }

    private func start(_ provider: String) {
        if provider == "apple" { connectingApple = true; return }
        flow.start(provider)
    }

    private struct Offer {
        let id: String
        let name: String
        let note: String
        var url: URL? = nil
    }

    /// What is not connected yet: the services Aurin reads itself (Ultrahuman once
    /// the server offers it), then the
    /// watches and apps that come in through Intervals.icu.
    private var offers: [Offer] {
        var list: [Offer] = []
        if !connected.contains(where: { $0.id == "apple" }) && AppleHealth.shared.isAvailable {
            list.append(Offer(id: "apple", name: "Apple Health", note: L10n.tr("připojit")))
        }
        for provider in available where ["google", "ultrahuman", "whoop", "wahoo", "intervals"].contains(provider.id) {
            list.append(Offer(id: provider.id, name: provider.name ?? provider.id, note: L10n.tr("připojit")))
        }
        return list
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
                                Image(systemName: "sparkle").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
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
        .presentationBackground(Palette.settingsBackground)
    }
}
