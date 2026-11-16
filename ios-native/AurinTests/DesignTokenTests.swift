import SwiftUI
import UIKit
import XCTest
@testable import Aurin

/// The redesign's foundation (Z1): the decided colour values, the text
/// contrast on every surface and tint, the glossary and the demo person.
@MainActor
final class DesignTokenTests: XCTestCase {
    private func rgb(_ color: Color, dark: Bool) -> (Double, Double, Double) {
        let ui = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    private func hex(_ color: Color, dark: Bool) -> UInt32 {
        let (r, g, b) = rgb(color, dark: dark)
        return UInt32((r * 255).rounded()) << 16 | UInt32((g * 255).rounded()) << 8 | UInt32((b * 255).rounded())
    }

    private func luminance(_ color: Color, dark: Bool) -> Double {
        let (r, g, b) = rgb(color, dark: dark)
        func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    private func contrast(_ a: Color, _ b: Color, dark: Bool) -> Double {
        let x = luminance(a, dark: dark), y = luminance(b, dark: dark)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    /// Secondary and tertiary text reach 4.5:1 on the paper, the cards and
    /// the strongest point of each section tint, in light and dark mode.
    func testSmallTextContrast() {
        let surfaces: [(String, Color)] = [
            ("background", Palette.background), ("settings", Palette.settingsBackground), ("card", Palette.card),
            ("cardLift", Palette.cardLift), ("today", Palette.Glow.today), ("training", Palette.Glow.training),
            ("food", Palette.Glow.food), ("health", Palette.Glow.health)
        ]
        for dark in [false, true] {
            for (textName, text) in [("muted", Palette.muted), ("faint", Palette.faint)] {
                for (name, surface) in surfaces {
                    XCTAssertGreaterThanOrEqual(contrast(text, surface, dark: dark), 4.5, "\(textName) on \(name), dark \(dark)")
                }
            }
        }
    }

    func testSectionTints() {
        XCTAssertEqual(hex(Palette.Glow.today, dark: true), 0x19322B)
        XCTAssertEqual(hex(Palette.Glow.training, dark: false), 0xF3E3C6)
        XCTAssertEqual(hex(Palette.Glow.training, dark: true), 0x322519)
        XCTAssertEqual(hex(Palette.Glow.food, dark: false), 0xF6E1DF)
        XCTAssertEqual(hex(Palette.Glow.food, dark: true), 0x382224)
        XCTAssertEqual(hex(Palette.Glow.health, dark: false), 0xE3E6F3)
        XCTAssertEqual(hex(Palette.Glow.health, dark: true), 0x1E2136)
        // The share images take the same tints.
        XCTAssertEqual(hex(Palette.Glow.food.resolved(dark: true), dark: false), 0x382224)
    }

    /// One set of state colours: Palette, the Watch, widgets and extensions
    /// all read the same numbers.
    func testStatusColours() {
        for (color, pair) in [(Palette.Status.good, StatusHex.good), (Palette.Status.warn, StatusHex.warn), (Palette.Status.bad, StatusHex.bad)] {
            XCTAssertEqual(hex(color, dark: false), pair.light)
            XCTAssertEqual(hex(color, dark: true), pair.dark)
        }
        XCTAssertEqual(StatusHex.zone("yellow")?.dark, StatusHex.warn.dark)
        XCTAssertNil(StatusHex.zone(nil))
    }

    /// Set B (Petr 2026-11-15), Z1 to Z7.
    func testZonePalette() {
        let light: [UInt32] = [0x8A857C, 0x3E6FD9, 0x1F6B52, 0xC4782A, 0xC2362B, 0xA52FB8, 0xE0357F]
        let dark: [UInt32] = [0x8C928F, 0x86A9FF, 0x8FE6C4, 0xE09A55, 0xEC4A58, 0xD98BF0, 0xFF7EB6]
        XCTAssertEqual(Palette.Zone.all.map { hex($0, dark: false) }, light)
        XCTAssertEqual(Palette.Zone.all.map { hex($0, dark: true) }, dark)
        XCTAssertEqual(hex(Palette.Zone.color(12), dark: true), 0xFF7EB6)
        XCTAssertEqual(hex(HeartZoneStrip.color(1), dark: false), 0x3E6FD9)
    }

    /// Sport colours are an identity: the state changes the fill, never the hue.
    func testSportColoursCarryNoState() {
        XCTAssertEqual(hex(Palette.Sport.color("ride"), dark: false), 0x7657D6)
        XCTAssertEqual(hex(Palette.Sport.color("strength"), dark: true), 0x8FE6C4)
        XCTAssertEqual(hex(Palette.Sport.color("swim"), dark: true), 0x5CC8E8)
        XCTAssertEqual(hex(Palette.Sport.color("yoga"), dark: false), 0x967800)
        XCTAssertEqual(hex(Palette.Sport.fill("run", .done), dark: false), 0xC8600A)
        XCTAssertEqual(hex(Palette.Sport.fill("run", .missed), dark: false), hex(Palette.track, dark: false))
        XCTAssertEqual(hex(SportsChoice.color("run"), dark: true), 0xFF9238)
    }

    func testGlossary() throws {
        let path = try XCTUnwrap(Bundle(for: AppModel.self).path(forResource: "en", ofType: "lproj"))
        let table = try XCTUnwrap(NSDictionary(contentsOfFile: path + "/Localizable.strings") as? [String: String])
        XCTAssertEqual(table["Čas"], "Time")
        XCTAssertEqual(table["Jiná možnost"], "Another option")
        XCTAssertEqual(table["Tri"], "Tri")
        XCTAssertEqual(table["Navrhnout trénink"], "Suggest a workout")
        XCTAssertEqual(table["Upravit cviky"], "Edit exercises")
        XCTAssertEqual(table["Auto"], "Auto")
    }

    func testOneDemoPerson() {
        XCTAssertEqual(DemoData.profile["displayName"]?.string, "Alex Novak")
    }
}
