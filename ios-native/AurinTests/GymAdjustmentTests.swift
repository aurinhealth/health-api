import XCTest
@testable import Aurin

/// Režim tréninku: how the set just done moves the weight of the sets to come.
final class GymAdjustmentTests: XCTestCase {
    private func set(_ row: Int, _ number: String, kg: String?, reps: String?, done: Bool, letter: String?,
                     planned: String = "12", side: String? = nil) -> GymSet {
        GymSet(row: row, warmup: false, number: number, plannedKg: "12.5", plannedReps: planned, kg: kg, reps: reps,
               rpe: nil, done: done, note: nil, side: side, intensity: letter)
    }

    private func exercise(_ sets: [GymSet]) -> GymExercise {
        GymExercise(name: "DB curl", superset: nil, sets: sets)
    }

    func testFailureShortOfTheRepsGoesLighter() {
        let done = set(2, "2", kg: "12.5", reps: "7", done: true, letter: "F")
        let next = set(3, "3", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done), GymSessionMath.Adjustment(kg: "10", lighter: true))
        let carry = GymSessionMath.carried(next, in: exercise([done, next]))
        XCTAssertEqual(carry?.kg, "10")
        XCTAssertNil(carry?.reps)
    }

    func testKeptWeightIsCopied() {
        let done = set(2, "2", kg: "12.5", reps: "7", done: true, letter: "F")
        let next = set(3, "3", kg: nil, reps: nil, done: false, letter: "M")
        let carry = GymSessionMath.carried(next, in: exercise([done, next]), keep: [2])
        XCTAssertEqual(carry?.kg, "12.5")
        XCTAssertEqual(carry?.reps, "7")
    }

    func testOnPlanCopies() {
        let done = set(1, "1", kg: "12.5", reps: "12", done: true, letter: "M")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
    }

    func testOneRepShortOnABarbellTakesOneStep() {
        let done = GymSet(row: 1, warmup: false, number: "1", plannedKg: "80", plannedReps: "8", kg: "80", reps: "7",
                          rpe: nil, done: true, note: nil, intensity: "M")
        let next = GymSet(row: 2, warmup: false, number: "2", plannedKg: "80", plannedReps: "8", kg: nil, reps: nil,
                          rpe: nil, done: false, note: nil, intensity: "M")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done)?.kg, "77.5")
    }

    func testEasyAndOverTheRepsGoesHeavier() {
        let done = set(1, "1", kg: "12.5", reps: "15", done: true, letter: "E")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done), GymSessionMath.Adjustment(kg: "15", lighter: false))
    }

    func testHardButAllRepsStays() {
        let done = set(1, "1", kg: "12.5", reps: "12", done: true, letter: "H")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
    }

    func testRangeUsesItsBounds() {
        let done = set(1, "1", kg: "12.5", reps: "9", done: true, letter: "M", planned: "8–12")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M", planned: "8–12")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
        XCTAssertEqual(GymSessionMath.repRange("8–12")?.lo, 8)
        XCTAssertEqual(GymSessionMath.repRange("8–12")?.hi, 12)
    }

    func testEachSideFollowsItsOwnSet() {
        let left = set(3, "2", kg: "12.5", reps: "7", done: true, letter: "F", side: "L")
        let right = set(4, "2", kg: "12.5", reps: "12", done: true, letter: "M", side: "P")
        let nextLeft = set(5, "3", kg: nil, reps: nil, done: false, letter: "M", side: "L")
        let nextRight = set(6, "3", kg: nil, reps: nil, done: false, letter: "M", side: "P")
        let all = exercise([left, right, nextLeft, nextRight])
        XCTAssertEqual(GymSessionMath.carried(nextLeft, in: all)?.kg, "10")
        XCTAssertEqual(GymSessionMath.carried(nextRight, in: all)?.kg, "12.5")
    }

    func testBodyweightIsLeftAlone() {
        let done = set(1, "1", kg: "0", reps: "5", done: true, letter: "F")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
    }
}
