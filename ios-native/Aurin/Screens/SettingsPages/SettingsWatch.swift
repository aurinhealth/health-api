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
        SettingsPage(title: "Apple Watch", hero: SettingsHero(text: deviceText, art: AnyView(Self.watch))) {
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

    /// The page's sentence: paired, installed and when Aurin last sent Today to the watch
    /// (what the app knows; it gets no receipt from the watch).
    private var deviceText: String {
        let state = WatchBridge.shared.watchState
        if !state.paired { return L10n.tr("Hodinky nejsou spárované s tímto iPhonem.") }
        if !state.installed { return L10n.tr("Aurin na hodinkách ještě není. Nainstaluj ho v aplikaci Watch v iPhonu.") }
        if let sent = WatchBridge.shared.lastSent {
            let time = ClockText.format(sent)
            return Calendar.current.isDateInToday(sent)
                ? L10n.f("Aurin poslal hodinkám data dnes v %@.", time)
                : L10n.f("Aurin poslal hodinkám data %@.", sent.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(L10n.locale)) + " " + time)
        }
        return L10n.tr("Apple Watch jsou spárované a Aurin v nich je.")
    }

    /// A small watch with Readiness on its face (the concept's drawing).
    static var watch: some View {
        let ink = Color(light: 0x2C2D2E, dark: 0x2C2D2E)
        return VStack(spacing: -2) {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(ink).frame(width: 40, height: 14)
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(light: 0x15140F, dark: 0x15140F))
                RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Palette.faint.opacity(0.6), lineWidth: 1.5)
                VStack(spacing: 3) {
                    Image(systemName: "heart.fill").font(.system(size: 15)).foregroundStyle(Color(light: 0xECEAE6, dark: 0xECEAE6))
                    Text(verbatim: L10n.tr("Připravenost")).font(.system(size: 8)).foregroundStyle(Color(light: 0xA3A8A5, dark: 0xA3A8A5))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                .padding(.horizontal, 6)
            }
            .frame(width: 60, height: 70)
            .overlay(alignment: .trailing) {
                RoundedRectangle(cornerRadius: 1.5).fill(ink).frame(width: 4, height: 12).offset(x: 4)
            }
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(ink).frame(width: 40, height: 14)
        }
        .accessibilityHidden(true)
    }

    private func shown(_ page: String) -> Binding<Bool> {
        Binding(get: { page == "readiness" || settings.pages.contains(page) }, set: { on in
            settings.pages = order.filter { $0 == page ? on : settings.pages.contains($0) }
        })
    }
}
