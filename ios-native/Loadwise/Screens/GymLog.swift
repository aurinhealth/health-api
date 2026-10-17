import Observation
import SwiftUI
import UIKit

// MARK: - A logged gym workout (the done session's detail)

/// A done gym session: time, volume and sets (or the calories), each
/// exercise's sets as a kg × reps table to fix (a missing weight, a set more),
/// its history, and exercises added afterwards. Also for a lifting session
/// from the watch with no plan that day: its sets can be written in here.
struct GymDoneDetail: View {
    @Environment(AppModel.self) private var model
    let date: String
    @Binding var day: GymDay
    /// The session from the watch or Intervals.icu: its length and calories.
    let session: WeekSession?
    /// Saves `day` as it is now.
    let save: () async -> Void
    @State private var history: GymHistory = .empty
    @State private var catalog: [GymCatalogExercise] = []
    @State private var historyFor: String?
    @State private var technique: String?
    @State private var picking = false
    @State private var saveTask: Task<Void, Never>?
    @State private var coach: [String: String] = [:]

    private var title: String {
        if let name = day.planName { return name }
        let names = day.exercises.map(\.name)
        return names.isEmpty ? L10n.tr("Silový trénink") : GymCoach.title(names, catalog: catalog)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 12)
            stats.padding(.top, 18)
            if let session, session.kcal != nil, session.kcalEstimate?.value != nil {
                KcalCheck(session: session, date: date)
            }
            if day.exercises.isEmpty {
                Text("Série z tohoto tréninku tu zatím nejsou. Přidej cviky, ať se počítají do historie a příštích návrhů.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 18)
            }
            VStack(spacing: 12) {
                ForEach(day.exercises) { (exercise: GymExercise) in
                    GymExerciseTable(exercise: exercise,
                                     coachLine: coach[exercise.name],
                                     missingNote: true,
                                     onToggle: { set, kg, reps in toggle(set, kg: kg, reps: reps) },
                                     onEdit: { set, kg, reps in edit(set, kg: kg, reps: reps) },
                                     onAddSet: { addSet(exercise) },
                                     onRemove: { set in remove(set) },
                                     onHistory: { historyFor = exercise.name },
                                     onTechnique: { technique = exercise.name })
                }
            }
            .padding(.top, 18)
            Button { picking = true } label: {
                Label("Přidat cvik", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
        }
        .task {
            history = await model.gymHistory()
            if !model.demo { catalog = (try? await model.api.gymExercises()) ?? [] }
        }
        .sheet(isPresented: $picking) {
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day.exercises.map(\.name))) { name in add(name) }
        }
        .sheet(item: Binding(get: { historyFor.map { Named(name: $0) } }, set: { historyFor = $0?.name })) { item in
            ExerciseHistorySheet(name: item.name, exercise: history.exercise(item.name), today: date)
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
    }

    // MARK: Stats

    @ViewBuilder private var stats: some View {
        let minutes: Int? = day.loggedMinutes ?? session?.minutes
        let clock = minutes.map { GymCoach.clock($0) }
        HStack(alignment: .top, spacing: 8) {
            GymStat(label: "Čas", value: clock?.value ?? "–", unit: clock?.unit)
            GymStat(label: "Objem", value: Fmt.int(LiftWeight.shownValue(day.volume)), unit: Units.weightUnit)
            if let session, session.kcal != nil {
                KcalStat(session: session, date: date)
            } else {
                GymStat(label: "Sérií", value: String(day.doneWorkSets))
            }
        }
    }

    // MARK: Changes

    private func toggle(_ set: GymSet, kg: String, reps: String) {
        if set.done {
            day.undo(row: set.row)
        } else {
            let typedKg = kg.trimmingCharacters(in: .whitespaces)
            let typedReps = reps.trimmingCharacters(in: .whitespaces)
            let k = typedKg.isEmpty ? (set.plannedKg ?? "") : LiftWeight.kgText(typedKg)
            let r = typedReps.isEmpty ? (GymCoach.firstNumber(set.plannedReps).map { String($0) } ?? "") : typedReps
            day.complete(row: set.row, kg: k, reps: r, rpe: set.rpe ?? "")
        }
        saveNow()
    }

