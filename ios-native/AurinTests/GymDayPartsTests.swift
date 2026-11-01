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

    func testADayKeepsItsOwnWarmupAndShowsItsName() {
        let d = day(routines: #"{"warmup":{"minutes":7,"name":"Legs","items":[{"id":"own-1","name":"Rotoped","seconds":300,"sides":false}]},"stretching":"# + routine + #"}"#)
        var parts = GymDayParts.defaults(d)
        XCTAssertEqual(parts.subtitle(.warmup, day: d), "Legs · 7 min")
        XCTAssertEqual(parts.subtitle(.stretching, day: d), L10n.tr("Automaticky") + " · 5 min")
        let ten = GymStretching(minutes: 10, items: [GymStretching.Item(id: "squat", name: "Dřep", seconds: 40, sides: false)])
        parts.routines = ["warmup": GymDayParts.Routine(routine: nil, length: 10, moves: ten)]
        XCTAssertEqual(parts.routine(.warmup, day: d), ten)
        // Kept on the phone with the day's other choices (the last week's days only).
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let today = f.string(from: Date())
        let stored = GymDayParts.saving(parts, date: today, into: "")
        let back = GymDayParts.resolved(d, stored: stored, date: today)
        XCTAssertEqual(back.routines?["warmup"]?.length, 10)
        XCTAssertEqual(back.minutes(.warmup, day: d), 10)
    }

    /// Cardio has no set time unless Posilovna chose one: the time just runs.
    func testCardioRunsWithoutALimitUnlessALengthIsChosen() {
        let old = day(routines: #"{"warmup":"# + routine + #","cardio":{"type":"treadmill","start":10,"end":null}}"#)
        let parts = GymDayParts.defaults(old)
        XCTAssertEqual(parts.choice(.cardioStart).minutes, 0)
        XCTAssertEqual(parts.routine(.cardioStart, day: old)?.items.first?.seconds, 0)
        XCTAssertEqual(parts.subtitle(.cardioStart, day: old), GymCardio.name("treadmill") + " · " + L10n.tr("Bez limitu"))
        XCTAssertEqual(parts.routine(.cardioStart, day: old)?.items.first?.duration, L10n.tr("Bez limitu"))
        let timed = day(routines: #"{"warmup":"# + routine + #","cardio":{"type":"treadmill","start":12,"end":12,"length":12}}"#)
        XCTAssertEqual(GymDayParts.defaults(timed).choice(.cardioEnd).minutes, 12)
        XCTAssertEqual(GymDayParts.defaults(timed).routine(.cardioEnd, day: timed)?.items.first?.seconds, 720)
    }

    /// Stop keeps the cardio's length and its end for the day.
    func testTheStoppedCardioIsKept() {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let today = f.string(from: Date())
        let entry = GymCardioLog.Entry(seconds: 432, end: Date())
        let stored = GymCardioLog.saving(entry, date: today, id: "cardio-start", into: "")
        XCTAssertEqual(GymCardioLog.entry(stored, date: today, id: "cardio-start"), entry)
        XCTAssertNil(GymCardioLog.entry(stored, date: today, id: "cardio-end"))
        XCTAssertTrue(entry.summary.hasPrefix("7 min · "))
    }
}
