import XCTest
@testable import Aurin

/// Cíle in Nastavení are today's whichever day Today shows: with yesterday
/// chosen the calories and drinks changed with it (Tapwright 611, bod 10).
@MainActor
final class SettingsTodayTests: XCTestCase {
    private let api = APIClient(baseURL: URL(string: "https://stub.test")!, protocols: [ScriptedServer.self])

    private func day(_ date: String, kcal: Int, water: Int) -> Data {
        Data("""
        {"status":"ok","date":"\(date)","readiness":{"score":null,"zone":null,"missing":[],"flags":[]},"sleep":null,
         "strain":{"score":null,"planned":null},"hrv":null,"restingHR":null,"summary":null,
         "nutrition":{"kcal":null,"target":\(kcal),"trainingBonus":null,"protein":{"eaten":null,"target":null},"carbs":{"eaten":null,"target":null},
         "fat":{"eaten":null,"target":null},"water":{"ml":null,"target":\(water)}},"plan":[],"tonight":null,
         "steps":{"today":null,"goal":10000,"week":[],"hourly":null,"usual":null,"hour":12},"weight":null}
        """.utf8)
    }

    private func show(_ model: AppModel, _ data: Data) throws {
        model.todayScreen.show(try JSONDecoder().decode(TodaySnapshot.self, from: data), data: data)
    }

    override func tearDown() {
        SnapshotCache.clear()
        super.tearDown()
    }

    func testTodayChosenUsesTheScreen() throws {
        let model = AppModel(api: api, demo: false)
        let today = AppModel.localDate(Date())
        try show(model, day(today, kcal: 2450, water: 2100))
        XCTAssertEqual(model.settingsToday?.nutrition.target, 2450)
    }

    func testOtherDayChosenKeepsTodaysGoals() throws {
        let model = AppModel(api: api, demo: false)
        let today = AppModel.localDate(Date())
        let yesterday = try XCTUnwrap(AppModel.shift(today, by: -1))
        SnapshotCache.save(day(today, kcal: 2450, water: 2100), key: "today")
        model.selectedDate = yesterday
        try show(model, day(yesterday, kcal: 2729, water: 2800))
        XCTAssertEqual(model.today?.nutrition.target, 2729)
        XCTAssertEqual(model.settingsToday?.date, today)
        XCTAssertEqual(model.settingsToday?.nutrition.target, 2450)
        XCTAssertEqual(model.settingsToday?.nutrition.water.target, 2100)
    }

    func testOtherDayChosenWithoutTodaysCopyShowsNothing() throws {
        let model = AppModel(api: api, demo: false)
        let today = AppModel.localDate(Date())
        let yesterday = try XCTUnwrap(AppModel.shift(today, by: -1))
        SnapshotCache.clear()
        model.selectedDate = yesterday
        try show(model, day(yesterday, kcal: 2729, water: 2800))
        XCTAssertNil(model.settingsToday, "never the chosen day's goals")
    }
}
