import SwiftUI
import TipKit
import UIKit

/// Režim tréninku: one exercise and one set at a time, big enough to use
/// between sets. "Hotovo" records the set (the planned weight and reps unless
/// changed, how hard it was in words) and starts the rest (the lengths from
/// Nastavení, longer before the next exercise); after the last set comes the
/// next exercise. The plan can be reordered, shortened or extended on the way.
/// The screen stays on meanwhile.
struct TrainingModeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var day: GymDay?
    @State private var loading = true
    @State private var error: String?
    @State private var index = 0
    @State private var kg = ""
    @State private var reps = ""
    /// The set whose letter is being chosen (IntensitySheet).
    @State private var intensityFor: SetRef?
    /// Sets whose letter was chosen here: shown solid, not as the plan's.
    @State private var picked: Set<Int> = []
    /// Done sets whose change to the next weight was declined ("Nechat").
    @State private var kept: Set<Int> = []
    @AppStorage("restSets") private var restSets = GymRestSettingsView.byExercise
    @AppStorage("restExercises") private var restExercises = 120
    @State private var restEnd: Date?
    @State private var restTotal = 90
    @State private var restStart: Date?
    @State private var catalog: [GymCatalogExercise] = []
    @State private var dumbbells: [Double] = []
    @State private var editing = false
    @State private var muscles: [String: [String: Double]] = [:]
    @State private var history: GymHistory = .empty
    /// How each exercise was done last time: "sides" or "both".
    @State private var sideChoices: [String: String] = [:]
    /// The heart rate zones' lower bounds (Nastavení → Tréninkové zóny).
    @State private var zoneLows: [Double] = []
    @State private var technique: String?
    @State private var historyFor: String?
    /// The exercise to swap ("Nahradit cvik"), its sets still to do.
    @State private var swapping: String?
    /// "Vybrat jiný cvik" for this exercise: the whole catalog.
    @State private var replacing: String?
    /// The exercise whose Moje poznámka is being written.
    @State private var noteFor: String?
    /// The barbell set whose plates are being loaded.
    @State private var loadingBar: PlateTarget?
    private var notes: ExerciseNotes { .shared }
    @State private var saving = false
    @State private var rating = false
    /// Dokončit trénink was tapped: the summary shows the totals.
    @State private var finishedSession = false
    @State private var totals: (minutes: Int, kcal: Double?, avgHr: Double?, maxHr: Double?, saved: Bool, zones: [Double])?
    /// The day as it was before this screen, for Zahodit trénink.
    @State private var original: GymDay?
    @State private var confirmClose = false
    /// Zahodit trénink in the summary, after Dokončit.
    @State private var confirmDiscard = false
    /// Opened on a workout already finished: its summary, with Ohodnotit and
    /// Pokračovat v tréninku (Zahodit has no earlier day to go back to).
    @State private var reopened = false
    @State private var picking = false
    /// The heart rate sensors, from the heart in the header.
    @State private var sensors = false
    /// "Začít trénink" tapped (the sample day has no recording to show it).
    @State private var startTapped = false
    /// Hidden with the arrow: the workout goes on, only the screen closes.
    @State private var minimizing = false
    /// Where the set table is, so a swipe on a set row deletes the set
    /// instead of turning to another exercise.
    @State private var tableFrame: CGRect = .zero
    /// Teď ("now") or Další ("next") with its sets unfolded in the rest.
    @State private var unfolded: Set<String> = []
    /// The warm-up's stretches ticked (StretchingCard): all of them done, the
    /// card makes way for the first exercise.
    @AppStorage("gym.stretching.done") private var stretchesDone = ""
    /// The day's parts, their order and switches (GymDayParts).
    @AppStorage(GymDayParts.storageKey) private var dayParts = ""
    @Environment(\.scenePhase) private var scenePhase
    private var live: LiveWorkout { LiveWorkout.shared }
    /// The clock, heart rate and recording run only after "Začít trénink" (or
    /// for a workout already under way); opening the workout starts nothing.
    private var started: Bool { live.running || startTapped }

    var body: some View {
        ZStack {
            // A tap beside the fields puts the keyboard away.
            ScreenBackground(glow: Palette.Glow.training)
                .onTapGesture { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            // The Live Activity follows the heart rate from here: read in this
            // screen's body, every beat redrew the whole workout.
            HeartRateWatch(live: live) { syncActivity(quiet: true) }
            VStack(alignment: .leading, spacing: 0) {
                header
                if let day, !finishedSession, let exercise = current(day) { tools(day, exercise) }
                if loading && day == nil {
                    Spacer()
                    ProgressView().frame(maxWidth: .infinity)
                    Spacer()
                } else if let day, !day.exercises.isEmpty {
                    if !finishedSession, let exercise = current(day) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 0) {
                                if live.running {
                                    LiveWorkoutStrip(live: live, volume: GymSessionMath.volume(day.exercises), zoneLows: zoneLows).padding(.top, 14)
                                }
                                let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
                                // The parts before the exercises, in the day's order, until the first set is done.
                                if restEnd == nil, !day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                                    ForEach(parts.before(day)) { part in
                                        if let routine = parts.routine(part, day: day), !routineDone(routine, kind: part.kind) {
                                            StretchingCard(stretching: routine, date: date, kind: part.kind, compact: true).padding(.top, 14)
                                        }
                                    }
                                }
                                // Before Začít trénink: what comes at the end too.
                                if !started {
                                    ForEach(parts.after(day)) { part in
                                        if let routine = parts.routine(part, day: day) {
                                            StretchingCard(stretching: routine, date: date, kind: part.kind, compact: true).padding(.top, 10)
                                        }
                                    }
                                }
                                if let restEnd {
                                    rest(day, exercise, until: restEnd)
                                } else {
                                    session(day, exercise)
                                }
                            }
                            .padding(.bottom, 24)
                        }
                        .scrollIndicators(.hidden)
                        .scrollDismissesKeyboard(.interactively)
                    } else {
                        ScrollView { finished(day).padding(.bottom, 24) }
                        .scrollIndicators(.hidden)
                    }
                } else {
                    empty
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
        .navBarVisibility(.hidden)
        .task { await load() }
        // A set or a change from the Apple Watch (WatchGymBridge.swift).
        .onReceive(NotificationCenter.default.publisher(for: .watchGym)) { note in
            guard let change = note.object as? WatchBridge.GymChange, change.date == date else { return }
            day = change.day
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true; model.immersive = true
            GymActivityInbox.handler = { activityAction($0) }
            // The paired sensor connects already when the workout opens, so the
            // heart shows it before Začít trénink.
            if !model.demo { HeartRateSensor.shared.connectSaved() }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false; model.immersive = false
            // Left another way than the arrow (the edge swipe, a link) while the
            // workout runs: it goes on hidden, as with the arrow.
            if !minimizing, live.running, !finishedSession, let day, current(day) != nil {
                keepMinimized(day)
                minimizing = true
            }
            if minimizing {
                // The rest alarm and the Live Activity stay; their taps wait in the bar.
                let model = model
                GymActivityInbox.handler = { Self.minimizedAction($0, model: model) }
            } else {
                Task { await Reminders.restEnds(at: nil) }
                GymActivityInbox.handler = nil
                GymLiveActivity.end()
                if !live.running { HeartRateSensor.shared.disconnect() }
            }
        }
        .onChange(of: restEnd) { _, end in Task { await Reminders.restEnds(at: end) }; syncActivity() }
        .onChange(of: day) { _, _ in syncActivity() }
        .onChange(of: index) { _, _ in syncActivity() }
        .onChange(of: finishedSession) { _, _ in syncActivity() }
        // Back from the lock screen after the rest ran out: straight to the set.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, let end = restEnd, end <= Date() { restEnd = nil }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
        .sheet(item: Binding(get: { historyFor.map { Named(name: $0) } }, set: { historyFor = $0?.name })) { item in
            ExerciseHistorySheet(name: item.name, exercise: history.exercise(item.name), today: date)
        }
        // Rated or skipped: the workout is done, the mode closes.
        .sheet(isPresented: $rating, onDismiss: { dismiss() }) {
            GymRatingSheet(date: date, exercises: day?.exerciseNames ?? [])
        }
        .confirmationDialog("Ukončit trénink?", isPresented: $confirmClose, titleVisibility: .visible) {
            // Later: the clock and heart rate stop now and start again on return.
            Button("Pokračovat později") { live.reset(); dismiss() }
            Button("Zahodit trénink", role: .destructive) { Task { await discard() } }
        }
        .confirmationDialog("Zahodit trénink?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Zahodit trénink", role: .destructive) { Task { await discard() } }
        } message: {
            Text("Trénink zmizí z plánu dne, smažou se zapsané série i trénink uložený do Apple Health.")
        }
        .sheet(isPresented: $picking) {
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day?.exercises.map(\.name) ?? [])) { name in
                Task { await add(name) }
            }
        }
        .sheet(item: $intensityFor) { ref in
            let set: GymSet? = day?.exercises.flatMap(\.sets).first(where: { $0.row == ref.id })
            let remove: (() -> Void)? = set?.drop == true && set?.done == false ? { Task { await removeDrop(ref.id) } } : nil
            IntensitySheet(title: set.map { $0.drop ? L10n.tr("Dropset") : $0.warmup ? L10n.tr("Rozcvička") : L10n.f("Série %@", $0.number) } ?? "",
                           selected: set?.intensity, onRemoveDrop: remove) { letter in
                Task { await pickIntensity(ref.id, letter) }
            }
        }
        .sheet(isPresented: $sensors) {
            NavigationStack { HeartRateSensorView() }
                .presentationDetents([.medium, .large])
        }
        .sheet(item: Binding(get: { swapping.map { Named(name: $0) } }, set: { swapping = $0?.name })) { item in
            AlternativesSheet(date: date, exercise: item.name, inPlan: day?.exercises.map(\.name) ?? [],
                              subtitle: swapSubtitle(item.name),
                              footnote: L10n.f("Hotové série zůstanou u cviku %@.", ExerciseCatalog.shownName(item.name)), choose: { _ in },
                              chooseAlternative: { alt in Task { await swapExercise(item.name, for: alt) } }, limit: 3,
                              chooseOther: {
                                  // After this sheet is gone: one sheet at a time.
                                  Task { try? await Task.sleep(for: .milliseconds(450)); replacing = item.name }
                              })
        }
        // "Vybrat jiný cvik": any exercise from the catalog takes its sets still to do.
        .sheet(item: Binding(get: { replacing.map { Named(name: $0) } }, set: { replacing = $0?.name })) { item in
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day?.exercises.map(\.name) ?? []),
                              title: "Vybrat jiný cvik", eyebrow: L10n.f("Místo cviku %@", ExerciseCatalog.shownName(item.name))) { name in
                let kg = GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name }).work.first?.kg
                let alt = GymAlternative(name: name, muscle: nil, sets: nil, reps: nil, note: nil, station: nil, kg: kg)
                Task { await swapExercise(item.name, for: alt) }
            }
        }
        .sheet(item: Binding(get: { noteFor.map { Named(name: $0) } }, set: { noteFor = $0?.name })) { item in
            ExerciseNoteSheet(exercise: item.name)
        }
        .sheet(item: $loadingBar) { target in
            PlateLoaderSheet(title: target.title, exercise: target.exercise, startKg: target.kg, usual: target.usual) { total in loaded(total, on: target) }
        }
        .sheet(isPresented: $editing) {
            if let day {
                PlanEditorSheet(day: day, catalog: catalog, date: date, current: index,
                                go: { edited, id in Task { await saveEdited(edited, focus: id) } }) { edited in Task { await saveEdited(edited) } }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            // Under way: the arrow hides it and the workout goes on (MinimizedGymBar).
            if started, !finishedSession, let day, current(day) != nil {
                CircleButton(systemImage: "chevron.down", label: L10n.tr("Skrýt trénink")) { minimize() }
            } else {
                CircleButton(systemImage: "xmark", label: L10n.tr("Ukončit režim tréninku")) { close() }
            }
            // The summary has its own title: no exercise and sets line above it.
            if let day, !day.exercises.isEmpty, !finishedSession {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title(day)).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(progressLine(day)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 4)
                if !finishedSession, current(day) != nil {
                    if started {
                        Button { Task { await finish() } } label: {
                            Text("Dokončit").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                                .padding(.horizontal, 14).frame(height: 36).background(Palette.button, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                    }
                }
            } else {
                Spacer()
            }
        }
    }

    /// Under the header: sound and vibration, the heart rate, the coach and the plan.
    private func tools(_ day: GymDay, _ exercise: GymExercise) -> some View {
        HStack(spacing: 8) {
            // Coach and Plan keep their words; the left chips drop theirs
            // (first Vibrace, then Bez tepu) when the row is too narrow, e.g.
            // with larger text, so nothing wraps or ends in "…". Coach stays
            // outside ViewThatFits: a switch must not close its open chat.
            ViewThatFits(in: .horizontal) {
                signalsAndHeart(compactSignals: false, compactHeart: false)
                signalsAndHeart(compactSignals: true, compactHeart: false)
                signalsAndHeart(compactSignals: true, compactHeart: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            CoachPill(subject: .workout(day, exercise: exercise, resting: restEnd != nil, restSeconds: restTotal, date: date), height: 34)
            Button { editing = true } label: { ToolChip(systemImage: "list.bullet", title: L10n.tr("Plán")).fixedSize() }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.tr("Upravit plán"))
        }
        .padding(.top, 12)
    }

    private func signalsAndHeart(compactSignals: Bool, compactHeart: Bool) -> some View {
        HStack(spacing: 8) {
            GymSignalsMenu(compact: compactSignals).fixedSize()
            HeartSourceButton(live: live, compact: compactHeart) { sensors = true }.fixedSize()
        }
    }

    private func title(_ day: GymDay) -> String {
        day.planName?.nilIfBlank ?? L10n.tr("Posilovna")
    }

    /// "Cvik 2 z 5 · 6/16 sérií".
    private func progressLine(_ day: GymDay) -> String {
        let done: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let total: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        let position = L10n.f("Cvik %@ z %@", String(min(index, day.exercises.count - 1) + 1), String(day.exercises.count))
        return position + " · " + L10n.plural("%lld/%lld sérií", done, total)
    }

    // MARK: The exercise

    private func session(_ day: GymDay, _ exercise: GymExercise) -> some View {
        let set = nextSet(exercise)
        let last = history.last(exercise.name, before: date)
        return VStack(alignment: .leading, spacing: 0) {
            Text(exercise.name).font(Typo.sentence(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 18)
            // Named, not bare icons: what each one does shows at first use.
            HStack(spacing: 8) {
                if set != nil {
                    Button { swapping = exercise.name } label: { ToolChip(systemImage: "arrow.triangle.swap", title: L10n.tr("Vyměnit")) }
                        .buttonStyle(.plain).accessibilityLabel(L10n.tr("Nahradit cvik"))
                }
                Button { historyFor = exercise.name } label: { ToolChip(systemImage: "chart.bar", title: L10n.tr("Historie")) }
                    .buttonStyle(.plain).accessibilityLabel(L10n.tr("Historie cviku"))
                Button { technique = exercise.name } label: { ToolChip(systemImage: "info.circle", title: L10n.tr("Technika")) }
                    .buttonStyle(.plain)
            }
            .padding(.top, 10)

            ExerciseNoteLine(note: notes.note(exercise.name)) { noteFor = exercise.name }.padding(.top, 8)

            chips(day, exercise, set)

            // Only where sides make sense: one-legged or one-armed, or already done by sides.
            // Any other exercise switches with Každá strana beside + Série.
            if showsSides(exercise) { sidesPicker(exercise) }

            setTable(exercise, set, last)

            if let note = GymSides.note(exercise) { CoachNote(text: note).padding(.top, 12) }

            if let set {
                if started {
                    PrimaryButton(title: saving ? "Ukládám…" : "Série hotová", systemImage: "checkmark", busy: saving) {
                        Task { await complete(set) }
                    }
                    .disabled(saving)
                    .padding(.top, 14)
                } else {
                    Button { Task { await start() } } label: {
                        Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                            .frame(maxWidth: .infinity).frame(height: 54).background(Palette.green, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 14)
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
            nextExercise(day).padding(.top, 14)
            addExerciseButton.padding(.top, 10)
        }
        .onChange(of: set?.row) { _, _ in prefill(set, in: exercise) }
        .onAppear { prefill(set, in: exercise) }
        // A swipe sideways goes to the next or the previous exercise.
        .contentShape(Rectangle())
        .coordinateSpace(name: "session")
        .simultaneousGesture(DragGesture(minimumDistance: 30, coordinateSpace: .named("session")).onEnded { drag in
            let dx = drag.translation.width, dy = drag.translation.height
            guard abs(dx) > 70, abs(dx) > abs(dy) * 2, !tableFrame.contains(drag.startLocation) else { return }
            withAnimation(.snappy) { move(dx < 0 ? 1 : -1) }
        })
        .task(id: exercise.name) { await loadMuscles(day) }
    }

    /// "Obě strany najednou | Každá strana zvlášť": the next time the exercise
    /// comes, it comes the way it was done last (src/gym-sides.js).
    private func sidesPicker(_ exercise: GymExercise) -> some View {
        Picker("", selection: Binding(get: { exercise.bySides }, set: { on in Task { await setSides(exercise, on) } })) {
            Text("Obě strany najednou").tag(false)
            Text("Každá strana zvlášť").tag(true)
        }
        .pickerStyle(.segmented)
        .disabled(saving || !sidesOpen(exercise))
        .padding(.top, 12)
    }

    private func showsSides(_ exercise: GymExercise) -> Bool {
        exercise.bySides || GymSides.oneSided(exercise.name) || sideChoices[exercise.name] == "sides"
    }

    /// Sets left to do: the sides can still change.
    private func sidesOpen(_ exercise: GymExercise) -> Bool {
        exercise.sets.contains { !$0.done && !$0.warmup }
    }

    private func setSides(_ exercise: GymExercise, _ on: Bool) async {
        guard var next = day, let offset = next.exercises.firstIndex(where: { $0.id == exercise.id }) else { return }
        next.setSides(at: offset, on)
        day = next
        sideChoices[exercise.name] = on ? "sides" : "both"
        guard !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    private func setTable(_ exercise: GymExercise, _ set: GymSet?, _ last: GymHistory.Session?) -> some View {
        VStack(spacing: 2) {
            tableHeader
            ForEach(exercise.sets) { s in
                if s.row == set?.row, let change = adjusted(s, in: exercise) {
                    AdjustmentNote(text: change.text, keep: change.keep) { keep(change.from, in: exercise) }
                        .padding(.horizontal, 6).padding(.vertical, 4)
                }
                // Swiped left: just this set goes away (a done one, a warm-up too).
                setRow(s, exercise, current: set, last: last)
                    .modifier(SwipeToDelete(enabled: !saving) { Task { await deleteSet(s) } })
            }
            tableActions(exercise, set)
        }
        .padding(.vertical, 12).padding(.horizontal, 4)
        .cardSurface(cornerRadius: 22)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("session")) } action: { tableFrame = $0 }
        .padding(.top, 14)
    }

    private var tableHeader: some View { GymSetTableHeader() }

    private func setRow(_ s: GymSet, _ exercise: GymExercise, current: GymSet?, last: GymHistory.Session?) -> GymSetRow {
        let phase: GymSetRow.Phase = s.done ? .done : (s.row == current?.row ? .current : .next)
        // The sets to come show what the set before was done with.
        let carry = s.done ? nil : GymSessionMath.carried(s, in: exercise, keep: kept)
        let shownKg: String = LiftWeight.shown(s.done ? s.kg : carry?.kg ?? s.plannedKg) ?? ""
        let shownReps: String = Fmt.range((s.done ? s.reps : carry?.reps ?? s.plannedReps) ?? "")
        // By sides the number shows on the L row only.
        let letter = s.done ? s.intensity ?? GymIntensity.from(rpe: s.rpe) : carriedLetter(s, in: exercise) ?? s.intensity
        var plateTap: (() -> Void)? = nil
        if let usual = usualBar(exercise) {
            let target = PlateTarget(id: s.row, exercise: exercise.name, title: s.warmup ? exercise.name : L10n.f("%@ · série %@", exercise.name, s.number),
                                     kg: LiftWeight.number(LiftWeight.kgText(kg.isEmpty ? shownKg : kg)), usual: usual)
            plateTap = { loadingBar = target }
        }
        return GymSetRow(label: s.warmup ? "W" : s.drop ? "↳" : s.side == "P" ? "" : s.number, side: s.side,
                         lastTime: GymSessionMath.lastTime(s, in: exercise, last: last),
                         kg: shownKg, reps: shownReps, state: phase,
                         kgText: $kg, repsText: $reps, kgHint: shownKg, repsHint: s.plannedReps.map(Fmt.range),
                         drop: s.drop, intensity: letter, planned: !s.done && !picked.contains(s.row),
                         onIntensity: { intensityFor = SetRef(id: s.row) },
                         onEdit: s.done ? { k, r in Task { await editDone(s, kg: k, reps: r) } } : nil,
                         onKgTap: plateTap) {
            switch phase {
            case .done: Task { await undo(s) }
            case .current: Task { await complete(s) }
            case .next: break
            }
        }
    }

    private func tableActions(_ exercise: GymExercise, _ set: GymSet?) -> some View {
        HStack(spacing: 8) {
            pill("plus", L10n.tr("Série")) { Task { await addSet() } }.disabled(saving)
            // Both sides at once so far: the sets left can go one side at a time
            // (a band leg curl one leg after the first set), the switch then shows.
            if !showsSides(exercise), sidesOpen(exercise) {
                Button { Task { await setSides(exercise, true) } } label: {
                    Label(L10n.tr("Každá strana"), systemImage: "arrow.left.and.right").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
                        .padding(.horizontal, 10).frame(height: 30).overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .disabled(saving)
                .accessibilityLabel(L10n.tr("Každá strana zvlášť"))
            }
            if let plates = platesText(exercise) {
                Text(plates).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .padding(.horizontal, 10).frame(height: 30).overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.top, 8)
    }

    /// The bar (or plate-loaded machine) an exercise is done with: its weight is
    /// loaded as plates. Nil for dumbbells, cables and stack machines.
    private func usualBar(_ exercise: GymExercise) -> PlateBar? {
        PlateBar.usual(catalog.first { $0.name == exercise.name }?.stations ?? [])
    }

    /// The bar loaded: the set at hand takes the weight, and so do the work
    /// sets still to do (a warm-up keeps it to itself).
    private func loaded(_ total: Double, on target: PlateTarget) {
        let text = GymCoach.kgText(total)
        kg = LiftWeight.shown(text) ?? text
        guard let exercise = day?.exercises.first(where: { $0.name == target.exercise }),
              exercise.sets.first(where: { $0.row == target.id })?.work == true else { return }
        Task { await setWeight(text, of: exercise) }
    }

    /// "Kotouče: 20 + 10 na stranu" for a lift done with plates.
    private func platesText(_ exercise: GymExercise) -> String? {
        guard let usual = usualBar(exercise), let shown = LiftWeight.number(kg) else { return nil }
        let bar = PlateBar.saved(exercise.name) ?? usual
        guard shown > bar.weight, let plates = PlateLoad.perSide(shown, bar: bar.weight, sizes: PlateLoad.sizes) else { return nil }
        return L10n.f("Kotouče: %@ na stranu", plates)
    }

    @ViewBuilder
    private func chips(_ day: GymDay, _ exercise: GymExercise, _ set: GymSet?) -> some View {
        let main: [String] = mainMuscles(exercise)
        let record = GymSessionMath.record(history.exercise(exercise.name), before: date)
        let superset = ExerciseOrder.letter(exercise.superset)
        let failure = set.map { day.isToFailure(row: $0.row) } ?? false
        if !main.isEmpty || record != nil || superset != nil || failure {
            ScrollView(.horizontal) { HStack(spacing: 6) {
                ForEach(main, id: \.self) { id in
                    Text(BodyFigure.label(id)).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
                        .padding(.horizontal, 9).frame(height: 24).background(Palette.track, in: Capsule())
                }
                if let record, let text = GymSessionMath.lift(record) {
                    Text(L10n.f("Rekord %@", text)).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.amber)
                        .padding(.horizontal, 9).frame(height: 24).background(Palette.amberSoft, in: Capsule())
                }
                if let superset { GymTag.superset(superset) }
                if failure { GymTag.failure }
            } }
            .scrollIndicators(.hidden)
            .padding(.top, 10)
        }
    }

    private func mainMuscles(_ exercise: GymExercise) -> [String] {
        let map: [String: Double] = muscles[exercise.name] ?? [:]
        let strong = map.filter { $0.value >= 0.5 }.sorted { $0.value > $1.value }
        return Array(strong.prefix(3).map { $0.key })
    }

    private func pill(_ systemImage: String, _ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.secondary)
                .padding(.horizontal, 10).frame(height: 30).overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(systemImage == "plus" ? "O sérii víc" : "O sérii méně"))
    }

    @ViewBuilder
    private func nextExercise(_ day: GymDay) -> some View {
        // In a superset the partner comes next (A1, B1, A2…).
        let partner = Self.supersetPartner(day.exercises, of: index)
        if let target = partner ?? (day.exercises.indices.contains(index + 1) ? index + 1 : nil), let next = day.exercises[safe: target] {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Button { move(target - index) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "dumbbell").scaledFont(15, cap: .denseCap).foregroundStyle(Palette.secondary)
                                .frame(width: 34, height: 34).background(Palette.track, in: Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Další").font(Typo.caption).foregroundStyle(Palette.muted)
                                Text(next.name)
                                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                                Text(nextLoad(next)).font(Typo.small).foregroundStyle(Palette.secondary).lineLimit(1)
                                ExerciseNoteLine(note: notes.note(next.name), compact: true).padding(.top, 2)
                            }
                            Spacer(minLength: 4)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if next.sets.contains(where: { !$0.done }) {
                        SmallInfoButton(label: "Nahradit cvik", systemImage: "arrow.triangle.swap") { swapping = next.name }
                    }
                    SmallInfoButton { technique = next.name }
                    foldButton("next")
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                if unfolded.contains("next") {
                    RestSetsList(exercise: next, last: history.last(next.name, before: date)) { typed in
                        Task { await setWeight(LiftWeight.kgText(typed), of: next) }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 10)
                }
            }
            .cardSurface(cornerRadius: 22)
        } else if index > 0 {
            Button { move(-1) } label: {
                Label("Předchozí cvik", systemImage: "chevron.left").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
            }
            .buttonStyle(.plain)
        }
    }

    /// "15 kg × 5–8 · 3 série": the first set still to do and the sets left.
    private func nextLoad(_ next: GymExercise) -> String {
        let left: Int = next.workCount - next.doneCount
        let count: String = L10n.plural("%lld sérií", left)
        guard let set = next.sets.first(where: { !$0.done && $0.work }) else { return count }
        return GymLiveActivity.load(set, in: next) + " · " + count
    }

    /// The arrow that unfolds the sets of Teď or Další.
    private func foldButton(_ key: String) -> some View {
        Button {
            withAnimation(.snappy) { if unfolded.contains(key) { unfolded.remove(key) } else { unfolded.insert(key) } }
        } label: {
            Image(systemName: unfolded.contains(key) ? "chevron.up" : "chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
                .frame(width: 28, height: 34).tapTarget(width: 28, height: 34)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(unfolded.contains(key) ? "Skrýt série" : "Ukázat série"))
    }

    /// A weight typed under Další: all its sets still to do take it.
    private func setWeight(_ kg: String, of exercise: GymExercise) async {
        guard !kg.isEmpty, var next = day else { return }
        for set in exercise.sets where !set.done && set.work { next.set(row: set.row, column: 3, kg) }
        guard next != day else { return }
        day = next
        guard !model.demo else { return }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    // MARK: The rest

    private func rest(_ day: GymDay, _ exercise: GymExercise, until end: Date) -> some View {
        let set = nextSet(exercise)
        let last = history.last(exercise.name, before: date)
        return VStack(alignment: .leading, spacing: 14) {
            RestRing(end: end, total: restTotal).padding(.top, 24)
            HStack(spacing: 10) {
                SecondaryButton(title: "−15 s") { shiftRest(-15) }
                SecondaryButton(title: "+15 s") { shiftRest(15) }
                SecondaryButton(title: "Přeskočit") { restEnd = nil }
            }
            .padding(.top, 6)
            TipView(LockScreenRestTip()).tipBackground(Palette.card)
            // Its own view: each heartbeat redraws the card, not the whole screen.
            if let restStart { LiveHeartRecovery(live: live, since: restStart) }
            if let set {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Teď").font(Typo.caption).foregroundStyle(Palette.muted)
                    HStack(alignment: .firstTextBaseline) {
                        Text(nowLine(exercise, set))
                            .font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(plannedLine(set, in: exercise))
                            .font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1)
                        SmallInfoButton { technique = exercise.name }.padding(.leading, 4)
                        foldButton("now")
                    }
                    if let previous = GymSessionMath.lastTime(set, in: exercise, last: last) {
                        Text(L10n.f("Minule %@", previous)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    if let change = adjusted(set, in: exercise) {
                        AdjustmentNote(text: change.text, keep: change.keep) { keep(change.from, in: exercise) }.padding(.top, 6)
                    }
                    if unfolded.contains("now") { RestSetsList(exercise: exercise, last: last, keep: kept) }
                }
                .padding(16)
                .cardSurface(cornerRadius: 22)
            }
            nextExercise(day)
            let progress = GymSessionMath.muscleProgress(day.exercises, muscles: muscles)
            if !progress.isEmpty {
                MuscleProgressCard(items: progress, total: (day.exercises.reduce(0) { $0 + $1.doneCount }, day.exercises.reduce(0) { $0 + $1.workCount }))
            }
        }
        .task(id: end) {
            // The tones are planned ahead, so they sound with the phone locked too.
            let planned = GymSignals.planRest(until: end)
            // Each whole second to the end: the last ones tick (Nastavení → Posilovna).
            while true {
                let left = end.timeIntervalSinceNow
                let second = max(0, left.rounded(.up) - 1)
                if left > second { try? await Task.sleep(for: .seconds(left - second)) }
                guard !Task.isCancelled, restEnd == end else {
                    // Skipped or changed: its tones stop (a new end plans its own).
                    if restEnd != end { GymSignals.stopRest(end) }
                    return
                }
                if second == 0 { break }
                if GymSignals.counts(Int(second)) { GymSignals.play(.tick, withSound: !planned) }
            }
            GymSignals.play(.end, withSound: !planned)
            // The rest is over: the screen turns to the set.
            restEnd = nil
        }
    }

    /// Every move of a part ticked (by hand or by its timer).
    private func routineDone(_ routine: GymStretching, kind: GymRoutineKind) -> Bool {
        let done = StretchingCard.done(stretchesDone, date: date)
        return !routine.items.isEmpty && routine.items.allSatisfy { done.contains(kind.key + $0.id) }
    }

    private func nowLine(_ exercise: GymExercise, _ set: GymSet) -> String {
        let which: String = set.warmup ? L10n.tr("rozcvička") : set.drop ? L10n.tr("dropset") : L10n.f("série %@", set.number)
        return exercise.name + " · " + which
    }

    /// "80 kg × 8".
    private func plannedLine(_ set: GymSet, in exercise: GymExercise) -> String {
        let carry = GymSessionMath.carried(set, in: exercise, keep: kept)
        let weight: String = LiftWeight.shown(carry?.kg ?? set.plannedKg).map { $0 + " " + Units.weightUnit + " × " } ?? ""
        return weight + Fmt.range(carry?.reps ?? set.plannedReps ?? "")
    }

    // MARK: The end

    private func finished(_ day: GymDay) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 8) {
                SectionLabel(text: "Trénink dokončen")
                Text(title(day)).font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 22)
            summaryGrid(day).padding(.top, 6)
            ForEach(newRecords(day)) { record in recordCard(record) }
            if let zones = totals?.zones, zones.reduce(0, +) >= 1 { ZoneMinutesCard(minutes: zones) }
            changesCard(day)
            if totals?.saved == true { healthCard }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if !finishedSession { addExerciseButton }
            // What comes after the exercises, before the session is closed (GymDayParts).
            if !finishedSession {
                let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
                ForEach(parts.after(day)) { part in
                    if let routine = parts.routine(part, day: day) { StretchingCard(stretching: routine, date: date, kind: part.kind) }
                }
            }
            if finishedSession {
                PrimaryButton(title: L10n.tr("Ohodnotit"), systemImage: "hand.thumbsup") { rating = true }
                // Dokončit by mistake: back to the workout, the clock from its start.
                if !model.demo {
                    SecondaryButton(title: "Pokračovat v tréninku", systemImage: "play.fill") { Task { await resume() } }
                        .disabled(saving)
                }
                if !reopened {
                    Button(role: .destructive) { confirmDiscard = true } label: {
                        Text("Zahodit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                            .frame(maxWidth: .infinity).frame(height: 46)
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
            } else {
                PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: saving) { Task { await finish() } }
                    .disabled(saving)
            }
            // The muscles with this workout counted (loaded again once it is saved).
            if finishedSession, let muscles = model.muscles { WorkoutFatigueCard(data: muscles).padding(.top, 6) }
        }
    }

    private func summaryGrid(_ day: GymDay) -> some View {
        let sets: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let planned: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        // Finished early: "5 z 7", so the sets left out show.
        let setsText: String = sets < planned ? L10n.f("%@ z %@", String(sets), String(planned)) : String(sets)
        let volume: Double = GymSessionMath.volume(day.exercises)
        let shown = GymSessionMath.volumeText(volume)
        let columns = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
            if let totals {
                total(L10n.tr("Čas"), Fmt.duration(totals.minutes))
                if let kcal = totals.kcal { total(L10n.tr("Kalorie"), Fmt.int(kcal) + " kcal") }
                if let hr = totals.avgHr { total(L10n.tr("Prům. tep"), Fmt.int(hr) + " bpm") }
            }
            total(L10n.tr("Série"), setsText)
            total(L10n.tr("Objem"), shown.value + " " + shown.unit, change: volumeChange(day, volume), better: volume >= lastVolume(day))
            if let hr = totals?.maxHr { total(L10n.tr("Max. tep"), Fmt.int(hr) + " bpm") }
        }
    }

    /// kg × reps of the same exercises last time.
    private func lastVolume(_ day: GymDay) -> Double {
        var sum = 0.0
        for exercise in day.exercises {
            guard let last = history.last(exercise.name, before: date) else { continue }
            for lift in last.sets { sum += (lift.kg ?? 0) * (lift.reps ?? 0) }
        }
        return sum
    }

    /// "+0,6 t" against last time.
    private func volumeChange(_ day: GymDay, _ volume: Double) -> String? {
        let before = lastVolume(day)
        guard before > 0, volume > 0 else { return nil }
        let unit: String = GymSessionMath.volumeText(volume).unit
        return Fmt.signed(Units.weight(volume - before) / 1000, digits: 1) + " " + unit
    }

    struct NewRecord: Identifiable {
        let name: String
        let lift: GymHistory.Lift
        var id: String { name }
    }

    private func newRecords(_ day: GymDay) -> [NewRecord] {
        var out: [NewRecord] = []
        for exercise in day.exercises {
            let lifts = GymSessionMath.lifts(exercise)
            guard let best = lifts.max(by: { GymSessionMath.e1rm($0) < GymSessionMath.e1rm($1) }),
                  let old = GymSessionMath.record(history.exercise(exercise.name), before: date) else { continue }
            if GymSessionMath.e1rm(best) > GymSessionMath.e1rm(old) + 0.01 { out.append(NewRecord(name: exercise.name, lift: best)) }
        }
        return out
    }

    private func recordCard(_ record: NewRecord) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles").foregroundStyle(Palette.amber)
                .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text("Nový rekord").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(record.name + " " + (GymSessionMath.lift(record.lift) ?? "")).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer()
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    struct ExerciseChange: Identifiable {
        let name: String
        let work: String
        let text: String
        let better: Bool?
        var id: String { name }
    }

    private func exerciseChanges(_ day: GymDay) -> [ExerciseChange] {
        var out: [ExerciseChange] = []
        for exercise in day.exercises where exercise.doneCount > 0 {
            guard let change = GymSessionMath.change(exercise, last: history.last(exercise.name, before: date)) else { continue }
            out.append(ExerciseChange(name: exercise.name, work: work(exercise), text: change.text, better: change.better))
        }
        return out
    }

    @ViewBuilder
    private func changesCard(_ day: GymDay) -> some View {
        let changes = exerciseChanges(day)
        if !changes.isEmpty {
            VStack(spacing: 0) {
                ForEach(changes) { item in changeRow(item, first: item.id == changes.first?.id) }
            }
            .padding(.horizontal, 16)
            .cardSurface(cornerRadius: 22)
        }
    }

    private func changeRow(_ item: ExerciseChange, first: Bool) -> some View {
        let color: Color = item.better == true ? Palette.green : (item.better == false ? Palette.rust : Palette.muted)
        return HStack(spacing: 8) {
            Text(item.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(item.work).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            Text(item.text).font(Typo.caption.weight(.semibold)).foregroundStyle(color).frame(minWidth: 52, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
    }

    private var healthCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "heart.fill").foregroundStyle(Palette.rust)
            Text("Uloženo do Apple Health").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Spacer()
            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    /// "4 × 80 kg": the work sets and their top weight.
    private func work(_ exercise: GymExercise) -> String {
        let lifts = GymSessionMath.lifts(exercise)
        guard let top = lifts.compactMap(\.kg).max(), top > 0 else { return L10n.f("%@ ×", String(lifts.count)) }
        return "\(lifts.count) × " + GymCoach.shown(top) + " " + Units.weightUnit
    }

    private func total(_ title: String, _ value: String, change: String? = nil, better: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.small).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
            if let change { Text(change).font(Typo.caption).foregroundStyle(better ? Palette.green : Palette.rust) }
        }
    }

    /// Nothing planned: an empty workout the exercises are added to one by one.
    private var empty: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            if day?.cancelled == true {
                Text("Dnešní posilovna je zrušená.").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            } else {
                Text("Prázdný trénink").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                PrimaryButton(title: L10n.tr("Přidat cvik"), systemImage: "plus") { picking = true }
            }
            NavigationLink(value: AppRoute.gymBuilder) {
                Label("Sestavit trénink", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.card, in: Capsule())
            }
            .buttonStyle(.plain)
            // The last workout's exercises with the next loads (GymLive.swift).
            if day?.cancelled != true, let last = history.lastWorkoutDate(before: date) {
                let count = history.lastWorkout(before: date).count
                NavigationLink(value: AppRoute.liveGym(date, true)) {
                    VStack(spacing: 2) {
                        Label("Zopakovat minulou", systemImage: "arrow.counterclockwise").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: Fmt.capitalized(Fmt.relativeDay(last, today: date)) + " · " + L10n.plural("%lld cviků", count))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    .frame(maxWidth: .infinity).frame(height: 60).background(Palette.card, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    private var addExerciseButton: some View {
        Button { picking = true } label: {
            Label("Přidat cvik", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity).frame(height: 46)
                .background(Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: Parts

    private func current(_ day: GymDay) -> GymExercise? {
        let list = day.exercises
        guard !list.isEmpty else { return nil }
        if list.allSatisfy({ $0.sets.allSatisfy(\.done) }) && restEnd == nil { return nil }
        return list[min(index, list.count - 1)]
    }

    enum SupersetRest { case none, round, exercise }

    /// The next exercise of the superset with sets left, other than this one.
    static func supersetPartner(_ list: [GymExercise], of index: Int) -> Int? {
        guard let letter = ExerciseOrder.letter(list[safe: index]?.superset) else { return nil }
        let group = list.indices.filter { ExerciseOrder.letter(list[$0].superset) == letter }
        guard let pos = group.firstIndex(of: index) else { return nil }
        return (1..<max(group.count, 1)).map { group[(pos + $0) % group.count] }.first { list[$0].sets.contains { !$0.done } }
    }

    /// After a set of an exercise in a superset: its partner with sets left
    /// (no rest between them), back to the first one after a round (a rest),
    /// or past the superset when all of it is done. Nil outside a superset.
    static func supersetTurn(_ list: [GymExercise], from index: Int) -> (index: Int, rest: SupersetRest)? {
        guard let letter = ExerciseOrder.letter(list[safe: index]?.superset) else { return nil }
        let group = list.indices.filter { ExerciseOrder.letter(list[$0].superset) == letter }
        guard group.count > 1, let pos = group.firstIndex(of: index) else { return nil }
        let open = Set(group.filter { list[$0].sets.contains { !$0.done } })
        if open.isEmpty {
            let after = list.indices.first { $0 > group.max()! && list[$0].sets.contains { !$0.done } }
                ?? list.indices.first { list[$0].sets.contains { !$0.done } }
            return (after ?? index, .exercise)
        }
        let target = (1...group.count).map { group[(pos + $0) % group.count] }.first { open.contains($0) }!
        return (target, target > index ? .none : .round)
    }

    private func nextSet(_ exercise: GymExercise) -> GymSet? {
        exercise.sets.first { !$0.done }
    }

    /// The fields of the set at hand: the weight and reps the set before was
    /// done with, else the planned weight and empty reps (the plan's "5–8"
    /// shows in the field until a number is typed).
    private func prefill(_ set: GymSet?, in exercise: GymExercise) {
        guard let set else { return }
        let carry = GymSessionMath.carried(set, in: exercise, keep: kept)
        kg = LiftWeight.shown(set.kg ?? carry?.kg ?? set.plannedKg) ?? ""
        reps = set.reps ?? carry?.reps ?? ""
    }

    /// The set before changed after its tick (its weight, reps or letter):
    /// the set at hand follows it, unless something else was typed there.
    private func refill(from old: GymDay?) {
        guard let old, let exercise = day?.exercises[safe: index], let set = nextSet(exercise),
              let before = old.exercises.first(where: { $0.name == exercise.name && $0.sets.contains { $0.row == set.row } }),
              let was = before.sets.first(where: { $0.row == set.row }) else { return }
        let wasCarry = GymSessionMath.carried(was, in: before, keep: kept)
        let carry = GymSessionMath.carried(set, in: exercise, keep: kept)
        if kg.isEmpty || kg == LiftWeight.shown(was.kg ?? wasCarry?.kg ?? was.plannedKg) ?? "" {
            kg = LiftWeight.shown(set.kg ?? carry?.kg ?? set.plannedKg) ?? ""
        }
        if reps == was.reps ?? wasCarry?.reps ?? "" { reps = set.reps ?? carry?.reps ?? "" }
    }

    private func move(_ by: Int) {
        guard let count = day?.exercises.count else { return }
        index = min(max(0, index + by), count - 1)
        restEnd = nil
    }

    /// Only this rest: the default stays as set.
    private func shiftRest(_ seconds: Int) {
        guard let end = restEnd else { return }
        let next = end.addingTimeInterval(TimeInterval(seconds))
        restTotal = max(1, restTotal + seconds)
        restEnd = next.timeIntervalSinceNow <= 0 ? nil : next
    }

    // MARK: Live Activity

    /// The lock screen and Dynamic Island follow the exercise on screen (GymLiveActivity).
    private func syncActivity(quiet: Bool = false) {
        GymLiveActivity.sync(day: finishedSession || !started ? nil : day, focus: index, restStart: restStart, restEnd: restEnd, quiet: quiet)
    }

    /// +30 s, Přeskočit pauzu and Série hotová from the lock screen.
    private func activityAction(_ action: GymActivityAction) {
        switch action {
        case .extend:
            if let end = restEnd {
                if end <= Date() { restEnd = Date().addingTimeInterval(30) } else { shiftRest(30) }
            }
        case .skip:
            restEnd = nil
        case .complete(let row):
            guard let list = day?.exercises, let at = list.firstIndex(where: { $0.sets.contains { $0.row == row } }),
                  let set = list[at].sets.first(where: { $0.row == row && !$0.done }), !saving else { break }
            index = at
            restEnd = nil
            prefill(set, in: list[at])
            Task { await complete(set) }
        }
        syncActivity()
    }

    // MARK: Server

    private func load() async {
        if model.demo {
            day = DemoData.gym; history = DemoGymHistory.history; loading = false; startAtFirstOpen(); restoreMinimized()
            // The sample day has sets done: under way, as a real one opened again (below), without a recording.
            if let day, day.exercises.contains(where: { $0.sets.contains(where: \.done) }) { startTapped = true }
            // The figure of Celkem dnes from the app's own copy (a build without it keeps the flat one).
            Task { await MuscleModelStore.shared.load(api: nil) }
            return
        }
        loading = true
        defer { loading = false }
        Task { [api = model.api] in await ExerciseNotes.shared.load(api: api, demo: false) }
        do {
            day = try await model.gymDay(date: date)
            original = day
            startAtFirstOpen()
            // Finished earlier (Dokončit): the summary, to rate it or go on.
            if let day, day.finishedAt != nil, day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                reopened = true
                finishedSession = true
                if let minutes = day.loggedMinutes { totals = (minutes, nil, nil, nil, false, []) }
            }
            restoreMinimized()
            // A workout under way (sets done, sets left), left or closed by iOS
            // (an update): it goes on at once, without Začít trénink again, its
            // clock and calories from where they were, one workout in Apple Health.
            if !finishedSession, let day, day.exercises.contains(where: { $0.sets.contains { !$0.done } }), day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                startTapped = true
                await live.continueWorkout(since: day.startedAt, weightKg: model.today?.weight?.latest)
                syncActivity()
            }
            // The muscles of Celkem dnes now, not only from the exercise screen:
            // back in a rest (the bar, the edge swipe) that screen isn't shown.
            if let day { await loadMuscles(day) }
            history = await model.gymHistory()
            // The figure of Celkem dnes (MuscleProgressCard), kept on the phone after once.
            let api = model.api
            Task { await MuscleModelStore.shared.load(api: api) }
            sideChoices = (try? await model.api.gymSides())?.choices ?? [:]
            if let profile = try? await model.api.trainingProfile() {
                zoneLows = profile.hrZones.sorted { $0.zone < $1.zone }.map { $0.bpmLow ?? 0 }
            }
            // The clock, calories and heart rate (a workout recorded in Apple
            // Health) start with Začít trénink or the first ticked set; only
            // opening a workout not begun records nothing.
            // An empty workout: the exercise list for Přidat cvik.
            if day?.exercises.isEmpty ?? true, catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// By sides as last time, else by the exercise's name (GymSides).
    private func sidesFor(_ name: String) -> Bool {
        if let choice = sideChoices[name] { return choice == "sides" }
        return GymSides.oneSided(name)
    }

    /// Opens on the first exercise with a set left.
    private func startAtFirstOpen() {
        guard let list = day?.exercises else { return }
        index = list.firstIndex { $0.sets.contains { !$0.done } } ?? 0
    }

    private func loadMuscles(_ day: GymDay) async {
        guard !model.demo else { return }
        let missing = day.exercises.map(\.name).filter { muscles[$0] == nil }
        if !missing.isEmpty, let more = try? await model.api.gymMuscles(names: missing) { muscles.merge(more) { $1 } }
        guard catalog.isEmpty else { return }
        async let list = model.api.gymExercises()
        async let equipment = model.api.gymEquipment()
        catalog = (try? await list) ?? []
        dumbbells = (try? await equipment)?.dumbbellWeights ?? []
    }

    /// The plan as changed in "Upravit plán": saved, and back on the first
    /// exercise with a set left. A rest under way goes on (looking at the
    /// plan or changing it is no reason to cut it short), unless nothing is
    /// left to do after it.
    private func saveEdited(_ edited: GymDay, focus: String? = nil) async {
        day = edited
        if !edited.exercises.contains(where: { $0.sets.contains { !$0.done } }) { restEnd = nil }
        startAtFirstOpen()
        // "Přejít na cvik": that one, whatever is left before it.
        if let focus, let at = edited.exercises.firstIndex(where: { $0.id == focus }) { index = at }
        // Saved before the muscles load: a set ticked while they load is saved
        // after this sheet, never under it.
        guard !model.demo else { return await loadMuscles(edited) }
        do {
            try await model.saveGym(edited, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
        await loadMuscles(edited)
    }

    /// Under the name in "Nahradit cvik": its muscle and the sets still to do.
    private func swapSubtitle(_ name: String) -> String? {
        let left = day?.exercises.filter { $0.name == name }.flatMap(\.sets).filter { !$0.done && !$0.warmup }.count ?? 0
        let sets = left > 0 ? L10n.plural("Zbývá %lld sérií", left) : nil
        let muscle = catalog.first { $0.name == name }?.muscle?.nilIfBlank
        let line = [muscle, sets].compactMap { $0 }.joined(separator: " · ")
        return line.isEmpty ? nil : line
    }

    /// "Nahradit cvik": its sets still to do become the alternative, with
    /// its estimated load; the done ones stay recorded under the old name.
    /// A rest under way goes on.
    private func swapExercise(_ name: String, for alt: GymAlternative) async {
        guard var next = day else { return }
        let rows = Set(next.exercises.filter { $0.name == name }.flatMap(\.sets).filter { !$0.done }.map(\.row))
        let onScreen = next.exercises[safe: index]?.name == name
        next.replace(exercise: name, with: alt.name, kg: alt.kg.flatMap { $0 > 0 ? GymCoach.kgText($0) : nil })
        day = next
        // The exercise on screen stays on screen, now as the alternative.
        if onScreen, let at = next.exercises.firstIndex(where: { $0.sets.contains { rows.contains($0.row) } }) {
            index = at
            if let exercise = next.exercises[safe: at] { prefill(nextSet(exercise), in: exercise) }
        }
        syncActivity()
        guard !model.demo else { return await loadMuscles(next) }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
        await loadMuscles(next)
    }

    /// An exercise added on the way (or the first one of an empty workout),
    /// with the coach's weights and reps from the history.
    private func add(_ name: String) async {
        var next = day ?? GymDay(date: date, values: [], cancelled: nil)
        next.ensureHeader(date: date)
        if next.startedAt == nil { next.markStarted(Date()) }
        let suggestion = GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name })
        let allDone = next.exercises.allSatisfy { $0.sets.allSatisfy(\.done) }
        next.appendExercise(name, suggestion: suggestion, sides: sidesFor(name))
        day = next
        restEnd = nil
        // Straight to the new exercise when nothing else is left.
        if allDone { index = next.exercises.count - 1 }
        guard !model.demo else { return await loadMuscles(next) }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
        await loadMuscles(next)
    }

    /// "Začít trénink": the clock, calories and heart rate (a workout recorded
    /// in Apple Health) and the lock screen's Live Activity start now.
    private func start() async {
        startTapped = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if !model.demo && !live.running { await live.begin(since: nil, weightKg: model.today?.weight?.latest) }
        syncActivity()
    }

    /// The arrow: the screen closes, the clock, heart rate, rest alarm and
    /// Live Activity go on, and the bar over the tab bar opens it again.
    private func minimize() {
        guard let day else { return }
        keepMinimized(day)
        minimizing = true
        dismiss()
    }

    private func keepMinimized(_ day: GymDay) {
        model.minimizedGym = MinimizedGym(date: date, title: title(day), day: day, index: index, restStart: restStart,
                                          restEnd: restEnd, restTotal: restTotal, next: current(day)?.name, startTapped: startTapped)
    }

    /// Back from the bar: the same exercise and rest, then the lock-screen
    /// taps made meanwhile.
    private func restoreMinimized() {
        guard let gym = model.minimizedGym, gym.date == date else { return }
        model.minimizedGym = nil
        guard !finishedSession, let count = day?.exercises.count, count > 0 else { return }
        index = min(gym.index, count - 1)
        startTapped = gym.startTapped
        restTotal = gym.restTotal
        restStart = gym.restStart
        restEnd = gym.restEnd.flatMap { $0 > Date() ? $0 : nil }
        for action in gym.pending { activityAction(action) }
    }

    /// +30 s and Přeskočit pauzu from the lock screen while the workout is
    /// hidden; Série hotová waits until it opens again.
    private static func minimizedAction(_ action: GymActivityAction, model: AppModel) {
        guard var gym = model.minimizedGym else { return }
        switch action {
        case .extend:
            if let end = gym.restEnd { gym.restEnd = max(end, Date()).addingTimeInterval(30); gym.restTotal += 30 }
        case .skip:
            gym.restEnd = nil
        case .complete:
            gym.pending.append(action)
        }
        model.minimizedGym = gym
        let end = gym.restEnd
        Task { await Reminders.restEnds(at: end) }
        GymLiveActivity.sync(day: gym.day, focus: gym.index, restStart: gym.restStart, restEnd: gym.restEnd)
    }

    /// The cross: a workout changed here can be kept for later or thrown away.
    private func close() {
        if !finishedSession, let day, day != original, !day.exercises.isEmpty {
            confirmClose = true
        } else {
            // Nothing done here: the recording (if any) stops with the screen.
            live.reset()
            dismiss()
        }
    }

    /// Zahodit trénink: the workout leaves the day (its plan, the logged sets
    /// and the Intervals.icu event), the clock stops without a workout in
    /// Apple Health (one saved by Dokončit is deleted again), once "Zpět" had its 6 s.
    private func discard() async {
        restEnd = nil
        let model = model, live = live, date = date
        let workout = live.takeSaved()
        live.reset()
        model.deleteLater(L10n.tr("Trénink zahozen")) {
            if !model.demo {
                do { try await model.discardGym(date: date) } catch { model.notice = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription) }
                async let training: Void = model.refreshTraining()
                await model.refresh()
                await training
            }
            if let workout { await live.delete(workout) }
        }
        dismiss()
    }

    /// One set more for the current exercise, like its last one. A set goes
    /// away swiped left, the one the user means.
    private func addSet() async {
        guard var next = day, next.exercises.indices.contains(index) else { return }
        next.addSet(at: index)
        day = next
        guard !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// The sets are saved as they are ticked: the week shows the session done,
    /// then the rating.
    private func finish() async {
        restEnd = nil
        // The start and end in the sheet: opened again, the workout shows its
        // summary (Ohodnotit, Pokračovat v tréninku) and can go on from its start.
        if var next = day {
            if next.startedAt == nil, let start = live.start { next.markStarted(start) }
            next.markFinished(Date())
            day = next
        }
        if live.running {
            let saved = await live.finish()
            totals = (live.minutes, live.kcal, live.avgHeartRate, live.maxHeartRate, saved, live.zoneMinutes(lows: zoneLows))
            live.reset()
        }
        // The summary comes first, with Ohodnotit and Zahodit trénink.
        finishedSession = true
        if !model.demo, let day {
            saving = true
            defer { saving = false }
            do {
                try await model.saveGym(day, date: date)
                error = nil
            } catch {
                self.error = L10n.f("Trénink se nepodařilo uložit: %@", error.localizedDescription)
                return
            }
            await model.refreshTraining()
            await model.loadMuscles()
            // To Intervals.icu and Google Health as chosen in Zdroje dat (Aurin posílá);
            // Apple Health has the live workout already.
            let minutes = totals.map { max(1, $0.minutes) }
            await model.shareGym(day, date: date, start: minutes.map { Date().addingTimeInterval(-Double($0) * 60) }, minutes: minutes,
                                 appleSaved: totals?.saved == true)
        }
    }

    /// The weight or reps of a ticked set changed afterwards.
    private func editDone(_ set: GymSet, kg: String, reps: String) async {
        guard var next = day else { return }
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces)
        guard !k.isEmpty || !r.isEmpty, (set.kg ?? "") != k || (set.reps ?? "") != r else { return }
        next.edit(row: set.row, kg: k.isEmpty ? (set.kg ?? "") : k, reps: r.isEmpty ? (set.reps ?? "") : r)
        let old = day
        day = next
        refill(from: old)
        guard !model.demo else { return }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Sérii se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// Pokračovat v tréninku: the finished workout opens again where it was,
    /// the clock where Dokončit stopped it (the time between is a pause), the
    /// sets as logged. Apple Health gets one workout instead of the saved one,
    /// with the calories and heart rate measured before the pause.
    private func resume() async {
        guard var next = day else { return }
        saving = true
        defer { saving = false }
        let pausedAt = next.finishedAt ?? Date()
        next.clearFinished()
        let start = next.startedAt ?? pausedAt
        let saved = live.takeSaved()
        day = next
        totals = nil
        finishedSession = false
        startTapped = true
        startAtFirstOpen()
        await live.resume(saved: saved, since: start, pausedAt: pausedAt, weightKg: model.today?.weight?.latest)
        syncActivity()
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Trénink se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// A set swiped away (with its drop sets). The fields follow
    /// the set now at hand.
    private func deleteSet(_ set: GymSet) async {
        guard var next = day else { return }
        let gone = next.deleteSet(row: set.row)
        picked = Set(picked.compactMap { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count })
        kept = Set(kept.compactMap { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count })
        if !next.exercises.isEmpty {
            index = min(index, next.exercises.count - 1)
            if !next.exercises[index].sets.contains(where: { !$0.done }) {
                index = next.exercises.firstIndex { $0.sets.contains { !$0.done } } ?? 0
            }
        }
        await saveDay(next)
    }

    /// A letter chosen for a set; D adds a drop set after it.
    private func pickIntensity(_ row: Int, _ letter: String) async {
        guard var next = day else { return }
        if letter == "D" {
            next.addDrop(after: row)
        } else if next.exercises.flatMap(\.sets).first(where: { $0.row == row })?.drop != true {
            next.setIntensity(row: row, letter)
        }
        // Rows after an added drop set move one down.
        picked = Set(picked.map { $0 > row && letter == "D" ? $0 + 1 : $0 }).union([row])
        if letter == "D" { kept = Set(kept.map { $0 > row ? $0 + 1 : $0 }) }
        let old = day
        await saveDay(next)
        if letter != "D" { refill(from: old) }
    }

    private func removeDrop(_ row: Int) async {
        guard var next = day else { return }
        next.removeDrop(row: row)
        picked = Set(picked.compactMap { $0 == row ? nil : $0 > row ? $0 - 1 : $0 })
        kept = Set(kept.compactMap { $0 == row ? nil : $0 > row ? $0 - 1 : $0 })
        await saveDay(next)
    }

    private func saveDay(_ next: GymDay) async {
        guard next != day else { return }
        day = next
        guard !model.demo else { return }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// A ticked set back to not done (tapped by mistake).
    private func undo(_ set: GymSet) async {
        guard var next = day else { return }
        next.undo(row: set.row)
        day = next
        restEnd = nil
        guard !model.demo else { return }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Sérii se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// The letter chosen for the set before (not the plan's): the sets to come
    /// take it too, as they take its weight and reps.
    private func carriedLetter(_ set: GymSet, in exercise: GymExercise) -> String? {
        guard set.work, !picked.contains(set.row), adjusted(set, in: exercise) == nil,
              let before = exercise.sets.last(where: { $0.work && $0.done && $0.row < set.row && $0.side == set.side }),
              picked.contains(before.row) else { return nil }
        return before.intensity
    }

    /// How the set before moved this one's weight: the ✦ line and its
    /// "Nechat 12,5" (GymSessionMath.adjustment).
    private func adjusted(_ set: GymSet, in exercise: GymExercise) -> (text: String, keep: String, from: Int)? {
        guard !set.done, let before = GymSessionMath.previous(set, in: exercise), !kept.contains(before.row),
              let change = GymSessionMath.adjustment(set, after: before),
              let kg = before.kg, let done = before.reps else { return nil }
        let goal = set.plannedReps ?? before.plannedReps ?? ""
        let text: String = !change.lighter ? L10n.f("Série %@ šla lehce, %@ z %@. Další těžší.", before.number, done, goal)
            : GymIntensity.letter(before.intensity) == "F" ? L10n.f("Série %@ do selhání na %@ z %@. Další lehčeji.", before.number, done, goal)
            : L10n.f("Série %@ jen na %@ z %@. Další lehčeji.", before.number, done, goal)
        return (text, L10n.f("Nechat %@", LiftWeight.shown(kg) ?? kg), before.row)
    }

    /// "Nechat": the sets to come go on with the weight of the set before,
    /// both sides of it by sides.
    private func keep(_ row: Int, in exercise: GymExercise) {
        let number = exercise.sets.first { $0.row == row }?.number
        kept.formUnion(exercise.sets.filter { $0.done && $0.work && ($0.row == row || $0.number == number) }.map(\.row))
        prefill(exercise.sets.first { !$0.done }, in: exercise)
    }

    private func complete(_ set: GymSet) async {
        guard var next = day else { return }
        let carried = day?.exercises.first(where: { $0.sets.contains { $0.row == set.row } }).flatMap { carriedLetter(set, in: $0) }
        if carried != nil { picked.insert(set.row) }
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces)
        // Nothing typed in reps: the plan's lower number ("5" of "5–8").
        let planned: String = GymCoach.firstNumber(set.plannedReps).map { String($0) } ?? (set.plannedReps ?? "")
        // The letter in the set (the plan's, the one chosen, or the one chosen for the set before) goes with it.
        // Nothing typed in kg: the weight the field showed (carried from the set before, else the plan's).
        let shown: String? = day?.exercises.first(where: { $0.sets.contains { $0.row == set.row } }).flatMap { GymSessionMath.carried(set, in: $0, keep: kept)?.kg }
        next.complete(row: set.row, kg: k.isEmpty ? (shown ?? set.plannedKg ?? "") : k, reps: r.isEmpty ? (set.drop ? "" : planned) : r, rpe: "", intensity: carried)
        // The start in the sheet: after iOS closes the app the clock goes on from it.
        if next.startedAt == nil { next.markStarted(live.start ?? Date()) }
        day = next
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // A set ticked in the table before "Začít trénink" starts the workout too.
        if !started { Task { await start() } }
        // The last set of the exercise: on to the next one after a longer rest.
        var rest = set.warmup ? 60 : GymRestSettingsView.between(set, setting: restSets)
        let otherSide = set.side == "L" && next.exercises[safe: index]?.sets.contains { $0.number == set.number && $0.side == "P" && !$0.done } == true
        // A drop set after it: straight on with the lighter weight.
        let intoDrop = next.exercises[safe: index]?.sets.first(where: { $0.row > set.row && !$0.done })?.drop == true
        if intoDrop {
            rest = 0
        } else if otherSide {
            // Left done: the right side straight after, no rest.
            rest = 0
        } else if !set.warmup, let turn = Self.supersetTurn(next.exercises, from: index) {
            // A superset: A1, B1, A2, B2…, the rest only after each round.
            index = turn.index
            rest = turn.rest == .none ? 0 : turn.rest == .round ? GymRestSettingsView.between(set, setting: restSets) : GymRestSettingsView.before(next.exercises[safe: turn.index], setting: restExercises)
        } else if let exercise = next.exercises[safe: index], exercise.sets.allSatisfy(\.done) {
            // On to the next exercise with sets left, after the longer rest.
            if let after = next.exercises.indices.first(where: { $0 > index && next.exercises[$0].sets.contains { !$0.done } }) {
                index = after
                rest = GymRestSettingsView.before(next.exercises[safe: after], setting: restExercises)
            } else {
                // The last exercise is done: no rest, the workout is over.
                rest = 0
            }
        }
        // A rest only before a set still to do on the screen it leads to.
        if next.exercises[safe: index]?.sets.contains(where: { !$0.done }) == true, rest > 0 {
            restTotal = rest
            restStart = Date()
            restEnd = Date().addingTimeInterval(TimeInterval(rest))
        }
        // Before the save: the lock screen may be all that's awake.
        syncActivity()
        guard !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Sérii se nepodařilo uložit: %@", error.localizedDescription)
        }
    }
}

/// A set by its row, for the sheet of its letter.
struct SetRef: Identifiable { let id: Int }

struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
