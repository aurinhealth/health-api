import SwiftUI

/// The rounded paper card every widget sits on.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
            .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
    }
}

/// Widget header: a coloured dot and the widget name.
struct WidgetHeader: View {
    let title: String
    let color: Color
    var appleHealth = false
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: 7) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.secondary).lineLimit(1)
            if appleHealth { HealthKitTag() }
            Spacer(minLength: 4)
            if let trailing {
                Text(trailing).font(Typo.caption).foregroundStyle(Palette.faint).lineLimit(1)
            }
        }
    }
}

struct HealthKitTag: View {
    var body: some View {
        Text("HK")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.7)
            .foregroundStyle(Color(light: 0xC2410C, dark: 0xF6A06B))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Color(light: 0xFDE8DC, dark: 0x3A2214), in: RoundedRectangle(cornerRadius: 5))
            .accessibilityLabel("Apple Health")
    }
}

/// Small rounded status label next to a number ("vysoká", "cíl 12–14").
struct Pill: View {
    let text: String
    var foreground: Color = Palette.green
    var background: Color = Palette.greenSoft

    var body: some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(background, in: Capsule())
    }
}

/// Thin progress bar used for macros and goals.
struct ProgressLine: View {
    let fraction: Double
    var color: Color = Palette.amberBar
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Capsule().fill(color).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Round outlined icon button used in screen headers.
struct CircleButton: View {
    let systemImage: String
    let label: String
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
        }
        .foregroundStyle(Palette.ink)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// Two-column grid for widgets: wide widgets span both columns.
struct WidgetGrid<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 12) { content }
    }
}

/// Two small widgets side by side.
struct WidgetRow<Left: View, Right: View>: View {
    @ViewBuilder var left: Left
    @ViewBuilder var right: Right

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            left.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            right.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A vertical page. Its content is exactly as wide as the screen: one child
/// wider than that (a long word, a fixed-size label) would otherwise let the
/// whole page be dragged sideways.
struct PageScroll<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView(.vertical) {
            content.containerRelativeFrame(.horizontal)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }
}
