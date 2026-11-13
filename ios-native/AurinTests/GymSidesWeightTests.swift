import XCTest
@testable import Aurin

/// Režim tréninku by sides: a weight changed on one side goes to the other
/// side; reps, letters and weights typed in by hand stay as they are.
final class GymSidesWeightTests: XCTestCase {
    private func set(_ row: Int, _ number: Int, _ side: String, kg plan: String = "10", done: Bool = false) -> GymSet {
        GymSet(row: row, warmup: false, number: String(number), plannedKg: plan, plannedReps: "10", kg: done ? "12" : nil, reps: done ? "10" : nil,
               rpe: nil, done: done, note: nil, side: side, intensity: "M")
    }

    private var exercise: GymExercise {
        GymExercise(name: "Single-arm dumbbell row", superset: nil, sets: [
            set(1, 1, "L"), set(2, 1, "P"), set(3, 2, "L"), set(4, 2, "P"), set(5, 3, "L"), set(6, 3, "P"),
        ])
    }

    func testTheOtherSideAndItsLaterSetsTakeTheWeight() {
        XCTAssertEqual(GymSessionMath.otherSide(of: exercise.sets[0], in: exercise), [2, 4, 6])
    }

    func testItWorksFromTheRightSideToo() {
        XCTAssertEqual(GymSessionMath.otherSide(of: exercise.sets[3], in: exercise), [3, 5])
    }

    func testATypedSetKeepsItsWeight() {
        XCTAssertEqual(GymSessionMath.otherSide(of: exercise.sets[0], in: exercise, typed: [4]), [2, 6])
        XCTAssertEqual(GymSessionMath.otherSide(of: exercise.sets[0], in: exercise, typed: [2]), [])
    }

    func testADoneOtherSideStaysAsDone() {
        var e = exercise
        e.sets[1] = set(2, 1, "P", done: true)
        XCTAssertEqual(GymSessionMath.otherSide(of: e.sets[0], in: e), [])
    }

    func testASetWithItsOwnPlanKeepsIt() {
        var e = exercise
        e.sets[5] = set(6, 3, "P", kg: "8")
        XCTAssertEqual(GymSessionMath.otherSide(of: e.sets[0], in: e), [2, 4])
    }

    func testNotWithoutSides() {
        let plain = GymSet(row: 1, warmup: false, number: "1", plannedKg: "10", plannedReps: "10", kg: nil, reps: nil, rpe: nil, done: false, note: nil)
        let e = GymExercise(name: "Curl", superset: nil, sets: [plain])
        XCTAssertEqual(GymSessionMath.otherSide(of: plain, in: e), [])
    }
}
