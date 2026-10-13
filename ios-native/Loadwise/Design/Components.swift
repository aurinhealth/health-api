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

/// The glass of the app's own bars and their buttons: Liquid Glass on iOS 26
/// (it follows Nastavení → Displej a jas → Liquid Glass and Omezit
/// průhlednost), a blurred light material before it.
extension View {
    @ViewBuilder func chromeGlass<S: Shape>(in shape: S) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) {
            glassEffect(.regular.interactive(), in: shape)
        } else {
            materialChrome(in: shape)
        }
        #else
        materialChrome(in: shape)
        #endif
    }

    private func materialChrome<S: Shape>(in shape: S) -> some View {
        background(.ultraThinMaterial, in: shape)
            .background(Palette.card.opacity(0.6), in: shape)
            .overlay(shape.stroke(Palette.hairline, lineWidth: 1))
    }
}

/// A round glass button of the bars (back, the page's own action).
struct ChromeButton: View {
    var systemImage: String
    var label: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 40, height: 40)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .chromeGlass(in: Circle())
        .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// The back button of a drill-down page.
struct FloatingBackButton: View {
    var action: () -> Void

    var body: some View {
        ChromeButton(systemImage: "chevron.left", label: "Zpět", action: action)
    }
}

private struct FloatingBackKey: EnvironmentKey { static let defaultValue = false }
private struct ScrollReportKey: EnvironmentKey { static let defaultValue: ((CGFloat) -> Void)? = nil }

extension EnvironmentValues {
    /// The page pins its back button (FloatingBackButton); the inline one keeps only its place.
    var floatingBack: Bool {
        get { self[FloatingBackKey.self] }
        set { self[FloatingBackKey.self] = newValue }
    }

    /// How far the page is scrolled (PageScroll): the pinned top bar shows
    /// the title and the tab bar shrinks to one icon (RootView).
    var scrollReport: ((CGFloat) -> Void)? {
        get { self[ScrollReportKey.self] }
        set { self[ScrollReportKey.self] = newValue }
    }
}

/// The page's own button in the pinned bar (the "+" of a meal).
struct ChromeAction {
    var systemImage: String
    var label: String
    var action: () -> Void
}

/// The pinned bar of a drill-down page: back on the left, the page's action
/// on the right, both glass. Scrolled down, a light blur goes behind it and
/// the title shows in the middle.
private struct PinnedTopBar: ViewModifier {
    var title: String?
    var trailing: ChromeAction?
    var back: () -> Void
    @Environment(\.scrollReport) private var parent
    @State private var scrolled = false

    func body(content: Content) -> some View {
        content
            .environment(\.floatingBack, true)
            .environment(\.scrollReport, { (offset: CGFloat) in
                parent?(offset)
                let now = offset > 24
                if now != scrolled { withAnimation(.easeOut(duration: 0.2)) { scrolled = now } }
            })
            .overlay(alignment: .top) {
                HStack(spacing: 12) {
                    FloatingBackButton(action: back)
                    Spacer(minLength: 0)
                    if let title {
                        Text(L10n.tr(title))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                            .opacity(scrolled ? 1 : 0)
                    }
                    Spacer(minLength: 0)
                    if let trailing {
                        ChromeButton(systemImage: trailing.systemImage, label: trailing.label, action: trailing.action)
                    } else {
                        Color.clear.frame(width: 40, height: 40)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 6)
                .padding(.bottom, 10)
                .background {
                    Rectangle().fill(.ultraThinMaterial)
                        .mask(LinearGradient(colors: [.black, .black, .black.opacity(0)], startPoint: .top, endPoint: .bottom))
                        .ignoresSafeArea(edges: .top)
                        .opacity(scrolled ? 1 : 0)
                }
            }
    }
}

extension View {
    /// Pins the back button (and the page's action) in a bar over the page.
    func floatingBack(title: String? = nil, trailing: ChromeAction? = nil, _ action: @escaping () -> Void) -> some View {
        modifier(PinnedTopBar(title: title, trailing: trailing, back: action))
    }
}

/// A page's own back button: its place only when the page pins one.
struct BackSlot: View {
    @Environment(\.floatingBack) private var floating
    var action: () -> Void

    var body: some View {
        if floating {
            Color.clear.frame(width: 36, height: 36)
        } else {
            CircleButton(systemImage: "chevron.left", label: L10n.tr("Zpět"), action: action)
        }
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
    @Environment(\.scrollReport) private var report

    var body: some View {
        ScrollView(.vertical) {
            content.containerRelativeFrame(.horizontal)
                .onGeometryChange(for: CGFloat.self) { -$0.frame(in: .named("pageScroll")).minY } action: { report?($0) }
        }
        .coordinateSpace(.named("pageScroll"))
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .scrollDismissesKeyboard(.interactively)
    }
}
