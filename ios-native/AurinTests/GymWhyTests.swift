import XCTest
@testable import Aurin

/// The gym plan's note as short reasons (GymWhyCard.swift): the generator's sentences
/// get a title, the time plan and the sentence about other sports go, the rest stays.
final class GymWhyTests: XCTestCase {
    func testEnglishNoteBecomesThreeReasons() {
        let note = "Goal from your sport – strength and muscle: heavier main lifts, accessories in the middle range. As you asked, I'm sparing your legs and focusing on the upper body; exercises are chosen by freshness and recent muscle load. Load from other sports adjusts the dose for the muscles involved; it doesn't replace their strength training. The exercises differ from the plan for Thu 29 Oct. Time plan: about 74 of 75 minutes including warm-up, rests, machine setup and a buffer. On top: warm-up 3 min and stretching 5 min."
        let reasons = GymWhy.reasons(note)
        XCTAssertEqual(reasons.map(\.symbol), ["target", "figure.strengthtraining.traditional", "arrow.triangle.2.circlepath"])
        XCTAssertTrue(reasons[0].detail.hasPrefix("Strength and muscle"))
        XCTAssertEqual(reasons[1].detail, "As you asked, I'm sparing your legs and focusing on the upper body")
        XCTAssertTrue(reasons[2].detail.hasSuffix("Thu 29 Oct"))
    }

    func testCzechNoteKeepsDatesWholeAndUnknownSentences() {
        let note = "Zvolené partie: Hrudník, Záda. Cíl síla: těžší hlavní cviky. Podle toho, co si trenér pamatuje o bolesti (rameno), vynechávám cviky, které ji zatěžují. Cviky se liší od plánu na čt 29. 10. Ráno byl běh, dřep jen středně. Časový plán: přibližně 44 z 45 minut včetně rozcvičení, pauz, nastavování strojů a rezervy."
        let reasons = GymWhy.reasons(note)
        XCTAssertEqual(reasons.map(\.symbol), ["target", "bandage", "arrow.triangle.2.circlepath", "info.circle"])
        XCTAssertEqual(reasons[0].detail, "Síla")
        XCTAssertTrue(reasons[2].detail.hasSuffix("čt 29. 10"))
        XCTAssertNil(reasons[3].title)
        XCTAssertEqual(reasons[3].detail, "Ráno byl běh, dřep jen středně")
    }

    func testNoNoteNoReasons() {
        XCTAssertTrue(GymWhy.reasons(nil).isEmpty)
        XCTAssertTrue(GymWhy.reasons("Time plan: about 40 of 45 minutes.").isEmpty)
    }
}
