import XCTest
@testable import Aurin

/// The warm-up and stretching length in Settings: far left fits the workout,
/// then any minute from 5 to 30 (the server keeps only 5–30).
final class GymRoutineLengthTests: XCTestCase {
    func testFarLeftFitsTheWorkout() {
        XCTAssertEqual(RoutineLengthSlider.minutes(4), 0)
        XCTAssertEqual(RoutineLengthSlider.minutes(4.4), 0)
    }

    func testAnyMinuteFromFiveToThirty() {
        XCTAssertEqual(RoutineLengthSlider.minutes(5), 5)
        XCTAssertEqual(RoutineLengthSlider.minutes(12), 12)
        XCTAssertEqual(RoutineLengthSlider.minutes(30), 30)
        XCTAssertEqual(RoutineLengthSlider.minutes(31), 30)
    }
}
