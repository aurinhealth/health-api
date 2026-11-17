import XCTest
@testable import Aurin

/// "Obě strany najednou | Každá strana zvlášť" shows how the sets still to do
/// go, not the sets already done by sides.
final class GymSidesPickerTests: XCTestCase {
    private func set(_ row: Int, _ number: Int, _ side: String?, done: Bool = false) -> GymSet {
        GymSet(row: row, warmup: false, number: String(number), plannedKg: "22.5", plannedReps: "6-10", kg: done ? "22.5" : nil, reps: done ? "10" : nil,
               rpe: nil, done: done, note: nil, side: side, intensity: "M")
    }

    func testBackToBothSidesAfterASetBySides() {
        // Set 1 done by sides, then switched back to both sides at once.
        let exercise = GymExercise(name: "Bulgarian split squat", superset: nil, sets: [
            set(1, 1, "L", done: true), set(2, 1, "P", done: true), set(3, 2, nil), set(4, 3, nil),
        ])
        XCTAssertTrue(exercise.bySides)
        XCTAssertFalse(exercise.sidesAhead)
    }

    func testTheSetsToComeBySides() {
        let exercise = GymExercise(name: "Bulgarian split squat", superset: nil, sets: [
            set(1, 1, nil, done: true), set(2, 2, "L"), set(3, 2, "P"),
        ])
        XCTAssertTrue(exercise.sidesAhead)
    }

    func testAllDoneShowsHowItWasDone() {
        let exercise = GymExercise(name: "Bulgarian split squat", superset: nil, sets: [
            set(1, 1, "L", done: true), set(2, 1, "P", done: true),
        ])
        XCTAssertTrue(exercise.sidesAhead)
    }
}
