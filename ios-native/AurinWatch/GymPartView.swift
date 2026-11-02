import SwiftUI
import WatchKit

/// The part of the workout on the screen and how far it got: kept by the gym
/// session (GymSessionView) so the pause, which takes the screen, keeps it too.
@MainActor
final class GymPartRun: ObservableObject {
    /// The part on the screen; nil = the exercises.
    @Published var part: GymDayPart?
    /// Warm-up or stretching: the hold on the screen and when it ends.
    @Published var hold = 0
    @Published var holdEnd: Date?
    /// The moves whose every hold was done (their ids).
    @Published var doneMoves: [String] = []
    /// Cardio: the minutes chosen (0 = no limit), when it started and its end with a set time.
    @Published var minutes = 0
    @Published var started: Date?
    /// When the pause began, to move the clocks on by its length.
    private var pausedAt: Date?

    func open(_ part: GymDayPart, minutes: Int) {
        self.part = part
        hold = 0
        holdEnd = nil
        doneMoves = []
        self.minutes = minutes
        started = nil
        pausedAt = nil
    }

    func close() {
        part = nil
        holdEnd = nil
        started = nil
    }

    var cardioEnd: Date? { minutes > 0 ? started?.addingTimeInterval(TimeInterval(minutes * 60)) : nil }

    /// The workout paused or went on: the clocks stand still meanwhile.
    func paused(_ on: Bool) {
        if on {
            pausedAt = Date()
        } else if let at = pausedAt {
            let length = Date().timeIntervalSince(at)
            holdEnd = holdEnd?.addingTimeInterval(length)
            started = started?.addingTimeInterval(length)
            pausedAt = nil
        }
    }
}

/// One hold of a warm-up or stretching move: the move, its round and its side.
struct GymHold: Equatable {
    let item: GymStretching.Item
    let round: Int
    let side: String?
    /// The move's last hold: after it the move counts as done.
    let last: Bool

    static func all(_ routine: GymStretching) -> [GymHold] {
        routine.items.flatMap { item -> [GymHold] in
            let sides: [String?] = item.sides ? ["L", "R"] : [nil]
            let rounds = max(1, item.rounds)
            return (1...rounds).flatMap { round in
                sides.enumerated().map { index, side in
                    GymHold(item: item, round: round, side: side, last: round == rounds && index == sides.count - 1)
                }
            }
        }
    }
}

/// Mockups "rozcvička, kardio, protažení" and "kardio bez času": the cardio
/// with its stopwatch (no limit) or a set time, the warm-up and the stretching
/// move by move with a countdown each; Next / Skip all, Done / Skip.
struct GymPartView: View {
    @ObservedObject var run: GymPartRun
    @ObservedObject private var store = GymStore.shared
    @ObservedObject private var workout = GymWorkout.shared
    let part: GymDayPart
    let parts: GymDayParts
    let day: GymDay
    /// The part finished (done or skipped): the session goes on.
    let finished: () -> Void

