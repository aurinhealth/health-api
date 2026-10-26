import SwiftUI

/// Nastavení → Pauzy v posilovně: how long the rest is between the sets of an
/// exercise and before the next exercise (Režim tréninku counts it down).
/// Between sets it follows the exercise unless a length is chosen.
struct GymRestSettingsView: View {
    static let options: [Int] = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
    /// "Podle cviku": the plan's rest for each exercise. The default, so a
    /// length chosen here before stays.
    static let byExercise = -1

    /// The rest after a work set: the length chosen, else the plan's for the exercise.
    static func between(_ set: GymSet, setting: Int) -> Int {
        setting >= 0 ? setting : set.plannedRest ?? 90
    }

    var body: some View {
        SettingsPage(title: "Pauzy v posilovně") { GymRestGroup() }
    }

    static func label(_ seconds: Int) -> String {
        if seconds == byExercise { return L10n.tr("Podle cviku") }
        if seconds == 0 { return L10n.tr("bez pauzy") }
        if seconds < 60 { return "\(seconds) s" }
        return seconds % 60 == 0 ? "\(seconds / 60) min" : "\(seconds / 60) min \(seconds % 60) s"
    }
}

/// The two rests as menus: between the sets and before the next exercise.
struct GymRestGroup: View {
    @AppStorage("restSets") private var restSets = GymRestSettingsView.byExercise
    @AppStorage("restExercises") private var restExercises = 120

    var body: some View {
        SettingsGroup(title: "Délka pauzy") {
            row("Mezi sériemi", $restSets, options: [GymRestSettingsView.byExercise] + GymRestSettingsView.options)
            SettingsDivider()
            row("Před dalším cvikem", $restExercises)
        }
    }

    private func row(_ title: String, _ value: Binding<Int>, options: [Int] = GymRestSettingsView.options) -> some View {
        HStack {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Picker(L10n.tr(title), selection: value) {
                ForEach(options, id: \.self) { Text(GymRestSettingsView.label($0)).tag($0) }
            }
            .pickerStyle(.menu)
            .tint(Palette.muted)
            .labelsHidden()
        }
        .padding(.leading, 16).padding(.trailing, 8).frame(minHeight: 50)
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
            SettingsGroup(title: "Jím obvykle") {
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

/// Nastavení → Snímač tepu: a chest strap or a band broadcasting its heart
/// rate, for Režim tréninku without an Apple Watch.
struct HeartRateSensorView: View {
    private var sensor: HeartRateSensor { HeartRateSensor.shared }
    private var live: LiveWorkout { LiveWorkout.shared }

    static func icon(for source: String, sensor: Bool) -> String {
        if sensor { return "heart.fill" }
        let name = source.lowercased()
        if name.contains("airpods") || name.contains("beats") { return "airpodspro" }
        if name.contains("watch") { return "applewatch" }
        return "heart.text.square"
    }

    var body: some View {
        SettingsPage(title: "Snímač tepu") {
            // During a workout: what the heart rate on top of it comes from.
            if live.running, let bpm = live.heartRate {
                let fromSensor = sensor.liveBpm != nil
                let source = (fromSensor ? sensor.savedName : live.heartSource) ?? L10n.tr("Apple Health")
                SettingsGroup(title: "Teď měří") {
                    HStack(spacing: 12) {
                        SettingsIcon(systemImage: Self.icon(for: source, sensor: fromSensor), color: fromSensor ? Palette.rust : Palette.ink)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(source).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                            Text(fromSensor ? "snímač tepu" : "přes Apple Health")
                                .font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        Text("\(Fmt.int(bpm)) bpm").font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50)
                }
            }
            if let name = sensor.savedName {
                SettingsGroup(title: "Spárováno") {
                    HStack(spacing: 12) {
                        SettingsIcon(systemImage: "heart.fill", color: Palette.rust)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(name).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                            // Connected but silent: the band doesn't broadcast its beat.
                            if sensor.liveBpm == nil {
                                Text(sensor.connected ? "připojeno, zatím neposílá tep" : "nepřipojeno")
                                    .font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        if let bpm = sensor.liveBpm {
                            Text("\(Fmt.int(bpm)) bpm").font(.subheadline).foregroundStyle(Palette.muted)
                        }
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50)
                    SettingsDivider()
                    Button { sensor.forget() } label: {
                        SettingsRow(title: "Zapomenout snímač", chevron: false, titleColor: Palette.rust)
                    }
                    .buttonStyle(.plain)
                }
            }
            SettingsGroup(title: "V okolí", footer: L10n.tr("Hrudní pás nebo náramek, který vysílá tep, například Whoop, Polar nebo Garmin.")) {
                if sensor.unavailable {
                    SettingsRow(title: "Bluetooth je vypnutý nebo nepovolený", chevron: false, titleColor: Palette.muted)
                } else if sensor.found.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Hledám…").font(.body).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50)
                } else {
                    ForEach(Array(sensor.found.enumerated()), id: \.element.id) { index, device in
                        if index > 0 { SettingsDivider() }
                        Button { sensor.pair(device) } label: {
                            SettingsRow(title: device.name, value: device.name == sensor.savedName ? L10n.tr("spárováno") : nil, chevron: false)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .onAppear { sensor.startScan(); sensor.connectSaved() }
        .onDisappear {
            sensor.stopScan()
            // Outside a workout the sensor needn't stay connected.
            if !LiveWorkout.shared.running { sensor.disconnect() }
        }
    }
}
