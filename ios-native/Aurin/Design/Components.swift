import SwiftUI

/// The rounded paper card every widget sits on.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 22)
            .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
            .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
    }
}

extension View {
    /// A card's fill (Petr, 2026-10-25): solid, so its numbers read well, but lit
    /// like the glass of the bars: lighter at the top, with a light top edge.
    func cardSurface(cornerRadius: CGFloat = 22) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return background(LinearGradient(colors: [Palette.cardLift, Palette.card], startPoint: .top, endPoint: .center), in: shape)
            .overlay(
                shape.strokeBorder(LinearGradient(colors: [Palette.cardEdge, Palette.cardEdge.opacity(0)], startPoint: .top, endPoint: .center), lineWidth: 1)
                    .allowsHitTesting(false)
            )
    }

    /// A sheet over the app: the system's glass on iOS 26, the paper colour before it.
    @ViewBuilder func glassSheetBackground() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) {
            self
        } else {
            presentationBackground(Palette.background)
        }
        #else
        presentationBackground(Palette.background)
        #endif
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

/// A slim track with the athlete's usual range (or today's goal) as a lighter
/// band and a dot at the value: Dnes, the Zdraví tiles and the details. The
/// band takes the middle third, so values well outside it still fit.
struct RangeBar: View {
    let value: Double
    let low: Double
    let high: Double
    var color: Color = Palette.green
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.ink.opacity(0.07))
                Capsule().fill(Palette.ink.opacity(0.34)).frame(width: w / 3).offset(x: w / 3)
                Circle().fill(color)
                    .overlay(Circle().stroke(Palette.card, lineWidth: 2.5))
                    .frame(width: height + 6, height: height + 6)
                    .offset(x: position * w - (height + 6) / 2)
            }
            .frame(height: height)
            .frame(maxHeight: .infinity)
        }
        .frame(height: height + 6)
        .accessibilityHidden(true)
    }

    private var position: Double {
        guard high > low else { return 0.5 }
        let span = high - low
        return min(max((value - low + span) / (3 * span), 0.03), 0.97)
    }

    /// -1 under the range, 1 above it, 0 within.
    static func side(_ value: Double, _ low: Double, _ high: Double) -> Int {
        value > high ? 1 : value < low ? -1 : 0
    }

    /// "v normálu", "nad normálem", "pod normálem" under a tile's bar.
    static func word(_ value: Double, _ low: Double, _ high: Double) -> String {
        switch side(value, low, high) {
        case 1: return L10n.tr("nad normálem")
        case -1: return L10n.tr("pod normálem")
        default: return L10n.tr("v normálu")
        }
    }

    /// Green within the range or on its good side, amber on its bad side.
    static func color(_ value: Double, _ low: Double, _ high: Double, worseAbove: Bool) -> Color {
        let side = side(value, low, high)
        return side == 0 || (side == 1) != worseAbove ? Palette.green : Palette.amber
    }
}

/// A tile's range bar and the word under it, between the number and the chart.
struct TileRange: View {
    let value: Double
    let low: Double
    let high: Double
    var worseAbove = false
    /// Replaces "v normálu" (Váha: "cíl 76 kg").
    var text: String? = nil

    var body: some View {
        let color = text == nil ? RangeBar.color(value, low, high, worseAbove: worseAbove) : Palette.blue
        VStack(alignment: .leading, spacing: 8) {
            RangeBar(value: value, low: low, high: high, color: color)
            Text(verbatim: text ?? RangeBar.word(value, low, high))
                .font(Typo.caption.weight(.medium)).foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.top, 6)
    }
}

/// A detail's range bar under its big number: "níž · tvůj normál 52–68 ms · výš".
struct DetailRange: View {
    let value: Double
    let low: Double
    let high: Double
    let label: String
    var worseAbove = false

