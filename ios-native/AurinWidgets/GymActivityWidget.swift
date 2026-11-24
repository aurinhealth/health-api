import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// The gym Live Activity in the redesign's look (concept 2026-11-22): on the
/// lock screen a card with the gym's disc, the workout's name, its total time
/// and heart rate, the rest counting down in serif amber with the next set
/// (+30 s, Přeskočit pauzu), then the set with Série hotová, or a part of the
/// day (cardio, warm-up, stretching) with its clock and Hotovo. In the Dynamic
/// Island, as before (Petr 2026-11-22): heart rate and the rest's countdown,
/// or during the set "×8" by the dumbbell and "80 kg"; beside another app's
/// activity the gym's disc with the rest draining around it, or "80" over
/// "×8". The buttons run in the app (GymActivityInbox). Once the rest's end
/// passes, the activity is stale and shows the set.
struct GymActivityWidget: Widget {
    var body: some WidgetConfiguration {
        // From iOS 18 the same activity also shows in the watch's Smart Stack.
        if #available(iOS 18.0, *) {
            return Self.activity().supplementalActivityFamilies([.small])
        } else {
            return Self.activity()
        }
    }

    static func activity() -> some WidgetConfiguration {
        ActivityConfiguration(for: GymActivityAttributes.self) { context in
            // The lock screen gives the card about 160 pt: anything taller is cut.
            GymActivityPresentation(context: context)
                .activitySystemActionForegroundColor(Palette.ink)
        } dynamicIsland: { context in
            let resting = GymActivityCard.resting(context)
            return DynamicIsland {
                // The rest (or the part's clock) big on the left, read at a glance; the stats on the right.
                DynamicIslandExpandedRegion(.leading) {
                    GymActivityClock(context: context, resting: resting, size: 34).padding(.leading, 4).padding(.top, 2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    GymActivityStats(context: context, vertical: true).padding(.trailing, 4).padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(GymActivityCard.islandLine(context, resting: resting))
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                        GymSegments(values: context.state.segments).padding(.top, 10)
                        GymActivityButtons(context: context, resting: resting, short: true).padding(.top, 12)
                    }
                    .padding(.horizontal, 4)
                    .environment(\.colorScheme, .dark)
                }
            } compactLeading: {
                // During the set the reps sit by the dumbbell ("×8"), the weight on the right.
                // The dumbbell in the gym's mint, as everywhere else in the app (617 C20).
                if !resting, context.state.part == nil, let reps = context.state.reps {
                    HStack(spacing: 4) {
                        Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.Sport.gym).environment(\.colorScheme, .dark)
                        Text("×" + reps).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).monospacedDigit()
                            .lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: 58, alignment: .leading)
                } else if let bpm = context.state.heartRate {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill").font(.system(size: 11)).foregroundStyle(Palette.rust)
                        Text("\(bpm)").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).monospacedDigit()
                    }
                } else {
                    Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.Sport.gym).environment(\.colorScheme, .dark)
                }
            } compactTrailing: {
                if resting, let start = context.state.restStart, let end = context.state.restEnd {
                    GymRestTimer(start: start, end: end, size: 17).frame(maxWidth: 46)
                } else if context.state.part != nil {
                    GymPartTimer(state: context.state, stale: context.isStale, size: 17).frame(maxWidth: 52)
                } else if let short = context.state.reps != nil ? (context.state.weight ?? context.state.setShort) : context.state.load {
                    // "250,5 kg" shrinks rather than being cut; without a weight, "2/4".
                    Text(short).font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(context.state.weight == nil && context.state.reps != nil ? Palette.muted : .white)
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: 58, alignment: .trailing)
                }
            } minimal: {
                // Shown when another app's Live Activity shares the island (music, a call…):
                // the gym's disc with the rest draining around it, so it reads as the
                // workout (Petr 2026-11-22); during the set "80" over "×8".
                if resting, let start = context.state.restStart, let end = context.state.restEnd {
                    ZStack {
                        ProgressView(timerInterval: min(start, end)...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                            .progressViewStyle(.circular).tint(Palette.amberBar)
                        GymDisc(size: 16)
                    }
                    .frame(width: 26, height: 26)
                } else if context.state.part == nil, let reps = context.state.reps {
                    VStack(spacing: -1) {
                        if let weight = context.state.weight {
                            Text(weight.components(separatedBy: " ").first ?? weight)
                                .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                        }
                        Text("×" + reps).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.amberBar)
                    }
                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                    .frame(maxWidth: 34)
                } else {
                    GymDisc(size: 22)
                }
            }
            .keylineTint(Palette.amberBar)
        }
    }
}

/// The lock screen's card, or on the watch the rest or the set in a few lines.
struct GymActivityPresentation: View {
    let context: ActivityViewContext<GymActivityAttributes>

    var body: some View {
        if #available(iOS 18.0, *) {
            GymActivityFamily(context: context)
        } else {
            card
        }
    }

    var card: some View {
        GymActivityCard(context: context)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .activityBackgroundTint(Palette.card.opacity(0.9))
    }
}

