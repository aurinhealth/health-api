import XCTest
@testable import Aurin

/// The coach's thinking steps (CoachSteps): each id once in its first place,
/// and the check only when it really ran.
final class CoachStepsTests: XCTestCase {
    private func step(_ id: String, _ status: String = "done") -> CoachStep {
        CoachStep(id: id, icon: nil, title: id, text: nil, status: status, view: nil)
    }

    func testAStepKeepsItsPlaceWithItsNewState() {
        var steps = CoachStep.merged([], step("sleep"))
        steps = CoachStep.merged(steps, step("writing", "running"))
        steps = CoachStep.merged(steps, step("writing"))
        XCTAssertEqual(steps.map(\.id), ["sleep", "writing"])
        XCTAssertFalse(steps[1].running)
    }

    func testTheCheckShowsOnlyWhenItRan() {
        let all = [step("hrv"), step("writing"), step("check"), step("refine")]
        XCTAssertEqual(CoachStep.shown(all, check: "passed").map(\.id), ["hrv", "writing", "check"])
        XCTAssertEqual(CoachStep.shown(all, check: "rewritten").map(\.id), ["hrv", "writing", "check", "refine"])
        XCTAssertEqual(CoachStep.shown(all, check: "fallback").map(\.id), ["hrv", "writing"])
        XCTAssertEqual(CoachStep.shown(all, check: nil).map(\.id), ["hrv", "writing"])
    }

    func testTheStreamDecodesAStep() throws {
        let json = #"{"id":"hrv","icon":"waveform.path.ecg","title":"Comparing your HRV with your usual range","text":"This morning your HRV was 58 ms.","status":"done","view":"hrv"}"#
        let decoded = try JSONDecoder().decode(CoachStep.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.view, "hrv")
        XCTAssertFalse(decoded.running)
    }
}
