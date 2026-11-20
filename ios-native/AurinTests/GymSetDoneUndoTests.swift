import XCTest
@testable import Aurin

/// Live workout (redesign L): a set ticked and its undo, as the set screen does them.
final class GymSetDoneUndoTests: XCTestCase {
    private func row(_ type: String, _ name: String, _ number: String, _ kg: String) -> [JSONValue] {
        [type, name, number, kg, "8", "", "", "", "FALSE", "", "", "FALSE", "", ""].map { JSONValue.string($0) }
    }

    private func day(_ rows: [[JSONValue]]) -> GymDay {
        var head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow - 1)
        head.append(GymDay.columns.map { JSONValue.string($0) })
        return GymDay(date: "2026-11-19", values: head + rows, cancelled: nil)
    }

    func testSetDoneKeepsWhatWasDoneAndUndoOpensItAgain() {
        var d = day([row("WARMUP", "Squat", "1", "40"), row("WORK", "Squat", "1", "100"), row("WORK", "Squat", "2", "100")])
        let first = d.exercises[0].sets[1]
        d.complete(row: first.row, kg: "102.5", reps: "7", rpe: "", intensity: "M")
        var set = d.exercises[0].sets[1]
        XCTAssertTrue(set.done)
        XCTAssertEqual(set.kg, "102.5")
        XCTAssertEqual(set.reps, "7")
        XCTAssertEqual(set.intensity, "M")
        // Only that set: the warm-up and the next one stay to do.
        XCTAssertFalse(d.exercises[0].sets[0].done)
        XCTAssertFalse(d.exercises[0].sets[2].done)

        d.undo(row: first.row)
        set = d.exercises[0].sets[1]
        XCTAssertFalse(set.done)
        // The plan stays, so the row shows it again.
        XCTAssertEqual(set.plannedKg, "100")
        XCTAssertEqual(d.exercises[0].sets.filter(\.done).count, 0)
    }
}
