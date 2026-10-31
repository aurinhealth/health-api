import UIKit
@preconcurrency import UserNotifications

// The morning readiness push ("Připravenost 72 · dnes klidně intervaly"),
// sent by the server (src/push.js) once a day after the night's data arrives,
// and the coach's own message (src/coach-push.js), at most one a day, some with
// "Vyměnit" and "Nechat". The phone hands the server its APNs device token
// while notifications are allowed and Settings → Oznámení → Ranní připravenost
// or Kouč is on; otherwise, and on "Odhlásit se", the token is removed from the
// server again. Which of the two the phone wants, the server keeps too.

/// Receives the device token from iOS (AurinApp's delegate adaptor) and
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
                // Today for the Apple Watch app (WatchBridge.swift).
                WatchBridge.shared.start()
            }
        }
        // A tap outside a text field hides the keyboard (KeyboardDismiss.swift).
        MainActor.assumeIsolated { KeyboardDismiss.install() }
        // Crashes from MetricKit for "Nahlásit problém" (CrashReports.swift).
        CrashReports.shared.start()
        let center = UNUserNotificationCenter.current()
        center.setNotificationCategories(Set(Reminders.pillNotificationCategories + [CoachPush.category, CoachPush.replyCategory, CoachPush.actionCategory,
                                                                                    MorningPush.category]))
        center.delegate = self
        return true
    }

    /// The morning readiness push (src/push.js) comes with content-available:
    /// Today for the widgets in the background (BackgroundRefresh.morningPush).
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        guard userInfo["readiness"] != nil, !ProcessInfo.processInfo.arguments.contains("-demo") else { return .noData }
        return await BackgroundRefresh.morningPush(api: api) ? .newData : .failed
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

    /// In the app the pill reminder and the server's pushes show as a banner;
    /// the other reminders stay quiet as before.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let content = notification.request.content
        let options: UNNotificationPresentationOptions
        if Reminders.isPill(content.categoryIdentifier) {
            options = [.banner, .sound, .list]
        } else {
            // The server's pushes (the morning readiness, the coach), also while the
            // app is open: opening the app uploads the night, which sends the morning
            // push at once, and with no options iOS dropped it without a trace.
            options = notification.request.trigger is UNPushNotificationTrigger || content.userInfo["coach"] != nil ? [.banner, .list] : []
        }
        DispatchQueue.main.async { completionHandler(options) }
    }

    /// "Vzato" logs the pill of the reminder's day at this time; "Za 30
    /// minut" asks again later.
    ///
    /// The completion handler goes back to iOS on the main thread: called from
    /// the async version's background thread, UIKit took the app's snapshot
    /// there and the app crashed after a tap on a notification.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let api = self.api
        Task { @MainActor in
            await Self.handle(response, api: api)
            completionHandler()
        }
    }

    @MainActor
    private static func handle(_ response: UNNotificationResponse, api: APIClient) async {
        let content = response.notification.request.content
        if CoachPush.categories.contains(content.categoryIdentifier) || content.userInfo["coach"] != nil {
            await CoachPush.answer(response, api: api)
            return
        }
        if content.categoryIdentifier == MorningPush.categoryID {
            MorningPush.answer(response)
            return
        }
        if let product = FoodPush.product(from: content.userInfo) {
            FoodPush.shared.product = product
            return
        }
        guard Reminders.isPill(content.categoryIdentifier) else { return }
        let date = content.userInfo["date"] as? String ?? AppModel.localDate(Date())
        if Reminders.isPillTaken(response.actionIdentifier) {
            _ = try? await api.saveCycleDay(["date": .string(date), "pill": .string(AppModel.clockNow())])
        } else if Reminders.isPillSnooze(response.actionIdentifier) {
            await Reminders.snoozePill(date: date, title: content.title, body: content.body)
        }
    }

    /// iOS woke the app for the background upload of a reply to the coach (CoachReplyUpload).
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        CoachReplyUpload.shared.finished(identifier, completionHandler)
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

    /// Oznámení → Pití also stops the server's water push (Build-up, src/water-goal.js).
    static var waterOn: Bool { Reminders.isOn(Reminders.waterKey) }

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
        if (morningOn || coachOn || waterOn) && (status == .authorized || status == .provisional) {
            UIApplication.shared.registerForRemoteNotifications()
        } else {
            await unregister(api: api)
        }
    }

    /// iOS gave the token (AppDelegate): sent to the server when it is new.
    static func received(_ deviceToken: Data, api: APIClient) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard morningOn || coachOn || waterOn, api.hasSession, !token.isEmpty,
              UserDefaults.standard.string(forKey: sentKey) != token else { return }
        do {
            try await api.registerPushToken(token, environment: environment)
            UserDefaults.standard.set(token, forKey: sentKey)
        } catch {
            // Sent again on the next launch.
        }
    }

    /// Removes the phone's token from the server (the switch off, "Odhlásit se").
    /// False when the server still has it.
    @discardableResult
    static func unregister(api: APIClient) async -> Bool {
        guard let token = UserDefaults.standard.string(forKey: sentKey) else { return true }
        // Without a session the server cannot be told: false, so "Odhlásit se"
        // leaves Apple's push service instead of keeping the account's pushes.
        guard api.hasSession else { return false }
        do {
            try await api.removePushToken(token)
            UserDefaults.standard.removeObject(forKey: sentKey)
            return true
        } catch {
            // Tried again on the next refresh.
            return false
        }
    }

    /// Signing out without signal: the server could not be told, so the phone
    /// leaves Apple's push service and the old account's pushes no longer reach
    /// the lock screen (Apple then answers the server that the token is gone).
    /// The next sign-in registers again.
    static func leavePushService() {
        UIApplication.shared.unregisterForRemoteNotifications()
    }

    /// The server sends only the pushes whose switch is on; told when a switch changed.
    private static func sendChoices(api: APIClient) async {
        let choices = "\(morningOn),\(coachOn),\(waterOn)"
        guard UserDefaults.standard.string(forKey: sentChoicesKey) != choices else { return }
        do {
            try await api.setPushChoices(morning: morningOn, coach: coachOn, water: waterOn)
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

/// The morning readiness push (src/push.js): held down it shows the morning
/// in full (AurinMorning), with "Zeptat se kouče" under it, which opens the
/// coach about today. A tap opens the app as before.
enum MorningPush {
    static let categoryID = "MORNING_READINESS"
    private static let coachAction = "MORNING_ASK_COACH"

    static var category: UNNotificationCategory {
        UNNotificationCategory(identifier: categoryID, actions: [
            UNNotificationAction(identifier: coachAction, title: L10n.tr("Zeptat se kouče"), options: [.foreground])
        ], intentIdentifiers: [], options: [])
    }

    @MainActor
    static func answer(_ response: UNNotificationResponse) {
        guard response.actionIdentifier == coachAction else { return }
        QuickActions.shared.pick = QuickActions.Pick(id: "coach")
    }
}

/// The coach's push "Zítřejší práh vyměním za lehkou jízdu 60 min?" with
/// "Vyměnit" and "Nechat" (src/coach-push.js), answered without opening the
/// app; a short notification says how a swap went. Every coach push has
/// "Odpovědět": the text goes to the coach (CoachReplyUpload), who answers
/// with a push of his own (src/coach-push-reply.js); one proposal in it gets
/// "Potvrdit" and "Ne". A tap on an answer opens its chat.
enum CoachPush {
    static let categoryID = "COACH_SWAP"
    static let replyCategoryID = "COACH_REPLY"
    static let actionCategoryID = "COACH_ACTION"
    static let categories: Set<String> = [categoryID, replyCategoryID, actionCategoryID]
    private static let swapAction = "COACH_SWAP_YES"
    private static let keepAction = "COACH_SWAP_NO"
    private static let replyAction = "COACH_REPLY_TEXT"
    private static let confirmAction = "COACH_ACTION_YES"
    private static let rejectAction = "COACH_ACTION_NO"

    private static var reply: UNTextInputNotificationAction {
        UNTextInputNotificationAction(identifier: replyAction, title: L10n.tr("Odpovědět"), options: [],
                                      textInputButtonTitle: L10n.tr("Odeslat"), textInputPlaceholder: L10n.tr("Napiš kouči…"))
    }

    static var category: UNNotificationCategory {
        UNNotificationCategory(identifier: categoryID, actions: [
            UNNotificationAction(identifier: swapAction, title: L10n.tr("Vyměnit"), options: []),
            UNNotificationAction(identifier: keepAction, title: L10n.tr("Nechat"), options: []),
            reply
        ], intentIdentifiers: [], options: [])
    }

    static var replyCategory: UNNotificationCategory {
        UNNotificationCategory(identifier: replyCategoryID, actions: [reply], intentIdentifiers: [], options: [])
    }

    static var actionCategory: UNNotificationCategory {
        UNNotificationCategory(identifier: actionCategoryID, actions: [
            UNNotificationAction(identifier: confirmAction, title: L10n.tr("Potvrdit"), options: []),
            UNNotificationAction(identifier: rejectAction, title: L10n.tr("Ne"), options: []),
            reply
        ], intentIdentifiers: [], options: [])
    }

    static func answer(_ response: UNNotificationResponse, api: APIClient) async {
        let content = response.notification.request.content
        let coach = content.userInfo["coach"] as? [String: Any]
        let chatId = (coach?["chatId"] as? NSNumber)?.intValue
        switch response.actionIdentifier {
        case replyAction:
            guard let text = (response as? UNTextInputNotificationResponse)?.userText.trimmingCharacters(in: .whitespacesAndNewlines),
                  !text.isEmpty else { return }
            // The coach takes a while: the upload goes on in the background.
            CoachReplyUpload.shared.send(text: text, title: content.title, body: content.body, chatId: chatId, api: api)
        case confirmAction, rejectAction:
            guard let draft = (coach?["draftId"] as? NSNumber)?.intValue else { return }
            let confirm = response.actionIdentifier == confirmAction
            let note = UNMutableNotificationContent()
            do {
                let result = try await api.decideCoachAction(draftId: draft, confirm: confirm)
                guard confirm else { return }
                note.title = L10n.tr("Hotovo")
                note.body = result.message ?? L10n.tr("Změna je v plánu.")
            } catch {
                note.title = L10n.tr("Změna neprošla")
                note.body = error.localizedDescription
            }
            if let chatId { note.userInfo = ["coach": ["kind": "reply", "chatId": chatId] as [String: Any]] }
            try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "aurin-coach-action", content: note, trigger: nil))
        case keepAction:
            guard let date = coach?["date"] as? String else { return }
            _ = try? await api.answerCoachNudge(date: date, decision: "keep")
        case swapAction:
            guard let date = coach?["date"] as? String else { return }
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
        case UNNotificationDefaultActionIdentifier:
            // Tapping an answer opens its chat; the coach's own message opens the app on Dnes.
            if let chatId { await MainActor.run { CoachPushOpen.shared.chat = chatId } }
        default:
            break
        }
    }
}

