import XCTest
@testable import Loadwise

/// Trénink → Svaly: the coarse "when rested" text and the sample data.
final class MuscleTests: XCTestCase {
    private func muscle(_ state: String, _ ready: String?, estimated: Bool = false) -> MuscleFatigue.Muscle {
        MuscleFatigue.Muscle(id: "quads", label: "Přední stehna", state: state, level: 0.5, hours: 10, readyDate: ready, estimated: estimated)
    }

    func testReadyTextIsCoarse() {
        let today = "2026-10-08"
        XCTAssertEqual(muscle("rested", nil).readyText(today: today), L10n.tr("odpočaté"))
        XCTAssertEqual(muscle("recovering", "2026-10-08").readyText(today: today), L10n.tr("dnes"))
        XCTAssertEqual(muscle("fatigued", "2026-10-09").readyText(today: today), L10n.tr("zítra"))
        XCTAssertEqual(muscle("fatigued", "2026-10-10").readyText(today: today), L10n.tr("pozítří"))
        XCTAssertEqual(muscle("fatigued", "2026-10-11").readyText(today: today), L10n.f("za %@ dny", "3"))
        XCTAssertEqual(muscle("fatigued", "2026-10-13", estimated: true).readyText(today: today), "≈ " + L10n.f("za %@ dní", "5"))
    }

    func testSampleShowsTheMostTiredFirst() {
        let sample = DemoData.muscles
        XCTAssertEqual(sample.tired.prefix(3).map(\.id), ["glutes", "hamstrings", "quads"])
        XCTAssertEqual(sample.recent?.first?.title, "Běh 14 km")
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/muscles")!), .muscles)
    }
}
