import XCTest
@testable import Aurin

/// A machine in pounds in a gym in kilos (LiftUnits): the pounds typed in show
/// back as typed, the plan's kilos to the nearest 5 lb, and the sheet keeps kilos.
final class GymPoundsTests: XCTestCase {
    func testPoundsTypedComeBackAsTyped() throws {
        for pounds in [45, 55, 65, 70, 72.5, 75, 80, 85, 95, 100, 105, 115, 125, 135, 150, 220] {
            let kg = LiftWeight.kgText(String(pounds), machineLb: true)
            let back = try XCTUnwrap(LiftWeight.number(kg))
            XCTAssertEqual(LiftWeight.machinePounds(back), pounds, "\(pounds) lb as \(kg) kg")
        }
        XCTAssertEqual(LiftWeight.kgText("70", machineLb: true), "31.75")
    }

    func testThePlanShowsInTheMachinesSteps() {
        // Petr's rear delt pec deck: 35 kg planned (77.2 lb), drops 25.5 and 20.5 kg.
        XCTAssertEqual(LiftWeight.machinePounds(35), 75)
        XCTAssertEqual(LiftWeight.machinePounds(25.5), 55)
        XCTAssertEqual(LiftWeight.machinePounds(20.5), 45)
        // A set done in kilos before: 31.7 kg is 70 lb.
        XCTAssertEqual(LiftWeight.machinePounds(31.7), 70)
        XCTAssertEqual(LiftWeight.unit(machineLb: true), "lb")
    }

    func testTheChoiceIsKeptPerExercise() throws {
        try XCTSkipIf(Units.imperial, "with imperial units every exercise is in pounds already")
        let name = "Rear delt pec deck (test)"
        defer { LiftUnits.set(name, pounds: false) }
        XCTAssertFalse(LiftUnits.pounds(name))
        LiftUnits.set(name, pounds: true)
        XCTAssertTrue(LiftUnits.pounds(name))
        XCTAssertFalse(LiftUnits.pounds("Leg press"))
        LiftUnits.set(name, pounds: false)
        XCTAssertFalse(LiftUnits.all.contains(name))
    }
}