/// The chat RootView opens for a tapped answer of the coach.
@MainActor @Observable
final class CoachPushOpen {
    static let shared = CoachPushOpen()
    var chat: Int?
}

/// The sheet item of that chat (RootView).
struct CoachChatRef: Identifiable {
    let id: Int
}

/// "Odpovědět" sends the text in a background upload: iOS keeps the request
/// open while the coach thinks (up to three minutes) even when the app is
/// suspended, and the server sends his answer as a push
/// (POST /app/api/assistant/push-reply).
final class CoachReplyUpload: NSObject, URLSessionDelegate, @unchecked Sendable {
    static let shared = CoachReplyUpload()
    static let identifier = (Bundle.main.bundleIdentifier ?? "aurin") + ".coach-reply"
    private let lock = NSLock()
    private var done: (@Sendable () -> Void)?

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 200
        config.sessionSendsLaunchEvents = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    func send(text: String, title: String, body: String, chatId: Int?, api: APIClient) {
        var payload: JSONObject = ["text": .string(text), "title": .string(title), "body": .string(body)]
        if let chatId { payload["chatId"] = .number(Double(chatId)) }
        guard let request = try? api.pushReplyRequest(), let data = try? JSONEncoder().encode(payload) else { return }
        // A background upload goes from a file.
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("coach-reply-\(UUID().uuidString).json")
        guard (try? data.write(to: file)) != nil else { return }
        session.uploadTask(with: request, fromFile: file).resume()
    }

    /// iOS relaunched the app for the session's events: done once they are delivered.
    func finished(_ identifier: String, _ completion: @escaping @Sendable () -> Void) {
        guard identifier == Self.identifier else { completion(); return }
        lock.lock(); done = completion; lock.unlock()
        _ = session
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        lock.lock(); let completion = done; done = nil; lock.unlock()
        DispatchQueue.main.async { completion?() }
    }
}

/// "Díky za nahlášení!" or "Tvoje oprava platí.": the owner approved the
/// user's report or correction of a food (src/push.js sendFoodApproved). A tap
/// opens the corrected food, marked "Opraveno" (RootView).
@MainActor @Observable
final class FoodPush {
    static let shared = FoodPush()
    /// The food to open, until RootView has opened it.
    var product: FoodProduct?

    nonisolated static func product(from userInfo: [AnyHashable: Any]) -> FoodProduct? {
        guard let food = userInfo["food"] as? [String: Any], let product = food["product"],
              JSONSerialization.isValidJSONObject(product),
              let data = try? JSONSerialization.data(withJSONObject: product) else { return nil }
        return try? JSONDecoder().decode(FoodProduct.self, from: data)
    }
}
