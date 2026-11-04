import XCTest
@testable import Aurin

/// The line under "Synchronizovat znovu" on a service's page (SyncStatus.pageLine).
final class SyncPageLineTests: XCTestCase {
    private func decode(_ json: String) throws -> SyncStatus {
        try JSONDecoder().decode(SyncStatus.self, from: Data(json.utf8))
    }

    private func intervals(activities: Int?, plans: Int?) throws -> SyncStatus {
        let activityPart = activities.map { "\"activities_new\":\($0)," } ?? ""
        let planPart = plans.map { "\"events_new\":\($0)," } ?? ""
        return try decode("""
        {"status":"done","finishedAt":"2026-11-04T12:56:35.531Z","results":[
          {"source":"intervals","status":"ok","parts":{"activities":{\(activityPart)"activities_found":1,"activities_saved":0},"planned":{\(planPart)"events_found":5,"events_saved":0}}},
          {"source":"google","status":"partial","message":"not downloaded: active energy"}]}
        """)
    }

    func testNothingNewSaysSo() throws {
        let line = try intervals(activities: 0, plans: 0).pageLine(source: "intervals", name: "Intervals.icu", failed: nil)
        XCTAssertFalse(line.problem, "Google's problem stays on Zdroje dat")
        XCTAssertTrue(line.text.hasSuffix(L10n.f("V %@ nic nového.", "Intervals.icu")), line.text)
    }

    func testNewActivitiesAndPlansAreCounted() throws {
        let line = try intervals(activities: 2, plans: 1).pageLine(source: "intervals", name: "Intervals.icu", failed: nil)
        let expected = L10n.f("%@ a %@ z %@.", L10n.plural("%lld nových aktivit", 2), L10n.plural("%lld nových plánů", 1), "Intervals.icu")
        XCTAssertTrue(line.text.hasSuffix(expected), line.text)
        let one = try intervals(activities: 0, plans: 3).pageLine(source: "intervals", name: "Intervals.icu", failed: nil)
        XCTAssertTrue(one.text.hasSuffix(L10n.f("%@ z %@.", L10n.plural("%lld nových plánů", 3), "Intervals.icu")), one.text)
    }

    func testOlderServerWithoutCountsSaysOnlyWhen() throws {
        let line = try intervals(activities: nil, plans: nil).pageLine(source: "intervals", name: "Intervals.icu", failed: nil)
        XCTAssertFalse(line.text.contains("Intervals.icu"), line.text)
        XCTAssertFalse(line.problem)
    }

    func testFailuresRunningAndOffline() throws {
        let status = try intervals(activities: 0, plans: 0)
        let google = status.pageLine(source: "google", name: "Google Health", failed: nil)
        XCTAssertEqual(google.text, "not downloaded: active energy")
        XCTAssertTrue(google.problem)
        let offline = status.pageLine(source: "intervals", name: "Intervals.icu", failed: "The Internet connection appears to be offline.")
        XCTAssertEqual(offline.text, "The Internet connection appears to be offline.")
        XCTAssertTrue(offline.problem)
        let running = try decode(#"{"status":"running","results":[]}"#).pageLine(source: "intervals", name: "Intervals.icu", failed: nil)
        XCTAssertEqual(running.text, L10n.tr("Pořád se synchronizuje na pozadí. Nová data se ukážou na Dnes, až to doběhne."))
        XCTAssertFalse(running.problem)
    }
}
