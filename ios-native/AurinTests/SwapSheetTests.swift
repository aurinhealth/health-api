import XCTest
@testable import Aurin

/// "Nahradit cvik": names as sentences and one short line under each.
final class SwapSheetTests: XCTestCase {
    private func alt(_ name: String, muscle: String? = "Rear delts", note: String?, station: String? = "Multi-station cables (5×)") -> GymAlternative {
        GymAlternative(name: name, muscle: muscle, sets: nil, reps: nil, note: note, station: station)
    }

    func testTitleCaseNamesReadAsSentences() {
        XCTAssertEqual(ExerciseCatalog.shownName("Cable Single Arm Rear Delt Row"), "Cable single arm rear delt row")
        XCTAssertEqual(ExerciseCatalog.shownName("Cable Bar Face Pull"), "Cable bar face pull")
        XCTAssertEqual(ExerciseCatalog.shownName("Single-Arm Cable Fly"), "Single-arm cable fly")
        XCTAssertEqual(ExerciseCatalog.shownName("Machine Cable V Bar Push Downs"), "Machine cable V bar push downs")
    }

    func testSentenceNamesStayAsTheyAre() {
        XCTAssertEqual(ExerciseCatalog.shownName("Face pull"), "Face pull")
        XCTAssertEqual(ExerciseCatalog.shownName("DB Romanian deadlift"), "DB Romanian deadlift")
        XCTAssertEqual(ExerciseCatalog.shownName("Prone leg curl Prime"), "Prone leg curl Prime")
        XCTAssertEqual(ExerciseCatalog.shownName("EZ bar curl"), "EZ bar curl")
    }

    func testShortLineLeavesOutTheMuscleAndTheKgHint() {
        XCTAssertEqual(AlternativesSheet.shortLine(alt("Cable Single Arm Rear Delt Row", note: "Rear delts; one-arm row with the elbow high and out, kg = cable stack weight")),
                       "One-arm row with the elbow high and out")
        XCTAssertEqual(AlternativesSheet.shortLine(alt("Face pull", note: "Rear delts and shoulder blades; rope on a cable")), "Rope on a cable")
    }

    func testShortLineFallsBackToTheStation() {
        XCTAssertEqual(AlternativesSheet.shortLine(alt("Cable curl", muscle: "Biceps", note: "Biceps; kg = cable stack weight")), "Multi-station cables")
        XCTAssertEqual(AlternativesSheet.shortLine(alt("Pec deck", muscle: "Chest", note: "", station: nil)), "Chest")
    }
}
