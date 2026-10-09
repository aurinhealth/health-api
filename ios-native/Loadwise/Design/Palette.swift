import SwiftUI
import UIKit

// Colour tokens from the design (artifact "Loadwise iOS návrh"): a warm paper
// light mode and an almost black dark mode. Every token has both variants, so
// views never check the colour scheme themselves.
enum Palette {
    static let background = Color(light: 0xF3EFE8, dark: 0x0A0B0C)
    /// Settings pages: flat, a touch greyer than the other screens.
    static let settingsBackground = Color(light: 0xF1EDE5, dark: 0x0A0B0C)
    static let card = Color(light: 0xFBFAF7, dark: 0x1C1E1F)
    static let ink = Color(light: 0x1B1A17, dark: 0xECEAE6)
    static let secondary = Color(light: 0x3B3832, dark: 0xD9D6D0)
    static let muted = Color(light: 0x6D6A63, dark: 0x9AA39F)
    static let faint = Color(light: 0x8B877F, dark: 0x7C837F)
    static let hairline = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.08)
    static let track = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.08)

    /// Solid buttons and the centre "+" of the tab bar.
    static let button = Color(light: 0x15140F, dark: 0xF4F2EE)
    static let onButton = Color(light: 0xF3EFE8, dark: 0x0A0B0C)

    static let green = Color(light: 0x1F6B52, dark: 0x8FE6C4)
    static let greenSoft = Color(light: 0xD3EADF, dark: 0x1D3B33)
    static let amber = Color(light: 0xA35A12, dark: 0xF2B46B)
    static let amberBar = Color(light: 0xC4782A, dark: 0xE09A55)
    static let amberSoft = Color(light: 0xF3E1C6, dark: 0x3A2A17)
    static let sand = Color(light: 0xE6D3B5, dark: 0x4A3B28)
    static let indigo = Color(light: 0x4F46C8, dark: 0xA5A1FF)
    static let lilac = Color(light: 0xD9D6F3, dark: 0x34325A)
    static let rust = Color(light: 0xB4532F, dark: 0xF0907A)
    static let blue = Color(light: 0x1D6FA3, dark: 0x7CC3F0)
    static let coffee = Color(light: 0x8A5A3B, dark: 0xD2A07E)
    static let brown = Color(light: 0x8A6D3B, dark: 0xCFB07A)
    static let gold = Color(light: 0xD9A521, dark: 0xE8C25A)
    /// The macros in the web app's colours: protein blue, carbs amber, fat violet.
    static let protein = Color(light: 0x2F7FD8, dark: 0x83C7FF)
    static let carbs = Color(light: 0xD98A06, dark: 0xFFC274)
    static let fat = Color(light: 0x7C5CE0, dark: 0xB3A1FF)

    /// The soft tint at the top of a screen, one per section.
    enum Glow {
        static let today = Color(light: 0xDCEBE2, dark: 0x1D3B33)
        static let health = Color(light: 0xE3E6F3, dark: 0x22253A)
        static let training = Color(light: 0xF3E3C6, dark: 0x3A2A17)
        static let food = Color(light: 0xF2E4D0, dark: 0x352818)
    }
}

extension Color {
    init(light: UInt32, dark: UInt32, alpha: Double = 1) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light, alpha: alpha)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: Double = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: alpha)
    }
}

/// Screen background: the paper colour with a section tint fading in from the top.
struct ScreenBackground: View {
    var glow: Color = Palette.Glow.today

    var body: some View {
        ZStack(alignment: .top) {
            Palette.background
            RadialGradient(colors: [glow, glow.opacity(0)], center: .top, startRadius: 0, endRadius: 520)
                .frame(height: 620)
                .offset(y: -60)
        }
        .ignoresSafeArea()
    }
}
