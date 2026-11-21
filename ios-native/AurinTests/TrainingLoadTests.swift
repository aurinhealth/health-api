import XCTest
@testable import Aurin

/// Training → Load and the plan card (redesign T): the server's load in words
/// only, the demo day decoding both dials, the plan's phases in a row.
@MainActor
final class TrainingLoadTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        super.tearDown()
    }

    func testLoadDecodesAndSpeaksInWordsOnly() throws {
        let json = """
        {"state":"ready","level":"above","label":"nad obvyklou","text":"The last 7 days were harder than your usual 4 weeks.",
         "band":{"low":0.9,"high":1.15},"historyDays":60,"needsDays":21,
         "series":[{"date":"2026-11-16","level":"usual","plot":1.1},{"date":"2026-11-17","level":"above","plot":1.31}]}
        """
        let view = try JSONDecoder().decode(TrainingSnapshot.LoadView.self, from: Data(json.utf8))
        XCTAssertEqual(view.plot, 1.31)
        XCTAssertEqual(LoadWords.state(view.level), .off(above: true))
        L10n.setLanguage("en")
        XCTAssertEqual(LoadWords.level(view.level), "Harder")
        XCTAssertEqual(LoadWords.sentence(.off(above: true)), "Above your usual range")
        // No ratio as text anywhere in what the tile and the detail say.
        for level in ["wellBelow", "below", "usual", "above", "wellAbove"] {
            let words = (LoadWords.level(level) ?? "") + (LoadWords.state(level).map(LoadWords.sentence) ?? "")
            XCTAssertNil(words.rangeOfCharacter(from: .decimalDigits), level)
        }
    }

    func testLearningHasNoDot() throws {
        let json = """
        {"state":"learning","level":null,"label":null,"text":null,"band":{"low":0.9,"high":1.15},"historyDays":9,"needsDays":21,
         "series":[{"date":"2026-11-17","level":null,"plot":null}]}
        """
        let view = try JSONDecoder().decode(TrainingSnapshot.LoadView.self, from: Data(json.utf8))
        XCTAssertNil(view.plot)
        L10n.setLanguage("en")
        XCTAssertEqual(LoadWords.learning(view), "Learning, 12 days to go")
    }

    func testDemoTrainingHasBothDials() {
        let training = DemoData.training
        XCTAssertEqual(training.loadBalance?.state, "ready")
        XCTAssertEqual(training.muscleLoad?.level, "below")
        XCTAssertEqual(training.loadBalance?.series.count, 30)
        // The plain loads of the detail: 7 days, the usual week, the trend's history, by intensity.
        XCTAssertNotNil(training.loadBalance?.load)
        XCTAssertNotNil(training.loadBalance?.usual)
        XCTAssertEqual(training.loadBalance?.history?.count, 98)
        XCTAssertEqual(training.loadBalance?.intensity?.map(\.key), ["low", "high", "anaerobic"])
        XCTAssertEqual(TrendMath.dailyRows((training.loadBalance?.history ?? []).map { ChartPoint(date: $0.date, value: $0.load) }).map(\.lag), [7, 14, 30, 91])
        // The three values on top: Load balance, Load 7 days, Average.
        XCTAssertEqual(LoadDetailContent.cells(.balance, try XCTUnwrap(DemoData.training.loadBalance)).count, 3)
    }

    func testFormStateAgainstTheUsualRange() {
        XCTAssertEqual(FormDetailContent.state(-2, -10...5), .within)
        XCTAssertEqual(FormDetailContent.state(8, -10...5), .off(above: true))
        XCTAssertEqual(FormDetailContent.state(-14, -10...5), .off(above: false))
        XCTAssertEqual(FormDetailContent.state(-35, -10...5), .far(above: false))
    }

    func testVO2maxTileUsesAurinsEstimate() {
        let h = HealthVO2max(value: 51.3, date: "2026-11-12", series: [Point(date: "2026-10-01", value: 50.1), Point(date: "2026-11-12", value: 51.3)])
        let tile = TrainingSnapshot.VO2max(aurin: h)
        XCTAssertEqual(tile.value, 51.3)
        XCTAssertEqual(tile.change, 1.2)
        XCTAssertEqual(tile.source, "aurin")
    }

    func testPlanCardFromRace() throws {
        let event = try XCTUnwrap(DemoData.training.event)
        let card = try XCTUnwrap(PlanCardData(event: event))
        XCTAssertEqual(card.phases.map(\.state), ["done", "now", "next"])
        XCTAssertEqual(card.daysLeft, 24)
    }
}
