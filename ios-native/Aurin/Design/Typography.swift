import SwiftUI

// Three typefaces, each with one job:
// - SF Pro (the system font) for all UI text, so Dynamic Type works;
// - Instrument Serif only for numbers;
// - Newsreader for sentences and text headings.
enum Typo {
    /// Grows with the text size like a large title: the same at the default
    /// size, and the screens cap it (DynamicTypeSize.screenCap).
    static func number(_ size: CGFloat) -> Font {
        .custom("InstrumentSerif-Regular", size: size, relativeTo: .largeTitle)
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

extension DynamicTypeSize {
    /// The largest text size the screens follow; past it the big numbers and
    /// the cards would no longer fit.
    static let screenCap: DynamicTypeSize = .accessibility1
    /// Dense parts with a fixed size (the strain dial, small panel widgets).
    static let denseCap: DynamicTypeSize = .xxxLarge
}

/// Small spaced capitals above a section ("PLÁN DNE").
struct SectionLabel: View {
    let text: String

    var body: some View {
        // Caption: 12 pt at the default size, growing with the text size.
        Text(verbatim: L10n.tr(text).uppercased(with: Fmt.locale))
            .font(.caption.weight(.medium))
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
