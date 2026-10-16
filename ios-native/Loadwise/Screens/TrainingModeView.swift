import SwiftUI
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
    @State private var rpe = 8
    @AppStorage("restSets") private var restSets = 90
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
    @State private var picking = false
    /// "Začít trénink" tapped (the sample day has no recording to show it).
    @State private var startTapped = false
    private var live: LiveWorkout { LiveWorkout.shared }
    /// The clock, heart rate and recording run only after "Začít trénink" (or
    /// for a workout already under way); opening the workout starts nothing.
    private var started: Bool { live.running || startTapped }

    var body: some View {
        ZStack {
            // A tap beside the fields puts the keyboard away.
            ScreenBackground(glow: Palette.Glow.training)
                .onTapGesture { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            VStack(alignment: .leading, spacing: 0) {
                header
                if loading && day == nil {
                    Spacer()
                    ProgressView().frame(maxWidth: .infinity)
                    Spacer()
                } else if let day, !day.exercises.isEmpty {
                    if !finishedSession, let exercise = current(day) {
                        ScrollView(showsIndicators: false) {
                            VStack(alignment: .leading, spacing: 0) {
                                if live.running {
                                    LiveWorkoutStrip(live: live, volume: GymSessionMath.volume(day.exercises), zoneLows: zoneLows).padding(.top, 14)
                                }
                                // The warm-up until the first set is done.
                                if let warmup = day.warmup, restEnd == nil, !day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                                    StretchingCard(stretching: warmup, date: date, kind: .warmup, compact: true).padding(.top, 14)
                                }
                                if let restEnd {
                                    rest(day, exercise, until: restEnd)
                                } else {
                                    session(day, exercise)
                                }
                            }
                            .padding(.bottom, 24)
                        }
                        .scrollDismissesKeyboard(.interactively)
                    } else {
                        ScrollView(showsIndicators: false) { finished(day).padding(.bottom, 24) }
                    }
                } else {
                    empty
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true; model.immersive = true
            GymActivityInbox.handler = { activityAction($0) }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false; model.immersive = false; Task { await Reminders.restEnds(at: nil) }
            GymActivityInbox.handler = nil
            GymLiveActivity.end()
        }
        .onChange(of: restEnd) { _, end in Task { await Reminders.restEnds(at: end) }; syncActivity() }
        .onChange(of: day) { _, _ in syncActivity() }
        .onChange(of: index) { _, _ in syncActivity() }
        .onChange(of: finishedSession) { _, _ in syncActivity() }
        .onChange(of: live.heartRate) { _, _ in syncActivity(quiet: true) }
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
            Text("Smažou se zapsané série i trénink uložený do Apple Zdraví.")
        }
        .sheet(isPresented: $picking) {
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day?.exercises.map(\.name) ?? [])) { name in
                Task { await add(name) }
            }
        }
        .sheet(isPresented: $editing) {
            if let day {
                PlanEditorSheet(day: day, catalog: catalog, date: date, current: index) { edited in Task { await saveEdited(edited) } }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            CircleButton(systemImage: "xmark", label: L10n.tr("Ukončit režim tréninku")) { close() }
            if let day, !day.exercises.isEmpty {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title(day)).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(progressLine(day)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 4)
                if !finishedSession, current(day) != nil {
                    CircleButton(systemImage: "list.bullet", label: L10n.tr("Upravit plán")) { editing = true }
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

    private func title(_ day: GymDay) -> String {
        day.planName?.nilIfBlank ?? L10n.tr("Posilovna")
    }

    /// "Cvik 2 z 5 · 6/16 sérií".
    private func progressLine(_ day: GymDay) -> String {
        let done: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let total: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        let position = L10n.f("Cvik %@ z %@", String(min(index, day.exercises.count - 1) + 1), String(day.exercises.count))
        return position + " · \(done)/\(total) " + Fmt.plural(total, "série", "série", "sérií")
    }

    // MARK: The exercise

    private func session(_ day: GymDay, _ exercise: GymExercise) -> some View {
        let set = nextSet(exercise)
        let last = history.last(exercise.name, before: date)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 8) {
                Text(exercise.name).font(Typo.sentence(30, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                CircleButton(systemImage: "chart.bar", label: L10n.tr("Historie cviku")) { historyFor = exercise.name }
                CircleButton(systemImage: "info", label: L10n.tr("Technika")) { technique = exercise.name }
            }
            .padding(.top, 18)

            chips(day, exercise, set)

            sidesPicker(exercise)

            setTable(exercise, set, last)

            if let note = GymSides.note(exercise) { CoachNote(text: note).padding(.top, 12) }

            if let set {
                effort.padding(.top, 14)
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
        .onChange(of: set?.row) { _, _ in prefill(set) }
        .onAppear { prefill(set) }
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
        .disabled(saving || !exercise.sets.contains { !$0.done && !$0.warmup })
        .padding(.top, 12)
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
            ForEach(exercise.sets) { s in setRow(s, exercise, current: set, last: last) }
            tableActions(exercise, set)
        }
        .padding(.vertical, 12).padding(.horizontal, 4)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.top, 14)
    }

    private var tableHeader: some View {
        HStack(spacing: 8) {
            Text("Série").frame(width: 26, alignment: .leading)
            Text("Minule").frame(maxWidth: .infinity, alignment: .leading)
            Text(Units.weightUnit).frame(width: 64)
            Text("Opak.").frame(width: 52)
            Color.clear.frame(width: 34, height: 1)
        }
        .font(.caption2.weight(.medium)).textCase(.uppercase).foregroundStyle(Palette.faint)
        .padding(.horizontal, 10).padding(.bottom, 4)
    }

    private func setRow(_ s: GymSet, _ exercise: GymExercise, current: GymSet?, last: GymHistory.Session?) -> GymSetRow {
        let phase: GymSetRow.Phase = s.done ? .done : (s.row == current?.row ? .current : .next)
        let shownKg: String = LiftWeight.shown(s.done ? s.kg : s.plannedKg) ?? ""
        let shownReps: String = (s.done ? s.reps : s.plannedReps) ?? ""
        // By sides the number shows on the L row only.
        return GymSetRow(label: s.warmup ? "W" : s.side == "P" ? "" : s.number, side: s.side,
                         lastTime: GymSessionMath.lastTime(s, in: exercise, last: last),
                         kg: shownKg, reps: shownReps, state: phase,
                         kgText: $kg, repsText: $reps) {
            switch phase {
            case .done: Task { await undo(s) }
            case .current: Task { await complete(s) }
            case .next: break
            }
        }
    }

    private func tableActions(_ exercise: GymExercise, _ set: GymSet?) -> some View {
        HStack(spacing: 8) {
            pill("plus", L10n.tr("Série")) { Task { await changeSets(by: 1) } }.disabled(saving)
            if exercise.sets.count > 1, set != nil {
                pill("minus", L10n.tr("Série")) { Task { await changeSets(by: -1) } }.disabled(saving)
            }
            if let plates = platesText(exercise) {
                Text(plates).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .padding(.horizontal, 10).frame(height: 30).overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.top, 8)
    }

    /// "Kotouče: 20 + 10 na stranu" for a barbell lift.
    private func platesText(_ exercise: GymExercise) -> String? {
        guard uses(exercise, "barbells"), let value = LiftWeight.number(LiftWeight.kgText(kg)), let plates = GymSessionMath.plates(value) else { return nil }
        return L10n.f("Kotouče: %@ na stranu", plates)
    }

    @ViewBuilder
    private func chips(_ day: GymDay, _ exercise: GymExercise, _ set: GymSet?) -> some View {
        let main: [String] = mainMuscles(exercise)
        let record = GymSessionMath.record(history.exercise(exercise.name), before: date)
        let superset = ExerciseOrder.letter(exercise.superset)
        let failure = set.map { day.isToFailure(row: $0.row) } ?? false
        if !main.isEmpty || record != nil || superset != nil || failure {
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) {
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
                .padding(.horizontal, 10).frame(height: 30).overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(systemImage == "plus" ? "O sérii víc" : "O sérii méně"))
    }

    @ViewBuilder
    private func nextExercise(_ day: GymDay) -> some View {
        // In a superset the partner comes next (A1, B1, A2…).
        let partner = Self.supersetPartner(day.exercises, of: index)
        if let target = partner ?? (day.exercises.indices.contains(index + 1) ? index + 1 : nil), let next = day.exercises[safe: target] {
            Button { move(target - index) } label: {
                HStack(spacing: 12) {
                    Image(systemName: "dumbbell").font(.system(size: 15)).foregroundStyle(Palette.secondary)
                        .frame(width: 34, height: 34).background(Palette.track, in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Další").font(Typo.caption).foregroundStyle(Palette.muted)
                        Text(nextLine(next))
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .buttonStyle(.plain)
        } else if index > 0 {
            Button { move(-1) } label: {
                Label("Předchozí cvik", systemImage: "chevron.left").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
            }
            .buttonStyle(.plain)
        }
    }

    private func nextLine(_ next: GymExercise) -> String {
        let reps: String? = next.sets.first { !$0.warmup }?.plannedReps?.nilIfBlank
        return next.name + " · " + PlanEditorSheet.summary(sets: next.workCount, reps: reps, done: 0)
    }

    // MARK: The rest

    private func rest(_ day: GymDay, _ exercise: GymExercise, until end: Date) -> some View {
        let set = nextSet(exercise)
        let last = history.last(exercise.name, before: date)
        let points: [Double] = recoveryPoints()
        return VStack(alignment: .leading, spacing: 14) {
            RestRing(end: end, total: restTotal).padding(.top, 24)
            HStack(spacing: 10) {
                SecondaryButton(title: "−15 s") { shiftRest(-15) }
                SecondaryButton(title: "+15 s") { shiftRest(15) }
                SecondaryButton(title: "Přeskočit") { restEnd = nil }
            }
            .padding(.top, 6)
            if points.count >= 2 { HeartRecoveryCard(points: points) }
            if let set {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Teď").font(Typo.caption).foregroundStyle(Palette.muted)
                    HStack(alignment: .firstTextBaseline) {
                        Text(nowLine(exercise, set))
                            .font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(plannedLine(set))
                            .font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1)
                    }
                    if let previous = GymSessionMath.lastTime(set, in: exercise, last: last) {
                        Text(L10n.f("Minule %@", previous)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                .padding(16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            let progress = GymSessionMath.muscleProgress(day.exercises, muscles: muscles)
            if !progress.isEmpty { MuscleProgressCard(items: progress) }
        }
        .task(id: end) {
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, restEnd == end else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private func recoveryPoints() -> [Double] {
        guard let start = restStart else { return [] }
        let from = start.addingTimeInterval(-5)
        return live.trail.filter { $0.date >= from }.map { $0.bpm }
    }

    private func nowLine(_ exercise: GymExercise, _ set: GymSet) -> String {
        let which: String = set.warmup ? L10n.tr("rozcvička") : L10n.f("série %@", set.number)
        return exercise.name + " · " + which
    }

    /// "80 kg × 8".
    private func plannedLine(_ set: GymSet) -> String {
        let weight: String = LiftWeight.shown(set.plannedKg).map { $0 + " " + Units.weightUnit + " × " } ?? ""
        return weight + (set.plannedReps ?? "")
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
            // Stretching before the session is closed (src/stretching.js).
            if !finishedSession, let stretching = day.stretching { StretchingCard(stretching: stretching, date: date) }
            if finishedSession {
                PrimaryButton(title: L10n.tr("Ohodnotit"), systemImage: "hand.thumbsup") { rating = true }
                Button(role: .destructive) { confirmDiscard = true } label: {
                    Text("Zahodit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                        .frame(maxWidth: .infinity).frame(height: 46)
                }
                .buttonStyle(.plain)
                .disabled(saving)
            } else {
                PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: saving) { Task { await finish() } }
                    .disabled(saving)
            }
        }
    }

    private func summaryGrid(_ day: GymDay) -> some View {
        let sets: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let volume: Double = GymSessionMath.volume(day.exercises)
        let shown = GymSessionMath.volumeText(volume)
        let columns = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
            if let totals {
                total(L10n.tr("Čas"), Fmt.duration(totals.minutes))
                if let kcal = totals.kcal { total(L10n.tr("Kalorie"), Fmt.int(kcal) + " kcal") }
                if let hr = totals.avgHr { total(L10n.tr("Prům. tep"), Fmt.int(hr) + " bpm") }
            }
            total(L10n.tr("Série"), String(sets))
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
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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

    /// How hard the set was, in words (stored as RPE 6–10 for the next plan).
    struct Effort {
        let rpe: Int
        let label: String
        let hint: String
    }

    static let efforts: [Effort] = [
        Effort(rpe: 6, label: "Lehké", hint: "zbývaly 4 a víc"), Effort(rpe: 7, label: "Akorát", hint: "zbývala 3"),
        Effort(rpe: 8, label: "Těžké", hint: "zbývala 2"), Effort(rpe: 9, label: "Na hraně", hint: "zbývalo 1"),
        Effort(rpe: 10, label: "Selhání", hint: "už ani jedno")
    ]

    /// "V zásobě zbývala 2 opakování · RPE 8".
    static func reserve(_ e: Effort) -> String {
        let reps = e.rpe == 10 ? "" : " opakování"
        return L10n.tr("V zásobě " + e.hint + reps) + " · RPE \(e.rpe)"
    }

    private var effort: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Jak to šlo?").font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(spacing: 6) {
                ForEach(Self.efforts, id: \.rpe) { e in
                    Button { rpe = e.rpe } label: {
                        Text(e.label).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
                            .foregroundStyle(rpe == e.rpe ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 40)
                            .background(rpe == e.rpe ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.tr(e.hint + " opakování"))
                    .accessibilityAddTraits(rpe == e.rpe ? .isSelected : [])
                }
            }
        }
    }

    private func uses(_ exercise: GymExercise, _ station: String) -> Bool {
        catalog.first { $0.name == exercise.name }?.stations?.contains(station) == true
    }

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

    private func prefill(_ set: GymSet?) {
        guard let set else { return }
        kg = LiftWeight.shown(set.kg ?? set.plannedKg) ?? ""
        reps = set.reps ?? set.plannedReps.map { String($0.prefix { $0.isNumber }) } ?? ""
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
            prefill(set)
            Task { await complete(set) }
        }
        syncActivity()
    }

    // MARK: Server

    private func load() async {
        if model.demo { day = DemoData.gym; history = DemoGymHistory.history; loading = false; startAtFirstOpen(); return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.gymDay(date: date)
            original = day
            startAtFirstOpen()
            history = await model.gymHistory()
            sideChoices = (try? await model.api.gymSides())?.choices ?? [:]
            if let profile = try? await model.api.trainingProfile() {
                zoneLows = profile.hrZones.sorted { $0.zone < $1.zone }.map { $0.bpmLow ?? 0 }
            }
            // The clock, calories and heart rate (a workout recorded in Apple
            // Health) start with the first ticked set; a workout already under
            // way with sets left goes on. Only opening it records nothing.
            if let day, day.exercises.contains(where: { $0.sets.contains { !$0.done } }), day.exercises.contains(where: { $0.sets.contains(where: \.done) }) {
                await live.begin(since: nil, weightKg: model.today?.weight?.latest)
            }
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
    /// exercise with a set left.
    private func saveEdited(_ edited: GymDay) async {
        day = edited
        restEnd = nil
        startAtFirstOpen()
        await loadMuscles(edited)
        guard !model.demo else { return }
        do {
            try await model.saveGym(edited, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
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
        await loadMuscles(next)
        guard !model.demo else { return }
        do {
            try await model.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = L10n.f("Plán se nepodařilo uložit: %@", error.localizedDescription)
        }
    }

    /// "Začít trénink": the clock, calories and heart rate (a workout recorded
    /// in Apple Health) and the lock screen's Live Activity start now.
    private func start() async {
        startTapped = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if !model.demo && !live.running { await live.begin(since: nil, weightKg: model.today?.weight?.latest) }
        syncActivity()
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

    /// Zahodit trénink: the day goes back to how it was before this screen,
    /// the clock stops without a workout in Apple Health (one saved by
    /// Dokončit is deleted again), once "Zpět" had its 6 s.
    private func discard() async {
        restEnd = nil
        let model = model, live = live, date = date
        let back = original ?? GymDay(date: date, values: [], cancelled: nil)
        let workout = live.takeSaved()
        live.reset()
        model.deleteLater(L10n.tr("Trénink zahozen")) {
            if !model.demo {
                do { try await model.saveGym(back, date: date) } catch { model.notice = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription) }
                await model.refreshTraining()
            }
            if let workout { await live.delete(workout) }
        }
        dismiss()
    }

    /// One set more for the current exercise (like its last one), or one fewer
    /// (the last one not done).
    private func changeSets(by step: Int) async {
        guard var next = day, next.exercises.indices.contains(index) else { return }
        if step > 0 { next.addSet(at: index) } else { next.removeSet(at: index) }
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
            // To Intervals.icu, Google Health and Strava as chosen in Synchronizace;
            // Apple Health has the live workout already.
            let minutes = totals.map { max(1, $0.minutes) }
            await model.shareGym(day, date: date, start: minutes.map { Date().addingTimeInterval(-Double($0) * 60) }, minutes: minutes,
                                 appleSaved: totals?.saved == true)
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

    private func complete(_ set: GymSet) async {
        guard var next = day else { return }
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces)
        next.complete(row: set.row, kg: k.isEmpty ? (set.plannedKg ?? "") : k, reps: r.isEmpty ? (set.plannedReps ?? "") : r, rpe: String(rpe))
        day = next
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // A set ticked in the table before "Začít trénink" starts the workout too.
        if !started { Task { await start() } }
        // The last set of the exercise: on to the next one after a longer rest.
        var rest = set.warmup ? 60 : restSets
        let otherSide = set.side == "L" && next.exercises[safe: index]?.sets.contains { $0.number == set.number && $0.side == "P" && !$0.done } == true
        if otherSide {
            // Left done: the right side straight after, no rest.
            rest = 0
        } else if !set.warmup, let turn = Self.supersetTurn(next.exercises, from: index) {
            // A superset: A1, B1, A2, B2…, the rest only after each round.
            index = turn.index
            rest = turn.rest == .none ? 0 : turn.rest == .round ? restSets : restExercises
        } else if let exercise = next.exercises[safe: index], exercise.sets.allSatisfy(\.done), index < next.exercises.count - 1 {
            index += 1
            rest = restExercises
        }
        if next.exercises.contains(where: { $0.sets.contains { !$0.done } }), rest > 0 {
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

struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
