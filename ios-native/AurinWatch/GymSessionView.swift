import SwiftUI
import WatchKit

/// The gym session on the watch (mockups 19 and 20): the set with its weight
/// and reps (tap a tile, turn the crown), Set done, then the rest with −15 s,
/// Skip and +15 s and how the set went (mockup 8B), a pause (mockup 7), the
/// list of exercises under ≡ and the summary at the end.
/// Each set goes to the iPhone at once (GymStore); the workout runs in
/// HealthKit (GymWorkout) for the heart rate and calories.
struct GymSessionView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var store = GymStore.shared
    @ObservedObject private var workout = GymWorkout.shared

    @State private var exercise = 0
    @State private var kg: Double = 0
    /// The weight and reps the screen itself put in (a new set, the iPhone's
    /// draft): not sent back to the iPhone. Sent, they wrote the watch's older
    /// plan over a weight just changed on the iPhone (Petr 2026-11-09).
    @State private var putIn: [Double]?
    @State private var reps: Double = 8
    @State private var row: Int?
    /// The set the crown's numbers were loaded for (Lift.fieldKey).
    @State private var loaded: String?
    @State private var restEnd: Date?
    @State private var restTotal: Double = 90
    @State private var now = Date()
    @State private var list = false
    /// The coach's card during the workout (watch concept 06, point 10).
    @State private var coach = false
    @State private var summary = false
    /// Ended by itself after 30 min without a set: what was saved, until Done.
    @State private var autoSaved: AutoSaved?
    /// End workout on "Still working out?": the workout ends at the last set.
    @State private var idleStop: Date?

    struct AutoSaved {
        let minutes: Int
        let sets: Int
        let calories: Double
        let end: Date
    }
    /// The cardio, warm-up or stretching on the screen and how far it got.
    @StateObject private var run = GymPartRun()
    /// An exercise picked in ≡ before the first set: the parts before the exercises wait.
    @State private var skipBefore = false
    /// A part before them ended: the exercises wait for Start gym ("Up next").
    @State private var gymWaits = false
    /// The set just done, rated during the rest that follows it.
    @State private var rated: Rated?
    /// The tile the crown turns: the weight, or the reps after a tap on them.
    @State private var selected: Field = .kg
    /// The side tapped in the set's LEFT / RIGHT (mockup "strany"): that side first.
    @State private var picked: Int?
    /// Discard workout in ≡: the question before the workout goes (mockup 8).
    @State private var discarding = false
    /// The exercise whose technique and note are open (a tap on its name).
    @State private var info: Info?
    /// The crown is on the tiles (not scrolling the screen).
    @FocusState private var crown: Bool
    /// Until when the crown stays on the tiles without a turn (holdCrown).
    @State private var crownUntil: Date?
    /// The wrist lowered (Always On): the crown lets go of the tiles.
    @Environment(\.isLuminanceReduced) private var dimmed

    private enum Field { case kg, reps }

    struct Info: Identifiable {
        let exercise: WatchGym.Exercise
        let index: Int
        var id: String { exercise.name }
    }

    struct Rated {
        let row: Int
        var letter: String?
    }
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            Group {
                if let autoSaved {
                    saved(autoSaved)
                } else if discarding {
                    discardQuestion
                } else if workout.askStill, !summary {
                    stillWorking
                } else if summary {
                    GymSummary(finish: finish, keepTraining: keepTraining)
                } else if workout.pausedAt != nil {
                    paused
                } else if let part = shownPart, let day = store.sheetDay, let parts = store.dayParts {
                    GymPartView(run: run, part: part, parts: parts, day: day) {
                        if store.gym?.allDone == true {
                            if nextAfter == nil { summary = true }
                        } else {
                            gymWaits = true
                        }
                    }
                    .id(part)
                } else if store.gym?.allDone == true {
                    GymSummary(finish: finish)
                } else if gymWaits, let gym = store.gym, !gym.exercises.isEmpty {
                    gymReady(gym)
                } else if let end = restEnd, end > now {
                    rest(until: end)
                } else if let gym = store.gym, gym.exercises.isEmpty {
                    emptyWorkout
                } else if let gym = store.gym, let lift = currentLift(in: gym) {
                    setScreen(gym, lift)
                } else {
                    ProgressView()
                }
            }
            .toolbar {
                if autoSaved == nil, !discarding, !workout.askStill, !summary, workout.pausedAt == nil, store.gym?.allDone != true || shownPart != nil {
                    // In the cover's own corner: at .topBarLeading the cover's ✕
                    // took its place (and closed the screen with the workout running).
                    // During the rest too (watch audit B4); the coach is under ≡.
                    ToolbarItem(placement: .cancellationAction) {
                        Button { workout.pause() } label: { Image(systemName: "pause.fill") }
                            .accessibilityLabel(W.tr("Pauza", "Pause"))
                    }
                }
                if autoSaved == nil, !discarding, !summary, workout.pausedAt == nil, store.gym?.allDone != true || shownPart != nil {
                    // The coach top right, as on every page (watch concept 06); the
                    // exercises open from "Exercise 1 of 7 ›" under the name.
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { coach = true } label: { WatchCoachLights() }
                            .accessibilityLabel(W.tr("Kouč, AI", "Coach, AI"))
                    }
                }
            }
            .sheet(isPresented: $list) {
                NavigationStack {
                    GymExerciseList(current: exercise, running: shownPart) { picked in
                        exercise = picked
                        restEnd = nil
                        skipBefore = true
                        gymWaits = false
                        run.close()
                        list = false
                    } moved: { current in
                        exercise = current
                    } openPart: { part in
                        store.reopenPart(part)
                        restEnd = nil
                        run.open(part, minutes: store.dayParts?.choice(part).minutes ?? 0, begun: true)
                        list = false
                    } end: {
                        list = false
                        run.close()
                        summary = true
                    } discard: {
                        list = false
                        discarding = true
                    }
                }
            }
            .sheet(isPresented: $coach) {
                NavigationStack { CoachView(view: "gym") }
            }
            .sheet(item: $info) { info in
                NavigationStack {
                    // Swap from the info, as in ≡ (mockup "hodinky detail cviku").
                    GymExerciseInfo(exercise: info.exercise) { option in
                        store.change(.swap, exercise: info.index, option: option)
                        self.info = nil
                    }
                }
            }
            .alert(W.tr("iPhone je mimo dosah", "iPhone out of reach"), isPresented: $store.failedChange) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(W.tr("Tuhle změnu udělá iPhone. Měj ho u sebe a zkus to znovu.", "Your iPhone makes this change. Keep it close and try again."))
            }
        }
        .task {
            if let current = store.gym?.current { exercise = current.exercise }
            if WatchDemo.on {
                workout.demo()
                // -rest: the rest after the squat's first set.
                if WatchDemo.flag("-rest") {
                    restTotal = 150
                    restEnd = Date().addingTimeInterval(84)
                    rated = Rated(row: 8, letter: "M")
                }
                return
            }
            await workout.begin()
        }
        // While up, this screen ends the workout (idle, the iPhone's end);
        // closed, GymStore.endWithoutScreen does.
        .onAppear { store.screenOpen = true }
        .onDisappear { store.screenOpen = false }
        .onChange(of: store.endedOnPhone) { _, ended in
            // Finished in Training mode on the iPhone: saved here, as one workout.
            guard ended else { return }
            store.endedOnPhone = false
            end(onPhone: true)
        }
        // A set, a change or a pause here or on the iPhone: "Still working out?"
        // waits another 10 min (GymWorkout.worked).
        .onChange(of: store.gym) { _, _ in workout.worked() }
        // A set done (here or on the iPhone): the exercises waiting for Start gym have begun.
        .onChange(of: store.gym?.setsDone ?? 0) { before, after in if after > before { gymWaits = false } }
        .onChange(of: exercise) { _, _ in workout.worked() }
        .onChange(of: kg) { _, _ in workout.worked(); if crown { holdCrown() } }
        .onChange(of: reps) { _, _ in workout.worked(); if crown { holdCrown() } }
        .onChange(of: dimmed) { _, dimmed in if dimmed { crown = false } }
        // No set and no answer for 30 min: saved, ended at the last set.
        .onChange(of: workout.idleEnd) { _, idle in
            guard let idle, autoSaved == nil else { return }
            autoSaved = AutoSaved(minutes: Int(max(0, idle.timeIntervalSince(workout.clockStart ?? idle))) / 60,
                                  sets: store.gym?.setsDone ?? 0, calories: workout.calories, end: idle)
            summary = false
            end(onPhone: false, at: idle, keepOpen: true)
        }
        // The next part before the first set or after the last, from its start.
        .onChange(of: shownPart, initial: true) { _, part in
            guard let part, run.part != part else { return }
            // The workout begins with it: it runs at once; one after another part waits for its Start.
            run.open(part, minutes: store.dayParts?.choice(part).minutes ?? 0, begun: nothingDoneYet)
        }
        .onChange(of: workout.pausedAt) { _, at in run.paused(at != nil); workout.worked() }
        // The rest the same as in Training mode on the iPhone, both ways.
        .onChange(of: restEnd) { _, end in sendRest(end); workout.worked() }
        .onChange(of: store.phoneRest) { _, rest in
            guard let rest, let gym = store.gym, rest.date == gym.date, !summary else { return }
            if let name = rest.exercise, let at = gym.exercises.firstIndex(where: { $0.name == name }) { exercise = at }
            now = Date()
            if let end = rest.end, end > now {
                restTotal = Double(max(1, rest.total))
                restEnd = end
            } else {
                restEnd = nil
            }
        }
        // Each part's and exercise's own time (GymWorkout.segments).
        .onChange(of: focusKey ?? "", initial: true) { _, key in if !key.isEmpty { workout.focus(key) } }
        .onReceive(tick) { date in
            // Only the rest counts down; the set screen stays still between taps.
            guard restEnd != nil else { return }
            now = date
            if let end = restEnd, end <= date {
                restEnd = nil
                // Settings → Apple Watch → When rest ends.
                switch WatchStore.shared.settings.restEnd {
                case "none": break
                case "tap": WKInterfaceDevice.current().play(.directionUp)
                default: WKInterfaceDevice.current().play(.stop)
                }
            }
        }
    }

    /// The part on the screen: one opened from ≡, else the next one turned on
    /// before the first set (until an exercise is picked) or after the last.
    private var shownPart: GymDayPart? {
        if let part = run.part { return part }
        guard let gym = store.gym, let day = store.sheetDay, let parts = store.dayParts else { return nil }
        let started = gym.exercises.contains { $0.lifts.contains(where: \.done) }
        if !started, !skipBefore, let part = parts.before(day).first(where: { !store.partFinished($0) }) { return part }
        return gym.allDone ? nextAfter : nil
    }

    /// What is on the screen, for each part's and exercise's own time.
    private var focusKey: String? {
        guard workout.start != nil, !summary else { return nil }
        // Up next, waiting for its Start: the time goes to no part meanwhile.
        if let part = shownPart {
            let waits: Bool = part.isCardio ? run.started == nil : !run.begun
            if waits, run.part == part { return Self.waitKey }
            return part.rawValue
        }
        if gymWaits, store.gym?.allDone != true { return Self.waitKey }
        guard let gym = store.gym, let lift = currentLift(in: gym),
              let e = gym.exercises.first(where: { $0.lifts.contains { $0.row == lift.row } }) else { return nil }
        // The rest before an exercise not begun yet: its own time starts when the rest ends.
        if restEnd != nil, !e.lifts.contains(where: \.done) { return Self.waitKey }
        return GymWorkout.exerciseKey(e)
    }

    /// The time between a part's end and the next one's Start (GymWorkout.segments): no row shows it.
    static let waitKey = "_waiting"

    /// Nothing done or skipped yet: the workout begins with the part on the screen.
    private var nothingDoneYet: Bool {
        guard let gym = store.gym, let day = store.sheetDay, let parts = store.dayParts else { return true }
        // Step by step, not one && line: Xcode 27.1's optimiser crashed on such a Bool getter (#760).
        if gym.exercises.contains(where: { $0.lifts.contains(where: \.done) }) { return false }
        if parts.visible(day).contains(where: { store.partFinished($0) }) { return false }
        return true
    }

    /// "Up next, Gym": the exercises came on after the part before and wait for Start gym.
    private func gymReady(_ gym: WatchGym) -> some View {
        let left = gym.exercises.filter { $0.lifts.contains { !$0.done } }
        let sets = left.reduce(0) { $0 + $1.lifts.filter { !$0.done && !$0.warmup }.count }
        let first = currentLift(in: gym).flatMap { lift in gym.exercises.first { $0.lifts.contains { $0.row == lift.row } } }
        let exercises = W.tr("\(left.count) \(left.count == 1 ? "cvik" : (2...4).contains(left.count) ? "cviky" : "cviků")",
                             "\(left.count) \(left.count == 1 ? "exercise" : "exercises")")
        let setsLine = W.tr("\(sets) \((1...4).contains(sets) ? "série" : "sérií")", "\(sets) \(sets == 1 ? "set" : "sets")")
        return ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                Text(W.tr("NA ŘADĚ: POSILOVNA", "UP NEXT: GYM")).watchFont(12, .semibold).foregroundStyle(W.secondary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(verbatim: first.map { $0.shown ?? $0.name } ?? W.tr("Posilovna", "Gym")).watchFont(16, .semibold).foregroundStyle(W.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(exercises + ", " + setsLine).watchFont(12).foregroundStyle(W.secondary)
                Button {
                    gymWaits = false
                    workout.worked()
                    WKInterfaceDevice.current().play(.start)
                } label: {
                    Text(W.tr("Spustit posilku", "Start gym")).watchFont(15, .semibold).foregroundStyle(.black)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity).frame(height: 32)
                        .background(W.ink, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
                GymLiveCells()
            }
        }
    }

    /// The next part after the exercises not done or skipped yet.
    private var nextAfter: GymDayPart? {
        guard let day = store.sheetDay, let parts = store.dayParts else { return nil }
        return parts.after(day).first { !store.partFinished($0) }
    }

    /// The set on the screen: the first not done of the chosen exercise, else the next one with sets left.
    private func currentLift(in gym: WatchGym) -> WatchGym.Lift? {
        if let picked, gym.exercises[safe: exercise]?.lifts.contains(where: { $0.row == picked && !$0.done }) == true,
           let lift = gym.lift(row: picked) {
            return lift
        }
        if gym.exercises.indices.contains(exercise), let lift = gym.exercises[exercise].lifts.first(where: { !$0.done }) {
            return lift
        }
        return gym.current?.lift
    }

    // MARK: The set

    private func setScreen(_ gym: WatchGym, _ lift: WatchGym.Lift) -> some View {
        let e = gym.exercises.firstIndex { $0.lifts.contains { $0.row == lift.row } } ?? exercise
        let ex = gym.exercises[e]
        // Set done pinned at the bottom as the system's bottom bar in every
        // text size, the set scrolling above it (watch concept 06, M-1).
        return ScrollView {
            setStack(gym, lift, ex, e)
        }
        .safeAreaInset(edge: .bottom) {
            // Time and heart rate as a small line right above Set done, never
            // under it (concept 06, point 3; CI screenshot: the line was cut).
            if !dimmed {
                VStack(alignment: .leading, spacing: 3) {
                    liveLine.padding(.horizontal, 2)
                    setDone(gym, lift)
                }
            }
        }
        // The crown starts on the weight, also when the tiles come back after a rest.
        .defaultFocus($crown, true)
        .onAppear { load(lift, of: ex.name, in: gym) }
        .onChange(of: lift.fieldKey(in: ex.name)) { _, _ in load(lift, of: ex.name, in: gym) }
        // The weight and reps the same on the iPhone at once, both ways.
        .onChange(of: kg) { _, _ in sendDraft(gym) }
        .onChange(of: reps) { _, _ in sendDraft(gym) }
        .onChange(of: store.phoneDraft) { _, draft in
            guard let draft, draft.date == gym.date, draft.row == row else { return }
            let shown = GymText.shown(draft.kg, machineLb: gym.machineLb(row: row))
            if abs(shown - kg) >= 0.05 { kg = shown }
            if Double(draft.reps) != reps { reps = Double(draft.reps) }
            putIn = [kg, reps]
        }
    }

    private func setDone(_ gym: WatchGym, _ lift: WatchGym.Lift) -> some View {
        Button {
            done(lift, in: gym)
        } label: {
            Label(W.tr("Série hotová", "Set done"), systemImage: "checkmark")
                .watchFont(15, .semibold)
                .foregroundStyle(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: W.small ? 30 : 32)
                .background(W.ink, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .doubleTap()
        .padding(.horizontal, 4)
    }

    private func setStack(_ gym: WatchGym, _ lift: WatchGym.Lift, _ ex: WatchGym.Exercise, _ e: Int) -> some View {
        let lb = gym.machineLb(row: lift.row)
        return VStack(alignment: .leading, spacing: 2) {
            if let line = supersetLine(gym, lift, e) {
                // The superset's violet tag, as on the iPhone.
                Text(line).watchFont(12, .semibold).foregroundStyle(W.indigo)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(W.indigo.opacity(0.18), in: Capsule())
            }
            // A tap on the name: its technique, the record and my note (mockup "u cviku" 5).
            Button {
                info = Info(exercise: ex, index: e)
            } label: {
                HStack(spacing: 4) {
                    Text(ex.title).font(W.serif(W.small ? 17 : 19)).foregroundStyle(W.num)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    // Its own time, running on by itself (the screen stays still between taps).
                    if let time = workout.earlier(GymWorkout.exerciseKey(ex)) {
                        Text(timerInterval: time.since.addingTimeInterval(-Double(time.seconds))...Date.distantFuture, countsDown: false)
                            .watchFont(12, .semibold).monospacedDigit().foregroundStyle(W.amber)
                            .lineLimit(1).fixedSize()
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(W.tr("Technika a poznámka", "Technique and note"))
            // "Exercise 1 of 7, set 2 of 4 ›": the exercises, in place of the ≡ button (watch concept 06, point 1).
            HStack(spacing: 4) {
                Button { list = true } label: {
                    HStack(spacing: 3) {
                        Text(progress(gym, lift, ex, e)).lineLimit(1).minimumScaleFactor(0.7)
                        Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
                    }
                    .watchFont(12, .medium).foregroundStyle(W.secondary)
                    .frame(minHeight: 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(W.tr("Seznam cviků", "The exercises"))
                if lift.side != nil { sides(lift, in: gym, e) }
                if lift.work, let letter = lift.intensity { GymText.intensityPill(letter) }
            }
            .disabled(store.changing)
            // "last time 57.5 kg × 8".
            if !dimmed, let line = GymText.info(lift, machineLb: lb) {
                Text(line).watchFont(12).foregroundStyle(W.muted)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            // One crown for both fields, turning the one tapped last. A focusable
            // tile each (build 380) left the reps out of reach: a tap never
            // moved the crown off the weight.
            // Detents: the value moves only by whole steps (0.5 kg or 1 lb, one rep),
            // never through the in-between values the plain rotation shows.
            // `kg` holds the weight as shown, in pounds with imperial units or on a machine in lb.
            HStack(spacing: 6) {
                tile(GymText.kg(kg), unit: lb ? "lb" : W.weightUnit, extra: lb ? nil : perSide(ex.bar),
                     field: .kg, value: $kg, step: lb ? 1 : W.weightStep, top: Self.topKg(lb))
                tile("\(Int(reps))", unit: Self.repsUnit(lift.plannedReps), extra: nil,
                     field: .reps, value: $reps, step: 1, top: 100)
            }
            .focusable(true)
            .focused($crown)
            .focusEffectDisabled()
            .digitalCrownRotation(detent: crownValue, from: 0, through: selected == .kg ? Self.topKg(lb) : 100,
                                  by: selected == .kg ? (lb ? 1 : W.weightStep) : 1, sensitivity: selected == .kg ? .medium : .low,
                                  isContinuous: false, isHapticFeedbackEnabled: true)
        }
        .padding(.top, 2)
    }

    /// "Exercise 1 of 7, set 2 of 4".
    private func progress(_ gym: WatchGym, _ lift: WatchGym.Lift, _ ex: WatchGym.Exercise, _ e: Int) -> String {
        let set = label(lift, in: ex, superset: gym.superset(of: e) != nil, side: false)
        let lower: String = set.prefix(1).lowercased() + String(set.dropFirst())
        return W.tr("Cvik \(e + 1) z \(gym.exercises.count), ", "Exercise \(e + 1) of \(gym.exercises.count), ") + lower
    }

    /// "20 per side": the load on each side of the bar, under the kg (watch concept 06, M-4).
    private func perSide(_ bar: Double?) -> String? {
        guard let bar else { return nil }
        let side = (kg - bar) / 2
        guard side > 0 else { return nil }
        return GymText.kg(side) + W.tr(" na stranu", " per side")
    }

    /// Mockup "supersérie": "SUPERSET A, 1/2, then Seated row", or after the
    /// round's last exercise the rest that follows it; nil outside a superset.
    private func supersetLine(_ gym: WatchGym, _ lift: WatchGym.Lift, _ e: Int) -> String? {
        guard !lift.warmup, let group = gym.superset(of: e), let letter = gym.exercises[e].superset,
              let at = group.firstIndex(of: e) else { return nil }
        var text = W.tr("SUPERSÉRIE", "SUPERSET") + " \(letter), \(at + 1)/\(group.count)"
        if let next = gym.next(after: lift.row), next.exercise != e || next.turn != nil {
            switch next.turn {
            case .partner?: text += W.tr(", pak ", ", then ") + gym.exercises[next.exercise].title
            case .round?: text += W.tr(", pak pauza \(lift.rest) s", ", rest \(lift.rest) s after")
            case nil: text += W.tr(", pak pauza \(gym.restBefore(next.exercise)) s", ", rest \(gym.restBefore(next.exercise)) s after")
            }
        }
        return text
    }

    /// LEFT / RIGHT of a one-sided set: the side at hand lit, a tap takes the
    /// other side first (when it is not done yet).
    private func sides(_ lift: WatchGym.Lift, in gym: WatchGym, _ e: Int) -> some View {
        let other = gym.otherSide(of: lift, in: e)
        return ViewThatFits(in: .horizontal) {
            sidePill(lift.side, short: false)
            sidePill(lift.side, short: true)
        }
        // 28 pt to tap around the 20 pt pill, without moving the row (watch audit G2).
        .contentShape(Rectangle().inset(by: -4))
        .onTapGesture {
            guard let other else { return }
            WKInterfaceDevice.current().play(.click)
            picked = other.row
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lift.side == "L" ? W.tr("Levá strana", "Left side") : W.tr("Pravá strana", "Right side"))
        .accessibilityHint(other == nil ? "" : W.tr("Klepnutím druhá strana", "Tap for the other side"))
        .accessibilityAddTraits(other == nil ? [] : .isButton)
    }

    private func sidePill(_ side: String?, short: Bool) -> some View {
        HStack(spacing: 0) {
            ForEach(["L", "P"], id: \.self) { s in
                let on = side == s
                Text(s == "L" ? (short ? "L" : W.tr("LEVÁ", "LEFT")) : (short ? W.tr("P", "R") : W.tr("PRAVÁ", "RIGHT")))
                    .watchFont(12, .bold)
                    .foregroundStyle(on ? .black : W.secondary)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, short ? 6 : 5)
                    .frame(height: 18)
                    .background(on ? W.ink : .clear, in: Capsule())
            }
        }
        .padding(1)
        .background(W.tile, in: Capsule())
    }

    /// "série 2/4" ("kolo 2/4" in a superset), "rozcvička", "drop", with the side of a one-sided set.
    private func label(_ lift: WatchGym.Lift, in e: WatchGym.Exercise, superset: Bool = false, side: Bool = true) -> String {
        var text: String
        if lift.warmup {
            text = W.tr("Rozcvička", "Warm-up")
        } else if lift.drop {
            text = "Drop"
        } else {
            let numbers = e.lifts.filter(\.work).map(\.number).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
            let at = (numbers.firstIndex(of: lift.number) ?? 0) + 1
            text = (superset ? W.tr("Kolo", "Round") : W.tr("Série", "Set")) + " \(at)" + W.tr(" z ", " of ") + "\(numbers.count)"
        }
        if side, let side = lift.side { text += ", " + (side == "L" ? "L" : W.tr("P", "R")) }
        return text
    }

    private static func topKg(_ machineLb: Bool) -> Double { W.imperial || machineLb ? 1100 : 500 }

    /// "reps", or with the plan's range as the iPhone shows it: "8–12 reps".
    static func repsUnit(_ planned: String?) -> String {
        let unit = W.tr("opak.", "reps")
        guard let planned = planned?.trimmingCharacters(in: .whitespaces), !planned.isEmpty else { return unit }
        let range = planned.replacingOccurrences(of: "-", with: "–").replacingOccurrences(of: " ", with: "")
        guard range.contains("–") else { return unit }
        return range + " " + unit
    }

    /// What the crown turns: the selected tile's value.
    private var crownValue: Binding<Double> {
        Binding(get: { selected == .kg ? kg : reps },
                set: { if selected == .kg { kg = $0 } else { reps = $0 } })
    }

    private func tile(_ value: String, unit: String, extra: String?, field: Field, value number: Binding<Double>, step: Double, top: Double) -> some View {
        // The field the crown turns has the green rim (watch concept 06, point 2); Always-On only rims.
        let on = selected == field && !dimmed
        let shape = RoundedRectangle(cornerRadius: 14)
        return VStack(spacing: 0) {
            Text(value).font(W.serif(W.small ? 21 : 23)).foregroundStyle(dimmed ? W.muted : W.num).lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).watchFont(12).foregroundStyle(W.muted).lineLimit(1).minimumScaleFactor(0.7)
            if let extra, !dimmed {
                Text(extra).watchFont(12).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .frame(maxWidth: .infinity, minHeight: W.small ? 40 : 44)
        .padding(.vertical, 1)
        .background(dimmed ? AnyShapeStyle(Color.clear) : AnyShapeStyle(W.card), in: shape)
        .overlay { shape.stroke(on ? W.green : W.hair, lineWidth: on ? 2 : 1) }
        .contentShape(shape)
        .onTapGesture {
            selected = field
            focusCrown()
        }
        // VoiceOver: one element that a swipe up or down changes, as the crown does.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(field == .kg ? W.tr("Váha", "Weight") : W.tr("Opakování", "Reps"))
        .accessibilityValue(value + " " + unit)
        .accessibilityAdjustableAction { direction in
            let next = number.wrappedValue + (direction == .increment ? step : -step)
            number.wrappedValue = min(top, max(0, next))
        }
    }

    /// The workout's time and heart rate in one short line, inside rows the
    /// set and the rest already have (no row of its own where the screen is short).
    private var liveLine: some View {
        HStack(spacing: 5) {
            clock.foregroundStyle(W.secondary)
            Circle().fill(W.pink).frame(width: 5, height: 5).accessibilityHidden(true)
            // As the Heart tile said it: a bare dash told nothing (Petr 2026-11-09).
            Text(workout.heartRate.map { W.number($0) + " bpm" } ?? (workout.noHealth ? W.tr("Povol ve Zdraví", "Allow in Health") : "–"))
                .foregroundStyle(W.secondary)
                .accessibilityLabel(W.tr("Tep", "Heart rate"))
        }
        .watchFont(12, .medium).monospacedDigit()
        .lineLimit(1).minimumScaleFactor(0.7)
    }

    /// The workout's time, running on its own.
    @ViewBuilder private var clock: some View {
        if let start = workout.clockStart {
            Text(timerInterval: start...Date.distantFuture, countsDown: false)
        } else {
            Text("0:00")
        }
    }

    /// The set at hand as it is now, to the iPhone; not what came from it.
    private func sendDraft(_ gym: WatchGym) {
        guard let row, putIn != [kg, reps] else { return }
        putIn = nil
        store.sendDraft(WatchGym.Draft(date: gym.date, row: row, kg: GymText.kgOf(kg, machineLb: gym.machineLb(row: row)), reps: Int(reps)))
    }

    private func load(_ lift: WatchGym.Lift, of exercise: String, in gym: WatchGym) {
        guard loaded != lift.fieldKey(in: exercise) else { return }
        loaded = lift.fieldKey(in: exercise)
        row = lift.row
        kg = GymText.shown(lift.kg ?? 0, machineLb: gym.machineLb(row: lift.row))
        // Last time's reps before a made-up 8 (watch review 2026-11-25).
        reps = Double(lift.reps ?? lift.last?.reps ?? 8)
        // What the iPhone already has in its fields for this set, when it came
        // before the watch moved on to it (the iPhone sends it as it moves on).
        if let draft = store.phoneDraft, draft.date == gym.date, draft.row == lift.row {
            kg = GymText.shown(draft.kg, machineLb: gym.machineLb(row: lift.row))
            reps = Double(draft.reps)
        }
        putIn = [kg, reps]
        // Each new set starts on the weight, but the crown turns it only after
        // a tap on a tile: the crown pressed against the hand during a set
        // changed the weight unasked (Petr 2026-11-12).
        selected = .kg
        crown = false
    }

    /// The crown onto the tiles. Asked for while the screen before (the
    /// warm-up's list, the start) still held the crown, the focus never came,
    /// and a tap set an already true `crown` again, which moved nothing: the
    /// first set of the workout (often a warm-up set) could not be changed.
    /// So it is let go and asked for again once the tiles are on the screen.
    private func focusCrown() {
        crown = false
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            crown = true
            holdCrown()
        }
    }

    /// The crown lets go of the tiles 5 s after the tap or the last turn, so
    /// a bent wrist later in the set doesn't move the weight.
    private func holdCrown() {
        let until = Date().addingTimeInterval(5)
        crownUntil = until
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(5))
            if crownUntil == until { crown = false }
        }
    }

    private func done(_ lift: WatchGym.Lift, in gym: WatchGym) {
        let next = gym.next(after: lift.row)
        picked = nil
        let done = GymText.kgOf(kg, machineLb: gym.machineLb(row: lift.row))
        store.complete(row: lift.row, kg: done, reps: Int(reps))
        rated = lift.work ? Rated(row: lift.row) : nil
        WKInterfaceDevice.current().play(.success)
        guard let next else {
            // The cardio or stretching after the exercises first, then the summary.
            if nextAfter == nil { summary = true }
            return
        }
        exercise = next.exercise
        // No rest before a drop set or the other side of the same set.
        let otherSide = !next.newExercise && next.lift.number == lift.number && next.lift.side != nil && next.lift.side != lift.side
        let seconds: Int
        switch next.turn {
        // A superset: its partner straight on, the set's rest after each round (as on the iPhone).
        case .partner?: seconds = 0
        case .round?: seconds = lift.rest
        case nil: seconds = next.newExercise ? gym.restBefore(next.exercise) : (next.lift.drop || otherSide ? 0 : lift.rest)
        }
        if seconds > 0 {
            restTotal = Double(seconds)
            restEnd = Date().addingTimeInterval(Double(seconds))
            now = Date()
        }
    }

    // MARK: The pause

    /// Watch concept 06, point 11: Paused with the time standing still, then
    /// Resume, End workout and Discard (asked again) under each other.
    private var paused: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(W.tr("Pozastaveno", "Paused")).watchFont(13, .semibold).foregroundStyle(W.amber)
                    Text(GymText.elapsed(workout.elapsed)).font(W.serif(40)).foregroundStyle(W.num).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                .padding(.horizontal, 4)
                .accessibilityElement(children: .combine)
                Button {
                    workout.resume()
                } label: {
                    Text(W.tr("Pokračovat", "Resume")).watchFont(15, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .mainButton()
                .padding(.top, 4)
                Button {
                    summary = true
                } label: {
                    Text(W.tr("Ukončit trénink", "End workout")).watchFont(15, .semibold).foregroundStyle(W.ink)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button(role: .destructive) {
                    discarding = true
                } label: {
                    Text(W.tr("Zahodit", "Discard")).watchFont(15, .semibold).foregroundStyle(W.red)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(W.red)
            }
        }
    }

    // MARK: The rest

    /// Watch concept 06, points 6 to 8: the countdown big in the middle, the
    /// next set under it, the time and heart rate, then −15 s, Start set 3 and
    /// +15 s in one row; below, how the set went in words. Always-On: only the countdown.
    private func rest(until end: Date) -> some View {
        let left = max(0, end.timeIntervalSince(now))
        let gym = store.gym
        let lift = gym.flatMap { currentLift(in: $0) }
        let e = lift.flatMap { lift in gym?.exercises.first { $0.lifts.contains { $0.row == lift.row } } }
        let size: CGFloat = W.small ? 76 : 88
        return ScrollView {
            VStack(spacing: 6) {
                ZStack {
                    Circle().stroke(W.track, lineWidth: 6)
                    Circle().trim(from: 0, to: restTotal > 0 ? left / restTotal : 0)
                        .stroke(dimmed ? W.muted : W.amber, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 1), value: left)
                    VStack(spacing: 0) {
                        Text(GymText.elapsed(left.rounded(.up))).font(W.serif(size * 0.34)).foregroundStyle(dimmed ? W.muted : W.num)
                            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                        Text(W.tr("pauza", "rest")).watchFont(12).foregroundStyle(W.muted)
                    }
                }
                .frame(width: size, height: size)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(W.tr("Pauza", "Rest"))
                .accessibilityValue(W.tr("zbývá ", "") + W.spoken(seconds: left.rounded(.up)) + W.tr("", " left"))
                if !dimmed { restDetails(gym, lift, e) }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// Under the countdown: the next set, the time and heart rate, the row of buttons and the rating.
    @ViewBuilder private func restDetails(_ gym: WatchGym?, _ lift: WatchGym.Lift?, _ e: WatchGym.Exercise?) -> some View {
        if let gym, let lift, let e {
            Text(nextLine(lift, in: e, gym))
                .watchFont(13, .medium).foregroundStyle(W.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2).minimumScaleFactor(0.7)
            // The plates to put on while resting, as the iPhone's loader has them.
            if let bar = e.bar, e.pounds != true, let kg = lift.kg, let plates = GymText.plates(kg, bar: bar) {
                Text(plates).watchFont(12, .semibold).foregroundStyle(W.amber)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        liveLine
        HStack(spacing: 4) {
            Button { shift(-15) } label: { Text("−15 s").frame(height: 30) }
                .buttonStyle(.bordered)
                .fixedSize()
            Button {
                restEnd = nil
            } label: {
                Text(startLabel(lift, in: e)).foregroundStyle(.black)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
                    .frame(height: 30)
            }
            .mainButton()
            .doubleTap()
            Button { shift(15) } label: { Text("+15 s").frame(height: 30) }
                .buttonStyle(.bordered)
                .fixedSize()
        }
        .watchFont(12, .semibold)
        .lineLimit(1)
        if rated != nil {
            Text(W.tr("Jak šla série?", "How was the set?")).watchFont(12, .medium).foregroundStyle(W.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 5), GridItem(.flexible(), spacing: 5)], spacing: 5) {
                ForEach(Self.ratings, id: \.letter) { rating in
                    ratingButton(rating)
                }
            }
        }
    }

    /// "Next, set 3 of 4, 60 kg × 8".
    private func nextLine(_ lift: WatchGym.Lift, in e: WatchGym.Exercise, _ gym: WatchGym) -> String {
        let set = label(lift, in: e)
        // A bodyweight set or one without a weight: its reps alone, never "0 kg × 0".
        let weight: String? = if let kg = lift.kg, kg > 0 {
            GymText.weight(kg, machineLb: e.pounds == true) + (lift.reps.map { " × \($0)" } ?? "")
        } else {
            lift.reps.map { "\($0) " + Self.repsUnit(nil) }
        }
        let sameExercise = gym.exercises.indices.contains(exercise) && gym.exercises[exercise].name == e.name
        var what: String = e.title
        if sameExercise { what = set.prefix(1).lowercased() + String(set.dropFirst()) }
        return W.tr("Další, ", "Next, ") + what + (weight.map { ", " + $0 } ?? "")
    }

    /// "Start set 3", or "Start" before a warm-up or a drop set.
    private func startLabel(_ lift: WatchGym.Lift?, in e: WatchGym.Exercise?) -> String {
        guard let lift, let e, lift.work, !lift.drop else { return W.tr("Začít", "Start") }
        let numbers = e.lifts.filter(\.work).map(\.number).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        let at = (numbers.firstIndex(of: lift.number) ?? 0) + 1
        return W.tr("Začít sérii \(at)", "Start set \(at)")
    }

    private struct Rating {
        let letter: String
        let cs: String
        let en: String
        let color: Color
    }

    /// The letters of the iPhone's sheet (GymIntensity): Easy, Medium, Hard, Failure.
    private static let ratings = [
        // The letter's colour, as on the set's pill and the iPhone (watch audit B6).
        Rating(letter: "E", cs: "Snadná", en: "Easy", color: GymText.intensityColor("E")),
        Rating(letter: "M", cs: "Střední", en: "Medium", color: GymText.intensityColor("M")),
        Rating(letter: "H", cs: "Těžká", en: "Hard", color: GymText.intensityColor("H")),
        Rating(letter: "F", cs: "Selhání", en: "Failure", color: GymText.intensityColor("F"))
    ]

    private func ratingButton(_ rating: Rating) -> some View {
        let on = rated?.letter == rating.letter
        let shape = RoundedRectangle(cornerRadius: 14)
        return Button {
            rate(rating.letter)
        } label: {
            Text(W.tr(rating.cs, rating.en))
                .watchFont(14, .semibold)
                .foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(on ? W.green.opacity(0.16) : Color.white.opacity(0.09), in: shape)
                .overlay { shape.stroke(on ? W.green : .clear, lineWidth: 2) }
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// A tap rates the set, another letter changes it. The weight of the next
    /// set stays as planned: no step up or down without an approved method
    /// (watch review 2026-11-25), and the iPhone's sheet keeps the same.
    private func rate(_ letter: String) {
        guard var current = rated, current.letter != letter else { return }
        current.letter = letter
        rated = current
        WKInterfaceDevice.current().play(.click)
        store.rate(row: current.row, letter: letter)
    }

    /// The rest to Training mode on the iPhone, unless it came from there.
    private func sendRest(_ end: Date?) {
        guard let gym = store.gym else { return }
        let rest = WatchGym.Rest(date: gym.date, end: end, total: Int(restTotal.rounded()),
                                 exercise: gym.exercises.indices.contains(exercise) ? gym.exercises[exercise].name : nil)
        guard !rest.same(store.phoneRest) else { return }
        store.phoneRest = nil
        store.sendRest(rest)
    }

    private func shift(_ seconds: Double) {
        guard let end = restEnd else { return }
        let next = end.addingTimeInterval(seconds)
        restTotal = max(1, restTotal + seconds)
        restEnd = next > Date() ? next : nil
    }

    private func finish() { end(onPhone: false, at: idleStop) }

    /// Keep training on a summary reached by End workout with sets left: back
    /// to the sets (out of the pause), the workout never ended.
    private func keepTraining() {
        idleStop = nil
        summary = false
        if workout.pausedAt != nil { workout.resume() }
    }

    /// Finished here (the summary) or in Training mode on the iPhone; finished
    /// here, the iPhone hears of it. `at`: an idle workout's end at its last
    /// set; `keepOpen`: the screen says it was saved until Done.
    private func end(onPhone: Bool, at end: Date? = nil, keepOpen: Bool = false) {
        let save = (store.gym?.setsDone ?? 0) > 0
        if !onPhone { store.finished(at: end ?? Date()) }
        Task {
            await workout.finish(save: save, at: end)
            // After the end here, so the iPhone's answer (gymEnd) finds nothing running.
            if !onPhone { workout.endOnPhone() }
            guard !keepOpen else { return }
            store.openedFromPhone = false
            dismiss()
        }
    }

    // MARK: Empty workout and discarding (mockups "jen hodinky" 6 and 8)

    /// An empty workout (no plan today): its first exercise, from the catalog.
    private var emptyWorkout: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(W.tr("Prázdný trénink", "Empty workout")).watchFont(16, .semibold).foregroundStyle(W.ink)
                Text(W.tr("Přidej první cvik.", "Add your first exercise.")).watchFont(12).foregroundStyle(W.muted)
                NavigationLink {
                    GymOptionsView(title: W.tr("Přidat cvik", "Add exercise"), exercise: nil) { option in
                        store.change(.addExercise, exercise: 0, option: option)
                    }
                } label: {
                    Label(W.tr("Přidat cvik", "Add exercise"), systemImage: "plus")
                        .watchFont(15, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .mainButton()
                .disabled(store.changing)
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Mockup 8: what goes, Discard (nothing to Apple Health) or Keep training.
    private var discardQuestion: some View {
        let sets = store.gym?.setsDone ?? 0
        return ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                Text(W.tr("Zahodit trénink?", "Discard workout?")).watchFont(16, .semibold).foregroundStyle(W.ink)
                Text(sets > 0
                     ? W.tr("Dnešní hotové série (\(sets)) se smažou a do Zdraví nic nepůjde.", "The \(sets) sets done today are deleted and nothing goes to Apple Health.")
                     : W.tr("Trénink zmizí z dneška a do Zdraví nic nepůjde.", "The workout leaves today and nothing goes to Apple Health."))
                    .watchFont(12).foregroundStyle(W.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button(role: .destructive) {
                    discard()
                } label: {
                    Text(W.tr("Zahodit", "Discard")).watchFont(15, .semibold).foregroundStyle(W.red)
                        .frame(maxWidth: .infinity)
                }
                .endButton()
                .padding(.top, 8)
                Button {
                    discarding = false
                } label: {
                    Text(W.tr("Pokračovat v tréninku", "Keep training")).watchFont(15, .semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The workout ends without a workout in Apple Health and leaves the day
    /// here, on the iPhone (its Training mode closes) and on the server.
    private func discard() {
        restEnd = nil
        run.close()
        WKInterfaceDevice.current().play(.click)
        store.discard()
        Task {
            await workout.finish(save: false)
            store.openedFromPhone = false
            dismiss()
        }
    }

    // MARK: Left running (mockup baterie 1 and 2)

    /// No set for 10 min: End workout goes to the summary, Keep going waits 10 min more.
    private var stillWorking: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                Text(W.tr("Posilovna", "Gym") + ", \(Int(workout.elapsed / 60)) min")
                    .watchFont(12, .semibold).foregroundStyle(W.amber).textCase(.uppercase)
                Text(W.tr("Pořád cvičíš?", "Still working out?")).font(W.serif(24)).foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(W.tr("Žádná série 10 minut.", "No set for 10 min.")).watchFont(13).foregroundStyle(W.muted)
                Button {
                    idleStop = workout.lastWork
                    workout.dismissAsk()
                    summary = true
                } label: {
                    Text(W.tr("Ukončit trénink", "End workout")).watchFont(15, .semibold).foregroundStyle(W.red)
                        .frame(maxWidth: .infinity)
                }
                .endButton()
                .padding(.top, 8)
                Button {
                    workout.worked()
                } label: {
                    Text(W.tr("Ještě cvičím", "Keep going")).watchFont(15, .semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Ended by itself: saved with its end at the last set; Done closes it.
    private func saved(_ s: AutoSaved) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                Text(W.tr("Trénink uložen", "Workout saved"))
                    .watchFont(12, .semibold).foregroundStyle(W.green).textCase(.uppercase)
                Text(W.tr("Posilovna", "Gym") + ", \(s.minutes) min").font(W.serif(24)).foregroundStyle(W.ink)
                Text(W.tr("Konec při poslední sérii, ", "Ended at your last set, ") + W.dateFormatter("H:mm", posix: true).string(from: s.end) + ".")
                    .watchFont(13).foregroundStyle(W.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    savedTile(W.tr("Série", "Sets"), "\(s.sets)")
                    savedTile("kcal", W.number(s.calories))
                }
                .padding(.top, 4)
                Button {
                    autoSaved = nil
                    store.openedFromPhone = false
                    dismiss()
                } label: {
                    Text(W.tr("Hotovo", "Done")).watchFont(15, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .mainButton()
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func savedTile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).watchFont(12).foregroundStyle(W.muted)
            Text(value).font(W.digits(20)).foregroundStyle(W.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
    }
}

/// ≡: the parts of the day in order (mockup "části"): the cardio, warm-up and
/// stretching with their switches among the exercises; a tap runs a part or
/// jumps to an exercise, swipe an exercise for Swap and Remove, touch and hold
/// to drag either to another place. A part goes before or after the exercises.
struct GymExerciseList: View {
    @ObservedObject private var store = GymStore.shared
    let current: Int
    /// The part on the session's screen.
    let running: GymDayPart?
    let pick: (Int) -> Void
    /// The exercise on the screen after a move, at its new place.
    let moved: (Int) -> Void
    let openPart: (GymDayPart) -> Void
    let end: () -> Void
    let discard: () -> Void
    @State private var swap: Int?

    /// One line of the list: a part, or an exercise by its key.
    private enum Line: Hashable {
        case part(GymDayPart)
        case exercise(String)

        var isExercises: Bool {
            switch self {
            case .exercise, .part(.exercises): return true
            default: return false
            }
        }
    }

    /// The day's parts in order with the exercises in the place of Cviky
    /// (that word itself only while there are none).
    private func lines(_ gym: WatchGym) -> [Line] {
        guard let day = store.sheetDay, let parts = store.dayParts else { return gym.exercises.map { .exercise($0.key) } }
        return parts.visible(day).flatMap { part -> [Line] in
            guard part == .exercises else { return [.part(part)] }
            return gym.exercises.isEmpty ? [.part(.exercises)] : gym.exercises.map { .exercise($0.key) }
        }
    }

    var body: some View {
        List {
            if let gym = store.gym {
                Section {
                    // By the line, not its place: a removed or moved exercise takes its swipe along.
                    ForEach(lines(gym), id: \.self) { line in
                        switch line {
                        case .part(let part):
                            if part == .exercises {
                                Text(W.tr("Cviky", "Exercises")).watchFont(14).foregroundStyle(W.secondary)
                            } else {
                                partLine(part)
                            }
                        case .exercise(let key):
                            if let index = gym.exercises.firstIndex(where: { $0.key == key }) {
                                exerciseLine(gym.exercises[index], index)
                            }
                        }
                    }
                    .onMove { from, to in move(gym, from: from, to: to) }
                    if let parts = store.dayParts, let off = [GymDayPart.cardioEnd, .cardioStart].first(where: { !parts.isOn($0) }) {
                        Button {
                            var next = parts
                            next.off.removeAll { $0 == off }
                            store.setParts(next)
                        } label: {
                            Label(W.tr("Přidat kardio", "Add cardio"), systemImage: "plus").foregroundStyle(W.amber)
                        }
                    }
                    NavigationLink {
                        GymOptionsView(title: W.tr("Přidat cvik", "Add exercise"), exercise: nil) { option in
                            store.change(.addExercise, exercise: max(0, gym.exercises.count - 1), option: option)
                        }
                    } label: {
                        Label(W.tr("Přidat cvik", "Add exercise"), systemImage: "plus").foregroundStyle(W.green)
                    }
                } header: {
                    Text(W.tr("Cviky", "Exercises"))
                } footer: {
                    Text(W.tr("Potáhni cvik doprava: série navíc nebo méně. Doleva: vyměnit nebo odebrat. Podrž a přetáhni: jiné pořadí.", "Swipe an exercise right for one set more or fewer, left to swap or remove it. Touch and hold to drag it to another place."))
                }
            }
            // The coach, here since the pause took its corner in the rest (watch audit B4); it knows the workout is on.
            NavigationLink { CoachView(view: "gym") } label: {
                Label(W.tr("Kouč", "Coach"), systemImage: "bubble.left.and.text.bubble.right")
            }
            Button(role: .destructive) { end() } label: {
                Text(W.tr("Ukončit trénink", "End workout"))
            }
            // Last in the list, asked again before anything goes (mockup "jen hodinky" 8).
            Button(role: .destructive) { discard() } label: {
                Text(W.tr("Zahodit trénink", "Discard workout")).foregroundStyle(W.red)
            }
        }
        .navigationDestination(item: $swap) { index in
            if let e = store.gym?.exercises[safe: index] {
                GymOptionsView(title: W.tr("Vyměnit cvik", "Swap exercise"), exercise: e.name) { option in
                    store.change(.swap, exercise: index, option: option)
                }
            }
        }
    }

    private func exerciseLine(_ e: WatchGym.Exercise, _ index: Int) -> some View {
        Button { pick(index) } label: {
            HStack {
                // A superset's exercises under their letter, as on the iPhone.
                if let letter = e.superset, store.gym?.superset(of: index) != nil {
                    Text(letter).watchFont(12, .bold).foregroundStyle(W.amber)
                }
                Text(e.title).foregroundStyle(index == current && running == nil ? W.amber : W.ink).lineLimit(2)
                Spacer(minLength: 4)
                let work = e.lifts.filter(\.work)
                Text("\(work.filter(\.done).count)/\(work.count)").foregroundStyle(W.secondary)
                let seconds = GymWorkout.shared.seconds(of: GymWorkout.exerciseKey(e))
                if seconds > 0 { Text(GymText.elapsed(Double(seconds))).foregroundStyle(W.ink).monospacedDigit() }
            }
            .watchFont(14)
        }
        // One set more or fewer, here since − and + left the set screen (watch concept 06).
        .swipeActions(edge: .leading) {
            Button {
                store.change(.addSet, exercise: index)
            } label: {
                Label(W.tr("O sérii víc", "One set more"), systemImage: "plus")
            }
            .tint(W.green)
            Button {
                store.change(.removeSet, exercise: index)
            } label: {
                Label(W.tr("O sérii méně", "One set fewer"), systemImage: "minus")
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                store.change(.removeExercise, exercise: index)
            } label: {
                Label(W.tr("Odebrat", "Remove"), systemImage: "trash")
            }
            Button {
                swap = index
            } label: {
                Label(W.tr("Vyměnit", "Swap"), systemImage: "arrow.triangle.2.circlepath")
            }
            .tint(W.indigo)
        }
    }

    /// A part with its switch: off, it is passed over and stays in the list;
    /// a tap runs it (again, when done).
    @ViewBuilder private func partLine(_ part: GymDayPart) -> some View {
        if let parts = store.dayParts, let day = store.sheetDay {
            let on = parts.isOn(part)
            let done = store.partFinished(part)
            HStack(spacing: 6) {
                Button { openPart(part) } label: {
                    HStack(spacing: 4) {
                        if done { Image(systemName: "checkmark").watchFont(12, .bold).foregroundStyle(W.green) }
                        VStack(alignment: .leading, spacing: 0) {
                            Text(GymPartView.name(part)).watchFont(14)
                                .foregroundStyle(part == running ? W.amber : (on && !done ? W.ink : W.muted)).lineLimit(1)
                            Text(subtitle(part, parts: parts, day: day)).watchFont(12).foregroundStyle(on ? W.secondary : W.dim)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // Its time once it ran; the switch only before that.
                let seconds = GymWorkout.shared.seconds(of: part.rawValue)
                if seconds > 0 {
                    Text(GymText.elapsed(Double(seconds))).watchFont(13).monospacedDigit().foregroundStyle(W.ink)
                } else {
                    Toggle("", isOn: Binding(get: { on }, set: { value in
                        var next = parts
                        next.off.removeAll { $0 == part }
                        if !value { next.off.append(part) }
                        store.setParts(next)
                    }))
                    .labelsHidden()
                    .tint(W.green)
                    .fixedSize()
                    .accessibilityLabel(GymPartView.name(part))
                }
            }
        }
    }

    /// "Bike, no limit", "5 moves", "6 min".
    private func subtitle(_ part: GymDayPart, parts: GymDayParts, day: GymDay) -> String {
        if part.isCardio {
            let choice = parts.choice(part)
            return GymPartView.machine(choice.type) + ", " + (choice.minutes > 0 ? "\(choice.minutes) min" : W.tr("bez limitu", "no limit"))
        }
        let routine = parts.moves(part, day: day)
        if part == .warmup {
            let count = routine?.items.count ?? 0
            return W.english ? "\(count) move" + (count == 1 ? "" : "s") : "\(count) " + (count == 1 ? "cvik" : count < 5 ? "cviky" : "cviků")
        }
        return "\(routine?.minutes ?? 0) min"
    }

    /// A part dragged goes before the exercises, or after them when dropped
    /// anywhere below the first; an exercise moves among the exercises.
    private func move(_ gym: WatchGym, from: IndexSet, to: Int) {
        guard let source = from.first else { return }
        var list = lines(gym)
        let line = list[source]
        list.move(fromOffsets: from, toOffset: to)
        switch line {
        case .part(let part) where part != .exercises:
            guard var parts = store.dayParts, let first = list.firstIndex(where: { $0 != line && $0.isExercises }) else { return }
            var before: [GymDayPart] = [], after: [GymDayPart] = []
            for (i, l) in list.enumerated() {
                guard case .part(let p) = l, p != .exercises else { continue }
                if i < first { before.append(p) } else { after.append(p) }
            }
            let shown = before + [.exercises] + after
            parts.order = shown + parts.order.filter { !shown.contains($0) }
            store.setParts(parts)
        case .exercise(let key):
            guard let was = gym.exercises.firstIndex(where: { $0.key == key }) else { return }
            let keys = list.compactMap { l -> String? in if case .exercise(let k) = l { return k } else { return nil } }
            guard let place = keys.firstIndex(of: key), place != was else { return }
            var order = Array(gym.exercises.indices)
            let offset = place > was ? place + 1 : place
            order.move(fromOffsets: IndexSet(integer: was), toOffset: offset)
            if let at = order.firstIndex(of: current) { moved(at) }
            store.change(.move, exercise: was, to: offset)
        default:
            return
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

extension WatchGym.Exercise {
    /// Who the exercise is in the list: its name and its first row, unique in the sheet.
    var key: String { name + "#" + String(lifts.first?.row ?? -1) }
}

/// Exercises from the iPhone to swap in (similar to the one swapped) or to
/// add; Search takes a name said or written on the watch. A swap shows the
/// three kept with the day's plan at once ("Saved for offline") until the
/// iPhone or the server answers, and keeps them when neither does.
struct GymOptionsView: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let exercise: String?
    let chosen: (WatchGym.Option) -> Void
    @State private var options: [WatchGym.Option] = []
    /// The swaps kept with the day's plan, shown until a fresher list comes.
    @State private var kept: [WatchGym.Option] = []
    @State private var loading = true
    @State private var query = ""
    /// The newest load: an older one that answers late changes nothing.
    @State private var asked = 0

    private var saved: Bool { !kept.isEmpty && options == kept }

    var body: some View {
        List {
            TextField(W.tr("Hledat", "Search"), text: $query)
                .onSubmit { Task { await load() } }
            if loading && options.isEmpty {
                ProgressView().frame(maxWidth: .infinity)
            } else if options.isEmpty {
                Text(W.tr("Nic jsem nenašel. Měj iPhone u sebe.", "Nothing found. Keep your iPhone close."))
                    .watchFont(13).foregroundStyle(W.secondary)
            }
            if saved, !options.isEmpty {
                Text(W.tr("Uloženo pro offline", "Saved for offline"))
                    .watchFont(12).foregroundStyle(W.secondary)
                    .listRowBackground(Color.clear)
            }
            ForEach(options) { option in
                Button {
                    chosen(option)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(option.shown).watchFont(14).foregroundStyle(W.ink).lineLimit(2)
                        if let line = line(option) {
                            Text(line).watchFont(12).foregroundStyle(W.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(title)
        .task { await load() }
    }

    private func line(_ o: WatchGym.Option) -> String? {
        var parts: [String] = []
        if let sets = o.sets { parts.append("\(sets) × " + (o.reps ?? "–")) }
        if let kg = o.kg, kg > 0 { parts.append(GymText.weight(kg)) }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    private func load() async {
        asked += 1
        let mine = asked
        loading = true
        kept = query.isEmpty ? exercise.map { GymStore.shared.savedSwaps(for: $0) } ?? [] : []
        options = kept
        let found = await GymStore.shared.options(exercise: exercise, query: query.isEmpty ? nil : query)
        guard mine == asked else { return }
        // Neither the iPhone nor the server answered: the kept ones stay.
        if !found.isEmpty || kept.isEmpty { options = found }
        loading = false
    }
}

/// The end (mockup 19 P4): calories, heart rate, sets, volume and each exercise, then Finish.
struct GymSummary: View {
    @ObservedObject private var store = GymStore.shared

    /// The summary's exercises with a set done, one row each.
    @ViewBuilder private var exerciseRows: some View {
        if let gym = store.gym {
            let done: [(title: String, line: String)] = gym.exercises.compactMap { e in
                let lifts = e.lifts.filter { $0.done && $0.work }
                return lifts.isEmpty ? nil : (e.title, Self.summaryLine(lifts))
            }
            Divider()
            ForEach(done.indices, id: \.self) { index in
                HStack {
                    Text(done[index].title).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(done[index].line)
                        .foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
                }
                .watchFont(12)
            }
        }
    }

    /// An exercise in the summary: "3 sets, best 100 kg × 6"; both sides of a
    /// set count once, and the best set is the heaviest, its own reps with it.
    static func summaryLine(_ done: [WatchGym.Lift]) -> String {
        let sets = Set(done.map(\.number)).count
        let setsText = W.tr("\(sets) \((1...4).contains(sets) ? "série" : "sérií")", "\(sets) \(sets == 1 ? "set" : "sets")")
        guard let best = done.max(by: { ($0.kg ?? 0, $0.reps ?? 0) < ($1.kg ?? 0, $1.reps ?? 0) }) else { return setsText }
        let set: String? = if let kg = best.kg, kg > 0 {
            GymText.weight(kg) + (best.reps.map { " × \($0)" } ?? "")
        } else {
            best.reps.map { "\($0) " + GymSessionView.repsUnit(nil) }
        }
        return setsText + (set.map { W.tr(", nejlépe ", ", best ") + $0 } ?? "")
    }

    @ObservedObject private var workout = GymWorkout.shared
    let finish: () -> Void
    /// Back to the sets: only while some are left (End workout came early).
    var keepTraining: (() -> Void)? = nil

    /// Each part and exercise with its time, calories and heart rate, in the day's order.
    @ViewBuilder private var partRows: some View {
        let stats = workout.partStats()
        let rows = lines.filter { (stats[$0.key]?.seconds ?? 0) > 0 }
        if !rows.isEmpty {
            Divider()
            ForEach(rows, id: \.key) { row in
                let part = stats[row.key] ?? GymWorkout.PartStats()
                HStack(spacing: 4) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(row.name).watchFont(13, .semibold).foregroundStyle(W.ink).lineLimit(1)
                        Text(W.number(part.kcal) + " kcal" + (part.heartRate.map { ", " + W.number($0) + " bpm" } ?? ""))
                            .watchFont(12).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 4)
                    Text(GymText.elapsed(Double(part.seconds))).watchFont(13, .semibold).monospacedDigit().foregroundStyle(W.ink)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private struct Line {
        let key: String
        let name: String
    }

    /// The parts before the exercises, the exercises, the parts after them.
    private var lines: [Line] {
        let exercises = (store.gym?.exercises ?? []).map { Line(key: GymWorkout.exerciseKey($0), name: $0.title) }
        guard let day = store.sheetDay, let parts = store.dayParts else { return exercises }
        return parts.visible(day).flatMap { part -> [Line] in
            part == .exercises ? exercises : [Line(key: part.rawValue, name: GymPartView.name(part))]
        }
    }
    /// How the plan suited, sent with Finish (the iPhone's rating after a workout).
    @State private var rating: String?
    /// Rate exercises: a thumb for each exercise done, as on the iPhone's summary.
    @State private var rateOpen = false

    /// The iPhone's scale (PlanFitPicker): Sedělo, Ujde, Nesedělo.
    private struct Fit: Identifiable {
        let id: String
        let symbol: String
        let cs: String
        let en: String
    }

    private static let fits = [
        Fit(id: "good", symbol: "👍", cs: "Sedělo", en: "Suited me"),
        Fit(id: "ok", symbol: "😐", cs: "Ujde", en: "It's OK"),
        Fit(id: "bad", symbol: "👎", cs: "Nesedělo", en: "Didn't suit me")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                // Watch audit B4: the time is the main number, what is left under it.
                VStack(alignment: .leading, spacing: 0) {
                    Label(W.tr("Posilovna", "Gym"), systemImage: "dumbbell.fill")
                        .watchFont(12, .semibold).foregroundStyle(W.amber)
                    Text("\(Int(workout.elapsed / 60)) min").font(W.serif(34)).foregroundStyle(W.ink)
                    if setsLeft > 0 {
                        Text(leftText)
                            .watchFont(12).foregroundStyle(W.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                // New records first (mockup "jen hodinky" 7, Training mode's Nový rekord).
                ForEach(store.gym?.newRecords ?? []) { record in
                    HStack(spacing: 6) {
                        Text("PR").watchFont(12, .bold).foregroundStyle(Color(hex: 0xE8C25A))
                        Text(record.title + " " + GymText.lift(record.set)).watchFont(12, .semibold).foregroundStyle(W.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                    .background(W.tile, in: RoundedRectangle(cornerRadius: 9))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(W.tr("Nový rekord: ", "New record: ") + record.title + " " + GymText.lift(record.set))
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 2), spacing: 6) {
                    stat(W.tr("Série", "Sets"), "\(store.gym?.setsDone ?? 0)")
                    stat(W.tr("Objem", "Volume"), GymText.volume(store.gym?.volume ?? 0))
                    stat(W.tr("Kalorie", "Calories"), W.number(workout.calories))
                    stat(W.tr("Tep ø", "Avg HR"), workout.averageHeartRate.map { W.number($0) } ?? "–")
                }
                partRows
                exerciseRows
                if (store.gym?.setsDone ?? 0) > 0 {
                    Text(W.tr("Jak ti trénink sedl?", "How was it?")).watchFont(12, .semibold).foregroundStyle(W.muted).padding(.top, 6)
                    HStack(spacing: 4) {
                        ForEach(Self.fits) { fit in
                            let on = rating == fit.id
                            Button {
                                rating = on ? nil : fit.id
                                WKInterfaceDevice.current().play(.click)
                            } label: {
                                Text(fit.symbol).watchFont(18)
                                    .frame(maxWidth: .infinity, minHeight: 34)
                                    .background(on ? W.amber : W.tile, in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(W.tr(fit.cs, fit.en))
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                    if let fit = Self.fits.first(where: { $0.id == rating }) {
                        Text(W.tr(fit.cs, fit.en)).watchFont(12, .semibold).foregroundStyle(W.amber)
                            .frame(maxWidth: .infinity)
                    }
                    Button { rateOpen = true } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "hand.thumbsup").foregroundStyle(W.muted)
                            Text(W.tr("Ohodnotit cviky", "Rate exercises")).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.8)
                            Spacer(minLength: 2)
                            Image(systemName: "chevron.right").watchFont(12, .semibold).foregroundStyle(W.muted)
                        }
                        .watchFont(13, .medium)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
                Button {
                    if let rating, let date = store.gym?.date { store.rateWorkout(rating, date: date) }
                    finish()
                } label: {
                    Text(W.tr("Dokončit", "Finish")).watchFont(16, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .mainButton()
                .padding(.top, 4)
                if let keepTraining, setsLeft > 0 {
                    Button(action: keepTraining) {
                        Text(W.tr("Cvičit dál", "Keep training")).watchFont(15, .semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .navigationDestination(isPresented: $rateOpen) {
            GymRateExercises(exercises: (store.gym?.exercises ?? []).filter { $0.lifts.contains { $0.done && $0.work } })
        }
    }

    private var setsLeft: Int { store.gym?.setsLeft ?? 0 }

    /// "4 sets left" / "Zbývají 4 série".
    private var leftText: String {
        let n = setsLeft
        if W.english { return n == 1 ? "1 set left" : "\(n) sets left" }
        return n == 1 ? "Zbývá 1 série" : n < 5 ? "Zbývají \(n) série" : "Zbývá \(n) sérií"
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).watchFont(16, .semibold).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(title).watchFont(12).foregroundStyle(W.secondary)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 9))
        .accessibilityElement(children: .combine)
    }
}

/// Rate exercises from the summary: a thumb up or down for each exercise
/// done, saved at once (POST /app/api/feedback/exercise); the next plans
/// leave out the disliked ones.
struct GymRateExercises: View {
    let exercises: [WatchGym.Exercise]
    @State private var liked: [String: Bool] = [:]
    @State private var failed = false

    var body: some View {
        List {
            ForEach(exercises, id: \.name) { e in
                HStack(spacing: 4) {
                    Text(e.title).watchFont(13, .medium).foregroundStyle(W.ink).lineLimit(2)
                    Spacer(minLength: 2)
                    thumb(e.name, up: true)
                    thumb(e.name, up: false)
                }
            }
            Text(failed ? W.tr("Bez připojení se neuložilo.", "Not saved: no connection.")
                        : W.tr("Uloží se hned. Cviky s palcem dolů v dalších plánech nebudou.", "Saved right away. Disliked exercises stay out of your next plans."))
                .watchFont(12).foregroundStyle(W.muted)
                .listRowBackground(Color.clear)
        }
        .navigationTitle(W.tr("Cviky", "Exercises"))
    }

    private func thumb(_ name: String, up: Bool) -> some View {
        let on = liked[name] == up
        let tint: Color = up ? W.green : W.red
        return Button {
            let before = liked[name]
            let value: Bool? = on ? nil : up
            liked[name] = value
            failed = false
            WKInterfaceDevice.current().play(.click)
            Task {
                guard await WatchAPI.rateExercise(name, liked: value) else {
                    liked[name] = before
                    failed = true
                    return
                }
            }
        } label: {
            Image(systemName: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .watchFont(14, .semibold)
                .foregroundStyle(on ? tint : W.muted)
                .frame(width: 32, height: 30)
                .background(on ? tint.opacity(0.22) : W.tile, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel((up ? W.tr("Baví mě", "I like it") : W.tr("Nebaví mě", "I don't like it")) + ", " + name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Mockup "u cviku" 5, a tap on the exercise's name: the best set before
/// today, the technique's steps (GET /app/api/gym/technique, kept on the
/// watch) and my note on the exercise (Moje poznámka on the iPhone).
struct GymExerciseInfo: View {
    let exercise: WatchGym.Exercise
    /// Swap for another exercise (GymOptionsView), while it has sets to do.
    var swap: ((WatchGym.Option) -> Void)? = nil
    @State private var steps: [String]?
    @State private var loading = true
    /// The thumb, saved at once; a failed save puts it back.
    @State private var liked: Bool?
    @State private var failed = false
    @State private var swapping = false

    private var canSwap: Bool { swap != nil && exercise.lifts.contains { !$0.done } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.title).watchFont(15, .semibold).foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let record = exercise.record {
                    Text(W.tr("Rekord ", "Record ") + GymText.lift(record))
                        .watchFont(12, .semibold).foregroundStyle(W.amber)
                }
                taste
                // An exercise outside the catalog has no steps: no heading either.
                if loading || steps != [] {
                    heading(W.tr("TECHNIKA", "TECHNIQUE"))
                }
                if loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let steps {
                    if !steps.isEmpty {
                        Text(steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))
                            .watchFont(12).foregroundStyle(W.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    Text(W.tr("Bez připojení se technika nenačetla.", "No connection to load the technique."))
                        .watchFont(12).foregroundStyle(W.muted)
                }
                if let note = exercise.note {
                    heading(W.tr("MOJE POZNÁMKA", "MY NOTE"))
                    Text(note).watchFont(12, .medium).foregroundStyle(W.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task {
            async let thumb = WatchAPI.exerciseLiked(exercise.name)
            steps = await GymStore.shared.technique(exercise.name)
            loading = false
            liked = await thumb
        }
        .navigationDestination(isPresented: $swapping) {
            GymOptionsView(title: W.tr("Vyměnit cvik", "Swap exercise"), exercise: exercise.name) { option in swap?(option) }
        }
    }

    /// 👍, 👎 and Swap under the name; after 👎, Swap stands out.
    private var taste: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                thumb(up: true)
                thumb(up: false)
                if canSwap {
                    Button { swapping = true } label: {
                        Label(W.tr("Vyměnit", "Swap"), systemImage: "arrow.triangle.2.circlepath")
                            .watchFont(12, .semibold).lineLimit(1).minimumScaleFactor(0.7)
                            .foregroundStyle(liked == false ? Color.black : W.ink)
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(liked == false ? W.ink : W.tile, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            if failed {
                Text(W.tr("Bez připojení se neuložilo.", "Not saved: no connection."))
                    .watchFont(12).foregroundStyle(W.muted)
            } else if liked == false {
                Text(W.tr("V dalších plánech už nebude.", "Won't be in your next plans."))
                    .watchFont(12).foregroundStyle(W.muted)
            }
        }
        .padding(.top, 5)
    }

    private func thumb(up: Bool) -> some View {
        let on = liked == up
        let tint: Color = up ? W.green : W.red
        return Button {
            let before = liked
            let value: Bool? = on ? nil : up
            liked = value
            failed = false
            WKInterfaceDevice.current().play(.click)
            Task {
                guard await WatchAPI.rateExercise(exercise.name, liked: value) else {
                    liked = before
                    failed = true
                    return
                }
            }
        } label: {
            Image(systemName: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .watchFont(15, .semibold)
                .foregroundStyle(on ? tint : W.ink)
                .frame(width: 44, height: 34)
                .background(on ? tint.opacity(0.22) : W.tile, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(up ? W.tr("Baví mě", "I like it") : W.tr("Nebaví mě", "I don't like it"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func heading(_ text: String) -> some View {
        Text(text).watchFont(12, .semibold).foregroundStyle(W.muted).padding(.top, 6)
    }
}
