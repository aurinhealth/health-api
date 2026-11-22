import SwiftUI

// The pieces of the live gym screen (Režim tréninku) in the redesign's look
// (concept 08, rezim-1-serie and rezim-5-zivy, approved 2026-11-16): the
// stats panel, the exercise segments under the header, the rest between the
// set rows, the pinned button and the folded cards of the rest of the workout.

/// Time, heart rate, calories and volume over the sets, with the heart rate
/// zone as a bar, its number and its range ("Zone 3 123 to 139 bpm") and what
/// measures the heart. Without a heart rate source its cell and the bar are
/// not there at all (D-ZIVY-7, as before the redesign).
struct LiveStatsPanel: View {
    let live: LiveWorkout
    /// kg × reps of the done sets.
    var volume: Double = 0
    /// The heart rate zones' lower bounds, zone 1 first (empty: no bar).
    var zoneLows: [Double] = []

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 0) {
                    // "Total", not "Time": the header's time is the exercise's (D-ZIVY-2).
                    cell(L10n.tr("Celkem"), Self.clock(live, at: context.date), nil)
                    if let bpm = live.heartRate {
                        divider
                        cell(L10n.tr("Tep"), Fmt.int(bpm), "bpm")
                    }
                    divider
                    cell(L10n.tr("Kalorie"), live.kcal.map { Fmt.int($0) } ?? "–", "kcal")
                    divider
                    cell(L10n.tr("Objem"), Fmt.int(Units.weight(volume)), Units.imperial ? "lb" : "kg")
                }
                // The dividers would otherwise take all the height the list
                // under the panel leaves free (608: a tall empty tile).
                .fixedSize(horizontal: false, vertical: true)
                if let bpm = live.heartRate, !zoneLows.isEmpty {
                    let zone = zoneLows.lastIndex { bpm >= $0 } ?? 0
                    HStack(spacing: 3) {
                        ForEach(zoneLows.indices, id: \.self) { i in
                            Capsule().fill(Palette.Zone.color(i).opacity(i == zone ? 1 : 0.25))
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 12).padding(.top, 2)
                    HStack(spacing: 6) {
                        Circle().fill(Palette.Zone.color(zone)).frame(width: 6, height: 6)
                        Text(verbatim: L10n.f("Zóna %@", String(zone + 1))).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                        Text(verbatim: Self.range(zone, lows: zoneLows)).font(Typo.caption).foregroundStyle(Palette.muted)
                        Spacer(minLength: 6)
                        if let source = live.heartSource {
                            Text(verbatim: source).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                    .lineLimit(1)
                    .padding(.horizontal, 12).padding(.top, 7).padding(.bottom, 10)
                }
            }
            .cardSurface(cornerRadius: 18)
        }
        .accessibilityElement(children: .combine)
    }

    /// "123 to 139 bpm", the last zone "from 170 bpm".
    static func range(_ zone: Int, lows: [Double]) -> String {
        let low = Fmt.int(lows[zone])
        guard let next = lows[safe: zone + 1] else { return L10n.f("od %@ bpm", low) }
        return L10n.f("%@ až %@ bpm", low, Fmt.int(next - 1))
    }

    static func clock(_ live: LiveWorkout, at now: Date) -> String {
        guard live.clockStart != nil else { return "0:00" }
        return TrainingModeView.clock(Int(live.elapsed(at: now)))
    }

    private var divider: some View { Rectangle().fill(Palette.hairline).frame(width: 1).padding(.vertical, 10) }

    private func cell(_ title: String, _ value: String, _ unit: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value).font(Typo.number(25)).monospacedDigit().foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
                if let unit { Text(unit).font(Typo.tiny).foregroundStyle(Palette.muted).lineLimit(1) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 9)
    }
}

/// One dash per exercise under the header: done green, the one under way
/// amber as far as its sets go, the rest grey (concept: "segments green done,
/// amber current").
struct ExerciseSegments: View {
    let exercises: [GymExercise]
    let current: Int?

    var body: some View {
        HStack(spacing: 3) {
            ForEach(exercises.indices, id: \.self) { i in
                let e = exercises[i]
                let done = e.workCount > 0 && e.doneCount >= e.workCount
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(done ? Palette.green : Palette.track)
                        if !done, i == current {
                            let share = e.workCount > 0 ? Double(e.doneCount) / Double(e.workCount) : 0
                            Capsule().fill(Palette.amber).frame(width: max(8, geo.size.width * share))
                        }
                    }
                }
            }
        }
        .frame(height: 4)
        .accessibilityElement()
        .accessibilityLabel(current.map { L10n.f("Cvik %@ z %@", String($0 + 1), String(exercises.count)) } ?? L10n.plural("%lld cviků", exercises.count))
    }
}

