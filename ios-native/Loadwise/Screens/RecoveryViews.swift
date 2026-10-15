import Combine
import SwiftUI
import UIKit

// The recovery tip on Today after a training day (GET /app/api/today →
// recovery, src/recovery-today.js): one thing to do, shown inside the coach's
// card. The stretch opens its routine (moves with a hold or reps, tick
// circles, a timer); a finished routine and a ticked sauna are saved into the
// day's plan as done (POST /app/api/recovery). A long press marks it done or
// asks to see it less ("Doporučovat méně", POST /app/api/coach/pick/less).

/// The tip rows under the coach's sentence; nothing on a day without recovery or on an earlier day.
struct RecoveryTipRows: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot

    @State private var routineItem: RecoveryToday.Item?
    @State private var savingSauna = false
    @State private var error: String?

    static func hasTip(_ today: TodaySnapshot, selectedDate: String?) -> Bool {
        selectedDate == nil && !(today.recovery?.items.isEmpty ?? true)
    }

    var body: some View {
        if Self.hasTip(today, selectedDate: model.selectedDate), let recovery = today.recovery {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(recovery.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider().overlay(Palette.hairline) }
                    row(item)
                        .contextMenu { menu(item) }
                }
                if let error {
                    Text(error).font(Typo.caption).foregroundStyle(Palette.rust)
                }
            }
            .navigationDestination(item: $routineItem) { item in
                RecoveryRoutineView(item: item, date: today.date)
            }
        }
    }

    @ViewBuilder
    private func menu(_ item: RecoveryToday.Item) -> some View {
        if !item.isDone {
            Button { Task { await markDone(item) } } label: { Label("Hotovo", systemImage: "checkmark.circle") }
        }
        Button { Task { await recommendLess(item) } } label: { Label("Doporučovat méně", systemImage: "minus.circle") }
    }

    private func markDone(_ item: RecoveryToday.Item) async {
        guard !model.demo else { return }
        do {
            try await model.api.saveRecoveryDone(date: today.date, kind: item.kind, sport: item.sport, focus: item.focus)
            error = nil
            await model.refresh()
        } catch { self.error = error.localizedDescription }
    }

    private func recommendLess(_ item: RecoveryToday.Item) async {
        guard !model.demo else { return }
        do {
            try await model.api.recommendLess(kind: item.kind, less: true)
            error = nil
            await model.refresh()
        } catch { self.error = error.localizedDescription }
    }

    @ViewBuilder
    private func row(_ item: RecoveryToday.Item) -> some View {
        switch item.kind {
        case "stretch":
            Button { routineItem = item } label: { line(item, trailing: AnyView(chevronOrCheck(item))) }
                .buttonStyle(.plain)
        case "sauna":
            Button {
                Task { await saveSauna(item) }
            } label: {
                line(item, trailing: AnyView(tickCircle(item.isDone, busy: savingSauna)))
            }
            .buttonStyle(.plain)
            .disabled(savingSauna || model.demo || (item.isDone && item.savedId == nil))
            .accessibilityHint(item.isDone ? L10n.tr("Vrátit") : L10n.tr("Označit jako hotové"))
        default:
            line(item, trailing: AnyView(EmptyView()))
        }
    }

    private func line(_ item: RecoveryToday.Item, trailing: AnyView) -> some View {
        HStack(spacing: 14) {
            RecoveryIcon(kind: item.kind)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: item.title).font(Typo.bodyStrong).foregroundStyle(item.isDone ? Palette.muted : Palette.ink)
                if let detail = item.detail {
                    Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func chevronOrCheck(_ item: RecoveryToday.Item) -> some View {
        if item.isDone {
            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                .accessibilityLabel("Hotovo")
        } else {
            chevron
        }
    }

    private func tickCircle(_ done: Bool, busy: Bool) -> some View {
        ZStack {
            if busy {
                ProgressView()
            } else if done {
                Circle().fill(Palette.green)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.onAccent)
            } else {
                Circle().stroke(Palette.faint, lineWidth: 1.5)
            }
        }
        .frame(width: 26, height: 26)
    }

    /// Ticks the sauna off, or takes back a tick made by mistake.
    private func saveSauna(_ item: RecoveryToday.Item) async {
        guard !model.demo else { return }
        savingSauna = true
        defer { savingSauna = false }
        do {
            if item.isDone {
                guard let id = item.savedId else { return }
                try await model.api.deleteRecovery(id: id)
            } else {
                try await model.api.saveRecoveryDone(date: today.date, kind: "sauna", sport: nil, focus: nil)
            }
            error = nil
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The round icon of a recovery row: stretch green, sauna amber, bed indigo.
struct RecoveryIcon: View {
    let kind: String

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: 38, height: 38)
            .background(color.opacity(0.16), in: Circle())
            .accessibilityHidden(true)
    }

    private var symbol: String {
        switch kind {
        case "stretch": return "figure.flexibility"
        case "sauna": return "flame.fill"
        case "bedtime": return "bed.double.fill"
        default: return "leaf.fill"
        }
    }

    private var color: Color {
        switch kind {
        case "stretch": return Palette.green
        case "sauna": return Palette.amber
        case "bedtime": return Palette.indigo
        default: return Palette.green
        }
    }
}

/// The stretching routine: the moves with their hold or reps, a circle to
/// tick each, and "Spustit s časovačem" (one countdown per move). Ticking the
/// last move saves the routine into the day's plan as done.
struct RecoveryRoutineView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let item: RecoveryToday.Item
    let date: String

    @State private var ticked: Set<String> = []
    @State private var saving = false
    @State private var saved = false
    @State private var error: String?
    // The timer: the move it is on, the seconds left, paused or running.
    @State private var timerOn = false
    @State private var current = 0
    @State private var remaining = 0
    @State private var paused = false

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var exercises: [RecoveryToday.Exercise] { item.routine?.items ?? [] }

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: item.routine?.title ?? item.title) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Regenerace · dnes").padding(.top, 24)
                Text(verbatim: item.routine?.title ?? item.title)
                    .font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)

                if timerOn, current < exercises.count {
                    timerCard(exercises[current]).padding(.top, 22)
                }

                VStack(spacing: 0) {
                    ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                        if index > 0 { Divider().overlay(Palette.hairline) }
                        exerciseRow(exercise, active: timerOn && index == current)
                    }
                }
                .padding(.horizontal, 16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
                .padding(.top, 22)

                if saved {
                    Label("Uloženo do plánu dne", systemImage: "checkmark.circle.fill")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                        .padding(.top, 22)
                    SecondaryButton(title: "Zpět na Dnes", systemImage: "chevron.left") { dismiss() }
                        .padding(.top, 12)
                } else if !timerOn {
                    PrimaryButton(title: "Spustit s časovačem", systemImage: "timer") { startTimer() }
                        .disabled(exercises.isEmpty || saving)
                        .padding(.top, 22)
                }
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12)
                }
            }
        }
        .onReceive(clock) { _ in tick() }
        .onChange(of: timerOn) { _, on in UIApplication.shared.isIdleTimerDisabled = on }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .sensoryFeedback(.success, trigger: ticked.count)
        .onAppear { if item.isDone { saved = true; ticked = Set(exercises.map { $0.key }) } }
    }

    private var subtitle: String {
        let minutes = item.routine?.minutes.map { "\($0) min" }
        let count = exercises.count
        let moves = "\(count) " + Fmt.plural(count, "cvik", "cviky", "cviků")
        return [minutes, moves].compactMap { $0 }.joined(separator: " · ")
    }

    private func exerciseRow(_ exercise: RecoveryToday.Exercise, active: Bool) -> some View {
        let on = ticked.contains(exercise.key)
        return Button {
            toggle(exercise.key)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: exercise.name).font(.body).foregroundStyle(on ? Palette.muted : Palette.ink)
                    if let dose = exercise.dose {
                        Text(verbatim: dose).font(Typo.caption).foregroundStyle(active ? Palette.green : Palette.muted)
                    }
                }
                Spacer(minLength: 8)
                ZStack {
                    if on {
                        Circle().fill(Palette.green)
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.onAccent)
                    } else {
                        Circle().stroke(active ? Palette.green : Palette.faint, lineWidth: 1.5)
                    }
                }
                .frame(width: 30, height: 30)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(saving || saved)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func timerCard(_ exercise: RecoveryToday.Exercise) -> some View {
        let total = max(exercise.seconds ?? 30, 1)
        let half = (exercise.sides ?? false) && remaining <= total / 2
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(verbatim: "\(current + 1)/\(exercises.count)").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                Spacer()
                if exercise.sides ?? false {
                    Text(half ? "Druhá strana" : "První strana").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.green)
                }
            }
            Text(verbatim: exercise.name).font(Typo.sentence(24)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let cue = exercise.cue {
                Text(verbatim: cue).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Text(verbatim: Self.countdown(remaining)).font(Typo.number(72)).foregroundStyle(Palette.ink)
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .center)
            ProgressLine(fraction: 1 - Double(remaining) / Double(total), color: Palette.green, height: 6)
            HStack(spacing: 10) {
                SecondaryButton(title: paused ? "Pokračovat" : "Pozastavit", systemImage: paused ? "play.fill" : "pause.fill") { paused.toggle() }
                SecondaryButton(title: "Další cvik", systemImage: "forward.fill") { finishCurrent() }
            }
            Button("Ukončit časovač") { timerOn = false }
                .font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
        }
        .padding(18)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
    }

    /// 75 → "1:15", 40 → "0:40".
    static func countdown(_ seconds: Int) -> String {
        let s = max(seconds, 0)
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }

    // MARK: Actions

    private func toggle(_ key: String) {
        if ticked.contains(key) { ticked.remove(key) } else { ticked.insert(key) }
        saveIfFinished()
    }

    private func startTimer() {
        guard let first = exercises.firstIndex(where: { !ticked.contains($0.key) }) else { return }
        current = first
        remaining = exercises[first].seconds ?? 30
        paused = false
        timerOn = true
    }

    private func tick() {
        guard timerOn, !paused, current < exercises.count else { return }
        if remaining > 1 { remaining -= 1 } else { finishCurrent() }
    }

    private func finishCurrent() {
        guard current < exercises.count else { timerOn = false; return }
        ticked.insert(exercises[current].key)
        if let next = exercises.indices.first(where: { $0 > current && !ticked.contains(exercises[$0].key) }) {
            current = next
            remaining = exercises[next].seconds ?? 30
            paused = false
        } else {
            timerOn = false
        }
        saveIfFinished()
    }

    private func saveIfFinished() {
        guard !saved, !saving, !exercises.isEmpty, exercises.allSatisfy({ ticked.contains($0.key) }) else { return }
        Task { await save() }
    }

    private func save() async {
        guard !model.demo else { saved = true; return }
        saving = true
        defer { saving = false }
        do {
            try await model.api.saveRecoveryDone(date: date, kind: "stretch", sport: item.sport, focus: item.focus)
            saved = true
            timerOn = false
            error = nil
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
