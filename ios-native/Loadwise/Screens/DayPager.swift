import SwiftUI

/// The day drawn next to the one on screen while a swipe moves it: its saved
/// Today, Health and Food (SnapshotCache), so the next day is there under the
/// finger before it loads. Views inside read their day from it instead of
/// AppModel.selectedDate.
struct DayPage {
    let date: String
    /// nil for today, as in AppModel.selectedDate.
    let selectedDate: String?
    var today: TodaySnapshot?
    var health: HealthSnapshot?
    var food: FoodSnapshot?

    /// What the phone has saved for the day.
    static func saved(_ date: String) -> DayPage {
        let key = date == AppModel.localDate(Date()) ? nil : date
        func load<T: Decodable>(_ type: T.Type, _ screen: String) -> T? {
            SnapshotCache.load(type, key: SnapshotCache.dayKey(screen, key))?.value
        }
        return DayPage(date: date, selectedDate: key, today: load(TodaySnapshot.self, "today"),
                       health: load(HealthSnapshot.self, "health"), food: load(FoodSnapshot.self, "food"))
    }
}

private struct DayPageKey: EnvironmentKey { nonisolated(unsafe) static let defaultValue: DayPage? = nil }

extension EnvironmentValues {
    /// Set on a neighbouring day drawn during a swipe; nil on the real screen.
    var dayPage: DayPage? {
        get { self[DayPageKey.self] }
        set { self[DayPageKey.self] = newValue }
    }
}

extension View {
    /// Dnes, Zdraví and Jídlo: swipe between days. `neighbour` draws a saved
    /// day beside this one (nil: not saved, empty cards instead).
    func daySwipe(date: String, ahead: Bool = false, enabled: Bool = true, neighbour: @escaping (DayPage) -> AnyView?) -> some View {
        modifier(DaySwipe(date: date, ahead: ahead, enabled: enabled, neighbour: neighbour))
    }
}

/// A swipe right goes a day back, a swipe left a day forward, as far as the
/// arrows go; off while the widgets are being edited. The page follows the
/// finger with the next day beside it, as it was last seen; let go past a
/// third of the screen (or with a flick) and it slides over, otherwise back.
/// A day picked another way (the week, the arrows) slides in from its side.
private struct DaySwipe: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var drawnAsNeighbour
    let date: String
    var ahead: Bool
    var enabled: Bool
    let neighbour: (DayPage) -> AnyView?

    @State private var drag: CGFloat = 0
    @State private var width: CGFloat = 390
    /// The day beside, loaded once per direction.
    @State private var page: DayPage?
    /// Off while a picked day slides in.
    @State private var showsNeighbour = true
    /// After a swipe: the day coming, as empty cards until it is here.
    @State private var coming: String?

    private var waiting: Bool { coming != nil && coming != date }
    private var shown: String { model.selectedDate ?? AppModel.localDate(Date()) }
    private var canGoForward: Bool { DayNavigator.canGoForward(model: model, date: shown, ahead: ahead) }

    @ViewBuilder func body(content: Content) -> some View {
        if drawnAsNeighbour != nil {
            content
        } else {
            paged(content)
        }
    }

    private func paged(_ content: Content) -> some View {
        content
            .opacity(waiting ? 0 : 1)
            .overlay(alignment: .top) { if waiting { DayPlaceholder() } }
            .offset(x: drag)
            .background(alignment: .top) {
                if showsNeighbour, drag != 0, let page {
                    Group {
                        if let view = neighbour(page) { view } else { DayPlaceholder() }
                    }
                    .environment(\.dayPage, page)
                    .frame(width: width)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .offset(x: drag > 0 ? drag - width : drag + width)
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .background {
                // Not in the demo (and so not in the screenshots, which cannot draw it).
                if !model.demo { HorizontalPan(enabled: enabled, changed: follow, ended: settle) }
            }
            .onChange(of: date) { old, new in
                page = nil
                if new == coming { coming = nil; return }
                coming = nil
                // Picked in the week or with the arrows: in from its side.
                var instant = Transaction()
                instant.disablesAnimations = true
                withTransaction(instant) {
                    showsNeighbour = false
                    drag = (new > old ? 1 : -1) * width * 0.5
                }
                withAnimation(.snappy(duration: 0.3)) { drag = 0 } completion: { showsNeighbour = true }
            }
    }

    private func follow(_ moved: CGFloat) {
        let forward = moved < 0
        // Less give where there is no day to go to.
        guard !forward || canGoForward else { drag = moved * 0.15; return }
        if let target = AppModel.shift(shown, by: forward ? 1 : -1), page?.date != target {
            page = DayPage.saved(target)
        }
        drag = moved
    }

    private func settle(_ moved: CGFloat, _ speed: CGFloat) {
        let forward = moved < 0
        let far = abs(moved) > width / 3 || (abs(speed) > 600 && (speed < 0) == forward)
        guard moved != 0, far, !model.loading, !forward || canGoForward,
              let target = AppModel.shift(shown, by: forward ? 1 : -1) else {
            withAnimation(.snappy(duration: 0.25)) { drag = 0 }
            return
        }
        withAnimation(.snappy(duration: 0.22)) { drag = (forward ? -1 : 1) * width } completion: {
            coming = target
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { drag = 0 }
            Task { await model.showDay(offset: forward ? 1 : -1, ahead: ahead) }
            // An answer that never comes: the old day back.
            Task {
                try? await Task.sleep(for: .seconds(8))
                if coming == target { coming = nil }
            }
        }
    }
}

/// A day the phone has not saved: its cards, empty.
private struct DayPlaceholder: View {
    var body: some View {
        VStack(spacing: 12) {
            block(36).padding(.trailing, 160)
            block(150).padding(.top, 20)
            HStack(spacing: 12) { block(104); block(104) }
            block(96)
            block(96)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .frame(maxWidth: .infinity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func block(_ height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(Palette.ink.opacity(0.05))
            .frame(maxWidth: .infinity)
            .frame(height: height)
    }
}