/// Between two set rows: a hairline with the rest in the middle. A rest that
/// was taken shows its length in ink, a planned one in grey, the rest running
/// now fills the line in green and counts down.
struct LiveRestGap: View {
    /// Seconds: taken or planned; nil or 0 draws only the hairline.
    var seconds: Int?
    var taken = false
    /// The rest running here: its end and length.
    var end: Date? = nil
    var total: Int = 0

    var body: some View {
        if let end {
            // Ticks on the rest's own seconds, as the pinned button does, so
            // the two clocks never show 0:55 and 0:56 at once (608).
            TimelineView(.periodic(from: end.addingTimeInterval(-TimeInterval(total)), by: 1)) { context in
                let left = max(0, Int(end.timeIntervalSince(context.date).rounded(.up)))
                let share = total > 0 ? 1 - Double(left) / Double(total) : 1
                line(TrainingModeView.clock(left), strong: true, fill: share)
            }
            .accessibilityLabel(L10n.f("Pauza, zbývá %@", TrainingModeView.clock(max(0, Int(end.timeIntervalSinceNow)))))
        } else if let seconds, seconds > 0 {
            line(TrainingModeView.clock(seconds), strong: taken, fill: nil)
                .accessibilityLabel(L10n.f(taken ? "Pauza %@" : "Pauza podle plánu %@", TrainingModeView.clock(seconds)))
        } else {
            Rectangle().fill(Palette.hairline).frame(height: 1).padding(.horizontal, 6)
                .accessibilityHidden(true)
        }
    }

    private func line(_ text: String, strong: Bool, fill: Double?) -> some View {
        HStack(spacing: 10) {
            hair(fill: fill.map { min(1, $0 * 2) })
            Text(verbatim: text).font(Typo.caption.weight(strong ? .semibold : .regular)).monospacedDigit()
                .foregroundStyle(strong ? Palette.ink : Palette.muted)
            hair(fill: fill.map { max(0, $0 * 2 - 1) })
        }
        .frame(height: 18)
        .padding(.horizontal, 6)
    }

    /// Half of the line: the green fill runs left to right across both halves.
    private func hair(fill: Double?) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(Palette.hairline).frame(height: 1)
                if let fill { Rectangle().fill(Palette.green).frame(width: geo.size.width * fill, height: 2) }
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: 2)
    }
}

/// The pinned button while a rest runs: "Start set 3" with the time left,
/// filling as the rest goes; a tap starts the set now. −15 s and +15 s on the
/// sides shorten or lengthen only this rest.
struct LiveRestButton: View {
    let title: String
    let end: Date
    let total: Int
    let shift: (Int) -> Void
    let start: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            side("−15 s", label: "Zkrátit pauzu o 15 sekund") { shift(-15) }
            Button(action: start) {
                TimelineView(.periodic(from: end.addingTimeInterval(-TimeInterval(total)), by: 1)) { context in
                    let left = max(0, Int(end.timeIntervalSince(context.date).rounded(.up)))
                    let share = total > 0 ? 1 - Double(left) / Double(total) : 1
                    HStack {
                        Text(verbatim: title).font(Typo.bodyStrong).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 8)
                        // Each second rolls the digits that change; the old
                        // number never fades through the new one (608).
                        Text(verbatim: TrainingModeView.clock(left)).font(Typo.number(30)).monospacedDigit()
                            .contentTransition(.numericText(countsDown: true))
                            .animation(.snappy(duration: 0.25), value: left)
                    }
                    .foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 22)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(alignment: .leading) {
                        GeometryReader { geo in
                            // Only the fill glides over the second.
                            Rectangle().fill(Palette.green.opacity(0.45)).frame(width: geo.size.width * share)
                                .animation(.linear(duration: 1), value: share)
                        }
                    }
                    .background(Palette.button)
                    .clipShape(Capsule())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityValue(TrainingModeView.clock(max(0, Int(end.timeIntervalSinceNow))))
            .accessibilityHint(L10n.tr("Ukončí pauzu"))
            side("+15 s", label: "Prodloužit pauzu o 15 sekund") { shift(15) }
        }
    }

    private func side(_ text: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: text).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                .frame(width: 50, height: 50)
                .chromeGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// The two layers of an exercise's sets (like Bevel): History and Technique on
