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
        // A forgotten day gone by is left out of what is left (audit 13.4).
        let forgotten = try JSONDecoder().decode(FoodWeek.self, from: Data(#"{"start":"2026-10-12","end":"2026-10-18","today":"2026-10-16","target":17500,"base":17500,"exercise":0,"eaten":7500,"left":7500,"perDay":3750,"unlogged":1}"#.utf8))
        XCTAssertEqual(forgotten.unlogged, 1)
        // Saturday after lunch: 1 150 more today of the 1 750 share.
        let lunch = try JSONDecoder().decode(FoodWeek.self, from: Data(#"{"today":"2026-10-17","target":14000,"base":14000,"exercise":0,"eaten":11100,"left":2900,"perDay":1750,"todayLeft":1150}"#.utf8))
        XCTAssertEqual(lunch.todayLeft, 1150)
    }

    /// A vitamin no meal has a value for shows "–", not 0, and is never "low" (audit 13.2).
    func testUnknownNutrientShowsADash() throws {
        let json = #"{"key":"vitd","name":"Vitamín D","unit":"µg","group":"vit","eaten":0,"target":15,"limit":false,"locked":false,"percent":0,"known":false,"count":0}"#
        let item = try JSONDecoder().decode(NutrientItem.self, from: Data(json.utf8))
        XCTAssertEqual(item.text, "– / 15 µg")
        XCTAssertFalse(item.low)
        let page = try JSONDecoder().decode(NutrientsPage.self, from: Data(#"{"days":7,"loggedDays":2,"pro":true,"meals":2,"withMicros":2,"items":[],"favorites":[]}"#.utf8))
        XCTAssertEqual(page.loggedDays, 2)
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
