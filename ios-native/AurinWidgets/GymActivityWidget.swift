import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// The gym Live Activity: on the lock screen a card, light or dark as the phone, with the workout's
/// clock, heart rate and kcal, the rest counting down with the next set (+30 s,
/// Přeskočit pauzu), then the set with Série hotová; in the Dynamic Island the
/// rest's countdown, or during the set "×8" by the dumbbell and "80 kg" (or
/// "2/4"). The buttons run in the app (GymActivityInbox). Once the rest's end
/// passes, the activity is stale and shows the set.
struct GymActivityWidget: Widget {
    var body: some WidgetConfiguration { Self.activity() }

    static func activity() -> some WidgetConfiguration {
        ActivityConfiguration(for: GymActivityAttributes.self) { context in
            // The lock screen gives the card about 160 pt: anything taller is cut.
            GymActivityPresentation(context: context)
                .activitySystemActionForegroundColor(Palette.ink)
        } dynamicIsland: { context in
            let resting = GymActivityCard.resting(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    GymActivityStats(context: context).padding(.leading, 4).padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if resting, let start = context.state.restStart, let end = context.state.restEnd {
                        GymRestTimer(start: start, end: end, size: 30).padding(.trailing, 4)
                    }
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
                if !resting, let reps = context.state.reps {
                    HStack(spacing: 4) {
                        Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.amberBar)
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
                    Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(Palette.amberBar)
                }
            } compactTrailing: {
                if resting, let start = context.state.restStart, let end = context.state.restEnd {
                    GymRestTimer(start: start, end: end, size: 17).frame(maxWidth: 46)
                } else if let short = context.state.reps != nil ? (context.state.weight ?? context.state.setShort) : context.state.load {
                    // "250,5 kg" shrinks rather than being cut; without a weight, "2/4".
                    Text(short).font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(context.state.weight == nil && context.state.reps != nil ? Palette.muted : .white)
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                        .frame(maxWidth: 58, alignment: .trailing)
                }
            } minimal: {
                if resting, let start = context.state.restStart, let end = context.state.restEnd {
                    GymRestTimer(start: start, end: end, size: 14).frame(maxWidth: 36)
                } else {
                    Image(systemName: "dumbbell.fill").font(.system(size: 12)).foregroundStyle(Palette.amberBar)
                }
            }
            .keylineTint(Palette.amberBar)
        }
    }
}

/// The same activity in the Apple Watch's Smart Stack (iOS 18): the small
/// family, where the lock screen's card does not fit.
@available(iOS 18.0, *)
struct GymActivityWatchWidget: Widget {
    var body: some WidgetConfiguration {
        GymActivityWidget.activity().supplementalActivityFamilies([.small])
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
                Image(systemName: "dumbbell.fill").font(.system(size: 11)).foregroundStyle(Palette.amberBar)
                Text(resting ? labels.rest.uppercased() : s.setLabel.uppercased())
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(resting ? Palette.amberBar : .gray)
                Spacer(minLength: 2)
                if let bpm = s.heartRate {
                    Image(systemName: "heart.fill").font(.system(size: 9)).foregroundStyle(Palette.rust)
                    Text("\(bpm)").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white).monospacedDigit()
                }
            }
            if resting, let start = s.restStart, let end = s.restEnd {
                GymRestTimer(start: start, end: end, size: 26)
                Text(labels.next + ": " + s.exercise + " · " + s.load)
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(.white)
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

    /// "Další: Dřep · série 3 ze 4 · 80 kg × 8", without "Další" during the set.
    static func islandLine(_ context: ActivityViewContext<GymActivityAttributes>, resting: Bool) -> String {
        let s = context.state
        let line = s.exercise + " · " + s.setLabel + " · " + s.load
        return resting ? context.attributes.labels.next + ": " + line : line
    }

    var body: some View {
        let s = context.state
        let labels = context.attributes.labels
        let resting = Self.resting(context)
        VStack(alignment: .leading, spacing: 0) {
            // The clock, heart rate and kcal, with "2 ze 5 cviků" (no Aurin
            // line: the card has no room for it).
            HStack(spacing: 8) {
                AurinMark().frame(width: 14, height: 14)
                GymActivityStats(context: context).layoutPriority(1)
                Spacer(minLength: 4)
                // "2 ze 5 cviků" of "Posilovna · 2 ze 5 cviků".
                Text(s.header.components(separatedBy: " · ").last ?? s.header).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            HStack(alignment: .bottom, spacing: 10) {
                if resting, let start = s.restStart, let end = s.restEnd {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(labels.rest.uppercased()).font(.system(size: 11, weight: .medium)).tracking(1.5).foregroundStyle(Palette.amberBar)
                        GymRestTimer(start: start, end: end, size: 36)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(labels.next + " · " + s.setLabel).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.muted)
                        Text(s.exercise).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                        Text(s.load).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.bottom, 2)
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.setLabel.uppercased()).font(.system(size: 11, weight: .medium)).tracking(1.5).foregroundStyle(Palette.muted)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(s.exercise).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
                            Text(s.load).font(W.number(24)).foregroundStyle(Palette.ink)
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 4)
                    if let then = s.then {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(labels.then).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.muted)
                            Text(then).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.secondary)
                        }
                        .lineLimit(1)
                        .padding(.bottom, 4)
                    }
                }
            }
            .padding(.top, 8)
            GymSegments(values: s.segments).padding(.top, 8)
            GymActivityButtons(context: context, resting: resting, short: false).padding(.top, 10)
        }
    }
}

