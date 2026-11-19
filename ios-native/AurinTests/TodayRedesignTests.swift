import XCTest
@testable import Aurin

/// Redesign part D (Today): the line under the readiness only describes the
/// numbers, and the morning question goes after an answer or the ✕.
@MainActor
final class TodayRedesignTests: XCTestCase {
    /// Every key of src/day-verdict.js NUMBERS_LINE_KEYS has its line, and no
    /// line tells the athlete what to do (D-DNES-2: advice is the coach card's).
    func testNumbersLineCoversServerKeys() {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        let keys = ["hard", "steady", "easy", "signs", "usual", "paused"]
        for key in keys {
            let line = ReadinessText.numbersLine(key)
            XCTAssertNotNil(line, key)
            XCTAssertFalse(line?.lowercased().hasPrefix("go ") ?? true, key)
            XCTAssertFalse(line?.contains("Good day") ?? true, key)
        }
        XCTAssertEqual(ReadinessText.numbersLine("hard"), "Your numbers support a hard workout")
        XCTAssertNil(ReadinessText.numbersLine(nil))
        XCTAssertNil(ReadinessText.numbersLine("legs"))
    }

    /// The old advice key alone (an older server) shows no line: the verdict
    /// is advice, and the redesign never says it under the number.
    func testVerdictAloneShowsNoLine() throws {
        let json = #"{"score": 78, "zone": "green", "verdict": "hard"}"#
        let readiness = try JSONDecoder().decode(TodaySnapshot.Readiness.self, from: Data(json.utf8))
        XCTAssertNil(ReadinessText.numbersLine(readiness.numbersLine))
    }

    /// The morning question: three answers, no Sick (that is the status pill
    /// and the Journal); gone once answered or closed for the day, back the next.
    func testMorningQuestionShows() {
        XCTAssertEqual(TodayMorningQuestion.options.map(\.id), ["fresh", "normal", "tired"])
        XCTAssertTrue(TodayMorningQuestion.shows(feeling: nil, closedOn: "", date: "2026-11-12"))
        XCTAssertFalse(TodayMorningQuestion.shows(feeling: "tired", closedOn: "", date: "2026-11-12"))
        XCTAssertFalse(TodayMorningQuestion.shows(feeling: nil, closedOn: "2026-11-12", date: "2026-11-12"))
        XCTAssertTrue(TodayMorningQuestion.shows(feeling: nil, closedOn: "2026-11-11", date: "2026-11-12"))
    }

    /// The dials' lines: lengths as "6 h 54", the night against its need, the
    /// strain target and the usual HRV in words with numbers.
    func testDialLines() {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        XCTAssertEqual(TodayDials.length(414), "6 h 54")
        XCTAssertEqual(TodayDials.length(425), "7 h 05")
        XCTAssertEqual(TodayDials.length(45), "45 min")
        let dials = TodayDials(today: DemoData.today)
        XCTAssertNotNil(dials.strain.note)
        XCTAssertTrue(dials.strain.note?.hasPrefix("target ") ?? false)
    }
}
