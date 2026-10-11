import XCTest
@testable import Loadwise

/// The live gym's suggestions: progression from the last session, warm-ups,
/// the next exercise in balance, and the logged sheet.
final class GymCoachTests: XCTestCase {
    private func lift(_ kg: Double?, _ reps: Double, _ target: Double? = nil) -> GymHistory.Lift {
        GymHistory.Lift(kg: kg, reps: reps, target: target, rpe: nil)
    }

    private func history(_ sets: [GymHistory.Lift], name: String = "Barbell bench press") -> GymHistory {
        GymHistory(exercises: [GymHistory.Exercise(name: name, sessions: [GymHistory.Session(date: "2026-10-05", sets: sets)])])
    }

    private func exercise(_ name: String, muscles: [String: Double], fatigue: Double = 1) -> GymCatalogExercise {
        GymCatalogExercise(name: name, muscle: nil, sets: nil, reps: nil, note: nil, station: nil, stations: nil, muscles: muscles, fatigue: fatigue)
    }

    func testAllRepsLastTimeAddsTwoAndAHalfKilos() {
        let s = GymCoach.suggest("Barbell bench press", history: history([lift(82.5, 6, 6), lift(82.5, 6, 6), lift(82.5, 6, 6)]), before: "2026-10-11", catalog: nil)
        XCTAssertEqual(s.work.count, 3)
        XCTAssertEqual(s.work.first?.kg, 85)
        XCTAssertEqual(s.work.first?.reps, 6)
        XCTAssertEqual(s.warmups.map { $0.kg ?? 0 }, [42.5, 60])
    }

    func testShortOfTheRepsRepeatsTheWeight() {
        let s = GymCoach.suggest("Barbell bench press", history: history([lift(80, 8, 8), lift(80, 7, 8), lift(80, 6, 8)]), before: "2026-10-11", catalog: nil)
        XCTAssertEqual(s.work.first?.kg, 80)
        XCTAssertEqual(s.work.first?.reps, 8)
    }

    func testTodayIsNotLastTime() {
        let s = GymCoach.suggest("Barbell bench press", history: history([lift(80, 8, 8)]), before: "2026-10-05", catalog: nil)
        XCTAssertNil(s.work.first?.kg)
    }

    func testAfterPushComesPull() {
        let catalog = [exercise("Barbell bench press", muscles: ["chest": 1, "triceps": 0.5]),
                       exercise("Lat pulldown", muscles: ["lats": 1, "biceps": 0.5]),
                       exercise("DB shoulder press", muscles: ["front_delts": 1]),
                       exercise("Goblet squat", muscles: ["quads": 1])]
        let next = GymCoach.nextPicks(done: ["Barbell bench press"], catalog: catalog, history: .empty, date: "2026-10-11")
        XCTAssertEqual(next.picks.first?.name, "Lat pulldown")
        XCTAssertNotNil(next.line)
        XCTAssertFalse(next.picks.contains { $0.name == "Barbell bench press" })
    }

    func testLoggedSheetKeepsOnlyTicked() {
        var day = GymDay(date: "2026-10-11", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-10-11")
        day.markStarted(Date(timeIntervalSince1970: 1_800_000_000))
        day.appendExercise("Barbell bench press", suggestion: GymSuggestion(warmups: [GymSuggestion.Planned(kg: 40, reps: 10)],
                                                                           work: [GymSuggestion.Planned(kg: 85, reps: 6), GymSuggestion.Planned(kg: 85, reps: 6)], line: ""))
        XCTAssertEqual(day.exercises.first?.sets.count, 3)
        XCTAssertEqual(day.exercises.first?.sets.first?.warmup, true)
        let first = day.exercises[0].sets[1]
        day.complete(row: first.row, kg: "85", reps: "6", rpe: "")
        XCTAssertEqual(day.volume, 510)
        day.markFinished(Date(timeIntervalSince1970: 1_800_003_720))
        XCTAssertEqual(day.loggedMinutes, 62)
        day.dropUndone()
        XCTAssertEqual(day.exercises.first?.sets.count, 1)
        XCTAssertNotNil(day.startedAt)
    }
}
