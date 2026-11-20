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
        XCTAssertEqual(TodayDials.length(414), "6\u{00A0}h\u{00A0}54")
        XCTAssertEqual(TodayDials.length(425), "7\u{00A0}h\u{00A0}05")
        XCTAssertEqual(TodayDials.length(45), "45\u{00A0}min")
        let dials = TodayDials(today: DemoData.today)
        // The need in the same "8 h 05" as the dial.
        XCTAssertEqual(dials.sleep.note, "53 min short of 8\u{00A0}h\u{00A0}05")
        XCTAssertNotNil(dials.strain.note)
        XCTAssertTrue(dials.strain.note?.hasPrefix("target ") ?? false)
    }

    /// Activity: the running total through the day stops at the current hour.
    func testStepsDayTotals() {
        let hourly = Array(repeating: 100.0, count: 24)
        XCTAssertEqual(StepsDayLine.totals(hourly, through: 2), [100, 200, 300])
        XCTAssertEqual(StepsDayLine.totals(hourly, through: 30).count, 24)
    }

    /// Weather sheet: the best hours outside and feels like.
    func testWeatherOutdoors() throws {
        let weather = try XCTUnwrap(DemoData.today.weather)
        XCTAssertEqual(weather.week?.first?.outdoors?.ride, .init(start: 11, end: 15))
        XCTAssertEqual(weather.week?.first?.outdoors?.run, .init(start: 9, end: 17))
        XCTAssertEqual(weather.now?.feelsLike, 10)
        // An ended window goes; another day's first row shows nothing.
        let day = try XCTUnwrap(weather.week?.first)
        XCTAssertEqual(WeatherDetails.remaining(day, today: day.date, hour: 15)?.ride, nil)
        XCTAssertEqual(WeatherDetails.remaining(day, today: day.date, hour: 15)?.run, .init(start: 9, end: 17))
        XCTAssertNil(WeatherDetails.remaining(day, today: "2026-10-09", hour: 8))
    }

    /// Tapwright 2026-11-19: no "−0.0", and a debt past 6 h stretches its strip.
    func testSignedZeroAndDebtScale() {
        XCTAssertFalse(Fmt.signed(-0.04, digits: 1).hasPrefix("−"))
        XCTAssertFalse(Fmt.signed(-0.0, digits: 1).hasPrefix("+"))
        XCTAssertTrue(Fmt.signed(-0.06, digits: 1).hasPrefix("−"))
        XCTAssertTrue(Fmt.signed(2).hasPrefix("+"))
        XCTAssertEqual(DebtStrip.scaleHours(200), 6)
        XCTAssertEqual(DebtStrip.scaleHours(430), 8)
    }
}
