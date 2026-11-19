import XCTest
@testable import Aurin

/// "+" (redesign N): today's saved "+" carries over to the nine spots.
final class PlusMenuTests: XCTestCase {
    func testNothingSavedGivesPetrsDefaultCard() {
        let card = PlusItem.card(stored: "", legacy: nil, favorites: "water,coffee,tea")
        XCTAssertEqual(PlusItem.withCoach(card), ["photo", "search", "barcode", "start", "coach", "log", "water", "journal", "weight"])
    }

    func testOldPlusCarriesOverRenamedWithItsDrinks() {
        // Today's default "+" saved by its pencil: renamed ids, the drink group as the favourites, eight at most.
        let card = PlusItem.card(stored: "", legacy: "start,log,pick,library,photo,search,drink", favorites: "water,coffee,tea")
        XCTAssertEqual(card, ["start", "log", "aotd", "library", "photo", "search", "water", "coffee"])
        XCTAssertEqual(PlusItem.withCoach(card).count, 9)
        XCTAssertEqual(PlusItem.withCoach(card)[4], "coach")
    }

    func testOldCoachUnknownAndTwiceAreDropped() {
        let card = PlusItem.card(stored: "", legacy: "coach,scan,gymBuilder,nothing,scan,weight", favorites: "")
        XCTAssertEqual(card, ["barcode", "build", "weight"])
        // Fewer than four actions: the coach comes last.
        XCTAssertEqual(PlusItem.withCoach(card), ["barcode", "build", "weight", "coach"])
    }

    func testSavedCardWinsOverTheOldOne() {
        XCTAssertEqual(PlusItem.card(stored: "water,period", legacy: "start", favorites: ""), ["water", "period"])
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
        XCTAssertEqual(ManualWorkoutSheet.length(55), "55 min")
        XCTAssertEqual(ManualWorkoutSheet.length(90), "1 h 30")
        XCTAssertEqual(ManualWorkoutSheet.length(240), "4 h")
    }
}
