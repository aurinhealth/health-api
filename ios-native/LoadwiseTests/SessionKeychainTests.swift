import XCTest
@testable import Loadwise

/// The sign-in goes to the Keychain; the cookie storage keeps only a copy that never reaches the disk.
final class SessionKeychainTests: XCTestCase {
    private let host = "keychain-test.aurin.health"

    override func tearDown() {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] where cookie.domain == host { HTTPCookieStorage.shared.deleteCookie(cookie) }
        SessionKeychain.delete(host)
        super.tearDown()
    }

    func testAFreshCookieMovesToTheKeychain() throws {
        SessionKeychain.start()
        let expires = Date().addingTimeInterval(30 * 86400)
        let cookie = try XCTUnwrap(HTTPCookie(properties: [.name: APIClient.sessionCookie, .value: "abc.sig", .domain: host, .path: "/", .secure: "TRUE", .expires: expires]))
        HTTPCookieStorage.shared.setCookie(cookie)
        // The storage tells of the change on its own time.
        let deadline = Date().addingTimeInterval(3)
        while !SessionKeychain.has(host) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        let stored = (HTTPCookieStorage.shared.cookies ?? []).filter { $0.domain == host && $0.name == APIClient.sessionCookie }
        XCTAssertEqual(stored.map(\.value), ["abc.sig"])
        XCTAssertNil(stored.first?.expiresDate, "the copy in storage has no expiry date, so iOS keeps it in memory only")
        XCTAssertTrue(SessionKeychain.has(host))
        XCTAssertEqual(try XCTUnwrap(SessionKeychain.expires(host)).timeIntervalSince1970, expires.timeIntervalSince1970, accuracy: 1)
        SessionKeychain.delete(host)
        XCTAssertFalse(SessionKeychain.has(host))
    }
}
