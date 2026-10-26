import XCTest
@testable import Aurin

/// The parts of a gym day: a warm-up or stretching turned off in Posilovna is offered
/// switched off, and Upravit pořadí moves a part one place up or down.
final class GymDayPartsTests: XCTestCase {
    private func day(routines: String) -> GymDay {
        var head: [[JSONValue]] = Array(repeating: [], count: GymDay.firstSetRow - 1)
        head[GymStretching.row] = [.string("Rozcvička a protažení"), .string(routines)]
        head.append(GymDay.columns.map { JSONValue.string($0) })
        let set = ["WORK", "Bench", "1", "50", "8", "", "", "", "FALSE", "", "", "FALSE", "", ""].map { JSONValue.string($0) }
        return GymDay(date: "2026-10-23", values: head + [set], cancelled: nil)
    }

    private let routine = #"{"minutes":5,"items":[{"id":"child","name":"Dětská pozice","seconds":60,"sides":false}]}"#

    func testATurnedOffWarmupIsOfferedSwitchedOff() {
        let d = day(routines: #"{"warmup":"# + routine + #","stretching":"# + routine + #","off":["warmup"]}"#)
        let parts = GymDayParts.defaults(d)
        XCTAssertTrue(parts.visible(d).contains(.warmup))
        XCTAssertFalse(parts.isOn(.warmup))
        XCTAssertTrue(parts.isOn(.stretching))
        XCTAssertEqual(parts.before(d), [])
        XCTAssertEqual(parts.after(d), [.stretching])
    }

    func testArrowsMoveAPartOnePlace() {
        let d = day(routines: #"{"warmup":"# + routine + #","stretching":"# + routine + #","cardio":{"type":"treadmill","start":10,"end":10}}"#)
        var parts = GymDayParts.defaults(d)
        parts.step(.stretching, by: -1, day: d)
        XCTAssertEqual(parts.visible(d), [.warmup, .cardioStart, .exercises, .stretching, .cardioEnd])
        parts.step(.stretching, by: -1, day: d)
        XCTAssertEqual(parts.visible(d), [.warmup, .cardioStart, .stretching, .exercises, .cardioEnd])
        parts.step(.warmup, by: -1, day: d)
        XCTAssertEqual(parts.visible(d).first, .warmup)
        parts.step(.warmup, by: 1, day: d)
        XCTAssertEqual(parts.visible(d), [.cardioStart, .warmup, .stretching, .exercises, .cardioEnd])
    }
}