/// top, the table on a lighter card, Each side and Add set under it.
struct LiveSetCard<Table: View>: View {
    /// The name with a fold arrow on top, for an exercise opened in place.
    var title: String? = nil
    var onFold: (() -> Void)? = nil
    let onHistory: () -> Void
    let onTechnique: () -> Void
    /// "Each side" or "Both sides"; nil: no such button (a set by sides can't change).
    var sidesTitle: String? = nil
    var onSides: () -> Void = {}
    let onAddSet: () -> Void
    var disabled = false
    @ViewBuilder var table: Table

    var body: some View {
        VStack(spacing: 0) {
            if let title {
                Button { onFold?() } label: {
                    HStack {
                        Text(title).font(Typo.bodyStrong.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(2)
                        Spacer(minLength: 8)
                        if onFold != nil {
                            Image(systemName: "chevron.up").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
                        }
                    }
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(onFold == nil)
                .accessibilityHint(onFold == nil ? "" : L10n.tr("Sbalí cvik"))
            }
            pair(L10n.tr("Historie"), onHistory, L10n.tr("Technika"), onTechnique)
            table
                .padding(.vertical, 6).padding(.horizontal, 2)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            pair(sidesTitle, onSides, "+ " + L10n.tr("Přidat sérii"), onAddSet)
                .disabled(disabled)
        }
        .padding(4)
        .background(Palette.track, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func pair(_ left: String?, _ leftAction: @escaping () -> Void, _ right: String, _ rightAction: @escaping () -> Void) -> some View {
        HStack(spacing: 0) {
            Group {
                if let left {
                    Button(action: leftAction) { label(left) }.buttonStyle(.plain)
                } else {
                    Color.clear
                }
            }
            .frame(maxWidth: .infinity)
            Rectangle().fill(Palette.hairline).frame(width: 1, height: 16)
            Button(action: rightAction) { label(right) }.buttonStyle(.plain).frame(maxWidth: .infinity)
        }
        .frame(height: 44)
    }

    private func label(_ text: String) -> some View {
        Text(verbatim: text).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
    }
}

/// The slim row over or under the open exercise: "3 done 25:02" in green,
/// "6 upcoming Next Walking lunge" neutral. A tap unfolds what it holds.
struct LiveListRow: View {
    let title: String
    let detail: String
    var done = false
    let open: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 8) {
                Text(verbatim: title).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(verbatim: detail).font(Typo.caption).monospacedDigit().foregroundStyle(Palette.muted).lineLimit(1)
                Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 12).frame(minHeight: 44)
            .background(done ? Palette.greenSoft : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(L10n.tr(open ? "Sbalí seznam" : "Rozbalí seznam"))
    }
}

/// An exercise or a part that is done, folded to one green row: "Back squat,
/// 4 sets in 10:12" with the volume, or "Warm-up, 5 moves in 5:10". A tap
/// opens it in place.
struct LiveDoneRow: View {
    let title: String
    let detail: String
    /// The big number on the right: the volume or the part's time.
    let value: String
    var unit: String? = nil
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(Typo.bodyStrong.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(2)
                    Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(verbatim: value).font(Typo.number(22)).monospacedDigit().foregroundStyle(Palette.ink)
                    if let unit { Text(verbatim: unit).font(Typo.tiny).foregroundStyle(Palette.muted) }
                }
                Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Palette.greenSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Palette.green.opacity(0.35), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(L10n.tr("Otevře cvik"))
    }
}

/// An exercise still to come (or the one under way while another is open),
/// folded: its name and "3 × 10, 180 kg", Swap and Technique, the arrow. No
/// photo (Petr). A tap opens it in place.
struct LiveFoldedCard: View {
    let title: String
    let detail: String
    /// "Now" in amber on the exercise under way while another one is open.
    var now = false
    var onSwap: (() -> Void)? = nil
    var onTechnique: (() -> Void)? = nil
    let open: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Button(action: open) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(Typo.bodyStrong.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(2)
                        Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    if now {
                        Text("Teď").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(L10n.tr("Otevře cvik"))
            if let onSwap { round("arrow.up.arrow.down", label: "Nahradit cvik", action: onSwap) }
            if let onTechnique { round("info", label: "Technika", action: onTechnique) }
            Button(action: open) {
                Image(systemName: "chevron.down").font(.caption2.weight(.bold)).foregroundStyle(Palette.faint)
                    .frame(width: 28, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHidden(true)
        }
        .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 4)
        .cardSurface(cornerRadius: 16)
    }

    private func round(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.footnote.weight(.semibold)).foregroundStyle(Palette.secondary)
                .frame(width: 32, height: 32).background(Palette.track, in: Circle())
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// Two exercises of a superset clasped together: a thin violet edge around
/// each and the violet "Superset A" tag on the seam (concept option C).
struct LiveSupersetClasp<First: View, Second: View>: View {
    let letter: String
    @ViewBuilder var first: First
    @ViewBuilder var second: Second

    var body: some View {
        VStack(spacing: 12) {
            first.overlay { edge }
            second.overlay { edge }
                .overlay(alignment: .top) {
                    Text(verbatim: L10n.f("Supersérie %@", letter)).font(Typo.tiny.weight(.semibold)).foregroundStyle(Palette.indigo)
                        .padding(.horizontal, 8).frame(height: 18)
                        .background(Palette.background, in: Capsule())
                        .overlay { Capsule().stroke(Palette.indigo.opacity(0.55), lineWidth: 1) }
                        .offset(y: -15)
                        .accessibilityHidden(true)
                }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.f("Supersérie %@", letter))
    }

    private var edge: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Palette.indigo.opacity(0.5), lineWidth: 1.2)
            .allowsHitTesting(false)
    }
}

/// The exercise's (or part's) own time under the header's title.
struct HeadClock: View {
    let live: LiveWorkout
    let key: String

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let time = TrainingModeView.clock(live.seconds(of: key, at: context.date))
            // Paused (concept 08): the time stands, in amber.
            Text(verbatim: live.pausedAt == nil ? time : L10n.f("Pozastaveno na %@", time))
                .font(Typo.small.weight(.medium)).monospacedDigit()
                .foregroundStyle(live.pausedAt == nil ? Palette.secondary : Palette.amber)
        }
        .accessibilityLabel(Text("Čas"))
        .accessibilityValue(live.pausedAt == nil ? TrainingModeView.clock(live.seconds(of: key))
                            : L10n.f("Pozastaveno na %@", TrainingModeView.clock(live.seconds(of: key))))
    }
}

