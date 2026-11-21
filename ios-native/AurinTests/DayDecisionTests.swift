import XCTest
@testable import Aurin

/// One decision of the day (src/day-decision.js): the app reads the server's
/// `day`, the plan's `lighter` line and Training's load advice as sent.
final class DayDecisionTests: XCTestCase {
    func testDecodesTheDayAndFindsALighterSession() throws {
        let json = """
        {"date":"2026-10-08","key":"steady","recovering":true,"hardFrom":"2026-10-10","done":false,"legsTired":true,
         "sessions":[{"date":"2026-10-08","title":"Easy spin","sport":"ride","fits":true}],
         "tomorrow":[{"date":"2026-10-09","title":"Legs","sport":"strength","fits":false,"muscles":["hamstrings"],"readyDate":"2026-10-10","lighter":"Hamstrings still recovering, lighter version?"}]}
        """
        let day = try JSONDecoder().decode(DayDecision.self, from: Data(json.utf8))
        XCTAssertEqual(day.key, "steady")
        XCTAssertEqual(day.hardFrom, "2026-10-10")
        XCTAssertEqual(day.lighter(title: "Legs", date: "2026-10-09"), "Hamstrings still recovering, lighter version?")
        XCTAssertNil(day.lighter(title: "Easy spin", date: "2026-10-08"))
        // Without a readiness number the key is null.
        XCTAssertNil(try JSONDecoder().decode(DayDecision.self, from: Data(#"{"date":"2026-10-08","key":null,"sessions":[]}"#.utf8)).key)
    }

    func testDecodesTheLoadAdvice() throws {
        let json = #"{"level":"wellBelow","text":"Your load is far below your usual. One easy ride on Sun brings it back.","action":{"kind":"add_easy","sport":"ride","date":"2026-11-22","minutes":60}}"#
        let advice = try JSONDecoder().decode(TrainingSnapshot.LoadAdvice.self, from: Data(json.utf8))
        XCTAssertEqual(advice.action?.date, "2026-11-22")
        XCTAssertNil(try JSONDecoder().decode(TrainingSnapshot.LoadAdvice.self, from: Data(#"{"level":"usual","text":"x"}"#.utf8)).action)
    }
}
