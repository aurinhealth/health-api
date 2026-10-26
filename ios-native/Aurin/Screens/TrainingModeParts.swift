import SwiftUI

/// Režim tréninku's numbers: volume, last time, records, plates, the day's
/// muscles and the comparison with last time. All from the day's sheet and the
/// stored history (GET /app/api/gym/history), on the phone.
enum GymSessionMath {
    /// kg × reps of the done work sets.
    static func volume(_ exercises: [GymExercise]) -> Double {
        exercises.flatMap(\.sets).filter { $0.done && !$0.warmup }.reduce(0) { total, set in
            guard let kg = set.kg.flatMap(LiftWeight.number), let reps = set.reps.flatMap(LiftWeight.number) else { return total }
            return total + kg * reps
        }
    }

    /// The weight and reps of the work set done just before this one (on the
    /// same side by sides): the next set starts from them, as typed. Warm-ups
    /// keep their own plan.
    static func carried(_ set: GymSet, in exercise: GymExercise) -> (kg: String?, reps: String?)? {
        guard set.work, let before = exercise.sets.last(where: { $0.work && $0.done && $0.row < set.row && $0.side == set.side }) else { return nil }
        return (before.kg?.nilIfBlank, before.reps?.nilIfBlank)
    }

    /// "8,4" (tonnes) or "18,5" (thousands of pounds), with its unit.
    static func volumeText(_ kg: Double) -> (value: String, unit: String) {
        Units.imperial ? (Fmt.decimal(Units.weight(kg) / 1000), "k lb") : (Fmt.decimal(kg / 1000), "t")
    }

    /// The work set of the same number last time: "77,5 × 8".
    static func lastTime(_ set: GymSet, in exercise: GymExercise, last: GymHistory.Session?) -> String? {
        guard set.work, let last else { return nil }
        let work = exercise.sets.filter(\.work)
        guard let position = work.firstIndex(where: { $0.row == set.row }), last.sets.indices.contains(position) else { return nil }
        return lift(last.sets[position])
    }

    static func lift(_ lift: GymHistory.Lift) -> String? {
        guard let reps = lift.reps else { return nil }
        guard let kg = lift.kg, kg > 0 else { return L10n.f("%@ op.", Fmt.int(reps)) }
        return GymCoach.shown(kg) + " × " + Fmt.int(reps)
    }

    /// The best set before today by the estimated one-rep max.
    static func record(_ exercise: GymHistory.Exercise?, before date: String) -> GymHistory.Lift? {
        guard let exercise else { return nil }
        let lifts: [GymHistory.Lift] = exercise.sessions.filter { $0.date < date }.flatMap { $0.sets }
        guard let best = lifts.max(by: { e1rm($0) < e1rm($1) }), e1rm(best) > 0 else { return nil }
        return best
    }

    static func e1rm(_ lift: GymHistory.Lift) -> Double {
        guard let kg = lift.kg, kg > 0, let reps = lift.reps, reps > 0 else { return 0 }
        return reps == 1 ? kg : kg * (1 + reps / 30)
    }

    static func lifts(_ exercise: GymExercise) -> [GymHistory.Lift] {
        exercise.sets.filter { $0.done && $0.work }.map { set in
            GymHistory.Lift(kg: set.kg.flatMap(LiftWeight.number), reps: set.reps.flatMap(LiftWeight.number), target: nil, rpe: nil)
        }
    }

    /// Plates on each side of a 20 kg bar: "20 + 10".
    static func plates(_ kg: Double) -> String? {
        guard !Units.imperial, kg > 20 else { return nil }
        var side = (kg - 20) / 2
        var out: [Double] = []
        for plate in [25, 20, 15, 10, 5, 2.5, 1.25] where side >= plate - 0.001 {
            while side >= plate - 0.001 { out.append(plate); side -= plate }
        }
        guard side < 0.01, !out.isEmpty else { return nil }
        return out.map { GymCoach.shown($0) }.joined(separator: " + ")
    }

