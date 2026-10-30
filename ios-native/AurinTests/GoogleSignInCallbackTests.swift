import AuthenticationServices
import XCTest
@testable import Aurin

/// Google sign-in comes back on https://aurin.health/auth/app/return (src/google-login.js),
/// which only an app with aurin.health among its associated domains can catch.
@MainActor
final class GoogleSignInCallbackTests: XCTestCase {
    func testTheBrowserSheetClosesOnlyOnAurinsReturnAddress() throws {
        let callback = AuthService.signInCallback
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?error=cancelled"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "aurin://auth?token=abc.def"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/google/callback?code=x"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://evil.example/auth/app/return?token=abc.def"))))
    }
}
