import SwiftUI

/// The one empty state of the new design (redesign Z2): a value still being
/// learned, or one without data. The thresholds come from the server with
/// the value (workload-ratio.js `historyDays` and `needsDays`, the 21-day
/// calibration, own-vo2max.js, the readiness `learningDays`), never from the
/// app, so a screen and the coach always agree on when a value is ready.
struct LearningState: View {
    enum Per {
        case days, nights, workouts

        fileprivate var countKey: String {
            switch self {
            case .days: return "%lld dní"
            case .nights: return "%lld nocí"
            case .workouts: return "%lld tréninků"
            }
        }
    }

    enum Kind: Equatable {
        /// `have` of `need` days, nights or workouts so far.
        case learning(have: Int, need: Int, per: Per)
        /// Nothing to show: no source, no data in the period.
        case missing
    }

    let kind: Kind
    /// What the value is waiting for, in a sentence ("Load balance compares
    /// your last 7 days with your usual 4 weeks."), or why nothing shows.
    var text: String? = nil

    /// From the server's `historyDays` and `needsDays`; missing without them.
    static func kind(have: Int?, need: Int?, per: Per = .days) -> Kind {
        guard let need, need > 0 else { return .missing }
        return .learning(have: min(max(have ?? 0, 0), need), need: need, per: per)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch kind {
            case .learning(let have, let need, let per):
                Text(verbatim: L10n.tr("Aurin se učí tvoje obvyklé hodnoty")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                ProgressTrack(part: Double(have) / Double(max(need, 1)))
                HStack {
                    Text(verbatim: L10n.f("%@ z %@", String(have), L10n.plural(per.countKey, need)))
                    Spacer(minLength: 8)
                    if need > have { Text(verbatim: L10n.f("ještě %@", L10n.plural(per.countKey, need - have))) }
                }
                .font(Typo.caption).foregroundStyle(Palette.muted)
            case .missing:
                Text(verbatim: L10n.tr("Zatím tu nejsou data")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            }
            if let text {
                Text(verbatim: L10n.tr(text)).font(Typo.small).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// A thin ink bar on the track: how far along.
private struct ProgressTrack: View {
    let part: Double

    var body: some View {
        Capsule().fill(Palette.track)
            .frame(height: 6)
            .overlay(alignment: .leading) {
                GeometryReader { geo in
                    Capsule().fill(Palette.ink).frame(width: max(6, geo.size.width * min(max(part, 0), 1)))
                }
            }
            .accessibilityHidden(true)
    }
}
