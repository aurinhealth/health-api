import UIKit
import UserNotifications

// The morning readiness push ("Připravenost 72 · dnes klidně intervaly"),
// sent by the server (src/push.js) once a day after the night's data arrives,
// and the coach's own message (src/coach-push.js), at most one a day, some with
// "Vyměnit" and "Nechat". The phone hands the server its APNs device token
// while notifications are allowed and Settings → Oznámení → Ranní připravenost
// or Kouč is on; otherwise, and on "Odhlásit se", the token is removed from the
// server again. Which of the two the phone wants, the server keeps too.

/// Receives the device token from iOS (LoadwiseApp's delegate adaptor) and
/// the answers to the pill reminder ("Vzato", "Za 30 minut").
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// The same server and session cookie as AppModel's client (shared cookie storage).
    private let api = APIClient()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Every launch asks for the token again; it is sent only when it changed.
        let client = self.api
        Task { @MainActor in await PushRegistration.refresh(api: client) }
        // Syncing without the app being opened (BackgroundRefresh.swift); not
        // with the sample data of "-demo".
        if !ProcessInfo.processInfo.arguments.contains("-demo") {
            MainActor.assumeIsolated {
                AppleHealth.shared.start(api: client)
                BackgroundRefresh.register(api: client)
                BackgroundRefresh.schedule()
                LiveWorkout.shared.endOrphanedSession()
            }
        }
        // A tap outside a text field hides the keyboard (KeyboardDismiss.swift).
        MainActor.assumeIsolated { KeyboardDismiss.install() }
        // Crashes from MetricKit for "Nahlásit problém" (CrashReports.swift).
        CrashReports.shared.start()
        let center = UNUserNotificationCenter.current()
        center.setNotificationCategories([Reminders.pillNotificationCategory, CoachPush.category])
        center.delegate = self
        return true
    }

    /// The icon's menu (QuickActions.swift): a pick that launches the app comes
    /// here, later picks go to the scene delegate.
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem {
            MainActor.assumeIsolated { QuickActions.shared.receive(item) }
        }
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = QuickActionSceneDelegate.self
        return configuration
    }

    /// In the app the pill reminder shows as a banner; the others stay quiet
    /// as before.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let content = notification.request.content
        if content.categoryIdentifier == Reminders.pillCategory { return [.banner, .sound, .list] }
        // The coach's message, also while the app is open.
        return content.userInfo["coach"] != nil ? [.banner, .list] : []
    }

    /// "Vzato" logs the pill of the reminder's day at this time; "Za 30
    /// minut" asks again later.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        if content.categoryIdentifier == CoachPush.categoryID {
            await CoachPush.answer(response, api: api)
            return
        }
        guard content.categoryIdentifier == Reminders.pillCategory else { return }
        let date = content.userInfo["date"] as? String ?? AppModel.localDate(Date())
        switch response.actionIdentifier {
        case Reminders.pillTakenAction:
            _ = try? await api.saveCycleDay(["date": .string(date), "pill": .string(AppModel.clockNow())])
        case Reminders.pillSnoozeAction:
            await Reminders.snoozePill(date: date, title: content.title, body: content.body)
        default:
            break
        }
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

    /// Settings → Oznámení → Kouč; on until turned off.
    static let coachKey = "remind.coach"
    /// The two switches as last told to the server.
    private static let sentChoicesKey = "push.sentChoices"

    static var morningOn: Bool {
        UserDefaults.standard.object(forKey: morningKey) as? Bool ?? true
    }

    static var coachOn: Bool {
        UserDefaults.standard.object(forKey: coachKey) as? Bool ?? true
    }

    /// The APNs service the token belongs to. project.yml signs every build
    /// with aps-environment production (TestFlight, App Store); a build signed
    /// for development would send "development" here.
    static let environment = "production"

    /// After launch, sign-in, the permission prompt and the switch: asks iOS
    /// for the token when the push is wanted, else takes it off the server.
    static func refresh(api: APIClient) async {
        guard api.hasSession else { return }
        await sendChoices(api: api)
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if (morningOn || coachOn) && (status == .authorized || status == .provisional) {
            UIApplication.shared.registerForRemoteNotifications()
        } else {
            await unregister(api: api)
        }
    }

    /// iOS gave the token (AppDelegate): sent to the server when it is new.
    static func received(_ deviceToken: Data, api: APIClient) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard morningOn || coachOn, api.hasSession, !token.isEmpty,
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

    /// The server sends only the pushes whose switch is on; told when a switch changed.
    private static func sendChoices(api: APIClient) async {
        let choices = "\(morningOn),\(coachOn)"
        guard UserDefaults.standard.string(forKey: sentChoicesKey) != choices else { return }
        do {
            try await api.setPushChoices(morning: morningOn, coach: coachOn)
            UserDefaults.standard.set(choices, forKey: sentChoicesKey)
        } catch {
            // Told on the next refresh.
        }
    }

    /// Signed out: the next account sends the token and the switches again for itself.
    static func forget() {
        UserDefaults.standard.removeObject(forKey: sentKey)
        UserDefaults.standard.removeObject(forKey: sentChoicesKey)
    }
}

/// The coach's push "Zítřejší práh vyměním za lehkou jízdu 60 min?" with
/// "Vyměnit" and "Nechat" (src/coach-push.js), answered without opening the
/// app; a short notification says how a swap went.
enum CoachPush {
    static let categoryID = "COACH_SWAP"
    private static let swapAction = "COACH_SWAP_YES"
    private static let keepAction = "COACH_SWAP_NO"

    static var category: UNNotificationCategory {
        UNNotificationCategory(identifier: categoryID, actions: [
            UNNotificationAction(identifier: swapAction, title: L10n.tr("Vyměnit"), options: []),
            UNNotificationAction(identifier: keepAction, title: L10n.tr("Nechat"), options: [])
        ], intentIdentifiers: [], options: [])
    }

    static func answer(_ response: UNNotificationResponse, api: APIClient) async {
        let coach = response.notification.request.content.userInfo["coach"] as? [String: Any]
        guard let date = coach?["date"] as? String else { return }
        switch response.actionIdentifier {
        case keepAction:
            _ = try? await api.answerCoachNudge(date: date, decision: "keep")
        case swapAction:
            let content = UNMutableNotificationContent()
            do {
                let nudge = try await api.answerCoachNudge(date: date, decision: "swap")
                guard nudge?.status == "swapped" else { return }
                content.title = L10n.tr("Vyměněno")
                content.body = [nudge?.to?.name, nudge?.to?.minutes.map { L10n.f("%@ min", String($0)) }].compactMap { $0 }.joined(separator: " · ")
            } catch {
                content.title = L10n.tr("Trénink zůstal, jak byl")
                content.body = error.localizedDescription
            }
            try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "aurin-coach-swap", content: content, trigger: nil))
        default:
            // Tapping the message opens the app on Dnes.
            break
        }
    }
}
