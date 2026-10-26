import XCTest
@testable import Aurin

/// The app's language before Settings → Jazyk is chosen: the phone's (L10n.defaultLanguage).
final class LanguageTests: XCTestCase {
    func testFirstLaunchFollowsThePhone() {
        XCTAssertEqual(L10n.defaultLanguage(for: ["en-US", "cs-CZ"]), "en")
        XCTAssertEqual(L10n.defaultLanguage(for: ["cs-CZ"]), "cs")
        XCTAssertEqual(L10n.defaultLanguage(for: ["sk-SK", "en"]), "cs")
        XCTAssertEqual(L10n.defaultLanguage(for: ["de-DE"]), "en")
        XCTAssertEqual(L10n.defaultLanguage(for: []), "en")
    }
}
