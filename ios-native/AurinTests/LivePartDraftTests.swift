import XCTest
@testable import Aurin

/// Edit warm-up / cardio / stretching in the live workout: Done keeps the day's choice.
final class LivePartDraftTests: XCTestCase {
    private let parts = GymDayParts(order: GymDayPart.allCases, off: [], cardio: [:])
    private let items = [GymStretching.Item(id: "ham", name: "Hamstring stretch", seconds: 60, sides: false),
                         GymStretching.Item(id: "calf", name: "Calf stretch", seconds: 30, sides: true)]

    private func draft(_ part: GymDayPart, _ mode: LivePartDraft.Mode) -> LivePartDraft {
        LivePartDraft(part: part, mode: mode, routine: mode == .mine ? "stretching-abc" : nil, name: mode == .mine ? "Evening" : nil,
                      items: items, cardio: GymDayParts.Choice(type: "rowing_ergometer", minutes: 15))
    }

    func testFreeTimeIsOneItemToTick() {
        let next = draft(.stretching, .free).applied(to: parts)
        let moves = next.routines?["stretching"]?.moves
        XCTAssertTrue(LivePartDraft.isFree(moves))
        XCTAssertEqual(moves?.items.map(\.id), [LivePartDraft.freeId])
    }

    func testEditedMovesKeepTheirOrderAndOwnName() {
        let next = draft(.warmup, .mine).applied(to: parts)
        let routine = next.routines?["warmup"]
        XCTAssertEqual(routine?.routine, "stretching-abc")
        XCTAssertEqual(routine?.moves.items.map(\.id), ["ham", "calf"])
        XCTAssertEqual(routine?.moves.name, "Evening")
        XCTAssertFalse(LivePartDraft.isFree(routine?.moves))
        // This workout: no own routine named.
        XCTAssertNil(draft(.warmup, .workout).applied(to: parts).routines?["warmup"]?.routine)
    }

    func testCardioChangesOnlyItsMachineAndTime() {
        let next = draft(.cardioEnd, .workout).applied(to: parts)
        XCTAssertEqual(next.choice(.cardioEnd), GymDayParts.Choice(type: "rowing_ergometer", minutes: 15))
        XCTAssertNil(next.routines)
    }
}
