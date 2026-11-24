import XCTest
@testable import Aurin

/// Week plan (redesign W): the week from the calendar, its sentences and Plan settings' choices.
final class WeekPlanTests: XCTestCase {
    private func calendar() throws -> [String: CalendarDay] {
        let json = #"""
        [{"date":"2026-10-05","primary":"ride","count":1,"minutes":90,"kcal":800,"planned":0,"activities":[
            {"id":"a1","sport":"ride","status":"done","title":"Endurance","date":"2026-10-05","minutes":92,"compliance":102,"plannedId":"planned:1"}]},
         {"date":"2026-10-07","primary":"walk","count":1,"minutes":40,"kcal":150,"planned":1,"activities":[
            {"id":"w1","sport":"walk","status":"done","title":"Walk","date":"2026-10-07","minutes":40},
            {"id":"p2","sport":"run","status":"planned","title":"Easy run","date":"2026-10-07","minutes":45,"eventId":"planned:2"}]},
         {"date":"2026-10-08","primary":"ride","count":0,"minutes":0,"kcal":0,"planned":2,"activities":[
            {"id":"p3","sport":"strength","status":"planned","title":"Gym","date":"2026-10-08","minutes":45},
            {"id":"a3","sport":"run","status":"done","title":"Run","date":"2026-10-08","minutes":30,"compliance":80},
            {"id":"p4","sport":"ride","status":"planned","title":"Tempo","date":"2026-10-08","minutes":60,"eventId":"planned:4"}]}]
        """#
        let days = try JSONDecoder().decode([CalendarDay].self, from: Data(json.utf8))
        return Dictionary(uniqueKeysWithValues: days.map { ($0.date, $0) })
    }

    func testWeekFromCalendar() throws {
        let week = WeekPlanWeek(monday: "2026-10-05", today: "2026-10-08", calendar: try calendar())
        XCTAssertEqual(week.days.first, "2026-10-05")
        XCTAssertEqual(week.sunday, "2026-10-11")
        // A walk without a plan is left out; done first, then planned, as they came.
        XCTAssertEqual(week.sessions.map(\.id), ["a1", "p2", "a3", "p3", "p4"])
        XCTAssertEqual(week.count, 5)
        XCTAssertEqual(week.minutes, 92 + 45 + 30 + 45 + 60)
        // Only what is planned from today on is still to go (Wednesday's run before today is not).
        XCTAssertEqual(week.minutesToGo, 105)
        XCTAssertTrue(week.hasPlanned)
        XCTAssertTrue(week.hasEarlier)
        // A removed workout waits hidden for the toast.
        let hidden = WeekPlanWeek(monday: "2026-10-05", today: "2026-10-08", calendar: try calendar(), hidden: ["p4"])
        XCTAssertEqual(hidden.minutesToGo, 45)
        let next = WeekPlanWeek(monday: "2026-10-12", today: "2026-10-08", calendar: try calendar())
        XCTAssertEqual(next.count, 0)
        XCTAssertFalse(next.hasPlanned)
    }

    func testSentences() {
        let language = L10n.language
        defer { L10n.setLanguage(language) }
        L10n.setLanguage("en")
        XCTAssertEqual(WeekPlanText.done(4, of: 8), "4 of 8 planned workouts done")
        XCTAssertEqual(WeekPlanText.summary(count: 8, minutes: 442), "8 workouts, 7 h 22")
        XCTAssertEqual(WeekPlanText.summary(count: 0, minutes: 0), "No workouts")
        XCTAssertEqual(WeekPlanText.dayWord("2026-10-08", today: "2026-10-08"), "Today")
        XCTAssertTrue(WeekPlanText.replans(from: "2026-11-12", to: "2026-11-22").hasSuffix("Finished workouts stay."))
        XCTAssertEqual(WeekPlanSettingsText.day(-1), "–")
        XCTAssertEqual(WeekPlanSettingsText.day(0), "Day off")
        XCTAssertEqual(WeekPlanSettingsText.day(360), "6 h+")
        XCTAssertEqual(WeekPlanSettingsText.total([60, -1, 0, 90, 45, 120, 180]), "8 h 15 a week")
        XCTAssertEqual(WeekPlanSettingsText.rest(from: "2026-10-08", today: "2026-10-08"), "Rest from today to Sunday.")
        XCTAssertEqual(WeekPlanSettingsText.rest(from: "2026-10-09", today: "2026-10-08"), "Rest from tomorrow to Sunday.")
        XCTAssertTrue(WeekPlanSettingsText.replaced(from: "2026-10-08", today: "2026-10-08").hasPrefix("Workouts from today"))
        XCTAssertTrue(WeekPlanSettingsText.replaced(from: "2026-10-09", today: "2026-10-08").hasSuffix("Earlier days and finished ones stay."))
    }

    /// Petr 2026-11-24: a gym added for today went when he set only the days from Wednesday.
    func testReplanStartsAtTheFirstDayChanged() {
        let mon = "2026-11-23", next = "2026-11-30", today = "2026-11-24"
        let empty = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        let usual = [120, 150, 150, 150, 120, 360, 360]
        var changed = empty
        changed.toggle("ride", day: 2)
        changed.toggle("gym", day: 3)
        var nextChanged = empty
        nextChanged.toggle("gym", day: 0)
        func from(_ choices: [String: WeekPlanChoice], usualNow: [Int] = usual) -> String {
            WeekPlanGenerator.replanFrom(weeks: [mon, next], today: today, choices: choices, original: [mon: empty, next: empty],
                                         usual: usualNow, usualBefore: usual)
        }
        XCTAssertEqual(from([mon: changed, next: nextChanged]), "2026-11-25", "today left as it was keeps its workout")
        XCTAssertEqual(from([mon: empty, next: nextChanged]), "2026-11-30")
        XCTAssertEqual(from([mon: empty, next: empty]), today, "nothing changed: Generate replans from today")
        var restToday = empty
        restToday.makeRest(1)
        XCTAssertEqual(from([mon: restToday, next: empty]), today)
        var monday = empty
        monday.makeRest(0)
        XCTAssertEqual(from([mon: monday, next: empty]), today, "a day before today does not count")
        var longerTuesday = usual
        longerTuesday[1] = 180
        XCTAssertEqual(from([mon: changed, next: empty], usualNow: longerTuesday), today, "today's usual time changed")
    }

    func testDayChoices() {
        var choice = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [6])
        choice.toggle("ride", day: 0)
        choice.toggle("run", day: 0)
        XCTAssertEqual(choice.days[0], ["ride", "run"])
        // A third sport replaces the first.
        choice.toggle("swim", day: 0)
        XCTAssertEqual(choice.days[0], ["run", "swim"])
        choice.toggle("run", day: 0)
        XCTAssertEqual(choice.days[0], ["swim"])
        // A sport on a rest day ends the rest; Rest clears the sports.
        choice.toggle("gym", day: 6)
        XCTAssertFalse(choice.rest.contains(6))
        choice.makeRest(0)
        XCTAssertEqual(choice.days[0], [])
        XCTAssertTrue(choice.rest.contains(0))
        choice.auto(0)
        XCTAssertFalse(choice.rest.contains(0))
        // Rest days go as 0; a rest day cleared gets the usual time back.
        let rested = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [3, 4])
        let minutes = rested.minutes(base: [60, 0, 60, 0, 0, 120, 90], usual: [60, 30, 60, 45, 45, 120, 90], before: [1])
        XCTAssertEqual(minutes, [60, 30, 60, 0, 0, 120, 90])
    }

    func testSportLimits() {
        XCTAssertEqual(WeekPlanSport.minMinutes("swim"), 15)
        XCTAssertEqual(WeekPlanSport.minMinutes("run"), 20)
        // No 3 h cap for a long run.
        XCTAssertGreaterThan(WeekPlanSport.maxMinutes("run"), 180)
        XCTAssertEqual(WeekPlanPrefs.sports, ["ride", "run", "swim", "gym"])
    }
}
