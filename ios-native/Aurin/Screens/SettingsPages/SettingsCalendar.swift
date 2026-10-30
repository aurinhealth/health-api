import SwiftUI

// MARK: - Kalendář v iPhonu (Settings → Data → Kalendář)

/// Reading the free time from the iPhone calendar and writing the planned
/// workouts into it (App/CalendarTime.swift). Also opened from Kdy mám čas,
/// which reloads its bars through `onChange`.
struct CalendarSettingsView: View {
    @Environment(AppModel.self) private var model
    var onChange: () -> Void = {}
    @State private var read = CalendarTime.shared.reads
    @State private var write = CalendarTime.shared.writes
    @State private var target = CalendarTime.shared.target
    @State private var busy = false
    @State private var error: String?

    /// "Vypnuto", "Čte" or "Čte a zapisuje" for the row that opens this page.
    static var status: String {
        let calendar = CalendarTime.shared
        return L10n.tr(calendar.writes ? "Čte a zapisuje" : calendar.reads ? "Čte" : "Vypnuto")
    }

    var body: some View {
        SettingsPage(title: "Kalendář") {
            SettingsGroup(footer: "Počítají se i kalendáře Google, Outlook a iCloud přidané v iPhonu (Nastavení iOS → Aplikace → Kalendář → Účty). Aurin posílá jen volné minuty na každý den, nikdy tvoje události.") {
                SettingsToggle(title: "Číst kalendář", subtitle: "Plán týdne a Aktivita dne se vejdou do volného času",
                               isOn: Binding(get: { read }, set: { on in Task { await setRead(on) } }),
                               disabled: busy || model.demo)
                if read {
                    SettingsDivider()
                    SettingsToggle(title: "Zapisovat tréninky", subtitle: "Tréninky, které v Aurinu naplánuješ, se objeví v kalendáři",
                                   isOn: Binding(get: { write }, set: { setWrite($0) }), disabled: busy)
                    if write {
                        SettingsDivider()
                        SettingsPicker(title: L10n.tr("Kalendář"), selection: Binding(get: { target }, set: { id in
                            CalendarTime.shared.target = id
                            target = id
                        }), options: CalendarTime.shared.calendars().map { ($0.id, $0.title) })
                    }
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true) }
        }
    }

    private func setWrite(_ on: Bool) {
        if !on { CalendarTime.shared.removeMirrored() }
        UserDefaults.standard.set(on, forKey: CalendarTime.writeKey)
        write = CalendarTime.shared.writes
        if on { Task { await CalendarTime.shared.mirror(api: model.api, force: true) } }
        onChange()
    }

    private func setRead(_ on: Bool) async {
        busy = true
        defer { busy = false }
        error = nil
        if on {
            guard await CalendarTime.shared.requestAccess() else {
                read = false
                error = L10n.tr("Aurin nemá přístup ke kalendáři. Povol ho v Nastavení iPhonu → Aplikace → Aurin → Kalendáře.")
                return
            }
            UserDefaults.standard.set(true, forKey: CalendarTime.readKey)
            read = true
            await CalendarTime.shared.send(api: model.api, force: true)
        } else {
            read = false
            if CalendarTime.shared.writes { CalendarTime.shared.removeMirrored() }
            do { try await CalendarTime.shared.stopReading(api: model.api) } catch { self.error = error.localizedDescription }
        }
        write = CalendarTime.shared.writes
        onChange()
    }
}
