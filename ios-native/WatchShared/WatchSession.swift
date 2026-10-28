import Foundation

/// The iPhone's sign-in, handed to the watch with Today so the watch can ask
/// the coach on its own Wi-Fi or cellular when the iPhone isn't in reach
/// (AurinWatch/WatchAPI.swift). WatchConnectivity carries it encrypted; the
/// watch keeps it in its Keychain. No session in the context means signed out.
struct WatchSession: Codable, Equatable, Sendable {
    static let contextKey = "watchSession"

    /// The server the iPhone talks to (Settings → Testing → Server).
    var server: String
    /// The session cookie's name and value.
    var name: String
    var value: String
    var expires: Date?
    /// X-Loadwise-Api, so the server answers the watch like the app.
    var apiLevel: Int
    var language: String
    var imperial: Bool

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchSession? { try? JSONDecoder().decode(WatchSession.self, from: data) }
}
