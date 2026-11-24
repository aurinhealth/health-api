import XCTest
@testable import Aurin

/// The live workout after the 617 test: the set at hand after an exercise is
/// removed, one length of a finished workout, bodyweight exercises without
/// weights, and Undo of a removed exercise.
@MainActor
final class GymLive617Tests: XCTestCase {
    private func day() -> GymDay {
        var day = GymDay(date: "2026-11-23", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-11-23")
        day.markStarted(Date(timeIntervalSince1970: 1_800_000_000))
        day.appendExercise("Dead bug", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: nil, reps: 6),
                                                                                    GymSuggestion.Planned(kg: nil, reps: 6)], line: ""))
        day.appendExercise("Push-up", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: nil, reps: 10)], line: ""))
        day.appendExercise("Squat", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 100, reps: 5)], line: ""))
        return day
    }

    func testRemovingTheExerciseUnderWayPutsAnotherSetAtHand() {
        // C2: Dead bug (6 reps) removed: Push-up comes on, and the screen must refill its fields.
        let before = day()
        var after = before
        after.deleteExercise(at: 0)
        XCTAssertNotEqual(TrainingModeView.atHand(before, 0), TrainingModeView.atHand(after, 0))
        XCTAssertEqual(after.exercises.first?.name, "Push-up")
        // Removing another exercise leaves the set at hand (and what was typed in it) alone.
        var other = before
        other.deleteExercise(at: 2)
        XCTAssertEqual(TrainingModeView.atHand(before, 0), TrainingModeView.atHand(other, 0))
    }

    func testFinishedWorkoutKeepsItsActiveMinutes() {
        // C3: 9:27 to 10:29 with a long pause, 6 min worked: one length everywhere.
        var sheet = day()
        sheet.markFinished(Date(timeIntervalSince1970: 1_800_003_720), activeMinutes: 6)
        XCTAssertEqual(sheet.activeMinutes, 6)
        XCTAssertEqual(sheet.loggedMinutes, 6)
        // Resume clears it; finished again without a recording, start to end counts.
        sheet.clearFinished()
        XCTAssertNil(sheet.activeMinutes)
        sheet.markFinished(Date(timeIntervalSince1970: 1_800_003_720))
        XCTAssertEqual(sheet.loggedMinutes, 62)
    }

    func testBodyweightHasNoWeightAndCountsReps() throws {
        // C15: a push-up has no kg column and its reps instead of "0.0 t".
        var sheet = day()
        XCTAssertTrue(GymSessionMath.noWeight(sheet.exercises[1]))
        XCTAssertFalse(GymSessionMath.noWeight(sheet.exercises[2]))
        let set = try XCTUnwrap(sheet.exercises[1].sets.first)
        sheet.complete(row: set.row, kg: "", reps: "12", rpe: "")
        XCTAssertEqual(GymSessionMath.doneReps(sheet.exercises), 12)
        XCTAssertEqual(GymSessionMath.volume(sheet.exercises), 0)
    }

    func testBodyweightLoadSaysReps() throws {
        // C14: the island and the lock screen say "10 opak.", never a bare "10".
        let sheet = day()
        let set = try XCTUnwrap(sheet.exercises[1].sets.first)
        XCTAssertEqual(GymLiveActivity.load(set, in: sheet.exercises[1]), L10n.f("%@ opak.", "10"))
        let squat = try XCTUnwrap(sheet.exercises[2].sets.first)
        XCTAssertEqual(GymLiveActivity.load(squat, in: sheet.exercises[2]), "100 kg × 5")
    }

    func testUndoOfARemovedExerciseOutlivesTheNextExerciseComingOn() throws {
        // C7: the day changes right after the removal (the watch's echo, the next
        // exercise coming on): Undo stays until a set is ticked or the list changes.
        let before = day()
        var after = before
        after.deleteExercise(at: 1)
        var echo = after
        echo.markStarted(Date(timeIntervalSince1970: 1_800_000_060))
        XCTAssertTrue(TrainingModeView.canUndoRemove(after: after, now: echo))
        var ticked = after
        let set = try XCTUnwrap(ticked.exercises[0].sets.first)
        ticked.complete(row: set.row, kg: "", reps: "6", rpe: "")
        XCTAssertFalse(TrainingModeView.canUndoRemove(after: after, now: ticked))
        XCTAssertFalse(TrainingModeView.canUndoRemove(after: after, now: before))
    }
}
