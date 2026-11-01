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
}