    /// A past workout: a set with its reps typed in was done, ticked or not.
    private func edit(_ set: GymSet, kg: String, reps: String) {
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if (set.kg ?? "") == k && (set.reps ?? "") == r { return }
        if !set.done && !r.isEmpty {
            day.complete(row: set.row, kg: k, reps: r, rpe: set.rpe ?? "")
        } else {
            day.edit(row: set.row, kg: k, reps: r)
        }
        saveLater()
    }

    private func addSet(_ exercise: GymExercise) {
        guard let last = exercise.sets.last else { return }
        day.addSet(after: last.row)
        saveNow()
    }

    private func remove(_ set: GymSet) {
        day.removeRow(set.row)
        saveNow()
    }

    private func add(_ name: String) {
        let suggestion = GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name })
        day.ensureHeader(date: date)
        day.appendExercise(name, suggestion: suggestion)
        coach[name] = suggestion.line
        saveNow()
    }

    private func saveNow() {
        saveTask?.cancel()
        saveTask = nil
        Task { await save() }
    }

    /// Typing in a done set's fields: saved when it stops.
    private func saveLater() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            await save()
        }
    }
}

/// "Čas 1:02 h": a label over a serif number.
struct GymStat: View {
    let label: String
    let value: String
    var unit: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(Typo.small).foregroundStyle(Palette.muted)
            NumberText(value: value, unit: unit, size: 30)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Calories to check

/// The calories the session counts with: the user's choice for a flagged
/// session is sent at once and shown before the server answers.
@MainActor
@Observable
final class KcalChoiceStore {
    static let shared = KcalChoiceStore()
    /// Session id → the choice made on this phone ("" back to automatic).
    var chosen: [String: String] = [:]
    var busy: Set<String> = []
    var error: String?

    func choice(for session: WeekSession) -> String? {
        if let local = chosen[session.id] { return local.isEmpty ? nil : local }
        return session.kcalChoice
    }

    func choose(_ choice: String?, for session: WeekSession, date: String, model: AppModel) async {
        chosen[session.id] = choice ?? ""
        error = nil
        guard !model.demo else { return }
        busy.insert(session.id)
        defer { busy.remove(session.id) }
        do {
            try await model.api.setEnergyChoice(activityId: session.id, date: date, choice: choice)
            await model.refreshTraining()
            await model.refresh()
        } catch {
            chosen[session.id] = nil
            self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
        }
    }
}

/// "Energie 320 kcal" with "↶ z 711" to go back to the check.
struct KcalStat: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    let date: String
    private var store: KcalChoiceStore { KcalChoiceStore.shared }

    var body: some View {
        let choice = store.choice(for: session)
        let estimate = session.kcalEstimate?.value
        let shown: Double? = choice == "estimate" ? (estimate ?? session.kcal) : session.kcal
        VStack(alignment: .leading, spacing: 2) {
            Text("Energie").font(Typo.small).foregroundStyle(Palette.muted)
            NumberText(value: Fmt.int(shown), unit: "kcal", size: 30)
            if choice != nil, estimate != nil {
                Button { Task { await store.choose(nil, for: session, date: date, model: model) } } label: {
                    Label(choice == "estimate" ? L10n.f("původně %@ kcal", Fmt.int(session.kcal)) : L10n.tr("změnit"), systemImage: "arrow.uturn.backward")
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .labelStyle(TitleAndOptionalIcon(hasIcon: true))
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Vrátit volbu kalorií")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The amber card while a session's device calories wait for a check.
struct KcalCheck: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    let date: String
    private var store: KcalChoiceStore { KcalChoiceStore.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if store.choice(for: session) == nil, let kcal = session.kcal, let estimate = session.kcalEstimate?.value {
                KcalCheckCard(device: kcal, estimate: estimate, low: session.kcalEstimate?.low, high: session.kcalEstimate?.high,
                              minutes: session.sport == "strength" ? session.minutes : nil, reason: session.kcalEstimate?.reason, busy: store.busy.contains(session.id)) { choice in
                    Task { await store.choose(choice, for: session, date: date, model: model) }
                }
                .padding(.top, 18)
            }
            if let error = store.error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8)
            }
        }
    }
}

struct KcalCheckCard: View {
    let device: Double
    let estimate: Double
    var low: Double? = nil
    var high: Double? = nil
    var minutes: Int? = nil
    var reason: String? = nil
    var busy = false
    let choose: (String) -> Void

