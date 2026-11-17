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
    /// Today's and Food's JSON as saved: once the swipe lands, the screens take
    /// the page as it is (AppModel.showSaved) instead of reading it again.
    var todayData: Data?
    var foodData: Data?

    var hasSaved: Bool { today != nil || health != nil || food != nil }

    /// What the phone has saved for the day.
    static func saved(_ date: String) -> DayPage {
        let key = date == AppModel.localDate(Date()) ? nil : date
        let decoder = JSONDecoder()
        func read(_ screen: String) -> Data? {
            SnapshotCache.data(key: SnapshotCache.dayKey(screen, key))?.data
        }
        // Today's copy ("food") is the day it was last loaded as today: after
        // midnight it is yesterday's, and another day's numbers never stand
        // under this day (Petr, 2026-11-13).
        let today = read("today").flatMap { data in (try? decoder.decode(TodaySnapshot.self, from: data)).flatMap { $0.date == date ? ($0, data) : nil } }
        let food = read("food").flatMap { data in (try? decoder.decode(FoodSnapshot.self, from: data)).flatMap { $0.date == date ? ($0, data) : nil } }
        let health = read("health").flatMap { try? decoder.decode(HealthSnapshot.self, from: $0) }.flatMap { $0.date == date ? $0 : nil }
        return DayPage(date: date, selectedDate: key, today: today?.0, health: health, food: food?.0,
                       todayData: today?.1, foodData: food?.1)
    }
}

/// The days beside, read off the main thread (DaySwipe); read once, then handed over.
private final class SavedDays: @unchecked Sendable {
    let pages: [DayPage]
    init(_ pages: [DayPage]) { self.pages = pages }
}

