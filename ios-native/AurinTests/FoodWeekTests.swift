import XCTest
@testable import Aurin

/// Jídlo → Týdenní kalorie: the server's week, the dates and the gallery.
final class FoodWeekTests: XCTestCase {
    func testDecodesTheServerWeek() throws {
        let json = #"{"status":"ok","start":"2026-10-12","end":"2026-10-18","today":"2026-10-18","target":16800,"base":16300,"exercise":500,"eaten":18200,"byToday":16800,"left":0,"over":1400,"perDay":null,"days":[]}"#
        let week = try JSONDecoder().decode(FoodWeek.self, from: Data(json.utf8))
        XCTAssertEqual(week.over, 1400)
        XCTAssertNil(week.perDay)
        let empty = try JSONDecoder().decode(FoodWeek.self, from: Data(#"{"start":"2026-10-12","end":"2026-10-18","today":"2026-10-15","target":null,"base":null,"exercise":null,"eaten":0}"#.utf8))
        XCTAssertNil(empty.target)
    }

    func testRangeAndGallery() {
        if !L10n.isEnglish {
            XCTAssertEqual(FoodWeekWidget.range(DemoData.foodWeek), "5.–11. 10.")
            let across = FoodWeek(start: "2026-09-28", end: "2026-10-04", today: "2026-10-01", target: 1, base: 1, exercise: 0, eaten: 0)
            XCTAssertEqual(FoodWeekWidget.range(across), "28. 9.–4. 10.")
        }
        XCTAssertEqual(WidgetKind.weekCalories.sizes, [.medium])
        XCTAssertEqual(WidgetKind.weekCalories.section, .food)
        // Off until added: not on Jídlo by default, first among the suggestions.
        XCTAssertFalse(WidgetPanel.food.defaults.contains { $0.kind == .weekCalories })
        XCTAssertEqual(WidgetPanel.food.recommended.first, .weekCalories)
        let demo = DemoData.foodWeek
        XCTAssertEqual((demo.base ?? 0) + (demo.exercise ?? 0), demo.target)
        XCTAssertEqual((demo.target ?? 0) - demo.eaten, demo.left)
    }
}
