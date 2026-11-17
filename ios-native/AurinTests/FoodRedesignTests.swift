import XCTest
@testable import Aurin

/// Food in the redesign (part J): red from the first kcal over the target and
/// for every goal, the calm "14 over 287 g" on the macros, the top's label.
@MainActor
final class FoodRedesignTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        super.tearDown()
    }

    /// One function decides "over": at the target nothing, one kcal more is over.
    func testOverFromTheFirstKcal() {
        XCTAssertEqual(FoodHero.over(eaten: 2650, target: 2650), 0)
        XCTAssertEqual(FoodHero.over(eaten: 2651, target: 2650), 1)
        XCTAssertEqual(FoodHero.over(eaten: 2420, target: 2300), 120)
        XCTAssertEqual(FoodHero.over(eaten: 1380, target: 2650), 0)
        // Rounded as shown: 2,650.4 reads 2,650, not over.
        XCTAssertEqual(FoodHero.over(eaten: 2650.4, target: 2650), 0)
    }

    func testMacroCaptions() {
        L10n.setLanguage("en")
        XCTAssertEqual(MacroCells.caption(eaten: 177, target: 330, limit: false), "of 330 g")
        XCTAssertEqual(MacroCells.caption(eaten: 301, target: 287, limit: false), "14 over 287 g")
        XCTAssertEqual(MacroCells.caption(eaten: 20, target: 50, limit: true), "of max 50 g")
        XCTAssertEqual(MacroCells.caption(eaten: 20, target: nil, limit: false), "")
    }

    func testEatenLabel() {
        L10n.setLanguage("en")
        XCTAssertEqual(FoodHero.eatenLabel(date: "2026-11-17", today: "2026-11-17"), "Eaten today")
        XCTAssertTrue(FoodHero.eatenLabel(date: "2026-10-05", today: "2026-10-08").hasPrefix("Eaten on "))
    }
}
