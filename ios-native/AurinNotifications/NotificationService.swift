import CoreText
import UIKit
import UserNotifications

/// A server from before the concept's layout: the morning readiness push (src/push.js readinessMessage) comes with
/// mutable-content and `readiness: {score, zone}`: before iOS shows it, this
/// extension draws the readiness ring with its score, coloured by the zone
/// like Today's dial, on the welcome screen's sunrise, and attaches it, so the notification shows it on the
/// right (and large when opened). Any other push, or a failed drawing, passes
/// through unchanged. With the values hidden (Settings → Oznámení → Skrýt
/// zdravotní údaje) the score comes only in `private`, so no ring is drawn.
/// A current server adds `layout` (Notifications concept v3, N1): the banner
/// takes its title, subtitle and body and no ring is drawn beside it.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        self.content = content
        // The morning in the concept's banner (Notifications concept v3, N1):
        // "Readiness 78", the verdict, the night in words and the advice; no
        // ring beside it. Hidden values send no layout outside `private`.
        if let layout = request.content.userInfo["layout"] as? [String: Any], let title = layout["title"] as? String {
            content.title = title
            content.subtitle = layout["subtitle"] as? String ?? ""
            content.body = layout["body"] as? String ?? content.body
            contentHandler(content)
            return
        }
        if let readiness = request.content.userInfo["readiness"] as? [String: Any],
           let score = (readiness["score"] as? NSNumber)?.intValue,
           let url = ReadinessRing.file(score: score, zone: readiness["zone"] as? String),
           let attachment = try? UNNotificationAttachment(identifier: "readiness", url: url, options: nil) {
            content.attachments = [attachment]
        }
        contentHandler(content)
    }

    /// iOS gives the extension about 30 seconds; the text goes out as it came.
    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let content { contentHandler(content) }
    }
}

/// The ring as a PNG in the extension's temporary folder (iOS moves the
/// attachment into its own store).
enum ReadinessRing {
    /// The state colours of the dark palette (Shared/StatusHex.swift, Palette.Status):
    /// the ring sits on a dark tile in light and dark mode alike.
    static func color(_ zone: String?) -> UIColor {
        guard let hex = StatusHex.zone(zone)?.dark else { return UIColor(white: 0.85, alpha: 1) }
        let c = StatusHex.rgb(hex)
        return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: 1)
    }

    static func image(score: Int, zone: String?) -> UIImage {
        let side: CGFloat = 300
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            // The welcome screen's sunrise: a warm glow rising from the bottom
            // of the night (AurinMorning/MorningViewController.swift Sunrise).
            UIColor(red: 0x1B / 255, green: 0x1D / 255, blue: 0x20 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: side, height: side))
            let glow = [(0xE0, 0x9A, 0x55), (0x8A, 0x4A, 0x20), (0x24, 0x17, 0x0E), (0x1B, 0x1D, 0x20)]
                .map { UIColor(red: CGFloat($0.0) / 255, green: CGFloat($0.1) / 255, blue: CGFloat($0.2) / 255, alpha: 1).cgColor }
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: glow as CFArray, locations: [0, 0.3, 0.62, 1]) {
                context.cgContext.drawRadialGradient(gradient, startCenter: CGPoint(x: side / 2, y: side * 1.15), startRadius: 0,
                                                     endCenter: CGPoint(x: side / 2, y: side * 1.15), endRadius: side * 1.1, options: [])
            }
            let center = CGPoint(x: side / 2, y: side / 2), radius: CGFloat = 112, width: CGFloat = 22
            let track = UIBezierPath(arcCenter: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: true)
            track.lineWidth = width
            UIColor(white: 1, alpha: 0.14).setStroke()
            track.stroke()
            let share = CGFloat(max(0, min(100, score))) / 100
            if share > 0 {
                let arc = UIBezierPath(arcCenter: center, radius: radius, startAngle: -.pi / 2, endAngle: -.pi / 2 + .pi * 2 * share, clockwise: true)
                arc.lineWidth = width
                arc.lineCapStyle = .round
                color(zone).setStroke()
                arc.stroke()
            }
            let text = NSAttributedString(string: String(score), attributes: [.font: numberFont(size: 128), .foregroundColor: UIColor.white])
            let size = text.size()
            text.draw(at: CGPoint(x: center.x - size.width / 2, y: center.y - size.height / 2 + 4))
        }
    }

    static func file(score: Int, zone: String?) -> URL? {
        guard let data = image(score: score, zone: zone).pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("readiness-\(UUID().uuidString).png")
        do { try data.write(to: url) } catch { return nil }
        return url
    }

    /// Today's numbers are in Instrument Serif; a system serif if it can't be loaded.
    private static func numberFont(size: CGFloat) -> UIFont {
        if let url = Bundle.main.url(forResource: "InstrumentSerif-Regular", withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        if let font = UIFont(name: "InstrumentSerif-Regular", size: size) { return font }
        let system = UIFont.systemFont(ofSize: size)
        return system.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: size) } ?? system
    }
}
