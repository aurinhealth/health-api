import XCTest
@testable import Aurin

/// An AI lookup from "Co přidáme?" goes on after the sheet closes: the food
/// waits in Jídlo until added or thrown away, also after a restart, until
/// the day ends (AppModel+PendingFood.swift).
@MainActor
final class PendingFoodTests: XCTestCase {
    override func tearDown() {
        SnapshotCache.clear()
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
    }

    func testFoundFoodWaitsAfterTheSheetCloses() async throws {
        L10n.setLanguage("en")
        let model = AppModel(demo: true)
        model.tab = .today
        let id = model.startPendingFood(meal: "snack", query: "rohlík") {
            try await Task.sleep(for: .milliseconds(50))
            return .product(FoodProduct(name: "Rohlík", calories_100g: 265), note: nil)
        }
        XCTAssertEqual(model.pendingFoods.first?.state, .looking)
        model.unwatchPendingFoods([id])
        try await waitUntilDone(model)

        let item = try XCTUnwrap(model.pendingFoods.first)
        XCTAssertEqual(item.state, .found)
        XCTAssertEqual(item.title, "Rohlík")
        XCTAssertEqual(item.meal, "snack")
        XCTAssertEqual(model.foodReady?.text, "“Rohlík” found · waiting in Food")
        // Kept for the next start of the app, the same day only.
        XCTAssertEqual(PendingFood.saved().map(\.id), [id])
        XCTAssertTrue(PendingFood.saved(now: Date().addingTimeInterval(86_400 * 2)).isEmpty)

        model.removePendingFood(id)
        XCTAssertTrue(model.pendingFoods.isEmpty)
        XCTAssertTrue(PendingFood.saved().isEmpty)
    }

    func testOpenSheetTakesTheAnswerWithoutANote() async throws {
        let model = AppModel(demo: true)
        model.startPendingFood(meal: "lunch", query: "xyz") { .missing("nic") }
        try await waitUntilDone(model)
        XCTAssertEqual(model.pendingFoods.first?.state, .missing)
        XCTAssertNil(model.foodReady)
    }

    func testUnfinishedLookupIsNotKept() {
        var looking = PendingFood(meal: "snack", day: "2026-11-08", query: "a")
        looking.watched = false
        var found = PendingFood(meal: "snack", day: "2026-11-08", query: "b")
        found.state = .found
        SnapshotCache.save(try! JSONEncoder().encode([looking, found]), key: PendingFood.cacheKey)
        let saved = PendingFood.saved()
        XCTAssertEqual(saved.map(\.query), ["b"])
        XCTAssertEqual(saved.first?.watched, false)
    }

    private func waitUntilDone(_ model: AppModel) async throws {
        for _ in 0..<100 where model.pendingFoods.contains(where: { $0.state == .looking }) {
            try await Task.sleep(for: .milliseconds(20))
        }
    }
}
