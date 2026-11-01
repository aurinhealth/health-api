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

    func testRatedHarderThanPlannedStaysDespiteTheReps() {
        // 15 kg × 15 of 10–12 rated M before an E set: the letter wins, no step up.
        let done = set(1, "1", kg: "15", reps: "15", done: true, letter: "M", planned: "10–12")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "E", planned: "10–12")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
        XCTAssertEqual(GymSessionMath.carried(next, in: exercise([done, next]))?.kg, "15")
    }

    func testUnratedOverTheRepsGoesHeavier() {
        let done = set(1, "1", kg: "15", reps: "15", done: true, letter: nil, planned: "10–12")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "E", planned: "10–12")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done)?.lighter, false)
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

    func testEasyAtThePlansRepsGoesHeavier() {
        // Petr 2026-11-01: a first try, 30 kg × 12 of 12 rated E before an M set.
        let done = set(1, "1", kg: "30", reps: "12", done: true, letter: "E")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done), GymSessionMath.Adjustment(kg: "32.5", lighter: false))
        XCTAssertEqual(GymSessionMath.carried(next, in: exercise([done, next]))?.kg, "32.5")
    }

    func testFirstTryWithoutAPlannedWeightGoesHeavier() {
        // An exercise new to the app: no planned weight, the test set planned E,
        // the sets after it M. The weight typed in set 1 is the start.
        let done = GymSet(row: 1, warmup: false, number: "1", plannedKg: nil, plannedReps: "12", kg: "15", reps: "12",
                          rpe: nil, done: true, note: nil, intensity: "E")
        let next = GymSet(row: 2, warmup: false, number: "2", plannedKg: nil, plannedReps: "12", kg: nil, reps: nil,
                          rpe: nil, done: false, note: nil, intensity: "M")
        let later = GymSet(row: 3, warmup: false, number: "3", plannedKg: nil, plannedReps: "12", kg: nil, reps: nil,
                           rpe: nil, done: false, note: nil, intensity: "M")
        let all = exercise([done, next, later])
        XCTAssertEqual(GymSessionMath.carried(next, in: all)?.kg, "17.5")
        // Set 2 done at the new weight as planned: set 3 copies it.
        let second = GymSet(row: 2, warmup: false, number: "2", plannedKg: nil, plannedReps: "12", kg: "17.5", reps: "12",
                            rpe: nil, done: true, note: nil, intensity: "M")
        XCTAssertEqual(GymSessionMath.carried(later, in: exercise([done, second, later]))?.kg, "17.5")
    }

    func testFarTooLightTakesMoreThanOneStep() {
        // 30 kg × 25 of 12 at E: up to the weight for 12, at most a quarter more.
        let done = set(1, "1", kg: "30", reps: "25", done: true, letter: "E")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "M")
        XCTAssertEqual(GymSessionMath.adjustment(next, after: done)?.kg, "37.5")
    }

    func testModerateBeforeTheLastHardSetStays() {
        // The plan's M sets and its last H set share the weight: M at all reps is on plan.
        let done = set(1, "1", kg: "30", reps: "12", done: true, letter: "M")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "H")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
    }

    func testEasyBeforeAnEasySetStays() {
        let done = set(1, "1", kg: "30", reps: "12", done: true, letter: "E")
        let next = set(2, "2", kg: nil, reps: nil, done: false, letter: "E")
        XCTAssertNil(GymSessionMath.adjustment(next, after: done))
    }
}