/// The workout's running clock, heart rate and kcal.
struct GymActivityStats: View {
    let context: ActivityViewContext<GymActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            HStack(spacing: 5) {
                Image(systemName: "clock").font(.system(size: 12)).foregroundStyle(Palette.muted)
                Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                    .monospacedDigit().frame(maxWidth: 56, alignment: .leading)
            }
            if let bpm = context.state.heartRate {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").font(.system(size: 11)).foregroundStyle(Palette.rust)
                    Text("\(bpm)").monospacedDigit()
                }
            }
            if let kcal = context.state.kcal {
                Text("\(kcal) kcal").foregroundStyle(Palette.muted)
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Palette.secondary)
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

/// One bar per exercise, filled by its sets done.
struct GymSegments: View {
    let values: [Double]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(values.indices, id: \.self) { i in
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.ink.opacity(0.14))
                        Capsule().fill(Palette.green).frame(width: geo.size.width * min(1, max(0, values[i])))
                    }
                }
                .frame(height: 5)
            }
        }
        .frame(height: 5)
    }
}

/// +30 s and Přeskočit pauzu during the rest, Série hotová during the set.
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
            } else if let row = context.state.row {
                Button(intent: GymSetDoneIntent(row: row)) { pill(labels.setDone, primary: true) }.buttonStyle(.plain)
            }
        }
    }

    private func pill(_ text: String, primary: Bool) -> some View {
        // The lock screen card is short; the Dynamic Island keeps the taller pills.
        Text(text).font(.system(size: 14, weight: .semibold))
            .foregroundStyle(primary ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: short ? 40 : 34)
            .background(primary ? Palette.button : Palette.ink.opacity(0.12), in: Capsule())
    }
}

/// Aurin's mark: a ring with an arc, in amber.
struct AurinMark: View {
    var body: some View {
        GeometryReader { geo in
            let k = min(geo.size.width, geo.size.height) / 24
            ZStack {
                Circle().inset(by: 1.2 * k).stroke(Palette.amber, lineWidth: 2.4 * k)
                Path { p in
                    p.move(to: CGPoint(x: 5 * k, y: 15 * k))
                    p.addCurve(to: CGPoint(x: 19 * k, y: 15 * k), control1: CGPoint(x: 8 * k, y: 10 * k), control2: CGPoint(x: 16 * k, y: 10 * k))
                }
                .stroke(Palette.amber, style: StrokeStyle(lineWidth: 2.4 * k, lineCap: .round))
            }
        }
    }
}
