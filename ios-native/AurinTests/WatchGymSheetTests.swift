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

    func testANameFromTheCatalogReadsAsASentence() {
        XCTAssertEqual(ExerciseName.shown("Cable Single Arm Rear Delt Row"), "Cable single arm rear delt row")
        XCTAssertEqual(ExerciseName.shown("Face pull"), "Face pull")
    }
}