    /// The plan's main muscles and how much of their sets is done (0…1).
    static func muscleProgress(_ exercises: [GymExercise], muscles: [String: [String: Double]]) -> [(id: String, done: Int, planned: Int)] {
        var planned: [String: Double] = [:], done: [String: Double] = [:]
        for exercise in exercises {
            guard let map = muscles[exercise.name] else { continue }
            for (muscle, weight) in map where weight >= 0.5 {
                planned[muscle, default: 0] += Double(exercise.workCount)
                done[muscle, default: 0] += Double(exercise.doneCount)
            }
        }
        // Ties by name: the dictionaries' order differs on every call, and the
        // rest's timer redraws the card each second.
        let top = planned.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.prefix(4)
        return top.map { (id: $0.key, done: Int(min(done[$0.key] ?? 0, $0.value)), planned: Int($0.value)) }
    }

    /// Today against last time: "+2,5 kg", "+1 op." or "=".
    static func change(_ exercise: GymExercise, last: GymHistory.Session?) -> (text: String, better: Bool?)? {
        let now = lifts(exercise)
        guard let last, let top = now.compactMap(\.kg).max(), let before = GymCoach.topKg(last) else { return nil }
        if abs(top - before) > 0.01 {
            let sign: String = top > before ? "+" : "−"
            let text: String = sign + GymCoach.shown(abs(top - before)) + " " + Units.weightUnit
            return (text, top > before)
        }
        let repsNow = now.filter { $0.kg == top }.compactMap(\.reps).max() ?? 0
        let repsBefore = last.sets.filter { $0.kg == before }.compactMap(\.reps).max() ?? 0
        if repsNow != repsBefore {
            return (Fmt.signed(repsNow - repsBefore) + " " + L10n.tr("op."), repsNow > repsBefore)
        }
        return ("=", nil)
    }
}

/// One row of the exercise's set table.
struct GymSetRow: View {
    enum Phase { case done, current, next }

    let label: String
    /// "L" or "P" of a one-sided exercise done by sides.
    var side: String? = nil
    let lastTime: String?
    let kg: String
    let reps: String
    let state: Phase
    var kgText: Binding<String>? = nil
    var repsText: Binding<String>? = nil
    /// The planned reps ("5–8") shown in the empty field of the set at hand.
    var repsHint: String? = nil
    /// A drop set: "↳" under the set it follows.
    var drop = false
    /// W T E M H F PR D (GymIntensity.swift); planned: still the plan's.
    var intensity: String? = nil
    var planned = false
    /// The letter tapped: its sheet. Nil shows no letter column.
    var onIntensity: (() -> Void)? = nil
    /// A ticked set's weight and reps changed afterwards (shown kg, reps).
    var onEdit: ((String, String) -> Void)? = nil
    /// A barbell's weight: tapping it loads plates (PlateLoaderSheet) instead of typing.
    var onKgTap: (() -> Void)? = nil
    var toggle: () -> Void = {}