private struct DayPageKey: EnvironmentKey { static let defaultValue: DayPage? = nil }

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
/// arrows go; off while the widgets are being edited. The days beside sit
/// left and right of this one in a paging scroll view, as they were last
/// seen, so the system moves the page (Petr, 2026-11-11: the swipe drawn by
/// SwiftUI frame by frame ran at about 30 frames a second). A day picked
/// another way (the week, the arrows) slides in from its side.
private struct DaySwipe: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var drawnAsNeighbour
    let date: String
    var ahead: Bool
    var enabled: Bool
    let neighbour: (DayPage) -> AnyView?

    /// The page in sight: 0 the day before, 1 this day, 2 the day after.
    @State private var position: Int? = 1
    /// This day's height: the days beside are cut to it, so a longer one does
    /// not leave an empty end under this one.
    @State private var height: CGFloat?
    /// Both days beside, read off the main thread once a day is on screen.
    @State private var nearby: [DayPage] = []
    /// After a swipe: the day coming, as it was drawn beside (or as empty
    /// cards), until the app has picked it.
    @State private var coming: DayPage?
    /// A picked day's slide in from its side.
    @State private var slide: CGFloat = 0
    /// The pager's own width: the page that paging moves (on the closed iPhone
    /// Duo containerRelativeFrame came out wider, see PageScroll).
    @State private var width: CGFloat?

    private var shown: String { model.selectedDate ?? AppModel.localDate(Date()) }
    /// The day the screen should show: the one swiped to, else the one picked.
    /// Until the data drawn is that day, the screen shows it as saved or as
    /// empty cards. Worked out from the days, not kept in step by hand, so the
    /// week above and the numbers below never show two days (Petr, 2026-11-13).
    private var wanted: String { coming?.date ?? shown }
    private var waiting: Bool { date != wanted }
    private var canGoForward: Bool { DayNavigator.canGoForward(model: model, date: shown, ahead: ahead) }
    private var before: String? { AppModel.shift(shown, by: -1) }
    private var after: String? { canGoForward ? AppModel.shift(shown, by: 1) : nil }

    @ViewBuilder func body(content: Content) -> some View {
        // Not in the demo (and so not in the screenshots, which cannot draw it).
        // iOS 18 and later: on iOS 17 the scroll view tells no end of a swipe
        // (its position changes mid-drag), so there the week and the arrows.
        if drawnAsNeighbour != nil || model.demo {
            content
        } else if #available(iOS 18, *) {
            paged(content)
        } else {
            // No swipe, but the day picked is waited for in the same way.
            content
                .opacity(waiting ? 0 : 1)
                .overlay(alignment: .top) { if waiting { comingDay } }
                .task(id: date) { await preload() }
        }
    }

    @available(iOS 18, *)
    private func paged(_ content: Content) -> some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 0) {
                if let before { side(before).id(0) }
                content
                    // Only the swipe stops while editing or loading, not the
                    // scroll views inside the day and its sheets.
                    .environment(\.isScrollEnabled, true)
                    .opacity(waiting ? 0 : 1)
                    .overlay(alignment: .top) { if waiting { comingDay } }
                    .offset(x: slide)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
                    .containerRelativeFrame(.horizontal) { length, _ in width ?? length }
                    .id(1)
                if let after { side(after).id(2) }
            }
            .scrollTargetLayout()
            // As tall as this day, with room for the cards' shadows above and below.
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 24)
        }
        .padding(.vertical, -24)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $position)
        .onAppear {
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { position = 1 }
        }
        .scrollDisabled(!enabled || model.dayLocked)
        .onScrollPhaseChange { _, phase in
            if phase == .idle { land() }
        }
        // Another day picked: the swipe's page has done its part (the day
        // picked is what the screen waits for now). Picked in the week, the
        // month or with the arrows, the day slides in from its side.
        .onChange(of: shown) { old, new in
            let swiped = coming?.date == new
            coming = nil
            guard !swiped else { return }
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { slide = (new > old ? 1 : -1) * 60 }
            withAnimation(.snappy(duration: 0.3)) { slide = 0 }
        }
        .task(id: date) { await preload() }
    }

    /// A day beside: as saved, cut to this day's height.
    private func side(_ day: String) -> some View {
        Group {
            if let page = nearby.first(where: { $0.date == day }) {
                NeighbourDay(page: page, neighbour: neighbour).equatable()
            } else {
                DayPlaceholder()
            }
        }
        // At its own height, then cut: a frame alone squeezed a taller day, and
        // the readiness number shrank until the day landed (Petr, 2026-11-12).
        .fixedSize(horizontal: false, vertical: true)
        .frame(height: height ?? 0, alignment: .top)
        .clipped()
        .containerRelativeFrame(.horizontal) { length, _ in width ?? length }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func preload() async {
        nearby = []
        let days = [before, after].compactMap { $0 }
        let read = await Task.detached(priority: .userInitiated) { SavedDays(days.map { DayPage.saved($0) }) }.value
        guard !Task.isCancelled else { return }
        nearby = read.pages
    }

    /// The day waited for as saved (as it was drawn beside during a swipe),
    /// else empty cards, until the screen shows it.
    @ViewBuilder private var comingDay: some View {
        if let page = coming ?? nearby.first(where: { $0.date == wanted }), page.date == wanted, page.hasSaved {
            NeighbourDay(page: page, neighbour: neighbour)
                .equatable()
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: height, alignment: .top)
                .clipped()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        } else {
            DayPlaceholder()
        }
    }

    /// The page came to rest beside this one: that day goes in the middle as
    /// it is (no jump, the middle draws the same), and loads.
    private func land() {
        guard let at = position, at != 1 else { return }
        let forward = at == 2
        guard let target = forward ? after : before else { return }
        let page = nearby.first { $0.date == target } ?? DayPage(date: target, selectedDate: target == AppModel.localDate(Date()) ? nil : target)
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            coming = page
            position = 1
        }
        Task {
            await model.showDay(offset: forward ? 1 : -1, ahead: ahead, saved: page.hasSaved ? page : nil)
            // The day was not opened after all: this day stays in sight.
            if shown != target, coming?.date == target { coming = nil }
        }
    }
}

/// The day beside as drawn. Equal while it is the same saved day, so it is
/// not built again whenever the pager changes (its closures would make SwiftUI
/// see a new view each time).
private struct NeighbourDay: View, Equatable {
    let page: DayPage
    let neighbour: (DayPage) -> AnyView?

    static func == (a: Self, b: Self) -> Bool {
        a.page.date == b.page.date && a.page.todayData == b.page.todayData
            && a.page.foodData == b.page.foodData && (a.page.health == nil) == (b.page.health == nil)
    }

    var body: some View {
        Group {
            if let view = neighbour(page) { view } else { DayPlaceholder() }
        }
        .environment(\.dayPage, page)
    }
}

/// A day the phone has not saved: its cards, empty (the month and the week
/// above stay on screen).
private struct DayPlaceholder: View {
    var body: some View {
        VStack(spacing: 12) {
            block(150).padding(.top, 24)
            HStack(spacing: 12) { block(104); block(104) }
            block(96)
            block(96)
        }
        .padding(.horizontal, 24)
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
