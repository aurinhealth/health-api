import UserNotifications

/// What a push from the server says. With Settings → Oznámení → Skrýt
/// zdravotní údaje on, the banner and the lock screen show only what came
/// ("Kouč odpověděl"), and the push's own texts come in `private` (src/push.js
/// hidesValues): the app and, held down on an unlocked phone, AurinMorning use
/// those. Also compiled into AurinMorning (project.yml).
struct NotificationText: Equatable {
    var title: String
    var subtitle: String
    var body: String

    init(title: String, subtitle: String = "", body: String) {
        self.title = title
        self.subtitle = subtitle
        self.body = body
    }

    /// The push's own texts: `private` when the values were hidden, else what the banner shows.
    init(_ content: UNNotificationContent) {
        let hidden = Self.hidden(content.userInfo)
        self.init(title: hidden?["title"] as? String ?? content.title,
                  subtitle: hidden?["subtitle"] as? String ?? content.subtitle,
                  body: hidden?["body"] as? String ?? content.body)
    }

    /// The banner's own texts, whatever came in `private`.
    static func shown(_ content: UNNotificationContent) -> NotificationText {
        NotificationText(title: content.title, subtitle: content.subtitle, body: content.body)
    }

    static func hidden(_ userInfo: [AnyHashable: Any]) -> [String: Any]? {
        userInfo["private"] as? [String: Any]
    }

    /// The morning readiness's score and zone, shown or hidden.
    static func readiness(_ userInfo: [AnyHashable: Any]) -> [String: Any]? {
        userInfo["readiness"] as? [String: Any] ?? hidden(userInfo)?["readiness"] as? [String: Any]
    }

    /// The morning readiness push, which also wakes the app for the widgets.
    static func isMorning(_ userInfo: [AnyHashable: Any]) -> Bool {
        readiness(userInfo) != nil
    }
}
