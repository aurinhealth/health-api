import SwiftUI

/// The names, hints and colours of the letters (WatchShared/GymSheet.swift).
extension GymIntensity {
    static func name(_ letter: String) -> String {
        switch letter {
        case "W": return L10n.tr("Rozcvička")
        case "T": return L10n.tr("Technika")
        case "E": return L10n.tr("Snadná")
        case "M": return L10n.tr("Střední")
        case "H": return L10n.tr("Těžká")
        case "F": return L10n.tr("Selhání")
        case "PR": return L10n.tr("Osobní rekord")
        default: return L10n.tr("Dropset")
        }
    }

    static func hint(_ letter: String) -> String {
        switch letter {
        case "W": return L10n.tr("Minimální úsilí")
        case "T": return L10n.tr("Soustředění na techniku")
        case "E": return L10n.tr("Mírné úsilí, čistá opakování")
        case "M": return L10n.tr("Náročné, drž soustředění")
        case "H": return L10n.tr("Velmi těžké, blízko limitu")
        case "F": return L10n.tr("Ani jedno opakování navíc")
        case "PR": return L10n.tr("Víc než kdykoli předtím")
        default: return L10n.tr("Lehčí váha hned bez pauzy")
        }
    }

    static func color(_ letter: String) -> Color {
        switch letter {
        case "W": return Palette.muted
        case "T": return Palette.blue
        case "E": return Palette.green
        case "M": return Palette.indigo
        case "H": return Palette.amber
        case "F": return Palette.red
        case "PR": return Palette.gold
        default: return Palette.pink
        }
    }
}

/// The letter of a set in its table: solid once chosen or done, dashed while
/// it is the plan's, an empty dashed box when there is none.
struct IntensityPill: View {
    let letter: String?
    var planned = false

    var body: some View {
        let shape = Capsule()
        Group {
            if let letter {
                Text(verbatim: letter).font(.caption.weight(.bold))
                    .foregroundStyle(planned ? Palette.muted : Palette.ink)
                    .frame(minWidth: 38, minHeight: 24).padding(.horizontal, 2)
                    .overlay(shape.strokeBorder(GymIntensity.color(letter).opacity(planned ? 0.75 : 1),
                                                style: StrokeStyle(lineWidth: 1.5, dash: planned ? [3, 2.5] : [])))
            } else {
                shape.strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2.5]))
                    .frame(width: 38, height: 24)
            }
        }
    }
}

/// The eight letters with what they mean (tap on a set's letter).
struct IntensitySheet: View {
    let title: String
    let selected: String?
    /// "Odebrat dropset" under the list, for a drop set not done yet.
    var onRemoveDrop: (() -> Void)? = nil
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.bottom, 6)
                ForEach(GymIntensity.letters, id: \.self) { letter in
                    Button {
                        onPick(letter)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(GymIntensity.name(letter)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                Text(GymIntensity.hint(letter)).font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            Spacer(minLength: 8)
                            IntensityPill(letter: letter)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 11)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(selected == letter ? Palette.amber.opacity(0.7) : .clear, lineWidth: 1.5)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected == letter ? .isSelected : [])
                }
                if let onRemoveDrop {
                    Button(role: .destructive) {
                        onRemoveDrop()
                        dismiss()
                    } label: {
                        Text("Odebrat dropset").font(Typo.bodyStrong).foregroundStyle(Palette.red)
                            .frame(maxWidth: .infinity).frame(height: 46)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}