    private enum Field { case kg, reps }
    @FocusState private var focus: Field?
    @State private var editKg = ""
    @State private var editReps = ""

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(label).font(.subheadline.weight(.semibold))
                    .foregroundStyle(drop ? GymIntensity.color("D") : state == .current ? Palette.amber : state == .next ? Palette.faint : Palette.secondary)
                    .frame(width: side == nil ? 26 : 16, alignment: .leading)
                if let side {
                    Text(verbatim: side).font(.caption.weight(.bold)).foregroundStyle(GymSides.color(side)).frame(width: 12)
                }
            }
            Text(lastTime ?? "—").font(.footnote).foregroundStyle(Palette.faint).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            field(kg, kgText, keyboard: .decimalPad, edit: $editKg, field: .kg)
            field(reps, repsText, keyboard: .numberPad, edit: $editReps, field: .reps, hint: repsHint).frame(width: 52)
            if let onIntensity {
                Button(action: onIntensity) {
                    IntensityPill(letter: intensity, planned: planned)
                        .opacity(state == .next ? 0.6 : 1)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(intensity.map { GymIntensity.name($0) } ?? L10n.tr("Bez hodnocení"))
                .accessibilityHint(L10n.tr("Jak těžká série byla"))
            }
            Button(action: toggle) {
                Group {
                    if state == .done {
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.onAccent)
                            .frame(width: 30, height: 30).background(Palette.green, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(state == .current ? Palette.amber : Palette.hairline, lineWidth: 1.5)
                            .frame(width: 30, height: 30)
                    }
                }
                .frame(width: 34, height: 40)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr(state == .done ? "Vrátit sérii" : "Série hotová"))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(state == .current ? Palette.track : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(state == .current ? Palette.amber.opacity(0.55) : .clear, lineWidth: 1.5))
        .onAppear { editKg = kg; editReps = reps }
        .onChange(of: kg) { _, value in if focus == nil { editKg = value } }
        .onChange(of: reps) { _, value in if focus == nil { editReps = value } }
        // Leaving the field keeps what was typed.
        .onChange(of: focus) { old, now in
            guard old != nil, now == nil, let onEdit, editKg != kg || editReps != reps else { return }
            onEdit(editKg, editReps)
        }
    }

    @ViewBuilder
    private func field(_ value: String, _ binding: Binding<String>?, keyboard: UIKeyboardType, edit: Binding<String>, field: Field, hint: String? = nil) -> some View {
        if state == .done, onEdit != nil {
            // A ticked set stays editable: tap the number to fix it.
            TextField("–", text: edit)
                .keyboardType(keyboard)
                .multilineTextAlignment(.center)
                .font(Typo.number(22))
                .foregroundStyle(Palette.ink)
                .focused($focus, equals: field)
                .frame(width: 64, height: 34)
                .background(focus == field ? Palette.card : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else if field == .kg, state == .current, let onKgTap {
            Button(action: onKgTap) {
                Text(binding?.wrappedValue.nilIfBlank ?? (value.isEmpty ? "–" : value))
                    .font(Typo.number(22))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 64, height: 34)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Naložit kotouče"))
        } else if let binding, state == .current {
            TextField("–", text: binding, prompt: Text(verbatim: hint?.nilIfBlank ?? "–").foregroundStyle(Palette.faint))
                .keyboardType(keyboard)
                .multilineTextAlignment(.center)
                .font(Typo.number(22))
                .foregroundStyle(Palette.ink)
                .frame(width: 64, height: 34)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            Text(value.isEmpty ? "–" : value).font(Typo.number(22))
                .foregroundStyle(state == .next ? Palette.faint : Palette.ink)
                .frame(width: 64)
        }
    }
}

/// The rest's countdown as a ring.
struct RestRing: View {
    let end: Date
    let total: Int
    /// The last seconds that tick show in amber.
    @AppStorage(GymSignals.countdownKey) private var countdown = 3

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(end.timeIntervalSince(context.date).rounded()))
            let share = total > 0 ? Double(left) / Double(total) : 0
            ZStack {
                Circle().stroke(Palette.track, lineWidth: 12)
                Circle().trim(from: 0, to: share)
                    .stroke(Palette.green, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 1), value: share)
                VStack(spacing: 2) {
                    Text("Pauza").font(Typo.small).foregroundStyle(Palette.muted)
                    Text(String(format: "%d:%02d", left / 60, left % 60))
                        .font(Typo.number(64)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                        .foregroundStyle(left == 0 ? Palette.green : countdown > 0 && left <= countdown ? Palette.amber : Palette.ink)
                    Text(L10n.f("z %@", String(format: "%d:%02d", total / 60, total % 60))).font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
            .frame(width: 220, height: 220)
            .frame(maxWidth: .infinity)
        }
    }
}

/// "Tep se vrací 148 → 112 bpm" with the line since the rest began.
struct HeartRecoveryCard: View {
    let points: [Double]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "heart").foregroundStyle(Palette.rust)
                Text("Tep se vrací").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                if let first = points.first, let last = points.last {
                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                        Text(Fmt.int(first)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        Text(verbatim: "→").font(Typo.small).foregroundStyle(Palette.muted)
                        Text(Fmt.int(last)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        Text(verbatim: "bpm").font(Typo.small).foregroundStyle(Palette.muted)
                    }
                }
            }
            if points.count >= 2, let lo = points.min(), let hi = points.max() {
                GeometryReader { geo in
                    Path { path in
                        for (i, value) in points.enumerated() {
                            let x = geo.size.width * CGFloat(i) / CGFloat(points.count - 1)
                            let y = geo.size.height * (hi > lo ? CGFloat((hi - value) / (hi - lo)) : 0.5)
                            if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                        }
                    }
                    .stroke(Palette.rust, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                }
                .frame(height: 40)
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }
}

