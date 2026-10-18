import XCTest
@testable import Loadwise

/// What the gym Live Activity shows for a sheet: the next set, the exercise
/// after it, each exercise's progress, and the rest only while it runs.
@MainActor
final class GymLiveActivityTests: XCTestCase {
    private func day() -> GymDay {
        var day = GymDay(date: "2026-10-15", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-10-15")
        day.markStarted(Date(timeIntervalSince1970: 1_800_000_000))
        day.appendExercise("Barbell bench press", suggestion: GymSuggestion(warmups: [GymSuggestion.Planned(kg: 40, reps: 10)],
                                                                           work: [GymSuggestion.Planned(kg: 85, reps: 6), GymSuggestion.Planned(kg: 85, reps: 6)], line: ""))
        day.appendExercise("Squat", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 100, reps: 5)], line: ""))
        return day
    }

    func testNextSetAndTheExerciseAfter() throws {
        var sheet = day()
        let warmup = sheet.exercises[0].sets[0]
        sheet.complete(row: warmup.row, kg: "40", reps: "10", rpe: "")
        let now = Date()
        let state = try XCTUnwrap(GymLiveActivity.state(sheet, focus: nil, restStart: now, restEnd: now.addingTimeInterval(90), now: now))
        XCTAssertEqual(state.exercise, "Barbell bench press")
        XCTAssertEqual(state.setLabel, "série 1 ze 2")
        XCTAssertEqual(state.load, "85 kg × 6")
        XCTAssertEqual(state.then, "Squat · 100 kg × 5")
        XCTAssertEqual(state.header, "Posilovna · 1 ze 2 cviků")
        XCTAssertEqual(state.segments.count, 2)
        XCTAssertEqual(state.segments[0], 1.0 / 3, accuracy: 0.001)
        XCTAssertEqual(state.row, sheet.exercises[0].sets[1].row)
        XCTAssertNotNil(state.restEnd)

        // A rest already over is not shown.
        let over = try XCTUnwrap(GymLiveActivity.state(sheet, focus: nil, restStart: now, restEnd: now.addingTimeInterval(-1), now: now))
        XCTAssertNil(over.restEnd)
        XCTAssertNil(over.restStart)
    }

    func testTheNextSetTakesWhatTheSetBeforeWasDoneWith() throws {
        var sheet = day()
        let sets = sheet.exercises[0].sets
        sheet.complete(row: sets[0].row, kg: "40", reps: "10", rpe: "")
        // The first work set still shows its plan; the warm-up isn't carried.
        XCTAssertEqual(try XCTUnwrap(GymLiveActivity.state(sheet, focus: nil, restStart: nil, restEnd: nil)).load, "85 kg × 6")
        sheet.complete(row: sets[1].row, kg: "90", reps: "5", rpe: "8")
        let state = try XCTUnwrap(GymLiveActivity.state(sheet, focus: nil, restStart: nil, restEnd: nil))
        XCTAssertEqual(state.load, "90 kg × 5")
        let next = try XCTUnwrap(sheet.exercises[0].sets.first { !$0.done })
        XCTAssertEqual(GymSessionMath.carried(next, in: sheet.exercises[0])?.kg, "90")
        XCTAssertNil(GymSessionMath.carried(sets[0], in: sheet.exercises[0]))
    }

    func testFocusAndAllDone() throws {
        var sheet = day()
        let focused = try XCTUnwrap(GymLiveActivity.state(sheet, focus: 1, restStart: nil, restEnd: nil))
        XCTAssertEqual(focused.exercise, "Squat")
        XCTAssertEqual(focused.then, "Barbell bench press · 40 kg × 10")
        for set in sheet.exercises.flatMap(\.sets) { sheet.complete(row: set.row, kg: "1", reps: "1", rpe: "") }
        XCTAssertNil(GymLiveActivity.state(sheet, focus: nil, restStart: nil, restEnd: nil))
    }

    func testCzechPreposition() {
        XCTAssertEqual(GymLiveActivity.preposition(4), "ze")
        XCTAssertEqual(GymLiveActivity.preposition(5), "z")
        XCTAssertEqual(GymLiveActivity.preposition(3), "ze")
        XCTAssertEqual(GymLiveActivity.preposition(11), "z")
        XCTAssertEqual(GymLiveActivity.preposition(12), "ze")
        XCTAssertEqual(GymLiveActivity.preposition(25), "ze")
        XCTAssertEqual(GymLiveActivity.preposition(50), "z")
    }
}
