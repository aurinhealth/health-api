import XCTest
@testable import Aurin

/// The day's sheet as the Apple Watch gets it and changes it without the
/// iPhone (WatchShared/GymSheet.swift): the same rows the iPhone would write.
@MainActor
final class WatchGymSheetTests: XCTestCase {
    private func day() -> GymDay {
        var day = GymDay(date: "2026-11-01", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-11-01")
        day.appendExercise("Bench Press", suggestion: GymSuggestion(warmups: [],
                                                                   work: [GymSuggestion.Planned(kg: 60, reps: 8), GymSuggestion.Planned(kg: 60, reps: 8)], line: ""))
        day.appendExercise("Seated Cable Row", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 50, reps: 10)], line: ""))
        return day
    }

    func testThePlanForTheWatchCarriesItsSheet() throws {
        let sheet = day()
        let gym = WatchGym(sheet, date: "2026-11-01", restSets: 75, restExercises: 120)
        XCTAssertEqual(gym.sheet, sheet.values)
        XCTAssertEqual(gym.exercises.map(\.name), ["Bench Press", "Seated Cable Row"])
        let first = try XCTUnwrap(gym.exercises.first?.lifts.first)
        XCTAssertEqual(first.kg, 60)
        XCTAssertEqual(first.reps, 8)
        XCTAssertEqual(first.rest, 75)
        // Sent and read back as the watch gets it.
        let decoded = try XCTUnwrap(gym.encoded().flatMap(WatchGym.decode))
        XCTAssertEqual(decoded, gym)
    }

    func testASetDoneOnTheWatchIsWrittenAsOnTheIPhone() throws {
        var watch = day()
        var phone = day()
        let row = watch.exercises[0].sets[0].row
        let start = Date(timeIntervalSince1970: 1_793_000_000)
        watch.apply(WatchGym.Done(date: "2026-11-01", row: row, kg: 62.5, reps: 8), start: start)
        phone.complete(row: row, kg: "62.5", reps: "8", rpe: "")
        phone.markStarted(start)
        XCTAssertEqual(watch.values, phone.values)
        XCTAssertTrue(watch.exercises[0].sets[0].done)
        XCTAssertEqual(watch.startedAt, start)
    }

    func testAChangeFromTheWatchMenu() {
        var sheet = day()
        sheet.apply(WatchGym.Change(date: "2026-11-01", kind: .addSet, exercise: 1))
        XCTAssertEqual(sheet.exercises[1].sets.count, 2)
        sheet.apply(WatchGym.Change(date: "2026-11-01", kind: .swap, exercise: 0,
                                    option: WatchGym.Option(name: "Dumbbell Bench Press", shown: "Dumbbell bench press", kg: 22.5, sets: 3, reps: "10")))
        XCTAssertEqual(sheet.exercises[0].name, "Dumbbell Bench Press")
        XCTAssertEqual(sheet.exercises[0].sets[0].plannedKg, "22.5")
        sheet.apply(WatchGym.Change(date: "2026-11-01", kind: .move, exercise: 1, to: 0))
        XCTAssertEqual(sheet.exercises.map(\.name), ["Seated Cable Row", "Dumbbell Bench Press"])
        // A change for an exercise that is no longer there leaves the sheet as it is.
        let before = sheet.values
        sheet.apply(WatchGym.Change(date: "2026-11-01", kind: .removeExercise, exercise: 5))
        XCTAssertEqual(sheet.values, before)
    }

    func testTheWatchSheetKeepsASetTickedOnTheIPhoneMeanwhile() {
        var watch = day()
        var phone = day()
        let first = watch.exercises[0].sets[0].row, second = watch.exercises[0].sets[1].row
        let start = Date(timeIntervalSince1970: 1_793_000_000)
        // The watch went alone after its first set; the iPhone ticked the second.
        watch.apply(WatchGym.Done(date: "2026-11-01", row: first, kg: 62.5, reps: 8), start: start)
        phone.apply(WatchGym.Done(date: "2026-11-01", row: first, kg: 62.5, reps: 8), start: start)
        phone.complete(row: second, kg: "62.5", reps: "7", rpe: "")
        var merged = GymDay(date: "2026-11-01", values: GymDay.merged(watch.values, keepingDoneFrom: phone.values), cancelled: nil)
        XCTAssertEqual(merged.exercises[0].sets.map(\.done), [true, true])
        XCTAssertEqual(merged.exercises[0].sets[1].reps, "7")
        // An exercise the watch swapped meanwhile stays the watch's.
        watch.apply(WatchGym.Change(date: "2026-11-01", kind: .swap, exercise: 1,
                                    option: WatchGym.Option(name: "Lat Pulldown", shown: "Lat pulldown", kg: 45, sets: 1, reps: "10")))
        phone.complete(row: phone.exercises[1].sets[0].row, kg: "50", reps: "10", rpe: "")
        merged.values = GymDay.merged(watch.values, keepingDoneFrom: phone.values)
        XCTAssertEqual(merged.exercises[1].name, "Lat Pulldown")
        XCTAssertFalse(merged.exercises[1].sets[0].done)
    }

    func testANameFromTheCatalogReadsAsASentence() {
        XCTAssertEqual(ExerciseName.shown("Cable Single Arm Rear Delt Row"), "Cable single arm rear delt row")
        XCTAssertEqual(ExerciseName.shown("Face pull"), "Face pull")
    }

    /// A superset on the watch goes round by round as in Training mode on the
    /// iPhone: A1, B1 straight after, the rest, A2, B2, then the next exercise.
    func testASupersetGoesRoundByRound() throws {
        var sheet = day()
        sheet.appendExercise("Plank", suggestion: GymSuggestion(warmups: [], work: [GymSuggestion.Planned(kg: 0, reps: 30)], line: ""))
        sheet.toggleSuperset(at: 0)
        var gym = WatchGym(sheet, date: "2026-11-01", restSets: 75, restExercises: 120)
        XCTAssertEqual(gym.exercises.map(\.superset), ["A", "A", nil])
        XCTAssertEqual(gym.superset(of: 1), [0, 1])
        XCTAssertNil(gym.superset(of: 2))
        let bench = gym.exercises[0].lifts.map(\.row), row = gym.exercises[1].lifts.map(\.row)
        XCTAssertEqual(row.count, 2, "the shorter exercise takes sets up to the longer one")
        var next = try XCTUnwrap(gym.next(after: bench[0]))
        XCTAssertEqual(next.exercise, 1)
        XCTAssertEqual(next.turn, .partner)
        gym.update(row: bench[0]) { $0.done = true }
        next = try XCTUnwrap(gym.next(after: row[0]))
        XCTAssertEqual(next.exercise, 0)
        XCTAssertEqual(next.lift.row, bench[1])
        XCTAssertEqual(next.turn, .round)
        gym.update(row: row[0]) { $0.done = true }
        gym.update(row: bench[1]) { $0.done = true }
        next = try XCTUnwrap(gym.next(after: row[1]))
        XCTAssertEqual(next.exercise, 2, "past the superset when all of it is done")
        XCTAssertNil(next.turn)
        XCTAssertTrue(next.newExercise)
        // The next set of the same exercise starts from this one's weight (not the partner's).
        XCTAssertEqual(gym.nextInExercise(after: bench[0])?.row, bench[1])
    }

    /// A one-sided exercise: the right side tapped first, the left one comes
    /// straight after it, then the next set.
    func testTheOtherSideComesNext() throws {
        var sheet = day()
        sheet.setSides(at: 1, true)
        let gym = WatchGym(sheet, date: "2026-11-01", restSets: 75, restExercises: 120)
        let lifts = gym.exercises[1].lifts
        XCTAssertEqual(lifts.map(\.side), ["L", "P"])
        let next = try XCTUnwrap(gym.next(after: lifts[1].row))
        XCTAssertEqual(next.lift.row, lifts[0].row)
        XCTAssertFalse(next.newExercise)
        XCTAssertEqual(gym.otherSide(of: lifts[0], in: 1)?.row, lifts[1].row)
        XCTAssertNil(gym.otherSide(of: gym.exercises[0].lifts[0], in: 0))
    }
}
