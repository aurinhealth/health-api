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
    /// keep their own plan. When that set went off the plan (adjustment) the
    /// next one takes the new weight and the plan's reps, unless the athlete
    /// kept the weight (keep: the rows of the sets whose change was declined).
    /// A set with its own plan keeps it: a weight or reps typed in ahead
    /// (typed), or a plan that differs from the set before's.
    /// On a first try (no history, the plan's weight is a guess) the sets
    /// before the first work set follow a warm-up done well off its plan,
    /// the warm-ups still to come included.
    static func carried(_ set: GymSet, in exercise: GymExercise, keep: Set<Int> = [], typed: Typed = Typed(),
                        firstTry: Bool = false) -> (kg: String?, reps: String?)? {
        guard let before = previous(set, in: exercise) else {
            return firstTry && !typed.kg.contains(set.row) ? fromWarmup(set, in: exercise).map { ($0, nil) } : nil
        }
        let sameKg = !typed.kg.contains(set.row) && set.plannedKg.flatMap(LiftWeight.number) == before.plannedKg.flatMap(LiftWeight.number)
        let sameReps = !typed.reps.contains(set.row)
            && repRange(set.plannedReps).map { [$0.lo, $0.hi] } == repRange(before.plannedReps).map { [$0.lo, $0.hi] }
        guard sameKg || sameReps else { return nil }
        if sameKg, !keep.contains(before.row), let change = adjustment(set, after: before) { return (change.kg, nil) }
        return (sameKg ? before.kg?.nilIfBlank : nil, sameReps ? before.reps?.nilIfBlank : nil)
    }

    /// The plan's weight scaled by how far the last warm-up done went off its
    /// own plan (warm-up 35 for 22.5: work 35.5 → 55), when off by 15 % or
    /// more; at most twice or half the plan, to the nearest 2.5 kg.
    static func fromWarmup(_ set: GymSet, in exercise: GymExercise) -> String? {
        guard !set.done, !set.drop, let plan = set.plannedKg.flatMap(LiftWeight.number), plan > 0,
              let warmup = exercise.sets.last(where: { $0.warmup && $0.done && $0.row < set.row && ($0.side == nil || $0.side == set.side) }),
              let done = warmup.kg.flatMap(LiftWeight.number), done > 0,
              let planned = warmup.plannedKg.flatMap(LiftWeight.number), planned > 0 else { return nil }
        let ratio = min(2, max(0.5, done / planned))
        guard abs(ratio - 1) >= 0.15 else { return nil }
        let kg = GymCoach.roundLoad(plan * ratio)
        return kg > 0 ? GymCoach.kgText(kg) : nil
    }

    /// The rows of the sets to come whose weight or reps were typed in ahead.
    struct Typed: Equatable {
        var kg: Set<Int> = []
        var reps: Set<Int> = []

        /// Rows moved by a set added or taken out (nil: the row is gone).
        mutating func move(_ to: (Int) -> Int?) {
            kg = Set(kg.compactMap(to))
            reps = Set(reps.compactMap(to))
        }
    }

    /// By sides, a weight changed by hand on one side: the rows that take it
    /// too. The other side's set of the same number while still to come, and
    /// that side's later work sets with the same plan (so they go on carrying
    /// from it). Rows typed in by hand keep their own weight; reps and letters
    /// stay per side.
    static func otherSide(of set: GymSet, in exercise: GymExercise, typed: Set<Int> = []) -> [Int] {
        guard set.work, let side = set.side,
              let twin = exercise.sets.first(where: { $0.work && !$0.done && $0.number == set.number && $0.side != nil && $0.side != side && !typed.contains($0.row) })
        else { return [] }
        let plan = twin.plannedKg.flatMap(LiftWeight.number)
        return exercise.sets.filter { s in
            s.row == twin.row || (s.work && !s.done && s.side == twin.side && s.row > twin.row && !typed.contains(s.row)
                && s.plannedKg.flatMap(LiftWeight.number) == plan)
        }.map(\.row)
    }

    /// The work set done just before this one, on the same side by sides. A
    /// set done as T (technique, lighter on purpose) does not lead the sets
    /// after it, unless they are T too: they go back to their own plan.
    static func previous(_ set: GymSet, in exercise: GymExercise) -> GymSet? {
        guard set.work else { return nil }
        let technique = GymIntensity.letter(set.intensity) == "T"
        return exercise.sets.last { $0.work && $0.done && $0.row < set.row && $0.side == set.side
            && (technique || GymIntensity.letter($0.intensity) != "T") }
    }

    /// A set's weight moved by how the set before went against the plan.
    struct Adjustment: Equatable {
        let kg: String
        let lighter: Bool
    }

    /// Short of the plan's reps, or to failure on a lighter plan (F on M):
    /// the weight the estimated max allows for the plan's reps and letter, to
    /// the nearest 2.5 kg. Well over the reps, or easier than planned (E on M
    /// or H): one 2.5 kg step up (more when far too light), but never when the athlete rated the set harder
    /// than the next one is planned (15 reps at M before an E set): the letter
    /// says more than the reps. Otherwise nil: the next set copies this one.
    static func adjustment(_ set: GymSet, after before: GymSet) -> Adjustment? {
        guard set.work, before.work, before.done,
              let kg = before.kg.flatMap(LiftWeight.number), kg > 0,
              let done = before.reps.flatMap(LiftWeight.number), done > 0,
              let range = repRange(set.plannedReps ?? before.plannedReps) else { return nil }
        // Reps in reserve: 10 − the letter's RPE (M 7.5 → 2.5, F → 0).
        let planned = 10 - (GymIntensity.letter(set.intensity).flatMap(GymIntensity.rpe).flatMap { Double($0) } ?? 8)
        let rpe = GymIntensity.letter(before.intensity).flatMap(GymIntensity.rpe).flatMap { Double($0) } ?? before.rpe.flatMap(LiftWeight.number)
        let reserve = rpe.map { 10 - $0 } ?? planned
        if done < Double(range.lo) || reserve + 2 <= planned {
            let best = kg * (1 + (done + reserve) / 30)
            let fits = GymCoach.roundLoad(best / (1 + (Double(range.lo) + planned) / 30))
            guard fits < kg, fits > 0 else { return nil }
            return Adjustment(kg: GymCoach.kgText(fits), lighter: true)
        }
        // Rated easy (E) before a set planned at M or harder: the weight
        // was too light, also on a first try of an exercise, where the plan's
        // weight is only a guess or there is none.
        let easy = reserve >= 4 && planned <= 2.5
        if reserve >= planned, done >= Double(range.hi + 2) || (done >= Double(range.hi) && (reserve >= planned + 2 || easy)) {
            // At least one step; far too light, the weight the estimated max
            // allows for the top of the range, by at most a quarter more.
            let best = kg * (1 + (done + reserve) / 30)
            let fits = GymCoach.roundLoad(min(best / (1 + (Double(range.hi) + planned) / 30), kg * 1.25))
            return Adjustment(kg: GymCoach.kgText(max(GymCoach.roundLoad(kg + GymCoach.step), fits)), lighter: false)
        }
        return nil
    }

    /// "8–12" → 8...12, "12" → 12...12.
    static func repRange(_ text: String?) -> (lo: Int, hi: Int)? {
        let numbers = (text ?? "").split { !$0.isNumber }.compactMap { Int($0) }
        guard let lo = numbers.first, lo > 0 else { return nil }
        return (lo, max(lo, numbers.last ?? lo))
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
        return lift(last.sets[position], machineLb: LiftUnits.pounds(exercise.name))
    }

    static func lift(_ lift: GymHistory.Lift, machineLb: Bool = false) -> String? {
        guard let reps = lift.reps else { return nil }
        guard let kg = lift.kg, kg > 0 else { return L10n.f("%@ op.", Fmt.int(reps)) }
        return GymCoach.shown(kg, machineLb: machineLb) + " × " + Fmt.int(reps)
    }

    /// The best set before today by the estimated one-rep max.
    static func record(_ exercise: GymHistory.Exercise?, before date: String) -> GymHistory.Lift? {
        guard let exercise else { return nil }
        let lifts: [GymHistory.Lift] = exercise.sessions.filter { $0.date < date }.flatMap { $0.sets }
        guard let best = lifts.max(by: { e1rm($0) < e1rm($1) }), e1rm(best) > 0 else { return nil }
        return best
    }

    /// Epley, only from sets up to 12 reps (as the server's records and
    /// Strong: more reps inflate it).
    static func e1rm(_ lift: GymHistory.Lift) -> Double {
        guard let kg = lift.kg, kg > 0, let reps = lift.reps, reps > 0, reps <= 12 else { return 0 }
        return reps == 1 ? kg : kg * (1 + reps / 30)
    }

    static func lifts(_ exercise: GymExercise) -> [GymHistory.Lift] {
        exercise.sets.filter { $0.done && $0.work }.map { set in
            GymHistory.Lift(kg: set.kg.flatMap(LiftWeight.number), reps: set.reps.flatMap(LiftWeight.number), target: nil, rpe: nil)
        }
    }

    /// Today against last time: "+2,5 kg", "+1 op." or "=".
    static func change(_ exercise: GymExercise, last: GymHistory.Session?) -> (text: String, better: Bool?)? {
        let now = lifts(exercise)
        guard let last, let top = now.compactMap(\.kg).max(), let before = GymCoach.topKg(last) else { return nil }
        if abs(top - before) > 0.01 {
            let sign: String = top > before ? "+" : "−"
            let lb = LiftUnits.pounds(exercise.name)
            let text: String = sign + GymCoach.shown(abs(top - before), machineLb: lb) + " " + LiftWeight.unit(machineLb: lb)
            return (text, top > before)
        }
        let repsNow = now.filter { $0.kg == top }.compactMap(\.reps).max() ?? 0
        let repsBefore = last.sets.filter { $0.kg == before }.compactMap(\.reps).max() ?? 0
        if repsNow != repsBefore {
            return (L10n.f("%@ op.", Fmt.signed(repsNow - repsBefore)), repsNow > repsBefore)
        }
        return ("=", nil)
    }
}