    @State private var now = Date()
    @State private var crownMinutes: Double = 0
    /// The last minute this part told the workout it's still going (GymWorkout.worked).
    @State private var workedAt = Date.distantPast
    @FocusState private var crown: Bool
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if part.isCardio {
                cardio
            } else if let routine = parts.moves(part, day: day), !routine.items.isEmpty {
                moves(routine)
            } else {
                // Nothing to do (an empty own routine): on to the next part.
                Color.clear.onAppear { finish(done: false) }
            }
        }
        .onReceive(tick) { date in
            guard workout.pausedAt == nil, run.part == part else { return }
            now = date
            // Cardio running or a hold counting down: no "Still working out?" meanwhile.
            if run.started != nil || run.holdEnd != nil, date.timeIntervalSince(workedAt) >= 60 {
                workedAt = date
                workout.worked()
            }
            if part.isCardio {
                if let end = run.cardioEnd, date >= end { stopCardio(at: end) }
            } else if let routine = parts.moves(part, day: day) {
                if let end = run.holdEnd {
                    if date >= end { next(in: routine) }
                } else {
                    // The countdown of the part's first hold starts with the part.
                    let holds = GymHold.all(routine)
                    if holds.indices.contains(run.hold) {
                        run.holdEnd = date.addingTimeInterval(TimeInterval(max(1, holds[run.hold].item.seconds)))
                    }
                }
            }
        }
    }

    // MARK: Cardio

    private var choice: GymDayParts.Choice { parts.choice(part) }

    @ViewBuilder private var cardio: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                header(W.tr("KARDIO", "CARDIO") + " · " + (part == .cardioStart ? W.tr("ZAČÁTEK", "START") : W.tr("KONEC", "END")),
                       Self.machine(choice.type), color: W.amber)
                if let started = run.started {
                    if let end = run.cardioEnd {
                        HStack(spacing: 8) {
                            ring(left: end.timeIntervalSince(now), total: Double(run.minutes * 60), color: W.amber,
                                 text: GymText.elapsed(end.timeIntervalSince(now).rounded(.up)),
                                 caption: W.tr("z \(run.minutes) min", "of \(run.minutes) min"))
                            VStack(spacing: 5) {
                                primary(W.tr("Stop", "Stop")) { stopCardio(at: Date()) }
                                secondary("+5 min") { run.minutes += 5 }
                            }
                        }
                    } else {
                        VStack(spacing: 0) {
                            Text(timerInterval: started...Date.distantFuture, countsDown: false)
                                .font(W.serif(46)).foregroundStyle(W.ink).monospacedDigit()
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Text(W.tr("běží", "running")).font(.system(size: 11)).foregroundStyle(W.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        primary(W.tr("Stop", "Stop")) { stopCardio(at: Date()) }
                    }
                    liveCells
                } else {
                    // Before the start: no limit by default, the crown or a chip sets a time.
                    VStack(spacing: 0) {
                        Text(run.minutes > 0 ? "\(run.minutes) min" : W.tr("Bez limitu", "No limit"))
                            .font(W.serif(32)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.6)
                        Text(W.tr("otoč korunkou pro čas", "turn the crown to set a time"))
                            .font(.system(size: 10)).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .focusable(true)
                    .focused($crown)
                    .focusEffectDisabled()
                    .digitalCrownRotation(detent: $crownMinutes, from: 0, through: 90, by: 1, sensitivity: .low,
                                          isContinuous: false, isHapticFeedbackEnabled: true)
                    .onChange(of: crownMinutes) { _, value in if run.minutes != Int(value) { run.minutes = Int(value) } }
                    .onChange(of: run.minutes) { _, value in if Int(crownMinutes) != value { crownMinutes = Double(value) } }
                    chips
                    primary(W.tr("Start", "Start")) {
                        run.started = Date()
                        now = Date()
                        workout.worked()
                        WKInterfaceDevice.current().play(.start)
                    }
                    Button(W.tr("Přeskočit", "Skip")) { finish(done: false) }
                        .font(.system(size: 13, weight: .semibold))
                        .buttonStyle(.bordered)
                }
            }
        }
        .onAppear {
            crownMinutes = Double(run.minutes)
            crown = run.started == nil
        }
    }

    /// No limit, then the day's time and the favourite ones (Nastavení → Posilovna).
    private var chips: some View {
        var times = [10, 15, 20]
        if choice.minutes > 0, !times.contains(choice.minutes) { times.append(choice.minutes) }
        let list = [0] + times.sorted()
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(list, id: \.self) { minutes in
                    let on = run.minutes == minutes
                    Button {
                        run.minutes = minutes
                    } label: {
                        Text(minutes == 0 ? W.tr("Bez limitu", "No limit") : (minutes == list.last ? "\(minutes) min" : "\(minutes)"))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(on ? .black : W.ink)
                            .padding(.horizontal, 9)
                            .frame(height: 26)
                            .background(on ? W.amber : W.tile, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    /// Stop: how long it ran and when it ended, to Training mode on the iPhone.
    private func stopCardio(at time: Date) {
        guard let started = run.started else { return }
        WKInterfaceDevice.current().play(.stop)
        workout.worked()
        let seconds = max(0, Int(time.timeIntervalSince(started).rounded()))
        store.finishPart(part, ticks: [part.tickPrefix + part.cardioId], cardio: (seconds: seconds, end: time))
        run.close()
        finished()
    }

    // MARK: Warm-up and stretching

    private func moves(_ routine: GymStretching) -> some View {
        let holds = GymHold.all(routine)
        let index = min(run.hold, max(0, holds.count - 1))
        let hold = holds[index]
        let moveIndex = (routine.items.firstIndex { $0.id == hold.item.id } ?? 0) + 1
        let color = part == .warmup ? W.green : W.indigo
        let left = run.holdEnd.map { $0.timeIntervalSince(now) } ?? Double(hold.item.seconds)
        var title = hold.item.name
        if let side = hold.side { title += " · " + (side == "L" ? W.tr("levá", "left") : W.tr("pravá", "right")) }
        if hold.item.rounds > 1 { title += " · \(hold.round)/\(hold.item.rounds)" }
        return ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                header((part == .warmup ? W.tr("ROZCVIČKA", "WARM-UP") : W.tr("PROTAŽENÍ", "STRETCHING")) + " · \(moveIndex)/\(routine.items.count)",
                       title, color: color)
                HStack(spacing: 8) {
                    ring(left: left, total: Double(max(1, hold.item.seconds)), color: color,
                         text: "\(max(0, Int(left.rounded(.up))))", caption: W.tr("s zbývá", "s left"))
                    VStack(spacing: 5) {
                        primary(W.tr("Další", "Next")) { next(in: routine) }
                        secondary(W.tr("Přeskočit vše", "Skip all")) { finish(done: false) }
                    }
                }
                liveCells
            }
        }
    }

    /// The hold done (its time ran out or Next): the next one, or the part done after the last.
    private func next(in routine: GymStretching) {
        let holds = GymHold.all(routine)
        guard holds.indices.contains(run.hold) else { return }
        workout.worked()
        let hold = holds[run.hold]
        if hold.last, !run.doneMoves.contains(hold.item.id) { run.doneMoves.append(hold.item.id) }
        run.hold += 1
        guard holds.indices.contains(run.hold) else {
            WKInterfaceDevice.current().play(.success)
            finish(done: true)
            return
        }
        WKInterfaceDevice.current().play(.directionUp)
        now = Date()
        run.holdEnd = now.addingTimeInterval(TimeInterval(max(1, holds[run.hold].item.seconds)))
    }

    /// The part over: the moves done go to Training mode on the iPhone (also when skipped part-way).
    private func finish(done: Bool) {
        let ticks = part.isCardio ? [] : run.doneMoves.map { part.tickPrefix + $0 }
        store.finishPart(part, ticks: ticks)
        run.close()
        finished()
    }

    // MARK: Pieces

    private func header(_ label: String, _ title: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
            Text(verbatim: title).font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    private func ring(left: Double, total: Double, color: Color, text: String, caption: String) -> some View {
        ZStack {
            Circle().stroke(W.track, lineWidth: 5)
            Circle().trim(from: 0, to: total > 0 ? max(0, min(1, left / total)) : 0)
                .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 1), value: left)
            VStack(spacing: 0) {
                Text(text).font(W.serif(22)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(caption).font(.system(size: 9)).foregroundStyle(W.secondary).lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 6)
        }
        .frame(width: 66, height: 66)
    }

    private func primary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.black)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background(W.ink, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func secondary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background(W.tile, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// The workout's time and the heart rate, as under a set.
    private var liveCells: some View {
        HStack(spacing: 5) {
            VStack(alignment: .leading, spacing: 0) {
                Text(W.tr("Čas", "Time")).font(.system(size: 10)).foregroundStyle(W.secondary)
                Group {
                    if let start = workout.clockStart {
                        Text(timerInterval: start...Date.distantFuture, countsDown: false)
                    } else {
                        Text("0:00")
                    }
                }
                .font(.system(size: 15, weight: .semibold).monospacedDigit()).foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 0) {
                Text(W.tr("Tep", "Heart")).font(.system(size: 10)).foregroundStyle(W.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(workout.heartRate.map { W.number($0) } ?? "–").font(.system(size: 15, weight: .semibold)).foregroundStyle(W.pink)
                    if workout.heartRate != nil { Text("bpm").font(.system(size: 9)).foregroundStyle(W.secondary) }
                }
                .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(W.tile, in: RoundedRectangle(cornerRadius: 10))
            .accessibilityElement(children: .combine)
        }
    }

    /// The cardio machine's name (ids of src/stretching.js CARDIO_MACHINES).
    static func machine(_ id: String) -> String {
        switch id {
        case "treadmill": return W.tr("Běžecký pás", "Treadmill")
        case "rowing_ergometer": return W.tr("Veslo", "Rowing machine")
        case "elliptical": return W.tr("Eliptický trenažér", "Elliptical")
        case "stairmaster": return W.tr("Schody", "Stair climber")
        case "air_bike": return "Air bike"
        case "ski_erg": return "SkiErg"
        case "jump_rope": return W.tr("Švihadlo", "Jump rope")
        default: return W.tr("Rotoped", "Exercise bike")
        }
    }

    /// The part's name in the list: "Warm-up", "Cardio", "Stretching".
    static func name(_ part: GymDayPart) -> String {
        switch part {
        case .warmup: return W.tr("Rozcvička", "Warm-up")
        case .stretching: return W.tr("Protažení", "Stretching")
        case .exercises: return W.tr("Cviky", "Exercises")
        case .cardioStart, .cardioEnd: return W.tr("Kardio", "Cardio")
        }
    }
}
