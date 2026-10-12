import UIKit
import UserNotifications

// The morning readiness push ("Připravenost 72 · dnes klidně intervaly"),
// sent by the server (src/push.js) once a day after the night's data arrives.
// The phone hands the server its APNs device token while notifications are
// allowed and Settings → Oznámení → Ranní připravenost is on; otherwise, and
// on "Odhlásit se", the token is removed from the server again.

/// Receives the device token from iOS (LoadwiseApp's delegate adaptor).
final class AppDelegate: NSObject, UIApplicationDelegate {
    /// The same server and session cookie as AppModel's client (shared cookie storage).
    private let api = APIClient()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Every launch asks for the token again; it is sent only when it changed.
        let client = self.api
        Task { @MainActor in await PushRegistration.refresh(api: client) }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let client = self.api
        Task { @MainActor in await PushRegistration.received(deviceToken, api: client) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No push this time (simulator, no network); the next launch tries again.
    }
}

@MainActor
enum PushRegistration {
    /// Settings → Oznámení → Ranní připravenost; on until turned off.
    static let morningKey = "remind.morning"
    /// The token last sent to the server for the signed-in account.
    private static let sentKey = "push.sentToken"

    static var morningOn: Bool {
        UserDefaults.standard.object(forKey: morningKey) as? Bool ?? true
    }

    /// The APNs service the token belongs to. project.yml signs every build
    /// with aps-environment production (TestFlight, App Store); a build signed
    /// for development would send "development" here.
    static let environment = "production"

    /// After launch, sign-in, the permission prompt and the switch: asks iOS
    /// for the token when the push is wanted, else takes it off the server.
    static func refresh(api: APIClient) async {
        guard api.hasSession else { return }
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if morningOn && (status == .authorized || status == .provisional) {
            UIApplication.shared.registerForRemoteNotifications()
        } else {
            await unregister(api: api)
        }
    }

    /// iOS gave the token (AppDelegate): sent to the server when it is new.
    static func received(_ deviceToken: Data, api: APIClient) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard morningOn, api.hasSession, !token.isEmpty,
              UserDefaults.standard.string(forKey: sentKey) != token else { return }
        do {
            try await api.registerPushToken(token, environment: environment)
            UserDefaults.standard.set(token, forKey: sentKey)
        } catch {
            // Sent again on the next launch.
        }
    }

    /// Removes the phone's token from the server (the switch off, "Odhlásit se").
    static func unregister(api: APIClient) async {
        guard let token = UserDefaults.standard.string(forKey: sentKey), api.hasSession else { return }
        do {
            try await api.removePushToken(token)
            UserDefaults.standard.removeObject(forKey: sentKey)
        } catch {
            // Tried again on the next refresh.
        }
    }

    /// Signed out: the next account sends the token again for itself.
    static func forget() {
        UserDefaults.standard.removeObject(forKey: sentKey)
    }
}
