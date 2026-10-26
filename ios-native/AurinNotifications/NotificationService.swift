import CoreText
import UIKit
import UserNotifications

/// The morning readiness push (src/push.js readinessMessage) comes with
/// mutable-content and `readiness: {score, zone}`: before iOS shows it, this
/// extension draws the readiness ring with its score, coloured by the zone
/// like Today's dial, and attaches it, so the notification shows it on the
/// right (and large when opened). Any other push, or a failed drawing, passes
/// through unchanged.
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
    /// The zone colours of the dark palette (Shared/Palette.swift green, amber, red):
    /// the ring sits on a dark tile in light and dark mode alike.
    static func color(_ zone: String?) -> UIColor {
        switch zone {
        case "green": return UIColor(red: 0x8F / 255, green: 0xE6 / 255, blue: 0xC4 / 255, alpha: 1)
        case "yellow": return UIColor(red: 0xF2 / 255, green: 0xB4 / 255, blue: 0x6B / 255, alpha: 1)
        case "red": return UIColor(red: 0xFF / 255, green: 0x6B / 255, blue: 0x5B / 255, alpha: 1)
        default: return UIColor(white: 0.85, alpha: 1)
        }
    }

    static func image(score: Int, zone: String?) -> UIImage {
        let side: CGFloat = 300
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            UIColor(red: 0x0F / 255, green: 0x14 / 255, blue: 0x19 / 255, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: side, height: side))
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