/// "Celkem dnes": the plan's main muscles lit on the figure (begun amber,
/// done green, still to come light grey) and their sets done of planned.
struct MuscleProgressCard: View {
    let items: [(id: String, done: Int, planned: Int)]
    /// "1 z 23 sérií" of the whole workout.
    let total: (done: Int, planned: Int)
    private var store: MuscleModelStore { MuscleModelStore.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Celkem dnes").font(Typo.small).foregroundStyle(Palette.muted)
                Spacer()
                Text(verbatim: L10n.f("%@ z %@", String(total.done), String(total.planned)) + " " + Fmt.plural(total.planned, "série", "série", "sérií"))
                    .font(Typo.small).foregroundStyle(Palette.muted).monospacedDigit()
            }
            HStack(spacing: 10) {
                if let figure = store.figure {
                    MuscleFigureFixedPair(figure: figure, colors: MuscleFigureFixedPair.colors(colors), labels: false)
                        .frame(width: 150, height: 180)
                        .allowsHitTesting(false)
                }
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(items, id: \.id) { item in
                        HStack {
                            Text(BodyFigure.label(item.id)).font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                            Spacer(minLength: 6)
                            Text(verbatim: "\(item.done)/\(item.planned)").font(Typo.small.weight(.medium))
                                .foregroundStyle(item.done >= item.planned ? Palette.green : item.done > 0 ? Palette.amber : Palette.muted).monospacedDigit()
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            if store.figure != nil {
                HStack(spacing: 14) {
                    key("rozjeté", Palette.amber)
                    key("v plánu", Self.planned)
                    key("hotové", Palette.green)
                }
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    /// The light grey of a muscle still to come today.
    static let planned = Color(light: 0x8E8880, dark: 0x9AA3A8)

    private var colors: [String: Color] {
        Dictionary(uniqueKeysWithValues: items.map { item in
            (item.id, item.done >= item.planned ? Palette.green : item.done > 0 ? Palette.amber : Self.planned)
        })
    }

    private func key(_ title: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}

/// Minutes in each heart rate zone, as bars.
struct ZoneMinutesCard: View {
    let minutes: [Double]
    static let colors: [Color] = [Palette.blue, Palette.green, Palette.amber, Palette.rust, Color(light: 0xC0392B, dark: 0xFF6B6B)]

    var body: some View {
        let top = max(1, minutes.max() ?? 1)
        VStack(alignment: .leading, spacing: 8) {
            Text("Tepové zóny").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            ForEach(Array(minutes.enumerated()), id: \.offset) { i, value in
                HStack(spacing: 10) {
                    Text("Z\(i + 1)").font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 24, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.track)
                            Capsule().fill(Self.colors[min(i, Self.colors.count - 1)]).frame(width: max(value > 0 ? 6 : 0, geo.size.width * value / top))
                        }
                    }
                    .frame(height: 8)
                    Text(L10n.f("%@ min", Fmt.int(value))).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 50, alignment: .trailing)
                }
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }
}

/// The heart in the workout's header: crossed out while nothing measures the
/// heart rate, red with a green dot when a beat comes in. A tap opens the
/// sensors (Nastavení → Snímač tepu) over the workout.
struct HeartSourceButton: View {
    let live: LiveWorkout
    var action: () -> Void
    private var sensor: HeartRateSensor { HeartRateSensor.shared }

    var body: some View {
        let measuring = live.heartRate != nil || sensor.liveBpm != nil
        // A paired sensor connected before Začít trénink counts too.
        let on = measuring || sensor.connected
        let bpm = live.heartRate ?? sensor.liveBpm
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: on ? "heart.fill" : "heart.slash")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(on ? Palette.rust : Palette.faint)
                if let bpm {
                    Text(verbatim: "\(Int(bpm.rounded()))").font(Typo.number(18)).monospacedDigit().foregroundStyle(Palette.ink)
                }
            }
            .padding(.horizontal, 12)
            .frame(minWidth: 44)
            .frame(height: 34)
            // The whole capsule takes the tap, not only the heart's outline.
            .contentShape(Capsule())
            .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            .overlay(alignment: .topTrailing) {
                if measuring || sensor.connected {
                    Circle().fill(Palette.green).frame(width: 9, height: 9)
                        .overlay(Circle().stroke(Palette.background, lineWidth: 2))
                        .offset(x: -1, y: 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(measuring ? "Tep se měří" : "Tep se neměří"))
    }
}

/// The small "i" beside an exercise in the rest: how it is done.
struct SmallInfoButton: View {
    var label = "Technika"
    var systemImage = "info"
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink)
                .frame(width: 30, height: 30).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// Režim tréninku hidden with the arrow: where it was, so it opens the same
/// (the exercise, the rest), and the lock-screen taps made meanwhile.
struct MinimizedGym {
    let date: String
    let title: String
    var day: GymDay
    var index: Int
    var restStart: Date?
    var restEnd: Date?
    var restTotal: Int
    let next: String?
    let startTapped: Bool
    var pending: [GymActivityAction] = []
}

/// The bar over the tab bar while the workout is hidden: its time, the rest
/// and the exercise; a tap opens it again.
struct MinimizedGymBar: View {
    let gym: MinimizedGym
    let live: LiveWorkout
    var open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                Image(systemName: "dumbbell.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.rust)
                    .frame(width: 38, height: 38).background(Palette.track, in: Circle())
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 8) {
                            Text(verbatim: gym.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                            Text(verbatim: elapsed(at: context.date)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).monospacedDigit()
                        }
                        if let line = line(at: context.date) {
                            Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.up").font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted)
            }
            .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 9)
            .cardSurface(cornerRadius: 22)
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("Zpět do tréninku"))
    }

    private func elapsed(at now: Date) -> String {
        guard let start = live.clockStart else { return "" }
        let s = max(0, Int(now.timeIntervalSince(start)))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }

    /// "Pauza 0:40 · další Dřep", or the exercise.
    private func line(at now: Date) -> String? {
        if let end = gym.restEnd, end > now {
            let s = Int(end.timeIntervalSince(now).rounded(.up))
            let rest = L10n.tr("Pauza") + " " + String(format: "%d:%02d", s / 60, s % 60)
            return gym.next.map { rest + " · " + L10n.f("další %@", $0) } ?? rest
        }
        return gym.next
    }
}

/// The sets of Teď or Další in the rest, unfolded with the arrow: the done
/// ones ticked, the rest with the weight and reps to come. In Další the first
/// set's weight can be changed and goes to all its sets still to do.
struct RestSetsList: View {
    let exercise: GymExercise
    let last: GymHistory.Session?
    var onWeight: ((String) -> Void)? = nil
    @State private var typed = ""
    @FocusState private var focused: Bool

