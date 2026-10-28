import XCTest
@testable import Aurin

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
        // A Wi-Fi that wants a sign-in breaks the secure connection: the write waits too.
        XCTAssertTrue(Outbox.isNoConnection(URLError(.secureConnectionFailed)))
    }

    func testConnectionErrorsSayWhatToDo() {
        let tls = APIClient.readable(URLError(.secureConnectionFailed))
        XCTAssertEqual((tls as? URLError)?.code, .secureConnectionFailed)
        XCTAssertTrue(tls.localizedDescription.contains("Wi-Fi"))
        XCTAssertTrue(Outbox.isNoConnection(APIClient.readable(URLError(.notConnectedToInternet))))
        // What the app does not word stays as iOS says it.
        XCTAssertEqual((APIClient.readable(URLError(.badURL)) as? URLError)?.code, .badURL)
        XCTAssertEqual(APIClient.readable(APIError.unauthorized) as? APIError, .unauthorized)
    }

    /// A meal or drink just sent keeps its server id, so "Vrátit" deletes it there.
    func testSentEntryKeepsTheServerId() {
        XCTAssertEqual(Outbox.entryId(Data(#"{"status":"ok","id":42,"date":"2026-10-09"}"#.utf8)), 42)
        XCTAssertEqual(Outbox.entryId(Data(#"{"status":"ok","entry":{"id":9,"ml":250}}"#.utf8)), 9)
        XCTAssertNil(Outbox.entryId(Data(#"{"status":"ok","duplicate":true}"#.utf8)))
    }

    /// A sent meal (server id) and its delete both still waiting for Food's
    /// next answer: the meal shows, then goes again.
    func testSentMealAndItsDeleteCancelOut() throws {
        let overlays = [
            OutboxOverlay(kind: .food, date: "2026-10-09", id: 50, name: "Jogurt", meal: "lunch", kcal: 150, protein: 10, carbs: 12, fat: 5),
            OutboxOverlay(kind: .removeFood, date: "2026-10-09", id: 50, kcal: 150, protein: 10, carbs: 12, fat: 5)
        ]
        let patched = try JSONDecoder().decode(FoodSnapshot.self, from: OutboxPatch.food(Data(food.utf8), overlays))
        XCTAssertEqual(patched.kcal, 500)
        XCTAssertEqual(patched.meals[0].entries.map(\.id), [7])
    }

    func testAnotherAccountsWritesAreNotSent() {
        var item = OutboxItem(path: "/app/api/water", method: "POST", body: Data("{}".utf8), label: "Voda", owner: 7)
        XCTAssertTrue(Outbox.isOthers(item, account: 8))
        XCTAssertFalse(Outbox.isOthers(item, account: 7))
        XCTAssertFalse(Outbox.isOthers(item, account: nil))
        item.owner = nil
        XCTAssertFalse(Outbox.isOthers(item, account: 8))
    }

    func testAnotherAccountByEmailAndId() throws {
        let suite = "OutboxTests.account"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertFalse(AppModel.anotherAccount(id: 1, email: "a@example.com", defaults: defaults))
        defaults.set("a@example.com", forKey: AvatarStore.emailKey)
        defaults.set(1, forKey: AvatarStore.idKey)
        XCTAssertFalse(AppModel.anotherAccount(id: 1, email: "a@example.com", defaults: defaults))
        // The e-mail changed in Settings → Účet: the same account.
        XCTAssertFalse(AppModel.anotherAccount(id: 1, email: "new@example.com", defaults: defaults))
        XCTAssertTrue(AppModel.anotherAccount(id: 2, email: "b@example.com", defaults: defaults))
    }

    /// One write this build cannot read (a newer build wrote it) neither takes
    /// the others with it nor is overwritten: it waits aside for that build.
    @MainActor func testUnreadableWriteWaitsAside() throws {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let main = folder.appending(path: "outbox.json"), aside = folder.appending(path: "outbox-unread.json")
        let kept = (try? Data(contentsOf: main), try? Data(contentsOf: aside))
        defer {
            OutboxStore.clear()
            if let data = kept.0 { try? data.write(to: main) }
            if let data = kept.1 { try? data.write(to: aside) }
        }
        OutboxStore.clear()
        let drink = AppModel.drinkItem(ml: 250, kind: "water", date: "2026-10-28")
        var list = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode([drink])) as? [Any])
        var newer = try XCTUnwrap(list[0] as? [String: Any])
        newer["id"] = UUID().uuidString
        newer["overlay"] = ["kind": "somethingNew", "date": "2026-10-28"]
        list.append(newer)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: list).write(to: main)

        XCTAssertEqual(OutboxStore.load().map(\.id), [drink.id])
        OutboxStore.save([])
        XCTAssertTrue(OutboxStore.load().isEmpty)
        let waiting = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: aside)) as? [[String: Any]])
        XCTAssertEqual(waiting.count, 1)
        XCTAssertEqual((waiting[0]["overlay"] as? [String: Any])?["kind"] as? String, "somethingNew")
        // Signing out takes it too.
        OutboxStore.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath: aside.path))
    }

    /// An answer asked for before a sign-out is not saved after it.
    func testSnapshotFromBeforeSignOutIsNotSaved() {
        let key = "test-generation"
        let before = SnapshotCache.generation
        SnapshotCache.clear()
        SnapshotCache.save(Data("{}".utf8), key: key, generation: before)
        XCTAssertNil(SnapshotCache.savedAt(key: key))
        SnapshotCache.save(Data("{}".utf8), key: key, generation: SnapshotCache.generation)
        XCTAssertNotNil(SnapshotCache.savedAt(key: key))
        SnapshotCache.remove(key: key)
    }
}
