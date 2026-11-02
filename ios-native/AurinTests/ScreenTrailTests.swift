import XCTest
@testable import Aurin

/// "Nahlásit problém" sends the last three screens, by case name only.
@MainActor
final class ScreenTrailTests: XCTestCase {
    func testKeepsTheLastThreeWithoutValues() {
        ScreenTrail.visit(.today, nil)
        ScreenTrail.visit(.today, nil)
        ScreenTrail.visit(.training, .muscle("biceps"))
        ScreenTrail.visit("coach")
        ScreenTrail.visit(.health, .readiness)
        XCTAssertEqual(ScreenTrail.entries, ["training/muscle", "coach", "health/readiness"])
        XCTAssertEqual(ScreenTrail.caseName(.workoutLibrary("Ride")), "workoutLibrary")
    }
}
