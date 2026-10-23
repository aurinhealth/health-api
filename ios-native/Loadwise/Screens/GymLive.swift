import SwiftUI
import UIKit

/// Posilovna naživo: a running clock from "Začít posilovnu", exercises added
/// on the way with suggested sets (warm-ups "R" and work sets from the
/// history), a rest bar after each ticked set, the next exercise suggested to
/// keep push and pull in balance, and "Dokončit" with the summary. Every
/// change is saved as the gym sheet of the day (AppModel.saveGym, which waits
/// for signal when there is none), so a closed screen carries on later.
struct LiveGymView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    /// Start with the exercises of the last workout ("Zopakovat minulou").
    var repeatLast = false
    @State private var day: GymDay?
    @State private var history: GymHistory = .empty
    @State private var catalog: [GymCatalogExercise] = []
    @State private var muscles: [String: [String: Double]] = [:]
    /// The coach's line of each exercise added here.
    @State private var coach: [String: String] = [:]
    /// Notes under a set (a lighter weight after a set short of its reps), by row.
    @State private var notes: [Int: String] = [:]
    @State private var expanded: Set<String> = []
    @State private var restEnd: Date?
    @State private var restNext: String?
    @State private var picking = false
    @State private var historyFor: String?
    @State private var technique: String?
    @State private var summary = false
    @State private var rating = false
    @State private var saving = false
    @State private var loaded = false
    @State private var error: String?
    @State private var saveTask: Task<Void, Never>?
    @State private var confirmClose = false
    @State private var discarded = false
    @AppStorage("restSets") private var restSets = 90

    var body: some View {
        ZStack(alignment: .bottom) {
            ScreenBackground(glow: Palette.Glow.training)
                .onTapGesture { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            if let day {
                if summary {
                    PageScroll {
                        summaryView(day).padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 40)
                    }
                } else {
                    PageScroll {
                        live(day).padding(.horizontal, 24).padding(.top, 12).padding(.bottom, restEnd == nil ? 40 : 120)
                    }
                    if let restEnd {
                        restBar(until: restEnd).padding(.horizontal, 16).padding(.bottom, 12)
                    }
                }
            } else if let error {
                // The day didn't load: nothing is saved over it, the way back or again.
                VStack(spacing: 12) {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center)
                    SecondaryButton(title: "Zkusit znovu") { self.error = nil; loaded = false; Task { await load() } }
                    Button { dismiss() } label: {
                        Text("Zpět").font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(maxWidth: .infinity).frame(height: 46)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
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
        .onChange(of: summary) { _, _ in syncActivity() }
        .confirmationDialog("Ukončit trénink?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Pokračovat později") { dismiss() }
            Button("Zahodit trénink", role: .destructive) { Task { await discard() } }
        }
        .sheet(isPresented: $picking) {
            GymExerciseSearch(date: date, history: history, catalog: catalog, used: Set(day?.exercises.map(\.name) ?? [])) { name in add(name) }
        }
        .sheet(item: Binding(get: { historyFor.map { Named(name: $0) } }, set: { historyFor = $0?.name })) { item in
            ExerciseHistorySheet(name: item.name, exercise: history.exercise(item.name), today: date)
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
        // After Dokončit, as after a planned session: thumbs for each exercise.
        .sheet(isPresented: $rating, onDismiss: { dismiss() }) {
            GymRatingSheet(date: date, exercises: day?.exerciseNames ?? [])
        }
    }

    // MARK: Live

    private func live(_ day: GymDay) -> some View {
        let list = day.exercises
        let current = list.first { $0.sets.contains { !$0.done } }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                CircleButton(systemImage: "xmark", label: L10n.tr("Zavřít")) { close(day) }
                Spacer()
                Button {
                    restEnd = nil
                    self.day?.completeTyped()
                    summary = true
                } label: {
                    Text("Dokončit").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 16).frame(height: 34)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            SectionLabel(text: "Probíhá · posilovna").padding(.top, 18)
            clock(day).padding(.top, 2)

            if list.isEmpty {
                VStack(spacing: 18) {
                    Text("Zatím žádný cvik").font(Typo.sentence(22)).foregroundStyle(Palette.secondary)
                    PrimaryButton(title: L10n.tr("Přidat cvik"), systemImage: "plus") { picking = true }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 80)
            } else {
                VStack(spacing: 12) {
                    ForEach(list) { (exercise: GymExercise) in
                        block(exercise, current: current)
                    }
                }
                .padding(.top, 18)
                if current == nil {
                    next(day).padding(.top, 24)
                } else {
                    SecondaryButton(title: "Přidat cvik", systemImage: "plus") { picking = true }
                        .padding(.top, 14)
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
        }
    }

    /// The running clock: "17:05", "1:02:10" after an hour.
    private func clock(_ day: GymDay) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let start: Date = day.startedAt ?? context.date
            let seconds = max(0, Int(context.date.timeIntervalSince(start)))
            Text(Self.elapsed(seconds)).font(Typo.number(64)).foregroundStyle(Palette.ink).monospacedDigit()
        }
    }

    static func elapsed(_ s: Int) -> String {
        if s >= 3600 { return String(format: "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60) }
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    @ViewBuilder
    private func block(_ exercise: GymExercise, current: GymExercise?) -> some View {
        let isCurrent = exercise.id == current?.id
        if isCurrent || expanded.contains(exercise.id) {
            GymExerciseTable(exercise: exercise,
                             coachLine: coach[exercise.name],
                             notes: notes,
                             highlight: isCurrent ? exercise.sets.first(where: { !$0.done })?.row : nil,
                             onToggle: { set, kg, reps in toggle(set, kg: kg, reps: reps) },
                             onEdit: { set, kg, reps in edit(set, kg: kg, reps: reps) },
                             onAddSet: { addSet(exercise) },
                             onRemove: { set in remove(set) },
                             onHistory: { historyFor = exercise.name },
                             onTechnique: { technique = exercise.name })
        } else {
            Button { expanded.insert(exercise.id) } label: { collapsed(exercise) }
                .buttonStyle(.plain)
        }
    }

    /// A finished exercise (or one waiting): "5 sérií · 2 180 kg".
    private func collapsed(_ exercise: GymExercise) -> some View {
        let done = exercise.sets.allSatisfy { $0.done }
        let count = exercise.doneCount
        let volume: Double = exercise.sets.filter { $0.done && !$0.warmup }.reduce(0.0) { sum, s in
            sum + (s.kg.flatMap(LiftWeight.number) ?? 0) * (s.reps.flatMap(LiftWeight.number) ?? 0)
        }
        let caption: String = count > 0
            ? L10n.f("%@ %@ · %@ %@", String(count), Fmt.plural(count, "série", "série", "sérií"), Fmt.int(LiftWeight.shownValue(volume)), Units.weightUnit)
            : L10n.f("%@ %@ v plánu", String(exercise.workCount), Fmt.plural(exercise.workCount, "série", "série", "sérií"))
        return HStack(spacing: 12) {
            Image(systemName: done ? "checkmark" : "circle.dashed")
                .font(.footnote.weight(.bold))
                .foregroundStyle(done ? Palette.green : Palette.faint)
                .frame(width: 30, height: 30)
                .background(done ? Palette.greenSoft : Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(caption).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.down").font(.footnote).foregroundStyle(Palette.faint)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
    }

    /// After an exercise: what fits next, with its suggested load.
    private func next(_ day: GymDay) -> some View {
        let suggestion = GymCoach.nextPicks(done: day.exercises.map(\.name), catalog: catalog, history: history, date: date, known: muscles)
        return VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Další cvik?")
            if let line = suggestion.line { GymCoachLine(text: line) }
            VStack(spacing: 0) {
                ForEach(suggestion.picks) { (pick: GymNextPick) in
                    Button { add(pick.name, suggestion: pick.suggestion) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.muted)
                                .frame(width: 34, height: 34).background(Palette.track, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pick.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                Text(GymCoach.proposal(pick.suggestion)).font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "plus").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.amberBar)
                        }
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                }
            }
            SecondaryButton(title: "Jiný cvik", systemImage: "magnifyingglass") { picking = true }
        }
    }

    /// The rest after a set: the time left, the next set, +30 s, skip.
    private func restBar(until end: Date) -> some View {
        HStack(spacing: 12) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = max(0, Int(end.timeIntervalSince(context.date).rounded()))
                Text(String(format: "%d:%02d", left / 60, left % 60))
                    .font(Typo.number(32)).foregroundStyle(left == 0 ? Palette.green : Palette.ink).monospacedDigit()
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Pauza").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                if let restNext { Text(restNext).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Button { restEnd = end.addingTimeInterval(30) } label: {
                Text("+30 s").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12).frame(height: 34).background(Palette.track, in: Capsule())
            }
            .buttonStyle(.plain)
            Button { restEnd = nil } label: {
                Text("Přeskočit").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12).frame(height: 34).background(Palette.track, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
        .task(id: end) {
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, restEnd == end else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            restEnd = nil
        }
    }

    // MARK: Summary

    private func summaryView(_ day: GymDay) -> some View {
        let done = day.exercises.filter { $0.doneCount > 0 }
        let minutes = max(1, Int((Date().timeIntervalSince(day.startedAt ?? Date()) / 60).rounded()))
        let time = GymCoach.clock(minutes)
        let title = day.planName ?? (done.isEmpty ? L10n.tr("Silový trénink") : GymCoach.title(done.map(\.name), catalog: catalog, known: muscles))
        return VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Posilovna · hotovo").padding(.top, 24)
            Text(title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 8)
            HStack(alignment: .top, spacing: 8) {
                GymStat(label: "Čas", value: time.value, unit: time.unit)
                GymStat(label: "Objem", value: Fmt.int(LiftWeight.shownValue(day.volume)), unit: Units.weightUnit)
                GymStat(label: "Sérií", value: String(day.doneWorkSets))
            }
            .padding(.top, 18)
            if done.isEmpty {
                Text("Žádná série není odškrtnutá, takže Uložit trénink zahodí.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 18)
            } else {
                GymCoachLine(text: GymCoach.summaryLine(day, history: history, date: date)).padding(.top, 18)
                VStack(spacing: 10) {
                    ForEach(done) { (exercise: GymExercise) in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(exercise.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(GymCoach.setsLine(exercise.sets)).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(.top, 14)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            PrimaryButton(title: L10n.tr("Uložit"), systemImage: "checkmark", busy: saving) { Task { await finish() } }
                .disabled(saving)
                .padding(.top, 22)
            SecondaryButton(title: "Zpět k tréninku") { summary = false }
                .padding(.top, 10)
            Button(role: .destructive) { confirmClose = true } label: {
                Text("Zahodit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.rust).frame(maxWidth: .infinity).frame(height: 46)
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
    }

    // MARK: Changes

    private func load() async {
        guard !loaded else { return }
        loaded = true
        var sheet = GymDay(date: date, values: [], cancelled: nil)
        // A day that didn't load is not an empty day: saving one over it would
        // wipe the plan and the sets done.
        if !model.demo {
            do { sheet = try await model.gymDay(date: date) } catch {
                self.error = L10n.f("Trénink se nepodařilo načíst: %@", error.localizedDescription)
                return
            }
        }
        sheet.ensureHeader(date: date)
        let fresh = sheet.startedAt == nil
        if fresh { sheet.markStarted(Date()) }
        day = sheet
        history = await model.gymHistory()
        if !model.demo { catalog = (try? await model.api.gymExercises()) ?? [] }
        if repeatLast && sheet.exercises.isEmpty {
            for name in history.lastWorkout(before: date) { add(name, save: false) }
        }
        if fresh || repeatLast { persist() }
        await loadMuscles(day?.exercises.map(\.name) ?? [])
    }

    private func loadMuscles(_ names: [String]) async {
        guard !model.demo else { return }
        let missing = names.filter { muscles[$0] == nil }
        guard !missing.isEmpty else { return }
        if let more = try? await model.api.gymMuscles(names: missing) { muscles.merge(more) { $1 } }
    }

    private func add(_ name: String, suggestion: GymSuggestion? = nil, save: Bool = true) {
        guard var next = day else { return }
        let planned = suggestion ?? GymCoach.suggest(name, history: history, before: date, catalog: catalog.first { $0.name == name })
        next.appendExercise(name, suggestion: planned)
        coach[name] = planned.line
        day = next
        restEnd = nil
        if save {
            persist()
            Task { await loadMuscles([name]) }
        }
    }

    private func toggle(_ set: GymSet, kg: String, reps: String) {
        guard var next = day else { return }
        if set.done {
            next.undo(row: set.row)
            day = next
            persist()
            return
        }
        let typedKg = kg.trimmingCharacters(in: .whitespaces)
        let typedReps = reps.trimmingCharacters(in: .whitespaces)
        let k = typedKg.isEmpty ? (set.plannedKg ?? "") : LiftWeight.kgText(typedKg)
        let r = typedReps.isEmpty ? (GymCoach.firstNumber(set.plannedReps).map { String($0) } ?? "") : typedReps
        next.complete(row: set.row, kg: k, reps: r, rpe: set.rpe ?? "")
        var upcoming: Int? = nil
        if let exercise = next.exercises.first(where: { $0.sets.contains { $0.row == set.row } }) {
            upcoming = exercise.sets.first(where: { !$0.done && $0.row > set.row })?.row
            // Short of the reps: the next work set 2.5 kg lighter, with a note.
            if set.work, let goal = GymCoach.firstNumber(set.plannedReps), let got = Int(r), got < goal,
               let following = exercise.sets.first(where: { !$0.done && $0.work && $0.row > set.row }),
               let lifted = LiftWeight.number(k), lifted > GymCoach.step {
                let lighter = GymCoach.roundLoad(lifted - GymCoach.step)
                next.set(row: following.row, column: 3, GymCoach.kgText(lighter))
                notes[following.row] = L10n.f("Série %@ šla jen na %@, další ubereme na %@ %@.", set.number, r, GymCoach.shown(lighter), Units.weightUnit)
            }
        }
        day = next
        // Into a drop set straight away, no rest.
        let intoDrop = upcoming.flatMap { row in next.exercises.flatMap(\.sets).first(where: { $0.row == row }) }?.drop == true
        let rest = intoDrop ? 0 : set.warmup ? 60 : restSets
        if rest > 0 {
            let following: GymSet? = upcoming.flatMap { row in next.exercises.flatMap { $0.sets }.first { $0.row == row } }
            restNext = following.map { Self.describe($0) }
            restEnd = Date().addingTimeInterval(TimeInterval(rest))
        }
        persist()
    }

    // MARK: Live Activity

    /// The lock screen and Dynamic Island follow the sheet (GymLiveActivity).
    private func syncActivity() {
        GymLiveActivity.sync(day: summary || discarded ? nil : day, restStart: nil, restEnd: restEnd)
    }

    /// +30 s, Přeskočit pauzu and Série hotová from the lock screen.
    private func activityAction(_ action: GymActivityAction) {
        switch action {
        case .extend:
            if let end = restEnd { restEnd = max(end, Date()).addingTimeInterval(30) }
        case .skip:
            restEnd = nil
        case .complete(let row):
            restEnd = nil
            if let set = day?.exercises.flatMap(\.sets).first(where: { $0.row == row && !$0.done }) {
                toggle(set, kg: "", reps: "")
            }
        }
        syncActivity()
    }

    /// "další 82,5 × 6".
    static func describe(_ set: GymSet) -> String {
        let kg = LiftWeight.shown(set.plannedKg).map { $0 + " × " } ?? ""
        return L10n.f("další %@", kg + (set.plannedReps ?? ""))
    }

    private func edit(_ set: GymSet, kg: String, reps: String) {
        guard var next = day else { return }
        let k = LiftWeight.kgText(kg)
        let r = reps.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if (set.kg ?? "") == k && (set.reps ?? "") == r { return }
        next.edit(row: set.row, kg: k, reps: r)
        day = next
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            persist()
        }
    }

    /// A set out of the sheet; the notes of the rows below move up with them.
    private func remove(_ set: GymSet) {
        guard var next = day else { return }
        let gone = next.deleteSet(row: set.row)
        var moved: [Int: String] = [:]
        for (row, note) in notes where !gone.contains(row) { moved[row - gone.filter { $0 < row }.count] = note }
        notes = moved
        day = next
        persist()
    }

    /// X: an empty start is dropped at once; with exercises it asks.
    private func close(_ day: GymDay) {
        if day.exercises.isEmpty {
            Task { await discard() }
        } else {
            confirmClose = true
        }
    }

    /// Zahodit trénink: the workout leaves the day with its plan, the sets of
    /// today are not kept.
    private func discard() async {
        discarded = true
        saveTask?.cancel()
        restEnd = nil
        if !model.demo {
            do {
                try await model.api.discardGym(date: date)
            } catch {
                discarded = false
                self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
                return
            }
            await model.refreshTraining()
            await model.refresh()
        }
        dismiss()
    }

    private func addSet(_ exercise: GymExercise) {
        guard var next = day, let last = exercise.sets.last else { return }
        next.addSet(after: last.row)
        // The rows after the new one moved one down, their notes too.
        var moved: [Int: String] = [:]
        for (row, note) in notes { moved[row > last.row ? row + 1 : row] = note }
        notes = moved
        day = next
        persist()
    }

    /// Saves the sheet as it is now (waits for signal when there is none).
    private func persist() {
        guard let sheet = day, !model.demo, !discarded else { return }
        Task {
            do {
                try await model.saveGym(sheet, date: date)
                error = nil
            } catch {
                self.error = L10n.f("Nepodařilo se uložit: %@", error.localizedDescription)
            }
        }
    }

    /// Only the ticked sets stay, with the end time and a name; then the week
    /// shows the session done.
    private func finish() async {
        guard var next = day else { return }
        saving = true
        defer { saving = false }
        saveTask?.cancel()
        next.completeTyped()
        let names = next.exercises.filter { $0.doneCount > 0 }.map(\.name)
        next.dropUndone()
        next.markFinished(Date())
        if next.planName == nil && !names.isEmpty { next.setName(GymCoach.title(names, catalog: catalog, known: muscles)) }
        day = next
        if !model.demo {
            do {
                try await model.saveGym(next, date: date)
                error = nil
            } catch {
                self.error = L10n.f("Trénink se nepodařilo uložit: %@", error.localizedDescription)
                return
            }
            // A session with sets goes to the apps chosen in Synchronizace.
            await model.shareGym(next, date: date)
            await model.refreshTraining()
            if !names.isEmpty { rating = true; return }
        }
        dismiss()
    }
}
