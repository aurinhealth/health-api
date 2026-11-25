import XCTest
@testable import Aurin

/// A superset always goes together, whatever was moved or added between (Petr 2026-11-20).
final class GymSupersetTogetherTests: XCTestCase {
    private func row(_ name: String, _ number: String, superset: String = "", done: Bool = false) -> [JSONValue] {
        ["WORK", name, number, "20", "10", "", "", "", done ? "TRUE" : "FALSE", "", "", "FALSE", superset, ""].map { JSONValue.string($0) }
    }

    private func day(_ rows: [[JSONValue]]) -> GymDay {
        var head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow - 1)
        head.append(GymDay.columns.map { JSONValue.string($0) })
        return GymDay(date: "2026-11-20", values: head + rows, cancelled: nil)
    }

    func testAnExerciseBetweenASupersetGoesAfterIt() {
        var d = day([row("Cable overhead triceps", "1", superset: "A", done: true), row("Cable overhead triceps", "2", superset: "A"),
                     row("One arm dumbbell bench", "1"),
                     row("Cable lateral raise", "1", superset: "A"), row("Cable lateral raise", "2", superset: "A")])
        d.keepSupersetsTogether()
        XCTAssertEqual(d.exercises.map(\.name), ["Cable overhead triceps", "Cable lateral raise", "One arm dumbbell bench"])
        // The sets stay as they were.
        XCTAssertEqual(d.exercises[0].sets.filter(\.done).count, 1)
    }

    func testMovingIntoASupersetKeepsItTogether() {
        var d = day([row("Squat", "1"), row("Curl", "1", superset: "B"), row("Pushdown", "1", superset: "B")])
        // As a drag reports it: Squat dropped between Curl and Pushdown.
        d.moveExercise(from: 0, to: 2)
        XCTAssertEqual(d.exercises.map(\.name), ["Curl", "Pushdown", "Squat"])
    }

    /// Make superset (live workout): the picked ones go next to the first of them, one letter, as many sets.
    func testMakeSupersetMovesThePickedTogether() {
        var d = day([row("Squat", "1", superset: "A"), row("Lunge", "1", superset: "A"),
                     row("Calf raise", "1"), row("Leg press", "1"), row("Leg curl", "1"), row("Leg curl", "2")])
        d.makeSuperset([d.exercises[2].id, d.exercises[4].id])
        XCTAssertEqual(d.exercises.map(\.name), ["Squat", "Lunge", "Calf raise", "Leg curl", "Leg press"])
        XCTAssertEqual(ExerciseOrder.letter(d.exercises[2].superset), "B")
        XCTAssertEqual(ExerciseOrder.letter(d.exercises[3].superset), "B")
        XCTAssertNil(ExerciseOrder.letter(d.exercises[4].superset))
        // A round each: Calf raise gets Leg curl's second set.
        XCTAssertEqual(d.exercises[2].workCount, 2)
    }

    /// Petr 2026-11-24: after set 1 of 3 of the exercise under way, paired with one not started:
    /// the one under way stays (its done set too), the other follows it.
    @MainActor
    func testTheExerciseUnderWayPairsWithItsSetsLeft() {
        var d = day([row("Leg curl", "1", done: true),
                     row("Bulgarian split squat", "1", done: true), row("Bulgarian split squat", "2"), row("Bulgarian split squat", "3"),
                     row("Calf raise", "1"), row("Calf raise", "2"), row("Calf raise", "3"),
                     row("Decline sit-up", "1"), row("Decline sit-up", "2"), row("Decline sit-up", "3")])
        d.makeSuperset([d.exercises[3].id, d.exercises[1].id], anchor: d.exercises[1].id)
        XCTAssertEqual(d.exercises.map(\.name), ["Leg curl", "Bulgarian split squat", "Decline sit-up", "Calf raise"])
        XCTAssertEqual(ExerciseOrder.letter(d.exercises[1].superset), ExerciseOrder.letter(d.exercises[2].superset))
        XCTAssertNotNil(ExerciseOrder.letter(d.exercises[1].superset))
        XCTAssertEqual(d.exercises[1].doneCount, 1)
        XCTAssertEqual(d.exercises[2].workCount, 3)
        // Next after Bulgarian set 2: Decline sit-up, then back.
        XCTAssertEqual(TrainingModeView.supersetTurn(d.exercises, from: 1)?.index, 2)
    }
}