/// One row of the exercise's set table.
/// The ✦ line over the set at hand when the set before moved its weight
/// (GymSessionMath.adjustment), with "Nechat 12,5" to go on as before.
struct AdjustmentNote: View {
    let text: String
    let keep: String
    let onKeep: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            TwoLights(size: 14).accessibilityHidden(true)
            Text(text).font(Typo.caption).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onKeep) {
                Text(keep).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    .padding(.horizontal, 12).frame(height: 30)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .tapTarget(width: 60, height: 30)
        }
        .padding(.vertical, 4)
    }
}

/// Over the GymSetRow rows, in Režim tréninku and on the gym day.
struct GymSetTableHeader: View {
    // The same columns as GymSetRow, growing with the text size.
    @ScaledMetric(relativeTo: .subheadline) private var labelWidth: CGFloat = 26
    @ScaledMetric(relativeTo: .largeTitle) private var kgWidth: CGFloat = 64
    @ScaledMetric(relativeTo: .largeTitle) private var repsWidth: CGFloat = 52
    /// The exercise's name and whether it is in pounds (LiftUnits): the unit
    /// then opens a menu to switch it. Nil: the app's unit, no menu.
    var exercise: String? = nil
    var pounds = false
    /// The live workout's table: "Effort" over the letters, the 44 pt columns of GymSetRow(large:).
    var effort = false
    var onPounds: (Bool) -> Void = { _ in }

