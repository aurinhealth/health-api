import AuthenticationServices
import XCTest
@testable import Aurin

/// Google sign-in comes back on https://<server>/auth/app/return (src/google-login.js),
/// which only an app with that host among its associated domains can catch.
@MainActor
final class GoogleSignInCallbackTests: XCTestCase {
    func testTheBrowserSheetClosesOnlyOnAurinsReturnAddress() throws {
        let callback = try AuthService.callback(XCTUnwrap(URL(string: "https://aurin.health")), path: AuthService.signInReturnPath)
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?error=cancelled"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "aurin://auth?token=abc.def"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/google/callback?code=x"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://evil.example/auth/app/return?token=abc.def"))))
    }

    func testTheTestServerReturnsToItsOwnHost() throws {
        let staging = try AuthService.callback(XCTUnwrap(URL(string: "https://staging.aurin.health")), path: AuthService.signInReturnPath)
        XCTAssertTrue(staging.matchesURL(try XCTUnwrap(URL(string: "https://staging.aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertFalse(staging.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
        XCTAssertFalse(staging.matchesURL(try XCTUnwrap(URL(string: "loadwise://auth?token=abc.def"))))
    }

    func testConnectingAServiceClosesOnTheConnectedAddress() throws {
        let callback = try AuthService.callback(XCTUnwrap(URL(string: "https://aurin.health")), path: AuthService.connectedPath)
        XCTAssertTrue(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/connected?event=whoop"))))
        XCTAssertFalse(callback.matchesURL(try XCTUnwrap(URL(string: "https://aurin.health/auth/app/return?token=abc.def"))))
    }
}
