import XCTest
@testable import Aurin

/// Sets swiped away, warm-ups that follow the order, and the ready-made places.
final class GymSetEditTests: XCTestCase {
    private func row(_ type: String, _ name: String, _ number: String, _ kg: String, done: Bool = false, side: String = "") -> [JSONValue] {
        [type, name, number, kg, "8", "", "", "", done ? "TRUE" : "FALSE", "", "", "FALSE", "", side].map { JSONValue.string($0) }
    }

    private func day(_ rows: [[JSONValue]]) -> GymDay {
        var head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow - 1)
        head.append(GymDay.columns.map { JSONValue.string($0) })
        return GymDay(date: "2026-10-18", values: head + rows, cancelled: nil)
    }

    func testDeletingAWarmupNumbersTheRestAgain() {
        var d = day([row("WARMUP", "Bench", "1", "20", done: true), row("WARMUP", "Bench", "2", "35"), row("WARMUP", "Bench", "3", "45"),
                     row("WORK", "Bench", "1", "55"), row("WORK", "Bench", "2", "55")])
        let second = d.exercises[0].sets[1]
        d.deleteSet(row: second.row)
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.number), ["1", "2"])
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.plannedKg), ["20", "45"])
        let work = d.exercises[0].sets.first { !$0.warmup }!
        d.deleteSet(row: work.row)
        XCTAssertEqual(d.exercises[0].sets.filter { !$0.warmup }.map(\.number), ["1"])
        // A set done goes too, the one swiped.
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.plannedKg), ["45"])
        XCTAssertEqual(d.exercises[0].sets.count, 2)
    }

    func testBySidesBothLegsWarmUp() {
        var d = day([row("WARMUP", "Bulgarian split squat", "1", "6"), row("WORK", "Bulgarian split squat", "1", "10"),
                     row("WORK", "Bulgarian split squat", "2", "10")])
        d.setSides(at: 0, true)
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.side), ["L", "P"])
        XCTAssertEqual(d.exercises[0].sets.filter { !$0.warmup }.map(\.side), ["L", "P", "L", "P"])
        // Swiping one side's warm-up away takes the pair.
        d.deleteSet(row: d.exercises[0].sets[1].row)
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).count, 0)
        // Back to both at once: one row per warm-up and set.
        var e = day([row("WARMUP", "Lunge", "1", "6", side: "L"), row("WARMUP", "Lunge", "1", "6", side: "P"),
                     row("WORK", "Lunge", "1", "10", done: true, side: "L"), row("WORK", "Lunge", "1", "10", side: "P"),
                     row("WORK", "Lunge", "2", "10", side: "L"), row("WORK", "Lunge", "2", "10", side: "P")])
        e.setSides(at: 0, false)
        XCTAssertEqual(e.exercises[0].sets.map(\.warmup), [true, false, false, false])
        XCTAssertEqual(e.exercises[0].sets.map(\.number), ["1", "1", "1", "2"])
    }

    func testBySidesWarmupsFollowTheOrderOnBothSides() {
        var d = day([row("WARMUP", "Bench", "1", "35"), row("WORK", "Bench", "1", "55"),
                     row("WARMUP", "Lunge", "1", "13", side: "L"), row("WARMUP", "Lunge", "1", "13", side: "P"),
                     row("WORK", "Lunge", "1", "20", side: "L"), row("WORK", "Lunge", "1", "20", side: "P")])
        // The lunge goes first: three ramp-up steps, each for L and P.
        d.moveExercise(from: 1, to: 0)
        let warms = d.exercises[0].sets.filter(\.warmup)
        XCTAssertEqual(warms.map(\.side), ["L", "P", "L", "P", "L", "P"])
        XCTAssertEqual(warms.map(\.number), ["1", "1", "2", "2", "3", "3"])
        XCTAssertEqual(warms.map(\.plannedKg), ["8", "8", "13", "13", "16", "16"])
    }

    func testDeletingTheSetSwipedNotTheFirst() {
        var d = day([row("WORK", "Bench", "1", "50", done: true), row("WORK", "Bench", "2", "55", done: true), row("WORK", "Bench", "3", "60")])
        d.deleteSet(row: d.exercises[0].sets[1].row)
        XCTAssertEqual(d.exercises[0].sets.map(\.plannedKg), ["50", "60"])
        XCTAssertEqual(d.exercises[0].sets.map(\.number), ["1", "2"])
        XCTAssertEqual(d.exercises[0].sets.map(\.done), [true, false])
    }

    func testDeletingBySidesTakesBothRows() {
        var d = day([row("WORK", "Lunge", "1", "10", side: "L"), row("WORK", "Lunge", "1", "10", side: "P"),
                     row("WORK", "Lunge", "2", "10", side: "L"), row("WORK", "Lunge", "2", "10", side: "P")])
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises[0].sets.map(\.number), ["1", "1"])
        XCTAssertEqual(d.exercises[0].sets.map(\.side), ["L", "P"])
    }

    func testASetTakesItsDropSetsAlong() {
        var d = day([row("WORK", "Curl", "1", "14"), row("DROP", "Curl", "1", "10"), row("WORK", "Curl", "2", "14"), row("DROP", "Curl", "2", "10")])
        let gone = d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(gone.count, 2)
        XCTAssertEqual(d.exercises[0].sets.map(\.number), ["1", "1"])
        XCTAssertEqual(d.exercises[0].sets.map(\.drop), [false, true])
        d.deleteSet(row: d.exercises[0].sets[1].row)
        XCTAssertEqual(d.exercises[0].sets.count, 1)
    }

    func testTheLastSetGoneTakesTheExercise() {
        var d = day([row("WORK", "Curl", "1", "10"), row("WORK", "Row", "1", "40")])
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises.map(\.name), ["Row"])
    }

    func testTheLastSetGoneTakesItsWarmupsAlong() {
        var d = day([row("WARMUP", "Hip thrust", "1", "12,5"), row("WORK", "Hip thrust", "1", "40"), row("WORK", "Row", "1", "40")])
        let gone = d.deleteSet(row: d.exercises[0].sets[1].row)
        XCTAssertEqual(gone.count, 2)
        XCTAssertEqual(d.exercises.map(\.name), ["Row"])
        // A warm-up done stays recorded.
        var e = day([row("WARMUP", "Hip thrust", "1", "12,5", done: true), row("WORK", "Hip thrust", "1", "40")])
        e.deleteSet(row: e.exercises[0].sets[1].row)
        XCTAssertEqual(e.exercises[0].sets.map(\.warmup), [true])
    }

    func testRemovingTheLastSetTakesTheExercise() {
        var d = day([row("WARMUP", "Hip thrust", "1", "12,5"), row("WORK", "Hip thrust", "1", "40"), row("WORK", "Row", "1", "40")])
        d.removeSet(at: 0)
        XCTAssertEqual(d.exercises.map(\.name), ["Row"])
        // Warm-ups left alone from before go with the exercise.
        var e = day([row("WARMUP", "Hip thrust", "1", "12,5"), row("WORK", "Row", "1", "40")])
        e.removeExercise(at: 0)
        XCTAssertEqual(e.exercises.map(\.name), ["Row"])
    }

    func testDeletingAnExerciseTakesItsDoneSetsToo() {
        var d = day([row("WORK", "Standing Dumbbell Press", "1", "17,5", done: true), row("WORK", "Row", "1", "40")])
        d.deleteExercise(at: 0)
        XCTAssertEqual(d.exercises.map(\.name), ["Row"])
        d.deleteExercise(at: 0)
        XCTAssertTrue(d.exercises.isEmpty)
        // A superset partner left alone is no superset any more.
        var p = day([row("WORK", "Curl", "1", "12"), row("WORK", "Dips", "1", ""), row("WORK", "Row", "1", "40")])
        p.toggleSuperset(at: 0)
        XCTAssertNotNil(ExerciseOrder.letter(p.exercises[1].superset))
        p.deleteExercise(at: 0)
        XCTAssertEqual(p.exercises.map(\.name), ["Dips", "Row"])
        XCTAssertNil(ExerciseOrder.letter(p.exercises[0].superset))
    }

    func testWarmupsFollowTheOrder() {
        var d = day([row("WARMUP", "Leg press", "1", "60"), row("WARMUP", "Leg press", "2", "95"), row("WARMUP", "Leg press", "3", "115"),
                     row("WORK", "Leg press", "1", "145"),
                     row("WARMUP", "Bench", "1", "35"), row("WORK", "Bench", "1", "55"),
                     row("WORK", "Curl", "1", "12")])
        // Leg press to the end: the bench is first now and gets three, the leg press one.
        d.moveExercise(from: 0, to: 3)
        XCTAssertEqual(d.exercises.map(\.name), ["Bench", "Curl", "Leg press"])
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.plannedKg), ["22,5", "35", "45"])
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).map(\.plannedReps), ["8", "5", "3"])
        XCTAssertEqual(d.exercises[1].sets.filter(\.warmup).count, 0, "an accessory gets none")
        XCTAssertEqual(d.exercises[2].sets.filter(\.warmup).map(\.plannedKg), ["95"])
        XCTAssertEqual(d.exercises[2].sets.filter { !$0.warmup }.count, 1)
    }

    func testABegunWarmupStays() {
        var d = day([row("WARMUP", "Leg press", "1", "60", done: true), row("WARMUP", "Leg press", "2", "95"), row("WARMUP", "Leg press", "3", "115"),
                     row("WORK", "Leg press", "1", "145"),
                     row("WARMUP", "Bench", "1", "35"), row("WORK", "Bench", "1", "55")])
        d.moveExercise(from: 0, to: 2)
        XCTAssertEqual(d.exercises.map(\.name), ["Bench", "Leg press"])
        XCTAssertEqual(d.exercises[1].sets.filter(\.warmup).count, 3)
        XCTAssertEqual(d.exercises[0].sets.filter(\.warmup).count, 3)
    }

    func testASupersetWithAnyExerciseMovesItUnder() {
        var d = day([row("WORK", "Bench", "1", "60"), row("WORK", "Squat", "1", "80"), row("WORK", "Row", "1", "50"), row("WORK", "Curl", "1", "12")])
        d.superset(0, with: 2)
        XCTAssertEqual(d.exercises.map(\.name), ["Bench", "Row", "Squat", "Curl"])
        XCTAssertEqual(d.exercises.map { ExerciseOrder.letter($0.superset) }, ["A", "A", nil, nil])
        // One above: it comes down under the one swiped.
        d.superset(3, with: 2)
        XCTAssertEqual(d.exercises.map(\.name), ["Bench", "Row", "Curl", "Squat"])
        XCTAssertEqual(d.exercises.map { ExerciseOrder.letter($0.superset) }, ["A", "A", "B", "B"])
        // Out of the superset it was in: Bench is left alone.
        d.superset(3, with: 1)
        XCTAssertEqual(d.exercises.map(\.name), ["Bench", "Curl", "Squat", "Row"])
        XCTAssertNil(ExerciseOrder.letter(d.exercises[0].superset))
        XCTAssertNil(ExerciseOrder.letter(d.exercises[1].superset))
        XCTAssertEqual(ExerciseOrder.letter(d.exercises[2].superset), ExerciseOrder.letter(d.exercises[3].superset))
        XCTAssertNotNil(ExerciseOrder.letter(d.exercises[3].superset))
    }

    func testReadyMadePlacesComeOnceToAnAccountWithPlaces() {
        let mine = GymPlace(id: "place-1", kind: "gym", name: "METAGYM", stations: ["dumbbells"], url: "", dumbbellWeights: [])
        let body = GymPlace(id: "place-2", kind: "home", name: L10n.tr("Vlastní váha"), stations: ["floor_mats"], url: "", dumbbellWeights: [])
        let next = EquipmentView.seeded([mine, body], active: "place-1", all: ["dumbbells", "floor_mats"], firstTime: false, presetsFirstTime: true)
        XCTAssertEqual(next.places.map(\.name), ["METAGYM", L10n.tr("Vlastní váha"), L10n.tr("Velké fitko"), L10n.tr("Malé fitko"), L10n.tr("Doma")])
        XCTAssertEqual(Set(next.places.map(\.id)).count, 5)
        XCTAssertEqual(next.active, "place-1")
        let again = EquipmentView.seeded([mine, body], active: "place-1", all: [], firstTime: false, presetsFirstTime: false)
        XCTAssertEqual(again.places.count, 2, "deleted ones stay away")
    }

    func testRecognisingAgainShowsWhatComesAndGoes() {
        let change = AddGymSheet.changes(old: ["dumbbells", "cables", "floor_mats"], found: ["cables", "pullup_bar", "kettlebells"])
        XCTAssertEqual(change.added, ["kettlebells", "pullup_bar"])
        XCTAssertEqual(change.removed, ["dumbbells"], "the floor is always there, so it never goes")
        XCTAssertTrue(AddGymSheet.changes(old: ["cables"], found: ["cables", "floor_mats"]).added.isEmpty)
    }
}
