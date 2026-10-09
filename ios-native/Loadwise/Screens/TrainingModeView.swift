import SwiftUI
import UIKit

/// Režim tréninku: one exercise and one set at a time, big enough to use
/// between sets. "Hotovo" records the set (the planned weight and reps unless
/// changed) and starts the rest timer; after the last set comes the next
/// exercise. The screen stays on meanwhile.
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
    @State private var restSeconds = 90
    @State private var restEnd: Date?
    @State private var muscles: [String: [String: Double]] = [:]
    @State private var technique: String?
    @State private var saving = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            VStack(alignment: .leading, spacing: 0) {
                header
                if loading && day == nil {
                    Spacer()
                    ProgressView().frame(maxWidth: .infinity)
                    Spacer()
                } else if let day, !day.exercises.isEmpty {
                    if let exercise = current(day) {
                        session(day, exercise)
                    } else {
                        finished(day)
                    }
                } else {
                    empty
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true; model.immersive = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false; model.immersive = false }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
    }

    private var header: some View {
        HStack {
            CircleButton(systemImage: "xmark", label: "Ukončit režim tréninku") { dismiss() }
            Spacer()
            if let day {
                let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
                Text("\(done)/\(total) " + Fmt.plural(total, "série", "série", "sérií")).font(Typo.small).foregroundStyle(Palette.muted)
            }
        }
    }

    // MARK: The set

    private func session(_ day: GymDay, _ exercise: GymExercise) -> some View {
        let set = nextSet(exercise)
        return VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Cvik \(index + 1) z \(day.exercises.count)" + (exercise.superset.map { " · supersérie " + $0 } ?? ""))
                .padding(.top, 18)
            HStack(alignment: .firstTextBaseline) {
                Text(exercise.name).font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button { technique = exercise.name } label: { Image(systemName: "info.circle").font(.system(size: 20)) }
                    .foregroundStyle(Palette.muted)
                    .accessibilityLabel("Technika")
            }
            .padding(.top, 6)

            if let map = muscles[exercise.name], !map.isEmpty {
                BodyMap(load: map, height: 130).padding(.top, 10)
            }

            HStack(spacing: 6) {
                ForEach(exercise.sets.filter { !$0.warmup }) { s in
                    Capsule().fill(s.done ? Palette.green : s.row == set?.row ? Palette.amberBar : Palette.track).frame(height: 6)
                }
            }
            .padding(.top, 16)

            Spacer(minLength: 12)

            if let restEnd {
                rest(until: restEnd)
            } else if let set {
                VStack(spacing: 14) {
                    Text((set.warmup ? "Rozcvičovací série" : "Série \(set.number)") + plan(set))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    HStack(spacing: 12) {
                        stepper("kg", $kg, step: 2.5)
                        stepper("opakování", $reps, step: 1)
                    }
                    HStack(spacing: 6) {
                        Text("RPE").font(Typo.caption).foregroundStyle(Palette.muted)
                        ForEach(6...10, id: \.self) { value in
                            Button { rpe = value } label: {
                                Text("\(value)").font(Typo.number(18))
                                    .foregroundStyle(rpe == value ? Palette.onButton : Palette.ink)
                                    .frame(maxWidth: .infinity).frame(height: 36)
                                    .background(rpe == value ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    PrimaryButton(title: saving ? "Ukládám…" : "Série hotová", systemImage: "checkmark", busy: saving) {
                        Task { await complete(set) }
                    }
                    .disabled(saving)
                }
                .frame(maxWidth: .infinity)
            }

            Spacer(minLength: 12)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
            HStack {
                Button { move(-1) } label: { Label("Předchozí", systemImage: "chevron.left") }
                    .disabled(index == 0)
                Spacer()
                Button { move(1) } label: { Label("Další cvik", systemImage: "chevron.right").labelStyle(TrailingIcon()) }
                    .disabled(index >= day.exercises.count - 1)
            }
            .font(Typo.bodyStrong)
            .foregroundStyle(Palette.ink)
        }
        .onChange(of: set?.row) { _, _ in prefill(set) }
        .onAppear { prefill(set) }
        .task(id: exercise.name) { await loadMuscles(day) }
    }

    private func rest(until end: Date) -> some View {
        VStack(spacing: 12) {
            Text("Pauza").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = max(0, Int(end.timeIntervalSince(context.date).rounded()))
                Text(String(format: "%d:%02d", left / 60, left % 60))
                    .font(Typo.number(96)).foregroundStyle(left == 0 ? Palette.green : Palette.ink)
                    .monospacedDigit()
            }
            HStack(spacing: 10) {
                SecondaryButton(title: "−15 s") { shiftRest(-15) }
                SecondaryButton(title: "+15 s") { shiftRest(15) }
            }
            PrimaryButton(title: "Pokračovat", systemImage: "forward.fill") { restEnd = nil }
        }
        .frame(maxWidth: .infinity)
        .task(id: end) {
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, restEnd == end else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private func finished(_ day: GymDay) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Spacer()
            Image(systemName: "checkmark.seal.fill").font(.system(size: 48)).foregroundStyle(Palette.green)
            Text("Trénink je hotový").font(Typo.sentence(36, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            let sets = day.exercises.reduce(0) { $0 + $1.doneCount }
            Text("\(sets) " + Fmt.plural(sets, "série", "série", "sérií") + " v \(day.exercises.count) " + Fmt.plural(day.exercises.count, "cviku", "cvicích", "cvicích") + ". Série jsou uložené i pro příští plán.")
                .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            BodyMap(load: muscles.values.reduce(into: [String: Double]()) { out, map in for (k, v) in map { out[k] = max(out[k] ?? 0, v) } }, height: 200)
            Spacer()
            PrimaryButton(title: "Zavřít") { dismiss() }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()
            Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                .font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            Text("Sestav si trénink a pak ho tady odcvičíš cvik po cviku.").font(Typo.small).foregroundStyle(Palette.muted)
            NavigationLink(value: AppRoute.gymBuilder) {
                Label("Sestavit s AI", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }

    // MARK: Parts

    private func stepper(_ unit: String, _ text: Binding<String>, step: Double) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                Button { bump(text, -step) } label: { Image(systemName: "minus").frame(width: 40, height: 56) }
                TextField("–", text: text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(Typo.number(40))
                    .frame(maxWidth: .infinity)
                Button { bump(text, step) } label: { Image(systemName: "plus").frame(width: 40, height: 56) }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Palette.ink)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(unit).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    private func bump(_ text: Binding<String>, _ by: Double) {
        let value = Double(text.wrappedValue.replacingOccurrences(of: ",", with: ".")) ?? 0
        let next = max(0, value + by)
        text.wrappedValue = next.rounded() == next ? String(Int(next)) : String(next)
    }

    private func plan(_ set: GymSet) -> String {
        let reps = set.plannedReps.map { " · plán " + $0 } ?? ""
        let kg = set.plannedKg.map { " × " + $0 + " kg" } ?? ""
        return reps + kg
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
        kg = set.kg ?? set.plannedKg ?? ""
        reps = set.reps ?? set.plannedReps.map { String($0.prefix { $0.isNumber }) } ?? ""
    }

    private func move(_ by: Int) {
        guard let count = day?.exercises.count else { return }
        index = min(max(0, index + by), count - 1)
        restEnd = nil
    }

    private func shiftRest(_ seconds: Int) {
        restSeconds = min(max(30, restSeconds + seconds), 300)
        restEnd = restEnd.map { $0.addingTimeInterval(TimeInterval(seconds)) }
    }

    // MARK: Server

    private func load() async {
        if model.demo { day = DemoData.gym; loading = false; startAtFirstOpen(); return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.api.gym(date: date)
            startAtFirstOpen()
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
        guard !model.demo, muscles.isEmpty else { return }
        muscles = (try? await model.api.gymMuscles(names: day.exercises.map(\.name))) ?? [:]
    }

    private func complete(_ set: GymSet) async {
        guard var next = day else { return }
        let k = kg.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        let r = reps.trimmingCharacters(in: .whitespaces)
        next.complete(row: set.row, kg: k.isEmpty ? (set.plannedKg ?? "") : k, reps: r.isEmpty ? (set.plannedReps ?? "") : r, rpe: String(rpe))
        day = next
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        // The last set of the exercise: on to the next one after the rest.
        if let exercise = next.exercises[safe: index], exercise.sets.allSatisfy(\.done), index < next.exercises.count - 1 {
            index += 1
        }
        if next.exercises.contains(where: { $0.sets.contains { !$0.done } }) {
            restEnd = Date().addingTimeInterval(TimeInterval(set.warmup ? 60 : restSeconds))
        }
        guard !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.api.saveGym(next, date: date)
            error = nil
        } catch {
            self.error = "Sérii se nepodařilo uložit: " + error.localizedDescription
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