    var body: some View {
        HStack(spacing: effort ? 6 : 8) {
            // One line: "SETS" and "SÉRIE" are a little wider than the set numbers below.
            // In the live table "SÉRIE" may be wider than the set numbers: it takes what it needs.
            Text("Série").lineLimit(1).fixedSize().frame(minWidth: labelWidth, alignment: .leading)
            Text("Minule").lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
            unit.frame(width: kgWidth)
            Text("Opak.").lineLimit(1).fixedSize().frame(width: repsWidth)
            if effort {
                Text("Úsilí").lineLimit(1).fixedSize().frame(width: 44)
                Color.clear.frame(width: 44, height: 1)
            } else {
                Color.clear.frame(width: 40, height: 1)
                Color.clear.frame(width: 34, height: 1)
            }
        }
        .font(.caption2.weight(.medium)).textCase(.uppercase).foregroundStyle(Palette.faint)
        .padding(.horizontal, effort ? 8 : 10).padding(.bottom, 4)
    }

    @ViewBuilder
    private var unit: some View {
        let text = LiftWeight.unit(machineLb: pounds)
        if let exercise, !Units.imperial {
            Menu {
                Section(L10n.f("Jen pro %@, na telefonu i na hodinkách. Ukládá se v kg.", exercise)) {
                    Button { onPounds(false) } label: {
                        if pounds { Text("Kilogramy (kg)") } else { Label("Kilogramy (kg)", systemImage: "checkmark") }
                    }
                    Button { onPounds(true) } label: {
                        if pounds { Label("Libry (lb)", systemImage: "checkmark") } else { Text("Libry (lb)") }
                    }
                }
            } label: {
                HStack(spacing: 3) {
                    Text(verbatim: text)
                    Image(systemName: "chevron.down").scaledFont(8, weight: .bold, cap: .denseCap)
                }
                .foregroundStyle(pounds ? Palette.amber : Palette.faint)
                .frame(minWidth: 44, minHeight: 28)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(L10n.f("Jednotka váhy: %@", text))
        } else {
            Text(verbatim: text)
        }
    }
}

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
    /// The weight it would take ("17,5") and the planned reps ("5–8"), shown
    /// in the empty fields of the set at hand.
    var kgHint: String? = nil
    var repsHint: String? = nil
    /// A drop set: "↳" under the set it follows.
    var drop = false
    /// W T E M H F PR D (GymIntensity.swift); planned: still the plan's.
    var intensity: String? = nil
    var planned = false
    /// The letter tapped: its sheet. Nil shows no letter column.
    var onIntensity: (() -> Void)? = nil
    /// A ticked set's weight and reps changed afterwards, or a set to come's
    /// typed in ahead (shown kg, reps).
    var onEdit: ((String, String) -> Void)? = nil
    /// A barbell's weight: tapping it loads plates (PlateLoaderSheet) instead of typing.
    var onKgTap: (() -> Void)? = nil
    /// The live workout: the letter and the tick each 44 × 44 pt (D-ZIVY-4), rows stay 44 pt.
    var large = false
    var toggle: () -> Void = {}

