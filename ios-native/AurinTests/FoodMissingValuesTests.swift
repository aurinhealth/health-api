import XCTest
@testable import Aurin

/// A food with values left out (a cropped label, AI) says what counts as 0 g,
/// and an AI estimate stays marked once saved as the user's own food.
final class FoodMissingValuesTests: XCTestCase {
    override func tearDown() {
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
    }

    func testMissingMacrosAreNamed() {
        L10n.setLanguage("cs")
        var food = FoodProduct(name: "Jogurt", calories_100g: 60, protein_100g: nil, carbs_100g: 4, fat_100g: nil)
        XCTAssertEqual(food.missingMacros, ["bílkoviny", "tuky"])
        XCTAssertEqual(Self.plain(MissingMacrosLine.text(food.missingMacros)), "Chybí bílkoviny a tuky, počítají se jako 0 g.")
        L10n.setLanguage("en")
        XCTAssertEqual(Self.plain(MissingMacrosLine.text(food.missingMacros)), "Missing protein and fat: counted as 0 g.")
        food.protein_100g = 3.5
        food.fat_100g = 0
        XCTAssertTrue(food.missingMacros.isEmpty)
    }

    /// Czech ListFormatter joins with "a" and a no-break space (and may add
    /// invisible marks): the test reads the text as a person sees it.
    static func plain(_ text: String) -> String {
        text.unicodeScalars.filter { $0.properties.generalCategory != .format }
            .map { CharacterSet.whitespaces.contains($0) ? " " : String($0) }.joined()
    }

    func testEstimateKeepsItsMarkAndSaltCountsAsAValue() {
        var own = FoodProduct(name: "Rizoto", calories_100g: 650, nutrition_basis: "portion", source: "personal")
        XCTAssertFalse(own.isEstimate)
        own.origin = "ai-estimate"
        XCTAssertTrue(own.isEstimate)
        var label = FoodProduct(name: "Sušenky", calories_100g: 480, protein_100g: 6, carbs_100g: 64, fat_100g: 21, source: "package_label")
        let before = label.values
        label.salt_100g = 0.8
        XCTAssertNotEqual(label.values, before)
    }
}