    private var sentence: String {
        if let minutes, minutes > 0 {
            return L10n.f("Hodinky ukazují %@ kcal. Za %@ posilovny je realita spíš kolem %@ kcal.",
                          Fmt.int(device), Fmt.hoursMinutesLong(Double(minutes)), Fmt.int(estimate))
        }
        return L10n.f("Hodinky ukazují %@ kcal. Realita je spíš kolem %@ kcal.", Fmt.int(device), Fmt.int(estimate))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Kalorie k ověření", systemImage: "exclamationmark.triangle")
                .font(Typo.bodyStrong).foregroundStyle(Palette.amber)
            Text(sentence).font(Typo.sentence(19)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            if let reason, !reason.isEmpty {
                Text(reason).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            KcalRangeBar(device: device, estimate: estimate, low: low ?? estimate, high: high ?? estimate)
                .padding(.top, 6)
            HStack {
                Text(L10n.f("odhad %@", Fmt.int(estimate))).foregroundStyle(Palette.green)
                Spacer()
                Text(L10n.f("hodinky %@", Fmt.int(device))).foregroundStyle(Palette.rust)
            }
            .font(Typo.caption)
            HStack(spacing: 10) {
                Button { choose("estimate") } label: {
                    Text(L10n.f("Počítat %@", Fmt.int(estimate))).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { choose("device") } label: {
                    Text(L10n.f("Nechat %@", Fmt.int(device))).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.22), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .disabled(busy)
            .padding(.top, 4)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// The estimate's range in green with its dot, the watch's number in red.
struct KcalRangeBar: View {
    let device: Double
    let estimate: Double
    let low: Double
    let high: Double

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let top = max(max(device, high), 1) * 1.1
            let x: (Double) -> CGFloat = { v in width * CGFloat(min(max(v / top, 0), 1)) }
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track).frame(height: 6)
                Capsule().fill(Palette.green.opacity(0.5)).frame(width: max(x(high) - x(low), 6), height: 6).offset(x: x(low))
                Circle().fill(Palette.green).frame(width: 12, height: 12)
                    .overlay(Circle().stroke(Palette.amberSoft, lineWidth: 2))
                    .offset(x: x(estimate) - 6)
                Circle().fill(Palette.rust).frame(width: 12, height: 12)
                    .overlay(Circle().stroke(Palette.amberSoft, lineWidth: 2))
                    .offset(x: x(device) - 6)
            }
            .frame(height: 12)
        }
        .frame(height: 12)
        .accessibilityHidden(true)
    }
}

// MARK: - The sets as a table

/// An exercise's sets as rows of kg × reps with a tick; the coach's line above.
struct GymExerciseTable: View {
    let exercise: GymExercise
    var coachLine: String? = nil
    /// Short notes under a set (a lighter weight after a set short of its reps).
    var notes: [Int: String] = [:]
    /// The set to do now.
    var highlight: Int? = nil
    /// A past workout: a set not done is missing (fill it in or delete it).
    var missingNote = false
    var onToggle: (GymSet, String, String) -> Void
    var onEdit: ((GymSet, String, String) -> Void)? = nil
    var onAddSet: (() -> Void)? = nil
    var onRemove: ((GymSet) -> Void)? = nil
    var onHistory: (() -> Void)? = nil
    /// The "i": how the exercise is done (TechniqueSheet).
    var onTechnique: (() -> Void)? = nil

    var body: some View {
        Card {
            HStack(alignment: .center, spacing: 10) {
                Text(exercise.name).font(.headline).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                if let onHistory {
                    Button(action: onHistory) {
                        Label("Historie", systemImage: "chart.bar.fill").labelStyle(TitleAndOptionalIcon(hasIcon: true))
                    }
                    .font(Typo.small.weight(.semibold))
                    .foregroundStyle(Palette.amber)
                    .buttonStyle(.borderless)
                }
                if let onTechnique { SmallInfoButton(action: onTechnique) }
            }
            if let coachLine { GymCoachLine(text: coachLine) }
            HStack(spacing: 10) {
                Text("#").frame(width: 22, alignment: .leading)
                Text("KG").frame(width: 84, alignment: .leading)
                Text("OPAK.").frame(width: 70, alignment: .leading)
                Spacer()
            }
            .font(.system(size: 11, weight: .medium))
            .tracking(1.2)
            .foregroundStyle(Palette.muted)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(exercise.sets) { (set: GymSet) in
                    VStack(alignment: .leading, spacing: 3) {
                        GymSetTableRow(set: set,
                                       highlighted: set.row == highlight,
                                       editable: onEdit != nil,
                                       onToggle: { kg, reps in onToggle(set, kg, reps) },
                                       onEdit: { kg, reps in onEdit?(set, kg, reps) })
                            .contextMenu {
                                if let onRemove {
                                    Button(role: .destructive) { onRemove(set) } label: { Label("Smazat sérii", systemImage: "trash") }
                                }
                            }
                        if let note = notes[set.row] {
                            Text(note).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.amber).padding(.leading, 32)
                        } else if set.warmup && set.row == highlight {
                            Text("rozcvička").font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.amber).padding(.leading, 32)
                        }
                    }
                }
            }
            if missingNote, let missing = exercise.sets.first(where: { !$0.done }) {
                HStack(alignment: .firstTextBaseline) {
                    Text(L10n.f("Série %@ není vyplněná: doplň opakování, nebo ji smaž.", missing.warmup ? "W" : missing.number))
                        .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if let onRemove {
                        Button("Smazat") { onRemove(missing) }
                            .font(Typo.small.weight(.semibold)).foregroundStyle(Palette.rust).buttonStyle(.borderless)
                    }
                }
            }
            if onAddSet != nil || onRemove != nil {
                HStack(spacing: 16) {
                    if let onAddSet {
                        Button(action: onAddSet) { Label("Přidat sérii", systemImage: "plus") }
                    }
                    Spacer()
                    if let onRemove, exercise.sets.count > 1, let last = exercise.sets.last {
                        Button { onRemove(last) } label: { Label("Odebrat sérii", systemImage: "minus") }
                    }
                }
                .font(Typo.caption.weight(.semibold))
                .foregroundStyle(Palette.muted)
                .buttonStyle(.borderless)
            }
        }
    }
}

