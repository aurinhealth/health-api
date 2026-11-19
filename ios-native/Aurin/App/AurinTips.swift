import StoreKit
import SwiftUI
import TipKit

// Tips shown once (TipKit) and the App Store rating after a finished week
// (Petr's yes on the mockup, 2026-10-28). A closed tip never comes back.

/// Training mode, the first rest: the countdown also lives on the Lock Screen.
struct LockScreenRestTip: Tip {
    var title: Text { Text(L10n.tr("Pauza na zamčené obrazovce")) }
    var message: Text? { Text(L10n.tr("Zamkni telefon: odpočet i další série zůstanou na zamčené obrazovce a v Dynamic Islandu.")) }
    var image: Image? { Image(systemName: "iphone") }
}

/// A planned ride or run with steps, the first time: the watch guides it.
struct WatchWorkoutTip: Tip {
    var title: Text { Text(L10n.tr("Trénink s hodinkami")) }
    var message: Text? { Text(L10n.tr("Aplikace Cvičení tě provede každým úsekem a jeho cílem. Hodinky trénink uloží do Zdraví.")) }
    var image: Image? { Image(systemName: "applewatch") }
}

enum AurinTips {
    /// Once at launch, before any TipView draws. Not in the demo, whose
    /// screenshots go to the website and the App Store.
    static func configure() {
        guard !ProcessInfo.processInfo.arguments.contains("-demo") else { return }
        try? Tips.configure([.displayFrequency(.immediate)])
    }
}

/// "Líbí se ti Aurin?": the system's rating after a week whose every planned
/// session was done. Once per app version and at most every 60 days; iOS
/// itself shows it at most three times a year.
enum ReviewAsk {
    private static let versionKey = "reviewAskVersion"
    private static let dateKey = "reviewAskDate"

    static func due(_ sessions: [WeekSession]) -> Bool {
        let fromPlan = sessions.filter { $0.status == "done" && $0.plannedId != nil }
        guard fromPlan.count >= 3, !sessions.contains(where: { $0.status == "planned" || $0.status == "missed" }) else { return false }
        let defaults = UserDefaults.standard
        if defaults.string(forKey: versionKey) == version { return false }
        if let last = defaults.object(forKey: dateKey) as? Date, Date().timeIntervalSince(last) < 60 * 86_400 { return false }
        return true
    }

    static func asked() {
        UserDefaults.standard.set(version, forKey: versionKey)
        UserDefaults.standard.set(Date(), forKey: dateKey)
    }

    private static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }
}

extension View {
    /// Asks for the rating once Training shows a finished week.
    func reviewAfterFinishedWeek(_ sessions: [WeekSession]?, demo: Bool) -> some View {
        modifier(ReviewAfterWeek(sessions: sessions ?? [], demo: demo))
    }
}

private struct ReviewAfterWeek: ViewModifier {
    let sessions: [WeekSession]
    let demo: Bool
    @Environment(\.requestReview) private var requestReview

    func body(content: Content) -> some View {
        content.task(id: sessions) {
            guard !demo, ReviewAsk.due(sessions) else { return }
            // Let the week draw first, so the question follows what the user sees.
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            ReviewAsk.asked()
            requestReview()
        }
    }
}
