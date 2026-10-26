import XCTest
@testable import Aurin

/// Own rides and runs: the JSON the server checks and the chart's rows.
final class EnduranceTemplateTests: XCTestCase {
    private let template = WorkoutTemplate(sport: "run", name: "Kilometrovky", minutes: nil, exercises: [], blocks: [
        EnduranceBlock(repeats: 1, steps: [EnduranceStep(label: "", seconds: 600, km: nil, low: 70, high: 77, cadence: nil)]),
        EnduranceBlock(repeats: 6, steps: [
            EnduranceStep(label: "Rychle", seconds: nil, km: 1, low: 100, high: 100, cadence: nil),
            EnduranceStep(label: "", seconds: 120, km: nil, low: 70, high: 77, cadence: nil)
        ])
    ])

    func testJSONHasSectionsNotExercises() throws {
        let json = template.json
        XCTAssertNil(json["exercises"])
        guard case .array(let blocks)? = json["blocks"] else { return XCTFail("no blocks") }
        XCTAssertEqual(blocks.count, 2)
        XCTAssertFalse(template.isEmpty)
    }

    func testDistanceTakesTheAthletesPace() {
        // 10 min + 6 × (1 km at 4:00 /km + 2 min) = 46 min.
        XCTAssertEqual(template.enduranceMinutes(thresholdPace: 240), 46, accuracy: 0.01)
        let rows = template.profile(thresholdPace: 240)
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[1].repeats, 6)
        XCTAssertEqual(rows[1].steps?.first?.durationSeconds, 240)
        XCTAssertEqual(rows[1].steps?.first?.paceFast, 240)
        XCTAssertEqual(WorkoutProfile.segments(rows).count, 13)
    }

    func testDecodesTheServersTemplate() throws {
        let data = Data(#"{"sport":"ride","name":"SS","blocks":[{"repeats":3,"steps":[{"label":"","seconds":900,"low":88,"high":93,"cadence":90}]}]}"#.utf8)
        let decoded = try JSONDecoder().decode(WorkoutTemplate.self, from: data)
        XCTAssertTrue(decoded.isEndurance)
        XCTAssertEqual(decoded.exercises, [])
        XCTAssertEqual(decoded.enduranceMinutes(), 45)
    }
}
