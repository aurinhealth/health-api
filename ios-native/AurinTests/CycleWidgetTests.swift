import XCTest
@testable import Aurin

/// Cyklus as a widget: off until added, first among Today's suggestions.
final class CycleWidgetTests: XCTestCase {
    func testGallery() {
        XCTAssertEqual(WidgetKind.cycle.sizes, [.small, .medium])
        XCTAssertEqual(WidgetKind.cycle.defaultSize, .medium)
        XCTAssertEqual(WidgetKind.cycle.section, .health)
        for panel in [WidgetPanel.today, .health, .training, .food] {
            XCTAssertFalse(panel.defaults.contains { $0.kind == .cycle })
        }
        XCTAssertEqual(WidgetPanel.today.recommended.first, .cycle)
    }

    func testLoggedDay() throws {
        let bleeding = try decode(#"{"ask":false,"hormonal":true,"flow":2,"symptoms":[],"eased":false}"#)
        XCTAssertTrue(CycleWidget.logged(bleeding))
        let quiet = try decode(#"{"ask":true,"hormonal":false,"cycleDay":28,"phase":"luteal","flow":0,"symptoms":[],"eased":false}"#)
        XCTAssertFalse(CycleWidget.logged(quiet))
        let menopause = try decode(#"{"ask":false,"hormonal":false,"lifeStage":"menopause","flow":0,"symptoms":["hot_flashes"],"eased":false}"#)
        XCTAssertTrue(CycleWidget.logged(menopause))
    }

    /// The pack's strip fills only the pills that were logged: yesterday's
    /// unlogged pill stays empty (a tester saw it marked as taken).
    func testPillStripShowsOnlyLoggedPills() throws {
        let json = #"{"pack":"21+7","number":7,"of":21,"pause":false,"taken":null,"packTaken":[true,true,true,true,true,false,false]}"#
        let pill = try JSONDecoder().decode(PillDay.self, from: Data(json.utf8))
        XCTAssertEqual((1...7).map(pill.isTaken), [true, true, true, true, true, false, false])
        XCTAssertFalse(pill.isTaken(8))
        var today = pill
        today.taken = "08:10"
        XCTAssertTrue(today.isTaken(7))
        XCTAssertFalse(today.isTaken(6))
        // An older server without packTaken keeps the old strip.
        let older = try JSONDecoder().decode(PillDay.self, from: Data(#"{"pack":"21+7","number":3,"of":21,"pause":false}"#.utf8))
        XCTAssertEqual((1...4).map(older.isTaken), [true, true, false, false])
    }

    private func decode(_ json: String) throws -> TodayCycle {
        try JSONDecoder().decode(TodayCycle.self, from: Data(json.utf8))
    }
}
