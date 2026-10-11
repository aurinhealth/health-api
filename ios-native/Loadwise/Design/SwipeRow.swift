import SwiftUI

/// A row that slides left to show its actions (pencil and bin), as in Mail,
/// for rows outside a List. A tap elsewhere on the row closes it again.
struct SwipeRow<Content: View>: View {
    var edit: (() -> Void)? = nil
    let delete: () -> Void
    @ViewBuilder var content: Content
    @State private var offset: CGFloat = 0
    @State private var start: CGFloat = 0

    private var width: CGFloat { edit == nil ? 64 : 124 }

    var body: some View {
        ZStack(alignment: .trailing) {
            HStack(spacing: 6) {
                if let edit {
                    action("pencil", "Upravit", Palette.indigo) { close(); edit() }
                }
                action("trash", "Smazat", Palette.rust) { close(); delete() }
            }
            .opacity(offset < -8 ? 1 : 0)
            content
                .background(Palette.card)
                .offset(x: offset)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 18)
                        .onChanged { value in
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            offset = min(0, max(-width - 30, start + value.translation.width))
                        }
                        .onEnded { value in
                            let open = start + value.translation.width < -width / 2 && abs(value.translation.width) > abs(value.translation.height)
                            withAnimation(.spring(duration: 0.25)) { offset = open ? -width : 0 }
                            start = offset
                        }
                )
                .onTapGesture { if offset != 0 { close() } }
        }
        .clipped()
        .accessibilityAction(named: "Smazat") { delete() }
        .accessibilityAction(named: "Upravit") { edit?() }
    }

    private func close() {
        withAnimation(.spring(duration: 0.25)) { offset = 0 }
        start = 0
    }

    private func action(_ symbol: String, _ label: String, _ color: Color, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.onAccent)
                .frame(width: 56, height: 36)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}