/// One set: "R" or its number, kg, reps and the tick. A set not done shows
/// the suggestion in grey; ticking it takes what was typed, else the suggestion.
struct GymSetTableRow: View {
    let set: GymSet
    var highlighted = false
    /// A done set's numbers can still be corrected.
    var editable = false
    var onToggle: (String, String) -> Void
    var onEdit: (String, String) -> Void = { _, _ in }
    @State private var kg = ""
    @State private var reps = ""

    var body: some View {
        HStack(spacing: 10) {
            Text(set.warmup ? "R" : set.number)
                .font(Typo.number(18))
                .foregroundStyle(set.warmup ? Palette.faint : Palette.muted)
                .frame(width: 22, alignment: .leading)
                .accessibilityLabel(set.warmup ? L10n.tr("Rozcvičovací série") : L10n.f("Série %@", set.number))
            field($kg, placeholder: LiftWeight.shown(set.plannedKg) ?? "—", width: 84, keyboard: .decimalPad)
            field($reps, placeholder: GymCoach.firstNumber(set.plannedReps).map { String($0) } ?? "—", width: 70, keyboard: .numberPad)
            Spacer(minLength: 4)
            Button { onToggle(kg, reps) } label: {
                Image(systemName: set.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 28))
                    .foregroundStyle(set.done ? Palette.green : highlighted ? Palette.amberBar : Palette.faint)
            }
            .buttonStyle(.borderless)
            .sensoryFeedback(.impact(weight: .light), trigger: set.done) { was, now in !was && now }
            .accessibilityLabel(L10n.tr(set.done ? "Hotovo, klepnutím vrátit" : "Označit sérii jako hotovou"))
        }
        .onAppear { fill(set) }
        .onChange(of: set) { _, next in fill(next) }
        // Typed numbers are kept also before the tick (Uložit no longer loses them).
        .onChange(of: kg) { _, _ in if editable { onEdit(kg, reps) } }
        .onChange(of: reps) { _, _ in if editable { onEdit(kg, reps) } }
    }

    /// The saved numbers, unless the field already says the same ("82," while typing 82,5).
    private func fill(_ set: GymSet) {
        let savedKg = LiftWeight.shown(set.kg) ?? ""
        if LiftWeight.number(kg) != LiftWeight.number(savedKg) || (kg.isEmpty != savedKg.isEmpty) { kg = savedKg }
        let savedReps = set.reps ?? ""
        if LiftWeight.number(reps) != LiftWeight.number(savedReps) || (reps.isEmpty != savedReps.isEmpty) { reps = savedReps }
    }

    private func field(_ text: Binding<String>, placeholder: String, width: CGFloat, keyboard: UIKeyboardType) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(keyboard)
            .font(Typo.number(20))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 12)
            .frame(width: width, height: 40)
            .background(highlighted && !set.done ? Palette.amberSoft : Palette.track, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .disabled(set.done && !editable)
    }
}

