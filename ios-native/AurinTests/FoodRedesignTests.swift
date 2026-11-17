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

    /// The Calories detail's days against their target: over from the first
    /// kcal, well below under 92 %, a day without a log or a target left out.
    func testDaysAgainstTarget() throws {
        let json = """
        {"status":"ok","today":"2026-11-17","days":30,"from":"2026-11-13","to":"2026-11-17","daysLogged":4,
         "average":{"kcal":2300,"protein":120,"carbs":250,"fat":70},"targetsFrom":"2026-11-13",
         "list":[{"date":"2026-11-13","kcal":2501,"protein":null,"carbs":null,"fat":null,"target":2500,"logged":true,"over":true},
                 {"date":"2026-11-14","kcal":2500,"target":2500,"logged":true,"over":false},
                 {"date":"2026-11-15","kcal":2299,"target":2500,"logged":true,"over":false},
                 {"date":"2026-11-16","kcal":null,"target":2500,"logged":false,"over":null},
                 {"date":"2026-11-17","kcal":1800,"target":null,"logged":true,"over":null}]}
        """
        let history = try JSONDecoder().decode(FoodHistory.self, from: Data(json.utf8))
        XCTAssertEqual(history.list.count, 5)
        let count = TargetDays.count(history.list)
        XCTAssertEqual(count, TargetDays.Count(over: 1, at: 1, below: 1))
        // Nothing logged yet: no days, no crash.
        XCTAssertEqual(TargetDays.count([]).total, 0)
    }

    /// The sample month has gaps; the periods map to the server's days.
    func testDemoMonthHasGapsAndPeriods() {
        let month = FoodHistory.demo(today: "2026-10-08", target: 2650)
        XCTAssertEqual(month.list.count, 30)
        XCTAssertEqual(month.list.last?.date, "2026-10-08")
        XCTAssertTrue(month.list.contains { !$0.logged })
        XCTAssertEqual(FoodHistory.days(for: .months3), 90)
        XCTAssertEqual(FoodHistory.days(for: .year), 365)
    }
}
