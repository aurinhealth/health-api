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
    private var host: UIHostingController<AnyView>?

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        let readiness = content.userInfo["readiness"] as? [String: Any]
        let text = NotificationText.shown(content)
        let layout = (content.userInfo["layout"] as? [String: Any]).map(MorningLayout.init)
        let morning = Morning(score: (readiness?["score"] as? NSNumber)?.intValue, zone: readiness?["zone"] as? String,
                              title: text.title, subtitle: text.subtitle, body: text.body)
        let view: AnyView = layout.map { AnyView(TodayMorningView(score: morning.score, zone: morning.zone, layout: $0)) } ?? AnyView(MorningView(morning: morning))
        // Without the coach in the plan (no Aurin Pro), no "Ask Coach" under it (concept N1, free).
        // Hidden values keep the layout in `private`: the plan still decides the button.
        let planned = layout ?? ((content.userInfo["private"] as? [String: Any])?["layout"] as? [String: Any]).map(MorningLayout.init)
        if let planned, planned.coach == nil {
            extensionContext?.notificationActions = extensionContext?.notificationActions.filter { $0.identifier != "MORNING_ASK_COACH" } ?? []
        }
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

/// The morning in the concept's layout (src/push.js readinessMessage `layout`,
/// Notifications concept v3, N1): every text comes in the user's language.
struct MorningLayout {
    var label: String
    var pill: String?
    /// The day's verdict under the number (the server's `subtitle`, the banner's subtitle).
    var verdict: String?
    var night: String?
    /// The coach card's green sentence (the server's `advice`, not the verdict).
    var advice: String?
    /// "Coach" while the coach is in the plan; nil: no coach card.
    var coach: String?
    var workout: (title: String, sport: String?, time: String?, minutes: Int?)?
    /// "Today at 17:30" in the user's language; older servers send only the time.
    var when: String?

    init(_ info: [String: Any]) {
        label = info["label"] as? String ?? ""
        pill = info["pill"] as? String
        verdict = info["subtitle"] as? String
        night = info["night"] as? String
        advice = info["advice"] as? String
        coach = info["coach"] as? String
        if let w = info["workout"] as? [String: Any], let title = w["title"] as? String {
            workout = (title, w["sport"] as? String, w["time"] as? String, (w["minutes"] as? NSNumber)?.intValue)
            when = w["when"] as? String ?? w["time"] as? String
        }
    }
}

/// Held down: Today's readiness header and the coach's card, 1:1 with Today
/// in dark (concept 01-dnes a-hlavni and e-karta-kouce-tmavy): "Readiness",
/// the big serif number with its pill, the day's verdict in serif, then the
/// card with the two lights, the night in serif and the advice in green
/// italic, and the workout still planned. Without the coach only the header.
struct TodayMorningView: View {
    let score: Int?
    let zone: String?
    let layout: MorningLayout

    private static func color(_ hex: UInt32) -> Color {
        let c = StatusHex.rgb(hex)
        return Color(red: c.red, green: c.green, blue: c.blue)
    }
    // Today's dark tokens (Shared/Palette.swift): Glow.today, card, ink, muted, green.
    private let glow = Self.color(0x19322B)
    private let page = Self.color(0x0A0B0C)
    private let card = Self.color(0x1C1E1F)
    private let ink = Self.color(0xECEAE6)
    private let muted = Self.color(0xA3A8A5)
    private let green = Self.color(StatusHex.good.dark)