/// The coach's short line: an amber note with a sparkle.
struct GymCoachLine: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "sparkles").font(.system(size: 13)).foregroundStyle(Palette.amber)
            Text(text).font(Typo.sentence(16)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - Adding an exercise

/// Search the exercises: the recent ones first with how they went last time
/// ("minule 82,5 kg × 6"), the catalog while searching.
struct GymExerciseSearch: View {
    @Environment(\.dismiss) private var dismiss
    let date: String
    let history: GymHistory
    let catalog: [GymCatalogExercise]
    let used: Set<String>
    let pick: (String) -> Void
    @State private var query = ""
    @State private var technique: String?

    struct Item: Identifiable {
        let name: String
        let caption: String
        var id: String { name }
    }

    private var items: [Item] {
        let words = ExerciseCatalog.fold(query).split(separator: " ").map(String.init)
        let matches: (String) -> Bool = { text in
            let folded = ExerciseCatalog.fold(text)
            return words.allSatisfy { folded.contains($0) }
        }
        var out: [Item] = []
        var seen = Set<String>()
        for exercise in history.recent(before: date) {
            let entry = catalog.first { $0.name == exercise.name }
            guard !seen.contains(exercise.name), matches([exercise.name, entry?.muscle ?? "", entry?.station ?? ""].joined(separator: " ")),
                  let last = exercise.sessions.first(where: { $0.date < date }) else { continue }
            out.append(Item(name: exercise.name, caption: GymCoach.lastText(last)))
            seen.insert(exercise.name)
        }
        if !words.isEmpty || out.isEmpty {
            for entry in catalog where !seen.contains(entry.name) && entry.fits != false {
                guard matches([entry.name, entry.muscle ?? "", entry.station ?? ""].joined(separator: " ")) else { continue }
                out.append(Item(name: entry.name, caption: [entry.muscle, entry.station].compactMap { $0?.nilIfBlank }.joined(separator: " · ")))
                seen.insert(entry.name)
            }
        }
        return Array(out.prefix(60))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Přidat cvik").font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Hledat cvik nebo stroj", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 12)
            .frame(height: 42)
            .background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            if query.isEmpty && !history.recent(before: date).isEmpty {
                SectionLabel(text: "Naposledy")
            }
            PageScroll {
                LazyVStack(spacing: 0) {
                    ForEach(items) { (item: Item) in
                        HStack(spacing: 12) {
                            Button {
                                pick(item.name)
                                dismiss()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.muted)
                                        .frame(width: 34, height: 34).background(Palette.track, in: Circle())
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                        if !item.caption.isEmpty {
                                            Text(item.caption).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 8)
                                    if used.contains(item.name) { Text("v tréninku").font(Typo.caption).foregroundStyle(Palette.faint) }
                                    Image(systemName: "plus").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.amberBar)
                                }
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            ExerciseInfoButton(name: item.name) { technique = item.name }
                        }
                        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                    if items.isEmpty {
                        Text("Nic se nenašlo.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 20)
                    }
                }
            }
        }
        .padding(24)
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
    }
}

