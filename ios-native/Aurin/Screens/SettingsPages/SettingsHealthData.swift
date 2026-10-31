import SwiftUI

// MARK: - Zdroje dat → Zdravotní data

/// Each type of health data: where Aurin reads it from and where it sends it,
/// each with a switch. Off stops reading or sending from then on; nothing
/// stored is deleted. Reading: Apple Health's switches on this iPhone
/// (AppleHealth.swift), the server's for Google Health, Ultrahuman and WHOOP
/// (src/source-reading.js), Tréninky for workouts (pullActivities). Sending:
/// the services' Aurin posílá (src/sync-destinations.js).
enum HealthDataSources {
    /// Deník is Apple Health's alone: its switch stays on Apple Health's page.
    static let types: [HealthCategory] = HealthCategory.allCases.filter { $0 != .journal }

    /// The health types (sync-destinations.js HEALTH_TYPES) a type goes out as, per service.
    static func sent(_ type: HealthCategory, to id: String) -> [String] {
        switch (type, id) {
        case (.body, "intervals"): return ["weight", "bodyFat"]
        case (.body, _): return ["weight"]
        case (.food, _): return ["nutrition"]
        case (.water, _): return ["water"]
        case (.resting, _): return ["restingHR"]
        case (.heart, _): return ["vo2max"]
        case (.hrv, _): return ["hrv"]
        case (.sleep, _): return ["sleep"]
        case (.steps, _): return ["steps"]
        case (.breathing, _): return ["spO2", "respiration"]
        // Apple Health's workouts (src/watch-forward.js), next to the app's own.
        case (.workouts, "intervals"): return ["workouts"]
        default: return []
        }
    }

    /// The services that read the type, in Zdroje dat's order.
    @MainActor
    static func readers(_ type: HealthCategory, store: SettingsStore, sync: SyncSettingsStore?) -> [String] {
        var ids: [String] = []
        if AppleHealth.shared.isAvailable && !store.demo { ids.append("apple") }
        for id in ["google", "ultrahuman", "whoop", "intervals", "wahoo"] where connected(id, store) {
            if type == .workouts {
                if sync?.destination(id)?.supports.pullActivities == true { ids.append(id) }
            } else if store.reads(id, type.rawValue) != nil {
                ids.append(id)
            }
        }
        return ids
    }

    /// The services the type can go to.
    @MainActor
    static func senders(_ type: HealthCategory, store: SettingsStore, sync: SyncSettingsStore?) -> [String] {
        guard let sync else { return [] }
        return SyncApp.order.filter { id in
            guard let destination = sync.destination(id), id == "apple" ? AppleHealth.shared.isAvailable : destination.connected == true else { return false }
            if type == .workouts { return destination.supports.pushActivities }
            let types = sent(type, to: id)
            return !types.isEmpty && types.contains { destination.healthTypes.contains($0) }
        }
    }

    @MainActor
    static func connected(_ id: String, _ store: SettingsStore) -> Bool {
        store.connections.contains { $0.id == id && $0.connected == true }
    }
}

/// The list under Zdroje dat: each type with the logos of where it comes from and goes.
struct HealthDataGroup: View {
    let store: SettingsStore
    let sync: SyncSettingsStore?

    private struct Row: Identifiable {
        let type: HealthCategory
        let ids: [String]
        var id: HealthCategory { type }
    }

    private var rows: [Row] {
        HealthDataSources.types.compactMap { type -> Row? in
            var ids = HealthDataSources.readers(type, store: store, sync: sync)
            for id in HealthDataSources.senders(type, store: store, sync: sync) where !ids.contains(id) { ids.append(id) }
            return ids.isEmpty ? nil : Row(type: type, ids: ids)
        }
    }

