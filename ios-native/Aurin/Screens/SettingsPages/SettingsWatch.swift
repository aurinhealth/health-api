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
        List {
            Section { device }
            Section {
                ForEach(order, id: \.self) { page in
                    Toggle(L10n.tr(Self.names[page] ?? page), isOn: shown(page))
                        .disabled(page == "readiness")
                        .moveDisabled(page == "readiness")
                }
                .onMove { from, to in
                    order.move(fromOffsets: from, toOffset: to)
                    // Readiness opens the watch app: it stays on top.
                    if let i = order.firstIndex(of: "readiness"), i != 0 { order.remove(at: i); order.insert("readiness", at: 0) }
                    settings.pages = order.filter { settings.pages.contains($0) }
                }
            } header: {
                Text("Stránky")
            } footer: {
                Text("Mezi stránkami se na hodinkách přechází korunkou. Pořadí změníš přetažením.")
            }
            Section {
                Toggle(L10n.tr("Otevřít na hodinkách"), isOn: $settings.openOnWatch)
                Picker(L10n.tr("Když skončí pauza"), selection: $settings.restEnd) {
                    Text("Ťuknutí a zvuk").tag("tapBeep")
                    Text("Jen ťuknutí").tag("tap")
                    Text("Nic").tag("none")
                }
            } header: {
                Text("Posilovna")
            } footer: {
                Text("Režim tréninku v iPhonu spustí posilovnu i na hodinkách. Hodinky měří tep a kalorie a trénink uloží do Zdraví jednou.")
            }
            Section {
                Picker(L10n.tr("Budík zvoní na"), selection: $settings.alarmOnWatch) {
                    Text("iPhonu").tag(false)
                    Text("Apple Watch").tag(true)
                }
                if settings.alarmOnWatch {
                    LabeledContent(L10n.tr("Záloha na iPhonu")) {
                        Text(backup.map { $0.formatted(date: .omitted, time: .shortened) } ?? "–")
                            .foregroundStyle(Palette.indigo)
                    }
                }
            } header: {
                Text("Budík")
            } footer: {
                if settings.alarmOnWatch {
                    Text("Hodinky zvoní první. Když je nevypneš, za 5 minut zazvoní iPhone. Čas budíku je stejný jako v Nastavení → Spánek.")
                } else {
                    Text("Zvoní jen jedno zařízení. Čas budíku je stejný jako v Nastavení → Spánek.")
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("Apple Watch")
        .navigationBarTitleDisplayMode(.inline)
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
                .background(Palette.background, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Watch").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(text).font(Typo.small).foregroundStyle(state.installed ? Palette.green : Palette.muted)
            }
        }
        .padding(.vertical, 4)
    }

    private func shown(_ page: String) -> Binding<Bool> {
        Binding(get: { page == "readiness" || settings.pages.contains(page) }, set: { on in
            settings.pages = order.filter { $0 == page ? on : settings.pages.contains($0) }
        })
    }
}
