import Combine
import SwiftUI
import UIKit

// The recovery tip on Today after a training day (GET /app/api/today →
// recovery, src/recovery-today.js): one thing to do, shown inside the coach's
// card, under Regenerace (recoveryTime, src/recovery-time.js): when hard
// training is fine again, with its own page of what makes it take that long. The stretch opens its routine (moves with a hold or reps, tick
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
        selectedDate == nil && (today.recoveryTime != nil || !(today.recovery?.items.isEmpty ?? true))
    }

    var body: some View {
        if Self.hasTip(today, selectedDate: model.selectedDate) {
            let items = today.recovery?.items ?? []
            VStack(alignment: .leading, spacing: 0) {
                // Regenerace first: when hard training is fine again.
                if let time = today.recoveryTime {
                    NavigationLink(value: AppRoute.recoveryTime) { RecoveryTimeRow(time: time, today: today.date) }
                        .buttonStyle(.plain)
                    if !items.isEmpty { Divider().overlay(Palette.hairline) }
                }
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
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

// MARK: - Regenerace

/// The Regenerace row in the coach's card: a ring of the time already behind
/// and when hard training is fine again.
struct RecoveryTimeRow: View {
    let time: RecoveryTime
    let today: String

    var body: some View {
        HStack(spacing: 14) {
            RecoveryRing(progress: time.liveProgress(), size: 38, line: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text("Regenerace").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                if let ready = time.ready {
                    Text(verbatim: L10n.f("tvrdý trénink %@", RecoveryTime.when(ready, today: today)))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

struct RecoveryRing: View {
    let progress: Double
    var size: CGFloat = 38
    var line: CGFloat = 4

    var body: some View {
        ZStack {
            Circle().stroke(Palette.track, lineWidth: line)
            Circle().trim(from: 0, to: max(0.02, min(1, progress)))
                .stroke(Palette.green, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

extension RecoveryTime {
    /// The share of the time behind now (the server's number is from the last refresh).
    func liveProgress(now: Date = Date()) -> Double {
        guard let start, let ready, ready > start else { return progress }
        return max(0, min(1, now.timeIntervalSince(start) / ready.timeIntervalSince(start)))
    }

    func hoursLeft(now: Date = Date()) -> Int {
        guard let ready else { return hours }
        return max(0, Int((ready.timeIntervalSince(now) / 3600).rounded(.up)))
    }
}

/// Regenerace from Today: the hours left, when easy and hard training are
/// fine, and what makes it take that long.
struct RecoveryTimeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: "Regenerace") {
            if let today = model.today, let time = today.recoveryTime {
                RecoveryTimeContent(time: time, today: today.date)
            } else if model.today == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            } else {
                Text("Regenerace").font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink).padding(.top, 24)
                Text("Tvrdý trénink").font(Typo.bodyStrong).foregroundStyle(Palette.green).padding(.top, 8)
                Text("už teď").font(Typo.body).foregroundStyle(Palette.muted)
            }
        }
        .task { if model.today == nil { await model.refresh() } }
    }
}

struct RecoveryTimeContent: View {
    let time: RecoveryTime
    let today: String
    var now = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Regenerace").font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink).padding(.top, 24)
            NumberText(value: String(time.hoursLeft(now: now)), unit: "h", size: 72).padding(.top, 4)
            if let ready = time.ready {
                Text(verbatim: L10n.f("tvrdý trénink %@", RecoveryTime.when(ready, today: today)))
                    .font(Typo.bodyStrong).foregroundStyle(Palette.green)
            }
            bar.padding(.top, 18)

            Card {
                VStack(spacing: 0) {
                    row(icon: "figure.walk", color: Palette.green, title: L10n.tr("Lehký trénink"),
                        detail: L10n.tr(time.legsTired ? "Z1–Z2, posilovna bez nohou" : "Z1–Z2, jiné svaly"),
                        trailing: time.light.map { $0 > now ? RecoveryTime.when($0, today: today) : L10n.tr("už teď") } ?? L10n.tr("už teď"))
                    Divider().overlay(Palette.hairline)
                    row(icon: "flame.fill", color: Palette.amber, title: L10n.tr("Tvrdý trénink"),
                        detail: L10n.tr(time.legsTired ? "intervaly, těžké nohy" : "intervaly, těžká posilovna"),
                        trailing: time.ready.map { RecoveryTime.when($0, today: today) } ?? "")
                }
            }
            .padding(.top, 22)

            if !time.causes.isEmpty {
                SectionLabel(text: "Co ji prodlužuje").padding(.top, 30).padding(.bottom, 10)
                Card {
                    VStack(spacing: 0) {
                        ForEach(Array(time.causes.enumerated()), id: \.offset) { index, cause in
                            if index > 0 { Divider().overlay(Palette.hairline) }
                            causeRow(cause)
                        }
                    }
                }
            }
        }
    }

    /// From the session to ready, with now on it.
    private var bar: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(Palette.green).frame(width: max(6, geo.size.width * time.liveProgress(now: now)))
                }
            }
            .frame(height: 6)
            HStack {
                if let start = time.start { Text(verbatim: RecoveryTime.short(start)) }
                Spacer()
                Text("teď")
                Spacer()
                if let ready = time.ready { Text(verbatim: RecoveryTime.short(ready)) }
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }

    private func row(icon: String, color: Color, title: String, detail: String, trailing: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(color)
                .frame(width: 38, height: 38).background(color.opacity(0.16), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            Text(verbatim: trailing).font(Typo.number(20)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.vertical, 8)
    }

    private func causeRow(_ c: RecoveryTime.Cause) -> some View {
        let (icon, color) = Self.look(c.kind)
        return row(icon: icon, color: color, title: Self.title(c), detail: Self.detail(c),
                   trailing: c.isSession ? "\(c.hours) h" : "+\(c.hours) h")
    }

    static func look(_ kind: String) -> (String, Color) {
        switch kind {
        case "ride": return ("bicycle", Palette.amber)
        case "run": return ("figure.run", Palette.amber)
        case "walk": return ("figure.walk", Palette.amber)
        case "gym": return ("dumbbell.fill", Palette.amber)
        case "sleep": return ("moon.fill", Palette.indigo)
        case "hrv": return ("waveform.path.ecg", Palette.blue)
        default: return ("heart.fill", Palette.rust)
        }
    }

    static func title(_ c: RecoveryTime.Cause) -> String {
        switch c.kind {
        case "sleep": return L10n.tr("Spánek")
        case "hrv": return "HRV"
        case "restingHR": return L10n.tr("Klidový tep")
        default: return c.title ?? ""
        }
    }

    static func detail(_ c: RecoveryTime.Cause) -> String {
        switch c.kind {
        case "sleep":
            let slept = c.minutes.map { String(format: "%d:%02d", $0 / 60, $0 % 60) } ?? ""
            guard let m = c.minutes, let need = c.need, need > 0 else { return slept }
            return slept + " · " + L10n.f("%d %% potřeby", Int((Double(m) / Double(need) * 100).rounded()))
        case "hrv":
            return (c.value.map { "\($0) ms · " } ?? "") + L10n.tr("pod normálem")
        case "restingHR":
            return (c.value.map { "\($0) bpm · " } ?? "") + L10n.tr("nad normálem")
        default:
            return [c.date.map { Fmt.weekdayShort($0).lowercased(with: L10n.locale) }, c.detail].compactMap { $0 }.joined(separator: " · ")
        }
    }
}
