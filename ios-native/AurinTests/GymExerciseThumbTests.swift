import XCTest
@testable import Aurin

/// A thumb that changes changes the exercise, so the Exercises page redraws.
final class GymExerciseThumbTests: XCTestCase {
    private func exercise(_ liked: Bool?) -> GymCatalogExercise {
        var ex = GymCatalogExercise(name: "Standing calf raise", muscle: "Calves", sets: nil, reps: nil, note: nil, station: nil, stations: nil, muscles: nil)
        ex.liked = liked
        return ex
    }

    func testThumbChangeIsAChange() {
        XCTAssertNotEqual(exercise(true), exercise(nil))
        XCTAssertNotEqual(exercise(true), exercise(false))
        XCTAssertNotEqual([exercise(true)], [exercise(nil)])
        XCTAssertEqual(exercise(true), exercise(true))
    }

    func testSameNameSameHash() {
        XCTAssertEqual(exercise(true).hashValue, exercise(nil).hashValue)
    }
}
