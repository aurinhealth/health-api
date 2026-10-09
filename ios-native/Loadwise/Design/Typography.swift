import SwiftUI

// Three typefaces, each with one job:
// - SF Pro (the system font) for all UI text, so Dynamic Type works;
// - Instrument Serif only for numbers;
// - Newsreader for sentences and text headings.
enum Typo {
    static func number(_ size: CGFloat) -> Font {
        .custom("InstrumentSerif-Regular", fixedSize: size)
    }

    static func sentence(_ size: CGFloat = 20, relativeTo style: Font.TextStyle = .title3) -> Font {
        .custom("Newsreader-Regular", size: size, relativeTo: style)
    }

    static func sentenceItalic(_ size: CGFloat = 20, relativeTo style: Font.TextStyle = .title3) -> Font {
        .custom("Newsreader-Italic", size: size, relativeTo: style)
    }

    static let body = Font.subheadline
    static let bodyStrong = Font.subheadline.weight(.medium)
    static let small = Font.footnote
    static let caption = Font.caption
    static let tiny = Font.caption2
}

/// Small spaced capitals above a section ("PLÁN DNE").
struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(verbatim: L10n.tr(text).uppercased(with: Fmt.locale))
            .font(.system(size: 12, weight: .medium))
            .tracking(1.9)
            .foregroundStyle(Palette.muted)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A big serif number followed by a small unit, e.g. "82,4 kg".
struct NumberText: View {
    let value: String
    var unit: String? = nil
    var size: CGFloat = 34
    var color: Color = Palette.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value).font(Typo.number(size)).foregroundStyle(color)
            if let unit {
                Text(unit).font(Typo.small).foregroundStyle(Palette.faint)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}
