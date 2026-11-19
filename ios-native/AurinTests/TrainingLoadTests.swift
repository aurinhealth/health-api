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
        XCTAssertEqual(training.loadBalance?.series.count, 14)
    }

    func testPlanCardFromRace() throws {
        let event = try XCTUnwrap(DemoData.training.event)
        let card = try XCTUnwrap(PlanCardData(event: event))
        XCTAssertEqual(card.phases.map(\.state), ["done", "now", "next"])
        XCTAssertEqual(card.daysLeft, 24)
    }
}
