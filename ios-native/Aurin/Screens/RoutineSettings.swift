import SwiftUI

/// Nastavení → Pauzy v posilovně: how long the rest is between the sets of an
/// exercise and between exercises (Režim tréninku counts it down). Each
/// follows the exercise unless a length is chosen.
struct GymRestSettingsView: View {
    static let options: [Int] = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
    /// "Podle cviku": the plan's rest for each exercise. The default between
    /// sets, so a length chosen here before stays.
    static let byExercise = -1

    /// The rest after a work set: the length chosen, else the plan's for the exercise.
    static func between(_ set: GymSet, setting: Int) -> Int {
        setting >= 0 ? setting : set.plannedRest ?? 90
    }

    /// The rest before the next exercise: the length chosen, else the rest the
    /// plan gives that exercise's sets (a heavy lift longer than a curl).
    static func before(_ exercise: GymExercise?, setting: Int) -> Int {
        if setting >= 0 { return setting }
        let set = exercise?.sets.first { !$0.done && $0.work } ?? exercise?.sets.first { !$0.done }
        return set?.plannedRest ?? 120
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

    /// The button's label in the grid: "1:30" where "1 min 30 s" won't fit.
    static func short(_ seconds: Int) -> String {
        seconds >= 60 && seconds % 60 != 0 ? String(format: "%d:%02d", seconds / 60, seconds % 60) : label(seconds)
    }
}

/// The two rests: a tap on a row opens all the lengths as buttons under it.
struct GymRestGroup: View {
    @AppStorage("restSets") private var restSets = GymRestSettingsView.byExercise
    @AppStorage("restExercises") private var restExercises = 120
    @State private var open: String?

    var body: some View {
        SettingsGroup(title: "Délka pauzy") {
            row("Mezi sériemi", $restSets)
            SettingsDivider()
            row("Mezi cviky", $restExercises)
        }
    }

    private func row(_ title: String, _ value: Binding<Int>) -> some View {
        let shown = open == title
        return VStack(spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.25)) { open = shown ? nil : title }
            } label: {
                HStack(spacing: 4) {
                    Text(title).font(.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Text(GymRestSettingsView.label(value.wrappedValue)).font(.subheadline)
                        .foregroundStyle(shown ? Palette.ink : Palette.muted)
                    Image(systemName: "chevron.up.chevron.down").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                        .opacity(shown ? 0 : 1)
                }
                .padding(.leading, 16).padding(.trailing, 14).frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if shown {
                RestLengthGrid(value: value) { withAnimation(.snappy(duration: 0.25)) { open = nil } }
                    .padding(.horizontal, 16).padding(.bottom, 14)
                    .transition(.opacity)
            }
        }
    }
}

/// "Podle cviku" and "bez pauzy" wide on top, the lengths four in a row below.
struct RestLengthGrid: View {
    @Binding var value: Int
    let done: () -> Void
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                chip(GymRestSettingsView.byExercise)
                chip(0)
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(GymRestSettingsView.options.filter { $0 > 0 }, id: \.self) { chip($0) }
            }
        }
    }

    private func chip(_ seconds: Int) -> some View {
        let on = value == seconds
        return Button {
            value = seconds
            done()
        } label: {
            Text(GymRestSettingsView.short(seconds)).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 36)
                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(GymRestSettingsView.label(seconds))
        .accessibilityAddTraits(on ? .isSelected : [])
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
