import SwiftUI

/// Nastavení → Pauzy v posilovně: how long the rest is between the sets of an
/// exercise and before the next exercise (Režim tréninku counts it down).
struct GymRestSettingsView: View {
    @AppStorage("restSets") private var restSets = 90
    @AppStorage("restExercises") private var restExercises = 120

    static let options: [Int] = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]

    var body: some View {
        SettingsPage(title: "Pauzy v posilovně") {
            SettingsGroup(title: "Délka pauzy", footer: "Pauza se po sérii spustí sama. V režimu tréninku ji můžeš o 15 s zkrátit, prodloužit nebo přeskočit, výchozí délka se tím nemění.") {
                row("Mezi sériemi", $restSets)
                SettingsDivider()
                row("Před dalším cvikem", $restExercises)
            }
            Text("Těžké vícekloubové cviky (dřep, mrtvý tah, tlaky) snesou 2 až 3 minuty, menší cviky na stroji stačí 60 až 90 s.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func row(_ title: String, _ value: Binding<Int>) -> some View {
        HStack {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Picker(L10n.tr(title), selection: value) {
                ForEach(Self.options, id: \.self) { Text(Self.label($0)).tag($0) }
            }
            .pickerStyle(.menu)
            .tint(Palette.muted)
            .labelsHidden()
        }
        .padding(.leading, 16).padding(.trailing, 8).frame(minHeight: 50)
    }

    static func label(_ seconds: Int) -> String {
        if seconds == 0 { return L10n.tr("bez pauzy") }
        if seconds < 60 { return "\(seconds) s" }
        return seconds % 60 == 0 ? "\(seconds / 60) min" : "\(seconds / 60) min \(seconds % 60) s"
    }
}

/// Nastavení → Jídla dne: which meals the day has (snídaně, svačiny, oběd,
/// večeře, druhá večeře). The day's target is shared out over them.
struct MealSlotsSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var store: SettingsStore?
    @State private var chosen: Set<String> = Set(MealSlot.usual)
    @State private var original: Set<String> = Set(MealSlot.usual)
    @State private var saved = false

    var body: some View {
        SettingsPage(title: "Jídla dne") {
            SettingsGroup(title: "Jím obvykle", footer: "Denní cíl se rozdělí jen mezi vybraná jídla: snídaně a večeře po čtvrtině, oběd 30 %, svačiny po 10 %, druhá večeře 8 %. Jídlo zapsané jinam se v přehledu ukáže i tak.") {
                ForEach(Array(MealSlot.all.enumerated()), id: \.element.id) { index, slot in
                    if index > 0 { SettingsDivider() }
                    SettingsToggle(title: slot.label, subtitle: Self.hint(slot.id), isOn: Binding(
                        get: { chosen.contains(slot.id) },
                        set: { on in
                            if on { chosen.insert(slot.id) } else if chosen.count > 1 { chosen.remove(slot.id) }
                            saved = false
                        }))
                }
            }
            if saved {
                Label("Uloženo. Cíle jídel se přepočítaly.", systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            }
            if let error = store?.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }
        }
        .toolbar { SaveButton(enabled: store != nil && chosen != original, saving: store?.saving == true) { Task { await save() } } }
        .task {
            guard store == nil else { return }
            let s = SettingsStore(api: model.api, demo: model.demo)
            await s.load()
            store = s
            var list: [String] = []
            if case .array(let values)? = s.profile["meals"] { list = values.compactMap(\.string) }
            let known = Set(list).intersection(MealSlot.all.map(\.id))
            chosen = known.isEmpty ? Set(model.food?.mealSlots ?? MealSlot.usual) : known
            original = chosen
        }
    }

    static func hint(_ id: String) -> String {
        switch id {
        case "breakfast": return "kolem 7:00"
        case "snack_am": return "kolem 10:00"
        case "lunch": return "kolem 12:00"
        case "snack_pm": return "kolem 16:00"
        case "dinner": return "kolem 19:00"
        default: return "pozdě večer, kolem 21:00"
        }
    }

    private func save() async {
        guard let store else { return }
        let ordered = MealSlot.all.map(\.id).filter { chosen.contains($0) }
        guard await store.saveProfile(["meals": .array(ordered.map { .string($0) })]) else { return }
        original = chosen
        saved = true
        await model.refreshFood()
    }
}