    var body: some View {
        let editable: Int? = onWeight == nil ? nil : exercise.sets.first { !$0.done && $0.work }?.row
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("Série").frame(width: 40, alignment: .leading)
                Text("Minule").frame(maxWidth: .infinity, alignment: .leading)
                Text(Units.weightUnit).frame(width: 64)
                Text("Opak.").frame(width: 52)
            }
            .font(.caption2.weight(.medium)).textCase(.uppercase).foregroundStyle(Palette.faint)
            .padding(.top, 12).padding(.bottom, 4)
            ForEach(exercise.sets) { s in
                let carry = s.done ? nil : GymSessionMath.carried(s, in: exercise)
                let kg: String = LiftWeight.shown(s.done ? s.kg : carry?.kg ?? s.plannedKg) ?? "–"
                let reps: String = (s.done ? s.reps : carry?.reps ?? s.plannedReps)?.nilIfBlank ?? "–"
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Text(s.warmup ? "W" : s.drop ? "↳" : s.side == "P" ? "" : s.number)
                        if let side = s.side { Text(verbatim: side).font(.caption.weight(.bold)).foregroundStyle(GymSides.color(side)) }
                        if s.done { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.green) }
                    }
                    .font(Typo.number(18)).foregroundStyle(s.done ? Palette.secondary : Palette.faint)
                    .frame(width: 40, alignment: .leading)
                    Text(GymSessionMath.lastTime(s, in: exercise, last: last) ?? "—").font(.footnote).foregroundStyle(Palette.faint)
                        .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    if s.row == editable {
                        TextField(kg, text: $typed)
                            .keyboardType(.decimalPad).multilineTextAlignment(.center)
                            .font(Typo.number(20)).foregroundStyle(Palette.ink)
                            .focused($focused)
                            .frame(width: 64, height: 32)
                            .background(Palette.track, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(focused ? Palette.amber : .clear, lineWidth: 1.5))
                            .onAppear { typed = kg == "–" ? "" : kg }
                    } else {
                        Text(kg).font(Typo.number(20)).foregroundStyle(s.done ? Palette.ink : Palette.faint).frame(width: 64)
                    }
                    Text(reps).font(Typo.number(20)).foregroundStyle(s.done ? Palette.ink : Palette.faint)
                        .lineLimit(1).minimumScaleFactor(0.7).frame(width: 52)
                }
                .padding(.vertical, 7)
            }
        }
        // Leaving the field: the weight goes to all the sets still to do.
        .onChange(of: focused) { was, now in
            guard was, !now, let onWeight, !typed.trimmingCharacters(in: .whitespaces).isEmpty else { return }
            onWeight(typed)
        }
    }
}

