import SwiftUI

/// The app's grid (617 #13 #23, Petr 2026-11-23).
enum PageGrid {
    /// The page margin everywhere: tabs, details, settings, sheets and the
    /// pinned bars, so the cards, the week strip and the bars' buttons line up.
    static let margin: CGFloat = 20
    /// Under a tab's page: room for the tab bar and the floating "+", so the
    /// last row is never under them.
    static let tabBottom: CGFloat = 100
}
