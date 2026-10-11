import XCTest
@testable import Loadwise

/// An added exercise goes where it belongs; a superset stays together.
final class ExerciseOrderTests: XCTestCase {
    private func exercise(_ name: String, fatigue: Double?, muscles: [String: Double]? = nil) -> GymCatalogExercise {
        GymCatalogExercise(name: name, muscle: nil, sets: nil, reps: nil, note: nil, station: nil, stations: nil, muscles: muscles, fatigue: fatigue)
    }

    private func row(_ name: String, superset: String = "", done: Bool = false) -> [JSONValue] {
        ["WORK", name, "1", "", "8", "", "", "", done ? "TRUE" : "FALSE", "", "", "FALSE", superset].map { JSONValue.string($0) }
    }

    func testBeforeTheFirstLighterExercise() {
        XCTAssertEqual(ExerciseOrder.insertionIndex(rank: 1.0, ranks: [1.3, 0.8, 0.45, 0], supersets: [nil, nil, nil, nil]), 1)
        XCTAssertEqual(ExerciseOrder.insertionIndex(rank: 0, ranks: [1.3, 0.8, 0], supersets: [nil, nil, nil]), 3)
    }

    func testNotInsideASupersetNorBeforeWhatIsDone() {
        XCTAssertEqual(ExerciseOrder.insertionIndex(rank: 0.7, ranks: [1.3, 0.8, 0.6, 0.3], supersets: [nil, "A", "A", nil]), 3)
        XCTAssertEqual(ExerciseOrder.insertionIndex(rank: 2, ranks: [1, 0.5], supersets: [nil, nil], earliest: 1), 1)
    }

    func testCoreGoesLast() {
        XCTAssertEqual(ExerciseOrder.rank("Crunch", catalog: [], muscles: ["abs": 1, "obliques": 0.5]), 0)
        XCTAssertEqual(ExerciseOrder.rank("Squat", catalog: [exercise("Squat", fatigue: 1.3)]), 1.3)
    }

    func testSupersetsTogether() {
        XCTAssertEqual(ExerciseOrder.runs([nil, "A", "A", nil]), [0..<1, 1..<3, 3..<4])
        XCTAssertEqual(ExerciseOrder.grouped(["A", nil, "A", "B", nil, "B"]), [0, 2, 1, 3, 5, 4])
    }

    func testProposalInsertAndMove() {
        let catalog = [exercise("Squat", fatigue: 1.3), exercise("Curl", fatigue: 0.45), exercise("Row", fatigue: 0.9)]
        var p = GymProposal(draftId: 1, planName: "Plán", rationale: nil,
                            rows: [row("Squat"), row("Curl"), row("Crunch")], muscles: ["Crunch": ["abs": 1]])
        p.insert([row("Row")], name: "Row", catalog: catalog)
        XCTAssertEqual(p.exercises.map { $0.name }, ["Squat", "Row", "Curl", "Crunch"])

        var s = GymProposal(draftId: 1, planName: "Plán", rationale: nil,
                            rows: [row("Squat"), row("Bench", superset: "A"), row("Row", superset: "A"), row("Curl")], muscles: [:])
        XCTAssertFalse(s.canMove(0, by: -1))
        s.moveExercise(3, by: -1)
        XCTAssertEqual(s.exercises.map { $0.name }, ["Squat", "Curl", "Bench", "Row"])
    }

    func testDayInsertAfterTheDoneExercises() {
        let catalog = [exercise("Squat", fatigue: 0.5), exercise("Curl", fatigue: 0.45), exercise("Leg press", fatigue: 1.2)]
        let head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow)
        var day = GymDay(date: "2026-10-11", values: head + [row("Squat", done: true), row("Curl")], cancelled: nil)
        day.insertExercise("Leg press", sets: 2, reps: "10", catalog: catalog)
        XCTAssertEqual(day.exercises.map { $0.name }, ["Squat", "Leg press", "Curl"])
        XCTAssertEqual(day.exercises[1].sets.count, 2)
    }
}
