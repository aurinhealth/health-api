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
    /// The heart rate zones' lower bounds (Nastavení → Tréninkové zóny).
    @State private var zoneLows: [Double] = []
    @State private var technique: String?
    @State private var historyFor: String?
    @State private var saving = false
    @State private var rating = false
    /// Dokončit trénink was tapped: the summary shows the totals.
    @State private var finishedSession = false
    @State private var totals: (minutes: Int, kcal: Double?, avgHr: Double?, maxHr: Double?, saved: Bool, zones: [Double])?
    private var live: LiveWorkout { LiveWorkout.shared }

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
        .keyboardDoneButton()
        .task { await load() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; model.immersive = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false; model.immersive = false; Task { await Reminders.restEnds(at: nil) } }
        .onChange(of: restEnd) { _, end in Task { await Reminders.restEnds(at: end) } }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
        .sheet(item: Binding(get: { historyFor.map { Named(name: $0) } }, set: { historyFor = $0?.name })) { item in
            ExerciseHistorySheet(name: item.name, exercise: history.exercise(item.name), today: date)
        }
        // Rated or skipped: the workout is done, the mode closes.
        .sheet(isPresented: $rating, onDismiss: { dismiss() }) {
            GymRatingSheet(date: date, exercises: day?.exerciseNames ?? [])
        }
        .sheet(isPresented: $editing) {
            if let day {
                PlanEditorSheet(day: day, catalog: catalog, date: date, current: index) { edited in Task { await saveEdited(edited) } }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            CircleButton(systemImage: "xmark", label: L10n.tr("Ukončit režim tréninku")) { dismiss() }
            if let day, !day.exercises.isEmpty {
                let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
                VStack(alignment: .leading, spacing: 1) {
                    Text(day.planName?.nilIfBlank ?? L10n.tr("Posilovna")).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(L10n.f("Cvik %@ z %@", String(min(index, day.exercises.count - 1) + 1), String(day.exercises.count))
                         + " · \(done)/\(total) " + Fmt.plural(total, "série", "série", "sérií"))
                        .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 4)
                if !finishedSession, current(day) != nil {
                    CircleButton(systemImage: "list.bullet", label: L10n.tr("Upravit plán")) { editing = true }
                    Button { Task { await finish() } } label: {
                        Text("Dokončit").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onAccent)
                            .padding(.horizontal, 14).frame(height: 36).background(Palette.green, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
            } else {
                Spacer()
            }
        }
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

            VStack(spacing: 2) {
                HStack(spacing: 8) {
                    Text("Série").frame(width: 26, alignment: .leading)
                    Text("Minule").frame(maxWidth: .infinity, alignment: .leading)
                    Text(Units.weightUnit).frame(width: 64)
                    Text("Opak.").frame(width: 52)
                    Color.clear.frame(width: 34, height: 1)
                }
                .font(.caption2.weight(.medium)).textCase(.uppercase).foregroundStyle(Palette.faint)
                .padding(.horizontal, 10).padding(.bottom, 4)
                ForEach(exercise.sets) { s in
                    let state: GymSetRow.Phase = s.done ? .done : s.row == set?.row ? .current : .next
                    GymSetRow(label: s.warmup ? "W" : s.number,
                              lastTime: GymSessionMath.lastTime(s, in: exercise, last: last),
                              kg: LiftWeight.shown(s.done ? s.kg : s.plannedKg) ?? "",
                              reps: (s.done ? s.reps : s.plannedReps) ?? "",
                              state: state,
                              kgText: $kg, repsText: $reps) {
                        switch state {
                        case .done: Task { await undo(s) }
                        case .current: Task { await complete(s) }
                        case .next: break
                        }
                    }
                }
                HStack(spacing: 8) {
                    pill("plus", L10n.tr("Série")) { Task { await changeSets(by: 1) } }.disabled(saving)
                    if exercise.sets.count > 1, set != nil {
                        pill("minus", L10n.tr("Série")) { Task { await changeSets(by: -1) } }.disabled(saving)
                    }
                    if uses(exercise, "barbells"), let value = LiftWeight.number(LiftWeight.kgText(kg)), let plates = GymSessionMath.plates(value) {
                        Text(L10n.f("Kotouče: %@ na stranu", plates)).font(Typo.caption).foregroundStyle(Palette.secondary)
                            .padding(.horizontal, 10).frame(height: 30).overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10).padding(.top, 8)
            }
            .padding(.vertical, 12).padding(.horizontal, 4)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.top, 14)

            if let set {
                effort.padding(.top, 14)
                PrimaryButton(title: saving ? "Ukládám…" : "Série hotová", systemImage: "checkmark", busy: saving) {
                    Task { await complete(set) }
                }
                .disabled(saving)
                .padding(.top, 14)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
            nextExercise(day).padding(.top, 14)
        }
        .onChange(of: set?.row) { _, _ in prefill(set) }
        .onAppear { prefill(set) }
        .task(id: exercise.name) { await loadMuscles(day) }
    }

    @ViewBuilder
    private func chips(_ day: GymDay, _ exercise: GymExercise, _ set: GymSet?) -> some View {
        let main = (muscles[exercise.name] ?? [:]).filter { $0.value >= 0.5 }.sorted { $0.value > $1.value }.prefix(3).map(\.key)
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
        if let next = day.exercises[safe: index + 1] {
            Button { move(1) } label: {
                HStack(spacing: 12) {
                    Image(systemName: "dumbbell").font(.system(size: 15)).foregroundStyle(Palette.secondary)
                        .frame(width: 34, height: 34).background(Palette.track, in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Další").font(Typo.caption).foregroundStyle(Palette.muted)
                        Text(next.name + " · " + PlanEditorSheet.summary(sets: next.workCount, reps: next.sets.first { !$0.warmup }?.plannedReps?.nilIfBlank, done: 0))
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

    // MARK: The rest

    private func rest(_ day: GymDay, _ exercise: GymExercise, until end: Date) -> some View {
        let set = nextSet(exercise)
        let last = history.last(exercise.name, before: date)
        let points = restStart.map { start in live.trail.filter { $0.date >= start.addingTimeInterval(-5) }.map(\.bpm) } ?? []
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
                        Text(exercise.name + " · " + (set.warmup ? L10n.tr("rozcvička") : L10n.f("série %@", set.number)))
                            .font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text((LiftWeight.shown(set.plannedKg).map { $0 + " " + Units.weightUnit + " × " } ?? "") + (set.plannedReps ?? ""))
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

    // MARK: The end

    private func finished(_ day: GymDay) -> some View {
        let sets = day.exercises.reduce(0) { $0 + $1.doneCount }
        let volume = GymSessionMath.volume(day.exercises)
        let before = day.exercises.compactMap { e -> Double? in
            guard let last = history.last(e.name, before: date) else { return nil }
            return last.sets.reduce(0) { $0 + ($1.kg ?? 0) * ($1.reps ?? 0) }
        }.reduce(0, +)
        let records = day.exercises.compactMap { e -> (String, GymHistory.Lift)? in
            guard let best = GymSessionMath.lifts(e).max(by: { GymSessionMath.e1rm($0) < GymSessionMath.e1rm($1) }),
                  let old = GymSessionMath.record(history.exercise(e.name), before: date),
                  GymSessionMath.e1rm(best) > GymSessionMath.e1rm(old) + 0.01 else { return nil }
            return (e.name, best)
        }
        let changes = day.exercises.compactMap { e -> (GymExercise, (text: String, better: Bool?))? in
            guard e.doneCount > 0, let change = GymSessionMath.change(e, last: history.last(e.name, before: date)) else { return nil }
            return (e, change)
        }
        return VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 8) {
                SectionLabel(text: "Trénink dokončen")
                Text(day.planName?.nilIfBlank ?? L10n.tr("Posilovna")).font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 22)
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)],
                      alignment: .leading, spacing: 14) {
                if let totals {
                    total(L10n.tr("Čas"), Fmt.duration(totals.minutes))
                    if let kcal = totals.kcal { total(L10n.tr("Kalorie"), Fmt.int(kcal) + " kcal") }
                    if let hr = totals.avgHr { total(L10n.tr("Prům. tep"), Fmt.int(hr) + " bpm") }
                }
                total(L10n.tr("Série"), String(sets))
                let v = GymSessionMath.volumeText(volume)
                total(L10n.tr("Objem"), v.value + " " + v.unit,
                      change: before > 0 && volume > 0 ? Fmt.signed(Units.weight(volume - before) / 1000, digits: 1) + " " + v.unit : nil,
                      better: volume >= before)
                if let hr = totals?.maxHr { total(L10n.tr("Max. tep"), Fmt.int(hr) + " bpm") }
            }
            .padding(.top, 6)
            ForEach(Array(records.enumerated()), id: \.offset) { _, record in
                let (name, lift) = record
                HStack(spacing: 12) {
                    Image(systemName: "sparkles").foregroundStyle(Palette.amber)
                        .frame(width: 36, height: 36).background(Palette.amberSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Nový rekord").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(name + " " + (GymSessionMath.lift(lift) ?? "")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                }
                .padding(16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            if let zones = totals?.zones, zones.reduce(0, +) >= 1 { ZoneMinutesCard(minutes: zones) }
            if !changes.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(changes.enumerated()), id: \.offset) { i, item in
                        HStack(spacing: 8) {
                            Text(item.0.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer(minLength: 6)
                            Text(work(item.0)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                            Text(item.1.text).font(Typo.caption.weight(.semibold))
                                .foregroundStyle(item.1.better == true ? Palette.green : item.1.better == false ? Palette.rust : Palette.muted)
                                .frame(minWidth: 52, alignment: .trailing)
                        }
                        .padding(.vertical, 12)
                        .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                    }
                }
                .padding(.horizontal, 16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            if totals?.saved == true {
                HStack(spacing: 12) {
                    Image(systemName: "heart.fill").foregroundStyle(Palette.rust)
                    Text("Uloženo do Apple Health").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                }
                .padding(16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if finishedSession {
                PrimaryButton(title: L10n.tr("Ohodnotit"), systemImage: "hand.thumbsup") { rating = true }
            } else {
                PrimaryButton(title: L10n.tr("Dokončit trénink"), systemImage: "flag.checkered", busy: saving) { Task { await finish() } }
                    .disabled(saving)
            }
        }
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

    private var empty: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            NavigationLink(value: AppRoute.gymBuilder) {
                Label("Sestavit trénink", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
        }
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

    // MARK: Server

    private func load() async {
        if model.demo { day = DemoData.gym; history = DemoGymHistory.history; loading = false; startAtFirstOpen(); return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.gymDay(date: date)
            startAtFirstOpen()
            history = await model.gymHistory()
            if let profile = try? await model.api.trainingProfile() {
                zoneLows = profile.hrZones.sorted { $0.zone < $1.zone }.map { $0.bpmLow ?? 0 }
            }
            // The clock, calories and heart rate while sets are left.
            if let day, day.exercises.contains(where: { $0.sets.contains { !$0.done } }) {
                await live.begin(since: nil, weightKg: model.today?.weight?.latest)
            }
        } catch {
            self.error = error.localizedDescription
        }
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
        let hadLive = live.running
        if live.running {
            let saved = await live.finish()
            totals = (live.minutes, live.kcal, live.avgHeartRate, live.maxHeartRate, saved, live.zoneMinutes(lows: zoneLows))
            finishedSession = true
            live.reset()
        }
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
        }
        // With the live totals the summary stays first; "Ohodnotit" follows.
        if !hadLive { rating = true }
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
        // The last set of the exercise: on to the next one after a longer rest.
        var rest = set.warmup ? 60 : restSets
        if let exercise = next.exercises[safe: index], exercise.sets.allSatisfy(\.done), index < next.exercises.count - 1 {
            index += 1
            rest = restExercises
        }
        if next.exercises.contains(where: { $0.sets.contains { !$0.done } }), rest > 0 {
            restTotal = rest
            restStart = Date()
            restEnd = Date().addingTimeInterval(TimeInterval(rest))
        }
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
