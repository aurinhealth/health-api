import SwiftUI

/// Connecting Apple Health: what Loadwise may read, then iOS's own sheet and
/// the history (AppleHealth.swift).
struct AppleHealthConnectSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var done: () async -> Void
    @State private var chosen = Set(HealthCategory.allCases)
    @State private var working = false
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Apple Health") {
                HStack(spacing: 14) {
                    IntegrationIcon(id: "apple", size: 56)
                    Text("Co může Aurin číst").font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                }
                AppleHealthCategoryList(chosen: $chosen)
                    .disabled(working)
                if let message = health.message {
                    Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
                PrimaryButton(title: working ? L10n.tr("Načítám data…") : L10n.tr("Povolit přístup"), systemImage: "heart.fill", busy: working) {
                    Task {
                        working = true
                        let ok = await health.connect(chosen, api: model.api)
                        working = false
                        if ok {
                            await done()
                            dismiss()
                        }
                    }
                }
                .disabled(working || chosen.isEmpty)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
        .interactiveDismissDisabled(working)
    }
}

/// The categories as switches.
struct AppleHealthCategoryList: View {
    @Binding var chosen: Set<HealthCategory>

    var body: some View {
        VStack(spacing: 12) {
            SettingsGroup {
                SettingsToggle(title: "Zapnout vše", isOn: Binding(
                    get: { chosen.count == HealthCategory.allCases.count },
                    set: { chosen = $0 ? Set(HealthCategory.allCases) : [] }
                ))
            }
            SettingsGroup {
                ForEach(Array(HealthCategory.allCases.enumerated()), id: \.element) { index, category in
                    if index > 0 { SettingsDivider() }
                    HStack(spacing: 14) {
                        SettingsIcon(systemImage: category.symbol, color: color(category))
                        SettingsToggle(title: category.title, isOn: Binding(
                            get: { chosen.contains(category) },
                            set: { if $0 { chosen.insert(category) } else { chosen.remove(category) } }
                        ))
                        .padding(.leading, -16)
                    }
                    .padding(.leading, 18)
                }
            }
        }
    }

    private func color(_ category: HealthCategory) -> Color {
        switch category {
        case .sleep, .hrv: return Palette.indigo
        case .heart, .resting: return Palette.rust
        case .breathing, .water: return Palette.blue
        case .steps, .workouts: return Palette.green
        case .energy, .food: return Palette.amber
        case .body: return Palette.brown
        }
    }
}

/// Apple Health's page in Zdroje dat: what it reads and syncing now.
struct AppleHealthSettings: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var chosen: Set<HealthCategory> = AppleHealth.shared.categories
    @State private var syncing = false
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        Group {
            if !health.enabled {
                SettingsGroup {
                    Button {
                        Task { _ = await health.connect(chosen, api: model.api); await store.load() }
                    } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "iphone", color: Color(light: 0xE5484D, dark: 0xF2777A)),
                                    title: "Číst Apple Health v tomhle iPhonu", chevron: false)
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("Oprávnění").font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                AppleHealthCategoryList(chosen: $chosen)
                    .disabled(health.syncing || store.demo)
            }
            .onChange(of: chosen) { _, value in
                guard !value.isEmpty else { return }
                // Switched off on this iPhone (another sign-in, Synchronizace): a switch turned
                // here means reading again, so it asks iOS and starts, instead of being forgotten.
                if !health.enabled {
                    Task { _ = await health.connect(value, api: model.api); await store.load() }
                    return
                }
                guard value != health.categories else { return }
                Task { await health.update(value, api: model.api); await store.load() }
            }
            if health.enabled {
                SettingsGroup {
                    Button {
                        Task { syncing = true; await health.sync(api: model.api, force: true); await store.load(); syncing = false }
                    } label: {
                        HStack {
                            Text(syncing || health.syncing ? "Načítám z Apple Health…" : "Načíst z Apple Health teď").font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            if syncing || health.syncing { ProgressView() } else { Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Palette.faint) }
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(syncing || health.syncing || store.demo)
                }
            }
            if let message = health.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