    var body: some View {
        VStack(spacing: 8) {
            RangeBar(value: value, low: low, high: high, color: RangeBar.color(value, low, high, worseAbove: worseAbove), height: 8)
            HStack {
                Text("níž")
                Spacer()
                Text(verbatim: label)
                Spacer()
                Text("výš")
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
        }
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

/// A round glass button of the bars (back, the page's own action), or a
/// glass capsule with a word ("Vybrat", "Zrušit") when it has text.
struct ChromeButton: View {
    var systemImage: String
    var label: String
    var text: String? = nil
    var enabled = true
    var tint: Color? = nil
    /// The tabs' pinned bar uses the header capsule's height (HeaderCapsule).
    var height: CGFloat = 40
    var action: () -> Void

    var body: some View {
        button
            .disabled(!enabled)
            .opacity(enabled ? 1 : 0.45)
    }

    @ViewBuilder private var button: some View {
        if let text {
            Button(action: action) {
                Text(L10n.tr(text))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 14)
                    .frame(height: height)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .chromeGlass(in: Capsule())
            .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
        } else {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(tint ?? Palette.ink)
                    .frame(width: 40, height: 40)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .chromeGlass(in: Circle())
            .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
            .accessibilityLabel(L10n.tr(label))
        }
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
private struct ScrollReportKey: EnvironmentKey { nonisolated(unsafe) static let defaultValue: ((CGFloat) -> Void)? = nil }
private struct ScrollDragReportKey: EnvironmentKey { nonisolated(unsafe) static let defaultValue: (() -> Void)? = nil }
private struct WidgetEditingReportKey: EnvironmentKey { nonisolated(unsafe) static let defaultValue: ((Bool) -> Void)? = nil }

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

    /// A finger started dragging the page (PageScroll): the tab bar opened
    /// with a tap may shrink again (RootView).
    var scrollDragReport: (() -> Void)? {
        get { self[ScrollDragReportKey.self] }
        set { self[ScrollDragReportKey.self] = newValue }
    }

    /// The widgets below are being edited (WidgetBoard): the pinned top bar
    /// steps aside for their "+" and "Hotovo".
    var widgetEditingReport: ((Bool) -> Void)? {
        get { self[WidgetEditingReportKey.self] }
        set { self[WidgetEditingReportKey.self] = newValue }
    }
}

/// The page's own button in the pinned bar (the "+" of a meal), or a word
/// ("Vybrat") when it has text.
struct ChromeAction {
    var systemImage: String
    var label: String
    var text: String? = nil
    /// Greyed and not tappable ("Uložit" with nothing changed).
    var enabled = true
    /// The symbol's colour when it is not the ink (the rust flag of a food).
    var tint: Color? = nil
    var action: () -> Void
}

/// Behind the pinned bars once the page is scrolled: the paper colour over
/// a blur, solid to below the bar's buttons and fading out under them, so the
/// page's own title and text do not show through the bar's title.
private struct PinnedBarBackground: View {
    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            Palette.background.opacity(0.7)
        }
        .padding(.bottom, -18)
        .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.72), .init(color: .black.opacity(0), location: 1)],
                             startPoint: .top, endPoint: .bottom))
        .ignoresSafeArea(edges: .top)
    }
}

