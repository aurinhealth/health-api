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

    /// "8,4" (tonnes) or "18,5" (thousands of pounds), with its unit.
    static func volumeText(_ kg: Double) -> (value: String, unit: String) {
        Units.imperial ? (Fmt.decimal(Units.weight(kg) / 1000), "k lb") : (Fmt.decimal(kg / 1000), "t")
    }

    /// The work set of the same number last time: "77,5 × 8".
    static func lastTime(_ set: GymSet, in exercise: GymExercise, last: GymHistory.Session?) -> String? {
        guard !set.warmup, let last else { return nil }
        let work = exercise.sets.filter { !$0.warmup }
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
        exercise.sets.filter { $0.done && !$0.warmup }.map { set in
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
    static func muscleProgress(_ exercises: [GymExercise], muscles: [String: [String: Double]]) -> [(id: String, share: Double)] {
        var planned: [String: Double] = [:], done: [String: Double] = [:]
        for exercise in exercises {
            guard let map = muscles[exercise.name] else { continue }
            for (muscle, weight) in map where weight >= 0.5 {
                planned[muscle, default: 0] += Double(exercise.workCount)
                done[muscle, default: 0] += Double(exercise.doneCount)
            }
        }
        let top = planned.sorted { $0.value > $1.value }.prefix(4)
        var out: [(id: String, share: Double)] = []
        for (muscle, count) in top {
            let share: Double = min(1, (done[muscle] ?? 0) / max(1, count))
            out.append((id: muscle, share: share))
        }
        return out
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
    /// A ticked set's weight and reps changed afterwards (shown kg, reps).
    var onEdit: ((String, String) -> Void)? = nil
    var toggle: () -> Void = {}

    private enum Field { case kg, reps }
    @FocusState private var focus: Field?
    @State private var editKg = ""
    @State private var editReps = ""

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(label).font(.subheadline.weight(.semibold))
                    .foregroundStyle(state == .current ? Palette.amber : state == .next ? Palette.faint : Palette.secondary)
                    .frame(width: side == nil ? 26 : 16, alignment: .leading)
                if let side {
                    Text(verbatim: side).font(.caption.weight(.bold)).foregroundStyle(GymSides.color(side)).frame(width: 12)
                }
            }
            Text(lastTime ?? "—").font(.footnote).foregroundStyle(Palette.faint).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            field(kg, kgText, keyboard: .decimalPad, edit: $editKg, field: .kg)
            field(reps, repsText, keyboard: .numberPad, edit: $editReps, field: .reps).frame(width: 52)
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
    private func field(_ value: String, _ binding: Binding<String>?, keyboard: UIKeyboardType, edit: Binding<String>, field: Field) -> some View {
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
        } else if let binding, state == .current {
            TextField("–", text: binding)
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
                        .foregroundStyle(left == 0 ? Palette.green : Palette.ink)
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
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// "Celkem dnes": the plan's main muscles, each as a filled circle.
struct MuscleProgressCard: View {
    let items: [(id: String, share: Double)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Celkem dnes").font(Typo.small).foregroundStyle(Palette.muted)
            HStack {
                ForEach(items, id: \.id) { item in
                    VStack(spacing: 6) {
                        ZStack {
                            Circle().fill(Palette.track)
                            PieSlice(share: item.share).fill(Palette.amber)
                        }
                        .frame(width: 44, height: 44)
                        Text(BodyFigure.label(item.id)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                    .accessibilityValue(Text(verbatim: Fmt.int(item.share * 100) + " %"))
                }
            }
        }
        .padding(16)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct PieSlice: Shape {
    let share: Double

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard share > 0 else { return path }
        let center = CGPoint(x: rect.midX, y: rect.midY)
        path.move(to: center)
        path.addArc(center: center, radius: min(rect.width, rect.height) / 2, startAngle: .degrees(-90), endAngle: .degrees(-90 + 360 * min(1, share)), clockwise: false)
        path.closeSubpath()
        return path
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
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
        Button(action: action) {
            Image(systemName: measuring ? "heart.fill" : "heart.slash")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(measuring ? Palette.rust : Palette.faint)
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if measuring {
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
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "info").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.ink)
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
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
