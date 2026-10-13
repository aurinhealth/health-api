import SwiftUI
import UserNotifications

// MARK: - Data sources

/// Zdroje dat, laid out like Bevel's: the connected services as cards, each
/// with "Spravovat" (permissions, sync, disconnect), "+" for the rest in
/// sections, and syncing everything at the bottom.
struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var actions = SourceActions()
    @State private var syncing = false
    @State private var adding = false
    @State private var connectingApple = false
    @State private var flow = ConnectFlowState()

    private var connected: [ConnectionsResponse.Provider] { store.connections.filter { $0.connected == true } }
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
                // The next sheet (Google's disclosure, the browser) once this one has closed.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { start(provider) }
            }
        }
        .sheet(isPresented: $connectingApple) {
            AppleHealthConnectSheet { await store.load(); actions.message = L10n.tr("Apple Health je připojené.") }
        }
        .connectFlow($flow, actions: actions, store: store)
    }

    private var lastSync: String? { store.sync?.updatedAt.flatMap(SourceActions.when) }

    private func start(_ provider: String) {
        if provider == "apple" { connectingApple = true; return }
        // Garmin and Wahoo come through Intervals.icu, so connect that first.
        let target = ["garmin", "wahoo"].contains(provider) ? "intervals" : provider
        flow.start(target, actions: actions, model: model, store: store, askKey: { flow.intervalsKey = true })
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
        for provider in available where ["google", "ultrahuman", "intervals"].contains(provider.id) {
            list.append(Offer(id: provider.id, name: provider.name ?? provider.id, note: L10n.tr("připojit")))
        }
        let settings = URL(string: "https://intervals.icu/settings")
        let viaIntervals = connected.contains { $0.id == "intervals" }
        for (id, name) in [("garmin", "Garmin"), ("wahoo", "Wahoo")] {
            list.append(Offer(id: id, name: name, note: L10n.tr("přes Intervals"), url: viaIntervals ? settings : nil))
        }
        return list
    }
}
