import Vision
import XCTest
@testable import Aurin

/// Etiketa read on the iPhone (LabelReader): the table's values per 100 g
/// without AI, and only a whole table that adds up skips the AI.
final class LabelReaderTests: XCTestCase {
    func testCzechTableWithAPortionColumn() {
        let v = LabelValues(lines: [
            "Výživové údaje  na 100 g  na porci 30 g  %RHP*",
            "Energetická hodnota  1 554 kJ / 371 kcal  466 kJ / 111 kcal  6 %",
            "Tuky  12 g  3,6 g  5 %",
            "z toho nasycené mastné kyseliny  5,2 g  1,6 g",
            "Sacharidy  56 g  17 g",
            "z toho cukry  21 g  6,3 g",
            "Vláknina  4,1 g  1,2 g",
            "Bílkoviny  7,5 g  2,3 g",
            "Sůl  0,48 g  0,14 g"
        ])
        XCTAssertEqual(v.basis, "g")
        XCTAssertEqual(v.kcal, 371)
        XCTAssertEqual(v.fat, 12)
        XCTAssertEqual(v.carbs, 56)
        XCTAssertEqual(v.sugars, 21)
        XCTAssertEqual(v.fiber, 4.1)
        XCTAssertEqual(v.protein, 7.5)
        XCTAssertEqual(v.salt, 0.48)
        XCTAssertTrue(v.complete)
        let p = v.product
        XCTAssertEqual(p.source, "package_label")
        XCTAssertEqual(p.nutrition_basis, "g")
        XCTAssertEqual(p.calories_100g, 371)
    }

    /// Small packages print the table as one paragraph; Vision without Czech drops the accents.
    func testParagraphWithoutAccents() {
        let v = LabelValues(lines: [
            "Vyzivove udaje na 100 ml: energeticka hodnota 180 kJ/43 kcal, tuky 1,5 g, z toho nasycene",
            "mastne kyseliny 1,0 g, sacharidy 4,8 g, z toho cukry 4,8 g, bilkoviny 3,3 g, sul 0,1 g."
        ])
        XCTAssertEqual(v.basis, "ml")
        XCTAssertEqual(v.kcal, 43)
        XCTAssertEqual(v.fat, 1.5)
        XCTAssertEqual(v.carbs, 4.8)
        XCTAssertEqual(v.sugars, 4.8)
        XCTAssertEqual(v.protein, 3.3)
        XCTAssertEqual(v.salt, 0.1)
        XCTAssertTrue(v.complete)
        XCTAssertEqual(v.product.nutrition_basis, "ml")
    }

    func testOnlyKilojoulesAndGerman() {
        let v = LabelValues(lines: ["Nährwerte pro 100 g", "Brennwert 2 100 kJ", "Fett 30 g", "davon gesättigte Fettsäuren 18 g",
                                    "Kohlenhydrate 55 g", "davon Zucker 50 g", "Eiweiß 6,5 g", "Salz 0,2 g"])
        XCTAssertEqual(v.kcal, 502)
        XCTAssertEqual(v.fat, 30)
        XCTAssertEqual(v.sugars, 50)
        XCTAssertEqual(v.protein, 6.5)
        XCTAssertTrue(v.complete)
    }

    /// Per serving on a US label, turned per 100 g; "Saturated Fat" isn't the fat.
    func testUSLabelPerServing() {
        let v = LabelValues(lines: ["Nutrition Facts", "Serving size 2/3 cup (55g)", "Calories 230", "Total Fat 8g 10%",
                                    "Saturated Fat 1g 5%", "Trans Fat 0g", "Sodium 160mg 7%", "Total Carbohydrate 37g 13%",
                                    "Dietary Fiber 4g 14%", "Total Sugars 12g", "Protein 3g"])
        XCTAssertEqual(v.serving, 55)
        XCTAssertEqual(v.basis, "g")
        XCTAssertEqual(v.kcal ?? 0, 418.2, accuracy: 0.1)
        XCTAssertEqual(v.fat ?? 0, 14.5, accuracy: 0.1)
        XCTAssertEqual(v.carbs ?? 0, 67.3, accuracy: 0.1)
        XCTAssertEqual(v.salt ?? 0, 0.727, accuracy: 0.001)
        XCTAssertTrue(v.complete)
        XCTAssertEqual(v.product.serving_size, .string("55 g"))
    }

