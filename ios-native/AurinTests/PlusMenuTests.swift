import XCTest
@testable import Aurin

/// "+" (redesign N): the nine spots, saved or the concept's default card.
final class PlusMenuTests: XCTestCase {
    func testNothingSavedGivesPetrsDefaultCard() {
        let card = PlusItem.card(stored: "")
        XCTAssertEqual(PlusItem.withCoach(card), ["photo", "search", "barcode", "start", "coach", "log", "water", "journal", "weight"])
    }

    func testOldPlusDoesNotCarryOver() {
        // The pre-redesign "+" (plusMenu.items) is ignored: everyone starts from the concept's card.
        UserDefaults.standard.set("start,log,pick,library,photo,search,drink", forKey: "plusMenu.items")
        defer { UserDefaults.standard.removeObject(forKey: "plusMenu.items") }
        XCTAssertEqual(PlusItem.card(stored: ""), PlusItem.defaults)
    }

    /// Every action removed and saved: the card stays empty, the defaults don't come back.
    func testEmptySavedCardStaysEmpty() {
        XCTAssertEqual(PlusItem.card(stored: "-"), [])
        XCTAssertEqual(PlusItem.withCoach([]), ["coach"])
    }

    func testSavedCardIsKeptAndCleaned() {
        XCTAssertEqual(PlusItem.card(stored: "water,period,coach,nothing,water"), ["water", "period"])
    }

    func testEveryActionHasAnIconAndOnlyDrinksPour() {
        XCTAssertEqual(PlusItem.all.count, 26)
        XCTAssertEqual(Set(PlusItem.all.map(\.id)).count, 26)
        for item in PlusItem.all where item.asset != nil {
            XCTAssertNotNil(UIImage(named: item.asset!, in: Bundle(for: AppModel.self), compatibleWith: nil), item.id)
        }
        XCTAssertTrue(PlusItem.find("water")!.pours)
        XCTAssertFalse(PlusItem.find("other")!.pours)
        XCTAssertFalse(PlusItem.find("journal")!.pours)
    }

    func testWorkoutLength() {
        XCTAssertEqual(ManualWorkoutSheet.length(55), "55\u{00A0}min")
        XCTAssertEqual(ManualWorkoutSheet.length(90), "1\u{00A0}h\u{00A0}30\u{00A0}min")
        XCTAssertEqual(ManualWorkoutSheet.length(240), "4\u{00A0}h")
    }
}
