import XCTest
@testable import Aurin

/// Training's workout card (redesign T, card A): warm-up, the main part named by
/// its hardest work with its target, cool-down; a swim's metres.
@MainActor
final class WorkoutCardPartsTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        super.tearDown()
    }

    private func blocks(_ json: String) throws -> [PlannedWorkout.Block] {
        try JSONDecoder().decode([PlannedWorkout.Block].self, from: Data(json.utf8))
    }

    func testRideThresholdIntervals() throws {
        let b = try blocks("""
        [{"steps":[{"durationSeconds":600,"percentLow":50,"percentHigh":60,"intensity":"warmup"}]},
         {"repeats":3,"steps":[{"durationSeconds":480,"percentLow":95,"percentHigh":100,"wattsLow":238,"wattsHigh":250,"intensity":"interval"},
                               {"durationSeconds":240,"percentLow":50,"percentHigh":55,"intensity":"recovery"}]},
         {"steps":[{"durationSeconds":600,"percentLow":45,"percentHigh":55,"intensity":"cooldown"}]}]
        """)
        L10n.setLanguage("en")
        let parts = WorkoutCardParts.endurance(b, sport: "ride")
        XCTAssertEqual(parts.map(\.name), ["Warm-up", "Threshold", "Cool-down"])
        XCTAssertEqual(parts.map(\.minutes), [10, 36, 10])
        XCTAssertEqual(parts[1].target, "238–250 W")
        XCTAssertNil(parts[0].target)
        XCTAssertEqual(WorkoutCardParts.workMinutes(b, sport: "ride"), 24)
    }

    func testSwimMetres() throws {
        let b = try blocks("""
        [{"repeats":4,"steps":[{"meters":100,"paceFast":100,"paceSlow":105,"intensity":"interval"},{"durationSeconds":20,"rest":true}]}]
        """)
        XCTAssertEqual(WorkoutCardParts.meters(b), 400)
        XCTAssertEqual(WorkoutCardParts.target(b[0].steps![0], sport: "swim"), "1:40–1:45 /100 m")
    }

    func testEmptyStepsGiveNoParts() {
        XCTAssertTrue(WorkoutCardParts.endurance([], sport: "run").isEmpty)
    }
}
