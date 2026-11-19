import XCTest
@testable import Aurin

/// Past midnight the screens kept from yesterday go (AppModel.dropPastDay):
/// Today on Thursday afternoon showed Wednesday's walks and Training called
/// Wednesday "Strain today" until it loaded (Tapwright pass 2026-11-19).
@MainActor
final class PastDayDropTests: XCTestCase {
    private let api = APIClient(baseURL: URL(string: "https://stub.test")!, protocols: [ScriptedServer.self])

    private func food(_ date: String) -> Data {
        Data("""
        {"status":"ok","date":"\(date)","kcal":1800,"target":null,"trainingBonus":null,"sentence":null,
         "macros":{"carbs":{"eaten":0,"target":null},"protein":{"eaten":0,"target":null},"fat":{"eaten":0,"target":null}},"meals":[],"water":{"ml":null,"target":null,"entries":0}}
        """.utf8)
    }

    private func show(_ model: AppModel, food date: String) throws {
        let data = food(date)
        model.foodScreen.show(try JSONDecoder().decode(FoodSnapshot.self, from: data), data: data)
    }

    func testYesterdaysScreensGo() throws {
        let model = AppModel(api: api, demo: false)
        let yesterday = try XCTUnwrap(AppModel.shift(AppModel.localDate(Date()), by: -1))
        model.training = DemoData.training
        model.health = DemoData.health
        try show(model, food: yesterday)
        model.dropPastDay()
        XCTAssertNil(model.training)
        XCTAssertNil(model.health)
        XCTAssertNil(model.food)
    }

    func testTodaysScreensStay() throws {
        let model = AppModel(api: api, demo: false)
        let today = AppModel.localDate(Date())
        try show(model, food: today)
        model.dropPastDay()
        XCTAssertEqual(model.food?.date, today)
    }

    func testAnOlderDayPickedStays() throws {
        let model = AppModel(api: api, demo: false)
        let day = try XCTUnwrap(AppModel.shift(AppModel.localDate(Date()), by: -3))
        model.selectedDate = day
        try show(model, food: day)
        model.health = DemoData.health
        model.training = DemoData.training
        model.dropPastDay()
        XCTAssertEqual(model.food?.date, day)
        XCTAssertNotNil(model.health)
        // Training is always today's, whatever day the other tabs show.
        XCTAssertNil(model.training)
    }
}
