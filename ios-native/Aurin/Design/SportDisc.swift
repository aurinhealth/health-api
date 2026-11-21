import SwiftUI

/// A sport in its disc, as the Training concept draws it (trenink-koncept,
/// `.si`): the sport's colour as a soft fill with the sport's figure in full
/// colour. A session still ahead is paler, a missed one grey, a rest day a
/// quiet dot. Never a ring: the state is the strength of the fill.
struct SportDisc: View {
    enum State { case done, ahead, missed, rest }

    let sport: String
    var type: String? = nil
    var state: State = .done
    var size: CGFloat = 44
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let dark = scheme == .dark
        let color = Palette.Sport.color(sport)
        ZStack {
            switch state {
            case .rest:
                Circle().fill(Palette.ink.opacity(0.045))
                Circle().fill(Palette.muted.opacity(0.55)).frame(width: max(4, size * 0.16), height: max(4, size * 0.16))
            case .missed:
                Circle().fill(Palette.ink.opacity(dark ? 0.08 : 0.07))
                glyph.foregroundStyle(Palette.muted).opacity(0.45)
            case .ahead:
                Circle().fill(color.opacity(dark ? 0.08 : 0.07))
                glyph.foregroundStyle(color).opacity(dark ? 0.74 : 0.62)
            case .done:
                Circle().fill(color.opacity(dark ? 0.24 : 0.15))
                glyph.foregroundStyle(color)
            }
        }
        .frame(width: size, height: size)
    }

    private var glyph: some View {
        Image(systemName: Self.symbol(sport, type: type))
            .font(.system(size: size * 0.5, weight: .medium))
            .accessibilityHidden(true)
    }

    /// The concept's figures (one set for the whole app, consistency point 3):
    /// gym is the lifting figure, not a dumbbell.
    static func symbol(_ sport: String, type: String? = nil) -> String {
        switch sport.lowercased() {
        case "strength", "gym", "weighttraining": return "figure.strengthtraining.traditional"
        case "yoga": return "figure.yoga"
        case "hike", "hiking": return "figure.hiking"
        default: return SportIcon.symbol(sport, type: type)
        }
    }
}

extension SportDisc.State {
    /// A calendar session's state ("done", "planned", "missed").
    init(status: String) {
        switch status {
        case "done": self = .done
        case "missed": self = .missed
        default: self = .ahead
        }
    }
}
