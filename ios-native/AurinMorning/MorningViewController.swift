import CoreText
import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// The morning readiness push held down (category MORNING_READINESS, src/push.js):
/// the morning in full on the sunrise from the welcome screen. The big ring
/// in the zone's colour, the advice from the title, the night's numbers from
/// the subtitle as chips and the day's plan from the body. Every text comes
/// from the push, already in the user's language. The buttons under it are
/// the category's (PushRegistration.swift).
///
/// With the values hidden (Settings → Oznámení → Skrýt zdravotní údaje) it
/// shows only what the banner says: iOS gives an extension no sure way to tell
/// a locked phone, so the numbers wait for the app.
final class MorningViewController: UIViewController, UNNotificationContentExtension {
    private var host: UIHostingController<MorningView>?

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        let readiness = content.userInfo["readiness"] as? [String: Any]
        let text = NotificationText.shown(content)
        let view = MorningView(morning: Morning(score: (readiness?["score"] as? NSNumber)?.intValue,
                                                zone: readiness?["zone"] as? String,
                                                title: text.title, subtitle: text.subtitle, body: text.body))
        if let host {
            host.rootView = view
            return
        }
        let host = UIHostingController(rootView: view)
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        self.view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: self.view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host
        let size = host.sizeThatFits(in: CGSize(width: self.view.bounds.width, height: .greatestFiniteMagnitude))
        preferredContentSize = CGSize(width: self.view.bounds.width, height: size.height)
    }
}

/// The push's numbers and texts.
struct Morning {
    var score: Int?
    var zone: String?
    var title: String
    var subtitle: String
    var body: String

    /// "Readiness 78 · Go hard today" → "Go hard today".
    var advice: String? {
        guard let range = title.range(of: " · ") else { return nil }
        return String(title[range.upperBound...])
    }

    /// "Sleep 7:12 · HRV +4% · Resting HR −2" → [("Sleep", "7:12"), ("HRV", "+4%"), ("Resting HR", "−2")].
    var night: [(label: String, value: String)] {
        subtitle.components(separatedBy: " · ").compactMap { part in
            guard let space = part.lastIndex(of: " ") else { return nil }
            return (String(part[..<space]), String(part[part.index(after: space)...]))
        }
    }
}

struct MorningView: View {
    let morning: Morning

    /// The zone colours of the dark palette (Shared/Palette.swift).
    private var zoneColor: Color {
        switch morning.zone {
        case "green": return Color(red: 0x8F / 255, green: 0xE6 / 255, blue: 0xC4 / 255)
        case "yellow": return Color(red: 0xF2 / 255, green: 0xB4 / 255, blue: 0x6B / 255)
        case "red": return Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x5B / 255)
        default: return Color(white: 0.85)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                if let score = morning.score {
                    ZStack {
                        Circle().stroke(Color.white.opacity(0.14), lineWidth: 13)
                        Circle().trim(from: 0, to: CGFloat(min(100, max(0, score))) / 100)
                            .stroke(zoneColor, style: StrokeStyle(lineWidth: 13, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        Text(String(score)).font(MorningFont.number(74)).foregroundStyle(.white)
                    }
                    .frame(width: 170, height: 170)
                }
                if let advice = morning.advice {
                    Text(advice).font(.callout.weight(.medium)).foregroundStyle(zoneColor).multilineTextAlignment(.center)
                }
                if !morning.night.isEmpty {
                    HStack(spacing: 10) {
                        ForEach(Array(morning.night.enumerated()), id: \.offset) { _, item in
                            VStack(spacing: 2) {
                                Text(item.label).font(.caption2).foregroundStyle(Color.white.opacity(0.6)).lineLimit(1)
                                Text(item.value).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(Color.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .minimumScaleFactor(0.8)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 28).padding(.bottom, 26).padding(.horizontal, 16)
            .background(Sunrise())
            if !morning.body.isEmpty {
                Text(morning.body).font(.subheadline).foregroundStyle(Color.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18).padding(.vertical, 14)
                    .background(Color(red: 0x14 / 255, green: 0x16 / 255, blue: 0x17 / 255))
            }
        }
        .environment(\.colorScheme, .dark)
    }
}

/// The welcome screen's sunrise: a warm glow rising from the bottom of the night.
struct Sunrise: View {
    var body: some View {
        RadialGradient(stops: [
            .init(color: Color(red: 0xE0 / 255, green: 0x9A / 255, blue: 0x55 / 255), location: 0),
            .init(color: Color(red: 0x8A / 255, green: 0x4A / 255, blue: 0x20 / 255), location: 0.3),
            .init(color: Color(red: 0x24 / 255, green: 0x17 / 255, blue: 0x0E / 255), location: 0.62),
            .init(color: Color(red: 0x0A / 255, green: 0x0B / 255, blue: 0x0C / 255), location: 1),
        ], center: UnitPoint(x: 0.5, y: 1.08), startRadius: 0, endRadius: 420)
        .background(Color(red: 0x0A / 255, green: 0x0B / 255, blue: 0x0C / 255))
    }
}

enum MorningFont {
    /// Today's numbers are in Instrument Serif; a system serif if it can't be loaded.
    static func number(_ size: CGFloat) -> Font {
        if let url = Bundle.main.url(forResource: "InstrumentSerif-Regular", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        if UIFont(name: "InstrumentSerif-Regular", size: size) != nil { return .custom("InstrumentSerif-Regular", size: size) }
        return .system(size: size, design: .serif)
    }
}
