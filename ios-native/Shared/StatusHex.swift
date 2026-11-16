// The one set of state colours (Palette.Status) as plain numbers, so the
// targets without SwiftUI's Palette (the Watch, its complications, the
// notification and morning extensions) draw exactly the same green, amber and
// red. Light first, then dark (the Watch is dark only).
enum StatusHex {
    /// Within the usual range, done, fine.
    static let good = (light: UInt32(0x1F6B52), dark: UInt32(0x8FE6C4))
    /// Slightly off, low, take care.
    static let warn = (light: UInt32(0xA35A12), dark: UInt32(0xF2B46B))
    /// Far off, past a limit, over.
    static let bad = (light: UInt32(0xC2362B), dark: UInt32(0xEC4A58))
}

extension StatusHex {
    /// The readiness zone the server sends ("green", "yellow", "red") as its state colour.
    static func zone(_ zone: String?) -> (light: UInt32, dark: UInt32)? {
        switch zone {
        case "green": return good
        case "yellow": return warn
        case "red": return bad
        default: return nil
        }
    }

    /// The red, green and blue parts of a hex colour, 0 to 1.
    static func rgb(_ hex: UInt32) -> (red: Double, green: Double, blue: Double) {
        (Double((hex >> 16) & 0xFF) / 255, Double((hex >> 8) & 0xFF) / 255, Double(hex & 0xFF) / 255)
    }
}
