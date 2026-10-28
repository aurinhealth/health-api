import Charts
import SwiftUI

/// A structured workout as blocks over time, like Intervals.icu: the width is
/// the time, the height the intensity (% FTP or % threshold pace), the colour
/// its zone. Touching or dragging over it shows the block under the finger.
struct WorkoutProfile: View {
    struct Segment: Identifiable {
        let id: Int
        let start: Double
        let end: Double
        let percent: Double
        let step: PlannedWorkout.Step
    }

    let blocks: [PlannedWorkout.Block]
    let sport: String
    /// The small one in lists: no axis, no touch.
    var compact = false
    @State private var cursor: Double?

    nonisolated static func segments(_ blocks: [PlannedWorkout.Block]) -> [Segment] {
        var out: [Segment] = [], t = 0.0
        for block in blocks {
            for _ in 0..<max(1, block.repeats ?? 1) {
                for step in block.steps ?? [] {
                    let minutes = (step.durationSeconds ?? 0) / 60
                    guard minutes > 0 else { continue }
                    let lo = step.percentLow ?? step.percentHigh ?? 50, hi = step.percentHigh ?? lo
                    out.append(Segment(id: out.count, start: t, end: t + minutes, percent: (lo + hi) / 2, step: step))
                    t += minutes
                }
            }
        }
        return out
    }

    /// Coggan zones on % of threshold.
    static func color(_ percent: Double) -> Color {
        switch percent {
        case ..<56: return Palette.faint
        case ..<76: return Palette.blue
        case ..<91: return Palette.green
        case ..<106: return Palette.amber
        case ..<121: return Palette.rust
        case ..<151: return Palette.indigo
        default: return Palette.ink
        }
    }

    var body: some View {
        let segments = Self.segments(blocks)
        let total = segments.last?.end ?? 1
        let top = max(130, (segments.map(\.percent).max() ?? 100) + 10)
        let picked = cursor.flatMap { c in segments.first { c >= $0.start && c < $0.end } ?? (c >= total ? segments.last : nil) }

        VStack(alignment: .leading, spacing: 10) {
            if !compact {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let picked {
                        Text(verbatim: Self.length(picked)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: value(picked)).font(Typo.small).foregroundStyle(Self.color(picked.percent))
                    } else {
                        Text(verbatim: Fmt.duration(Int(total.rounded()))).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    }
                    Spacer()
                }
            }
            Chart {
                ForEach(segments) { s in
                    RectangleMark(xStart: .value("Od", s.start), xEnd: .value("Do", s.end),
                                  yStart: .value("Spodek", 0), yEnd: .value("Intenzita", s.percent))
                        .foregroundStyle(Self.color(s.percent).opacity(picked == nil || picked?.id == s.id ? 1 : 0.55))
                }
                if let picked {
                    RuleMark(x: .value("Minuta", (picked.start + picked.end) / 2)).foregroundStyle(Palette.ink.opacity(0.7))
                }
            }
            .chartXScale(domain: 0...total)
            .chartYScale(domain: 0...top)
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                    AxisValueLabel().foregroundStyle(Palette.faint)
                }
            }
            .chartXAxis(compact ? .hidden : .visible)
            .chartXSelection(value: compact ? Binding<Double?>.constant(nil) : $cursor)
            .frame(height: compact ? 28 : 130)
            .allowsHitTesting(!compact)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: L10n.f("Průběh tréninku, %@", Fmt.duration(Int(total.rounded())))))
    }

    static func length(_ s: Segment) -> String {
        let seconds = (s.end - s.start) * 60
        return seconds >= 60 ? Fmt.duration(Int((seconds / 60).rounded())) : Fmt.int(seconds) + " s"
    }

    private func value(_ s: Segment) -> String {
        let pct = Fmt.int(s.percent) + Fmt.percentSign
        if sport == "run", let slow = s.step.paceSlow, let fast = s.step.paceFast {
            return ZonesSettingsView.pace(Units.pace((slow + fast) / 2)) + " " + Units.paceUnit + " (" + pct + ")"
        }
        if let lo = s.step.wattsLow, let hi = s.step.wattsHigh {
            return Fmt.int((lo + hi) / 2) + " W (" + pct + ")"
        }
        return pct
    }
}