/// A set row swiped left: Smazat shows behind it, a long swipe deletes at once.
struct SwipeToDelete: ViewModifier {
    let enabled: Bool
    let onDelete: () -> Void
    @State private var offset: CGFloat = 0
    /// Where the row was when the drag began: closed or open on Smazat.
    @State private var base: CGFloat?
    private let width: CGFloat = 84

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .background(alignment: .trailing) {
                if offset < 0 {
                    Button { delete() } label: {
                        VStack(spacing: 2) {
                            Image(systemName: "trash").font(.system(size: 15, weight: .semibold))
                            Text("Smazat").font(Typo.caption.weight(.semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(width: -offset).frame(maxHeight: .infinity)
                        .background(Palette.red, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            // Clipped only while open: the amber frame of the set at hand stays whole.
            .clipShape(Rectangle().inset(by: offset < 0 ? 0 : -4))
            .simultaneousGesture(enabled ? DragGesture(minimumDistance: 16).onChanged { drag in
                let dx = drag.translation.width
                if base == nil {
                    guard abs(dx) > abs(drag.translation.height) else { return }
                    base = offset
                }
                offset = min(0, (base ?? 0) + dx)
            }.onEnded { drag in
                let dx = drag.translation.width
                guard base != nil else { return }
                base = nil
                withAnimation(.snappy) {
                    if offset < -width * 2.4 { offset = 0; onDelete() }
                    else { offset = offset < -width / 2 && dx < 0 ? -width : 0 }
                }
            } : nil)
            .onChange(of: enabled) { _, on in if !on { offset = 0 } }
    }

    private func delete() {
        withAnimation(.snappy) { offset = 0 }
        onDelete()
    }
}

/// Moje poznámka under an exercise's name: the note, or "+ Poznámka" to write
/// one. A tap opens ExerciseNoteSheet.
struct ExerciseNoteLine: View {
    let note: String?
    var compact = false
    var action: (() -> Void)? = nil

    var body: some View {
        if let note {
            let line = Label {
                Text(note).lineLimit(compact ? 1 : 3).multilineTextAlignment(.leading)
            } icon: {
                Image(systemName: "note.text")
            }
            .font(compact ? Typo.small.weight(.medium) : .subheadline.weight(.medium))
            .foregroundStyle(Palette.brown)
            if let action {
                Button(action: action) { line.contentShape(Rectangle()) }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.tr("Upravit poznámku"))
            } else {
                line
            }
        } else if let action {
            Button(action: action) {
                Label("Poznámka", systemImage: "plus").font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Přidat poznámku ke cviku"))
        }
    }
}

/// Writing Moje poznámka of an exercise, e.g. how the machine is set.
struct ExerciseNoteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let exercise: String
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 10) {
                TextField(L10n.tr("Třeba sedadlo 4, úzký úchop"), text: $text, axis: .vertical)
                    .lineLimit(3...6)
                    .focused($focused)
                    .padding(14)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Spacer()
            }
            .padding(20)
            .background(Palette.background)
            .navigationTitle(L10n.f("Poznámka · %@", exercise))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }.fontWeight(.semibold).disabled(saving)
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            text = ExerciseNotes.shared.note(exercise) ?? ""
            focused = true
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await ExerciseNotes.shared.save(text, for: exercise, api: model.api, demo: model.demo)
            dismiss()
        } catch {
            self.error = L10n.f("Poznámku se nepodařilo uložit: %@", error.localizedDescription)
        }
    }
}
