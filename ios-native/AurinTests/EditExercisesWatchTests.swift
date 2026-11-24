import XCTest
@testable import Aurin

/// Edit exercises while the watch ticks sets (review 2026-11-24 point 2): the
/// edited day keeps what was done meanwhile.
final class EditExercisesWatchTests: XCTestCase {
    private func row(_ name: String, _ number: String) -> [JSONValue] {
        ["WORK", name, number, "100", "8", "", "", "", "FALSE", "", "", "FALSE", "", ""].map { JSONValue.string($0) }
    }

    private func day(_ rows: [[JSONValue]]) -> GymDay {
        GymDay(date: "2026-11-24", values: Array(repeating: [], count: GymDay.firstSetRow) + rows, cancelled: nil)
    }

    func testSetTickedOnTheWatchStaysTickedAfterTheOrderChanged() {
        let original = day([row("Squat", "1"), row("Squat", "2"), row("Row", "1")])
        // The sheet moves Row before Squat.
        var edited = original
        edited.moveExercise(from: 1, to: 0)
        XCTAssertEqual(edited.exercises.map(\.name), ["Row", "Squat"])
        // Meanwhile the watch ticked Squat's first set.
        var current = original
        current.complete(row: GymDay.firstSetRow, kg: "102.5", reps: "7", rpe: "")

        let merged = edited.carryingProgress(from: current, since: original)
        XCTAssertEqual(merged.exercises.map(\.name), ["Row", "Squat"])
        let squat = merged.exercises[1].sets
        XCTAssertTrue(squat[0].done)
        XCTAssertEqual(squat[0].kg, "102.5")
        XCTAssertEqual(squat[0].reps, "7")
        XCTAssertFalse(squat[1].done)
        XCTAssertFalse(merged.exercises[0].sets[0].done)
    }

    func testNothingTickedMeanwhileLeavesTheEditAsItIs() {
        let original = day([row("Squat", "1"), row("Row", "1")])
        var edited = original
        edited.moveExercise(from: 1, to: 0)
        XCTAssertEqual(edited.carryingProgress(from: original, since: original).values, edited.values)
    }
}
