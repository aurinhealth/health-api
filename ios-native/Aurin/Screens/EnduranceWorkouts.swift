import SwiftUI

// MARK: - Own rides and runs (Moje tréninky)

/// Zone presets of the editor, as % of FTP or of threshold pace (the same as
/// src/endurance-templates.js ZONES).
enum EnduranceZones {
    static func all(_ sport: String) -> [(id: String, low: Int, high: Int)] {
        sport == "run"
            ? [("Z1", 70, 77), ("Z2", 78, 88), ("Z3", 89, 95), ("Z4", 96, 101), ("Z5", 102, 110)]
            : [("Z1", 45, 55), ("Z2", 56, 75), ("Z3", 76, 87), ("SS", 88, 93), ("Z4", 95, 105), ("Z5", 106, 120)]
    }

    static func name(_ sport: String, _ step: EnduranceStep) -> String {
        let mid = Double(step.low + step.high) / 2
        return all(sport).first { mid >= Double($0.low) - 0.5 && mid <= Double($0.high) + 0.5 }?.id ?? (mid < 50 ? "Z1" : "Z5+")
    }

    /// "15 min", "4:30 min" or "2 km".
    static func length(_ step: EnduranceStep) -> String {
        if let km = step.km { return Units.distanceText(km, digits: km < 10 ? 1 : 0) }
        let s = step.seconds ?? 0
        return s % 60 == 0 ? Fmt.duration(s / 60) : "\(s / 60):" + String(format: "%02d", s % 60) + " min"
    }

    /// "88–93 % · 229–242 W" or "78–88 % · 5:40–6:10 /km".
    static func target(_ sport: String, _ step: EnduranceStep, _ athlete: AthleteThresholds) -> String {
        let percent = step.low == step.high ? "\(step.low)" + Fmt.percentSign : "\(step.low)–\(step.high)" + Fmt.percentSign
        if sport == "run", let pace = athlete.runThresholdPace {
            return percent + " · " + ZonesSettingsView.pace(Units.pace(pace * 100 / Double(step.high))) + "–" + ZonesSettingsView.pace(Units.pace(pace * 100 / Double(step.low))) + " " + Units.paceUnit
        }
        if sport != "run", let ftp = athlete.ftp {
            let lo = Int((ftp * Double(step.low) / 100).rounded()), hi = Int((ftp * Double(step.high) / 100).rounded())
            return percent + " · " + (lo == hi ? "\(lo) W" : "\(lo)–\(hi) W")
        }
        return percent + (sport == "run" ? L10n.tr(" tempa") : " FTP")
    }
}

