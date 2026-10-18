import XCTest
@testable import Loadwise

/// The letter of each set (W T E M H F PR D) and drop sets in the gym sheet.
@MainActor
final class GymIntensityTests: XCTestCase {
    private func day() -> GymDay {
        var day = GymDay(date: "2026-10-18", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-10-18")
        day.appendExercise("Cable lateral raise", suggestion: GymSuggestion(warmups: [],
                                                                           work: [GymSuggestion.Planned(kg: 10, reps: 12), GymSuggestion.Planned(kg: 10, reps: 12)], line: ""))
        day.appendExercise("Squat", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 100, reps: 5)], line: ""))
        return day
    }

    func testTheSetTakesThePlansLetterAndItsRpe() throws {
        var sheet = day()
        let first = sheet.exercises[0].sets[0]
        sheet.setIntensity(row: first.row, "M")
        XCTAssertEqual(sheet.exercises[0].sets[0].intensity, "M")
        sheet.complete(row: first.row, kg: "10", reps: "12", rpe: "")
        let done = sheet.exercises[0].sets[0]
        XCTAssertEqual(done.rpe, "7.5")
        XCTAssertEqual(done.intensity, "M")

        // Changed after it was done: the RPE follows, F marks the failure.
        sheet.setIntensity(row: first.row, "F")
        XCTAssertEqual(sheet.exercises[0].sets[0].rpe, "10")
        XCTAssertEqual(sheet.values[first.row][11].string, "TRUE")

        // An old RPE without a letter stays as it was given.
        let second = sheet.exercises[0].sets[1]
        sheet.complete(row: second.row, kg: "10", reps: "12", rpe: "8")
        XCTAssertEqual(sheet.exercises[0].sets[1].rpe, "8")
        XCTAssertEqual(sheet.exercises[0].sets[1].intensity, "H")
    }

    func testWMakesAWorkSetAWarmUp() {
        var sheet = day()
        let first = sheet.exercises[0].sets[0]
        sheet.setIntensity(row: first.row, "W")
        XCTAssertTrue(sheet.exercises[0].sets[0].warmup)
        XCTAssertEqual(sheet.exercises[0].workCount, 1)
        sheet.setIntensity(row: first.row, "E")
        XCTAssertFalse(sheet.exercises[0].sets[0].warmup)
    }

    func testDAddsADropSetAfterTheSetAndItsDropsSoFar() throws {
        var sheet = day()
        let last = sheet.exercises[0].sets[1]
        let drop = try XCTUnwrap(sheet.addDrop(after: last.row))
        let second = try XCTUnwrap(sheet.addDrop(after: last.row))
        let sets = sheet.exercises[0].sets
        XCTAssertEqual(sets.map(\.drop), [false, false, true, true])
        XCTAssertEqual(sets[1].intensity, "F")
        XCTAssertEqual(sets[2].row, drop)
        XCTAssertEqual(sets[2].plannedKg, "8")
        XCTAssertEqual(sets[3].row, second)
        XCTAssertEqual(sets[3].plannedKg, "6.5")
        XCTAssertEqual(sets[2].plannedReps, "max")
        XCTAssertEqual(sets[2].intensity, "D")
        // Drop sets are not counted as sets of their own.
        XCTAssertEqual(sheet.exercises[0].workCount, 2)
        XCTAssertEqual(sheet.exercises[1].name, "Squat")

        sheet.removeDrop(row: second)
        XCTAssertEqual(sheet.exercises[0].sets.filter(\.drop).count, 1)
    }

    func testOldRpeShowsAsALetter() {
        XCTAssertEqual(["6", "7", "8", "9", "10"].map { GymIntensity.from(rpe: $0) }, ["E", "M", "H", "H", "F"])
        XCTAssertNil(GymIntensity.from(rpe: ""))
        XCTAssertEqual(GymIntensity.dropKg("62.5"), "50")
        XCTAssertEqual(GymIntensity.dropKg(""), "")
    }
}
