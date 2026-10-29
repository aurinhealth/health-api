import SwiftUI
import UIKit

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

extension View {
    /// The system font at `size` pt at the default text size, growing with the
    /// iPhone's text size like `style` (by default the text style nearest to
    /// `size`), up to `cap`. Icons in a fixed frame and dense rows pass
    /// `cap: .denseCap`.
    func scaledFont(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default,
                    relativeTo style: Font.TextStyle? = nil, cap: DynamicTypeSize = .screenCap) -> some View {
        modifier(ScaledSystemFont(size: size, weight: weight, design: design, style: style ?? Font.TextStyle.nearest(size), cap: cap))
    }
}

private struct ScaledSystemFont: ViewModifier {
    @Environment(\.dynamicTypeSize) private var typeSize
    let size: CGFloat
    let weight: Font.Weight
    let design: Font.Design
    let style: Font.TextStyle
    let cap: DynamicTypeSize

    func body(content: Content) -> some View {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(min(typeSize, cap)))
        let scaled = UIFontMetrics(forTextStyle: style.uiKit).scaledValue(for: size, compatibleWith: traits)
        content.font(.system(size: scaled, weight: weight, design: design))
    }
}

extension Font.TextStyle {
    /// The text style whose default size is closest to `size`.
    static func nearest(_ size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<11.5: return .caption2
        case ..<12.5: return .caption
        case ..<13.5: return .footnote
        case ..<15.5: return .subheadline
        case ..<16.5: return .callout
        case ..<19.5: return .body
        case ..<21.5: return .title3
        case ..<25: return .title2
        case ..<31: return .title
        default: return .largeTitle
        }
    }

    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        default: return .body
        }
    }
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
