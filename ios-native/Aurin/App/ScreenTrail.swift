import Foundation

/// The last few screens the user had open, kept in memory only, so
/// "Nahlásit problém" (ReportProblemView) says where the problem happened:
/// the tab and the detail on top of it, or the coach. Case names only, no
/// days, ids or names of workouts.
@MainActor
enum ScreenTrail {
    private static let limit = 3
    private(set) static var entries: [String] = []

    static func visit(_ tab: AppTab, _ route: AppRoute?) {
        var name = "\(tab)"
        if let route { name += "/" + caseName(route) }
        visit(name)
    }

    static func visit(_ name: String) {
        guard entries.last != name else { return }
        entries.append(name)
        if entries.count > limit { entries.removeFirst(entries.count - limit) }
    }

    /// "activity" for .activity(WeekSession(...)): the case without its values.
    static func caseName(_ route: AppRoute) -> String {
        Mirror(reflecting: route).children.first?.label ?? String(describing: route)
    }
}
