import XCTest
@testable import Loadwise

/// Writes waiting for signal show on the Food and Today screens (OutboxPatch).
final class OutboxTests: XCTestCase {
    private let food = """
    {"date":"2026-10-09","kcal":500,"target":2500,"macros":{"carbs":{"eaten":50,"target":300},"protein":{"eaten":30,"target":150},"fat":{"eaten":10,"target":80}},
     "meals":[{"type":"lunch","label":"Oběd","time":"12:00","kcal":500,"entries":[{"id":7,"name":"Rýže","meal":"lunch","kcal":500,"protein":30,"carbs":50,"fat":10}]}],
     "water":{"ml":250,"target":2500,"entries":1,"drunkMl":250,"drinks":[{"id":3,"kind":"water","ml":250,"hydrationMl":250}]}}
    """

    func testMealsAndDrinksWaitingShowInFood() throws {
        let overlays = [
            OutboxOverlay(kind: .food, date: "2026-10-09", id: -5, name: "Jogurt", meal: "lunch", kcal: 150, protein: 10, carbs: 12, fat: 5),
            OutboxOverlay(kind: .drink, date: "2026-10-09", id: -6, ml: 300, drink: "coffee"),
            OutboxOverlay(kind: .removeDrink, date: "2026-10-09", id: 3, ml: 250, drink: "water"),
            // Another day's write stays out.
            OutboxOverlay(kind: .drink, date: "2026-10-08", id: -7, ml: 500, drink: "water")
        ]
        let patched = try JSONDecoder().decode(FoodSnapshot.self, from: OutboxPatch.food(Data(food.utf8), overlays))
        XCTAssertEqual(patched.kcal, 650)
        XCTAssertEqual(patched.macros.protein.eaten, 40)
        XCTAssertEqual(patched.meals[0].entries.map(\.id), [7, -5])
        XCTAssertEqual(patched.water.drunkMl, 300)
        XCTAssertEqual(patched.water.ml, 270)
        XCTAssertEqual(patched.water.drinks?.map(\.id), [-6])
    }

    func testRemovedMealLeavesTheTotals() throws {
        let overlays = [OutboxOverlay(kind: .removeFood, date: "2026-10-09", id: 7, kcal: 500, protein: 30, carbs: 50, fat: 10)]
        let patched = try JSONDecoder().decode(FoodSnapshot.self, from: OutboxPatch.food(Data(food.utf8), overlays))
        XCTAssertEqual(patched.kcal, 0)
        XCTAssertTrue(patched.meals[0].entries.isEmpty)
    }

    func testOnlyConnectionErrorsWait() {
        XCTAssertTrue(Outbox.isNoConnection(URLError(.notConnectedToInternet)))
        XCTAssertTrue(Outbox.isNoConnection(URLError(.timedOut)))
        XCTAssertFalse(Outbox.isNoConnection(URLError(.badServerResponse)))
        XCTAssertFalse(Outbox.isNoConnection(APIError.message("400")))
    }
}
