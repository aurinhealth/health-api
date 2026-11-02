import Foundation

/// The last few screens the user had open, kept in memory only, so
/// "Nahlásit problém" (ReportProblemView) says where the problem happened:
/// the tab and the detail on top of it, a sheet (the coach, "+", Settings and
/// its page) and when each opened. Case names and Settings page titles only,
/// no days, ids or names of workouts.
@MainActor
enum ScreenTrail {
    struct Entry: Equatable {
        let name: String
        let at: Date
    }

    private static let limit = 6
    private(set) static var entries: [Entry] = []

    static func visit(_ tab: AppTab, _ route: AppRoute?) {
        var name = "\(tab)"
        if let route { name += "/" + caseName(route) }
        visit(name)
    }

    static func visit(_ name: String, at: Date = Date()) {
        guard entries.last?.name != name else { return }
        entries.append(Entry(name: name, at: at))
        if entries.count > limit { entries.removeFirst(entries.count - limit) }
    }

    /// "activity" for .activity(WeekSession(...)): the case without its values.
    static func caseName(_ route: AppRoute) -> String {
        Mirror(reflecting: route).children.first?.label ?? String(describing: route)
    }
}
