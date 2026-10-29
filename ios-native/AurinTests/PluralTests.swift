import XCTest
@testable import Aurin

/// A count's word takes its form from Plurals.stringsdict (L10n.plural): Czech
/// 1 den, 2 dny, 5 dní; English 1 day, 2 days.
final class PluralTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        super.tearDown()
    }

    func testCzechForms() {
        L10n.setLanguage("cs")
        XCTAssertEqual(L10n.plural("%lld dní", 1), "1 den")
        XCTAssertEqual(L10n.plural("%lld dní", 2), "2 dny")
        XCTAssertEqual(L10n.plural("%lld dní", 4), "4 dny")
        XCTAssertEqual(L10n.plural("%lld dní", 5), "5 dní")
        XCTAssertEqual(L10n.plural("%lld dní", 0), "0 dní")
        XCTAssertEqual(L10n.plural("%lld dní", 22), "22 dní")
        XCTAssertEqual(L10n.plural("dní", 3), "dny")
        XCTAssertEqual(L10n.plural("Zbývá %lld sérií", 3), "Zbývají 3 série")
        XCTAssertEqual(L10n.plural("%lld položek", 1), "1 položku")
        XCTAssertEqual(L10n.plural("%lld z %lld sérií", 2, 3), "2 z 3 sérií")
        XCTAssertEqual(L10n.plural("%lld/%lld sérií · %lld cviků", 2, 7, 3), "2/7 sérií · 3 cviky")
        XCTAssertEqual(L10n.plural("%lld týdnů od %@", 1, "28. prosince"), "1 týden od 28. prosince")
        XCTAssertEqual(L10n.plural("%@ bodů připravenosti", "−8", 8), "−8 bodů připravenosti")
        XCTAssertEqual(L10n.plural("%@ kroků", "8 432", 8432), "8 432 kroků")
        XCTAssertEqual(L10n.plural("%@ · %lld nových cviků", "Lavice", 2), "Lavice · 2 nové cviky")
    }

    func testEnglishForms() {
        L10n.setLanguage("en")
        XCTAssertEqual(L10n.plural("%lld dní", 1), "1 day")
        XCTAssertEqual(L10n.plural("%lld dní", 2), "2 days")
        XCTAssertEqual(L10n.plural("%lld dní", 0), "0 days")
        XCTAssertEqual(L10n.plural("dní", 1), "day")
        XCTAssertEqual(L10n.plural("%lld sérií", 1), "1 set")
        XCTAssertEqual(L10n.plural("Zbývá %lld sérií", 3), "3 sets left")
        XCTAssertEqual(L10n.plural("%lld z %lld sérií", 2, 7), "2 of 7 sets")
        XCTAssertEqual(L10n.plural("%lld/%lld sérií · %lld cviků", 2, 1, 1), "2/1 set · 1 exercise")
        XCTAssertEqual(L10n.plural("%@ %% za %lld týdnů", "+5", 4), "+5% in 4 weeks")
        XCTAssertEqual(L10n.plural("%@ bodů připravenosti", "+1", 1), "+1 readiness point")
    }

    /// Both languages have every key, each count with a plural rule and its one and other forms.
    func testBothLanguagesHaveEveryKey() throws {
        func table(_ language: String) throws -> [String: [String: Any]] {
            let path = try XCTUnwrap(Bundle(for: AppModel.self).path(forResource: language, ofType: "lproj"))
            return try XCTUnwrap(NSDictionary(contentsOfFile: path + "/Plurals.stringsdict") as? [String: [String: Any]])
        }
        let cs = try table("cs"), en = try table("en")
        XCTAssertGreaterThan(cs.count, 40)
        XCTAssertEqual(Set(cs.keys), Set(en.keys))
        for (key, entry) in Array(cs) + Array(en) {
            let counts = entry.values.compactMap { $0 as? [String: String] }
            XCTAssertFalse(counts.isEmpty, key)
            for forms in counts {
                XCTAssertEqual(forms["NSStringFormatSpecTypeKey"], "NSStringPluralRuleType", key)
                XCTAssertNotNil(forms["one"], key)
                XCTAssertNotNil(forms["other"], key)
            }
        }
    }
}