/// A new or changed ride or run: the name, the sections and repeats with the
/// chart over them, or a description in words the AI turns into sections.
struct EnduranceEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let workout: SavedWorkout?
    let athlete: AthleteThresholds
    let saved: (SavedWorkout) -> Void
    @State private var sport: String
    @State private var name: String
    @State private var blocks: [EnduranceBlock]
    @State private var wish = ""
    @State private var busy: String?
    @State private var error: String?
    @State private var editing: StepRef?

    struct StepRef: Identifiable {
        let block: Int
        let step: Int
        var id: String { "\(block)-\(step)" }
    }

    init(workout: SavedWorkout?, sport: String = "ride", athlete: AthleteThresholds, saved: @escaping (SavedWorkout) -> Void) {
        self.workout = workout
        self.athlete = athlete
        self.saved = saved
        _sport = State(initialValue: workout?.sport ?? sport)
        _name = State(initialValue: workout?.name ?? "")
        _blocks = State(initialValue: workout?.blocks ?? [])
    }

    private var template: WorkoutTemplate { WorkoutTemplate(sport: sport, name: name.trimmingCharacters(in: .whitespaces), minutes: nil, exercises: [], blocks: blocks) }
    private var valid: Bool { !template.name.isEmpty && !blocks.isEmpty }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if workout == nil {
                        Picker("Sport", selection: $sport) {
                            Text("Kolo").tag("ride")
                            Text("Běh").tag("run")
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: sport) { _, value in if value == "ride" { dropDistances() } }
                    }
                    TextField(sport == "run" ? "Název, třeba Kilometrovky" : "Název, třeba Sweet spot 3×15", text: $name)
                }

                Section {
                    TextField(sport == "run" ? "Třeba „rozběh 2 km, 6× 1 km rychle s 2 min klusem, vyklusání“" : "Třeba „hodina, rozjetí, 5× 4 min VO2max se 4 min volně, vyjetí“", text: $wish, axis: .vertical)
                        .lineLimit(2...4)
                    Button { Task { await describe() } } label: {
                        Label(busy == "describe" ? "Sestavuji…" : "Sestavit", systemImage: "sparkles").font(Typo.bodyStrong)
                    }
                    .disabled(wish.trimmingCharacters(in: .whitespaces).isEmpty || busy != nil || model.demo)
                } header: {
                    Text("Popsat slovy")
                } footer: {
                    Text("AI trénink poskládá z úseků, pak ho upravíš jako ručně.")
                }

                if !blocks.isEmpty {
                    Section {
                        WorkoutProfile(blocks: template.profile(ftp: athlete.ftp, thresholdPace: athlete.runThresholdPace), sport: sport)
                            .padding(.vertical, 6)
                    }
                }

                Section {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { i, block in
                        blockRow(i, block)
                    }
                    .onMove { blocks.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { blocks.remove(atOffsets: $0) }
                    HStack(spacing: 10) {
                        Button { add(EnduranceBlock(repeats: 1, steps: [defaultStep(zone: "Z2", minutes: 10)])) } label: {
                            Label("Úsek", systemImage: "plus").font(Typo.bodyStrong).frame(maxWidth: .infinity)
                        }
                        Button { add(EnduranceBlock(repeats: 3, steps: [defaultStep(zone: sport == "run" ? "Z4" : "SS", minutes: 5), defaultStep(zone: "Z1", minutes: 2)])) } label: {
                            Label("Opakování", systemImage: "arrow.2.squarepath").font(Typo.bodyStrong).frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderless)
                    .disabled(blocks.count >= 20)
                } header: {
                    Text(blocks.isEmpty ? "Úseky" : Fmt.duration(Int(template.enduranceMinutes(thresholdPace: athlete.runThresholdPace).rounded())))
                } footer: {
                    Text(sport == "run" ? "Intenzita je v procentech prahového tempa, kamarádovi se přepočte na jeho tempo." : "Intenzita je v procentech FTP, kamarádovi se přepočte na jeho watty.")
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            }
            .navigationTitle(workout == nil ? "Nový trénink" : "Upravit trénink")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy == "save" ? "Ukládám…" : "Uložit") { Task { await save() } }.fontWeight(.semibold).disabled(!valid || busy != nil)
                }
            }
            .sheet(item: $editing) { ref in
                if blocks.indices.contains(ref.block), blocks[ref.block].steps.indices.contains(ref.step) {
                    StepEditorSheet(step: blocks[ref.block].steps[ref.step], sport: sport, athlete: athlete,
                                    canDelete: blocks[ref.block].steps.count > 1 || blocks.count > 1) { changed in
                        if let changed { blocks[ref.block].steps[ref.step] = changed } else { removeStep(ref) }
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder
    private func blockRow(_ i: Int, _ block: EnduranceBlock) -> some View {
        if block.repeats == 1 && block.steps.count == 1 {
            stepButton(i, 0, block.steps[0])
        } else {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label(L10n.f("%@× opakovat", String(block.repeats)), systemImage: "arrow.2.squarepath")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.amber)
                    Spacer()
                    Stepper("Opakování", value: Binding(get: { blocks[i].repeats }, set: { blocks[i].repeats = $0 }), in: 2...30).labelsHidden()
                }
                ForEach(Array(block.steps.enumerated()), id: \.offset) { j, step in
                    stepButton(i, j, step).padding(.leading, 14)
                }
                if block.steps.count < 6 {
                    Button { blocks[i].steps.append(defaultStep(zone: "Z1", minutes: 2)) } label: {
                        Label("Přidat úsek do opakování", systemImage: "plus.circle").font(Typo.small).foregroundStyle(Palette.green)
                    }
                    .padding(.leading, 14)
                }
            }
            .buttonStyle(.borderless)
        }
    }

    private func stepButton(_ i: Int, _ j: Int, _ step: EnduranceStep) -> some View {
        Button { editing = StepRef(block: i, step: j) } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2).fill(WorkoutProfile.color(Double(step.low + step.high) / 2)).frame(width: 4, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(step.label.isEmpty ? EnduranceZones.name(sport, step) : step.label).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    Text([EnduranceZones.length(step), EnduranceZones.name(sport, step), EnduranceZones.target(sport, step, athlete)].joined(separator: " · "))
                        .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func defaultStep(zone: String, minutes: Int) -> EnduranceStep {
        let z = EnduranceZones.all(sport).first { $0.id == zone } ?? EnduranceZones.all(sport)[1]
        return EnduranceStep(label: "", seconds: minutes * 60, km: nil, low: z.low, high: z.high, cadence: nil)
    }

    private func add(_ block: EnduranceBlock) {
        blocks.append(block)
        editing = block.repeats == 1 ? StepRef(block: blocks.count - 1, step: 0) : nil
    }

    private func removeStep(_ ref: StepRef) {
        blocks[ref.block].steps.remove(at: ref.step)
        if blocks[ref.block].steps.isEmpty { blocks.remove(at: ref.block) }
    }

    /// A ride has no distances: they become the time they took at 5:00 /km.
    private func dropDistances() {
        for i in blocks.indices {
            for j in blocks[i].steps.indices where blocks[i].steps[j].km != nil {
                blocks[i].steps[j].seconds = Int((blocks[i].steps[j].minutes() * 60).rounded())
                blocks[i].steps[j].km = nil
            }
        }
    }

    private func describe() async {
        busy = "describe"
        defer { busy = nil }
        do {
            let t = try await model.api.describeWorkout(sport: sport, text: wish)
            blocks = t.blocks ?? []
            if name.trimmingCharacters(in: .whitespaces).isEmpty { name = t.name }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        busy = "save"
        defer { busy = nil }
        do {
            let result: SavedWorkout?
            if let workout { result = try await model.api.updateWorkout(id: workout.id, template) } else { result = try await model.api.saveWorkout(template) }
            if let result { saved(result) }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One section: its name, the length in time or (running) distance, the zone
/// or an exact range with the athlete's watts or paces, and the cadence.
struct StepEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var step: EnduranceStep
    @State private var byDistance: Bool
    let sport: String
    let athlete: AthleteThresholds
    let canDelete: Bool
    /// The changed section, or nil when it is deleted.
    let done: (EnduranceStep?) -> Void

    init(step: EnduranceStep, sport: String, athlete: AthleteThresholds, canDelete: Bool, done: @escaping (EnduranceStep?) -> Void) {
        _step = State(initialValue: step)
        _byDistance = State(initialValue: step.km != nil)
        self.sport = sport
        self.athlete = athlete
        self.canDelete = canDelete
        self.done = done
    }

    private var seconds: Binding<Int> { Binding(get: { step.seconds ?? 600 }, set: { step.seconds = $0 }) }
    /// The distance in the app's unit (km or mi), kept in km.
    private var distance: Binding<Double> {
        Binding(get: { (Units.distance(step.km ?? 1) * 10).rounded() / 10 },
                set: { step.km = max(0.1, min(50, ($0 / Units.distance(1) * 100).rounded() / 100)) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(EnduranceZones.name(sport, step), text: $step.label)
                } header: { Text("Název úseku") }

                Section {
                    if sport == "run" {
                        Picker("Délka", selection: $byDistance) {
                            Text("Čas").tag(false)
                            Text("Vzdálenost").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: byDistance) { _, value in
                            if value { step.km = step.km ?? 1; step.seconds = nil } else { step.seconds = step.seconds ?? 600; step.km = nil }
                        }
                    }
                    if byDistance {
                        Text(Units.distanceText(step.km ?? 1, digits: 1))
                            .font(Typo.number(48)).foregroundStyle(Palette.ink).frame(maxWidth: .infinity)
                        Stepper(L10n.f("o 0,1 %@", Units.distanceUnit), value: distance, in: 0.1...30, step: 0.1)
                        Stepper(L10n.f("o 1 %@", Units.distanceUnit), value: distance, in: 0.1...30, step: 1)
                    } else {
                        Text("\(seconds.wrappedValue / 60):" + String(format: "%02d", seconds.wrappedValue % 60))
                            .font(Typo.number(48)).foregroundStyle(Palette.ink).frame(maxWidth: .infinity)
                        Stepper("Minuty", value: Binding(get: { seconds.wrappedValue / 60 }, set: { seconds.wrappedValue = max(10, $0 * 60 + seconds.wrappedValue % 60) }), in: 0...300)
                        Stepper("Sekundy", value: Binding(get: { seconds.wrappedValue % 60 }, set: { seconds.wrappedValue = max(10, seconds.wrappedValue / 60 * 60 + $0) }), in: 0...55, step: 5)
                    }
                } header: { Text("Délka") }

                Section {
                    ChipFlow(items: EnduranceZones.all(sport).map { $0.id }, label: { $0 },
                             isOn: { EnduranceZones.name(sport, step) == $0 },
                             toggle: { id in if let z = EnduranceZones.all(sport).first(where: { $0.id == id }) { step.low = z.low; step.high = z.high } })
                    Stepper(value: Binding(get: { step.low }, set: { step.low = min($0, step.high) }), in: 30...200) {
                        row("Od", step.low)
                    }
                    Stepper(value: Binding(get: { step.high }, set: { step.high = max($0, step.low) }), in: 30...200) {
                        row("Do", step.high)
                    }
                    if sport != "run" {
                        Toggle("Kadence", isOn: Binding(get: { step.cadence != nil }, set: { step.cadence = $0 ? 90 : nil }))
                        if let cadence = step.cadence {
                            Stepper(value: Binding(get: { cadence }, set: { step.cadence = $0 }), in: 40...140, step: 5) {
                                Text(L10n.f("%@ ot/min", String(cadence)))
                            }
                        }
                    }
                } header: { Text("Intenzita") }

                if canDelete {
                    Section {
                        Button("Smazat úsek", role: .destructive) { done(nil); dismiss() }
                    }
                }
            }
            .navigationTitle(step.label.isEmpty ? EnduranceZones.name(sport, step) : step.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { done(step); dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.large])
    }

    /// "88 % · 229 W" or "88 % · 5:40 /km".
    private func row(_ title: String, _ percent: Int) -> some View {
        HStack {
            Text(L10n.tr(title))
            Spacer()
            Text(value(percent)).foregroundStyle(Palette.muted)
        }
    }

    private func value(_ percent: Int) -> String {
        if sport == "run", let pace = athlete.runThresholdPace { return "\(percent) % · " + Units.paceText(pace * 100 / Double(percent)) }
        if sport != "run", let ftp = athlete.ftp { return "\(percent) % · \(Int((ftp * Double(percent) / 100).rounded())) W" }
        return "\(percent)" + Fmt.percentSign
    }
}

/// A saved ride or run: its chart and sections with the athlete's own watts or
/// paces, then the day and where, planned into the week and Intervals.icu.
struct SavedEnduranceSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let workout: SavedWorkout
    var preset: String? = nil
    @State private var date = Date()
    @State private var indoor = true
    @State private var saving = false
    @State private var done = false
    @State private var error: String?

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(workout.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                Text(([workout.fromName.map { L10n.f("Od: %@", $0) }, (LibrarySport.find(workout.sport)?.label).map(L10n.tr), workout.minutes.map(Fmt.duration)].compactMap { $0 }).joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.muted)
                if let blocks = workout.steps, !blocks.isEmpty {
                    Card { WorkoutProfile(blocks: blocks, sport: workout.sport) }
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                }
                Card {
                    DatePicker("Den", selection: $date, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                    Picker("Kde", selection: $indoor) {
                        Text(workout.sport == "run" ? "Pás" : "Trenažér").tag(true)
                        Text("Venku").tag(false)
                    }
                    .pickerStyle(.segmented)
                    if done {
                        Label("Naplánováno, najdeš ho v týdnu i v Intervals.icu.", systemImage: "checkmark.circle.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    } else {
                        PrimaryButton(title: saving ? "Plánuji…" : "Naplánovat", systemImage: "calendar.badge.plus", busy: saving) { Task { await schedule() } }
                            .disabled(saving || model.demo)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .onAppear {
            if let preset, let d = GymBuilderView.isoFormatter.date(from: preset), d >= Calendar.current.startOfDay(for: Date()) { date = d }
        }
    }

    private func schedule() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.scheduleSavedWorkout(id: workout.id, date: AppModel.localDate(date), indoor: indoor)
            done = true
            error = nil
            await model.refreshTraining()
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Uložit do Mých tréninků" and "Sdílet" under a planned or done ride or run:
/// its sections as an own workout, without anything personal.
struct PlannedTemplateButtons: View {
    @Environment(AppModel.self) private var model
    let eventId: String
    var date: String? = nil
    @State private var template: WorkoutTemplate?

    var body: some View {
        Group {
            if let template {
                VStack(spacing: 10) {
                    SaveWorkoutButton(template: template)
                    ShareWorkoutButton(template: template, date: date)
                }
            }
        }
        .task(id: eventId) {
            guard template == nil, !model.demo else { return }
            template = try? await model.api.templateFromPlanned(eventId: eventId)
        }
    }
}
