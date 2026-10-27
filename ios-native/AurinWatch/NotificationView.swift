import SwiftUI
import UserNotifications
import WatchKit

/// The coach's notifications on the watch (the morning card, a proposed
/// swap, a reply): today's readiness in the big ring in the middle, the title
/// in the serif and the text under it. The buttons come from the iPhone's
/// categories (PushRegistration.swift) and are answered there.
final class CoachNotificationController: WKUserNotificationHostingController<CoachNotificationView> {
    private var titleText = ""
    private var bodyText = ""

    override var body: CoachNotificationView {
        CoachNotificationView(title: titleText, text: bodyText, snapshot: WatchStore.shared.snapshot)
    }

    override func didReceive(_ notification: UNNotification) {
        titleText = notification.request.content.title
        bodyText = notification.request.content.body
        setNeedsBodyUpdate()
    }
}

struct CoachNotificationView: View {
    let title: String
    let text: String
    let snapshot: WatchSnapshot?

    private var today: WatchSnapshot? {
        guard let snapshot, snapshot.date == WatchStore.localDate(Date()) else { return nil }
        return snapshot
    }

    var body: some View {
        VStack(spacing: 6) {
            if let readiness = today?.readiness {
                Ring(fraction: Double(readiness) / 100, color: W.zoneColor(today?.zone), size: 78) {
                    Text("\(readiness)").font(W.serif(30)).foregroundStyle(W.ink)
                    Text(W.tr("připravenost", "readiness")).font(.system(size: 8)).foregroundStyle(W.muted)
                }
            } else {
                Image(systemName: "bubble.left.and.text.bubble.right")
                    .font(.system(size: 24))
                    .foregroundStyle(W.amber)
                    .frame(height: 40)
            }
            if !title.isEmpty {
                Text(title)
                    .font(W.serif(20))
                    .foregroundStyle(W.ink)
                    .multilineTextAlignment(.center)
            }
            Text(text)
                .font(W.news(15))
                .foregroundStyle(W.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }
}