    /// A product name with a nutrient word before the table isn't its value.
    func testNameBeforeTheTable() {
        let v = LabelValues(lines: ["Protein pudding 200 g", "na 100 g", "Energie 340 kJ / 81 kcal", "Tuky 1,6 g", "Sacharidy 6,4 g", "Bílkoviny 10 g"])
        XCTAssertEqual(v.protein, 10)
        XCTAssertTrue(v.complete)
    }

    /// A missed value or a misread digit goes to AI (or to the user to fill in).
    func testIncompleteOrNotAddingUp() {
        let missing = LabelValues(lines: ["na 100 g", "Energie 371 kcal", "Tuky 12 g", "Sacharidy 56 g"])
        XCTAssertFalse(missing.complete)
        XCTAssertTrue(missing.found)
        XCTAssertNil(missing.product.protein_100g)
        let misread = LabelValues(lines: ["na 100 g", "Energie 371 kcal", "Tuky 12 g", "Sacharidy 56 g", "Bílkoviny 75 g"])
        XCTAssertFalse(misread.complete)
        XCTAssertNotNil(misread.warning)
        // No "per 100 g": the numbers could be for a portion.
        let noBasis = LabelValues(lines: ["Energie 371 kcal", "Tuky 12 g", "Sacharidy 56 g", "Bílkoviny 7,5 g"])
        XCTAssertFalse(noBasis.complete)
        XCTAssertFalse(noBasis.found)
    }

    func testRowsFromBoxes() {
        // Vision's boxes start at the bottom left: the higher row comes first.
        let rows = LabelReader.rows([
            (CGRect(x: 0.6, y: 0.70, width: 0.2, height: 0.05), "12 g"),
            (CGRect(x: 0.1, y: 0.80, width: 0.3, height: 0.05), "Energie"),
            (CGRect(x: 0.1, y: 0.71, width: 0.2, height: 0.05), "Tuky"),
            (CGRect(x: 0.6, y: 0.81, width: 0.3, height: 0.05), "371 kcal")
        ])
        XCTAssertEqual(rows, ["Energie  371 kcal", "Tuky  12 g"])
    }

    /// The whole way on the simulator: a table drawn as a photo, read by Vision.
    func testVisionReadsADrawnLabel() throws {
        // In the CI log: whether this iOS reads Czech itself.
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        print("Vision text languages:", ((try? request.supportedRecognitionLanguages()) ?? []).joined(separator: ", "))
        let rows = ["Výživové údaje na 100 g", "Energetická hodnota 1554 kJ / 371 kcal", "Tuky 12 g",
                    "z toho nasycené mastné kyseliny 5,2 g", "Sacharidy 56 g", "z toho cukry 21 g", "Bílkoviny 7,5 g", "Sůl 0,48 g"]
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 900), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1200, height: 900))
            let attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 52), .foregroundColor: UIColor.black]
            for (i, row) in rows.enumerated() { (row as NSString).draw(at: CGPoint(x: 40, y: 40 + CGFloat(i) * 105), withAttributes: attributes) }
        }
        let jpeg = try XCTUnwrap(image.jpegData(compressionQuality: 0.9))
        let lines: [String]
        do {
            lines = try LabelReader.textLines(jpeg)
        } catch {
            throw XCTSkip("Vision text recognition doesn't run on this simulator: \(error)")
        }
        print("Vision read:", lines)
        let v = LabelValues(lines: lines)
        XCTAssertEqual(v.kcal, 371)
        XCTAssertEqual(v.fat, 12)
        XCTAssertEqual(v.carbs, 56)
        XCTAssertEqual(v.protein, 7.5)
        XCTAssertEqual(v.salt, 0.48)
        XCTAssertTrue(v.complete)
    }
}

