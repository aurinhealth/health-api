import Foundation

/// Which server the app talks to: the live one, or the test server with its own
/// data, where every merge lands before "Vydat" sends it to the live server and
/// the external testers. Only internal testers can switch (Nastavení → Testování
/// → Server); each server keeps its own sign-in, because the session cookie
/// belongs to its host.
enum ServerChoice: String, CaseIterable, Sendable {
    case live
    case staging

    static let key = "serverChoice"

    static var current: ServerChoice {
        get { ServerChoice(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .live }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    var url: URL {
        switch self {
        case .live: URL(string: "https://aurin.health")!
        case .staging: URL(string: "https://staging.aurin.health")!
        }
    }

    var title: String {
        switch self {
        case .live: L10n.tr("Ostrý")
        case .staging: L10n.tr("Testovací")
        }
    }

    /// Passkeys belong to aurin.health, the app's associated domain; the test
    /// server's host has none.
    var passkeys: Bool { self == .live }
}
