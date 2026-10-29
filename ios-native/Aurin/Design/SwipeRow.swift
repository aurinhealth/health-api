import SwiftUI

/// A row that slides left to show its actions (pencil and bin), as in Mail,
/// and right to show Vybrat when it has `select`, for rows outside a List.
/// A tap elsewhere on the row closes it again.
struct SwipeRow<Content: View>: View {
    var edit: (() -> Void)? = nil
    var select: (() -> Void)? = nil
    let delete: () -> Void
    @ViewBuilder var content: Content
    @State private var offset: CGFloat = 0
    @State private var start: CGFloat = 0

    private var width: CGFloat { edit == nil ? 64 : 124 }
    private let selectWidth: CGFloat = 104

    var body: some View {
        ZStack {
            HStack(spacing: 6) {
                if let select {
                    Button { close(); select() } label: {
                        Label(L10n.tr("Vybrat"), systemImage: "checkmark")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .frame(width: selectWidth - 8, height: 36)
                            .background(Palette.button, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .opacity(offset > 8 ? 1 : 0)
                }
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    if let edit {
                        action("pencil", "Upravit", Palette.indigo) { close(); edit() }
                    }
                    action("trash", "Smazat", Palette.rust) { close(); delete() }
                }
                .opacity(offset < -8 ? 1 : 0)
            }
            content
                .background(Palette.card)
                .offset(x: offset)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 18)
                        .onChanged { value in
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            offset = min(select == nil ? 0 : selectWidth + 30, max(-width - 30, start + value.translation.width))
                        }
                        .onEnded { value in
                            let to = start + value.translation.width, sideways = abs(value.translation.width) > abs(value.translation.height)
                            let next: CGFloat = !sideways ? 0 : to < -width / 2 ? -width : (select != nil && to > selectWidth / 2) ? selectWidth : 0
                            withAnimation(.spring(duration: 0.25)) { offset = next }
                            start = offset
                        }
                )
                .onTapGesture { if offset != 0 { close() } }
        }
        .clipped()
        .accessibilityAction(named: "Smazat") { delete() }
        .accessibilityAction(named: "Upravit") { edit?() }
        .accessibilityAction(named: "Vybrat") { select?() }
    }

    private func close() {
        withAnimation(.spring(duration: 0.25)) { offset = 0 }
        start = 0
    }

    private func action(_ symbol: String, _ label: String, _ color: Color, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Image(systemName: symbol).scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.onAccent)
                .frame(width: 56, height: 36)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}
