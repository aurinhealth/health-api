import XCTest
@testable import Aurin

/// Trénink → Svaly: the coarse "when rested" text and the sample data.
final class MuscleTests: XCTestCase {
    private func muscle(_ state: String, _ ready: String?, estimated: Bool = false) -> MuscleFatigue.Muscle {
        MuscleFatigue.Muscle(id: "quads", label: "Přední stehna", state: state, level: 0.5, hours: 10, readyDate: ready, estimated: estimated, from: nil)
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
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/muscles")!), .muscles)
        XCTAssertEqual(sample.muscles?.first { $0.id == "glutes" }?.from?.first?.sets, 4)
        XCTAssertNil(sample.figureColors["biceps"])
        XCTAssertNotNil(sample.figureColors["glutes"])
    }

    /// Where muscles are picked, the shoulder's three parts are one Ramena.
    func testShouldersAreOneChoice() {
        XCTAssertTrue(BodyFigure.choices.contains("shoulders"))
        XCTAssertEqual(BodyFigure.choices.count, BodyFigure.muscles.count - 2)
        for id in BodyFigure.shoulders {
            XCTAssertFalse(BodyFigure.choices.contains(id), id)
            XCTAssertEqual(BodyFigure.choice(id), "shoulders")
        }
        XCTAssertEqual(BodyFigure.ids("shoulders"), BodyFigure.shoulders)
        XCTAssertEqual(BodyFigure.ids("chest"), ["chest"])
        XCTAssertEqual(BodyFigure.choiceCount(["front_delts", "side_delts", "rear_delts", "chest"]), 2)
        XCTAssertEqual(BodyFigure.name("shoulders"), "Ramena")
    }

    func testRestedFocusLeavesTheTiredOut() {
        let sample = DemoData.muscles
        let focus = sample.restedFocus
        XCTAssertFalse(focus.isEmpty)
        XCTAssertLessThanOrEqual(focus.count, 5, "the server takes 1 to 5 muscles")
        XCTAssertEqual(Set(focus).count, focus.count)
        for id in focus {
            // Rested, or rested later today as the rings count it (the sample's chest and back).
            XCTAssertTrue(sample.ready(body: id), id)
            XCTAssertTrue(BodyFigure.muscles.contains { $0.id == id }, id)
        }
        XCTAssertFalse(focus.contains("hips"), "the glutes are tired in the sample")
    }

    func testRestedFocusNeedsABigMuscle() throws {
        let others: [String] = ["back", "shoulders", "rear_delts", "side_delts", "biceps", "triceps", "quads", "hamstrings",
                                "glutes", "adductors", "abductors", "calves", "core", "lower_back", "traps"]
        // Every muscle tired except the forearms (rested) and the chest as given.
        func fatigue(chest: String, chestReady: String) throws -> MuscleFatigue {
            var rows: [String] = others.map { id in "{\"id\":\"\(id)\",\"label\":\"\(id)\",\"state\":\"fatigued\",\"readyDate\":\"2026-11-11\"}" }
            rows.append("{\"id\":\"chest\",\"label\":\"chest\",\"state\":\"\(chest)\",\"readyDate\":\"\(chestReady)\"}")
            rows.append("{\"id\":\"forearms\",\"label\":\"forearms\",\"state\":\"rested\",\"readyDate\":null}")
            let json: String = "{\"date\":\"2026-11-09\",\"muscles\":[" + rows.joined(separator: ",") + "]}"
            return try JSONDecoder().decode(MuscleFatigue.self, from: Data(json.utf8))
        }
        // Only the forearms rested: no workout of them alone.
        XCTAssertEqual(try fatigue(chest: "fatigued", chestReady: "2026-11-11").restedFocus, [])
        // The chest rested later today counts, as on the rings.
        XCTAssertEqual(Set(try fatigue(chest: "recovering", chestReady: "2026-11-09").restedFocus), ["chest", "forearms"])
        // Recovering until tomorrow does not.
        XCTAssertEqual(try fatigue(chest: "recovering", chestReady: "2026-11-10").restedFocus, [])
        // No big muscle rested: the short session takes the smaller rested ones.
        XCTAssertEqual(try fatigue(chest: "fatigued", chestReady: "2026-11-11").shortFocus, ["forearms"])
        // With a big muscle rested there is no short session, Rested builds it.
        XCTAssertEqual(try fatigue(chest: "recovering", chestReady: "2026-11-09").shortFocus, [])
    }

    func testFigurePathsStayInTheFigure() {
        for part in MuscleFigure.front + MuscleFigure.back + [(id: "skin", path: MuscleFigure.skin)] {
            let box = SVGPath.parse(part.path).boundingRect
            XCTAssertFalse(box.isEmpty, part.id)
            XCTAssertLessThanOrEqual(box.maxX, 100.5, part.id)
            XCTAssertLessThanOrEqual(box.maxY, MuscleFigure.size.height, part.id)
        }
        // Every muscle the server sends has its place on the figure.
        let drawn = Set((MuscleFigure.front + MuscleFigure.back).map { $0.id })
        for muscle in DemoData.muscles.muscles ?? [] { XCTAssertTrue(drawn.contains(muscle.id), muscle.id) }
    }

    func testBodyPartsAndOneMuscle() throws {
        let sample = DemoData.muscles
        XCTAssertEqual(sample.rings.map(\.id), ["legs", "glutes", "back", "chest", "shoulders", "arms"])
        XCTAssertEqual(sample.readyToday, "upper")
        XCTAssertEqual(sample.readyTitle, L10n.tr("Horní část těla"))
        XCTAssertEqual(sample.focus, "upper")
        XCTAssertEqual(sample.groups?.first { $0.id == "core" }?.ring, false)
        // The gym's figure ids and the muscles here.
        XCTAssertEqual(MuscleFatigue.fatigueIds(body: "lats"), ["back"])
        XCTAssertEqual(MuscleFatigue.bodyId("glutes"), "hips")
        XCTAssertEqual(sample.tired(body: "hips")?.id, "glutes")
        XCTAssertNil(sample.tired(body: "biceps"))
        let detail = try XCTUnwrap(DemoData.muscleDetail("quads"))
        XCTAssertEqual(detail.strength?.exercise, "Barbell back squat")
        XCTAssertGreaterThan(detail.strength?.points.count ?? 0, 4)
        XCTAssertEqual(detail.calendar?.target, 2)
        XCTAssertEqual(WidgetKind.musclesFigure.sizes, [.small, .medium, .large])
        XCTAssertEqual(WidgetKind.musclesGlance.sizes, [.small, .medium])
    }
}