    var body: some View {
        let list = rows
        if !list.isEmpty {
            SettingsGroup(title: "Zdravotní data") {
                ForEach(Array(list.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { SettingsDivider() }
                    NavigationLink {
                        HealthDataTypeView(type: row.type, store: store, sync: sync)
                    } label: {
                        HStack(spacing: 10) {
                            Text(row.type.title).font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            HStack(spacing: -5) {
                                ForEach(Array(row.ids.prefix(4)), id: \.self) { IntegrationIcon(id: $0, size: 20) }
                            }
                            Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// One type: Reads from and Sends to, a switch for each service.
struct HealthDataTypeView: View {
    @Environment(AppModel.self) private var model
    let type: HealthCategory
    let store: SettingsStore
    let sync: SyncSettingsStore?
    @State private var working = false
    /// Google asks on its own page before Aurin may write there (as on Google's page).
    @State private var askingGoogle = false
    @State private var connectingGoogle = false
    /// The apps and devices that wrote this type into Apple Health.
    @State private var appleSources: [AppleHealth.Source] = []
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        SettingsPage(title: type.title) {
            let readers = HealthDataSources.readers(type, store: store, sync: sync)
            if !readers.isEmpty {
                SettingsGroup(title: "Čte z", footer: L10n.tr("Vypnuté Aurin přestane číst. Co už má, zůstane.")) {
                    ForEach(Array(readers.enumerated()), id: \.element) { index, id in
                        if index > 0 { SettingsDivider() }
                        row(id, subtitle: readSubtitle(id), isOn: readBinding(id))
                        // Each app and device in Apple Health, while it is read.
                        if id == "apple", health.enabled, health.categories.contains(type) {
                            ForEach(appleSources) { source in
                                SettingsDivider()
                                SettingsToggle(title: source.name, subtitle: L10n.tr("přes Apple Health"), isOn: Binding(
                                    get: { health.isShown(source.id, in: type) },
                                    set: { health.setShown(source.id, in: type, $0) }))
                                    .padding(.leading, 44)
                            }
                        }
                    }
                }
                .disabled(working || store.demo || health.syncing)
            }
            let senders = HealthDataSources.senders(type, store: store, sync: sync)
            if !senders.isEmpty, let sync {
                SettingsGroup(title: "Posílá do", footer: L10n.tr("Jen to, co odcvičíš nebo zapíšeš v Aurinu.")) {
                    ForEach(Array(senders.enumerated()), id: \.element) { index, id in
                        if index > 0 { SettingsDivider() }
                        row(id, subtitle: nil, isOn: sendBinding(id, sync: sync))
                    }
                }
                .disabled(sync.working != nil || store.demo)
                if let message = sync.message { Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true) }
            }
            if let message = store.errorMessage ?? health.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(isPresented: $askingGoogle) {
            GoogleWriteSheet(missing: sync?.destination("google")?.missingScopes ?? [], busy: connectingGoogle) { await extendGoogle() }
        }
        .task(id: health.enabled && health.categories.contains(type)) {
            guard health.enabled, health.categories.contains(type), !store.demo else { appleSources = []; return }
            appleSources = await health.sources(for: type)
        }
    }

    private func extendGoogle() async {
        connectingGoogle = true
        defer { connectingGoogle = false }
        _ = try? await model.connect(provider: "google-extra")
        askingGoogle = false
        await sync?.load()
        await store.load()
    }

    private func row(_ id: String, subtitle: String?, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 14) {
            IntegrationIcon(id: id, size: 30)
            SettingsToggle(title: Self.name(id), subtitle: subtitle, isOn: isOn)
                .padding(.leading, -16)
        }
        .padding(.leading, 16)
    }

    static func name(_ id: String) -> String {
        ["ultrahuman", "whoop"].contains(id) ? SourcePrioritySheet.name(id) : SyncApp.name(id)
    }

    private func readSubtitle(_ id: String) -> String? {
        if id == "apple" { return L10n.tr("v tomhle iPhonu") }
        return store.connections.first { $0.id == id }?.lastSuccessAt.flatMap(SourceActions.when)
    }

    // MARK: Reading

    private func readBinding(_ id: String) -> Binding<Bool> {
        if type == .workouts && id != "apple", let sync {
            return SyncSendGroup.binding(id, \.pullActivities, sync: sync)
        }
        if id == "apple" {
            return Binding(get: { health.enabled && health.categories.contains(type) },
                           set: { on in Task { await setApple(on) } })
        }
        // One save at a time: the server writes the whole list each time.
        return Binding(get: { store.reads(id, type.rawValue) ?? false },
                       set: { on in Task { working = true; await store.saveRead(id, type.rawValue, on: on); working = false } })
    }

    /// Apple Health's switch for this type, as on its page: the last one off
    /// stops reading (on the server too), one on asks iOS and reads again.
    private func setApple(_ on: Bool) async {
        working = true
        defer { working = false }
        if on {
            let next = health.enabled ? health.categories.union([type]) : [type]
            if health.enabled { await health.update(next, api: model.api) } else { _ = await health.connect(next, api: model.api) }
        } else {
            let next = health.categories.subtracting([type])
            if next.isEmpty {
                health.disconnect()
                try? await model.api.disconnect(provider: "apple")
            } else {
                await health.update(next, api: model.api)
            }
        }
        await store.load()
    }

    // MARK: Sending

    private func sendBinding(_ id: String, sync: SyncSettingsStore) -> Binding<Bool> {
        let types = HealthDataSources.sent(type, to: id)
        if type == .workouts, types.isEmpty { return SyncSendGroup.binding(id, \.pushActivities, sync: sync) }
        if type == .workouts {
            // Intervals.icu: the app's workouts and Apple Health's go together.
            return Binding(
                get: { guard let d = sync.destination(id) else { return false }
                       return d.prefs.pushActivities && types.allSatisfy(d.prefs.health.allows) },
                set: { on in
                    guard let d = sync.destination(id) else { return }
                    var prefs = d.prefs
                    prefs.pushActivities = on
                    var chosen: [String]
                    switch d.prefs.health {
                    case .all: chosen = d.healthTypes
                    case .some(let list): chosen = list
                    }
                    chosen.removeAll { types.contains($0) }
                    if on { chosen += types.filter(d.healthTypes.contains) }
                    prefs.health = .some(d.healthTypes.filter(chosen.contains))
                    Task { [prefs] in await sync.save(id, prefs) }
                })
        }
        return Binding(
            get: { guard let d = sync.destination(id) else { return false }
                   return types.filter(d.healthTypes.contains).allSatisfy(d.prefs.health.allows) },
            set: { on in
                guard let d = sync.destination(id) else { return }
                var chosen: [String]
                switch d.prefs.health {
                case .all: chosen = d.healthTypes
                case .some(let list): chosen = list
                }
                chosen.removeAll { types.contains($0) }
                if on { chosen += types.filter(d.healthTypes.contains) }
                var prefs = d.prefs
                prefs.health = .some(d.healthTypes.filter(chosen.contains))
                Task { [prefs] in
                    await sync.save(id, prefs)
                    if on, id == "google", !(sync.destination("google")?.missingScopes ?? []).isEmpty { askingGoogle = true }
                }
            })
    }
}
