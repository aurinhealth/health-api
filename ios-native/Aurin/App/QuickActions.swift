import SwiftUI
import UIKit

/// One item of the menu on the home-screen icon (press and hold Aurin). The
/// user picks up to four and their order in Nastavení → Rychlé akce.
struct QuickAction: Identifiable, Equatable {
    let id: String
    let title: String
    let symbol: String

    static let all: [QuickAction] = [
        QuickAction(id: "today", title: "Dnešní trénink", symbol: "figure.run"),
        QuickAction(id: "coach", title: "Zeptat se kouče", symbol: "bubble.left"),
        QuickAction(id: "food", title: "Přidat jídlo", symbol: "fork.knife"),
        QuickAction(id: "water", title: "Vypít sklenici vody", symbol: "drop"),
        QuickAction(id: "readiness", title: "Připravenost", symbol: "waveform.path.ecg"),
        QuickAction(id: "liveGym", title: "Posilovna naživo", symbol: "dumbbell"),
        QuickAction(id: "photo", title: "Vyfotit jídlo", symbol: "camera"),
        QuickAction(id: "weekPlan", title: "Plán týdne", symbol: "calendar"),
        QuickAction(id: "sleep", title: "Spánek", symbol: "moon")
    ]

    static let defaults = ["today", "coach", "food", "water"]
    /// iOS shows at most four of an app's own items.
    static let limit = 4
    static let storageKey = "quickActions.items"
    /// The user's glass of water, as Siri and Shortcuts add it (AddWaterIntent):
    /// their smallest water amount, else 250 ml or 8 fl oz.
    static var glassMl: Int { PendingDrinks.glassMl }

    static func list(_ stored: String) -> [QuickAction] {
        Array(stored.split(separator: ",").compactMap { id in all.first { $0.id == id } }.prefix(limit))
    }

    static var stored: String {
        UserDefaults.standard.string(forKey: storageKey) ?? defaults.joined(separator: ",")
    }
}

/// The icon's menu kept up to date (after each refresh of Today, so "Dnes:"
/// names today's workout and Připravenost shows the score), and the item the
/// user picked handed to RootView.
@MainActor @Observable
final class QuickActions {
    static let shared = QuickActions()

    /// The picked item, until RootView has run it; the token tells two picks
    /// of the same item apart.
    struct Pick: Equatable {
        let id: String
        let token = UUID()
    }

    var pick: Pick?

    func receive(_ item: UIApplicationShortcutItem) {
        pick = Pick(id: item.type)
    }

    /// The menu for the day: today's unfinished workout or the coach's pick,
    /// the readiness score when there is one.
    static func update(_ today: TodaySnapshot?) {
        let next = today?.plan.first { $0.kind == "workout" && !$0.done }
        let score = today?.readiness.score
        UIApplication.shared.shortcutItems = QuickAction.list(QuickAction.stored).map { action in
            var title = L10n.tr(action.title)
            var symbol = action.symbol
            switch action.id {
            case "today":
                if let next {
                    title = L10n.f("Dnes: %@", next.title)
                } else {
                    title = L10n.tr("Co dnes trénovat?")
                    symbol = "sparkles"
                }
            case "readiness":
                if let score { title = L10n.f("Připravenost %d", score) }
            default:
                break
            }
            return UIApplicationShortcutItem(type: action.id, localizedTitle: title, localizedSubtitle: nil,
                                             icon: UIApplicationShortcutIcon(systemImageName: symbol))
        }
    }

    /// Signed out: the menu has nothing to open.
    static func clear() {
        UIApplication.shared.shortcutItems = []
    }
}

/// The window's scene delegate, only for the icon's menu: a pick while the app
/// runs. A pick that launches the app comes with the scene's connection
/// (AppDelegate).
@MainActor
final class QuickActionSceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        QuickActions.shared.receive(shortcutItem)
        completionHandler(true)
    }
}
