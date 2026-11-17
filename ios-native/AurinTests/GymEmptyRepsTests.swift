import XCTest
@testable import Aurin

/// Training mode: a set done with the reps field left empty keeps the plan's
/// lower number, the range stays only as the grey hint (redesign T, PM-souhrn 10).
@MainActor
final class GymEmptyRepsTests: XCTestCase {
    func testEmptyRepsTakeTheLowestNumber() {
        XCTAssertEqual(TrainingModeView.savedReps(typed: "", planned: "8–10", drop: false), "8")
        XCTAssertEqual(TrainingModeView.savedReps(typed: "  ", planned: "5-8", drop: false), "5")
        XCTAssertEqual(TrainingModeView.savedReps(typed: "", planned: "12", drop: false), "12")
    }

    func testTypedRepsWin() {
        XCTAssertEqual(TrainingModeView.savedReps(typed: "11", planned: "8–10", drop: false), "11")
    }

    func testDropSetWithoutRepsKeepsNone() {
        XCTAssertEqual(TrainingModeView.savedReps(typed: "", planned: "8–10", drop: true), "")
    }

    func testNoPlanKeepsNothing() {
        XCTAssertEqual(TrainingModeView.savedReps(typed: "", planned: nil, drop: false), "")
    }
}
