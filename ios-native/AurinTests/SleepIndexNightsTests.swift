import XCTest
@testable import Aurin

/// The sentence over the 14 nights of the sleep index (chart review 1).
@MainActor
final class SleepIndexNightsTests: XCTestCase {
    private let date = "2026-11-07"

    private func nights(_ values: [Double]) -> [Point] {
        values.enumerated().map { i, v in Point(date: ISODay.shift(date, i - (values.count - 1)), value: v) }
    }

    func testSentenceAgainstTheUsualRange() {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        let within = SleepIndexNights(index: .init(nights: nights([60, 65, 61]), average: 62, low: 57, high: 68), date: date)
        XCTAssertEqual(within.summary, "Last night 61, in your usual range of 57–68.")
        let above = SleepIndexNights(index: .init(nights: nights([60, 80]), average: 70, low: 57, high: 68), date: date)
        XCTAssertEqual(above.summary, "Last night 80, above your usual range of 57–68.")
        let below = SleepIndexNights(index: .init(nights: nights([60, 41]), average: 50, low: 57, high: 68), date: date)
        XCTAssertEqual(below.summary, "Last night 41, below your usual range of 57–68.")
        let young = SleepIndexNights(index: .init(nights: nights([60, 61]), average: 60, low: nil, high: nil), date: date)
        XCTAssertEqual(young.summary, "Last night 61. Your usual range shows after 7 nights.")
    }
}
