import SwiftUI
import UIKit

// Colour tokens from the design (artifact "Aurin iOS návrh"): a warm paper
// light mode and an almost black dark mode. Every token has both variants, so
// views never check the colour scheme themselves. In Shared, so the widgets
// use the same colours.
enum Palette {
    static let background = Color(light: 0xF3EFE8, dark: 0x0A0B0C)
    /// Settings pages: flat, a touch greyer than the other screens.
    static let settingsBackground = Color(light: 0xF1EDE5, dark: 0x0A0B0C)
    static let card = Color(light: 0xFBFAF7, dark: 0x1C1E1F)
    /// The top of a card, a touch lighter, and its lit top edge (cardSurface):
    /// the cards look like the glass of the bars and stay solid.
    static let cardLift = Color(light: 0xFFFFFF, dark: 0x25282A)
    static let cardEdge = Color(light: 0xFFFFFF, dark: 0x3A3E40)
    static let ink = Color(light: 0x1B1A17, dark: 0xECEAE6)
    static let secondary = Color(light: 0x3B3832, dark: 0xD9D6D0)
    /// Secondary text. At least 4.5:1 (WCAG AA for small text) on every
    /// surface in both modes, the section tints at the top of a screen
    /// included (DesignTokenTests). Text in it is never smaller than 11 pt.
    static let muted = Color(light: 0x5F5B54, dark: 0xA3A8A5)
    /// Tertiary text: units, chart axes, hints. Also at least 4.5:1 on every
    /// surface and tint in both modes (redesign D-TMAVY-3; 4.2:1 on the dark
    /// Today tint before), never smaller than 11 pt.
    static let faint = Color(light: 0x66625B, dark: 0x939A97)
    static let hairline = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.08)
    static let track = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.08)

    /// Solid buttons and the centre "+" of the tab bar.
    static let button = Color(light: 0x15140F, dark: 0xF4F2EE)
    static let onButton = Color(light: 0xF3EFE8, dark: 0x0A0B0C)
    /// An icon on a coloured fill (sport, drink, swipe action): white on the
    /// deep light-mode colours, near black on the pale dark-mode ones, where
    /// white read at about 1.5:1.
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x0A0B0C)

    static let green = Color(light: Status.Hex.good.light, dark: Status.Hex.good.dark)
    static let greenSoft = Color(light: 0xD3EADF, dark: 0x1D3B33)
    static let amber = Color(light: Status.Hex.warn.light, dark: Status.Hex.warn.dark)
    static let amberBar = Color(light: 0xC4782A, dark: 0xE09A55)
    static let amberSoft = Color(light: 0xF3E1C6, dark: 0x3A2A17)
    static let sand = Color(light: 0xE6D3B5, dark: 0x4A3B28)
    static let indigo = Color(light: 0x4F46C8, dark: 0xA5A1FF)
    static let lilac = Color(light: 0xD9D6F3, dark: 0x34325A)
    /// Cycle tracking: the period, its soft fill.
    static let pink = Color(light: 0xB83A6E, dark: 0xF0A0C0)
    static let pinkSoft = Color(light: 0xF6DCE6, dark: 0x4A2A38)
    static let rust = Color(light: 0xB4532F, dark: 0xF0907A)
    /// Past a limit (Týdenní kalorie over the week's target): redder than rust.
    static let red = Color(light: Status.Hex.bad.light, dark: Status.Hex.bad.dark)
    static let blue = Color(light: 0x1D6FA3, dark: 0x7CC3F0)
    static let coffee = Color(light: 0x8A5A3B, dark: 0xD2A07E)
    static let brown = Color(light: 0x8A6D3B, dark: 0xCFB07A)
    static let gold = Color(light: 0xD9A521, dark: 0xE8C25A)
    /// Aurin Pro's text and outline (the Pro concept): deep gold, pale in dark.
    static let proGold = Color(light: 0x7A5310, dark: 0xF7E2A6)
    /// The macros in the web app's colours: protein blue, carbs amber, fat violet.
    static let protein = Color(light: 0x2F7FD8, dark: 0x83C7FF)
    static let carbs = Color(light: 0xD98A06, dark: 0xFFC274)
    static let fat = Color(light: 0x7C5CE0, dark: 0xB3A1FF)

    /// The soft tint at the top of a screen, one per section (redesign Z1,
    /// Petr 2026-11-13): Today green, Training amber (its main page only),
    /// Food rose, Health indigo. Subpages and sheets take their tab's tint;
    /// live gym and the exercise swap take the Gym green (D-TMAVY-1). The dark
    /// tints are drawn weaker than the light ones.
    enum Glow {
        static let today = Color(light: 0xDCEBE2, dark: 0x19322B)
        static let health = Color(light: 0xE3E6F3, dark: 0x1E2136)
        static let training = Color(light: 0xF3E3C6, dark: 0x322519)
        static let food = Color(light: 0xF6E1DF, dark: 0x382224)
        /// Live gym and the exercise swap: the Gym sport's green.
        static let gym = today
        /// The coach's temporary chat (Dočasný chat), set apart from a normal one.
        static let ghost = Color(light: 0xDCD9E6, dark: 0x2A2836)
    }

    /// The one set of state colours for the whole app, the Watch, the widgets
    /// and the share images: within (good), slightly off (warn), far off or
    /// past a limit (bad). Only these mean a state; sport colours never do.
    enum Status {
        static let good = Palette.green
        static let warn = Palette.amber
        static let bad = Palette.red

        /// The numbers, shared with the targets that have no Palette
        /// (Shared/StatusHex.swift).
        typealias Hex = StatusHex
    }

    /// The one zone palette (Petr 2026-11-15, set B), for heart-rate and power
    /// zones everywhere: settings, the route map, charts and share images.
    /// Z1 grey, Z2 blue, Z3 green, Z4 amber, Z5 red, Z6 purple, Z7 pink.
    enum Zone {
        static let all: [Color] = [
            Color(light: 0x8A857C, dark: 0x8C928F), Color(light: 0x3E6FD9, dark: 0x86A9FF),
            Color(light: 0x1F6B52, dark: 0x8FE6C4), Color(light: 0xC4782A, dark: 0xE09A55),
            Color(light: 0xC2362B, dark: 0xEC4A58), Color(light: 0xA52FB8, dark: 0xD98BF0),
            Color(light: 0xE0357F, dark: 0xFF7EB6)
        ]
        /// Zone `index` from 0 (Z1); past Z7 stays Z7.
        static func color(_ index: Int) -> Color { all[max(0, min(index, all.count - 1))] }
    }

    /// Sport colours (Training main page, Petr 2026-11-16): an identity only,
    /// never a state. A workout's state is the fill: done = filled, waiting =
    /// pale, missed = grey (`Sport.fill`).
    /// Muscle freshness, one set everywhere (Training concept, Petr
    /// 2026-11-16): fresh a soft green, recovering amber, tired red.
    enum Freshness {
        static let fresh = Color(light: 0x73A191, dark: 0x639A85)
        static let recovering = Color(light: 0xD99A0B, dark: 0xF2AE3D)
        static let tired = Color(light: 0xDE5638, dark: 0xEB6B4E)
    }

    enum Sport {
        static let ride = Color(light: 0x7657D6, dark: 0xB7A0F5)
        static let run = Color(light: 0xC8600A, dark: 0xFF9238)
        static let swim = Color(light: 0x0B7FAB, dark: 0x5CC8E8)
        static let gym = Color(light: 0x1F6B52, dark: 0x8FE6C4)
        /// Saffron (Petr 2026-11-16): never as text in light mode (4.04:1).
        static let yoga = Color(light: 0x967800, dark: 0xF1CA47)
        static let walk = Color(light: 0xB83A6E, dark: 0xF0A0C0)
        static let hike = Color(light: 0x66780F, dark: 0xC6DB6E)
        static let other = Color(light: 0x8A6D3B, dark: 0xCFB07A)

        /// The colour for a sport id as the server sends it ("ride", "run",
        /// "swim", "strength" or "gym", "yoga", "walk", "hike"…).
        static func color(_ sport: String) -> Color {
            switch sport.lowercased() {
            case "ride", "cycling", "virtualride", "ebikeride": return ride
            case "run", "running", "trailrun", "virtualrun": return run
            case "swim", "swimming", "openwaterswim": return swim
            case "gym", "strength", "weighttraining": return gym
            case "yoga", "stretch", "pilates": return yoga
            case "walk", "walking": return walk
            case "hike", "hiking": return hike
            default: return other
            }
        }

        enum State { case done, waiting, missed }

        /// A workout's mark: the sport's colour filled when done, pale while it
        /// waits, grey when missed. The state is never a different hue.
        static func fill(_ sport: String, _ state: State) -> Color {
            switch state {
            case .done: return color(sport)
            case .waiting: return color(sport).opacity(0.28)
            case .missed: return Palette.track
            }
        }
    }
}

extension Color {
    init(light: UInt32, dark: UInt32, alpha: Double = 1) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light, alpha: alpha)
        })
    }
}

extension Color {
    /// This colour as drawn in light or dark mode, for images rendered off
    /// screen (share images), which have no colour scheme of their own.
    func resolved(dark: Bool) -> Color {
        Color(uiColor: UIColor(self).resolvedColor(with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light)))
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
