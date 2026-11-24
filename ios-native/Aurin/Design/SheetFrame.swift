import SwiftUI

/// The one frame of a sheet (617 #15, the month sheet's header as the model):
/// the title in the serif on the left, the sheet's own buttons and the X in a
/// glass disc (44 pt to tap) on the right, pinned while the content scrolls
/// under it, the page margin on both sides and the height of its content (up
/// to the whole screen). A sheet closes with the X; "Hotovo" stays only for
/// edit mode, and a sheet's action ("Uložit", "Přidat") sits at the bottom of
/// its content.
struct SheetFrame<Accessory: View, Content: View>: View {
    let title: String
    /// Its height follows the content; off for a sheet that should open full
    /// (the month, a long list).
    var fitted = true
    @ViewBuilder var accessory: Accessory
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss
    @State private var headerHeight: CGFloat = 0
    @State private var contentHeight: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(verbatim: L10n.tr(title)).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .lineLimit(2).minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                accessory
                ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                    .accessibilityIdentifier("sheet.close")
            }
            .padding(.horizontal, PageGrid.margin).padding(.top, 24).padding(.bottom, 12)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
            ScrollView {
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, PageGrid.margin).padding(.top, 4).padding(.bottom, 32)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
    }

    /// Fitted: the header and the content, the system keeps it under the top.
    private var detents: Set<PresentationDetent> {
        guard fitted else { return [.large] }
        guard contentHeight > 0 else { return [.medium] }
        return [.height(headerHeight + contentHeight)]
    }
}

extension SheetFrame where Accessory == EmptyView {
    init(title: String, fitted: Bool = true, @ViewBuilder content: () -> Content) {
        self.init(title: title, fitted: fitted, accessory: { EmptyView() }, content: content)
    }
}
