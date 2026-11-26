import XCTest
@testable import Aurin

/// Repeat last and an exercise added in the live gym take today's load from
/// the server (GET /app/api/gym/next; load ramp-back review C2).
final class GymNextTests: XCTestCase {
    private let local = GymSuggestion(warmups: GymCoach.warmups(for: 102.5),
                                      work: Array(repeating: GymSuggestion.Planned(kg: 102.5, reps: 8), count: 3),
                                      line: "Last time 100 × 8, 8, 8 and it went well. Today try 102.5 kg.")

    private func next(kg: Double?, pain: Bool = false, warning: String? = nil) -> GymNext {
        GymNext(warning: warning, exercises: [GymNext.Item(name: "Back Squat", kg: kg, pain: pain)])
    }

    func testServerLoadReplacesTheLocalOne() {
        let s = next(kg: 90).adjust("Back Squat", local)
        XCTAssertEqual(s.work.map(\.kg), [90, 90, 90])
        XCTAssertEqual(s.work.map(\.reps), [8, 8, 8])
        XCTAssertEqual(s.warmups, GymCoach.warmups(for: 90))
        XCTAssertFalse(s.line.contains("102"))
    }

    func testSameLoadKeepsTheLocalLine() {
        XCTAssertEqual(next(kg: 102.5).adjust("Back Squat", local), local)
    }

    func testNoServerLoadKeepsTheLocalSuggestion() {
        XCTAssertEqual(next(kg: nil).adjust("Back Squat", local), local)
        XCTAssertEqual(next(kg: 90).adjust("Bench Press", local), local)
    }

    func testWarningAndPainSayWhy() {
        XCTAssertEqual(next(kg: 100, warning: "Skip the gym today and rest.").adjust("Back Squat", local).line, "Skip the gym today and rest.")
        let sore = next(kg: 100, pain: true, warning: "Skip the gym today and rest.")
        XCTAssertTrue(sore.pain("Back Squat"))
        XCTAssertNotEqual(sore.adjust("Back Squat", local).line, "Skip the gym today and rest.")
    }
}
