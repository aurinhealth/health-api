import XCTest
@testable import Aurin

/// "Nahradit cvik" in Režim tréninku: the sets still to do take the new
/// exercise and its weight; drop sets stay lighter than the set before them.
final class GymSwapTests: XCTestCase {
    private func row(_ type: String, _ name: String, _ number: String, _ kg: String, done: Bool = false) -> [JSONValue] {
        [type, name, number, kg, type == "DROP" ? "max" : "12", "", "", "", done ? "TRUE" : "FALSE", "", "", "FALSE", "", "", type == "DROP" ? "D" : "M"].map { JSONValue.string($0) }
    }

    private func day(_ rows: [[JSONValue]]) -> GymDay {
        var head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow - 1)
        head.append(GymDay.columns.map { JSONValue.string($0) })
        return GymDay(date: "2026-11-01", values: head + rows, cancelled: nil)
    }

    func testDropSetsFollowTheNewWeight() {
        // Petr 2026-11-01: the plan's last exercise with two drop sets, swapped
        // for one estimated at 47,5 kg: the drops were 47,5 too, over the work sets.
        var d = day([row("WORK", "Cable fly", "1", "20"), row("WORK", "Cable fly", "2", "20"),
                     row("DROP", "Cable fly", "2", "16"), row("DROP", "Cable fly", "2", "12")])
        d.replace(exercise: "Cable fly", with: "Machine chest press", kg: "47.5")
        let sets = d.exercises[0].sets
        XCTAssertEqual(d.exercises.map(\.name), ["Machine chest press"])
        XCTAssertEqual(sets.filter(\.work).map(\.plannedKg), ["47.5", "47.5"])
        XCTAssertEqual(sets.filter(\.drop).map(\.plannedKg), ["38", "30.5"])
    }

    func testWarmUpsRampUpToTheNewWeight() {
        // Petr 2026-11-05: after a swap the three warm-ups showed 8, 5, 3 reps but no kg.
        var d = day([row("WARMUP", "Chest flat press Prime", "1", "15"), row("WARMUP", "Chest flat press Prime", "2", "22,5"),
                     row("WARMUP", "Chest flat press Prime", "3", "27,5"), row("WORK", "Chest flat press Prime", "1", "35")])
        d.replace(exercise: "Chest flat press Prime", with: "Barbell bench press", kg: "62.5")
        let sets = d.exercises[0].sets
        XCTAssertEqual(sets.filter(\.warmup).map(\.plannedKg), ["25", "40", "50"])
        XCTAssertEqual(sets.filter(\.work).map(\.plannedKg), ["62.5"])
        // A later exercise's single warm-up: 65 %.
        var e = day([row("WARMUP", "Lat pulldown", "1", "30"), row("WORK", "Lat pulldown", "1", "45")])
        e.replace(exercise: "Lat pulldown", with: "Barbell row", kg: "50")
        XCTAssertEqual(e.exercises[0].sets.filter(\.warmup).map(\.plannedKg), ["32,5"])
    }

    func testWithoutAnEstimateTheWeightsAreEmpty() {
        var d = day([row("WORK", "Cable fly", "1", "20"), row("DROP", "Cable fly", "1", "16")])
        d.replace(exercise: "Cable fly", with: "Machine chest press")
        XCTAssertEqual(d.exercises[0].sets.map { $0.plannedKg ?? "" }, ["", ""])
    }

    func testDoneSetsKeepTheirExercise() {
        var d = day([row("WORK", "Cable fly", "1", "20", done: true), row("WORK", "Cable fly", "2", "20"), row("DROP", "Cable fly", "2", "16")])
        d.replace(exercise: "Cable fly", with: "Machine chest press", kg: "40")
        XCTAssertEqual(d.exercises.map(\.name), ["Cable fly", "Machine chest press"])
        XCTAssertEqual(d.exercises[1].sets.map(\.plannedKg), ["40", "32"])
    }

    // "Vyměněno dnes" (competitor comparison point 10): one row per swap of the day.
    func testSwapsOfTheDayFollowTheChain() {
        var list = GymSwaps.adding([], from: "Barbell bench press", to: "Dumbbell bench press")
        list = GymSwaps.adding(list, from: "Dumbbell bench press", to: "Machine chest press")
        XCTAssertEqual(list.map { $0.from + ">" + $0.to }, ["Barbell bench press>Machine chest press"])
        list = GymSwaps.adding(list, from: "Lat pulldown", to: "Pull-up")
        XCTAssertEqual(list.count, 2)
        // Swapped back: nothing changed for that exercise.
        list = GymSwaps.adding(list, from: "Machine chest press", to: "Barbell bench press")
        XCTAssertEqual(list.map(\.from), ["Lat pulldown"])
        XCTAssertEqual(GymSwaps.adding(list, from: "Squat", to: "Squat"), list)
    }
}
