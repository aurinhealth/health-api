import SwiftUI
import UIKit

// One type scale with two typefaces (Petr 2026-11-16, redesign Z1):
// - SF Pro (the system font) for all UI text and the coach chat, on the
//   system text styles, so Dynamic Type works;
// - Instrument Serif (OFL, Resources/Fonts/OFL-InstrumentSerif.txt) for
//   headings, the big numbers and the coach cards, its italic for the coach's
//   green key sentence.
// Nothing is set below 11 pt.
enum Typo {
    /// Grows with the text size like a large title: the same at the default
    /// size, and the screens cap it (DynamicTypeSize.screenCap).
    static func number(_ size: CGFloat) -> Font {
        .custom("InstrumentSerif-Regular", size: size, relativeTo: .largeTitle)
    }

    /// The live workout's numbers read from afar (Petr 2026-11-23, an exception
    /// like the nutrients table): the set table and the rest countdown in SF Pro
    /// with tabular digits, so they keep their width as they change.
    static func tabular(_ style: Font.TextStyle, weight: Font.Weight = .semibold) -> Font {
        .system(style, weight: weight).monospacedDigit()
    }

    /// A heading or a big title, 22 pt and up, growing like the text style
    /// nearest to its size unless one is given.
    static func heading(_ size: CGFloat, relativeTo style: Font.TextStyle? = nil) -> Font {
        .custom("InstrumentSerif-Regular", size: size, relativeTo: style ?? Font.TextStyle.nearest(size))
    }

    /// The coach's words on a card (Today, Training, Food, Health): serif.
    static func coach(_ size: CGFloat = 20, relativeTo style: Font.TextStyle = .title3) -> Font {
        .custom("InstrumentSerif-Regular", size: size, relativeTo: style)
    }

    /// The coach's key sentence, green italic on a coach card.
    static func sentenceItalic(_ size: CGFloat = 20, relativeTo style: Font.TextStyle = .title3) -> Font {
        .custom("InstrumentSerif-Italic", size: size, relativeTo: style)
    }

    /// A sentence of UI text (an explanation, an empty state, a message):
    /// SF Pro on the system text style nearest to `size` (body for 17 to 19,
    /// title 3 for 20 and 21), so it follows Dynamic Type like any UI text.
    static func sentence(_ size: CGFloat = 17, relativeTo style: Font.TextStyle? = nil) -> Font {
        .system(style ?? Font.TextStyle.nearest(size))
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

extension EnvironmentValues {
    /// The iPhone's text size before the screens' cap (RootView): long text
    /// such as the coach's messages follows it past screenCap (audit 20.b1).
    @Entry var fullTypeSize: DynamicTypeSize? = nil
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
    /// What VoiceOver says instead of the value and unit ("7 hodin 12 minut" for "7:12 h").
    var spoken: String? = nil

    var body: some View {
        if let spoken {
            number.accessibilityElement(children: .ignore).accessibilityLabel(spoken)
        } else {
            number
        }
    }

    private var number: some View {
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