    private enum Field { case kg, reps }
    @FocusState private var focus: Field?
    // The columns grow with the text size, as the numbers in them do (Typo.number).
    @ScaledMetric(relativeTo: .subheadline) private var labelWidth: CGFloat = 26
    @ScaledMetric(relativeTo: .largeTitle) private var kgWidth: CGFloat = 64
    @ScaledMetric(relativeTo: .largeTitle) private var repsWidth: CGFloat = 52
    @ScaledMetric(relativeTo: .largeTitle) private var fieldHeight: CGFloat = 34
    @State private var editKg = ""
    @State private var editReps = ""

    var body: some View {
        HStack(spacing: large ? 6 : 8) {
            HStack(spacing: 6) {
                Text(label).font(.subheadline.weight(.semibold))
                    .foregroundStyle(drop ? GymIntensity.color("D") : state == .current ? Palette.amber : state == .next ? Palette.faint : Palette.secondary)
                    .frame(width: side == nil ? labelWidth : labelWidth - 10, alignment: .leading)
                if let side {
                    Text(verbatim: side).font(.caption.weight(.bold)).foregroundStyle(GymSides.color(side)).frame(width: 12)
                }
            }
            Text(lastTime ?? "—").font(.footnote).foregroundStyle(Palette.faint).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            field(kg, kgText, keyboard: .decimalPad, edit: $editKg, field: .kg, hint: kgHint)
            field(reps, repsText, keyboard: .numberPad, edit: $editReps, field: .reps, hint: repsHint).frame(width: repsWidth)
            if let onIntensity {
                Button(action: onIntensity) {
                    IntensityPill(letter: intensity, planned: planned)
                        .opacity(state == .next ? 0.6 : 1)
                        .frame(width: large ? 44 : 40, height: large ? 44 : 40)
                        .tapTarget(width: 40, height: 40)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(intensity.map { GymIntensity.name($0) } ?? L10n.tr("Bez hodnocení"))
                .accessibilityHint(L10n.tr("Jak těžká série byla"))
            }
            Button(action: toggle) {
                Group {
                    if state == .done {
                        Image(systemName: "checkmark").scaledFont(13, weight: .bold, cap: .denseCap).foregroundStyle(Palette.onAccent)
                            .frame(width: 30, height: 30).background(Palette.green, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(state == .current ? Palette.amber : Palette.hairline, lineWidth: 1.5)
                            .frame(width: 30, height: 30)
                    }
                }
                .frame(width: large ? 44 : 34, height: large ? 44 : 40)
                .tapTarget(width: 34, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr(state == .done ? "Vrátit sérii" : "Série hotová"))
        }
        .padding(.horizontal, large ? 8 : 10)
        .padding(.vertical, large ? 0 : 5)
        .frame(minHeight: 44)
        .background(state == .current ? Palette.track : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(state == .current ? Palette.amber.opacity(0.55) : .clear, lineWidth: 1.5) }
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
        if state != .current, onEdit != nil {
            // A ticked set stays editable: tap the number to fix it. A set to
            // come too, in a faint frame: its weight or reps typed in ahead.
            TextField("–", text: edit)
                .keyboardType(keyboard)
                .multilineTextAlignment(.center)
                .font(Typo.number(22))
                .foregroundStyle(state == .next && focus != field ? Palette.faint : Palette.ink)
                .focused($focus, equals: field)
                .frame(width: kgWidth, height: fieldHeight)
                .background(focus == field ? Palette.card : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    if state == .next, focus != field, !large {
                        RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Palette.hairline, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    }
                }
        } else if field == .kg, state == .current, let onKgTap {
            Button(action: onKgTap) {
                Text(binding?.wrappedValue.nilIfBlank ?? (value.isEmpty ? "–" : value))
                    .font(Typo.number(22))
                    .foregroundStyle(Palette.ink)
                    .frame(width: kgWidth, height: fieldHeight)
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
                .frame(width: kgWidth, height: fieldHeight)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            Text(value.isEmpty ? "–" : value).font(Typo.number(22))
                .foregroundStyle(state == .next ? Palette.faint : Palette.ink)
                .frame(width: kgWidth)
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

/// Nothing to see: calls `onChange` on each new heart rate, so the screen
/// around it doesn't read (and redraw with) every beat.
struct HeartRateWatch: View {
    let live: LiveWorkout
    let onChange: () -> Void

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .onChange(of: live.heartRate) { _, _ in onChange() }
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

/// The small "i" beside an exercise in the rest: how it is done. A 30 pt
/// circle in its own 44 × 44 pt to tap (laid out 44 wide, 30 high, so its row
/// stays as tall as before), so two side by side don't share a finger.
struct SmallInfoButton: View {
    var label = "Technika"
    var systemImage = "info"
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 30, height: 30).background(Palette.track, in: Circle())
                .frame(width: 44).tapTarget(width: 44, height: 30)
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
    /// The warm-up, cardio or stretching that was on the screen.
    var part: GymDayPart? = nil
    /// It waited for its Start ("Na řadě").
    var waiting = false
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
                Image(systemName: "dumbbell.fill").scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.rust)
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

    /// "Pauza 0:40, další Dřep", or the exercise.
    private func line(at now: Date) -> String? {
        if let end = gym.restEnd, end > now {
            let s = Int(end.timeIntervalSince(now).rounded(.up))
            let rest = L10n.f("Pauza %@", String(format: "%d:%02d", s / 60, s % 60))
            return gym.next.map { rest + ", " + L10n.f("další %@", $0) } ?? rest
        }
        return gym.next
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
                            Image(systemName: "trash").scaledFont(15, weight: .semibold)
                            Text("Smazat").font(Typo.caption.weight(.semibold))
                        }
                        .foregroundStyle(Palette.onAccent)
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
            .navigationTitle(L10n.f("Poznámka: %@", exercise))
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
