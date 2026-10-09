import SwiftUI

/// Today's gym session: the exercises and their sets. Tick a set to record it
/// (the planned weight and reps unless changed), swap an exercise, see how to
/// do it. Without a plan it builds one for the chosen length.
struct GymSessionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var day: GymDay?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var technique: String?
    @State private var alternativesFor: String?
    @State private var minutes = 60
    @State private var muscles: [String: [String: Double]] = [:]

    private var load: [String: Double] {
        muscles.values.reduce(into: [String: Double]()) { out, map in for (k, v) in map { out[k] = max(out[k] ?? 0, v) } }
    }

    /// The plan note starts with "Zvolené partie: …." the figure shows instead.
    static func withoutMuscleList(_ note: String?) -> String? {
        guard var text = note else { return nil }
        if text.hasPrefix("Zvolené partie:"), let end = text.firstIndex(of: ".") {
            text = String(text[text.index(after: end)...]).trimmingCharacters(in: .whitespaces)
        }
        return text.nilIfBlank
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            content
        }
        .task { await load() }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
        .sheet(item: Binding(get: { alternativesFor.map { Named(name: $0) } }, set: { alternativesFor = $0?.name })) { item in
            AlternativesSheet(date: date, exercise: item.name) { replacement in
                Task { await replace(item.name, with: replacement) }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Posilovna · " + Fmt.relativeDay(date, today: AppModel.localDate(Date()))).padding(.top, 24)
            if loading && day == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else if let day, !day.exercises.isEmpty {
                Text(day.planName ?? "Silový trénink").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 12)
                progress(day)
                if !muscles.isEmpty {
                    Card {
                        WidgetHeader(title: "Co procvičíš", color: Palette.amberBar)
                        BodyMap(load: load, height: 220)
                    }
                    .padding(.top, 16)
                }
                if let note = Self.withoutMuscleList(day.note) {
                    Text(note).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                }
                NavigationLink(value: AppRoute.trainingMode(date)) {
                    Label("Režim tréninku", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 16)
                VStack(spacing: 12) {
                    ForEach(day.exercises) { exercise in
                        ExerciseCard(exercise: exercise,
                                     onSet: { set, kg, reps, rpe in Task { await record(set, kg: kg, reps: reps, rpe: rpe) } },
                                     onUndo: { set in Task { await undo(set) } },
                                     onTechnique: { technique = exercise.name },
                                     onAlternatives: { alternativesFor = exercise.name })
                    }
                }
                .padding(.top, 20)
            } else {
                Text(day?.cancelled == true ? "Dnešní posilovna je zrušená." : "Na tento den není posilovna v plánu.")
                    .font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
                Text("Sestavím ji podle tvé únavy, svalů od posledního tréninku a týdenního plánu. Uloží se i do Intervals.icu.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                Picker("Délka", selection: $minutes) {
                    ForEach([30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.top, 18)
                Button { Task { await generate() } } label: {
                    Text(saving ? "Sestavuji…" : "Sestavit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || model.demo || day?.cancelled == true)
                .padding(.top, 14)
                NavigationLink(value: AppRoute.gymBuilder) {
                    Label("Vybrat partie a sestavit s AI", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
        }
    }

    private func progress(_ day: GymDay) -> some View {
        let done = day.exercises.reduce(0) { $0 + $1.doneCount }, total = day.exercises.reduce(0) { $0 + $1.workCount }
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(done) z \(total) " + Fmt.plural(total, "série", "sérií", "sérií") + " · \(day.exercises.count) " + Fmt.plural(day.exercises.count, "cvik", "cviky", "cviků"))
                .font(Typo.small).foregroundStyle(Palette.muted)
            ProgressLine(fraction: total > 0 ? Double(done) / Double(total) : 0, color: Palette.amberBar, height: 4)
        }
        .padding(.top, 10)
    }

    private func load() async {
        if model.demo { day = DemoData.gym; loading = false; return }
        loading = true
        defer { loading = false }
        do {
            day = try await model.api.gym(date: date)
            if let names = day?.exercises.map(\.name), !names.isEmpty {
                muscles = (try? await model.api.gymMuscles(names: names)) ?? [:]
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let day, !model.demo else { return }
        saving = true
        defer { saving = false }
        do {
            try await model.api.saveGym(day, date: date)
            error = nil
        } catch {
            self.error = "Nepodařilo se uložit: " + error.localizedDescription
        }
    }

    private func record(_ set: GymSet, kg: String, reps: String, rpe: String) async {
        day?.complete(row: set.row, kg: kg, reps: reps, rpe: rpe)
        await save()
    }

    private func undo(_ set: GymSet) async {
        day?.undo(row: set.row)
        await save()
    }

    private func replace(_ exercise: String, with name: String) async {
        day?.replace(exercise: exercise, with: name)
        await save()
        await load()
    }

    private func generate() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.generateGym(date: date, minutes: minutes)
            await load()
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct Named: Identifiable {
    let name: String
    var id: String { name }
}

struct ExerciseCard: View {
    let exercise: GymExercise
    var onSet: (GymSet, String, String, String) -> Void
    var onUndo: (GymSet) -> Void
    var onTechnique: () -> Void
    var onAlternatives: () -> Void

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name).font(.headline).foregroundStyle(Palette.ink)
                    Text("\(exercise.doneCount)/\(exercise.workCount) " + Fmt.plural(exercise.workCount, "série", "série", "sérií") + (exercise.superset.map { " · supersérie " + $0 } ?? ""))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer()
                Menu {
                    Button { onTechnique() } label: { Label("Technika", systemImage: "figure.strengthtraining.traditional") }
                    Button { onAlternatives() } label: { Label("Nahradit cvik", systemImage: "arrow.triangle.swap") }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 16, weight: .semibold)).frame(width: 36, height: 36)
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel("Možnosti cviku")
            }
            VStack(spacing: 6) {
                ForEach(exercise.sets) { set in
                    SetRow(set: set, onDone: { kg, reps, rpe in onSet(set, kg, reps, rpe) }, onUndo: { onUndo(set) })
                }
            }
        }
    }
}

/// One set: planned "8–10 × 60 kg", fields for what was done, and the tick.
struct SetRow: View {
    let set: GymSet
    var onDone: (String, String, String) -> Void
    var onUndo: () -> Void
    @State private var kg = ""
    @State private var reps = ""
    @State private var rpe = ""

    var body: some View {
        HStack(spacing: 8) {
            Text(set.warmup ? "R" : set.number).font(Typo.number(17)).foregroundStyle(set.warmup ? Palette.faint : Palette.muted)
                .frame(width: 22, alignment: .leading)
                .accessibilityLabel(set.warmup ? "Rozcvičovací série" : "Série \(set.number)")
            field($kg, placeholder: set.plannedKg ?? "kg", unit: "kg", width: 64)
            Text("×").foregroundStyle(Palette.faint)
            field($reps, placeholder: set.plannedReps ?? "op.", unit: nil, width: 54)
            field($rpe, placeholder: "RPE", unit: nil, width: 46)
            Spacer(minLength: 4)
            Button {
                if set.done { onUndo() } else { onDone(value(kg, set.plannedKg), value(reps, firstNumber(set.plannedReps)), rpe) }
            } label: {
                Image(systemName: set.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26))
                    .foregroundStyle(set.done ? Palette.green : Palette.faint)
            }
            .accessibilityLabel(set.done ? "Hotovo, klepnutím vrátit" : "Označit sérii jako hotovou")
        }
        .opacity(set.done ? 0.75 : 1)
        .onAppear { fill(set) }
        // The plan reloads after a swap or a save: show what is stored now.
        .onChange(of: set) { _, next in fill(next) }
    }

    private func fill(_ set: GymSet) {
        kg = set.kg ?? ""
        reps = set.reps ?? ""
        rpe = set.rpe ?? ""
    }

    private func field(_ text: Binding<String>, placeholder: String, unit: String?, width: CGFloat) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(Typo.number(18))
            .frame(width: width, height: 34)
            .background(Palette.track, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .disabled(set.done)
    }

    private func value(_ typed: String, _ planned: String?) -> String {
        let t = typed.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? (planned ?? "") : t.replacingOccurrences(of: ",", with: ".")
    }

    /// "8-10" → "10" is too optimistic; the lower end is what was planned for sure.
    private func firstNumber(_ text: String?) -> String? {
        guard let text else { return nil }
        let digits = text.prefix { $0.isNumber }
        return digits.isEmpty ? nil : String(digits)
    }
}

struct TechniqueSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let exercise: String
    @State private var technique: GymTechnique?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(exercise).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                if let t = technique {
                    if let muscles = t.muscles, !muscles.isEmpty {
                        Text(muscles.joined(separator: " · ")).font(Typo.small).foregroundStyle(Palette.muted)
                    }
                    list("Příprava", t.setup)
                    list("Provedení", t.steps)
                    list("Časté chyby", t.mistakes)
                    if let b = t.breathing { list("Dýchání", [b]) }
                    list("Kde to cítit", t.feel)
                    if let id = t.video?.id, let url = URL(string: "https://www.youtube.com/watch?v=" + id) {
                        Link(destination: url) { Label(t.video?.title ?? "Video", systemImage: "play.rectangle.fill").font(Typo.bodyStrong) }
                    } else if let s = t.searchUrl, let url = URL(string: s) {
                        Link(destination: url) { Label("Najít video", systemImage: "play.rectangle").font(Typo.bodyStrong) }
                    }
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    Text("U cviku mimo katalog může první načtení chvíli trvat.").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .task {
            guard !model.demo else { error = "V ukázce se technika nenačítá."; return }
            do { technique = try await model.api.gymTechnique(exercise: exercise) } catch { self.error = error.localizedDescription }
        }
    }

    @ViewBuilder
    private func list(_ title: String, _ items: [String]?) -> some View {
        if let items, !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: title)
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Palette.faint)
                        Text(item).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 6)
        }
    }
}

struct AlternativesSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let exercise: String
    var choose: (String) -> Void
    @State private var items: [GymAlternative] = []
    @State private var loading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Místo: " + exercise).font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
            } else if items.isEmpty {
                Text("Žádná náhrada se nenašla.").font(Typo.small).foregroundStyle(Palette.muted)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(items) { alt in
                        Button {
                            choose(alt.name)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(alt.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                    Text([alt.muscle, alt.station, alt.note].compactMap { $0 }.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                                }
                                Spacer()
                                Image(systemName: "arrow.triangle.swap").foregroundStyle(Palette.faint)
                            }
                            .padding(.vertical, 12)
                            .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Text("Nahradí jen série, které ještě nejsou hotové.").font(Typo.caption).foregroundStyle(Palette.faint)
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            items = (try? await model.api.gymAlternatives(date: date, exercise: exercise)) ?? []
        }
    }
}
