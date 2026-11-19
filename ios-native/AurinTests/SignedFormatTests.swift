import XCTest
@testable import Aurin

/// A change that rounds to nothing shows no sign: wrist temperature read
/// "−0.0 °C" for a night 0.04 °C below the usual (Tapwright 2026-11-19).
final class SignedFormatTests: XCTestCase {
    func testAChangeThatRoundsToZeroHasNoSign() {
        XCTAssertFalse(Fmt.signed(-0.04, digits: 1).hasPrefix("−"))
        XCTAssertFalse(Fmt.signed(0.04, digits: 1).hasPrefix("+"))
        XCTAssertFalse(Fmt.signed(-0.4).hasPrefix("−"))
    }

    func testARealChangeKeepsItsSign() {
        XCTAssertTrue(Fmt.signed(-0.06, digits: 1).hasPrefix("−"))
        XCTAssertTrue(Fmt.signed(0.3, digits: 1).hasPrefix("+"))
        XCTAssertTrue(Fmt.signed(-2).hasPrefix("−"))
    }
}
