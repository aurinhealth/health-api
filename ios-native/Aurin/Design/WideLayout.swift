import SwiftUI

// A wide window: iPhone Duo open (its inner display in landscape), or the app
// beside another one when it gets most of that display. From this width the
// tabs lay their cards out in two columns and the tab bar stays its phone
// width in the middle. Narrower (the Duo closed, half of the open display, any
// other iPhone) everything stays as on a phone.

enum WideLayout {
    /// Two columns from this window width on (points).
    static let minWidth: CGFloat = 720
    /// The tab bar's width in a wide window: a phone's, not the whole display.
    static let tabBarWidth: CGFloat = 440
    /// The gap between the two columns.
    static let gap: CGFloat = 20
}

extension EnvironmentValues {
    /// The window is at least WideLayout.minWidth wide (RootView).
    @Entry var wideLayout = false
}

/// Two columns side by side, each its own stack, tops aligned; one column
/// (left over right) when the window is not wide.
struct WideColumns<Left: View, Right: View>: View {
    @Environment(\.wideLayout) private var wide
    var spacing: CGFloat = 0
    @ViewBuilder var left: Left
    @ViewBuilder var right: Right

    var body: some View {
        if wide {
            HStack(alignment: .top, spacing: WideLayout.gap) {
                VStack(alignment: .leading, spacing: spacing) { left }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                VStack(alignment: .leading, spacing: spacing) { right }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        } else {
            VStack(alignment: .leading, spacing: spacing) {
                left
                right
            }
        }
    }
}
