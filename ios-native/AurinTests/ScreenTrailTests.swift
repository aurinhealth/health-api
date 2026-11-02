import XCTest
@testable import Aurin

/// "Nahlásit problém" sends the last screens by case name with when each
/// opened, the last requests, and what the watch app said about itself.
@MainActor
final class ScreenTrailTests: XCTestCase {
    func testKeepsTheLastSixWithoutValues() {
        ScreenTrail.visit(.today, nil)
        ScreenTrail.visit(.today, nil)
        ScreenTrail.visit(.training, .muscle("biceps"))
        ScreenTrail.visit("coach")
        ScreenTrail.visit(.health, .readiness)
        ScreenTrail.visit("settings")
        ScreenTrail.visit("page/Zdroje dat")
        ScreenTrail.visit("page/Zdroje dat")
        ScreenTrail.visit("page/Apple Health")
        XCTAssertEqual(ScreenTrail.entries.map(\.name),
                       ["training/muscle", "coach", "health/readiness", "settings", "page/Zdroje dat", "page/Apple Health"])
        XCTAssertEqual(ScreenTrail.caseName(.workoutLibrary("Ride")), "workoutLibrary")
    }

    func testRequestTrailKeepsTheLastTenWithoutQueries() {
        // The test host app may send its own requests meanwhile: only what this test added is checked exactly.
        for i in 0..<12 { RequestTrail.add(path: "GET /app/api/today?date=2026-11-0\(i % 10)", status: 200, ms: i) }
        RequestTrail.add(path: "GET /app/api/coach/pick", status: nil, ms: -5)
        let entries = RequestTrail.entries
        XCTAssertLessThanOrEqual(entries.count, 10)
        let mine = entries.first { $0.path == "GET /app/api/coach/pick" }
        XCTAssertNotNil(mine)
        XCTAssertNil(mine?.status)
        XCTAssertEqual(mine?.ms, 0)
        XCTAssertTrue(entries.contains { $0.path == "GET /app/api/today" })
        XCTAssertFalse(entries.contains { $0.path.contains("?") })
    }

    func testWatchDiagnosticsRoundTrip() throws {
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let sent = WatchDiagnostics(app: "1.4 (312)", watchOS: "26.1", model: "Watch7,3", signedIn: true, todayDate: "2026-11-02",
                                    screens: [.init(name: "training", at: at)],
                                    errors: [.init(at: at, what: "GET /app/api/today", status: 500, message: "Server error")], sentAt: at)
        XCTAssertEqual(WatchDiagnostics.decode(try XCTUnwrap(sent.encoded())), sent)
        XCTAssertEqual(WatchDiagnostics.appending(4, to: [1, 2, 3], limit: 3), [2, 3, 4])
        XCTAssertFalse(WatchDiagnostics.hardwareModel.isEmpty)
    }
}
