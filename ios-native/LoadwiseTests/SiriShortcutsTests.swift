import XCTest
@testable import Loadwise

/// What Siri says and the glass "Zapsat vodu" logs (App/SiriShortcuts.swift, Shared/QuickDrink.swift).
final class SiriShortcutsTests: XCTestCase {
    override func setUp() {
        L10n.setLanguage("cs")
        Units.setSystem("metric")
    }

    override func tearDown() {
        L10n.setLanguage("cs")
    }

    func testReadinessSaysTheNumberTheWordAndTheAdvice() {
        XCTAssertEqual(SiriAnswer.readiness(score: 78, zone: "green", advice: " Dnes klidně tvrdý trénink. "),
                       "Připravenost je dnes 78, vysoká. Dnes klidně tvrdý trénink.")
        XCTAssertEqual(SiriAnswer.readiness(score: 41, zone: nil, advice: nil), "Připravenost je dnes 41.")
        XCTAssertTrue(SiriAnswer.readiness(score: nil, zone: "red", advice: "x").hasPrefix("Dnešní připravenost zatím není."))
    }

    func testReadinessInEnglish() {
        L10n.setLanguage("en")
        XCTAssertEqual(SiriAnswer.readiness(score: 78, zone: "yellow", advice: nil), "Your readiness today is 78, moderate.")
    }

    func testWeightSaysWhetherItWentOut() {
        XCTAssertEqual(SiriAnswer.weight(kg: 82.4, sent: true), "Zapsáno 82,4 kg.")
        XCTAssertEqual(SiriAnswer.weight(kg: 82, sent: false), "Zapsáno 82,0 kg. Odešle se, až bude signál.")
    }

    func testGlassIsTheSmallestSavedWaterAmount() {
        XCTAssertEqual(PendingDrinks.glassMl(saved: "500,330,0", imperial: false), 330)
        XCTAssertEqual(PendingDrinks.glassMl(saved: nil, imperial: false), 250)
        XCTAssertEqual(PendingDrinks.glassMl(saved: nil, imperial: true), Units.roundedMl(fluidOunces: 8))
    }
}
