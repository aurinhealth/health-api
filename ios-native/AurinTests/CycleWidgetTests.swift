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

    private func decode(_ json: String) throws -> TodayCycle {
        try JSONDecoder().decode(TodayCycle.self, from: Data(json.utf8))
    }
}