/// The pinned bar of a drill-down page: back on the left, the page's action
/// on the right, both glass. Scrolled down, a light blur goes behind it and
/// the title shows in the middle.
private struct PinnedTopBar: ViewModifier {
    var title: String?
    var trailing: ChromeAction?
    /// Selecting (Vybrat): "Zrušit" instead of back, the title always shown.
    var leading: ChromeAction?
    var extra: ChromeAction?
    var pinTitle = false
    var back: () -> Void
    @Environment(\.scrollReport) private var parent
    /// While the sync pill shows (RootView), it takes the title's place.
    @Environment(AppModel.self) private var model: AppModel?
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
                    if let leading {
                        ChromeButton(systemImage: leading.systemImage, label: leading.label, text: leading.text, action: leading.action)
                    } else {
                        FloatingBackButton(action: back)
                    }
                    Spacer(minLength: 0)
                    if let title {
                        Text(L10n.tr(title))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                            .opacity(pinTitle || (scrolled && model?.syncStatus == nil) ? 1 : 0)
                    }
                    Spacer(minLength: 0)
                    if let extra {
                        ChromeButton(systemImage: extra.systemImage, label: extra.label, text: extra.text, action: extra.action)
                    }
                    if let trailing {
                        ChromeButton(systemImage: trailing.systemImage, label: trailing.label, text: trailing.text, enabled: trailing.enabled,
                                     tint: trailing.tint, action: trailing.action)
                    } else if extra == nil {
                        // Balances the back button; "Vybrat" alone sits at the edge itself.
                        Color.clear.frame(width: 40, height: 40)
                    }
                }
                .padding(.horizontal, 22)
                // On the line of the page's own title row (24 pt down, 36 pt high).
                .padding(.top, 22)
                .padding(.bottom, 10)
                .background {
                    PinnedBarBackground()
                        .opacity(scrolled ? 1 : 0)
                }
            }
    }
}

extension View {
    /// Pins the back button (and the page's action) in a bar over the page.
    func floatingBack(title: String? = nil, trailing: ChromeAction? = nil, extra: ChromeAction? = nil,
                      leading: ChromeAction? = nil, pinTitle: Bool = false, _ action: @escaping () -> Void) -> some View {
        modifier(PinnedTopBar(title: title, trailing: trailing, leading: leading, extra: extra, pinTitle: pinTitle, back: action))
    }
}

/// The pinned bar of a tab (Dnes, Zdraví, Trénink, Jídlo): once the page's
/// own header has scrolled away, the day (DayCapsule) stays
/// on top in glass with the header's buttons. Put on the tab's PageScroll, so
/// the pages it opens keep their own bar.
private struct TabTopBar<Bar: View>: ViewModifier {
    let bar: Bar
    @Environment(\.scrollReport) private var parent
    @State private var scrolled = false
    @State private var editingWidgets = false

    func body(content: Content) -> some View {
        content
            .environment(\.scrollReport, { (offset: CGFloat) in
                parent?(offset)
                let now = offset > 56
                if now != scrolled { withAnimation(.easeOut(duration: 0.2)) { scrolled = now } }
            })
            .environment(\.widgetEditingReport, { (editing: Bool) in
                if editing != editingWidgets { withAnimation(.easeOut(duration: 0.2)) { editingWidgets = editing } }
            })
            .overlay(alignment: .top) {
                if scrolled && !editingWidgets {
                    HStack(spacing: 10) { bar }
                        .padding(.horizontal, 18)
                        .padding(.top, 6)
                        .padding(.bottom, 10)
                        .background { PinnedBarBackground() }
                        .transition(.opacity)
                }
            }
    }
}

extension View {
    /// Keeps the tab's day or name on top once its header scrolls away.
    func tabTopBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        modifier(TabTopBar(bar: bar()))
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
    @Environment(\.scrollDragReport) private var dragReport

    var body: some View {
        ScrollView(.vertical) {
            content.containerRelativeFrame(.horizontal)
                .onGeometryChange(for: CGFloat.self) { -$0.frame(in: .named("pageScroll")).minY } action: { report?($0) }
        }
        .coordinateSpace(.named("pageScroll"))
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .scrollDismissesKeyboard(.interactively)
        .reportingDrags(dragReport)
    }
}

private extension View {
    /// On iOS 17 there is no scroll phase: the tab bar opened with a tap
    /// stays open until the page is back at the top.
    @ViewBuilder func reportingDrags(_ report: (() -> Void)?) -> some View {
        if #available(iOS 18, *) {
            onScrollPhaseChange { _, phase in
                if phase == .interacting { report?() }
            }
        } else {
            self
        }
    }
}
