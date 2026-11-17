import XCTest
@testable import Aurin

/// A day's saved copy shows only under its own day (DayPage.saved): today's
/// copy ("food") is yesterday's after midnight, and Food showed every day's
/// numbers one day off (Petr, 2026-11-13).
final class DayPageSavedTests: XCTestCase {
    private func food(_ date: String) -> Data {
        Data("""
        {"status":"ok","date":"\(date)","kcal":1800,"target":null,"trainingBonus":null,"sentence":null,
         "macros":{"carbs":{"eaten":0,"target":null},"protein":{"eaten":0,"target":null},"fat":{"eaten":0,"target":null}},"meals":[],"water":{"ml":null,"target":null,"entries":0}}
        """.utf8)
    }

    override func tearDown() {
        SnapshotCache.remove(key: "food")
        super.tearDown()
    }

    func testTodaysCopyFromYesterdayIsNotToday() throws {
        let today = AppModel.localDate(Date())
        let yesterday = try XCTUnwrap(AppModel.shift(today, by: -1))
        SnapshotCache.save(food(yesterday), key: "food")
        XCTAssertNil(DayPage.saved(today).food)
        XCTAssertNil(DayPage.saved(today).foodData)
    }

    func testTodaysOwnCopyIsKept() {
        let today = AppModel.localDate(Date())
        SnapshotCache.save(food(today), key: "food")
        XCTAssertEqual(DayPage.saved(today).food?.date, today)
    }
}
