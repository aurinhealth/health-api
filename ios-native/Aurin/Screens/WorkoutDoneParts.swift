import SwiftUI

// MARK: - A workout's detail: the parts every sport shares (trenink-koncept)

/// The concept's header (`whero`): the sport's glowing disc, a done workout's
/// kind over the serif name ("GYM", "RIDE"), the line under it ("Today at
/// 17:30, 45 min", "Friday, November 20, 12:04 to 13:20") and what follows
/// (who recorded it).
struct WorkoutHero<Extra: View>: View {
    let sport: String
    var type: String? = nil
    var kind: String? = nil
    let title: String
    let line: String
    @ViewBuilder var extra: Extra

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            WorkoutHeroDisc(sport: sport, type: type)
            VStack(alignment: .leading, spacing: 3) {
                if let kind {
                    Text(verbatim: kind.uppercased(with: Fmt.locale)).font(.caption.weight(.medium)).tracking(1.6).foregroundStyle(Palette.muted)
                        .padding(.bottom, 1)
                }
                Text(verbatim: title).font(Typo.heading(34, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: line).font(Typo.small).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                extra
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension WorkoutHero where Extra == EmptyView {
    init(sport: String, type: String? = nil, kind: String? = nil, title: String, line: String) {
        self.init(sport: sport, type: type, kind: kind, title: title, line: line) { EmptyView() }
    }
}

/// The glowing header disc (`.dd`): the sport's colour with a soft shine, a
/// white figure, a halo in the sport's colour.
struct WorkoutHeroDisc: View {
    let sport: String
    var type: String? = nil

    var body: some View {
        let color = Palette.Sport.color(sport)
        Image(systemName: SportDisc.symbol(sport, type: type))
            .font(.system(size: 28, weight: .medium)).foregroundStyle(.white)
            .shadow(color: .black.opacity(0.18), radius: 1, y: 1)
            .frame(width: 60, height: 60)
            .background {
                Circle().fill(color.resolved(dark: false))
                    .overlay(Circle().fill(RadialGradient(colors: [.white.opacity(0.24), .clear], center: UnitPoint(x: 0.32, y: 0.22),
                                                          startRadius: 0, endRadius: 36)))
            }
            .shadow(color: color.opacity(0.44), radius: 8, x: -2, y: 3)
            .shadow(color: color.opacity(0.24), radius: 22)
            .accessibilityHidden(true)
    }
}

/// Workout details (`wst`): two columns, the number in the serif with its
/// unit, the label under it.
struct WorkoutStatsCard: View {
    struct Cell: Identifiable {
        let label: String
        let value: String
        var unit: String? = nil
        var note: String? = nil
        /// The note as a button (Energy: back to the device's calories).
        var noteAction: (() -> Void)? = nil
        var id: String { label }
    }

    let cells: [Cell]

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 18) {
            ForEach(cells) { cell in
                VStack(alignment: .leading, spacing: 4) {
                    NumberText(value: cell.value, unit: cell.unit, size: 30)
                    Text(verbatim: L10n.tr(cell.label)).font(Typo.small).foregroundStyle(Palette.muted)
                    if let note = cell.note {
                        if let action = cell.noteAction {
                            Button(action: action) {
                                Label(note, systemImage: "arrow.uturn.backward").labelStyle(TitleAndOptionalIcon(hasIcon: true))
                            }
                            .font(Typo.caption).foregroundStyle(Palette.muted).buttonStyle(.borderless)
                        } else {
                            Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(18)
        .cardSurface(cornerRadius: 20)
    }
}
