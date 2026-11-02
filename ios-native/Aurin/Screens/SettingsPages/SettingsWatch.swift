import SwiftUI

/// Nastavení → Apple Watch: whether the watch is connected and when it last
/// got Today, its pages by the crown (on or off, drag to reorder; Readiness
/// stays first), whether Training mode opens the gym on the watch, what the
/// end of a rest does there, and whether the
/// alarm rings on the iPhone or the watch. Sent to the watch with Today
/// (WatchShared/WatchSettings.swift).
struct WatchSettingsView: View {
    @State private var settings = WatchBridge.settings
    @State private var order: [String] = []
    /// When the iPhone's backup for the watch's alarm rings (SystemAlarm.backup).
    @State private var backup = SystemAlarm.backupTime

    private static let names = ["readiness": "Připravenost", "training": "Trénink", "food": "Jídlo"]

    var body: some View {
        SettingsPage(title: "Apple Watch") {
            device
            SettingsGroup(title: "Stránky", footer: "Mezi stránkami se na hodinkách přechází korunkou. Pořadí změníš přetažením.") {
                ForEach(Array(order.enumerated()), id: \.element) { i, page in
                    if i > 0 { SettingsDivider() }
                    pageRow(page)
                }
            }
            SettingsGroup(title: "Posilovna", footer: "Režim tréninku v iPhonu spustí posilovnu i na hodinkách. Hodinky měří tep a kalorie a trénink uloží do Zdraví jednou.") {
                SettingsToggle(title: L10n.tr("Otevřít na hodinkách"), isOn: $settings.openOnWatch)
                SettingsDivider()
                SettingsPicker(title: "Když skončí pauza", selection: $settings.restEnd,
                               options: [("tapBeep", "Ťuknutí a zvuk"), ("tap", "Jen ťuknutí"), ("none", "Nic")])
            }
            SettingsGroup(title: "Budík", footer: settings.alarmOnWatch
                ? "Hodinky zvoní první. Když je nevypneš, za 5 minut zazvoní iPhone. Čas budíku je stejný jako v Nastavení → Spánek."
                : "Zvoní jen jedno zařízení. Čas budíku je stejný jako v Nastavení → Spánek.") {
                SettingsPicker(title: "Budík zvoní na", selection: Binding(get: { settings.alarmOnWatch ? "watch" : "iphone" },
                                                                         set: { settings.alarmOnWatch = $0 == "watch" }),
                               options: [("iphone", "iPhonu"), ("watch", "Apple Watch")])
                if settings.alarmOnWatch {
                    SettingsDivider()
                    SettingsRow(title: "Záloha na iPhonu",
                                value: backup.map { $0.formatted(date: .omitted, time: .shortened) } ?? "–", chevron: false)
                }
            }
        }
        .onAppear {
            backup = SystemAlarm.backupTime
            order = settings.pages + WatchSettings.allPages.filter { !settings.pages.contains($0) }
        }
        .onChange(of: settings) { old, new in
            WatchBridge.settings = new
            if old.alarmOnWatch != new.alarmOnWatch {
                Task {
                    await WatchBridge.shared.alarmOnWatch(new.alarmOnWatch)
                    backup = SystemAlarm.backupTime
                }
            }
        }
    }

    /// A page with its switch; the others carry a handle on the left and are
    /// dragged onto each other to change the order. Readiness opens the watch
    /// app, so it stays first and on.
    @ViewBuilder
    private func pageRow(_ page: String) -> some View {
        let fixed = page == "readiness"
        HStack(spacing: 0) {
            SettingsGrip().opacity(fixed ? 0 : 1)
            SettingsToggle(title: L10n.tr(Self.names[page] ?? page), subtitle: fixed ? L10n.tr("Vždy první") : nil,
                           isOn: shown(page), disabled: fixed)
                .padding(.leading, -6)
        }
        .contentShape(Rectangle())
        .modifier(SettingsReorder(id: page, movable: !fixed, accepts: WatchSettings.allPages) { moved in move(moved, before: page) })
    }

    /// Puts `moved` where `target` is; Readiness never leaves the top.
    private func move(_ moved: String, before target: String) {
        guard moved != target, moved != "readiness", let from = order.firstIndex(of: moved),
              let to = order.firstIndex(of: target) else { return }
        withAnimation(.snappy) {
            order.remove(at: from)
            order.insert(moved, at: max(1, to))
        }
        settings.pages = order.filter { settings.pages.contains($0) }
    }

    private var device: some View {
        let state = WatchBridge.shared.watchState
        let text: String
        if !state.paired {
            text = L10n.tr("Hodinky nejsou spárované s tímto iPhonem.")
        } else if !state.installed {
            text = L10n.tr("Aurin na hodinkách ještě není. Nainstaluj ho v aplikaci Watch v iPhonu.")
        } else if let sent = WatchBridge.shared.lastSent {
            text = L10n.f("Připojeno · data poslaná %@", sent.formatted(date: .omitted, time: .shortened))
        } else {
            text = L10n.tr("Připojeno")
        }
        return HStack(spacing: 12) {
            Image(systemName: "applewatch")
                .font(.system(size: 22))
                .foregroundStyle(Palette.ink)
                .frame(width: 40, height: 40)
                .background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Watch").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(text).font(Typo.small).foregroundStyle(state.installed ? Palette.green : Palette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .cardSurface(cornerRadius: 22)
    }

    private func shown(_ page: String) -> Binding<Bool> {
        Binding(get: { page == "readiness" || settings.pages.contains(page) }, set: { on in
            settings.pages = order.filter { $0 == page ? on : settings.pages.contains($0) }
        })
    }
}
