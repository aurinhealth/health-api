import SwiftUI

/// The quiet action row at the bottom of a card (redesign Z1, consistency
/// point 4): a hairline, Two lights at 28 pt, a neutral label in ink and a
/// chevron. It takes the place of the coloured buttons that opened the coach.
/// Hidden while the AI is off by its consent (AppModel.aiOff).
struct CoachActionRow: View {
    /// A Czech key; "Zeptat se kouče" reads "Ask Coach".
    var title = "Zeptat se kouče"
    var action: () -> Void
    @Environment(AppModel.self) private var model: AppModel?

    var body: some View {
        if !(model?.aiOff ?? false) || model?.demo == true {
            Button(action: action) {
                VStack(spacing: 0) {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    HStack(spacing: 10) {
                        TwoLights(size: 28)
                        Text(verbatim: L10n.tr(title))
                            .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 48)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("coach.row")
        }
    }
}
