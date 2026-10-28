import AppIntents
import Foundation
import WidgetKit

/// Aurin's controls in Control Center and on the Lock Screen (AurinWidgets/
/// ControlWidgets.swift): Voda, Začít posilovnu and Přeskočit pauzu. Their
/// values come from the App Group, so they are asked again whenever those change.
enum AurinControls {
    static let water = "health.aurin.control.water"
    static let startGym = "health.aurin.control.startGym"
    static let skipRest = "health.aurin.control.skipRest"

    static func reload(_ kind: String) {
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadControls(ofKind: kind) }
    }
}

/// The rest of the gym running now, for Přeskočit pauzu: GymLiveActivity
/// writes its end, the control shows it.
enum GymRestShared {
    private static let key = "gymRestEnd"

    /// When the rest ends; nil when no rest runs (or it is over).
    static var end: Date? {
        guard let seconds = UserDefaults(suiteName: WidgetSnapshot.group)?.object(forKey: key) as? Double else { return nil }
        let date = Date(timeIntervalSince1970: seconds)
        return date > Date() ? date : nil
    }

    static func set(_ end: Date?) {
        let defaults = UserDefaults(suiteName: WidgetSnapshot.group)
        let old = defaults?.object(forKey: key) as? Double
        let new = end?.timeIntervalSince1970
        guard old != new else { return }
        if let new { defaults?.set(new, forKey: key) } else { defaults?.removeObject(forKey: key) }
        AurinControls.reload(AurinControls.skipRest)
    }
}

/// Začít posilovnu from Control Center or the Lock Screen: the app opens in
/// today's gym, as the icon's menu Posilovna naživo does. The app sets the handler.
@MainActor
enum ControlInbox {
    static var startGym: (() -> Void)?
}

struct StartGymControlIntent: AppIntent {
    static let title: LocalizedStringResource = "Začít posilovnu"
    static let isDiscoverable = false
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        ControlInbox.startGym?()
        return .result()
    }
}
