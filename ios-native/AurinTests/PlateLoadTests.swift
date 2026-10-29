import XCTest
@testable import Aurin

/// Režim tréninku: a barbell's weight as plates on each side, and back.
final class PlateLoadTests: XCTestCase {
    func testWeightToPlates() {
        XCTAssertEqual(PlateLoad.plates(for: 80, bar: 20), [25, 5])
        XCTAssertEqual(PlateLoad.plates(for: 85, bar: 20), [25, 5, 2.5])
        XCTAssertEqual(PlateLoad.plates(for: 42.5, bar: 20), [10, 1.25])
        XCTAssertEqual(PlateLoad.plates(for: 60, bar: 15), [20, 2.5])
        XCTAssertEqual(PlateLoad.plates(for: 50, bar: 0), [25])
    }

    func testEmptyOrLighterThanTheBar() {
        XCTAssertEqual(PlateLoad.plates(for: 20, bar: 20), [])
        XCTAssertEqual(PlateLoad.plates(for: 12, bar: 20), [])
    }

    func testAWeightThePlatesCantMakeLoadsTheNearestBelow() {
        let plates = PlateLoad.plates(for: 81, bar: 20)
        XCTAssertEqual(plates, [25, 5])
        XCTAssertEqual(PlateLoad.total(plates, bar: 20), 80)
    }

    func testTotalCountsBothSidesAndTheBar() {
        XCTAssertEqual(PlateLoad.total([25, 5, 2.5], bar: 20), 85)
        XCTAssertEqual(PlateLoad.total([], bar: 20), 20)
        XCTAssertEqual(PlateLoad.total([10], bar: 0), 20)
    }

    func testAddedPlatesStayHeaviestFirstAndFitTheSleeve() {
        XCTAssertEqual(PlateLoad.adding(25, to: [10, 5]), [25, 10, 5])
        XCTAssertEqual(PlateLoad.adding(2.5, to: [25, 5]), [25, 5, 2.5])
        let full = Array(repeating: 25.0, count: PlateLoad.maxPerSide)
        XCTAssertEqual(PlateLoad.adding(5, to: full), full)
        XCTAssertEqual(PlateLoad.plates(for: 1000, bar: 20).count, PlateLoad.maxPerSide)
    }

    func testPoundPlatesOnAPoundBar() {
        XCTAssertEqual(PlateLoad.plates(for: 225, bar: 45, sizes: PlateLoad.lbSizes), [45, 45])
        XCTAssertEqual(PlateLoad.plates(for: 235, bar: 45, sizes: PlateLoad.lbSizes), [45, 45, 5])
        XCTAssertEqual(PlateLoad.plates(for: 135, bar: 45, sizes: PlateLoad.lbSizes), [45])
        XCTAssertEqual(PlateLoad.plates(for: 100, bar: 0, sizes: PlateLoad.lbSizes), [45, 5])
    }

    func testPerSideOnlyWhenThePlatesMakeTheWeight() {
        XCTAssertEqual(PlateLoad.perSide(80, bar: 20), "25 + 5")
        XCTAssertEqual(PlateLoad.perSide(25, bar: 10), "5 + 2.5".replacingOccurrences(of: ".", with: Fmt.locale.decimalSeparator ?? "."))
        XCTAssertNil(PlateLoad.perSide(81, bar: 20))
        XCTAssertNil(PlateLoad.perSide(20, bar: 20))
        XCTAssertEqual(PlateLoad.perSide(225, bar: 45, sizes: PlateLoad.lbSizes), "45 + 45")
    }

    func testTheUsualBarComesFromTheStations() {
        XCTAssertEqual(PlateBar.usual(["ez_bar"]), .ez)
        XCTAssertEqual(PlateBar.usual(["preacher_bench", "ez_bar"]), .ez)
        XCTAssertEqual(PlateBar.usual(["trap_bar"]), .trap)
        XCTAssertEqual(PlateBar.usual(["smith_machine"]), .smith)
        XCTAssertEqual(PlateBar.usual(["pivot_leg_press"]), .machine)
        XCTAssertNil(PlateBar.usual(["dumbbells", "adjustable_bench"]))
        XCTAssertNil(PlateBar.usual(["cables"]))
        XCTAssertEqual(PlateBar.machine.weight, 0)
        XCTAssertEqual(PlateBar.ez.weight, 10)
    }

    func testAChosenBarIsKeptForItsExercise() {
        for bar in [PlateBar.barbell, .womens, .ez, .trap, .smith, .none, .machine, .custom(12.5)] {
            XCTAssertEqual(PlateBar(id: bar.id), bar)
        }
        XCTAssertNil(PlateBar(id: "custom:x"))
        let name = "Test lift \(UUID().uuidString)"
        XCTAssertNil(PlateBar.saved(name))
        PlateBar.save(.ez, for: name)
        XCTAssertEqual(PlateBar.saved(name), .ez)
    }
}
