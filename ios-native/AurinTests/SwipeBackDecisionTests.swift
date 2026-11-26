import XCTest
@testable import Aurin

/// When a swipe from the left edge meant to go back (#1298): UIKit now and
/// then cancels a pop the finger finished, and SwipeBack then pops itself.
final class SwipeBackDecisionTests: XCTestCase {
    func testFinishedSwipe() {
        // The CI swipe UIKit cancelled: 272 pt of a 402 pt screen, still moving right.
        XCTAssertTrue(SwipeBack.finished(translation: 272, velocity: 423, width: 402))
        // A short flick right.
        XCTAssertTrue(SwipeBack.finished(translation: 80, velocity: 900, width: 402))
        // Short and slow, or pulled back to the left: it stays.
        XCTAssertFalse(SwipeBack.finished(translation: 120, velocity: 200, width: 402))
        XCTAssertFalse(SwipeBack.finished(translation: 300, velocity: -150, width: 402))
        XCTAssertFalse(SwipeBack.finished(translation: 300, velocity: 400, width: 0))
    }
}
