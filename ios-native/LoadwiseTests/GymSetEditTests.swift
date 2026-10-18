import XCTest
@testable import Loadwise

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
        // A set done stays.
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises[0].sets.count, 3)
    }

    func testDeletingBySidesTakesBothRows() {
        var d = day([row("WORK", "Lunge", "1", "10", side: "L"), row("WORK", "Lunge", "1", "10", side: "P"),
                     row("WORK", "Lunge", "2", "10", side: "L"), row("WORK", "Lunge", "2", "10", side: "P")])
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises[0].sets.map(\.number), ["1", "1"])
        XCTAssertEqual(d.exercises[0].sets.map(\.side), ["L", "P"])
    }

    func testTheLastSetGoneTakesTheExercise() {
        var d = day([row("WORK", "Curl", "1", "10"), row("WORK", "Row", "1", "40")])
        d.deleteSet(row: d.exercises[0].sets[0].row)
        XCTAssertEqual(d.exercises.map(\.name), ["Row"])
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
}
