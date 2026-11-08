import XCTest
@testable import Aurin

/// The proposal left without saving comes back with its edits, for a day to come only.
final class GymKeptProposalTests: XCTestCase {
    private func kept(day: String = "2026-11-08", focus: String = "upper") -> GymKeptProposal {
        let row: [JSONValue] = ["WORK", "Pull-up", "1", "", "6-8", "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        let proposal = GymProposal(draftId: 7, planName: "Upper body strength", rationale: nil, rows: [row],
                                   muscles: ["Pull-up": ["lats": 1]], minutes: 60)
        return GymKeptProposal(proposal: proposal, day: day, minutes: 60, focus: focus, muscles: [], shown: ["Lat pulldown"],
                               lengthPicked: false, at: Date(timeIntervalSince1970: 1_800_000_000))
    }

    func testSavedAndLoadedWithItsEdits() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "GymKeptProposalTests"))
        defer { defaults.removePersistentDomain(forName: "GymKeptProposalTests") }
        XCTAssertNil(GymKeptProposal.load(defaults))
        kept().save(defaults)
        XCTAssertEqual(GymKeptProposal.load(defaults), kept())
        XCTAssertEqual(GymKeptProposal.load(defaults)?.proposal.exercises.map { $0.name }, ["Pull-up"])
        GymKeptProposal.clear(defaults)
        XCTAssertNil(GymKeptProposal.load(defaults))
    }

    func testOnlyForADayToComeAndTheFocusAskedFor() {
        XCTAssertTrue(kept().fits(today: "2026-11-08", focus: nil))
        XCTAssertTrue(kept(day: "2026-11-09").fits(today: "2026-11-08", focus: nil))
        XCTAssertFalse(kept(day: "2026-11-07").fits(today: "2026-11-08", focus: nil))
        XCTAssertTrue(kept().fits(today: "2026-11-08", focus: "upper"))
        XCTAssertFalse(kept().fits(today: "2026-11-08", focus: "lower"))
    }
}