// MARK: - An exercise's history

/// The best weight, the estimated 1RM, the change over 3 months, the heaviest
/// set per session as a line, and the past sessions.
struct ExerciseHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    let name: String
    let exercise: GymHistory.Exercise?
    let today: String

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(name).font(.title2.weight(.semibold)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                if let exercise, !exercise.sessions.isEmpty {
                    content(exercise)
                } else {
                    Text("Tenhle cvik zatím nemá žádnou historii. Po prvním tréninku tu uvidíš váhy a vývoj.")
                        .font(Typo.body).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 18)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
    }

    @ViewBuilder
    private func content(_ exercise: GymHistory.Exercise) -> some View {
        let unit = Units.weightUnit
        let change = GymCoach.change(exercise, today: today)
        HStack(alignment: .top, spacing: 8) {
            GymStat(label: "Nejvíc", value: GymCoach.best(exercise).map { GymCoach.shown($0) } ?? "–", unit: unit)
            GymStat(label: "Odhad 1RM", value: GymCoach.oneRepMax(exercise).map { GymCoach.shown($0) } ?? "–", unit: unit)
            GymStat(label: "Za 3 měsíce", value: change.map { ($0 < 0 ? "−" : "+") + GymCoach.shown(abs($0)) } ?? "–", unit: unit)
        }
        .padding(.top, 18)
        let points: [Double] = exercise.sessions.reversed().compactMap { GymCoach.topKg($0) }
        if points.count >= 2, let lo = points.min(), let hi = points.max() {
            LineChart(values: points.map { LiftWeight.shownValue($0) }, color: Palette.amberBar,
                      lo: LiftWeight.shownValue(lo) - 2.5, hi: LiftWeight.shownValue(hi) + 2.5, height: 150)
                .padding(.top, 22)
            HStack {
                Text(Self.month(exercise.sessions.last?.date ?? today))
                Spacer()
                Text("dnes")
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
            .padding(.top, 6)
        }
        VStack(spacing: 0) {
            ForEach(Array(exercise.sessions.prefix(12))) { (session: GymHistory.Session) in
                VStack(alignment: .leading, spacing: 2) {
                    Text(Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date)).font(.body).foregroundStyle(Palette.ink)
                    Text(GymCoach.setsLine(session.sets)).font(Typo.small).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
        }
        .padding(.top, 18)
    }

    /// "červenec": the month of the first session in the chart.
    static func month(_ iso: String) -> String {
        guard let date = ISODay.date(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Fmt.locale
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "LLLL"
        return f.string(from: date)
    }
}
