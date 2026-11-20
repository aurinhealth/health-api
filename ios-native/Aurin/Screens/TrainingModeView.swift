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
    /// The day whose finished workout goes on as it opens (GymSessionView).
    static var resumeOnOpen: String?
    /// The day whose Start workout was tapped (the training card, the
    /// detail): it opens with 3, 2, 1 and starts, no second Start (concept 08).
    static var startOnOpen: String?
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
    /// The plan's letter of a set still to do whose letter was chosen here
    /// ("" for none): that set's own weight and ✦ line keep following it.
    @State private var planLetters: [Int: String] = [:]
    /// Done sets whose change to the next weight was declined ("Nechat").
    @State private var kept: Set<Int> = []
    /// Sets to come whose weight or reps were typed in ahead: they keep them.
    @State private var typed = GymSessionMath.Typed()
    /// Exercises in pounds while the app is in kilos (LiftUnits): a machine in lb.
    @State private var pounds = LiftUnits.all
    @AppStorage("restSets") private var restSets = GymRestSettingsView.byExercise
    @AppStorage("restExercises") private var restExercises = 120
    @State private var restEnd: Date?
    @State private var restTotal = 90
    @State private var restStart: Date?
    /// The rest the watch sent last: not sent back to it.
    @State private var watchRest: WatchGym.Rest?
    /// The last weight and reps from the watch (not sent back).
    @State private var watchDraft: WatchGym.Draft?
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
    /// The day's swaps, for "Vyměněno dnes" in the summary (GymSwaps).
    @State private var swaps: [GymSwap] = []
    /// The last swap, undoable at the top of the exercise until its first set
    /// is done (Petr decision 7: never beside Set done).
    @State private var lastSwap: SwapUndo?
    /// The exercise whose Moje poznámka is being written.
    @State private var noteFor: String?
    /// The barbell set whose plates are being loaded.
    @State private var loadingBar: PlateTarget?
    private var notes: ExerciseNotes { .shared }
    @State private var saving = false
    /// After Dokončit: each app's state of the sending (nil until the answer),
    /// when it started, and Zavřít free once the workout is saved or after `closeWait`.
    @State private var sendRows: [SyncReport.Row]?
    @State private var sendStarted: Date?
    @State private var closeReady = true
    /// Only the save is waited for (usually under 1 s): the sending goes on after
    /// Zavřít through the queue, and a failed one keeps its toast. At most this long.
    static let closeWait: TimeInterval = 10
    /// Dokončit trénink was tapped: the summary shows the totals.
    @State private var finishedSession = false
    @State private var totals: (minutes: Int, kcal: Double?, avgHr: Double?, maxHr: Double?, saved: Bool)?
    /// The day as it was before this screen, for Zahodit trénink.
    @State private var original: GymDay?
    /// A day from the watch came while this screen loaded: newer than the load.
    @State private var watchTook = false
    @State private var confirmClose = false
    /// Dokončit in the header with sets still left.
    @State private var confirmFinish = false
    /// Zahodit trénink in the summary, after Dokončit.
    @State private var confirmDiscard = false
    /// Opened on a workout already finished: its summary, with the rating and
    /// Pokračovat v tréninku (Zahodit has no earlier day to go back to).
    @State private var reopened = false
    /// Pokračovat v tréninku tapped while Dokončit still saves and sends.
    @State private var resumeAfterFinish = false
    @State private var picking = false
    /// The heart rate sensors, from the heart in the header.
    @State private var sensors = false
    /// "Začít trénink" tapped (the sample day has no recording to show it).
    @State private var startTapped = false
    /// Hidden with the arrow: the workout goes on, only the screen closes.
    @State private var minimizing = false
    /// An exercise other than the one under way opened in place (concept part 4).
    @State private var viewing: Int?
    /// The green "3 done" row and the "6 upcoming" row unfolded.
    @State private var showDone = false
    @State private var showUpcoming = false
    /// The set the rest running now follows, and each rest taken today (by
    /// the row of the set before it), shown between the rows.
    @State private var restAfter: Int?
    @State private var restTaken: [Int: Int] = [:]
    /// "…" → Workout settings: the rests and the sound and vibration.
    @State private var workoutSettings = false
    /// Workout settings, Keep the screen on: off lets the phone sleep as usual.
    @AppStorage("gym.keepScreenOn") private var keepScreenOn = true
    /// The one-time line under the first table: what the letter is for (D-ZIVY-3).
    @AppStorage("gym.effortHintSeen") private var effortHintSeen = false
    /// The warm-up's stretches ticked (StretchingCard): all of them done, the
    /// card makes way for the first exercise.
    @AppStorage("gym.stretching.done") private var stretchesDone = ""
    /// The day's parts, their order and switches (GymDayParts).
    @AppStorage(GymDayParts.storageKey) private var dayParts = ""
    /// The warm-up, cardio or stretching running in this screen; nil: the exercise.
    @State private var activePart: GymDayPart?
    /// Its cardio starts at once (tapped), not when it came on after the last set.
    @State private var partAutoStart = true
    /// The part or the exercises on hand came on after the one before and wait
    /// for their own Start ("Na řadě"); only Začít trénink or a tap starts one at once.
    @State private var waiting = false
    /// Start workout: the 3, 2, 1 over the screen (StartCountdown).
    @State private var countingDown = false
    /// Edit warm-up, cardio or stretching open in place of the part (concept 08), until Done.
    @State private var editingPart: LivePartDraft?
    /// Where the heart rate came from ("Apple Watch"), kept for the summary after the recording ends.
    @State private var heartFrom: String?
    @Environment(\.scenePhase) private var scenePhase
    private var live: LiveWorkout { LiveWorkout.shared }
    /// The clock, heart rate and recording run only after "Začít trénink" (or
    /// for a workout already under way); opening the workout starts nothing.
    private var started: Bool { live.running || startTapped }

    /// The header, the exercise or part on hand, the summary: out of body, whose
    /// modifier chain is already long for the type checker.
    private var screen: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if loading && day == nil {
                Spacer()
                ProgressView().frame(maxWidth: .infinity)
                Spacer()
            } else if let day, !day.exercises.isEmpty {
                let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
                if !finishedSession, let part = activePart, let routine = parts.routine(part, day: day) {
                    // A warm-up, cardio or stretching in this screen: the workout's
                    // time and heart rate above it, the day's parts under it. Its
                    // Edit lies over it, the runner going on underneath.
                    let free = LivePartDraft.isFree(routine)
                    let editing = editingPart?.part == part
                    ZStack(alignment: .top) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            if live.running, !free {
                                LiveStatsPanel(live: live, volume: GymSessionMath.volume(day.exercises), zoneLows: zoneLows).padding(.top, 12)
                            }
                            if waiting, part.kind != .cardio {
                                readyCard(.part(part), day, parts)
                            } else {
                                partRunner(part, routine, day)
                            }
                            if free {
                                Text(part.kind == .warmup ? "Rozcvič se po svém. Až budeš hotový, ťukni na Hotovo." : "Protáhni se po svém. Až budeš hotový, ťukni na Hotovo.")
                                    .font(Typo.small).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity).padding(.top, 14)
                            }
                            editPill(part, parts, day)
                            partsList(day, parts)
                            Text(verbatim: L10n.tr("Ťukni na část a přepneš na ni."))
                                .font(Typo.caption).foregroundStyle(Palette.muted)
                                .frame(maxWidth: .infinity).padding(.top, 8)
                        }
                        .padding(.bottom, 24)
                        .opacity(paused ? 0.42 : 1)
                        .disabled(paused)
                    }
                    .scrollIndicators(.hidden)
                    // Paused in a part too: Resume under it (its own buttons stay dimmed).
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if paused {
                            PrimaryButton(title: "Pokračovat v tréninku", systemImage: "play.fill") { live.resumeFromPause(); syncActivity() }
                                .padding(.top, 8).padding(.bottom, 6)
                        } else if free, !waiting {
                            // Free time: stopped by hand, and the workout goes on.
                            PrimaryButton(title: L10n.tr("Hotovo")) {
                                tick(part, id: LivePartDraft.freeId)
                                go(step(after: part, day), auto: false)
                            }
                            .padding(.top, 8).padding(.bottom, 6)
                        }
                    }
                    .opacity(editing ? 0 : 1)
                    .allowsHitTesting(!editing)
                    .accessibilityHidden(editing)
                    if editing, let draft = editingPart { partEditor(draft, day) }
                    }
                } else if !finishedSession, let exercise = current(day) {
                    // The workout's time, heart rate, calories and volume stay over the list.
                    if live.running {
                        LiveStatsPanel(live: live, volume: GymSessionMath.volume(day.exercises), zoneLows: zoneLows).padding(.top, 12)
                    }
                    ScrollViewReader { reader in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 0) {
                                if !started, showsParts(day, parts) {
                                    // Before Začít trénink: the whole workout in order, one start for all of it.
                                    partsList(day, parts)
                                } else if waiting {
                                    readyCard(.exercise(index), day, parts)
                                    partsList(day, parts)
                                } else {
                                    workout(day, exercise, parts)
                                }
                            }
                            .padding(.bottom, 24)
                            // Paused: the workout waits under Resume workout (concept 08).
                            .opacity(paused ? 0.42 : 1)
                            .disabled(paused)
                            .animation(.easeInOut(duration: 0.2), value: paused)
                        }
                        .scrollIndicators(.hidden)
                        // The exercise under way goes under the panel when it changes.
                        .onChange(of: index) { _, _ in
                            withAnimation(.snappy) { reader.scrollTo(Self.runningID, anchor: .top) }
                        }
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) { pinned(day, exercise, parts) }
                } else if finishedSession {
                    // The summary (concept 08): Close stays at the bottom.
                    ScrollView { doneSummary(day).padding(.bottom, 24) }
                    .scrollIndicators(.hidden)
                    .safeAreaInset(edge: .bottom, spacing: 0) { closeButton.padding(.top, 8).padding(.bottom, 6) }
                } else {
                    ScrollView { finished(day).padding(.bottom, 24) }
                    .scrollIndicators(.hidden)
                }
            } else if day == nil, let error {
                loadFailed(error)
            } else {
                empty
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .overlay {
            if countingDown, let day { countdown(day) }
        }
        // Another part came on (the watch, a tap in the list): its Edit isn't open.
        .onChange(of: activePart) { _, _ in editingPart = nil }
    }

    private func countdown(_ day: GymDay) -> StartCountdown {
        let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
        let part: GymDayPart? = showsParts(day, parts) ? parts.before(day).first { !partDone($0, day) } : nil
        let title: String = part.map { L10n.tr($0.kind.title) } ?? L10n.tr("Posilovna")
        let first: String? = part.map { parts.routine($0, day: day)?.items.first?.name } ?? current(day)?.name
        return StartCountdown(title: title, first: first, live: live,
                              onStart: { guard countingDown else { return }; countingDown = false; beginFromCountdown(day) },
                              onCancel: { guard countingDown else { return }; countingDown = false; dismiss() })
    }

    /// The countdown ran out or was tapped: as Začít trénink.
    private func beginFromCountdown(_ day: GymDay) {
        if showsParts(day, GymDayParts.resolved(day, stored: dayParts, date: date)) { startWhole(day) } else { Task { await start() } }
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.gym)
            // The Live Activity follows the heart rate from here: read in this
            // screen's body, every beat redrew the whole workout.
            HeartRateWatch(live: live) { syncActivity(quiet: true) }
            // The Apple Watch's gym, 1:1 (its own view: the chain below is long enough).
            WatchGymHooks(live: live, restEnd: restEnd, sendRest: sendRest, received: receiveRest, ended: finishIfEndedOnWatch,
                          back: { Task { await catchUpWithWatch() } })
            WatchDraftHooks(kg: kg, reps: reps, row: atHand?.row, send: sendDraft, received: receiveDraft)
            screen
        }
        .navBarVisibility(.hidden)
        .task { await load(); finishIfEndedOnWatch() }
        // A set or a change from the Apple Watch (WatchGymBridge.swift).
        .onReceive(NotificationCenter.default.publisher(for: .watchGym)) { note in
            guard let change = note.object as? WatchBridge.GymChange, change.date == date else { return }
            takeFromWatch(change.day)
        }
        // Discarded on the Apple Watch: the day has no workout any more.
        .onReceive(NotificationCenter.default.publisher(for: .watchGymDiscarded)) { note in
            guard note.object as? String == date else { return }
            restEnd = nil
            dismiss()
        }
        .onAppear {
            if keepScreenOn { ScreenAwake.hold("training") }
            model.immersive = true
            GymActivityInbox.handler = { activityAction($0) }
            // The paired sensor connects already when the workout opens, so the
            // heart shows it before Začít trénink.
            if !model.demo { HeartRateSensor.shared.connectSaved() }
        }
        .onDisappear {
            ScreenAwake.release("training"); model.immersive = false
            // Left another way than the arrow (the edge swipe, a link) while the
            // workout runs: it goes on hidden, as with the arrow.
            if !minimizing, live.running, !finishedSession, let day, current(day) != nil || activePart != nil {
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
        .onChange(of: restEnd) { old, end in
            Task { await Reminders.restEnds(at: end) }
            syncActivity()
            // Over (ran out, skipped or a set began): its length stays between the rows.
            if let old, end == nil { keepRest(until: old) }
        }
        // The rest's ticks and end, whatever is open on the screen.
        .task(id: restEnd) { if let end = restEnd { await runRest(end) } }
        // A set ticked or a change: "Still working out?" waits another 10 min (IdleWorkout).
        .onChange(of: day) { _, _ in syncActivity(); live.worked() }
        .onChange(of: index) { _, _ in syncActivity(); live.worked() }
        .onChange(of: finishedSession) { _, _ in syncActivity() }
        // Each part's and exercise's own time (LiveWorkout.segments).
        // Keyed with the recording too: it starts a moment after Začít trénink.
        .onChange(of: "\(live.running)|\(focusKey ?? "")", initial: true) { _, _ in if let key = focusKey { live.focus(key) } }
        // Back from the lock screen after the rest ran out: straight to the set.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, let end = restEnd, end <= Date() { restEnd = nil }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { techniqueSheet($0) }
        .sheet(item: Binding(get: { historyFor.map { Named(name: $0) } }, set: { historyFor = $0?.name })) { item in
            ExerciseHistorySheet(name: item.name, exercise: history.exercise(item.name), inWorkout: true)
        }
        // Zavřít waits for the sending, at most closeWait.
        .task(id: sendStarted) { await freeCloseLater() }
        .confirmationDialog("Ukončit trénink?", isPresented: $confirmClose, titleVisibility: .visible) {
            // Later: the clock and heart rate stop now and start again on return.
            Button("Pokračovat později") { live.reset(); dismiss() }
            Button("Zahodit trénink", role: .destructive) { Task { await discard() } }
        }
        .confirmationDialog("Dokončit trénink?", isPresented: $confirmFinish, titleVisibility: .visible) {
            Button("Dokončit trénink") { Task { await finish() } }
            Button("Pokračovat v tréninku", role: .cancel) {}
        } message: {
            Text("Ještě nemáš hotové všechny série.")
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
        .sheet(isPresented: $workoutSettings) { workoutSettingsSheet }
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
                              title: "Vybrat jiný cvik", eyebrow: L10n.f("Místo cviku %@", ExerciseCatalog.shownName(item.name)), hideUsed: true) { name in
                let kg = GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name }).work.first?.kg
                Task {
                    // Never done here: the server's estimate (a similar exercise or the catalogue's start).
                    let estimate = kg == nil && !model.demo ? await model.api.gymEstimate(exercise: name) : nil
                    let alt = GymAlternative(name: name, muscle: nil, sets: nil, reps: nil, note: nil, station: nil, kg: kg ?? estimate)
                    await swapExercise(item.name, for: alt)
                }
            }
        }
        .sheet(item: Binding(get: { noteFor.map { Named(name: $0) } }, set: { noteFor = $0?.name })) { item in
            ExerciseNoteSheet(exercise: item.name)
        }
        .onChange(of: catalog) { _, list in
            // The bars of the lifts with plates, for the watch's rest too.
            for e in list { if let bar = PlateBar.usual(e.stations ?? []) { PlateBar.known[e.name] = bar } }
            if let day, !model.demo { WatchBridge.shared.gymSaved(day, date: date) }
        }
        .sheet(item: $loadingBar) { target in
            PlateLoaderSheet(title: target.title, exercise: target.exercise, startKg: target.kg, usual: target.usual) { total in loaded(total, on: target) }
        }
        .sheet(isPresented: $editing) {
            if let day {
                PlanEditorSheet(day: day, catalog: catalog, date: date, current: index,
                                go: { edited, id in Task { await saveEdited(edited, focus: id) } },
                                // After the sheet is gone: the workout mode closes with it.
                                discard: { Task { try? await Task.sleep(for: .milliseconds(450)); await discard() } }) { edited in Task { await saveEdited(edited) } }
            }
        }
    }

    /// The concept's header: a grab handle (drag down hides the workout, it goes
    /// on in the bar), the exercise or part in serif with its own time under it,
    /// Finish, and the capsule [Coach, …] top right (coach first, Petr's "B").
    /// The dashes under it are the exercises: done green, under way amber.
    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if canHide {
                Capsule().fill(Palette.faint.opacity(0.45)).frame(width: 36, height: 5)
                    .frame(maxWidth: .infinity, minHeight: 20)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 10).onEnded { drag in
                        if drag.translation.height > 40 { minimize() }
                    })
                    .accessibilityElement()
                    .accessibilityLabel(L10n.tr("Skrýt trénink"))
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { minimize() }
            }
            HStack(alignment: .top, spacing: 8) {
                if !canHide {
                    CircleButton(systemImage: "xmark", label: L10n.tr("Ukončit režim tréninku")) { close() }
                        .disabled(closeLocked).opacity(closeLocked ? 0.35 : 1)
                }
                // The summary has its own title: nothing above it.
                if let day, !day.exercises.isEmpty, !finishedSession {
                    if let draft = editingPart, draft.part == activePart {
                        editHead(draft)
                    } else {
                        headTitleBlock(day)
                    }
                    Spacer(minLength: 4)
                    if let draft = editingPart, draft.part == activePart {
                        // Edit: Done keeps the change for today.
                        Button { applyEdit() } label: {
                            Text("Hotovo").font(.subheadline.weight(.semibold)).foregroundStyle(draft.canSave ? Palette.green : Palette.muted)
                                .padding(.horizontal, 14).frame(height: 40)
                                .chromeGlass(in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .tapTarget(width: 60, height: 40)
                        .disabled(!draft.canSave)
                    } else if started, current(day) != nil || activePart != nil {
                        // Sets still left here: asked first, a tap by mistake ends nothing.
                        Button { if current(day) != nil { confirmFinish = true } else { Task { await finish() } } } label: {
                            Text("Dokončit").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                                .padding(.horizontal, 12).frame(height: 40)
                                .chromeGlass(in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .tapTarget(width: 60, height: 40)
                        .disabled(saving)
                    }
                    if let exercise = current(day) {
                        CoachEntry(subject: .workout(day, exercise: exercise, resting: restEnd != nil, restSeconds: restTotal, date: date),
                                   menu: AnyView(menuItems(day, exercise)), hint: false)
                    }
                } else if finishedSession, let day, !day.exercises.isEmpty {
                    // The summary: its label in the middle, the coach about this workout top right.
                    Spacer(minLength: 4)
                    SectionLabel(text: "Trénink dokončen").frame(minHeight: 40)
                    Spacer(minLength: 4)
                    CoachEntry(subject: doneSubject(day), hint: false)
                } else {
                    Spacer()
                }
            }
            if let day, !finishedSession, started, day.exercises.count > 1 {
                ExerciseSegments(exercises: day.exercises, current: activePart == nil ? index : nil)
            }
        }
    }

    /// The exercise or part in serif, its own time under it.
    private func headTitleBlock(_ day: GymDay) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(headTitle(day)).font(Typo.heading(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                .lineLimit(2).minimumScaleFactor(0.6)
            HStack(spacing: 8) {
                if live.running, let key = headKey(day) { HeadClock(live: live, key: key) }
                if activePart == nil, let letter = ExerciseOrder.letter(current(day)?.superset) {
                    Text(verbatim: L10n.f("Supersérie %@", letter)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.indigo)
                }
            }
        }
    }

    /// Edit warm-up / cardio / stretching, for today only.
    private func editHead(_ draft: LivePartDraft) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: L10n.tr(Self.editTitle(draft.part))).font(Typo.heading(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                .lineLimit(2).minimumScaleFactor(0.6)
            Text("Jen dnes").font(Typo.small).foregroundStyle(Palette.secondary)
        }
    }

    /// The workout runs: the grab handle hides it, no close button.
    private var canHide: Bool {
        guard started, !finishedSession, let day else { return false }
        return current(day) != nil || activePart != nil
    }

    /// The exercise under way, or the warm-up, cardio or stretching on screen.
    private func headTitle(_ day: GymDay) -> String {
        if let part = activePart { return L10n.tr(part.kind.title) }
        return current(day)?.name ?? title(day)
    }

    /// Whose time runs under the title.
    private func headKey(_ day: GymDay) -> String? {
        activePart?.rawValue ?? current(day)?.name
    }

    /// "…": the whole workout's actions in a small menu under the button. The
    /// exercise's history is a tab on its card, the sound in Workout settings.
    /// "…" → Workout settings: rests, sound and vibration, the gym's equipment, the screen.
    private var workoutSettingsSheet: some View {
        NavigationStack {
            SettingsPage(title: "Nastavení tréninku") {
                GymRestGroup()
                GymSignalsGroup()
                SettingsGroup(title: "Posilovna") {
                    NavigationLink { EquipmentView() } label: { SettingsRow(title: "Vybavení posilovny") }
                        .buttonStyle(.plain)
                }
                SettingsGroup(title: "Obrazovka") {
                    SettingsToggle(title: "Nechat obrazovku zapnutou", isOn: $keepScreenOn)
                        // Here, not on the screen's long chain (its type-check time).
                        .onChange(of: keepScreenOn) { _, on in if on { ScreenAwake.hold("training") } else { ScreenAwake.release("training") } }
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { workoutSettings = false } }
            }
        }
        .presentationDetents([.large])
    
    }

    private var paused: Bool { live.pausedAt != nil }

    @ViewBuilder
    private func menuItems(_ day: GymDay, _ exercise: GymExercise) -> some View {
        if live.canPause, !paused {
            Button { live.pause(); syncActivity() } label: { Label("Pozastavit trénink", systemImage: "pause.fill") }
        }
        if nextSet(exercise) != nil {
            Button { swapping = exercise.name } label: { Label("Vyměnit tento cvik", systemImage: "arrow.up.arrow.down") }
        }
        Button { editing = true } label: { Label("Upravit cviky", systemImage: "list.bullet") }
        Button { sensors = true } label: {
            Label {
                Text("Zdroj tepu")
                if let source = live.heartSource { Text(verbatim: source) }
            } icon: {
                Image(systemName: "heart")
            }
        }
        Button { workoutSettings = true } label: { Label("Nastavení tréninku", systemImage: "gearshape") }
        Divider()
        Button(role: .destructive) { confirmDiscard = true } label: { Label("Zahodit trénink", systemImage: "trash") }
    }

    private func title(_ day: GymDay) -> String {
        day.planName?.nilIfBlank ?? L10n.tr("Posilovna")
    }

    /// "Cvik 2 z 5, 6/16 sérií".
    private func progressLine(_ day: GymDay) -> String {
        let done: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let total: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        let position = L10n.f("Cvik %@ z %@", String(min(index, day.exercises.count - 1) + 1), String(day.exercises.count))
        return position + ", " + L10n.plural("%lld/%lld sérií", done, total)
    }

    // MARK: The exercise

    /// Where the exercise under way is in the list, to scroll it under the panel.
    static let runningID = "running"

    /// The whole workout on one screen (concept part 4): what is done folded
    /// into one green row on top, the exercise under way open, its superset
    /// partner clasped under it, the rest in one row "6 upcoming". A tap opens
    /// any exercise in place; the one under way then folds with "Now".
    @ViewBuilder
    private func workout(_ day: GymDay, _ exercise: GymExercise, _ parts: GymDayParts) -> some View {
        let rows = partRows(day, parts)
        let partner = Self.supersetPartner(day.exercises, of: index)
        let doneRows = rows.filter { $0.done && exerciseAt($0) != index }
        let upcoming = rows.filter { !$0.done && exerciseAt($0) != index && (partner == nil || exerciseAt($0) != partner) }
        VStack(alignment: .leading, spacing: 8) {
            undoSwapRow(day, exercise)
            if !doneRows.isEmpty {
                let seconds = doneRows.reduce(0) { $0 + live.seconds(of: $1.key) }
                LiveListRow(title: L10n.f("%@ hotovo", String(doneRows.count)), detail: Self.clock(seconds), done: true, open: showDone) {
                    withAnimation(.snappy) { showDone.toggle() }
                }
                if showDone {
                    ForEach(doneRows) { row in listItem(row, day) }
                }
            }
            // The rest before this exercise, after the last set of the one before.
            if let end = restEnd, !exercise.sets.contains(where: { $0.row == restAfter }) {
                LiveRestGap(end: end, total: restTotal)
            }
            if let partner, let letter = ExerciseOrder.letter(exercise.superset) {
                LiveSupersetClasp(letter: letter) {
                    runningBlock(day, exercise)
                } second: {
                    exerciseItem(partner, day)
                }
            } else {
                runningBlock(day, exercise)
            }
            if let note = GymSides.note(exercise), viewing == nil { CoachNote(text: note) }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if !upcoming.isEmpty {
                LiveListRow(title: L10n.f("%@ zbývá", String(upcoming.count)),
                            detail: L10n.f("Potom %@", upcoming[0].name), open: showUpcoming) {
                    withAnimation(.snappy) { showUpcoming.toggle() }
                }
                if showUpcoming {
                    ForEach(upcoming) { row in listItem(row, day) }
                }
            }
            addExerciseButton.padding(.top, 4)
        }
        .padding(.top, 12)
        .onChange(of: day.exercises.count) { _, count in if let v = viewing, v >= count { viewing = nil } }
        .task(id: exercise.name) { await loadMuscles(day) }
    }

    /// The exercise of a list row; nil for a warm-up, cardio or stretching.
    private func exerciseAt(_ row: PartRow) -> Int? {
        if case .exercise(let at) = row.step { return at }
        return nil
    }

    /// A row of the done or upcoming list: an exercise, or a part.
    @ViewBuilder
    private func listItem(_ row: PartRow, _ day: GymDay) -> some View {
        if let at = exerciseAt(row) {
            exerciseItem(at, day)
        } else if row.done {
            LiveDoneRow(title: row.name, detail: row.detail, value: Self.clock(live.seconds(of: row.key))) { go(row.step, auto: true) }
        } else {
            LiveFoldedCard(title: row.name, detail: row.detail, onTechnique: nil) { go(row.step, auto: true) }
        }
    }

    /// An exercise other than the one under way: open in place, done (green
    /// row) or to come (folded card).
    @ViewBuilder
    private func exerciseItem(_ at: Int, _ day: GymDay) -> some View {
        if let e = day.exercises[safe: at] {
            if viewing == at {
                card(e, offset: at, running: false)
            } else if e.sets.allSatisfy(\.done) {
                let volume = GymSessionMath.volume([e])
                LiveDoneRow(title: e.name, detail: L10n.plural("%lld sérií", e.workCount) + " " + L10n.f("za %@", Self.clock(live.seconds(of: e.name))),
                            value: Fmt.int(Units.weight(volume)), unit: Units.imperial ? "lb" : "kg") { open(at) }
            } else {
                LiveFoldedCard(title: e.name, detail: nextLoad(e),
                               onSwap: { swapping = e.name }, onTechnique: { technique = e.name }) { open(at) }
            }
        }
    }

    private func open(_ at: Int) {
        withAnimation(.snappy) { viewing = at == index ? nil : at }
    }

    /// The exercise under way: open, or folded with "Now" while another is open.
    @ViewBuilder
    private func runningBlock(_ day: GymDay, _ exercise: GymExercise) -> some View {
        Group {
            if viewing != nil {
                LiveFoldedCard(title: exercise.name, detail: nextLoad(exercise), now: true,
                               onTechnique: { technique = exercise.name }) { open(index) }
            } else {
                card(exercise, offset: index, running: true)
            }
        }
        .id(Self.runningID)
    }

    /// An exercise's sets on the two layers. The one under way has no title
    /// (the header carries it) unless the lists around it are open.
    private func card(_ exercise: GymExercise, offset: Int, running: Bool) -> some View {
        let named = !running || showDone || showUpcoming
        return VStack(alignment: .leading, spacing: 8) {
            LiveSetCard(title: named ? exercise.name : nil,
                        onFold: running ? nil : { withAnimation(.snappy) { viewing = nil } },
                        onHistory: { historyFor = exercise.name },
                        onTechnique: { technique = exercise.name },
                        sidesTitle: sidesOpen(exercise) ? L10n.tr(exercise.sidesAhead ? "Obě strany" : "Každá strana") : nil,
                        onSides: { Task { await setSides(exercise, !exercise.sidesAhead) } },
                        onAddSet: { Task { await addSet(at: offset) } },
                        disabled: saving) {
                setTable(exercise, offset: offset, current: running ? nextSet(exercise) : nil)
            }
            if running, !effortHintSeen, exercise.sets.contains(where: { !$0.done }) {
                Text("Klepnutím na ovál ve sloupci Úsilí zapíšeš, jak těžká série byla.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 8)
            }
        }
    }

    /// Swapped just now: the old name with Undo at the top, far from Set done (decision 7).
    @ViewBuilder
    private func undoSwapRow(_ day: GymDay, _ exercise: GymExercise) -> some View {
        if let undo = lastSwap, undo.to == exercise.name, Self.canUndo(undo, in: day) {
            HStack(spacing: 8) {
                Text(verbatim: L10n.f("Místo cviku %@", ExerciseCatalog.shownName(undo.from)))
                    .font(Typo.small).foregroundStyle(Palette.muted).lineLimit(2)
                Spacer(minLength: 8)
                Button { Task { await undoSwap() } } label: {
                    Text(verbatim: L10n.tr("Vrátit")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 14).frame(minHeight: 36)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .tapTarget(width: 44, height: 44)
                .accessibilityLabel(L10n.f("Vrátit výměnu, zpět na %@", ExerciseCatalog.shownName(undo.from)))
            }
        }
    }

    /// The pinned button: Start before the start, Set done, the rest's
    /// countdown with −15 s and +15 s, or back to the exercise under way.
    @ViewBuilder
    private func pinned(_ day: GymDay, _ exercise: GymExercise, _ parts: GymDayParts) -> some View {
        Group {
            if !started {
                Button {
                    if showsParts(day, parts) { startWhole(day) } else { Task { await start() } }
                } label: {
                    Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                        .frame(maxWidth: .infinity).frame(height: 54).background(Palette.green, in: Capsule())
                }
                .buttonStyle(.plain)
            } else if paused {
                PrimaryButton(title: "Pokračovat v tréninku", systemImage: "play.fill") { live.resumeFromPause(); syncActivity() }
            } else if waiting {
                EmptyView()
            } else if let end = restEnd {
                LiveRestButton(title: startTitle(exercise), end: end, total: restTotal, shift: { shiftRest($0) }) {
                    viewing = nil
                    restEnd = nil
                }
            } else if viewing != nil {
                PrimaryButton(title: L10n.f("Zpět na %@", exercise.name)) { withAnimation(.snappy) { viewing = nil } }
            } else if let set = nextSet(exercise) {
                PrimaryButton(title: saving ? "Ukládám…" : "Série hotová", systemImage: "checkmark", busy: saving) {
                    Task { await complete(set) }
                }
                .disabled(saving)
            }
        }
        .padding(.top, 8).padding(.bottom, 6)
    }

    /// "Start set 3", "Start warm-up set" on the rest's button.
    private func startTitle(_ exercise: GymExercise) -> String {
        guard let set = nextSet(exercise) else { return L10n.tr("Začít") }
        if set.warmup { return L10n.tr("Začít rozcvičkovou sérii") }
        return L10n.f("Začít sérii %@", set.number)
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

    /// The sets with the rest between the rows: taken in ink, planned in grey,
    /// the one running now filling in green. The coach's change for the set at
    /// hand ("Set 2 felt moderate. Try 102.5 kg.") under its row.
    private func setTable(_ exercise: GymExercise, offset: Int, current set: GymSet?) -> some View {
        let last = history.last(exercise.name, before: date)
        return VStack(spacing: 0) {
            GymSetTableHeader(exercise: exercise.name, pounds: lb(exercise.name), effort: true) { on in setPounds(exercise, on) }
            ForEach(exercise.sets) { s in
                // Swiped left: just this set goes away (a done one, a warm-up too).
                setRow(s, exercise, current: set, last: last, offset: offset)
                    .modifier(SwipeToDelete(enabled: !saving) { Task { await deleteSet(s) } })
                if s.row == set?.row, let change = adjusted(s, in: exercise) {
                    AdjustmentNote(text: change.text, keep: change.keep) { keep(change.from, in: exercise) }
                        .padding(.horizontal, 8).padding(.vertical, 2)
                }
                gap(after: s, in: exercise, offset: offset)
            }
        }
        .padding(.horizontal, 4)
    }

    /// The line under a set: the rest after it.
    @ViewBuilder
    private func gap(after s: GymSet, in exercise: GymExercise, offset: Int) -> some View {
        let next = exercise.sets.first { $0.row > s.row }
        if let end = restEnd, restAfter == s.row, next?.done == false {
            LiveRestGap(end: end, total: restTotal)
        } else if s.done, next?.done != false, let taken = restTaken[s.row] {
            LiveRestGap(seconds: taken, taken: true)
        } else {
            LiveRestGap(seconds: plannedRest(after: s, next: next, offset: offset))
        }
    }

    /// The rest the app gives after a set (as Set done starts it): none into a
    /// drop set or the other side, a minute after a warm-up, the longer one
    /// before the next exercise after the last set.
    private func plannedRest(after s: GymSet, next: GymSet?, offset: Int) -> Int? {
        guard let next else {
            guard let day, let after = Self.nextUndone(day.exercises, after: offset), after > offset else { return nil }
            return GymRestSettingsView.before(day.exercises[safe: after], setting: restExercises)
        }
        if next.drop || (s.side == "L" && next.side == "P") { return 0 }
        return s.warmup ? 60 : GymRestSettingsView.between(s, setting: restSets)
    }

    private func lb(_ name: String) -> Bool { pounds.contains(name) }

    /// An exercise switched to pounds or back: the weight typed for the set at
    /// hand stays the same weight, and the watch gets it with the plan.
    private func setPounds(_ exercise: GymExercise, _ on: Bool) {
        let was = lb(exercise.name)
        guard was != on else { return }
        if exercise.name == day.flatMap(current)?.name {
            let k = LiftWeight.kgText(kg, machineLb: was)
            kg = LiftWeight.shown(k.nilIfBlank, machineLb: on) ?? ""
        }
        LiftUnits.set(exercise.name, pounds: on)
        pounds = LiftUnits.all
        if let day, !model.demo { WatchBridge.shared.gymSaved(day, date: date) }
    }

    private func setRow(_ s: GymSet, _ exercise: GymExercise, current: GymSet?, last: GymHistory.Session?, offset: Int) -> GymSetRow {
        let phase: GymSetRow.Phase = s.done ? .done : (s.row == current?.row ? .current : .next)
        // The sets to come show what the set before was done with.
        let carry = s.done ? nil : carried(s, in: exercise)
        let shownKg: String = LiftWeight.shown(s.done ? s.kg : carry?.kg ?? s.plannedKg, machineLb: lb(exercise.name)) ?? ""
        let shownReps: String = Fmt.range((s.done ? s.reps : carry?.reps ?? s.plannedReps) ?? "")
        // By sides the number shows on the L row only.
        // A warm-up set done without a letter shows W, as its sheet names the kind of set.
        let letter = s.done ? s.intensity ?? GymIntensity.from(rpe: s.rpe) ?? (s.warmup ? "W" : nil) : carriedLetter(s, in: exercise) ?? s.intensity
        var plateTap: (() -> Void)? = nil
        if let target = plateTarget(s, in: exercise, shown: kg.isEmpty ? shownKg : kg) {
            plateTap = { loadingBar = target }
        }
        // A done set fixed afterwards, a set to come typed in ahead.
        var edit: ((String, String) -> Void)? = nil
        if s.done {
            edit = { k, r in Task { await editDone(s, kg: k, reps: r) } }
        } else if phase == .next {
            edit = { k, r in Task { await typeAhead(s, kg: k, reps: r, shown: (kg: shownKg, reps: shownReps)) } }
        }
        return GymSetRow(label: s.warmup ? (s.side == "P" ? "" : "W") : s.drop ? "↳" : s.side == "P" ? "" : s.number, side: s.side,
                         lastTime: GymSessionMath.lastTime(s, in: exercise, last: last),
                         kg: shownKg, reps: shownReps, state: phase,
                         kgText: $kg, repsText: $reps, kgHint: shownKg, repsHint: s.plannedReps.map(Fmt.range),
                         drop: s.drop, intensity: letter, planned: !s.done && !picked.contains(s.row),
                         onIntensity: { intensityFor = SetRef(id: s.row); effortHintSeen = true },
                         onEdit: edit,
                         onKgTap: plateTap,
                         large: true) {
            switch phase {
            case .done: Task { await undo(s) }
            case .current: Task { await complete(s) }
            case .next:
                // The first set of an exercise opened in place: ticked, it
                // becomes the exercise under way (concept part 4).
                guard offset != index, s.row == exercise.sets.first(where: { !$0.done })?.row else { break }
                index = offset
                viewing = nil
                prefill(s, in: exercise)
                Task { await complete(s) }
            }
        }
    }

    /// The bar (or plate-loaded machine) an exercise is done with: its weight is
    /// loaded as plates. Nil for dumbbells, cables and stack machines.
    private func usualBar(_ exercise: GymExercise) -> PlateBar? {
        // The plates are in kilos: a machine in pounds is typed in.
        guard !lb(exercise.name) else { return nil }
        return PlateBar.usual(catalog.first { $0.name == exercise.name }?.stations ?? [])
    }

    /// A set's weight loaded as plates (a weight as shown); nil when no plates go on it.
    private func plateTarget(_ set: GymSet, in exercise: GymExercise, shown: String) -> PlateTarget? {
        guard let usual = usualBar(exercise) else { return nil }
        return PlateTarget(id: set.row, exercise: exercise.name, title: set.warmup ? exercise.name : L10n.f("%@, série %@", exercise.name, set.number),
                           kg: LiftWeight.number(LiftWeight.kgText(shown)), usual: usual)
    }

    /// The bar loaded: the set at hand takes the weight, and so do the work
    /// sets still to do (a warm-up keeps it to itself). In the rest the set
    /// waits: its weight is typed in ahead, as under Teď.
    private func loaded(_ total: Double, on target: PlateTarget) {
        let text = GymCoach.kgText(total)
        let shown = LiftWeight.shown(text) ?? text
        guard let exercise = day?.exercises.first(where: { $0.name == target.exercise }),
              let set = exercise.sets.first(where: { $0.row == target.id }) else { return }
        if restEnd != nil, !set.done {
            Task { await typeAhead(set, kg: shown, reps: "", shown: (kg: restKg(set, in: exercise), reps: "")) }
            return
        }
        kg = shown
        guard set.work else { return }
        Task { await setWeight(text, of: exercise) }
    }

    /// "Kotouče: 20 + 10 na stranu" for a lift done with plates, at a weight as shown.
    private func platesText(_ exercise: GymExercise, _ weight: String) -> String? {
        guard let usual = usualBar(exercise), let shown = LiftWeight.number(weight) else { return nil }
        let bar = PlateBar.saved(exercise.name) ?? usual
        guard shown > bar.weight, let plates = PlateLoad.perSide(shown, bar: bar.weight, sizes: PlateLoad.sizes) else { return nil }
        return L10n.f("Kotouče: %@ na stranu", plates)
    }

    /// "15 kg × 5–8, 3 série": the first set still to do and the sets left.
    private func nextLoad(_ next: GymExercise) -> String {
        let left: Int = next.workCount - next.doneCount
        let count: String = L10n.plural("%lld sérií", left)
        guard let set = next.sets.first(where: { !$0.done && $0.work }) else { return count }
        return GymLiveActivity.load(set, in: next) + ", " + count
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

    /// The rest ends now (a set began during it).
    private func endRest() {
        if let end = restEnd { keepRest(until: end) }
        restEnd = nil
    }

    /// A rest that ended: how long it was (never past its end, though it was
    /// cleared later, e.g. back from the lock screen) under the set before it.
    private func keepRest(until end: Date) {
        guard let row = restAfter, let start = restStart else { return }
        restTaken[row] = max(1, Int(min(Date(), end).timeIntervalSince(start).rounded()))
        restAfter = nil
    }

    /// Rows moved (a set deleted, a drop set added or removed): the rests follow their sets.
    private func moveRests(_ to: (Int) -> Int?) {
        restTaken = Dictionary(restTaken.compactMap { row, seconds in to(row).map { ($0, seconds) } }, uniquingKeysWith: { a, _ in a })
        restAfter = restAfter.flatMap(to)
    }

    /// The rest's ticks and its end, whatever is on screen (the countdown
    /// shows between the set rows and in the pinned button).
    private func runRest(_ end: Date) async {
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
        // The rest is over: the button turns back to Set done.
        restEnd = nil
    }

    /// Every move of a part ticked (by hand or by its timer).
    private func routineDone(_ routine: GymStretching, kind: GymRoutineKind) -> Bool {
        let done = StretchingCard.done(stretchesDone, date: date)
        return !routine.items.isEmpty && routine.items.allSatisfy { done.contains(kind.key + $0.id) }
    }

    // MARK: The day's parts (one workout: warm-up, cardio, the exercises, stretching)

    /// Where the workout is: a part of the day, or an exercise by its index.
    enum Step: Equatable {
        case part(GymDayPart)
        case exercise(Int)
    }

    /// What is in front, for each part's and exercise's own time (only while the workout runs).
    private var focusKey: String? {
        guard started, !finishedSession, let day else { return nil }
        // Waiting for its Start: the time goes to no part meanwhile.
        if waiting { return Self.waitKey }
        if let part = activePart { return part.rawValue }
        // The rest before an exercise not begun yet (after the last set of the one
        // before): its own time starts when the rest ends, not with the rest.
        if restEnd != nil, let exercise = current(day), !exercise.sets.contains(where: \.done) { return Self.waitKey }
        return current(day)?.name
    }

    /// The time between a part's end and the next one's Start (LiveWorkout.segments): no row shows it.
    static let waitKey = "_waiting"

    /// A part whose every move (or its cardio) is ticked today.
    private func partDone(_ part: GymDayPart, _ day: GymDay) -> Bool {
        guard let routine = GymDayParts.resolved(day, stored: dayParts, date: date).routine(part, day: day) else { return true }
        return routineDone(routine, kind: part.kind)
    }

    /// The next exercise with sets left after `index`, else one left out before
    /// it (its machine was taken, so another came first).
    static func nextUndone(_ list: [GymExercise], after index: Int) -> Int? {
        list.indices.first { $0 > index && list[$0].sets.contains { !$0.done } }
            ?? list.indices.first { $0 < index && list[$0].sets.contains { !$0.done } }
    }

    /// The first part after the exercises not done yet (after `part` when given).
    private func nextAfterPart(_ day: GymDay, after part: GymDayPart? = nil) -> GymDayPart? {
        let after = GymDayParts.resolved(day, stored: dayParts, date: date).after(day)
        let from = part.flatMap { after.firstIndex(of: $0) }.map { $0 + 1 } ?? 0
        return after.dropFirst(from).first { !partDone($0, day) }
    }

    /// What follows `part`: the next part before the exercises, the exercises,
    /// then the parts after them; done ones are left out.
    private func step(after part: GymDayPart, _ day: GymDay) -> Step? {
        let before = GymDayParts.resolved(day, stored: dayParts, date: date).before(day)
        if let i = before.firstIndex(of: part) {
            if let next = before.dropFirst(i + 1).first(where: { !partDone($0, day) }) { return .part(next) }
            if let first = Self.nextUndone(day.exercises, after: -1) { return .exercise(first) }
            return nextAfterPart(day).map { .part($0) }
        }
        if let next = nextAfterPart(day, after: part) { return .part(next) }
        return Self.nextUndone(day.exercises, after: -1).map { .exercise($0) }
    }

    private func stepName(_ step: Step?, _ day: GymDay) -> String? {
        switch step {
        case .part(let part)?: return L10n.tr(part.kind.title)
        case .exercise(let at)?: return day.exercises[safe: at]?.name
        case nil: return nil
        }
    }

    /// Turns to a part or an exercise; `auto`: it starts at once (tapped),
    /// else it waits for its Start (it came on after the one before).
    private func go(_ step: Step?, auto: Bool) {
        restEnd = nil
        waiting = !auto && step != nil
        switch step {
        case .part(let part)?:
            partAutoStart = auto
            activePart = part
        case .exercise(let at)?:
            activePart = nil
            index = at
        case nil:
            activePart = nil
        }
    }

    /// Začít trénink with the day's parts: the time and heart rate start, and
    /// the first part not done yet comes on (or the part or exercise tapped).
    private func startWhole(_ day: GymDay, from step: Step? = nil) {
        Task { await start() }
        let first = GymDayParts.resolved(day, stored: dayParts, date: date).before(day).first { !partDone($0, day) }
        if let target = step ?? first.map({ Step.part($0) }) { go(target, auto: true) }
    }

    /// A move or the cardio done: ticked as on the gym day (StretchingCard).
    private func tick(_ part: GymDayPart, id: String) {
        let key = part.kind.key + id
        if !StretchingCard.done(stretchesDone, date: date).contains(key) {
            stretchesDone = StretchingCard.toggled(stretchesDone, date: date, id: key)
        }
    }

    static func editTitle(_ part: GymDayPart) -> String {
        switch part.kind {
        case .warmup: return "Upravit rozcvičku"
        case .stretching: return "Upravit protažení"
        case .cardio: return "Upravit kardio"
        }
    }

    /// Edit warm-up, Edit cardio, Edit stretching under the part (concept 08).
    private func editPill(_ part: GymDayPart, _ parts: GymDayParts, _ day: GymDay) -> some View {
        Button { withAnimation(.snappy) { editingPart = LivePartDraft.start(part, parts: parts, day: day) } } label: {
            Text(verbatim: L10n.tr(Self.editTitle(part))).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 16).frame(height: 36)
                .background(Palette.ink.opacity(0.08), in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    /// The part's Edit screen in its place.
    @ViewBuilder
    private func partEditor(_ draft: LivePartDraft, _ day: GymDay) -> some View {
        // A change that arrives after the edit closed (a routine still loading) is dropped.
        let binding = Binding<LivePartDraft>(get: { editingPart ?? draft }, set: { if editingPart?.part == $0.part { editingPart = $0 } })
        if draft.part.isCardio {
            LiveCardioEditor(choice: binding.cardio)
        } else {
            LiveRoutineEditor(draft: binding, day: day, date: date, done: StretchingCard.done(stretchesDone, date: date))
                .padding(.horizontal, -20)
        }
    }

    /// Done: the change kept for today (the watch gets it with the day's plan).
    private func applyEdit() {
        guard let draft = editingPart, let day else { editingPart = nil; return }
        let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
        // Done without a change keeps the plan's own (its length, later plan updates).
        if draft != LivePartDraft.start(draft.part, parts: parts, day: day), draft.canSave {
            dayParts = GymDayParts.saving(draft.applied(to: parts), date: date, into: dayParts)
        }
        withAnimation(.snappy) { editingPart = nil }
    }

    /// The warm-up's or stretching's holds, or the cardio's time, in this screen.
    private func partRunner(_ part: GymDayPart, _ routine: GymStretching, _ day: GymDay) -> some View {
        let then = step(after: part, day)
        let close: () -> Void = {
            guard let day = self.day else { return }
            go(step(after: part, day), auto: false)
        }
        return Group {
            if LivePartDraft.isFree(routine) {
                FreeTimeRunner(kind: part.kind, key: part.rawValue)
            } else if part.kind == .cardio, let item = routine.items.first {
                let focused = live.focused
                CardioTimerView(item: item, date: date, onDone: { tick(part, id: item.id) },
                                inline: CardioTimerView.Inline(since: focused?.key == part.rawValue ? focused?.start : nil,
                                                               autoStart: partAutoStart, next: stepName(then, day), close: close,
                                                               started: { waiting = false }))
            } else {
                StretchTimerView(stretching: routine, kind: part.kind, onItemDone: { tick(part, id: $0) }, onClose: close,
                                 skip: Set(routine.items.map(\.id).filter { StretchingCard.done(stretchesDone, date: date).contains(part.kind.key + $0) }))
            }
        }
        .cardSurface(cornerRadius: 22)
        // Another set of moves after Edit: the runner starts over with them.
        .id(part.rawValue + routine.items.map(\.id).joined(separator: ","))
        .padding(.top, 14)
    }

    struct PartRow: Identifiable {
        let id: String
        let step: Step
        /// The key of its time (LiveWorkout.segments).
        let key: String
        let symbol: String
        let color: Color
        let name: String
        let detail: String
        let done: Bool
        /// The warm-up, cardio or stretching (nil: an exercise).
        var part: GymDayPart? { if case .part(let part) = step { return part }; return nil }
    }

    /// The parts before the exercises, each exercise, the parts after them;
    /// `withOff`: the parts switched off for the day too (the list before the start).
    private func partRows(_ day: GymDay, _ parts: GymDayParts, withOff: Bool = false) -> [PartRow] {
        func row(_ part: GymDayPart) -> PartRow {
            PartRow(id: part.rawValue, step: .part(part), key: part.rawValue, symbol: part.kind.symbol, color: part.kind.color,
                    name: L10n.tr(part.kind.title), detail: parts.subtitle(part, day: day), done: partDone(part, day))
        }
        let exercises: [PartRow] = day.exercises.enumerated().map { at, exercise in
            PartRow(id: "\(at)-" + exercise.name, step: .exercise(at), key: exercise.name, symbol: "dumbbell", color: Palette.secondary,
                    name: exercise.name, detail: L10n.plural("%lld/%lld sérií", exercise.doneCount, exercise.workCount),
                    done: exercise.sets.allSatisfy(\.done))
        }
        let shown = parts.visible(day)
        guard withOff, let i = shown.firstIndex(of: .exercises) else {
            return parts.before(day).map(row) + exercises + parts.after(day).map(row)
        }
        return shown[..<i].map(row) + exercises + shown[(i + 1)...].map(row)
    }

    /// Before Začít trénink: the list with the switches, also when every part is
    /// off but the plan made a warm-up or stretching (else it could not come back on).
    /// Nothing switched on and none made (all off in Nastavení): straight to the exercise.
    private func showsParts(_ day: GymDay, _ parts: GymDayParts) -> Bool {
        !parts.before(day).isEmpty || !parts.after(day).isEmpty || day.warmup != nil || day.stretching != nil
    }

    /// A part switched on or off for the day, as in GymPartsCard.
    private func setPart(_ part: GymDayPart, on: Bool, _ parts: GymDayParts) {
        var next = parts
        next.off.removeAll { $0 == part }
        if !on { next.off.append(part) }
        dayParts = GymDayParts.saving(next, date: date, into: dayParts)
    }

    /// The day's parts in order, each with its time so far; a tap turns to it
    /// (before Začít trénink: starts the workout with it, and the warm-up,
    /// cardio and stretching have their switch for the day).
    private func partsList(_ day: GymDay, _ parts: GymDayParts) -> some View {
        let rows = partRows(day, parts, withOff: !started)
        let now: String? = activePart?.rawValue ?? (started ? current(day)?.name : nil)
        return VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: L10n.tr(started ? "Trénink" : "Dnešní trénink"))
                .font(Typo.caption).foregroundStyle(Palette.muted).textCase(.uppercase)
                .padding(.top, 12).padding(.bottom, 2)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        if row.id != rows.first?.id { Divider().overlay(Palette.hairline) }
                        let on = row.part.map(parts.isOn) ?? true
                        HStack(spacing: 10) {
                            Button {
                                if started { go(row.step, auto: true) } else { startWhole(day, from: row.step) }
                            } label: {
                                partRow(row, now: row.key == now, waits: waiting && row.key == now,
                                        seconds: started ? live.seconds(of: row.key, at: context.date) : 0)
                                    // Off stays readable: only the row fades, the switch keeps its colours.
                                    .opacity(on ? 1 : 0.55)
                            }
                            .buttonStyle(.plain)
                            .disabled(!on)
                            if !started, let part = row.part {
                                Toggle(isOn: Binding(get: { on }, set: { setPart(part, on: $0, parts) })) { EmptyView() }
                                    .toggleStyle(AurinToggleStyle())
                                    .fixedSize()
                                    .accessibilityLabel(Text(verbatim: row.name))
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 4)
        .cardSurface(cornerRadius: 22)
        .padding(.top, 14)
    }

    private func partRow(_ row: PartRow, now: Bool, waits: Bool = false, seconds: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: row.symbol).scaledFont(15, cap: .denseCap).foregroundStyle(row.color)
                .frame(width: 34, height: 34).background(row.color.opacity(0.12), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: row.name).font(now ? Typo.bodyStrong : .body).foregroundStyle(row.done && !now ? Palette.muted : Palette.ink).lineLimit(1)
                Text(verbatim: row.detail).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if waits {
                Text(verbatim: L10n.tr("nezačato")).font(Typo.small).foregroundStyle(Palette.muted)
            } else if seconds > 0 {
                Text(verbatim: Self.clock(seconds)).font(Typo.small).monospacedDigit().foregroundStyle(now ? Palette.ink : Palette.muted)
            }
            if waits {
                EmptyView()
            } else if now {
                Circle().fill(Palette.rust).frame(width: 8, height: 8).accessibilityHidden(true)
            } else if row.done {
                Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
            }
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        .accessibilityAddTraits(row.done ? .isSelected : [])
    }

    /// "Na řadě": the warm-up, stretching or the exercises came on after the
    /// part before and wait for their Start; the warm-up and stretching can be
    /// skipped (the cardio waits in its own screen, CardioTimerView).
    private func readyCard(_ target: Step, _ day: GymDay, _ parts: GymDayParts) -> some View {
        let part: GymDayPart? = { if case .part(let part) = target { return part }; return nil }()
        let symbol = part?.kind.symbol ?? "dumbbell"
        let color = part?.kind.color ?? Palette.secondary
        let label = L10n.tr("Na řadě") + ", " + L10n.tr(part?.kind.title ?? "Posilovna")
        let name = part.map { L10n.tr($0.kind.title) } ?? current(day)?.name ?? L10n.tr("Posilovna")
        let left: [GymExercise] = day.exercises.filter { $0.sets.contains { !$0.done } }
        let setsLeft: Int = left.reduce(0) { $0 + $1.workCount - $1.doneCount }
        let gymLine: String = L10n.plural("%lld cviků", left.count) + ", " + L10n.plural("%lld sérií", setsLeft)
        let detail: String = part.map { parts.subtitle($0, day: day) } ?? gymLine
        let start: String = part?.kind == .stretching ? "Spustit protažení" : part?.kind == .warmup ? "Spustit rozcvičku" : "Spustit posilku"
        return VStack(spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: symbol).scaledFont(19, cap: .denseCap).foregroundStyle(color)
                    .frame(width: 44, height: 44).background(color.opacity(0.14), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: label).font(Typo.caption).foregroundStyle(color).textCase(.uppercase)
                    Text(verbatim: name).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                    Text(verbatim: detail).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            PrimaryButton(title: L10n.tr(start), systemImage: "play.fill") {
                waiting = false
                live.worked()
            }
            if let part {
                Button { go(step(after: part, day), auto: false) } label: {
                    Text(verbatim: L10n.tr("Přeskočit sekci")).font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
        .padding(.top, 14)
    }

    /// "Další: Protažení": what comes after the last exercise; a tap starts it here.
    private func nextPartCard(_ part: GymDayPart, _ day: GymDay) -> some View {
        Button { go(.part(part), auto: true) } label: {
            HStack(spacing: 12) {
                Image(systemName: part.kind.symbol).scaledFont(15, cap: .denseCap).foregroundStyle(part.kind.color)
                    .frame(width: 34, height: 34).background(part.kind.color.opacity(0.14), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    // "Next", not the "More" the shared Další key reads in English.
                    Text(verbatim: L10n.isEnglish ? "Next" : "Další").font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: L10n.tr(part.kind.title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(verbatim: GymDayParts.resolved(day, stored: dayParts, date: date).subtitle(part, day: day))
                        .font(Typo.small).foregroundStyle(Palette.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "play.fill").font(.footnote).foregroundStyle(Palette.muted).accessibilityHidden(true)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .cardSurface(cornerRadius: 22)
    }


    /// "7:12" or "1:02:05".
    static func clock(_ seconds: Int) -> String {
        let h = seconds / 3600, m = seconds / 60 % 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    /// "80 kg × 8".
    private func plannedLine(_ set: GymSet, in exercise: GymExercise) -> String {
        let carry = carried(set, in: exercise)
        let pounds = lb(exercise.name)
        let weight: String = LiftWeight.shown(carry?.kg ?? set.plannedKg, machineLb: pounds).map { $0 + " " + LiftWeight.unit(machineLb: pounds) + " × " } ?? ""
        return weight + Fmt.range(carry?.reps ?? set.plannedReps ?? "")
    }

    /// The weight of plannedLine, as shown ("80"); "" with none.
    private func restKg(_ set: GymSet, in exercise: GymExercise) -> String {
        let carry = carried(set, in: exercise)
        return LiftWeight.shown(carry?.kg ?? set.plannedKg, machineLb: lb(exercise.name)) ?? ""
    }

    // MARK: The end

    /// Every set done, not finished yet: the totals so far, what is left after
    /// the exercises and Dokončit trénink. Once finished, doneSummary.
    private func finished(_ day: GymDay) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 8) {
                SectionLabel(text: "Trénink dokončen")
                Text(title(day)).font(Typo.heading(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 22)
            summaryGrid(day).padding(.top, 6)
            ForEach(newRecords(day)) { record in recordCard(record) }
            changesCard(day)
            swapsCard
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            addExerciseButton
            // What comes after the exercises, before the session is closed (GymDayParts).
            let parts = GymDayParts.resolved(day, stored: dayParts, date: date)
            ForEach(parts.after(day).filter { !partDone($0, day) }) { part in nextPartCard(part, day) }
            PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: saving) { Task { await finish() } }
                .disabled(saving)
        }
        // Swaps from the Apple Watch come in while the workout is open.
        .onAppear { swaps = GymSwaps.list(date) }
    }

    /// The finished workout (concept 08, Summary): the top, the rating, what
    /// didn't send, and the way back into it or to throw it away. Close is pinned.
    private func doneSummary(_ day: GymDay) -> some View {
        let sets: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let planned: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        let volume: Double = GymSessionMath.volume(day.exercises)
        let lifted: Int = day.exercises.filter { $0.doneCount > 0 }.count
        return VStack(alignment: .leading, spacing: 12) {
            WorkoutDoneSummary(title: title(day), when: doneWhen(day), sources: doneSources, doneSets: sets, plannedSets: planned,
                               strain: doneStrain(day), records: newRecords(day).map(doneRecord), minutes: totals?.minutes ?? day.loggedMinutes,
                               volume: GymSessionMath.volumeText(volume), volumeChange: volumeChange(day, volume),
                               volumeBetter: volume >= lastVolume(day), exercises: lifted, avgHr: totals?.avgHr, kcal: totals?.kcal)
            WorkoutRatingCard(date: date, exercises: day.exerciseNames,
                              liked: catalog.reduce(into: [String: Bool]()) { out, item in if let liked = item.liked { out[item.name] = liked } })
                .padding(.top, 10)
            // A swap made today (often on the watch): only today, or from now on.
            swapsCard
            // Only what failed to send: the rest is quiet (Close's line says it goes on).
            if shownSendRows.contains(where: { $0.status == .error }) { sendCard }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if !model.demo {
                // Finish by mistake: back to the workout, the clock from its start.
                Button { if saving { resumeAfterFinish = true } else { Task { await resume() } } } label: {
                    Text("Pokračovat v tréninku").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(minHeight: 46)
                }
                .buttonStyle(.plain)
                .disabled(resumeAfterFinish).opacity(resumeAfterFinish ? 0.4 : 1)
                .padding(.top, 6)
            }
            if !reopened {
                Button(role: .destructive) { confirmDiscard = true } label: {
                    Text("Zahodit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                        .frame(maxWidth: .infinity).frame(minHeight: 46)
                }
                .buttonStyle(.plain)
                .disabled(saving)
            }
        }
        .onAppear { swaps = GymSwaps.list(date) }
    }

    /// "Today, 17:30 to 18:25" from the times in the sheet.
    private func doneWhen(_ day: GymDay) -> String? {
        guard let start = day.startedAt, let end = day.finishedAt else { return nil }
        let today = AppModel.localDate(Date())
        let dayText = Fmt.capitalized(Fmt.relativeDay(date, today: today))
        let clock: (Date) -> String = { $0.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale)) }
        return dayText + ", " + L10n.f("%@ až %@", clock(start), clock(end))
    }

    /// Aurin recorded it; the heart rate's source after it.
    private var doneSources: [String] {
        var out = ["Aurin"]
        if let heartFrom, !heartFrom.isEmpty, heartFrom != "Aurin" { out.append(heartFrom) }
        return out
    }

    /// What this workout added to today's strain, once the server has it (today
    /// only): the done gym workout of Today that began within 20 min of this one.
    private func doneStrain(_ day: GymDay) -> WorkoutDoneSummary.Strain? {
        guard date == AppModel.localDate(Date()), let today = model.today, let score = today.strain.score,
              let start = day.startedAt else { return nil }
        let startMinute = Calendar.current.component(.hour, from: start) * 60 + Calendar.current.component(.minute, from: start)
        let item = today.plan.first { item in
            guard item.kind == "workout", item.done, item.sport == "strength", let time = item.time ?? item.session?.time else { return false }
            let parts = time.split(separator: ":").compactMap { Int($0) }
            guard parts.count >= 2 else { return false }
            return abs(parts[0] * 60 + parts[1] - startMinute) <= 20
        }
        guard let added = item?.strain, added > 0 else { return nil }
        let target = today.strain.target.map { (low: $0.low, high: $0.high) }
        return WorkoutDoneSummary.Strain(workout: added, dayFrom: max(0, score - added), dayTo: score, target: target)
    }

    private func doneRecord(_ record: NewRecord) -> WorkoutDoneSummary.Record {
        let pounds = lb(record.name)
        let unit = LiftWeight.unit(machineLb: pounds)
        // The record before as a whole lift ("100 kg × 2"): records go by the estimated max, not the weight alone.
        let was = GymSessionMath.lift(record.old, machineLb: pounds)
        let name = ExerciseCatalog.shownName(record.name)
        guard let kg = record.lift.kg, kg > 0 else {
            // Bodyweight: the reps are the record.
            return WorkoutDoneSummary.Record(name: name, value: GymSessionMath.lift(record.lift) ?? "", unit: "", was: was)
        }
        let reps = record.lift.reps.map { " × " + Fmt.int($0) } ?? ""
        return WorkoutDoneSummary.Record(name: name, value: GymCoach.shown(kg, machineLb: pounds), unit: unit + reps, was: was)
    }

    /// The coach about this finished workout.
    private func doneSubject(_ day: GymDay) -> CoachSubject {
        let sets = day.exercises.reduce(0) { $0 + $1.doneCount }
        return CoachSubject(kind: .activity, title: title(day),
                            line: [doneWhen(day), L10n.plural("%lld sérií", sets)].compactMap { $0 }.joined(separator: ", "),
                            date: date, sport: "gym", view: "workouts", symbol: "dumbbell", color: Palette.Sport.gym,
                            questions: ["Jak se mi tahle posilovna povedla?", "Kolik mám dát příště?", "Co mám dát zítra?"])
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
        /// The record before today.
        let old: GymHistory.Lift
        var id: String { name }
    }

    private func newRecords(_ day: GymDay) -> [NewRecord] {
        var out: [NewRecord] = []
        for exercise in day.exercises {
            let lifts = GymSessionMath.lifts(exercise)
            guard let best = lifts.max(by: { GymSessionMath.e1rm($0) < GymSessionMath.e1rm($1) }),
                  let old = GymSessionMath.record(history.exercise(exercise.name), before: date) else { continue }
            if GymSessionMath.e1rm(best) > GymSessionMath.e1rm(old) + 0.01 { out.append(NewRecord(name: exercise.name, lift: best, old: old)) }
        }
        return out
    }

    private func recordCard(_ record: NewRecord) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles").foregroundStyle(Palette.amber)
                .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text("Nový rekord").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(record.name + " " + (GymSessionMath.lift(record.lift, machineLb: lb(record.name)) ?? "")).font(Typo.caption).foregroundStyle(Palette.muted)
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

    /// "Vyměněno dnes": each swap of the workout, kept only today or next time too.
    @ViewBuilder
    private var swapsCard: some View {
        if !swaps.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Vyměněno dnes").padding(.horizontal, 4).padding(.top, 4)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(swaps) { swap in swapRow(swap, first: swap.id == swaps.first?.id) }
                }
                .padding(.horizontal, 16)
                .cardSurface(cornerRadius: 22)
            }
        }
    }

    private func swapRow(_ swap: GymSwap, first: Bool) -> some View {
        let to = ExerciseCatalog.shownName(swap.to)
        return VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: ExerciseCatalog.shownName(swap.from) + " → " + to)
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            Picker(L10n.f("Výměna za %@", to), selection: Binding(get: { swap.nextTime }, set: { next in Task { await keepSwap(swap, next) } })) {
                Text("Jen dnes").tag(false)
                Text("I příště").tag(true)
            }
            .pickerStyle(.segmented)
            if swap.nextTime {
                Text(L10n.f("Další tréninky dají místo něj %@. Vrátit to jde v Nastavení → Posilovna → Cviky.", to))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 14)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
    }

    /// "I příště": the old exercise thumbs down, the new one up, so the plans
    /// give the new one (src/exercise-feedback.js). "Jen dnes" puts back the
    /// thumbs they had before. One write, no AI.
    private func keepSwap(_ swap: GymSwap, _ next: Bool) async {
        guard let i = swaps.firstIndex(where: { $0.id == swap.id }), swaps[i].nextTime != next else { return }
        let old = swaps
        // The switch moves at once; the thumbs from before are read meanwhile.
        swaps[i].nextTime = next
        if next, !model.demo {
            if catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] }
            if let j = swaps.firstIndex(where: { $0.id == swap.id }) {
                swaps[j].fromBefore = catalog.first { $0.name == swap.from }?.liked
                swaps[j].toBefore = catalog.first { $0.name == swap.to }?.liked
            }
        }
        GymSwaps.save(swaps, date: date)
        guard !model.demo else { return }
        let before = swaps.first { $0.id == swap.id } ?? swap
        let items: [(exercise: String, liked: Bool?)] = next
            ? [(exercise: swap.from, liked: false), (exercise: swap.to, liked: true)]
            : [(exercise: swap.from, liked: before.fromBefore), (exercise: swap.to, liked: before.toBefore)]
        do {
            try await model.api.rateExercises(items)
            for item in items { if let j = catalog.firstIndex(where: { $0.name == item.exercise }) { catalog[j].liked = item.liked } }
            error = nil
        } catch {
            swaps = old
            GymSwaps.save(old, date: date)
            self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
        }
    }

    // Out of the body's modifier chain, which is too long to type-check with closures inside.
    /// Nahradit: the swap sheet once this one is gone, while the exercise has sets to do (as Vyměnit).
    private func techniqueSheet(_ item: Named) -> some View {
        let left = day?.exercises.first(where: { $0.name == item.name })?.sets.contains(where: { !$0.done }) == true
        return TechniqueSheet(exercise: item.name, replace: left ? { Task { try? await Task.sleep(for: .milliseconds(450)); swapping = item.name } } : nil)
    }

    /// Zavřít free at the latest closeWait after the sending started.
    private func freeCloseLater() async {
        guard let started = sendStarted else { return }
        try? await Task.sleep(for: .seconds(max(0, started.addingTimeInterval(Self.closeWait).timeIntervalSinceNow)))
        if sendStarted == started { closeReady = true }
    }

    /// Zavřít and the X wait while the workout is saved and sent, at most closeWait.
    private var closeLocked: Bool { finishedSession && saving && !closeReady }

    /// Zavřít: grey while the workout is saved; what still sends goes on in the background.
    private var closeButton: some View {
        VStack(spacing: 8) {
            PrimaryButton(title: L10n.tr("Zavřít")) { close() }
                .disabled(closeLocked).opacity(closeLocked ? 0.4 : 1)
            if closeLocked {
                Text("Ukládám…")
            } else if saving {
                Text("Co ještě běží, dojede na pozadí.")
            }
        }
        .font(Typo.caption).foregroundStyle(Palette.muted)
        .padding(.top, 4)
    }

    /// Where the workout goes: Apple Health and the apps from Zdroje dat
    /// (Aurin posílá), each with its state while it is sent.
    @ViewBuilder
    private var sendCard: some View {
        let rows = shownSendRows
        if !rows.isEmpty {
            VStack(spacing: 0) {
                ForEach(rows) { row in sendRow(row, first: row.id == rows.first?.id) }
            }
            .padding(.horizontal, 16)
            .cardSurface(cornerRadius: 22)
        }
    }

    /// The answer once there, else the apps it is on its way to.
    private var shownSendRows: [SyncReport.Row] {
        var rows: [SyncReport.Row] = sendRows ?? []
        if sendRows == nil, saving {
            let ids = UserDefaults.standard.stringArray(forKey: AppModel.activityDestinationsKey) ?? []
            rows = ids.map { SyncReport.Row(destination: $0, status: .pending) }
            if totals?.saved != true, AppleHealthExport.shared.writesWorkouts { rows.append(SyncReport.Row(destination: "apple", status: .pending)) }
        }
        // The live workout was written to Apple Health by Dokončit itself.
        if totals?.saved == true, !rows.contains(where: { $0.destination == "apple" }) { rows.append(SyncReport.Row(destination: "apple", status: .sent)) }
        return rows.sorted { (SyncApp.order.firstIndex(of: $0.destination) ?? 9) < (SyncApp.order.firstIndex(of: $1.destination) ?? 9) }
    }

    private func sendRow(_ row: SyncReport.Row, first: Bool) -> some View {
        HStack(spacing: 12) {
            SyncAppIcon(id: row.destination, size: 26)
            Text(verbatim: SyncApp.name(row.destination)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: 6)
            Group {
                switch row.status {
                case .sent:
                    Label(row.destination == "apple" ? L10n.tr("Uloženo") : L10n.tr("Odesláno"), systemImage: "checkmark")
                        .foregroundStyle(Palette.green)
                case .error:
                    Label(L10n.tr("Neodesláno"), systemImage: "exclamationmark.circle.fill").foregroundStyle(Palette.rust)
                case .pending:
                    if sendRows == nil {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text(L10n.tr("Odesílám…"))
                        }
                        .foregroundStyle(Palette.muted)
                    } else {
                        Label(L10n.tr("Odesílá se"), systemImage: "clock").foregroundStyle(Palette.muted)
                    }
                }
            }
            .font(.footnote.weight(.semibold))
            .lineLimit(1)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
    }

    /// "4 × 80 kg": the work sets and their top weight.
    private func work(_ exercise: GymExercise) -> String {
        let lifts = GymSessionMath.lifts(exercise)
        guard let top = lifts.compactMap(\.kg).max(), top > 0 else { return L10n.f("%@ ×", String(lifts.count)) }
        let pounds = lb(exercise.name)
        return "\(lifts.count) × " + GymCoach.shown(top, machineLb: pounds) + " " + LiftWeight.unit(machineLb: pounds)
    }

    private func total(_ title: String, _ value: String, change: String? = nil, better: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.small).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
            if let change { Text(change).font(Typo.caption).foregroundStyle(better ? Palette.green : Palette.rust) }
        }
    }

    /// The day didn't load (no signal and no copy on the phone, a server error):
    /// not Prázdný trénink, whose Přidat cvik would save a sheet over the plan.
    /// Again, or back, as in GymLive.
    private func loadFailed(_ message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Text(message).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center)
            SecondaryButton(title: "Zkusit znovu") { error = nil; Task { await load() } }
            Button { dismiss() } label: {
                Text("Zpět").font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(maxWidth: .infinity).frame(height: 46)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    /// Nothing planned: an empty workout the exercises are added to one by one.
    private var empty: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            if day?.cancelled == true {
                Text("Dnešní posilovna je zrušená.").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            } else {
                Text("Prázdný trénink").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
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
                        Text(verbatim: Fmt.capitalized(Fmt.relativeDay(last, today: date)) + ", " + L10n.plural("%lld cviků", count))
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
        let carry = carried(set, in: exercise)
        kg = LiftWeight.shown(set.kg ?? carry?.kg ?? set.plannedKg, machineLb: lb(exercise.name)) ?? ""
        reps = set.reps ?? carry?.reps ?? ""
    }

    /// The set before changed after its tick (its weight, reps or letter):
    /// the set at hand follows it, unless something else was typed there.
    private func refill(from old: GymDay?) {
        guard let old, let exercise = day?.exercises[safe: index], let set = nextSet(exercise),
              let before = old.exercises.first(where: { $0.name == exercise.name && $0.sets.contains { $0.row == set.row } }),
              let was = before.sets.first(where: { $0.row == set.row }) else { return }
        let wasCarry = carried(was, in: before)
        let carry = carried(set, in: exercise)
        let pounds = lb(exercise.name)
        if kg.isEmpty || kg == LiftWeight.shown(was.kg ?? wasCarry?.kg ?? was.plannedKg, machineLb: pounds) ?? "" {
            kg = LiftWeight.shown(set.kg ?? carry?.kg ?? set.plannedKg, machineLb: pounds) ?? ""
        }
        if reps == was.reps ?? wasCarry?.reps ?? "" { reps = set.reps ?? carry?.reps ?? "" }
    }

    /// The rest started, moved or skipped on the watch: the same here.
    private func receiveRest(_ rest: WatchGym.Rest) {
        guard rest.date == date, !model.demo, !finishedSession else { return }
        watchRest = rest
        if let name = rest.exercise, let at = day?.exercises.firstIndex(where: { $0.name == name }) { index = at }
        guard let end = rest.end, end > Date() else {
            restEnd = nil
            return
        }
        restTotal = max(1, rest.total)
        restStart = end.addingTimeInterval(-TimeInterval(restTotal))
        restEnd = end
    }

    /// The exercise of the set at hand in pounds (LiftUnits).
    private var atHandPounds: Bool { day.flatMap(current).map { lb($0.name) } ?? false }

    /// The set the weight and reps fields are for.
    private var atHand: GymSet? {
        guard let day, !finishedSession, let exercise = current(day) else { return nil }
        return nextSet(exercise)
    }

    /// The weight and reps typed here, to the watch's gym at once, unless they came from there.
    private func sendDraft() {
        guard !model.demo, live.running || startTapped, let set = atHand,
              let kgValue = LiftWeight.number(LiftWeight.kgText(kg, machineLb: atHandPounds)) ?? set.plannedKg.flatMap(LiftWeight.number) else { return }
        let draft = WatchGym.Draft(date: date, row: set.row, kg: kgValue,
                                   reps: Int(reps.trimmingCharacters(in: .whitespaces)) ?? GymCoach.firstNumber(set.plannedReps) ?? 0)
        guard !draft.same(watchDraft) else { return }
        WatchBridge.shared.sendDraft(draft)
    }

    /// The weight and reps being set on the watch: the same in the fields here.
    private func receiveDraft(_ draft: WatchGym.Draft) {
        guard draft.date == date, draft.row == atHand?.row else { return }
        watchDraft = draft
        let shown = LiftWeight.shown(GymCoach.kgText(draft.kg), machineLb: atHandPounds) ?? ""
        if LiftWeight.number(LiftWeight.kgText(kg, machineLb: atHandPounds)).map({ abs($0 - draft.kg) >= 0.05 }) ?? true { kg = shown }
        if Int(reps.trimmingCharacters(in: .whitespaces)) != draft.reps { reps = String(draft.reps) }
    }

    /// The rest to the watch's gym, unless it came from there.
    private func sendRest(_ end: Date?) {
        guard !model.demo, live.running || startTapped else { return }
        let rest = WatchGym.Rest(date: date, end: end, total: restTotal, exercise: day?.exercises[safe: index]?.name)
        guard !rest.same(watchRest) else { return }
        watchRest = nil
        WatchBridge.shared.sendRest(rest)
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
        // Paused: the lock screen's clock would run on; it comes back with Resume.
        GymLiveActivity.sync(day: finishedSession || !started || paused ? nil : day, focus: index, restStart: restStart, restEnd: restEnd, quiet: quiet)
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
        // Asked once, from GymSessionView or Start workout: never again on a later opening.
        let resumeAsked = Self.resumeOnOpen == date
        Self.resumeOnOpen = nil
        let startAsked = Self.startOnOpen == date
        Self.startOnOpen = nil
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
            watchTook = false
            let loaded = try await model.gymDay(date: date)
            // A set from the watch meanwhile: its day is newer than the load.
            if !watchTook { day = loaded }
            original = loaded
            startAtFirstOpen()
            // Finished earlier (Dokončit): the summary, to rate it or go on.
            if let day, day.finishedAt != nil, day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                reopened = true
                finishedSession = true
                if let minutes = day.loggedMinutes { totals = (minutes, nil, nil, nil, false) }
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
            // Pokračovat v tréninku from the done workout's detail (GymSessionView): on at once.
            if reopened, resumeAsked {
                await resume()
            }
            if startAsked, !finishedSession, !started, let day, current(day) != nil { countingDown = true }
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

    /// The day from the watch (a set done there, a change from its menu): the
    /// exercise on the screen follows the watch once it has no set left.
    private func takeFromWatch(_ fresh: GymDay) {
        // A set from the watch: the exercises waiting for Spustit posilku have begun.
        if activePart == nil, Self.setsDone(fresh) > (day.map(Self.setsDone) ?? 0) { waiting = false }
        day = fresh
        watchTook = true
        if !finishedSession { followOpen() }
    }

    /// The exercise on the screen is done: on to the next one with sets left,
    /// as the watch went on. The watch's rest names the exercise too, but a
    /// rest skipped, none before the next set or one sent while this iPhone
    /// slept leaves the screen behind.
    private func followOpen() {
        guard let list = day?.exercises, list[safe: index]?.sets.contains(where: { !$0.done }) == false,
              let open = list.indices.first(where: { $0 > index && list[$0].sets.contains { !$0.done } })
                ?? list.firstIndex(where: { $0.sets.contains { !$0.done } }) else { return }
        index = open
    }

    /// Back on the screen while the watch leads: sets the watch saved alone
    /// (it went on without this iPhone, which then hears nothing) show here
    /// too. One load, only when the iPhone comes back to the screen.
    private func catchUpWithWatch() async {
        guard !model.demo, !finishedSession, let shown = day,
              let fresh = try? await model.gymDay(date: date), day == shown,
              Self.setsDone(fresh) > Self.setsDone(shown) else { return }
        WatchBridge.shared.gymDays[date] = fresh
        takeFromWatch(fresh)
    }

    static func setsDone(_ day: GymDay) -> Int {
        day.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count }
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
        let line = [muscle, sets].compactMap { $0 }.joined(separator: ", ")
        return line.isEmpty ? nil : line
    }

    /// "Nahradit cvik": its sets still to do become the alternative, with
    /// its estimated load; the done ones stay recorded under the old name.
    /// A rest under way goes on.
    private func swapExercise(_ name: String, for alt: GymAlternative) async {
        guard var next = day else { return }
        let before = next, swapsBefore = swaps, indexBefore = index
        let rows = Set(next.exercises.filter { $0.name == name }.flatMap(\.sets).filter { !$0.done }.map(\.row))
        let onScreen = next.exercises[safe: index]?.name == name
        next.replace(exercise: name, with: alt.name, kg: alt.kg.flatMap { $0 > 0 ? GymCoach.kgText($0) : nil })
        // Swapped before a set was done: its time so far goes with it (the watch keeps it by the row).
        if !next.exercises.contains(where: { $0.name == name }) { live.rename(name, to: alt.name) }
        day = next
        GymSwaps.record(date, from: name, to: alt.name)
        swaps = GymSwaps.list(date)
        // The timer goes back only when it moved and the new exercise had no time of its own before.
        lastSwap = SwapUndo(from: name, to: alt.name, day: before, after: next, swaps: swapsBefore, index: indexBefore,
                            renamed: !next.exercises.contains(where: { $0.name == name }) && !before.exercises.contains(where: { $0.name == alt.name }))
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

    /// Back to the exercise before the last swap: the day, the swaps and the
    /// place as they were. Only until a set of the new exercise is done.
    private func undoSwap() async {
        guard let undo = lastSwap, Self.canUndo(undo, in: day) else { lastSwap = nil; return }
        lastSwap = nil
        if undo.renamed { live.rename(undo.to, to: undo.from) }
        day = undo.day
        swaps = undo.swaps
        GymSwaps.save(undo.swaps, date: date)
        index = undo.index
        if let exercise = undo.day.exercises[safe: index] { prefill(nextSet(exercise), in: exercise) }
        syncActivity()
        guard !model.demo else { return await loadMuscles(undo.day) }
        do {
            try await model.saveGym(undo.day, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
        await loadMuscles(undo.day)
    }

    /// The swap can go back while nothing in the day changed since: a set
    /// done or an exercise added anywhere would be lost with the old day.
    static func canUndo(_ undo: SwapUndo, in day: GymDay?) -> Bool { day == undo.after }

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
        countingDown = false
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
                                          restEnd: restEnd, restTotal: restTotal, next: current(day)?.name, startTapped: startTapped,
                                          part: activePart, waiting: waiting)
    }

    /// Back from the bar: the same exercise and rest, then the lock-screen
    /// taps made meanwhile.
    private func restoreMinimized() {
        guard let gym = model.minimizedGym, gym.date == date else { return }
        model.minimizedGym = nil
        guard !finishedSession, let count = day?.exercises.count, count > 0 else { return }
        index = min(gym.index, count - 1)
        // The watch went on while the workout was hidden.
        followOpen()
        startTapped = gym.startTapped
        restTotal = gym.restTotal
        restStart = gym.restStart
        restEnd = gym.restEnd.flatMap { $0 > Date() ? $0 : nil }
        // A part that waited for its Start still waits.
        waiting = gym.waiting
        partAutoStart = !gym.waiting
        activePart = gym.part
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
        // Zavřít after Pokračovat v tréninku: the workout stays finished.
        resumeAfterFinish = false
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
            GymSwaps.save([], date: date)
        }
        dismiss()
    }

    /// One set more for the current exercise, like its last one. A set goes
    /// away swiped left, the one the user means.
    private func addSet(at offset: Int? = nil) async {
        let at = offset ?? index
        guard var next = day, next.exercises.indices.contains(at) else { return }
        next.addSet(at: at)
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

    /// Finished on the Apple Watch (its summary): finished here too, with the
    /// summary and the rating, as with Dokončit.
    /// Finished on the watch, or left without a set for 30 min (IdleWorkout):
    /// the end at the last set then.
    private func finishIfEndedOnWatch() {
        guard live.endedOnWatch || live.idleEnd != nil, live.running, !finishedSession, !saving, day != nil else { return }
        let end = live.idleEnd ?? Date()
        Task { await finish(at: end) }
    }

    /// The sets are saved as they are ticked: the week shows the session done,
    /// then the rating.
    private func finish(at end: Date = Date()) async {
        restEnd = nil
        activePart = nil
        // The start and end in the sheet: opened again, the workout shows its
        // summary (the rating, Pokračovat v tréninku) and can go on from its start.
        if var next = day {
            if next.startedAt == nil, let start = live.start { next.markStarted(start) }
            next.markFinished(end)
            day = next
        }
        if live.running {
            let saved = await live.finish(at: end)
            totals = (live.minutes(at: end), live.kcal, live.avgHeartRate, live.maxHeartRate, saved)
            heartFrom = live.heartSource
            live.reset()
        }
        // The summary comes first, with the sending, the rating and Zahodit trénink.
        finishedSession = true
        if !model.demo, let day {
            saving = true
            sendRows = nil
            closeReady = false
            sendStarted = Date()
            defer {
                saving = false
                if resumeAfterFinish {
                    resumeAfterFinish = false
                    Task { await resume() }
                }
            }
            do {
                try await model.saveGym(day, date: date)
                error = nil
                // Saved: Zavřít is free, the sending below goes on after it too.
                closeReady = true
            } catch {
                self.error = L10n.f("Trénink se nepodařilo uložit: %@", error.localizedDescription)
                return
            }
            // To Intervals.icu and Google Health as chosen in Zdroje dat (Aurin posílá),
            // at once and beside the reloads; Apple Health has the live workout already.
            let minutes = totals.map { max(1, $0.minutes) }
            let model = model, date = date, appleSaved = totals?.saved == true
            let start = minutes.map { end.addingTimeInterval(-Double($0) * 60) }
            async let shared = model.shareGym(day, date: date, start: start, minutes: minutes, appleSaved: appleSaved)
            await model.refreshTraining()
            await model.loadMuscles()
            // Today's strain with this workout in it, for the summary's strain card.
            await model.reloadToday()
            sendRows = await shared
        }
    }

    /// By sides: a weight changed on one side goes to the other side too
    /// (GymSessionMath.otherSide), as its plan, with its drop sets following.
    /// The other side's set of the same number keeps it as typed (not carried
    /// over nor adjusted from that side's set before); its later sets carry on.
    private func mirrorWeight(_ set: GymSet, kg: String, in next: inout GymDay) {
        guard let exercise = next.exercises.first(where: { $0.sets.contains { $0.row == set.row } }) else { return }
        let rows = GymSessionMath.otherSide(of: set, in: exercise, typed: typed.kg)
        for row in rows {
            next.followDrops(after: row, from: exercise.sets.first { $0.row == row }?.plannedKg, to: kg, keep: typed.kg)
            next.set(row: row, column: 3, kg)
        }
        if let twin = rows.first { typed.kg.insert(twin) }
    }

    /// The weight or reps of a ticked set changed afterwards.
    private func editDone(_ set: GymSet, kg: String, reps: String) async {
        guard var next = day else { return }
        let k = LiftWeight.kgText(kg, machineLb: lb(next.exercises.first { $0.sets.contains { $0.row == set.row } }?.name ?? ""))
        let r = reps.trimmingCharacters(in: .whitespaces)
        guard !k.isEmpty || !r.isEmpty, (set.kg ?? "") != k || (set.reps ?? "") != r else { return }
        next.edit(row: set.row, kg: k.isEmpty ? (set.kg ?? "") : k, reps: r.isEmpty ? (set.reps ?? "") : r, keepDrops: typed.kg)
        if !k.isEmpty, LiftWeight.number(k) != set.kg.flatMap(LiftWeight.number) { mirrorWeight(set, kg: k, in: &next) }
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

    /// A set to come typed in ahead: what changed becomes its plan and stays
    /// (typed). A new weight goes to the work sets after it with the same
    /// plan too (not one typed to another weight); a drop set keeps it to itself.
    private func typeAhead(_ set: GymSet, kg: String, reps: String, shown: (kg: String, reps: String)) async {
        guard var next = day, let exercise = next.exercises.first(where: { $0.sets.contains { $0.row == set.row } }) else { return }
        let k = LiftWeight.kgText(kg, machineLb: lb(exercise.name))
        let r = reps.trimmingCharacters(in: .whitespaces)
        if !k.isEmpty, kg != shown.kg {
            let plan = set.plannedKg.flatMap(LiftWeight.number)
            let rows = exercise.sets.filter { s in
                s.row == set.row || (set.work && s.work && !s.done && s.row > set.row && s.side == set.side
                    && s.plannedKg.flatMap(LiftWeight.number) == plan)
            }.map(\.row)
            for row in rows { next.set(row: row, column: 3, k) }
            mirrorWeight(set, kg: k, in: &next)
            typed.kg.formUnion(rows)
        }
        if !r.isEmpty, reps != shown.reps {
            next.set(row: set.row, column: 4, r)
            typed.reps.insert(set.row)
        }
        // The other side may be the set at hand: its field follows.
        let old = day
        await saveDay(next)
        refill(from: old)
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
        planLetters = Self.moved(planLetters) { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count }
        kept = Set(kept.compactMap { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count })
        typed.move { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count }
        moveRests { row in gone.contains(row) ? nil : row - gone.filter { $0 < row }.count }
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
        } else if let set = next.exercises.flatMap(\.sets).first(where: { $0.row == row }), !set.drop {
            // The letter of a set still to do rates it; the weight it was
            // given keeps following the plan's letter.
            if !set.done, planLetters[row] == nil { planLetters[row] = GymIntensity.letter(set.intensity) ?? "" }
            next.setIntensity(row: row, letter)
        }
        // Rows after an added drop set move one down.
        picked = Set(picked.map { $0 > row && letter == "D" ? $0 + 1 : $0 }).union([row])
        if letter == "D" {
            kept = Set(kept.map { $0 > row ? $0 + 1 : $0 })
            planLetters = Self.moved(planLetters) { $0 > row ? $0 + 1 : $0 }
            typed.move { $0 > row ? $0 + 1 : $0 }
            moveRests { $0 > row ? $0 + 1 : $0 }
        }
        let old = day
        await saveDay(next)
        if letter != "D" { refill(from: old) }
    }

    private func removeDrop(_ row: Int) async {
        guard var next = day else { return }
        next.removeDrop(row: row)
        picked = Set(picked.compactMap { $0 == row ? nil : $0 > row ? $0 - 1 : $0 })
        planLetters = Self.moved(planLetters) { $0 == row ? nil : $0 > row ? $0 - 1 : $0 }
        kept = Set(kept.compactMap { $0 == row ? nil : $0 > row ? $0 - 1 : $0 })
        typed.move { $0 == row ? nil : $0 > row ? $0 - 1 : $0 }
        moveRests { $0 == row ? nil : $0 > row ? $0 - 1 : $0 }
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
        next.undo(row: set.row, keepDrops: typed.kg)
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

    /// GymSessionMath.carried with this workout's kept and typed sets; a
    /// first try of the exercise also follows its warm-up.
    private func carried(_ set: GymSet, in exercise: GymExercise) -> (kg: String?, reps: String?)? {
        GymSessionMath.carried(asPlanned(set), in: exercise, keep: kept, typed: typed, firstTry: history.last(exercise.name, before: date) == nil)
    }

    /// A set still to do with the plan's letter back in place of one chosen
    /// for it here (Petr 2026-11-16: F chosen for set 2 made set 1 "easy").
    private func asPlanned(_ set: GymSet) -> GymSet {
        guard !set.done, let letter = planLetters[set.row] else { return set }
        var planned = set
        planned.intensity = letter.isEmpty ? nil : letter
        return planned
    }

    /// Rows moved by a set added or taken out (nil: the row is gone).
    private static func moved(_ letters: [Int: String], _ to: (Int) -> Int?) -> [Int: String] {
        Dictionary(letters.compactMap { row, letter in to(row).map { ($0, letter) } }, uniquingKeysWith: { a, _ in a })
    }

    /// The letter chosen for the set before (not the plan's): the sets to come
    /// take it too, as they take its weight and reps.
    private func carriedLetter(_ set: GymSet, in exercise: GymExercise) -> String? {
        guard set.work, !picked.contains(set.row), adjusted(set, in: exercise) == nil,
              let before = GymSessionMath.previous(set, in: exercise),
              picked.contains(before.row) else { return nil }
        return before.intensity
    }

    /// How the set before moved this one's weight: the ✦ line and its
    /// "Nechat 12,5" (GymSessionMath.adjustment).
    private func adjusted(_ set: GymSet, in exercise: GymExercise) -> (text: String, keep: String, from: Int)? {
        guard !set.done, let before = GymSessionMath.previous(asPlanned(set), in: exercise), !kept.contains(before.row),
              let change = GymSessionMath.adjustment(asPlanned(set), after: before),
              // Not when the set has its own weight (typed in ahead, the plan's own).
              carried(set, in: exercise)?.kg == change.kg,
              let kg = before.kg, let done = before.reps else { return nil }
        let goal = set.plannedReps ?? before.plannedReps ?? ""
        let text: String = !change.lighter ? L10n.f("Série %@ šla lehce, %@ z %@. Další těžší.", before.number, done, goal)
            : GymIntensity.letter(before.intensity) == "F" ? L10n.f("Série %@ do selhání na %@ z %@. Další lehčeji.", before.number, done, goal)
            : L10n.f("Série %@ jen na %@ z %@. Další lehčeji.", before.number, done, goal)
        return (text, L10n.f("Nechat %@", LiftWeight.shown(kg, machineLb: lb(exercise.name)) ?? kg), before.row)
    }

    /// "Nechat": the sets to come go on with the weight of the set before,
    /// both sides of it by sides.
    private func keep(_ row: Int, in exercise: GymExercise) {
        let number = exercise.sets.first { $0.row == row }?.number
        kept.formUnion(exercise.sets.filter { $0.done && $0.work && ($0.row == row || $0.number == number) }.map(\.row))
        prefill(exercise.sets.first { !$0.done }, in: exercise)
    }

    /// The reps a done set keeps: what was typed, else the plan's lower number
    /// ("5" of "5–8", the range shows as the grey hint); a drop set without
    /// reps typed keeps none (regression kept by the redesign, PM-souhrn 10).
    static func savedReps(typed: String, planned: String?, drop: Bool) -> String {
        let typed = typed.trimmingCharacters(in: .whitespaces)
        if !typed.isEmpty { return typed }
        if drop { return "" }
        return GymCoach.firstNumber(planned).map { String($0) } ?? (planned ?? "")
    }

    private func complete(_ set: GymSet) async {
        guard var next = day else { return }
        // A set begun during the rest ends the rest: its length stays between the rows.
        if restEnd != nil { endRest() }
        let letter = day?.exercises.first(where: { $0.sets.contains { $0.row == set.row } }).flatMap { carriedLetter(set, in: $0) }
        if letter != nil { picked.insert(set.row) }
        let k = LiftWeight.kgText(kg, machineLb: lb(next.exercises.first { $0.sets.contains { $0.row == set.row } }?.name ?? ""))
        let r = reps.trimmingCharacters(in: .whitespaces)
        // The letter in the set (the plan's, the one chosen, or the one chosen for the set before) goes with it.
        // Nothing typed in kg: the weight the field showed (carried from the set before, else the plan's).
        let shown: String? = day?.exercises.first(where: { $0.sets.contains { $0.row == set.row } }).flatMap { carried(set, in: $0)?.kg }
        // A weight other than the field showed: by sides the other side takes it.
        let machineLb = lb(next.exercises.first { $0.sets.contains { $0.row == set.row } }?.name ?? "")
        let showed = LiftWeight.kgText(LiftWeight.shown(set.kg ?? shown ?? set.plannedKg, machineLb: machineLb) ?? "", machineLb: machineLb)
        if !k.isEmpty, LiftWeight.number(k) != LiftWeight.number(showed) {
            mirrorWeight(set, kg: k, in: &next)
        }
        next.complete(row: set.row, kg: k.isEmpty ? (shown ?? set.plannedKg ?? "") : k, reps: Self.savedReps(typed: r, planned: set.plannedReps, drop: set.drop), rpe: "", intensity: letter, keepDrops: typed.kg)
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
            if let after = Self.nextUndone(next.exercises, after: index) {
                index = after
                rest = GymRestSettingsView.before(next.exercises[safe: after], setting: restExercises)
            } else {
                // The last exercise is done: no rest; the stretching or cardio after the exercises comes on.
                rest = 0
                if let part = nextAfterPart(next) { go(.part(part), auto: false) }
            }
        }
        // A rest only before a set still to do on the screen it leads to.
        if next.exercises[safe: index]?.sets.contains(where: { !$0.done }) == true, rest > 0 {
            restAfter = set.row
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

/// The weight and reps of the set at hand, the same on the watch while they
/// are typed (a short wait, so each keystroke doesn't go on its own).
struct WatchDraftHooks: View {
    let kg: String
    let reps: String
    let row: Int?
    let send: () -> Void
    let received: (WatchGym.Draft) -> Void

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task(id: "\(row ?? -1)|\(kg)|\(reps)") {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled, row != nil else { return }
                send()
            }
            .onReceive(NotificationCenter.default.publisher(for: .watchDraft)) { note in
                if let draft = note.object as? WatchGym.Draft { received(draft) }
            }
    }
}

/// Training mode and the Apple Watch's gym: the rest sent and taken both
/// ways, and a Finish on the watch.
struct WatchGymHooks: View {
    let live: LiveWorkout
    let restEnd: Date?
    let sendRest: (Date?) -> Void
    let received: (WatchGym.Rest) -> Void
    let ended: () -> Void
    /// Back on the screen while the watch leads the workout.
    let back: () -> Void
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .onChange(of: restEnd) { _, end in sendRest(end) }
            .onChange(of: live.endedOnWatch) { _, _ in ended() }
            .onChange(of: live.idleEnd) { _, _ in ended() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active, live.onWatch { back() }
            }
            .onReceive(NotificationCenter.default.publisher(for: .watchRest)) { note in
                if let rest = note.object as? WatchGym.Rest { received(rest) }
            }
    }
}

/// One swap in Training mode, kept so it can be undone (decision 7).
struct SwapUndo: Equatable {
    let from: String
    let to: String
    /// The day, the swaps and the place before the swap.
    let day: GymDay
    /// The day right after it: undo only while it is still this.
    let after: GymDay
    let swaps: [GymSwap]
    let index: Int
    /// The old exercise left the day, so the watch's time went with it.
    let renamed: Bool
}
