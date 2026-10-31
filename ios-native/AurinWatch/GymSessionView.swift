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
    /// The set just done, rated during the rest that follows it.
    @State private var rated: Rated?
    @FocusState private var focus: Field?

    private enum Field { case kg, reps }

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
    /// 40, 41 and 42 mm (up to 224 pt high): smaller tiles, so the set with
    /// its time, heart rate and Set done fits without scrolling.
    static let small = WKInterfaceDevice.current().screenBounds.height < 230
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            Group {
                if summary || store.gym?.allDone == true {
                    GymSummary(finish: finish)
                } else if workout.pausedAt != nil {
                    paused
                } else if let end = restEnd, end > now {
                    rest(until: end)
                } else if let gym = store.gym, let lift = currentLift(in: gym) {
                    setScreen(gym, lift)
                } else {
                    ProgressView()
                }
            }
            .toolbar {
                if !summary, workout.pausedAt == nil, restEnd.map({ $0 > now }) != true, store.gym?.allDone != true {
                    // In the cover's own corner: at .topBarLeading the cover's ✕
                    // took its place (and closed the screen with the workout running).
                    ToolbarItem(placement: .cancellationAction) {
                        Button { workout.pause() } label: { Image(systemName: "pause.fill") }
                            .accessibilityLabel(W.tr("Pauza", "Pause"))
                    }
                }
                if !summary, restEnd.map({ $0 > now }) == true {
                    // The coach during the rest: it knows the workout is on.
                    ToolbarItem(placement: .cancellationAction) {
                        Button { coachOpen = true } label: { Image(systemName: "bubble.left.and.text.bubble.right") }
                            .accessibilityLabel(W.tr("Kouč", "Coach"))
                    }
                }
                if !summary, workout.pausedAt == nil, store.gym?.allDone != true {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { list = true } label: { Image(systemName: "line.3.horizontal") }
                            .accessibilityLabel(W.tr("Cviky", "Exercises"))
                    }
                }
            }
            .sheet(isPresented: $list) {
                NavigationStack {
                    GymExerciseList(current: exercise) { picked in
                        exercise = picked
                        restEnd = nil
                        list = false
                    } moved: { current in
                        exercise = current
                    } end: {
                        list = false
                        summary = true
                    }
                }
            }
            .sheet(isPresented: $coachOpen) {
                NavigationStack { CoachView(view: "gym") }
            }
            .alert(W.tr("iPhone je mimo dosah", "iPhone out of reach"), isPresented: $store.failedChange) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(W.tr("Změnu plánu udělá iPhone. Měj ho u sebe a zkus to znovu.", "Your iPhone makes plan changes. Keep it close and try again."))
            }
        }
        .task {
            if let current = store.gym?.current { exercise = current.exercise }
            await workout.begin()
        }
        .onChange(of: store.endedOnPhone) { _, ended in
            // Finished in Training mode on the iPhone: saved here, as one workout.
            guard ended else { return }
            store.endedOnPhone = false
            end(onPhone: true)
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

    /// The set on the screen: the first not done of the chosen exercise, else the next one with sets left.
    private func currentLift(in gym: WatchGym) -> WatchGym.Lift? {
        if gym.exercises.indices.contains(exercise), let lift = gym.exercises[exercise].lifts.first(where: { !$0.done }) {
            return lift
        }
        return gym.current?.lift
    }

    // MARK: The set

    private func setScreen(_ gym: WatchGym, _ lift: WatchGym.Lift) -> some View {
        let e = gym.exercises.firstIndex { $0.lifts.contains { $0.row == lift.row } } ?? exercise
        let ex = gym.exercises[e]
        return ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(ex.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                // − set 2/4 +: one set fewer or one more of this exercise (mockup 20).
                HStack(spacing: 4) {
                    roundButton("minus") { store.change(.removeSet, exercise: e) }
                        .accessibilityLabel(W.tr("O sérii méně", "One set fewer"))
                    // The set, and under it the time and heart rate: no extra row,
                    // so Set done stays on the screen down to the 41 mm watch.
                    VStack(spacing: 0) {
                        Text(label(lift, in: ex)).font(.system(size: 12, weight: .medium)).foregroundStyle(W.secondary)
                        liveLine
                    }
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
                    roundButton("plus") { store.change(.addSet, exercise: e) }
                        .accessibilityLabel(W.tr("O sérii víc", "One set more"))
                }
                .disabled(store.changing)
                HStack(spacing: 6) {
                    // Detents: the value moves only by whole steps (0.5 kg or 1 lb, one rep),
                    // never through the in-between values the plain rotation shows.
                    // `kg` holds the weight as shown, in pounds with imperial units.
                    tile(GymText.kg(kg), unit: W.weightUnit, field: .kg, value: $kg, step: W.weightStep, top: W.imperial ? 1100 : 500)
                        .digitalCrownRotation(detent: $kg, from: 0, through: W.imperial ? 1100 : 500, by: W.weightStep, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
                    tile("\(Int(reps))", unit: W.tr("opak.", "reps"), field: .reps, value: $reps, step: 1, top: 100)
                        .digitalCrownRotation(detent: $reps, from: 0, through: 100, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                }
                Button {
                    done(lift, in: gym)
                } label: {
                    Text(W.tr("Série hotová", "Set done"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.ink)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 5), GridItem(.flexible(), spacing: 5)], spacing: 5) {
                    // The time runs on its own, without drawing the whole set again each second.
                    timeCell
                    cell(W.tr("Tep", "Heart"), workout.heartRate.map { W.number($0) } ?? "–", "bpm", W.pink)
                    cell(W.tr("Objem", "Volume"), GymText.volume(gym.volume), nil, W.indigo)
                    cell(W.tr("Kalorie", "Calories"), W.number(workout.calories), "kcal", W.amber)
                }
            }
        }
        // The crown starts on the weight, also when the tiles come back after a rest.
        .defaultFocus($focus, .kg)
        .onAppear { load(lift) }
        .onChange(of: lift.row) { _, _ in load(lift) }
    }

    /// "série 2/4", "rozcvička", "drop", with the side of a one-sided set.
    private func label(_ lift: WatchGym.Lift, in e: WatchGym.Exercise) -> String {
        var text: String
        if lift.warmup {
            text = W.tr("rozcvička", "warm-up")
        } else if lift.drop {
            text = "drop"
        } else {
            let numbers = e.lifts.filter(\.work).map(\.number).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
            let at = (numbers.firstIndex(of: lift.number) ?? 0) + 1
            text = W.tr("série", "set") + " \(at)/\(numbers.count)"
        }
        if let side = lift.side { text += " · " + (side == "L" ? "L" : W.tr("P", "R")) }
        return text
    }

    private func roundButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 12, weight: .bold)).foregroundStyle(W.ink)
                .frame(width: 28, height: 28)
                .background(W.tile, in: Circle())
        }
        .buttonStyle(.plain)
    }

    private func tile(_ value: String, unit: String, field: Field, value number: Binding<Double>, step: Double, top: Double) -> some View {
        let on = focus == field
        return VStack(spacing: 0) {
            Text(value).font(W.serif(Self.small ? 28 : 34)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).font(.system(size: 10)).foregroundStyle(W.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Self.small ? 2 : 4)
        .background(on ? W.green.opacity(0.18) : W.tile, in: RoundedRectangle(cornerRadius: 12))
        .overlay { RoundedRectangle(cornerRadius: 12).stroke(on ? W.green : .clear, lineWidth: 2) }
        .focusable(true)
        .focused($focus, equals: field)
        .focusEffectDisabled()
        .onTapGesture { focus = field }
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
    /// set and the rest already have (no row of its own on a small screen).
    private var liveLine: some View {
        HStack(spacing: 5) {
            clock.foregroundStyle(W.ink)
            HStack(spacing: 2) {
                Image(systemName: "heart.fill").font(.system(size: 9))
                Text(workout.heartRate.map { W.number($0) } ?? "–")
            }
            .foregroundStyle(W.pink)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(W.tr("Tep", "Heart rate"))
        }
        .font(.system(size: 12, weight: .semibold).monospacedDigit())
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

    private var timeCell: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(W.tr("Čas", "Time")).font(.system(size: 10)).foregroundStyle(W.secondary)
            clock
            .font(.system(size: 17, weight: .semibold).monospacedDigit()).foregroundStyle(W.ink)
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
    }

    private func cell(_ title: String, _ value: String, _ unit: String?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.system(size: 10)).foregroundStyle(W.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value).font(.system(size: 17, weight: .semibold)).foregroundStyle(color)
                if let unit, value != "–" { Text(unit).font(.system(size: 9)).foregroundStyle(W.secondary) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
    }

    private func load(_ lift: WatchGym.Lift) {
        guard row != lift.row else { return }
        row = lift.row
        kg = W.weight(lift.kg ?? 0)
        reps = Double(lift.reps ?? 8)
        if focus == nil { focus = .kg }
    }

    private func done(_ lift: WatchGym.Lift, in gym: WatchGym) {
        let next = gym.next(after: lift.row)
        store.complete(row: lift.row, kg: W.kg(kg), reps: Int(reps))
        rated = lift.work ? Rated(row: lift.row, kg: W.kg(kg), before: lift.intensity, sameExercise: next.map { !$0.newExercise } ?? false) : nil
        WKInterfaceDevice.current().play(.success)
        guard let next else {
            summary = true
            return
        }
        exercise = next.exercise
        // No rest before a drop set or the other side of the same set.
        let otherSide = !next.newExercise && next.lift.number == lift.number && next.lift.side != nil && next.lift.side != lift.side
        let seconds = next.newExercise ? gym.restExercises : (next.lift.drop || otherSide ? 0 : lift.rest)
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
                Text(W.tr("POZASTAVENO", "PAUSED")).font(.system(size: 12, weight: .semibold)).foregroundStyle(W.amber)
                Text(GymText.elapsed(workout.elapsed)).font(W.serif(40)).foregroundStyle(W.muted).monospacedDigit()
                if let gym = store.gym, let lift = currentLift(in: gym),
                   let e = gym.exercises.first(where: { $0.lifts.contains { $0.row == lift.row } }) {
                    Text(e.title + " · " + label(lift, in: e)).font(.system(size: 11)).foregroundStyle(W.muted)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                Button {
                    workout.resume()
                } label: {
                    Label(W.tr("Pokračovat", "Resume"), systemImage: "play.fill")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.green)
                .padding(.top, 6)
                Button(role: .destructive) {
                    summary = true
                } label: {
                    Text(W.tr("Ukončit trénink", "End workout")).font(.system(size: 13, weight: .semibold))
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
                            Text(W.tr("Další · ", "Next · ") + e.title).font(.system(size: 10)).foregroundStyle(W.secondary)
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Text(GymText.weight(lift.kg ?? 0) + " × \(lift.reps ?? 0)").font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
                            liveLine
                            if let hint = hint {
                                Text(hint.text).font(.system(size: 10, weight: .semibold)).foregroundStyle(hint.color)
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
                .font(.system(size: 12, weight: .semibold))
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
                .font(.system(size: 14, weight: .semibold))
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

    private func shift(_ seconds: Double) {
        guard let end = restEnd else { return }
        let next = end.addingTimeInterval(seconds)
        restTotal = max(1, restTotal + seconds)
        restEnd = next > Date() ? next : nil
    }

    private func finish() { end(onPhone: false) }

    /// Finished here (the summary) or in Training mode on the iPhone; finished
    /// here, the iPhone hears of it.
    private func end(onPhone: Bool) {
        let save = (store.gym?.setsDone ?? 0) > 0
        Task {
            await workout.finish(save: save)
            // After the end here, so the iPhone's answer (gymEnd) finds nothing running.
            if !onPhone { workout.endOnPhone() }
            store.openedFromPhone = false
            dismiss()
        }
    }
}

/// ≡: the exercises with their sets, one to jump to; swipe for Swap and
/// Remove, Add exercise at the end, and the end of the workout.
struct GymExerciseList: View {
    @ObservedObject private var store = GymStore.shared
    let current: Int
    let pick: (Int) -> Void
    /// The exercise on the screen after a move, at its new place.
    let moved: (Int) -> Void
    let end: () -> Void
    @State private var swap: Int?

    var body: some View {
        List {
            if let gym = store.gym {
                Section {
                    // By the exercise, not its place: a removed or moved one takes its swipe along.
                    ForEach(Array(gym.exercises.enumerated()), id: \.element.key) { index, e in
                        Button { pick(index) } label: {
                            HStack {
                                Text(e.title).foregroundStyle(index == current ? W.amber : W.ink).lineLimit(2)
                                Spacer(minLength: 4)
                                let work = e.lifts.filter(\.work)
                                Text("\(work.filter(\.done).count)/\(work.count)").foregroundStyle(W.secondary)
                            }
                            .font(.system(size: 14))
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
                    .onMove { from, to in
                        guard let source = from.first, store.gym != nil else { return }
                        var order = Array(gym.exercises.indices)
                        order.move(fromOffsets: from, toOffset: to)
                        if let place = order.firstIndex(of: current) { moved(place) }
                        store.change(.move, exercise: source, to: to)
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
        }
        .navigationDestination(item: $swap) { index in
            if let e = store.gym?.exercises[safe: index] {
                GymOptionsView(title: W.tr("Vyměnit cvik", "Swap exercise"), exercise: e.name) { option in
                    store.change(.swap, exercise: index, option: option)
                }
            }
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
/// add; Search takes a name said or written on the watch.
struct GymOptionsView: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let exercise: String?
    let chosen: (WatchGym.Option) -> Void
    @State private var options: [WatchGym.Option] = []
    @State private var loading = true
    @State private var query = ""

    var body: some View {
        List {
            TextField(W.tr("Hledat", "Search"), text: $query)
                .onSubmit { Task { await load() } }
            if loading {
                ProgressView().frame(maxWidth: .infinity)
            } else if options.isEmpty {
                Text(W.tr("Nic jsem nenašel. Měj iPhone u sebe.", "Nothing found. Keep your iPhone close."))
                    .font(.system(size: 13)).foregroundStyle(W.secondary)
            }
            ForEach(options) { option in
                Button {
                    chosen(option)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(option.shown).font(.system(size: 14)).foregroundStyle(W.ink).lineLimit(2)
                        if let line = line(option) {
                            Text(line).font(.system(size: 11)).foregroundStyle(W.secondary)
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
        loading = true
        options = await GymStore.shared.options(exercise: exercise, query: query.isEmpty ? nil : query)
        loading = false
    }
}

/// The end (mockup 19 P4): calories, heart rate, sets, volume and each exercise, then Finish.
struct GymSummary: View {
    @ObservedObject private var store = GymStore.shared
    @ObservedObject private var workout = GymWorkout.shared
    let finish: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(W.tr("Hotovo", "Done")).font(.system(size: 12, weight: .semibold)).foregroundStyle(W.amber)
                HStack(spacing: 5) {
                    Image(systemName: "dumbbell.fill").foregroundStyle(W.amber)
                    Text(W.tr("Posilovna", "Gym") + (workout.start != nil ? " · \(Int(workout.elapsed / 60)) min" : ""))
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
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
                        .font(.system(size: 12))
                    }
                }
                Button(action: finish) {
                    Text(W.tr("Dokončit", "Finish")).font(.system(size: 16, weight: .semibold)).foregroundStyle(.black)
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
            Text(title).font(.system(size: 10)).foregroundStyle(W.secondary)
            Text(value).font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}