    private var pillColors: (Color, Color) {
        // Today's pill (HealthView ReadinessText.pill, dark): green, amber, rust.
        switch zone {
        case "green": return (green, Self.color(0x1D3B33))
        case "yellow": return (Self.color(StatusHex.warn.dark), Self.color(0x3A2A17))
        case "red": return (Self.color(0xF0907A), Self.color(0xF0907A).opacity(0.14))
        default: return (muted, muted.opacity(0.16))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(layout.label).font(.subheadline).foregroundStyle(muted)
                if let score {
                    HStack(alignment: .lastTextBaseline, spacing: 12) {
                        Text(String(score)).font(MorningFont.number(84)).foregroundStyle(ink).lineLimit(1).minimumScaleFactor(0.5)
                        if let pill = layout.pill {
                            Text(pill).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                                .foregroundStyle(pillColors.0)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(pillColors.1, in: Capsule())
                        }
                    }
                }
                if let verdict = layout.verdict {
                    Text(verdict).font(MorningFont.number(24)).foregroundStyle(ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            if layout.coach != nil, layout.night != nil || layout.advice != nil {
                coachCard
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [glow, page], startPoint: .top, endPoint: .bottom))
        .environment(\.colorScheme, .dark)
    }

    private var coachCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Self.color(0xF2B46B)).frame(width: 13, height: 13).offset(x: -3.5, y: -3.5)
                    Circle().fill(green).frame(width: 13, height: 13).offset(x: 3.5, y: 3.5)
                }
                .frame(width: 22, height: 22)
                .accessibilityHidden(true)
                Text(layout.coach ?? "").font(.subheadline.weight(.semibold)).foregroundStyle(ink).accessibilityAddTraits(.isHeader)
            }
            (Text(layout.night.map { $0 + " " } ?? "").font(MorningFont.number(20)).foregroundColor(ink)
             + Text(layout.advice ?? "").font(MorningFont.italic(20)).foregroundColor(green))
                .fixedSize(horizontal: false, vertical: true)
            if let workout = layout.workout {
                HStack(spacing: 12) {
                    let tint = Self.sportColor(workout.sport) ?? green
                    Image(systemName: Self.symbol(workout.sport))
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(tint)
                        .frame(width: 34, height: 34)
                        .background(tint.opacity(0.16), in: Circle())
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(workout.title).font(.subheadline.weight(.semibold)).foregroundStyle(ink).lineLimit(2)
                        let when = [layout.when, workout.minutes.map { "\($0) min" }].compactMap { $0 }.joined(separator: ", ")
                        if !when.isEmpty { Text(when).font(.caption).foregroundStyle(muted) }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// The sports' dark colours (project design rules): Ride, Run, Swim, Gym, Yoga.
    private static func sportColor(_ sport: String?) -> Color? {
        switch sport {
        case "ride": return color(0xB7A0F5)
        case "run": return color(0xFF9238)
        case "swim": return color(0x5CC8E8)
        case "strength": return color(0x8FE6C4)
        case "yoga": return color(0xF1CA47)
        default: return nil
        }
    }

    private static func symbol(_ sport: String?) -> String {
        switch sport {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "swim": return "figure.pool.swim"
        case "strength": return "dumbbell.fill"
        case "yoga": return "figure.yoga"
        default: return "figure.mixed.cardio"
        }
    }
}

/// The push's numbers and texts.
struct Morning {
    var score: Int?
    var zone: String?
    var title: String
    var subtitle: String
    var body: String

    /// "Readiness 78, Good day for a hard workout" → "Good day for a hard workout".
    /// Older servers sent " · " between the two; both still read.
    var advice: String? {
        guard let range = title.range(of: " · ") ?? title.range(of: ", ") else { return nil }
        return String(title[range.upperBound...])
    }

    /// "Sleep 7:12, HRV +4%, Resting HR −2" → [("Sleep", "7:12"), ("HRV", "+4%"), ("Resting HR", "−2")].
    var night: [(label: String, value: String)] {
        subtitle.replacingOccurrences(of: " · ", with: ", ").components(separatedBy: ", ").compactMap { part in
            guard let space = part.lastIndex(of: " ") else { return nil }
            return (String(part[..<space]), String(part[part.index(after: space)...]))
        }
    }
}

struct MorningView: View {
    let morning: Morning

    /// The state colours of the dark palette (Shared/StatusHex.swift, Palette.Status).
    private var zoneColor: Color {
        guard let hex = StatusHex.zone(morning.zone)?.dark else { return Color(white: 0.85) }
        let c = StatusHex.rgb(hex)
        return Color(red: c.red, green: c.green, blue: c.blue)
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
    /// The coach's key sentence: Instrument Serif italic, as on Today's coach card.
    static func italic(_ size: CGFloat) -> Font {
        if let url = Bundle.main.url(forResource: "InstrumentSerif-Italic", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        if UIFont(name: "InstrumentSerif-Italic", size: size) != nil { return .custom("InstrumentSerif-Italic", size: size) }
        return .system(size: size, design: .serif).italic()
    }

    /// Today's numbers are in Instrument Serif; a system serif if it can't be loaded.
    static func number(_ size: CGFloat) -> Font {
        if let url = Bundle.main.url(forResource: "InstrumentSerif-Regular", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        if UIFont(name: "InstrumentSerif-Regular", size: size) != nil { return .custom("InstrumentSerif-Regular", size: size) }
        return .system(size: size, design: .serif)
    }
}