@available(iOS 18.0, *)
private struct GymActivityFamily: View {
    let context: ActivityViewContext<GymActivityAttributes>
    @Environment(\.activityFamily) private var family

    var body: some View {
        if family == .small {
            GymActivitySmall(context: context)
                .activityBackgroundTint(.black)
        } else {
            GymActivityPresentation(context: context).card
        }
    }
}

/// On the watch: the rest counting down with the next set, or the set with its load.
struct GymActivitySmall: View {
    let context: ActivityViewContext<GymActivityAttributes>

    var body: some View {
        let s = context.state
        let labels = context.attributes.labels
        let resting = GymActivityCard.resting(context)
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                GymDisc(size: 14)
                Text(resting ? labels.rest.uppercased() : (s.partDetail ?? s.setLabel).uppercased())
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(resting ? Palette.amberBar : .gray)
                Spacer(minLength: 2)
                if let bpm = s.heartRate {
                    Image(systemName: "heart.fill").font(.system(size: 9)).foregroundStyle(Palette.rust)
                    Text("\(bpm)").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white).monospacedDigit()
                }
            }
            if resting, let start = s.restStart, let end = s.restEnd {
                GymRestTimer(start: start, end: end, size: 26)
                Text(labels.next + ": " + s.exercise + ", " + s.load)
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(.white)
            } else if let part = s.part {
                Text(part).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                GymPartTimer(state: s, stale: context.isStale, size: 24)
            } else {
                Text(s.exercise).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                Text(s.load).font(.system(size: 18, weight: .semibold)).foregroundStyle(.white).monospacedDigit()
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(10)
        .environment(\.colorScheme, .dark)
    }
}

struct GymActivityCard: View {
    let context: ActivityViewContext<GymActivityAttributes>

    static func resting(_ context: ActivityViewContext<GymActivityAttributes>) -> Bool {
        guard let end = context.state.restEnd, context.state.restStart != nil else { return false }
        return !context.isStale && end > Date()
    }

    /// "Další: Dřep, série 3 ze 4, 80 kg × 8", without "Další" during the set;
    /// during a part what it is, then the set after it.
    static func islandLine(_ context: ActivityViewContext<GymActivityAttributes>, resting: Bool) -> String {
        let s = context.state
        let line = s.exercise + ", " + s.setLabel + ", " + s.load
        if s.part != nil {
            let what = label(context, resting: false)
            return s.exercise.isEmpty ? what : what + ", " + context.attributes.labels.then.lowercased() + " " + s.exercise
        }
        return resting ? context.attributes.labels.next + ": " + line : line
    }

    var body: some View {
        let s = context.state
        let labels = context.attributes.labels
        let resting = Self.resting(context)
        VStack(alignment: .leading, spacing: 0) {
            // The gym's disc and the workout's name, its total time and heart
            // rate (no icons, no kcal: the card has about 160 pt).
            HStack(spacing: 8) {
                GymDisc(size: 18)
                Text(s.title ?? s.header).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 4)
                GymActivityStats(context: context).layoutPriority(1)
            }
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(Self.label(context, resting: resting).uppercased()).font(.system(size: 11, weight: .medium)).tracking(1.5)
                        .foregroundStyle(resting ? Palette.amberBar : Palette.muted).lineLimit(1)
                    if s.part == nil && !resting {
                        Text(s.exercise).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
                            .lineLimit(1).minimumScaleFactor(0.7).padding(.top, 2)
                        Text(s.load).font(W.number(26)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                    } else {
                        GymActivityClock(context: context, resting: resting, size: 40)
                    }
                }
                Spacer(minLength: 4)
                if let side = Self.side(context, resting: resting) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(side.label).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.muted)
                        if let name = side.name {
                            Text(name).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                        }
                        Text(side.load).font(W.number(20)).foregroundStyle(Palette.ink)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.bottom, 2)
                }
            }
            .padding(.top, 6)
            GymSegments(values: s.segments).padding(.top, 8)
            GymActivityButtons(context: context, resting: resting, short: false).padding(.top, 8)
        }
    }

    /// "Rest", the part with what it holds ("Cardio, Zone 2"), or the set ("set 3 of 4").
    static func label(_ context: ActivityViewContext<GymActivityAttributes>, resting: Bool) -> String {
        let s = context.state
        if resting { return context.attributes.labels.rest }
        if let part = s.part { return [part, s.partDetail].compactMap { $0 }.joined(separator: ", ") }
        return s.setLabel
    }

    /// The right side: during the rest or a part the set that comes ("Next,
    /// set 3 of 4", Squat, 80 kg × 8); during the set what follows it.
    static func side(_ context: ActivityViewContext<GymActivityAttributes>, resting: Bool) -> (label: String, name: String?, load: String)? {
        let s = context.state
        let labels = context.attributes.labels
        if resting || s.part != nil {
            guard !s.exercise.isEmpty else { return nil }
            return ((resting ? labels.next : labels.then) + ", " + s.setLabel, s.exercise, s.load)
        }
        guard let then = s.then else { return nil }
        let parts = then.components(separatedBy: ", ")
        return (labels.then, parts.first, parts.dropFirst().joined(separator: ", "))
    }
}

