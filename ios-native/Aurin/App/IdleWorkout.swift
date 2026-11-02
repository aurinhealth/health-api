import Foundation
import UserNotifications

/// A gym left running in Training mode on the iPhone without the Apple Watch
/// (the watch asks on the wrist itself, GymWorkout): 10 min after the last
/// set a notification asks "Still working out?" with End workout and Keep
/// going; with no answer the workout ends 30 min after the last set, saved
/// with its end there (LiveWorkout.checkIdle). A workout nobody ended kept
/// the screen, the heart rate and the HealthKit session going for hours.
///
/// The question is planned ahead with each set, so it comes with the app asleep too.
enum IdleWorkout {
    static let askAfter: TimeInterval = 10 * 60
    static let endAfter: TimeInterval = 30 * 60

    static let categoryID = "gym.idle"
    /// Outside the "aurin." prefix, so planning the day's reminders keeps it.
    private static let requestID = "aurin-gym-idle"
    private static let endAction = "gym.idle.end"
    private static let keepAction = "gym.idle.keep"

    static var category: UNNotificationCategory {
        UNNotificationCategory(identifier: categoryID, actions: [
            UNNotificationAction(identifier: endAction, title: L10n.tr("Ukončit trénink"), options: [.foreground]),
            UNNotificationAction(identifier: keepAction, title: L10n.tr("Ještě cvičím"), options: [])
        ], intentIdentifiers: [], options: [])
    }

    /// The question 10 min after `last`; nil takes it away (the watch records, the workout ended).
    @MainActor static func plan(after last: Date?) async {
        call += 1
        let mine = call
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [requestID])
        center.removeDeliveredNotifications(withIdentifiers: [requestID])
        guard let last else { return }
        let wait = last.addingTimeInterval(askAfter).timeIntervalSinceNow
        guard wait > 1 else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional, mine == call else { return }
        let content = UNMutableNotificationContent()
        content.title = L10n.tr("Pořád cvičíš?")
        content.body = L10n.tr("Žádná série 10 minut. Ukonči trénink, nebo pokračuj.")
        content.categoryIdentifier = categoryID
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: requestID, content: content, trigger: trigger))
    }

    @MainActor private static var call = 0

    /// A tap on End workout or Keep going (AppDelegate).
    @MainActor static func answer(_ response: UNNotificationResponse) {
        switch response.actionIdentifier {
        case endAction: LiveWorkout.shared.endIdle()
        case keepAction: LiveWorkout.shared.worked()
        default: break
        }
    }
}
