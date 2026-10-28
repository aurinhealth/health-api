import SwiftUI

// MARK: - Moje tréninky and Od přátel

/// Knihovna → "Moje tréninky" (the athlete's own) or "Od přátel" (from links
/// friends sent): grouped by sport, filter chips once there is more than one
/// sport, ⋯ with Naplánovat, Upravit or Uložit k sobě, Sdílet and Smazat.
struct MyWorkoutsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    let friends: Bool
    @State private var workouts: [SavedWorkout] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var sport: String?
    @State private var editing: EditorTarget?
    @State private var deleting: SavedWorkout?
    @State private var busy: String?
    @State private var note: String?
    @State private var athlete = AthleteThresholds()
    @State private var planning: SavedWorkout?

    struct EditorTarget: Identifiable {
        let workout: SavedWorkout?
        var sport = "gym"
        var id: String { workout?.id ?? "new-" + sport }
    }

    private var mine: [SavedWorkout] { workouts.filter { $0.fromFriend == friends } }
    private var sports: [LibrarySport] { LibrarySport.all.filter { s in mine.contains { $0.sport == s.id } } }
    private var shown: [SavedWorkout] { mine.filter { sport == nil || $0.sport == sport } }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: friends ? "Od přátel" : "Moje tréninky") {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(friends ? "Od přátel" : "Moje tréninky").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    if !friends {
                        Menu {
                            ForEach(LibrarySport.all) { s in
                                Button { editing = EditorTarget(workout: nil, sport: s.id) } label: { Label(L10n.tr(s.label), systemImage: s.symbol) }
                            }
                        } label: {
                            Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
                                .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                        }
                        .disabled(model.demo)
                        .accessibilityLabel("Nový trénink")
                    }
                }
                .padding(.top, 24)

                if sports.count > 1 {
                    ChipFlow(items: [""] + sports.map(\.id), label: { $0.isEmpty ? "Vše" : (LibrarySport.find($0)?.label ?? $0) },
                             isOn: { ($0.isEmpty && sport == nil) || $0 == sport }, toggle: { sport = $0.isEmpty ? nil : $0 })
                        .padding(.top, 16)
                }

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                } else if mine.isEmpty {
                    Text(friends ? "Až ti někdo pošle trénink odkazem, najdeš ho tady." : "Ulož si trénink, který jezdíš rád, a naplánuj ho jedním klepnutím. Přidáš ho přes + nebo z hotového návrhu.")
                        .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 20)
                } else {
                    ForEach(LibrarySport.all.filter { s in shown.contains { $0.sport == s.id } }) { s in
                        HStack(spacing: 7) {
                            Circle().fill(s.color).frame(width: 7, height: 7)
                            SectionLabel(text: s.label)
                        }
                        .padding(.top, 22)
                        VStack(spacing: 0) {
                            let list = shown.filter { $0.sport == s.id }
                            ForEach(list) { w in
                                row(w, sport: s)
                                if w.id != list.last?.id { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 56) }
                            }
                        }
                        .padding(.horizontal, 14)
                        .cardSurface(cornerRadius: 20)
                        .padding(.top, 10)
                    }
                    if friends {
                        Text("Uložit k sobě, naplánovat nebo smazat přes ⋯").font(Typo.caption).foregroundStyle(Palette.faint)
                            .frame(maxWidth: .infinity).padding(.top, 14)
                    }
                }
                if let note { Text(note).font(Typo.small).foregroundStyle(Palette.green).padding(.top, 12) }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
        }
        // Fresh from the server on every visit, on coming back to the app and on
        // a pull: a workout deleted or changed on another device is gone here too.
        .task(id: phase) { if phase == .active { await load() } }
        .refreshable { await load() }
        .sheet(item: $editing) { target in
            if (target.workout?.sport ?? target.sport) == "gym" {
                WorkoutEditorSheet(workout: target.workout) { stored($0) }
            } else {
                EnduranceEditorSheet(workout: target.workout, sport: target.sport, athlete: athlete) { stored($0) }
            }
        }
        .sheet(item: $planning) { w in SavedEnduranceSheet(workout: w) }
        .confirmationDialog("Smazat trénink?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { if let w = deleting { Task { await delete(w) } } }
        } message: {
            Text(deleting.map { $0.fromFriend ? $0.name : $0.name + "\n" + L10n.tr("Odkazy, kterými jsi ho poslal, přestanou fungovat.") } ?? "")
        }
    }

    private func row(_ w: SavedWorkout, sport: LibrarySport) -> some View {
        HStack(spacing: 12) {
            Button { plan(w) } label: {
                HStack(spacing: 12) {
                    Image(systemName: sport.symbol).font(.system(size: 13, weight: .semibold)).foregroundStyle(sport.color)
                        .frame(width: 32, height: 32).background(Palette.track, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            if w.fromFriend && !w.seen { Circle().fill(Palette.amberBar).frame(width: 7, height: 7).accessibilityLabel("Nový") }
                            Text(w.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                        }
                        Text(([w.fromName].compactMap { $0 } + [w.template.summary]).joined(separator: " · "))
                            .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Menu {
                Button { plan(w) } label: {
                    Label("Naplánovat", systemImage: "calendar.badge.plus")
                }
                if w.fromFriend {
                    Button { Task { await copy(w) } } label: { Label("Uložit k sobě", systemImage: "bookmark") }
                } else {
                    Button { editing = EditorTarget(workout: w) } label: { Label("Upravit", systemImage: "pencil") }
                }
                Button { Task { await share(w) } } label: { Label("Sdílet", systemImage: "square.and.arrow.up") }
                Button(role: .destructive) { deleting = w } label: { Label("Smazat", systemImage: "trash") }
            } label: {
                Group { if busy == w.id { ProgressView() } else { Image(systemName: "ellipsis") } }
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                    .frame(width: 32, height: 32)
            }
            .disabled(model.demo || busy != nil)
            .accessibilityLabel(L10n.f("Možnosti: %@", w.name))
        }
        .padding(.vertical, 12)
    }

    /// A gym workout is planned in the gym builder, a ride or run in its sheet.
    private func plan(_ w: SavedWorkout) {
        if w.template.isEndurance { planning = w; return }
        model.path(model.tab).wrappedValue.append(.planTemplate(TemplatePlanRequest(template: w.template, date: nil, fromName: w.fromName)))
    }

    private func stored(_ saved: SavedWorkout) {
        if let i = workouts.firstIndex(where: { $0.id == saved.id }) { workouts[i] = saved } else { workouts.insert(saved, at: 0) }
    }

    private func load() async {
        guard !model.demo else { loaded = true; return }
        do {
            let r = try await model.api.myWorkouts()
            workouts = r.workouts
            athlete = r.athlete
            error = nil
            // The dots stay for this visit; the badge in Knihovna goes.
            if friends, r.unseen > 0 { try? await model.api.markFriendWorkoutsSeen() }
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func run(_ id: String, _ work: () async throws -> Void) async {
        busy = id
        defer { busy = nil }
        do {
            try await work()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func copy(_ w: SavedWorkout) async {
        await run(w.id) {
            if let saved = try await model.api.copyWorkout(id: w.id) { workouts.insert(saved, at: 0) }
            note = L10n.f("„%@“ je v Mých trénincích.", w.name)
        }
    }

    private func share(_ w: SavedWorkout) async {
        await run(w.id) {
            try await WorkoutSharing.share(api: model.api, template: w.template, date: nil, groups: w.groups ?? [], scheme: scheme)
        }
    }

    private func delete(_ w: SavedWorkout) async {
        await run(w.id) {
            try await model.api.deleteWorkout(id: w.id)
            workouts.removeAll { $0.id == w.id }
        }
        deleting = nil
    }
}

// MARK: - Editor

/// A new or changed workout of Moje tréninky: the name, the length and the
/// exercises with their sets and repetitions, in order. Weights are not
/// saved: they come from the athlete's own history when it is planned.
struct WorkoutEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let workout: SavedWorkout?
    let saved: (SavedWorkout) -> Void
    @State private var name: String
    @State private var minutes: Int
    @State private var exercises: [TemplateExercise]
    @State private var catalog: [GymCatalogExercise] = []
    @State private var adding = false
    @State private var busy = false
    @State private var error: String?

    init(workout: SavedWorkout?, saved: @escaping (SavedWorkout) -> Void) {
        self.workout = workout
        self.saved = saved
        _name = State(initialValue: workout?.name ?? "")
        _minutes = State(initialValue: workout?.minutes ?? 60)
        _exercises = State(initialValue: workout?.exercises ?? [])
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !exercises.isEmpty && exercises.allSatisfy { TemplateExercise.validReps($0.reps) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Název, třeba Nohy", text: $name)
                    Picker("Délka", selection: $minutes) {
                        ForEach([30, 45, 60, 75, 90, 120], id: \.self) { Text(Fmt.duration($0)).tag($0) }
                    }
                }
                Section {
                    ForEach($exercises, id: \.name) { $e in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(e.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                            HStack(spacing: 10) {
                                Stepper(value: $e.sets, in: 1...10) {
                                    Text(L10n.f("%@ %@", String(e.sets), Fmt.plural(e.sets, "série", "série", "sérií"))).font(Typo.small)
                                }
                                TextField("8–12", text: $e.reps)
                                    .keyboardType(.numbersAndPunctuation)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 70)
                                    .foregroundStyle(TemplateExercise.validReps(e.reps) ? Palette.ink : Palette.rust)
                                    .accessibilityLabel("Opakování")
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .onMove { exercises.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { exercises.remove(atOffsets: $0) }
                    Button { adding = true } label: {
                        Label("Přidat cvik", systemImage: "plus.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    }
                    .disabled(catalog.isEmpty || exercises.count >= 30)
                } header: {
                    Text("Cviky")
                } footer: {
                    Text("Opakování číslem, rozsahem (8–12) nebo časem (30 s). Váhy se neukládají: při plánování se spočítají podle tvých tréninků.")
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            }
            .navigationTitle(workout == nil ? "Nový trénink" : "Upravit trénink")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Ukládám…" : "Uložit") { Task { await save() } }.fontWeight(.semibold).disabled(!valid || busy)
                }
                ToolbarItem(placement: .topBarLeading) { EditButton().disabled(exercises.isEmpty) }
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(catalog: catalog, used: Set(exercises.map(\.name))) { ex in
                    let sets = max(1, min(PlanEditorSheet.count(ex.sets) ?? 3, 10))
                    exercises.append(TemplateExercise(name: ex.name, sets: sets, reps: WorkoutTemplate.cleanReps(ex.reps?.string ?? "10")))
                }
            }
            .task { if catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] } }
        }
        .presentationDetents([.large])
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let template = WorkoutTemplate(name: name.trimmingCharacters(in: .whitespaces), minutes: minutes,
                                       exercises: exercises.map { TemplateExercise(name: $0.name, sets: $0.sets, reps: WorkoutTemplate.cleanReps($0.reps)) })
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

// MARK: - A link opened in the app

/// A friend's link (aurin.health/t/<id>): who sends it, the exercises
/// with their sets, Naplánovat on the sender's day (changeable) and keeping it
/// in Moje tréninky. Opening it puts it in Od přátel.
struct SharedWorkoutView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var share: SharedWorkout?
    @State private var received: SavedWorkout?
    @State private var planning: SavedWorkout?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: share?.name) {
            VStack(alignment: .leading, spacing: 0) {
                if let share {
                    Text(share.own ? L10n.tr("Tvůj sdílený trénink") : share.fromName.map { L10n.f("%@ ti posílá trénink", $0) } ?? L10n.tr("Trénink od přítele"))
                        .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 24)
                    Text(share.name).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 8)
                    Text(([L10n.tr(LibrarySport.find(share.sport)?.label ?? "Posilovna")] + [share.template.summary]).joined(separator: " · "))
                        .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 4)
                    if share.template.isEndurance {
                        endurance(share)
                    } else {
                        gym(share)
                    }
                    if !share.own {
                        SaveWorkoutButton(template: share.template).padding(.top, 10)
                    }
                } else if let error {
                    Text(error).font(Typo.sentence(22, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 40)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
        }
        .task { await load() }
        .sheet(item: $planning) { w in SavedEnduranceSheet(workout: w, preset: share.flatMap(plannedDay)) }
    }

    /// The chart and sections with the athlete's own watts or paces; planned
    /// from the copy in Od přátel (the sender's own link is planned from Moje tréninky).
    @ViewBuilder
    private func endurance(_ share: SharedWorkout) -> some View {
        if let blocks = share.steps, !blocks.isEmpty {
            Card { WorkoutProfile(blocks: blocks, sport: share.sport) }.padding(.top, 18)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
            }
            .padding(.top, 14)
        }
        Text(share.sport == "run" ? "Tempa se ti spočítají podle tvého prahového tempa." : "Watty se ti spočítají podle tvého FTP.")
            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
        if let received {
            PrimaryButton(title: L10n.tr("Naplánovat"), systemImage: "calendar.badge.plus") { planning = received }
                .padding(.top, 22)
        }
    }

    @ViewBuilder
    private func gym(_ share: SharedWorkout) -> some View {
                if let groups = share.groups, !groups.isEmpty {
                    Text(groups.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 4)
                }
                VStack(spacing: 0) {
                    ForEach(Array(share.exercises.enumerated()), id: \.offset) { i, e in
                        HStack {
                            Text(e.name).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Text("\(e.sets) × " + Fmt.range(e.reps)).font(Typo.small).foregroundStyle(Palette.secondary)
                        }
                        .padding(.vertical, 12)
                        if i < share.exercises.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
                .padding(.horizontal, 16)
                .cardSurface(cornerRadius: 20)
                .padding(.top, 18)
                Text("Váhy se ti spočítají podle tvých tréninků a toho, jak jsi odpočatý.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                NavigationLink(value: AppRoute.planTemplate(TemplatePlanRequest(template: share.template, date: plannedDay(share), fromName: share.own ? nil : share.fromName))) {
                    Label("Naplánovat", systemImage: "calendar.badge.plus").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 22)
    }

    /// The sender's day when it is still ahead, else today.
    private func plannedDay(_ share: SharedWorkout) -> String? {
        guard let date = share.date, date >= AppModel.localDate(Date()) else { return nil }
        return date
    }

    private func load() async {
        guard share == nil else { return }
        do {
            let found = try await model.api.sharedWorkout(id: id)
            share = found
            if !found.own { received = try? await model.api.receiveShare(id: id) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
