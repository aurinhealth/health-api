import AuthenticationServices
import XCTest
@testable import Aurin

/// Google sign-in comes back on https://<server>/auth/app/return (src/google-login.js),
/// which only an app with that host among its associated domains can catch.
@MainActor
final class GoogleSignInCallbackTests: XCTestCase {
    func testTheBrowserSheetClosesOnlyOnAurinsReturnAddress() throws {
        let callback = AuthService.callback(try XCTUnwrap(URL(string: "https://aurin.health")), path: AuthService.signInReturnPath, https: true)
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?error=cancelled"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "loadwise://auth?token=abc.def"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/google/callback?code=x"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://evil.example/auth/app/return?token=abc.def"))))
    }

    func testTheTestServerReturnsToItsOwnHostAndAnOlderServerToTheOldScheme() throws {
        let staging = AuthService.callback(try XCTUnwrap(URL(string: "https://staging.aurin.health")), path: AuthService.signInReturnPath, https: true)
        XCTAssertTrue(staging.matchesURL(try XCTUnwrap(URL(string: "https://staging.aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertFalse(staging.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
        let older = AuthService.callback(try XCTUnwrap(URL(string: "https://aurin.health")), path: AuthService.signInReturnPath, https: false)
        XCTAssertTrue(older.matchesURL(try XCTUnwrap(URL(string: "loadwise://auth?token=abc.def"))))
    }
}
