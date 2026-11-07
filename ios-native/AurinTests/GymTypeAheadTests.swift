import XCTest
@testable import Aurin

/// Režim tréninku: a set to come typed in ahead keeps its own weight, and the
/// drop sets follow the weight the set before them was done with.
final class GymTypeAheadTests: XCTestCase {
    private func set(_ row: Int, kg plan: String?, reps: String = "8-12", done: (kg: String, reps: String)? = nil) -> GymSet {
        GymSet(row: row, warmup: false, number: String(row), plannedKg: plan, plannedReps: reps, kg: done?.kg, reps: done?.reps,
               rpe: nil, done: done != nil, note: nil, intensity: "M")
    }

    private func exercise(_ sets: [GymSet]) -> GymExercise {
        GymExercise(name: "Rear delt pec deck", superset: nil, sets: sets)
    }

    func testTheSameMachineWeightIsCarried() {
        let done = set(1, kg: "35", done: ("31.75", "12"))
        let next = set(2, kg: "35")
        let carry = GymSessionMath.carried(next, in: exercise([done, next]))
        XCTAssertEqual(carry?.kg, "31.75")
        XCTAssertEqual(carry?.reps, "12")
    }

    func testAWeightTypedAheadIsKept() {
        let done = set(1, kg: "35", done: ("31.75", "12"))
        let next = set(2, kg: "30")
        let carry = GymSessionMath.carried(next, in: exercise([done, next]))
        XCTAssertNil(carry?.kg)
        // The reps the plan left alone still follow the set before.
        XCTAssertEqual(carry?.reps, "12")
    }

    func testTypedBackToThePlanIsKeptToo() {
        // Set 1 went lighter; 35 typed for set 2 is the plan again, not a copy of set 1.
        let done = set(1, kg: "35", done: ("31.75", "12"))
        let next = set(2, kg: "35")
        let carry = GymSessionMath.carried(next, in: exercise([done, next]), typed: GymSessionMath.Typed(kg: [2]))
        XCTAssertNil(carry?.kg)
        XCTAssertEqual(carry?.reps, "12")
        let both = GymSessionMath.carried(next, in: exercise([done, next]), typed: GymSessionMath.Typed(kg: [2], reps: [2]))
        XCTAssertNil(both)
    }

    func testTypedRowsMoveWithTheSheet() {
        var typed = GymSessionMath.Typed(kg: [8, 10], reps: [10])
        typed.move { $0 == 8 ? nil : $0 - 1 }
        XCTAssertEqual(typed, GymSessionMath.Typed(kg: [9], reps: [9]))
    }

    /// A work set of 35 kg with two drop sets (28 and 22.5 kg, a fifth less each).
    private func day() -> (day: GymDay, work: Int, drops: [Int]) {
        var day = GymDay(date: "2026-11-07", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-11-07")
        day.appendExercise("Rear delt pec deck", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 35, reps: 12)], line: ""))
        let work = day.exercises[0].sets[0].row
        let first = day.addDrop(after: work)!
        let second = day.addDrop(after: work)!
        return (day, work, [first, second])
    }

    private func planned(_ day: GymDay, _ row: Int) -> String? {
        day.exercises[0].sets.first { $0.row == row }?.plannedKg
    }

    func testDropsFollowTheWeightDone() {
        let (start, work, drops) = day()
        var sheet = start
        XCTAssertEqual(drops.map { planned(sheet, $0) }, ["28", "22.5"])
        // 70 lb on the machine instead of 35 kg: the drops a tenth lighter too.
        sheet.complete(row: work, kg: "31.75", reps: "12", rpe: "")
        XCTAssertEqual(drops.map { planned(sheet, $0) }, ["25.5", "20.5"])
        // Ticked by mistake: back to the plan.
        sheet.undo(row: work)
        XCTAssertEqual(drops.map { planned(sheet, $0) }, ["28", "22.5"])
    }

    func testADropTypedAheadStays() {
        let (start, work, drops) = day()
        var sheet = start
        sheet.set(row: drops[0], column: 3, "25")
        sheet.complete(row: work, kg: "31.75", reps: "12", rpe: "", keepDrops: [drops[0]])
        XCTAssertEqual(drops.map { planned(sheet, $0) }, ["25", "20.5"])
    }

    func testOnThePlanNothingMoves() {
        let (start, work, drops) = day()
        var sheet = start
        sheet.complete(row: work, kg: "35", reps: "12", rpe: "")
        XCTAssertEqual(drops.map { planned(sheet, $0) }, ["28", "22.5"])
    }

    func testTheWatchDropsFollowToo() {
        let (sheet, work, drops) = day()
        var gym = WatchGym(sheet, date: "2026-11-07", restSets: 90, restExercises: 120)
        XCTAssertEqual(gym.lift(row: work)?.plannedKg, 35)
        gym.followDrops(after: work, from: 35, to: 31.75)
        XCTAssertEqual(drops.map { gym.lift(row: $0)?.kg }, [25.5, 20.5])
    }
}