/// Start workout (concept 08): 3, 2, 1 over the first part or exercise, then
/// it starts; a tap anywhere starts it now, Cancel goes back.
struct StartCountdown: View {
    /// "Warm-up", or the workout when it starts with an exercise.
    let title: String
    /// The first move or exercise.
    let first: String?
    let live: LiveWorkout
    let onStart: () -> Void
    let onCancel: () -> Void
    @State private var left = 3

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            VStack(spacing: 10) {
                Text(verbatim: L10n.f("%@ začne za", title)).font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                Text(verbatim: "\(left)").font(Typo.heading(120, relativeTo: .largeTitle)).monospacedDigit()
                    .foregroundStyle(Palette.ink).contentTransition(.numericText(countsDown: true))
                if let first {
                    Text(verbatim: first).font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.center)
                }
                if let bpm = live.heartRate {
                    HStack(spacing: 6) {
                        Circle().fill(Palette.green).frame(width: 7, height: 7).accessibilityHidden(true)
                        Text(verbatim: live.heartSource.map { L10n.f("%@ bpm z %@", Fmt.int(bpm), $0) } ?? L10n.f("%@ bpm", Fmt.int(bpm)))
                            .font(Typo.small).foregroundStyle(Palette.secondary)
                    }
                    .padding(.top, 6)
                }
                Text("Klepnutím kamkoli začneš hned").font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 24)
            }
            .padding(.horizontal, 24)
        }
        .overlay(alignment: .topLeading) {
            Button(action: onCancel) {
                Text("Zrušit").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 16).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .padding(.leading, 4)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onStart)
        .accessibilityAction(named: Text("Začít hned"), onStart)
        .accessibilityAddTraits(.isModal)
        .task {
            while left > 0 {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                if left == 1 { onStart(); return }
                withAnimation(.snappy) { left -= 1 }
            }
        }
    }
}
