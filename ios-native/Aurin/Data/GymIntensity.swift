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
        case "W": return L10n.tr("Před pracovními sériemi")
        case "T": return L10n.tr("Soustředění na techniku")
        case "E": return L10n.tr("Mírné úsilí, čistá opakování")
        case "M": return L10n.tr("Náročné, drž soustředění")
        case "H": return L10n.tr("Velmi těžké, blízko limitu")
        case "F": return L10n.tr("Ani jedno opakování navíc")
        case "PR": return L10n.tr("Víc než kdykoli předtím")
        default: return L10n.tr("Lehčí váha hned, bez pauzy")
        }
    }

    static func color(_ letter: String) -> Color {
        switch letter {
        case "W": return Palette.muted
        case "T": return Palette.blue
        case "E": return Palette.green
        // Not indigo: that is Ride and the superset (D-ZIVY-3).
        case "M": return Palette.coffee
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
    /// The live workout's bigger pill (608: easier to hit and to read).
    var large = false

    var body: some View {
        let shape = Capsule()
        Group {
            if let letter {
                Text(verbatim: letter).font((large ? Font.subheadline : .caption).weight(.bold))
                    .foregroundStyle(planned ? Palette.muted : Palette.ink)
                    .frame(minWidth: large ? 48 : 38, minHeight: large ? 32 : 24).padding(.horizontal, 2)
                    .overlay(shape.strokeBorder(GymIntensity.color(letter).opacity(planned ? 0.75 : 1),
                                                style: StrokeStyle(lineWidth: 1.5, dash: planned ? [3, 2.5] : [])))
            } else {
                shape.strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2.5]))
                    .frame(width: large ? 48 : 38, height: large ? 32 : 24)
                    // Live: the empty oval says what goes in it (617 C14).
                    .overlay {
                        if large {
                            Text(verbatim: "RPE").font(.caption2.weight(.semibold)).foregroundStyle(Palette.faint)
                                .accessibilityHidden(true)
                        }
                    }
            }
        }
    }
}

/// The letters with what they mean (tap on a set's letter): how hard first,
/// then the kind of set; the record is the app's, never picked (concept 08).
struct IntensitySheet: View {
    let title: String
    let selected: String?
    /// "Odebrat dropset" under the list, for a drop set not done yet.
    var onRemoveDrop: (() -> Void)? = nil
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Over the list, not in it: the scroll edge never blurs the title.
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Text("Jedna značka na sérii").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 20).padding(.top, 28).padding(.bottom, 10)
            ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                group(["E", "M", "H", "F"])
                Rectangle().fill(Palette.hairline).frame(height: 1).padding(.vertical, 10)
                group(["W", "T", "D"])
                if let onRemoveDrop {
                    Button(role: .destructive) {
                        onRemoveDrop()
                        dismiss()
                    } label: {
                        Text("Odebrat dropset").font(Typo.bodyStrong).foregroundStyle(Palette.red)
                            .frame(maxWidth: .infinity).frame(height: 46)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 20)
            }
        }
        // As tall as the list, near the thumb; large for big text.
        .presentationDetents([.height(onRemoveDrop == nil ? 600 : 654), .large])
        .presentationDragIndicator(.visible)
    }

    private func group(_ letters: [String]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(letters.enumerated()), id: \.element) { i, letter in
                let on = selected == letter
                Button {
                    onPick(letter)
                    dismiss()
                } label: {
                    HStack(spacing: 14) {
                        Text(verbatim: letter).font(.footnote.weight(.bold)).foregroundStyle(GymIntensity.color(letter))
                            .frame(minWidth: 40, minHeight: 30)
                            .overlay(Capsule().strokeBorder(GymIntensity.color(letter), lineWidth: 1.5))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(GymIntensity.name(letter)).font(Typo.body).foregroundStyle(Palette.ink)
                            Text(GymIntensity.hint(letter)).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                    }
                    .frame(minHeight: 56)
                    .padding(.horizontal, 10)
                    .background(on ? Palette.ink.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .top) {
                        if i > 0 && !on && selected != letters[i - 1] {
                            Rectangle().fill(Palette.hairline).frame(height: 1).padding(.horizontal, 10)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.horizontal, -10)
    }
}