/// The rest counting down in amber, or a part's clock (down to its end, else up).
struct GymActivityClock: View {
    let context: ActivityViewContext<GymActivityAttributes>
    let resting: Bool
    let size: CGFloat

    var body: some View {
        if resting, let start = context.state.restStart, let end = context.state.restEnd {
            GymRestTimer(start: start, end: end, size: size)
        } else if context.state.part != nil {
            GymPartTimer(state: context.state, stale: context.isStale, size: size)
        }
    }
}

/// A part's time: left until its end, or run since its start (no limit).
struct GymPartTimer: View {
    let state: GymActivityAttributes.ContentState
    let stale: Bool
    let size: CGFloat

    var body: some View {
        Group {
            if let end = state.partEnd, !stale, end > Date() {
                Text(timerInterval: min(state.partStart ?? Date(), end)...end, countsDown: true)
            } else if let start = state.partStart, state.partEnd == nil {
                Text(timerInterval: start...Date.distantFuture, countsDown: false)
            } else {
                Text(verbatim: "0:00")
            }
        }
        .font(W.number(size)).foregroundStyle(Palette.ink).monospacedDigit()
        .frame(maxWidth: size * 2.6, alignment: .leading)
    }
}

/// The gym's sport disc as the app draws it (SportDisc): its colour as a soft
/// fill with the dumbbell in full colour.
struct GymDisc: View {
    let size: CGFloat

    var body: some View {
        Image(systemName: "dumbbell.fill").font(.system(size: size * 0.5, weight: .medium)).foregroundStyle(Palette.Sport.gym)
            .frame(width: size, height: size)
            .background(Palette.Sport.gym.opacity(0.24), in: Circle())
            .accessibilityHidden(true)
    }
}

/// The workout's total time and heart rate, words and units in place of icons.
struct GymActivityStats: View {
    let context: ActivityViewContext<GymActivityAttributes>
    var vertical = false

    var body: some View {
        let layout = vertical ? AnyLayout(VStackLayout(alignment: .trailing, spacing: 2)) : AnyLayout(HStackLayout(spacing: 10))
        layout {
            HStack(spacing: 4) {
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                    .monospacedDigit().multilineTextAlignment(.trailing).frame(maxWidth: 52, alignment: .trailing)
                Text(context.attributes.labels.total).foregroundStyle(Palette.muted)
            }
            if let bpm = context.state.heartRate {
                Text("\(bpm) bpm").monospacedDigit()
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Palette.secondary)
        .lineLimit(1)
    }
}

/// The rest counting down by itself ("1:24").
struct GymRestTimer: View {
    let start: Date
    let end: Date
    let size: CGFloat

    var body: some View {
        Text(timerInterval: min(start, end)...end, countsDown: true)
            .font(W.number(size)).foregroundStyle(Palette.amberBar).monospacedDigit()
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: size * 2.6, alignment: .leading)
    }
}

/// One bar per exercise, filled by its sets done (amber, as on the live screen).
struct GymSegments: View {
    let values: [Double]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(values.indices, id: \.self) { i in
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.ink.opacity(0.14))
                        Capsule().fill(Palette.amberBar).frame(width: geo.size.width * min(1, max(0, values[i])))
                    }
                }
                .frame(height: 5)
            }
        }
        .frame(height: 5)
    }
}

/// +30 s and Přeskočit pauzu during the rest, Série hotová during the set, Hotovo during a part.
struct GymActivityButtons: View {
    let context: ActivityViewContext<GymActivityAttributes>
    let resting: Bool
    let short: Bool

    var body: some View {
        let labels = context.attributes.labels
        HStack(spacing: 8) {
            if resting {
                Button(intent: GymRestExtendIntent()) { pill(labels.plus, primary: false) }.buttonStyle(.plain)
                Button(intent: GymRestSkipIntent()) { pill(short ? labels.skip : labels.skipRest, primary: true) }.buttonStyle(.plain)
            } else if let done = context.state.partDone {
                Button(intent: GymPartDoneIntent()) { pill(done, primary: true) }.buttonStyle(.plain)
            } else if let row = context.state.row {
                Button(intent: GymSetDoneIntent(row: row)) { pill(labels.setDone, primary: true) }.buttonStyle(.plain)
            }
        }
    }

    private func pill(_ text: String, primary: Bool) -> some View {
        // The lock screen card is short; the Dynamic Island keeps the taller pills.
        Text(text).font(.system(size: 14, weight: .semibold))
            .foregroundStyle(primary ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: short ? 40 : 32)
            .background(primary ? Palette.button : Palette.ink.opacity(0.12), in: Capsule())
    }
}
