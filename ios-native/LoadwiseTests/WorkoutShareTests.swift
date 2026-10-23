import XCTest
@testable import Loadwise

/// A shared workout's link opens it in the app; a workout keeps no weights.
@MainActor
final class WorkoutShareTests: XCTestCase {
    func testShareLinksOpenTheWorkout() {
        XCTAssertEqual(AppRoute(url: URL(string: "https://aurin.health/t/Ab3dEf7hJk")!), .sharedWorkout("Ab3dEf7hJk"))
        XCTAssertEqual(AppRoute(url: URL(string: "https://www.aurin.health/t/Ab3dEf7hJk")!), .sharedWorkout("Ab3dEf7hJk"))
        XCTAssertNil(AppRoute(url: URL(string: "https://petrfitnessdata.eu/t/Ab3dEf7hJk")!))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/share/Ab3dEf7hJk")!), .sharedWorkout("Ab3dEf7hJk"))
        XCTAssertNil(AppRoute(url: URL(string: "https://aurin.health/t/short")!))
        XCTAssertNil(AppRoute(url: URL(string: "https://aurin.health/privacy")!))
        XCTAssertNil(AppRoute(url: URL(string: "https://example.com/t/Ab3dEf7hJk")!))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/my-workouts")!), .myWorkouts)
    }

    func testAPlannedDayBecomesAWorkoutWithoutWeights() {
        let row: (String, String, String, String, String) -> [JSONValue] = { type, name, set, kg, reps in
            [type, name, set, kg, reps, "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        }
        let proposal = GymProposal(draftId: 1, planName: "Nohy", rationale: nil, rows: [
            row("WARMUP", "Pivot leg press", "1", "40", "8"),
            row("WORK", "Pivot leg press", "1", "80", "8-12"),
            row("WORK", "Pivot leg press", "2", "80", "8-12"),
            row("WORK", "Plank", "1", "", "AMRAP")
        ], muscles: ["Pivot leg press": ["quads": 1, "hips": 0.6]])
        let template = WorkoutTemplate.from(proposal, minutes: 45)
        XCTAssertEqual(template.exercises, [TemplateExercise(name: "Pivot leg press", sets: 2, reps: "8–12"), TemplateExercise(name: "Plank", sets: 1, reps: "10")])
        XCTAssertEqual(template.minutes, 45)
        XCTAssertNil(template.json["kg"])
        XCTAssertEqual(WorkoutSharing.groups(proposal.muscles, template: template).first, L10n.tr("Stehna"))
        XCTAssertTrue(TemplateExercise.validReps("30 s"))
        XCTAssertFalse(TemplateExercise.validReps("hodně"))
    }
}
