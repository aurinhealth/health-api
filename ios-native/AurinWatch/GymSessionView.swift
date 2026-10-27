import SwiftUI
import WatchKit

/// The gym session on the watch (mockups 19 and 20): the set with its weight
/// and reps (tap a tile, turn the crown), Set done, then the rest with −15 s,
/// Skip and +15 s, the list of exercises under ≡ and the summary at the end.
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
    @FocusState private var focus: Field?

    private enum Field { case kg, reps }
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            Group {
                if summary || store.gym?.allDone == true {
                    GymSummary(finish: finish)
                } else if let end = restEnd, end > now {
                    rest(until: end)
                } else if let gym = store.gym, let lift = currentLift(in: gym) {
                    setScreen(gym, lift)
                } else {
                    ProgressView()
                }
            }
            .toolbar {
                if !summary, restEnd.map({ $0 > now }) == true {
                    // The coach during the rest: it knows the workout is on.
                    ToolbarItem(placement: .topBarLeading) {
                        Button { coachOpen = true } label: { Image(systemName: "bubble.left.and.text.bubble.right") }
                            .accessibilityLabel(W.tr("Kouč", "Coach"))
                    }
                }
                if !summary, store.gym?.allDone != true {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { list = true } label: { Image(systemName: "line.3.horizontal") }
                    }
                }
            }
            .sheet(isPresented: $list) {
                NavigationStack {
                    GymExerciseList(current: exercise) { picked in
                        exercise = picked
                        restEnd = nil
                        list = false
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
        .onReceive(tick) { date in
            now = date
            if let end = restEnd, end <= date {
                restEnd = nil
                WKInterfaceDevice.current().play(.stop)
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
                    Text(label(lift, in: ex)).font(.system(size: 12, weight: .medium)).foregroundStyle(W.secondary)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                    roundButton("plus") { store.change(.addSet, exercise: e) }
                }
                .disabled(store.changing)
                HStack(spacing: 6) {
                    tile(GymText.kg(kg), unit: "kg", field: .kg)
                        .digitalCrownRotation($kg, from: 0, through: 500, by: 2.5, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                    tile("\(Int(reps))", unit: W.tr("opak.", "reps"), field: .reps)
                        .digitalCrownRotation($reps, from: 0, through: 100, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
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
                    cell(W.tr("Čas", "Time"), workout.start.map { GymText.elapsed(now.timeIntervalSince($0)) } ?? "0:00", nil, W.ink)
                    cell(W.tr("Tep", "Heart"), workout.heartRate.map { W.number($0) } ?? "–", "bpm", W.pink)
                    cell(W.tr("Objem", "Volume"), GymText.volume(gym.volume), nil, W.indigo)
                    cell(W.tr("Kalorie", "Calories"), W.number(workout.calories), "kcal", W.amber)
                }
            }
        }
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

    private func tile(_ value: String, unit: String, field: Field) -> some View {
        let on = focus == field
        return VStack(spacing: 0) {
            Text(value).font(W.serif(34)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).font(.system(size: 10)).foregroundStyle(W.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(on ? W.green.opacity(0.18) : W.tile, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? W.green : .clear, lineWidth: 2))
        .focusable(true)
        .focused($focus, equals: field)
        .focusEffectDisabled()
        .onTapGesture { focus = field }
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
        kg = lift.kg ?? 0
        reps = Double(lift.reps ?? 8)
        if focus == nil { focus = .kg }
    }

    private func done(_ lift: WatchGym.Lift, in gym: WatchGym) {
        let next = gym.next(after: lift.row)
        store.complete(row: lift.row, kg: kg, reps: Int(reps))
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

    // MARK: The rest

    private func rest(until end: Date) -> some View {
        let left = max(0, end.timeIntervalSince(now))
        return VStack(spacing: 6) {
            ZStack {
                Circle().stroke(W.track, lineWidth: 7)
                Circle().trim(from: 0, to: restTotal > 0 ? left / restTotal : 0)
                    .stroke(W.amber, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 1), value: left)
                Text(GymText.elapsed(left.rounded(.up))).font(W.serif(32)).foregroundStyle(W.ink)
            }
            .frame(width: 92, height: 92)
            if let gym = store.gym, let lift = currentLift(in: gym), let e = gym.exercises.first(where: { $0.lifts.contains { $0.row == lift.row } }) {
                Text(W.tr("Další: ", "Next: ") + e.title + " · " + GymText.kg(lift.kg ?? 0) + " kg × \(lift.reps ?? 0)")
                    .font(.system(size: 11)).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
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

    private func shift(_ seconds: Double) {
        guard let end = restEnd else { return }
        let next = end.addingTimeInterval(seconds)
        restTotal = max(1, restTotal + seconds)
        restEnd = next > Date() ? next : nil
    }

    private func finish() {
        let save = (store.gym?.setsDone ?? 0) > 0
        Task {
            await workout.finish(save: save)
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
    let end: () -> Void
    @State private var swap: Int?

    var body: some View {
        List {
            if let gym = store.gym {
                Section {
                    ForEach(Array(gym.exercises.enumerated()), id: \.offset) { index, e in
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
                    Text(W.tr("Potáhni cvik doleva: vyměnit nebo odebrat.", "Swipe an exercise left to swap or remove it."))
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
        if let kg = o.kg, kg > 0 { parts.append(GymText.kg(kg) + " kg") }
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
                    Text(W.tr("Posilovna", "Gym") + (workout.start.map { " · \(Int(Date().timeIntervalSince($0) / 60)) min" } ?? ""))
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
                            Text("\(done.count) × \(done.last?.reps ?? 0) · " + GymText.kg(done.map { $0.kg ?? 0 }.max() ?? 0) + " kg")
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
