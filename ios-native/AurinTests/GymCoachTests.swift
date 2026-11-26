import XCTest
@testable import Aurin

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

    // After a break as the server (C2, load ramp-back review 2026-11-25): no step up from 14 days, 10 % down after 21.
    func testTwoWeeksOffHoldsTheWeight() {
        let s = GymCoach.suggest("Barbell bench press", history: history([lift(82.5, 6, 6), lift(82.5, 6, 6), lift(82.5, 6, 6)]), before: "2026-10-20", catalog: nil)
        XCTAssertEqual(s.work.first?.kg, 82.5)
    }

    func testThreeWeeksOffStartsLighter() {
        let s = GymCoach.suggest("Barbell bench press", history: history([lift(82.5, 6, 6), lift(82.5, 6, 6), lift(82.5, 6, 6)]), before: "2026-10-30", catalog: nil)
        XCTAssertEqual(s.work.first?.kg, 72.5)
        XCTAssertEqual(s.work.first?.reps, 6)
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

    /// A generated plan keeps its warm-up and stretching in the row of the
    /// times: the start and end go after them and the routines stay.
    func testTimesKeepTheRoutines() {
        var day = GymDay(date: "2026-10-17", values: [], cancelled: nil)
        day.ensureHeader(date: "2026-10-17")
        let json = #"{"warmup":{"minutes":5,"items":[]},"stretching":null}"#
        day.set(row: GymDay.timeRow, column: 0, "Rozcvička a protažení")
        day.set(row: GymDay.timeRow, column: 1, json)
        day.markStarted(Date(timeIntervalSince1970: 1_800_000_000))
        day.markFinished(Date(timeIntervalSince1970: 1_800_003_600))
        XCTAssertEqual(day.values[GymDay.timeRow][0].string, "Rozcvička a protažení")
        XCTAssertEqual(day.values[GymDay.timeRow][1].string, json)
        XCTAssertEqual(day.loggedMinutes, 60)
        day.clearFinished()
        XCTAssertNil(day.finishedAt)
        XCTAssertNotNil(day.startedAt)
    }

    // MARK: Exercise history (Petr's rear delt pec deck, 2026-11-07)

    private let pecDeck = GymHistory.Exercise(name: "Rear delt pec deck", sessions: [
        GymHistory.Session(date: "2026-11-07", sets: [GymHistory.Lift(kg: 38, reps: 9, target: nil, rpe: nil), GymHistory.Lift(kg: 38, reps: 9, target: nil, rpe: nil), GymHistory.Lift(kg: 38, reps: 7, target: nil, rpe: nil)]),
        GymHistory.Session(date: "2026-10-23", sets: Array(repeating: GymHistory.Lift(kg: 31.7, reps: 12, target: nil, rpe: nil), count: 3)),
        GymHistory.Session(date: "2026-10-17", sets: [GymHistory.Lift(kg: 25, reps: 12, target: nil, rpe: nil), GymHistory.Lift(kg: 25, reps: 8, target: nil, rpe: nil)])
    ])

    func testHistoryRecords() {
        let heaviest = GymCoach.heaviestSet(pecDeck)
        XCTAssertEqual(heaviest?.lift.kg, 38)
        XCTAssertEqual(heaviest?.lift.reps, 9)
        XCTAssertEqual(heaviest?.date, "2026-11-07")
        XCTAssertEqual(GymCoach.oneRepMax(pecDeck)?.kg, 49.5)
        XCTAssertEqual(GymCoach.bestVolume(pecDeck)?.date, "2026-10-23")
        XCTAssertEqual(GymCoach.bestVolume(pecDeck)?.kg ?? 0, 1141.2, accuracy: 0.01)
        // Session day → the record set; the first session sets none.
        XCTAssertEqual(GymCoach.recordSets(pecDeck), ["2026-11-07": 0, "2026-10-23": 0])
    }

    /// Over 12 reps counts for no 1RM, as the server's records and Strong.
    func testOneRepMaxOnlyUpToTwelveReps() {
        let long = GymHistory.Exercise(name: "x", sessions: [GymHistory.Session(date: "2026-11-01", sets: [lift(30, 20), lift(30, 10)])])
        XCTAssertEqual(GymCoach.oneRepMax(long)?.kg, 40)
        XCTAssertEqual(GymSessionMath.e1rm(lift(30, 13)), 0)
    }

    func testHistoryChangeAgainstThePreviousSession() {
        let s = pecDeck.sessions
        XCTAssertEqual(GymCoach.change(s[0], from: s[1]), "+" + GymCoach.shown(38 - 31.7) + " " + Units.weightUnit)
        XCTAssertNil(GymCoach.change(s[2], from: nil))
        let a = GymHistory.Session(date: "2026-11-02", sets: [lift(40, 9), lift(40, 8)])
        let b = GymHistory.Session(date: "2026-10-30", sets: [lift(40, 8), lift(40, 8)])
        XCTAssertEqual(GymCoach.change(a, from: b), "+1 opakování")
        XCTAssertNil(GymCoach.change(b, from: b))
    }

    /// 611.1: Pec deck in pounds. 100 lb after 45 kg (99.2 lb, the same plate)
    /// is no record, and Next time is 105 lb for the plan's 3 sets.
    func testAPoundMachineInItsOwnUnitAndStep() {
        let raw = GymHistory.Exercise(name: "Pec deck", sessions: [
            GymHistory.Session(date: "2026-11-22", sets: [lift(45.36, 15), lift(45.36, 15), lift(45.36, 15)]),
            GymHistory.Session(date: "2026-11-15", sets: [lift(45, 12), lift(45, 12), lift(45, 12)])
        ])
        let shown = GymCoach.shown(raw, machineLb: true)
        let same = GymHistory.Exercise(name: "Pec deck", sessions: [
            GymHistory.Session(date: "2026-11-22", sets: [lift(45.36, 12)]),
            GymHistory.Session(date: "2026-11-15", sets: [lift(45, 12)])
        ])
        XCTAssertEqual(GymCoach.recordSets(same), ["2026-11-22": 0], "unconverted, the conversion was a record")
        XCTAssertEqual(GymCoach.recordSets(GymCoach.shown(same, machineLb: true)), [:])
        XCTAssertNil(GymCoach.change(GymCoach.shown(same, machineLb: true).sessions[0], from: GymCoach.shown(same, machineLb: true).sessions[1], machineLb: true))
        let heavier = GymHistory.Exercise(name: "Pec deck", sessions: [
            GymHistory.Session(date: "2026-11-29", sets: [lift(Units.kgFromPounds(105), 12)])
        ] + same.sessions)
        XCTAssertEqual(GymCoach.recordSets(GymCoach.shown(heavier, machineLb: true)), ["2026-11-29": 0])
        let step = GymSessionMath.step(shown, machineLb: true)
        let next = GymCoach.nextTime(shown.sessions[0], step: step, sets: 3, reps: (10, 15))
        XCTAssertEqual(next.sets, 3)
        XCTAssertTrue(next.hit)
        XCTAssertEqual(LiftWeight.machinePounds(next.kg ?? 0), 105)
        // Short of the plan's top reps: the same 100 lb again.
        let short = GymCoach.nextTime(GymCoach.shown(same, machineLb: true).sessions[0], step: step, sets: 3, reps: (10, 15))
        XCTAssertFalse(short.hit)
        XCTAssertEqual(LiftWeight.machinePounds(short.kg ?? 0), 100)
    }

    /// 611.1: Low row, plan 4 × 5–8, last time 2 sets in fives: 4 sets, 5 kg step.
    func testNextTimeTakesThePlanAndTheMachineStep() {
        let row = GymHistory.Exercise(name: "Low row", sessions: [
            GymHistory.Session(date: "2026-11-22", sets: [lift(55, 8), lift(55, 8)]),
            GymHistory.Session(date: "2026-11-15", sets: [lift(50, 8), lift(50, 8), lift(50, 8)])
        ])
        let next = GymCoach.nextTime(row.sessions[0], step: GymSessionMath.step(row), sets: 4, reps: (5, 8))
        XCTAssertEqual(next.sets, 4)
        XCTAssertEqual(next.kg, 60)
        XCTAssertEqual(next.reps, 5)
        // Without a plan: the last session's sets (at least 2) and the 2.5 kg step.
        let free = GymCoach.nextTime(GymHistory.Session(date: "2026-11-22", sets: [lift(52.5, 8, 8)]), step: GymSessionMath.step(nil))
        XCTAssertEqual(free.sets, 2)
        XCTAssertEqual(free.kg, 55)
    }

    /// At the same weight the best set's reps, not the sum over different numbers of sets.
    func testChangeAtTheSameWeightIgnoresTheNumberOfSets() {
        let three = GymHistory.Session(date: "2026-11-22", sets: [lift(40, 12), lift(40, 12), lift(40, 12)])
        let six = GymHistory.Session(date: "2026-11-15", sets: Array(repeating: lift(40, 11), count: 6))
        XCTAssertEqual(GymCoach.change(three, from: six), "+1 opakování")
    }
}
