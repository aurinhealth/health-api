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
    @State private var reps: Double = 8
    @State private var row: Int?
    @State private var restEnd: Date?
    @State private var restTotal: Double = 90
    @State private var now = Date()
    @State private var list = false
    @State private var summary = false
    @State private var coachOpen = false
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

    private enum Field { case kg, reps }

    struct Info: Identifiable {
        let exercise: WatchGym.Exercise
        var id: String { exercise.name }
    }

    struct Rated {
        let row: Int
        /// Its weight, in kg: the next set starts from it.
        let kg: Double
        /// The letter it had before the tap, sent back when the tap is taken back.
        let before: String?
        /// The next set is of the same exercise: its weight follows the letter.
        let sameExercise: Bool
        var letter: String?
    }
    /// How the set screen is sized: the largest of these whose set, Set done
    /// and Time and Heart fit the height under the top bar on this watch.
    enum Fit {
        /// 45, 46 and 49 mm with room to spare.
        case roomy
        /// Smaller rows.
        case compact
        /// Smaller rows, with the time and heart rate in the set's row instead of tiles of their own.
        case tight

        var small: Bool { self != .roomy }
        /// Set done: lower only as far as the screen needs.
        var button: CGFloat { self == .roomy ? 38 : self == .compact ? 34 : 30 }
    }
    /// Room left under the set screen above the screen's bottom edge, where its
    /// corners round off: the Time and Heart tiles stay whole.
    private static let bottomClear: CGFloat = 20
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
                    GymSummary(finish: finish)
                } else if workout.pausedAt != nil {
                    paused
                } else if let part = shownPart, let day = store.sheetDay, let parts = store.dayParts {
                    GymPartView(run: run, part: part, parts: parts, day: day) {
                        if store.gym?.allDone == true, nextAfter == nil { summary = true }
                    }
                    .id(part)
                } else if store.gym?.allDone == true {
                    GymSummary(finish: finish)
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
                if autoSaved == nil, !discarding, !workout.askStill, !summary, workout.pausedAt == nil, restEnd.map({ $0 > now }) != true, store.gym?.allDone != true || shownPart != nil {
                    // In the cover's own corner: at .topBarLeading the cover's ✕
                    // took its place (and closed the screen with the workout running).
                    ToolbarItem(placement: .cancellationAction) {
                        Button { workout.pause() } label: { Image(systemName: "pause.fill") }
                            .accessibilityLabel(W.tr("Pauza", "Pause"))
                    }
                }
                if !summary, !discarding, restEnd.map({ $0 > now }) == true {
                    // The coach during the rest: it knows the workout is on.
                    ToolbarItem(placement: .cancellationAction) {
                        Button { coachOpen = true } label: { Image(systemName: "bubble.left.and.text.bubble.right") }
                            .accessibilityLabel(W.tr("Kouč", "Coach"))
                    }
                }
                if autoSaved == nil, !discarding, !summary, workout.pausedAt == nil, store.gym?.allDone != true || shownPart != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { list = true } label: { Image(systemName: "line.3.horizontal") }
                            .accessibilityLabel(W.tr("Cviky", "Exercises"))
                    }
                }
            }
            .sheet(isPresented: $list) {
                NavigationStack {
                    GymExerciseList(current: exercise, running: shownPart) { picked in
                        exercise = picked
                        restEnd = nil
                        skipBefore = true
                        run.close()
                        list = false
                    } moved: { current in
                        exercise = current
                    } openPart: { part in
                        store.reopenPart(part)
                        restEnd = nil
                        run.open(part, minutes: store.dayParts?.choice(part).minutes ?? 0)
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
            .sheet(isPresented: $coachOpen) {
                NavigationStack { CoachView(view: "gym") }
            }
            .sheet(item: $info) { info in
                GymExerciseInfo(exercise: info.exercise)
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
                    rated = Rated(row: 8, kg: 80, before: nil, sameExercise: true, letter: "M")
                }
                return
            }
            await workout.begin()
        }
        .onChange(of: store.endedOnPhone) { _, ended in
            // Finished in Training mode on the iPhone: saved here, as one workout.
            guard ended else { return }
            store.endedOnPhone = false
            end(onPhone: true)
        }
        // A set, a change or a pause here or on the iPhone: "Still working out?"
        // waits another 10 min (GymWorkout.worked).
        .onChange(of: store.gym) { _, _ in workout.worked() }
        .onChange(of: exercise) { _, _ in workout.worked() }
        .onChange(of: kg) { _, _ in workout.worked() }
        .onChange(of: reps) { _, _ in workout.worked() }
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
            run.open(part, minutes: store.dayParts?.choice(part).minutes ?? 0)
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
        // The height under the top bar (the clock, pause and ≡) differs by watch
        // and by watchOS: measured here, not guessed from the screen size.
        // Measured down to the screen's own bottom edge: the safe area's bottom
        // inset left a third of the screen unused and always chose .tight.
        return GeometryReader { space in
            ScrollView {
                VStack(alignment: .leading, spacing: 5) {
                    // The set, Set done and Time and Heart without scrolling, in the
                    // largest size that fits; Volume and Calories below.
                    ViewThatFits(in: .vertical) {
                        setStack(gym, lift, ex, e, .roomy)
                        setStack(gym, lift, ex, e, .compact)
                        setStack(gym, lift, ex, e, .tight)
                    }
                    // Short of the bottom edge, where the screen's corners round off.
                    .frame(height: max(0, space.size.height - Self.bottomClear), alignment: .top)
                    // Not in the sample day's screenshot, where their tops would show cut off.
                    if !WatchDemo.on {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 5), GridItem(.flexible(), spacing: 5)], spacing: 5) {
                            cell(W.tr("Objem", "Volume"), GymText.volume(gym.volume), nil, W.indigo, small: false)
                            cell(W.tr("Kalorie", "Calories"), W.number(workout.calories), "kcal", W.amber, small: false)
                        }
                    }
                }
                // The end of the list clear of the corners when scrolled down.
                .padding(.bottom, Self.bottomClear)
            }
            .ignoresSafeArea(.container, edges: .bottom)
        }
        .ignoresSafeArea(.container, edges: .bottom)
        // The crown starts on the weight, also when the tiles come back after a rest.
        .defaultFocus($crown, true)
        .onAppear { load(lift) }
        .onChange(of: lift.row) { _, _ in load(lift) }
        // The weight and reps the same on the iPhone at once, both ways.
        .onChange(of: kg) { _, _ in sendDraft(gym) }
        .onChange(of: reps) { _, _ in sendDraft(gym) }
        .onChange(of: store.phoneDraft) { _, draft in
            guard let draft, draft.date == gym.date, draft.row == row else { return }
            let shown = W.weight(draft.kg)
            if abs(shown - kg) >= 0.05 { kg = shown }
            if Double(draft.reps) != reps { reps = Double(draft.reps) }
        }
    }

    private func setStack(_ gym: WatchGym, _ lift: WatchGym.Lift, _ ex: WatchGym.Exercise, _ e: Int, _ fit: Fit) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            if let line = supersetLine(gym, lift, e) {
                Text(line).watchFont(12, .semibold).foregroundStyle(W.amber)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            // A tap on the name: its technique, the record and my note (mockup "u cviku" 5).
            Button {
                info = Info(exercise: ex)
            } label: {
                Text(ex.title).watchFont(fit.small ? 14 : 16, .semibold).foregroundStyle(W.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(W.tr("Technika a poznámka", "Technique and note"))
            // "Last time 97.5 × 6 · aim: hard" (mockup "u cviku" 4); the tightest
            // fit keeps it only without the superset's line above.
            if let line = GymText.info(lift), fit != .tight || supersetLine(gym, lift, e) == nil {
                Text(line).watchFont(12).foregroundStyle(W.muted)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            // − set 2/4 +: one set fewer or one more of this exercise (mockup 20).
            HStack(spacing: 4) {
                roundButton("minus", small: fit.small) { store.change(.removeSet, exercise: e) }
                    .accessibilityLabel(W.tr("O sérii méně", "One set fewer"))
                VStack(spacing: 0) {
                    HStack(spacing: 4) {
                        Text(label(lift, in: ex, superset: gym.superset(of: e) != nil, side: false))
                            .watchFont(12, .medium).foregroundStyle(W.secondary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        if lift.side != nil { sides(lift, in: gym, e) }
                        if lift.work, let letter = lift.intensity { GymText.intensityPill(letter) }
                    }
                    if fit == .tight { liveLine }
                }
                .frame(maxWidth: .infinity)
                roundButton("plus", small: fit.small) { store.change(.addSet, exercise: e) }
                    .accessibilityLabel(W.tr("O sérii víc", "One set more"))
            }
            .disabled(store.changing)
            // One crown for both tiles, turning the one tapped last. A focusable
            // tile each (build 380) left the reps out of reach: a tap never
            // moved the crown off the weight.
            // Detents: the value moves only by whole steps (0.5 kg or 1 lb, one rep),
            // never through the in-between values the plain rotation shows.
            // `kg` holds the weight as shown, in pounds with imperial units.
            HStack(spacing: 6) {
                tile(GymText.kg(kg), unit: W.weightUnit, field: .kg, value: $kg, step: W.weightStep, top: Self.topKg, small: fit.small)
                tile("\(Int(reps))", unit: Self.repsUnit(lift.plannedReps), field: .reps, value: $reps, step: 1, top: 100, small: fit.small)
            }
            .focusable(true)
            .focused($crown)
            .focusEffectDisabled()
            .digitalCrownRotation(detent: crownValue, from: 0, through: selected == .kg ? Self.topKg : 100,
                                  by: selected == .kg ? W.weightStep : 1, sensitivity: selected == .kg ? .medium : .low,
                                  isContinuous: false, isHapticFeedbackEnabled: true)
            Button {
                done(lift, in: gym)
            } label: {
                // Lower than the system's prominent button, which left no room for the tiles.
                Text(W.tr("Série hotová", "Set done"))
                    .watchFont(15, .semibold)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: fit.button)
                    .background(W.ink, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            if fit != .tight {
                HStack(spacing: 5) {
                    // The time runs on its own, without drawing the whole set again each second.
                    timeCell(small: fit.small)
                    heartCell(small: fit.small)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Mockup "supersérie": "SUPERSET A · 1/2 · then Seated row", or after the
    /// round's last exercise the rest that follows it; nil outside a superset.
    private func supersetLine(_ gym: WatchGym, _ lift: WatchGym.Lift, _ e: Int) -> String? {
        guard !lift.warmup, let group = gym.superset(of: e), let letter = gym.exercises[e].superset,
              let at = group.firstIndex(of: e) else { return nil }
        var text = W.tr("SUPERSÉRIE", "SUPERSET") + " \(letter) · \(at + 1)/\(group.count)"
        if let next = gym.next(after: lift.row), next.exercise != e || next.turn != nil {
            switch next.turn {
            case .partner?: text += W.tr(" · pak ", " · then ") + gym.exercises[next.exercise].title
            case .round?: text += W.tr(" · pak pauza \(lift.rest) s", " · rest \(lift.rest) s after")
            case nil: text += W.tr(" · pak pauza \(gym.restExercises) s", " · rest \(gym.restExercises) s after")
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
        .contentShape(Capsule())
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
            text = W.tr("rozcvička", "warm-up")
        } else if lift.drop {
            text = "drop"
        } else {
            let numbers = e.lifts.filter(\.work).map(\.number).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
            let at = (numbers.firstIndex(of: lift.number) ?? 0) + 1
            text = (superset ? W.tr("kolo", "round") : W.tr("série", "set")) + " \(at)/\(numbers.count)"
        }
        if side, let side = lift.side { text += " · " + (side == "L" ? "L" : W.tr("P", "R")) }
        return text
    }

    private func roundButton(_ symbol: String, small: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).watchFont(12, .bold).foregroundStyle(W.ink)
                .frame(width: small ? 24 : 26, height: small ? 24 : 26)
                .background(W.tile, in: Circle())
        }
        .buttonStyle(.plain)
    }

    private static var topKg: Double { W.imperial ? 1100 : 500 }

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

    private func tile(_ value: String, unit: String, field: Field, value number: Binding<Double>, step: Double, top: Double, small: Bool) -> some View {
        let on = selected == field
        return VStack(spacing: 0) {
            Text(value).font(W.serif(small ? 22 : 28)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).watchFont(12).foregroundStyle(W.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, small ? 1 : 2)
        .background(on ? W.green.opacity(0.18) : W.tile, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(on ? W.green : .clear, lineWidth: 2) }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture {
            selected = field
            crown = true
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
            clock.foregroundStyle(W.ink)
            HStack(spacing: 2) {
                Image(systemName: "heart.fill").watchFont(12)
                Text(workout.heartRate.map { W.number($0) } ?? "–")
            }
            .foregroundStyle(W.pink)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(W.tr("Tep", "Heart rate"))
        }
        .watchFont(12, .semibold).monospacedDigit()
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

    private func timeCell(small: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(W.tr("Čas", "Time")).watchFont(12).foregroundStyle(W.secondary)
            clock
            .watchFont(small ? 15 : 17, .semibold).monospacedDigit().foregroundStyle(W.ink)
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, small ? 2 : 3)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
    }

    /// The heart rate, or what to allow when Apple Health keeps the workout from running.
    @ViewBuilder private func heartCell(small: Bool) -> some View {
        if workout.noHealth, workout.heartRate == nil {
            VStack(alignment: .leading, spacing: 0) {
                Text(W.tr("Tep", "Heart")).watchFont(12).foregroundStyle(W.secondary)
                Text(W.tr("Povol ve Zdraví", "Allow in Health")).watchFont(12, .semibold).foregroundStyle(W.pink)
                    .lineLimit(2).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 7)
            .padding(.vertical, small ? 2 : 3)
            .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
            .accessibilityElement(children: .combine)
            .accessibilityHint(W.tr("Na hodinkách: Nastavení, Soukromí a zabezpečení, Zdraví, Aurin.", "On the watch: Settings, Privacy & Security, Health, Aurin."))
        } else {
            cell(W.tr("Tep", "Heart"), workout.heartRate.map { W.number($0) } ?? "–", "bpm", W.pink, small: small)
        }
    }

    private func cell(_ title: String, _ value: String, _ unit: String?, _ color: Color, small: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).watchFont(12).foregroundStyle(W.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value).watchFont(small ? 15 : 17, .semibold).foregroundStyle(color)
                if let unit, value != "–" { Text(unit).watchFont(12).foregroundStyle(W.secondary) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, small ? 2 : 3)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
    }

    /// The set at hand as it is now, to the iPhone; not what came from it.
    private func sendDraft(_ gym: WatchGym) {
        guard let row else { return }
        store.sendDraft(WatchGym.Draft(date: gym.date, row: row, kg: W.kg(kg), reps: Int(reps)))
    }

    private func load(_ lift: WatchGym.Lift) {
        guard row != lift.row else { return }
        row = lift.row
        kg = W.weight(lift.kg ?? 0)
        reps = Double(lift.reps ?? 8)
        // Each new set starts on the weight.
        selected = .kg
        crown = true
    }

    private func done(_ lift: WatchGym.Lift, in gym: WatchGym) {
        let next = gym.next(after: lift.row)
        picked = nil
        store.complete(row: lift.row, kg: W.kg(kg), reps: Int(reps))
        rated = lift.work ? Rated(row: lift.row, kg: W.kg(kg), before: lift.intensity, sameExercise: next.map { !$0.newExercise } ?? false) : nil
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
        case nil: seconds = next.newExercise ? gym.restExercises : (next.lift.drop || otherSide ? 0 : lift.rest)
        }
        if seconds > 0 {
            restTotal = Double(seconds)
            restEnd = Date().addingTimeInterval(Double(seconds))
            now = Date()
        }
    }

    // MARK: The pause

    /// Mockup 7: the time stands still; Resume goes on, End workout to the summary.
    private var paused: some View {
        ScrollView {
            VStack(spacing: 4) {
                Text(W.tr("POZASTAVENO", "PAUSED")).watchFont(12, .semibold).foregroundStyle(W.amber)
                Text(GymText.elapsed(workout.elapsed)).font(W.serif(40)).foregroundStyle(W.muted).monospacedDigit()
                if let gym = store.gym, let lift = currentLift(in: gym),
                   let e = gym.exercises.first(where: { $0.lifts.contains { $0.row == lift.row } }) {
                    Text(e.title + " · " + label(lift, in: e)).watchFont(12).foregroundStyle(W.muted)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                Button {
                    workout.resume()
                } label: {
                    Label(W.tr("Pokračovat", "Resume"), systemImage: "play.fill")
                        .watchFont(15, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.green)
                .padding(.top, 6)
                Button(role: .destructive) {
                    summary = true
                } label: {
                    Text(W.tr("Ukončit trénink", "End workout")).watchFont(13, .semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(W.red)
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: The rest

    /// Mockup 8B: a smaller timer beside the next set, how the last set went in
    /// four buttons (none tapped = as planned), then −15 s, Skip and +15 s.
    private func rest(until end: Date) -> some View {
        let left = max(0, end.timeIntervalSince(now))
        let gym = store.gym
        let lift = gym.flatMap { currentLift(in: $0) }
        return ScrollView {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    ZStack {
                        Circle().stroke(W.track, lineWidth: 5)
                        Circle().trim(from: 0, to: restTotal > 0 ? left / restTotal : 0)
                            .stroke(W.amber, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 1), value: left)
                        Text(GymText.elapsed(left.rounded(.up))).font(W.serif(20)).foregroundStyle(W.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(width: 56, height: 56)
                    if let gym, let lift, let e = gym.exercises.first(where: { $0.lifts.contains { $0.row == lift.row } }) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(W.tr("Další · ", "Next · ") + e.title).watchFont(12).foregroundStyle(W.secondary)
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Text(GymText.weight(lift.kg ?? 0) + " × \(lift.reps ?? 0)").watchFont(15, .semibold)
                                .foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
                            liveLine
                            if let hint = hint {
                                Text(hint.text).watchFont(12, .semibold).foregroundStyle(hint.color)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                if rated != nil {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 5), GridItem(.flexible(), spacing: 5)], spacing: 5) {
                        ForEach(Self.ratings, id: \.letter) { rating in
                            ratingButton(rating)
                        }
                    }
                }
                HStack(spacing: 4) {
                    Button("−15 s") { shift(-15) }
                    Button(W.tr("Přeskočit", "Skip")) { restEnd = nil }
                    Button("+15 s") { shift(15) }
                }
                .watchFont(12, .semibold)
                // "Přeskočit" broke into two lines on a 46 mm watch.
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private struct Rating {
        let letter: String
        let cs: String
        let en: String
        let color: Color
    }

    /// The letters of the iPhone's sheet (GymIntensity): Easy, Medium, Hard, Failure.
    private static let ratings = [
        Rating(letter: "E", cs: "Snadná", en: "Easy", color: W.green),
        Rating(letter: "M", cs: "Střední", en: "Medium", color: W.amber),
        Rating(letter: "H", cs: "Těžká", en: "Hard", color: Color(hex: 0xF0907A)),
        Rating(letter: "F", cs: "Selhání", en: "Failure", color: W.red)
    ]

    private func ratingButton(_ rating: Rating) -> some View {
        let on = rated?.letter == rating.letter
        return Button {
            rate(rating.letter)
        } label: {
            Text(W.tr(rating.cs, rating.en))
                .watchFont(14, .semibold)
                .foregroundStyle(on ? .black : rating.color)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(on ? rating.color : Color.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// One 2.5 kg (5 lb) step: up after Easy, down after Failure.
    private static var step: Double { W.imperial ? W.kg(5) : 2.5 }

    /// The weight the next set starts from after the letter, in kg.
    private static func nextKg(_ kg: Double, _ letter: String?) -> Double {
        switch letter {
        case "E": return kg + step
        case "F": return max(0, kg - step)
        default: return kg
        }
    }

    /// Why the next set moved: "+2.5 kg, it was easy".
    private var hint: (text: String, color: Color)? {
        guard rated?.sameExercise == true else { return nil }
        let amount = GymText.weight(Self.step)
        switch rated?.letter {
        case "E": return ("+" + amount + W.tr(", šlo to lehce", ", it was easy"), W.green)
        case "F": return ("−" + amount + W.tr(" po selhání", " after failure"), W.amber)
        default: return nil
        }
    }

    /// A tap rates the set; the same tap again takes it back.
    private func rate(_ letter: String) {
        guard var current = rated else { return }
        current.letter = current.letter == letter ? nil : letter
        rated = current
        WKInterfaceDevice.current().play(.click)
        store.rate(row: current.row, letter: current.letter ?? current.before ?? "M", next: Self.nextKg(current.kg, current.letter))
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
                .buttonStyle(.borderedProminent)
                .tint(W.green)
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
                    Text(W.tr("Zahodit", "Discard")).watchFont(15, .semibold).foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: 0xE5484D))
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
                Text(W.tr("Posilovna", "Gym") + " · \(Int(workout.elapsed / 60)) min")
                    .watchFont(12, .semibold).foregroundStyle(W.amber).textCase(.uppercase)
                Text(W.tr("Pořád cvičíš?", "Still working out?")).font(W.serif(24)).foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(W.tr("Žádná série 10 minut.", "No set for 10 min.")).watchFont(13).foregroundStyle(W.muted)
                Button {
                    idleStop = workout.lastWork
                    workout.dismissAsk()
                    summary = true
                } label: {
                    Text(W.tr("Ukončit trénink", "End workout")).watchFont(15, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.ink)
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
                Text(W.tr("Posilovna", "Gym") + " · \(s.minutes) min").font(W.serif(24)).foregroundStyle(W.ink)
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
                .buttonStyle(.borderedProminent)
                .tint(W.ink)
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func savedTile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).watchFont(12).foregroundStyle(W.muted)
            Text(value).font(W.serif(22)).foregroundStyle(W.ink)
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
                    Text(W.tr("Potáhni cvik doleva: vyměnit nebo odebrat. Podrž a přetáhni: jiné pořadí.", "Swipe an exercise left to swap or remove it. Touch and hold to drag it to another place."))
                }
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
            }
            .watchFont(14)
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

    /// "Bike · no limit", "5 moves", "6 min".
    private func subtitle(_ part: GymDayPart, parts: GymDayParts, day: GymDay) -> String {
        if part.isCardio {
            let choice = parts.choice(part)
            return GymPartView.machine(choice.type) + " · " + (choice.minutes > 0 ? "\(choice.minutes) min" : W.tr("bez limitu", "no limit"))
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
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
    @ObservedObject private var workout = GymWorkout.shared
    let finish: () -> Void
    /// How the plan suited, sent with Finish (the iPhone's rating after a workout).
    @State private var rating: String?

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
                Text(W.tr("Hotovo", "Done")).watchFont(12, .semibold).foregroundStyle(W.amber)
                HStack(spacing: 5) {
                    Image(systemName: "dumbbell.fill").foregroundStyle(W.amber)
                    Text(W.tr("Posilovna", "Gym") + (workout.start != nil ? " · \(Int(workout.elapsed / 60)) min" : ""))
                        .watchFont(16, .semibold).foregroundStyle(W.ink)
                }
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
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), alignment: .leading, spacing: 6) {
                    stat(W.tr("Kalorie", "Calories"), W.number(workout.calories))
                    stat(W.tr("Tep ø", "Avg HR"), workout.averageHeartRate.map { W.number($0) } ?? "–")
                    stat("Max", workout.maxHeartRate.map { W.number($0) } ?? "–")
                    stat(W.tr("Série", "Sets"), "\(store.gym?.setsDone ?? 0)")
                    stat(W.tr("Objem", "Volume"), GymText.volume(store.gym?.volume ?? 0))
                }
                if let gym = store.gym {
                    Divider()
                    ForEach(gym.exercises.filter { $0.lifts.contains { $0.done && $0.work } }, id: \.name) { e in
                        let done = e.lifts.filter { $0.done && $0.work }
                        HStack {
                            Text(e.title).lineLimit(1)
                            Spacer(minLength: 4)
                            Text("\(done.count) × \(done.last?.reps ?? 0) · " + GymText.weight(done.map { $0.kg ?? 0 }.max() ?? 0))
                                .foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .watchFont(12)
                    }
                }
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
                }
                Button {
                    if let rating, let date = store.gym?.date { store.rateWorkout(rating, date: date) }
                    finish()
                } label: {
                    Text(W.tr("Dokončit", "Finish")).watchFont(16, .semibold).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.green)
                .padding(.top, 4)
            }
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).watchFont(12).foregroundStyle(W.secondary)
            Text(value).watchFont(16, .semibold).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

/// Mockup "u cviku" 5, a tap on the exercise's name: the best set before
/// today, the technique's steps (GET /app/api/gym/technique, kept on the
/// watch) and my note on the exercise (Moje poznámka on the iPhone).
struct GymExerciseInfo: View {
    let exercise: WatchGym.Exercise
    @State private var steps: [String]?
    @State private var loading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.title).watchFont(15, .semibold).foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let record = exercise.record {
                    Text(W.tr("Rekord ", "Record ") + GymText.lift(record))
                        .watchFont(12, .semibold).foregroundStyle(W.amber)
                }
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
            steps = await GymStore.shared.technique(exercise.name)
            loading = false
        }
    }

    private func heading(_ text: String) -> some View {
        Text(text).watchFont(12, .semibold).foregroundStyle(W.muted).padding(.top, 6)
    }
}
