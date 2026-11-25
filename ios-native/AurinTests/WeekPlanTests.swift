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
        XCTAssertEqual(WeekPlanText.summary(count: 8, minutes: 442), "8 workouts, 7\u{00A0}h\u{00A0}22\u{00A0}min")
        XCTAssertEqual(WeekPlanText.summary(count: 0, minutes: 0), "No workouts")
        XCTAssertEqual(WeekPlanText.dayWord("2026-10-08", today: "2026-10-08"), "Today")
        XCTAssertTrue(WeekPlanText.replans(from: "2026-11-12", to: "2026-11-22").hasSuffix("Finished workouts stay."))
        XCTAssertEqual(WeekPlanSettingsText.day(-1), "–")
        XCTAssertEqual(WeekPlanSettingsText.day(0), "Day off")
        XCTAssertEqual(WeekPlanSettingsText.day(360), "6\u{00A0}h+")
        XCTAssertEqual(WeekPlanSettingsText.total([60, -1, 0, 90, 45, 120, 180]), "8\u{00A0}h\u{00A0}15\u{00A0}min a week")
        XCTAssertEqual(WeekPlanSettingsText.rest(from: "2026-10-08", today: "2026-10-08"), "Rest from today to Sunday.")
        XCTAssertEqual(WeekPlanSettingsText.rest(from: "2026-10-09", today: "2026-10-08"), "Rest from tomorrow to Sunday.")
        XCTAssertEqual(WeekPlanSettingsText.again(["2026-11-28"]), "Plan Sat, Nov 28 again?")
        XCTAssertEqual(WeekPlanSettingsText.again(["2026-11-28", "2026-12-01"]), "Plan 2 days again?")
        XCTAssertEqual(WeekPlanSettingsText.plans(["2026-11-28"]), "Plans Sat, Nov 28. Your other workouts stay.")
        XCTAssertEqual(WeekPlanText.affects(.init(kind: "hard_in_a_row", dates: ["2026-11-27", "2026-11-28"])),
                       "Fri, Nov 27 and Sat, Nov 28 are now two demanding days in a row.")
        XCTAssertEqual(WeekPlanText.recalculateAdvice(from: "2026-11-26", to: "2026-12-06"), "I'd recalculate Nov 26 to Dec 6 and keep your sports.")
    }

    /// Petr 2026-11-24/25: Generate plans again only the days changed; a gym added for today stays.
    func testGeneratePlansOnlyTheDaysChanged() {
        let mon = "2026-11-23", next = "2026-11-30", today = "2026-11-24"
        let empty = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        let usual = [120, 150, 150, 150, 120, 360, 360]
        var changed = empty
        changed.toggle("ride", day: 2)
        changed.toggle("gym", day: 5)
        var nextChanged = empty
        nextChanged.toggle("gym", day: 0)
        func days(_ choices: [String: WeekPlanChoice], usualNow: [Int] = usual) -> [String] {
            WeekPlanGenerator.changedDays(weeks: [mon, next], today: today, choices: choices, original: [mon: empty, next: empty],
                                          usual: usualNow, usualBefore: usual)
        }
        XCTAssertEqual(days([mon: changed, next: nextChanged]), ["2026-11-25", "2026-11-28", "2026-11-30"], "today and the days between stay")
        XCTAssertEqual(days([mon: empty, next: empty]), [], "nothing changed: the whole plan")
        var monday = empty
        monday.makeRest(0)
        XCTAssertEqual(days([mon: monday, next: empty]), [], "a day before today does not count")
        var longerSaturday = usual
        longerSaturday[5] = 240
        XCTAssertEqual(days([mon: empty, next: empty], usualNow: longerSaturday), ["2026-11-28", "2026-12-05"], "a weekday's time: both weeks")
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

    /// Other sports in Plan settings: a practice or match per day, two at most, and Generate replans from the day before it.
    func testOtherSportsOnADay() throws {
        var choice = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        choice.toggle("gym", day: 5)
        choice.toggleEvent("Soccer", day: 5)
        XCTAssertEqual(choice.events[5], [OtherSportEvent(type: "Soccer", kind: "training", minutes: 75)])
        XCTAssertEqual(choice.days[5], ["gym"], "the day's own sports stay")
        choice.setEvent("Soccer", day: 5, kind: "match")
        XCTAssertEqual(choice.events[5][0].minutes, 90, "a usual length follows the kind")
        choice.setEvent("Soccer", day: 5, minutes: 400)
        XCTAssertEqual(choice.events[5][0].minutes, 300)
        choice.toggleEvent("Boxing", day: 5)
        choice.toggleEvent("Tennis", day: 5)
        XCTAssertEqual(choice.events[5].map(\.type), ["Boxing", "Tennis"], "a third replaces the first")
        choice.toggleEvent("Boxing", day: 5)
        XCTAssertEqual(choice.events[5].map(\.type), ["Tennis"])

        let empty = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        var match = empty
        match.toggleEvent("Soccer", day: 5)
        let days = WeekPlanGenerator.changedDays(weeks: ["2026-11-23"], today: "2026-11-24", choices: ["2026-11-23": match],
                                                 original: ["2026-11-23": empty], usual: Array(repeating: 60, count: 7), usualBefore: Array(repeating: 60, count: 7))
        XCTAssertEqual(days, ["2026-11-27", "2026-11-28"], "the day before a match changes too")

        let prefs = try JSONDecoder().decode(JSONValue.self, from: Data(#"{"days":[[],[],[],[],[],["gym"],[]],"events":[[],[],[],[],[],[{"type":"Soccer","kind":"match","minutes":95}],[]],"availability":[{"minutes":30,"ownMinutes":60,"calendarMinutes":30}],"source":"week","calendar":true}"#.utf8))
        XCTAssertEqual(OtherSports.events(prefs)[5], [OtherSportEvent(type: "Soccer", kind: "match", minutes: 95)])
        let sent = OtherSports.uncapped(OtherSports.edited(prefs, events: Array(repeating: [], count: 7)))
        XCTAssertEqual(OtherSports.events(sent)[5], [])
        guard case .object(let o) = sent, case .array(let days)? = o["availability"], case .object(let day) = days[0] else { return XCTFail("no availability") }
        XCTAssertEqual(day["minutes"], .number(60), "the day's own time goes back, not the calendar's cap")
        XCTAssertNil(day["calendarMinutes"])
        XCTAssertNil(o["source"])
    }

    /// Repeat every week off keeps the practice in the week it was turned off in; a removal from one day leaves the usual week.
    func testRepeatAndRemoveOtherSport() {
        let mon = "2026-11-23", next = "2026-11-30"
        let soccer = OtherSportEvent(type: "Soccer")
        var usualEvents = Array(repeating: [OtherSportEvent](), count: 7)
        usualEvents[1] = [soccer]
        let before = usualEvents
        let loaded = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [], events: usualEvents)
        var choices = [mon: loaded, next: loaded]
        let original = choices
        WeekPlanGenerator.setRepeat("Soccer", day: 1, week: mon, on: false, weeks: [mon, next], choices: &choices, usualEvents: &usualEvents)
        XCTAssertEqual(usualEvents[1], [])
        XCTAssertEqual(choices[mon]?.events[1], [soccer], "this week keeps it")
        XCTAssertEqual(choices[next]?.events[1], [], "the next week follows the usual week")
        XCTAssertTrue(WeekPlanGenerator.needsSave(choices[mon]!, original: original[mon], usualEvents: usualEvents, usualEventsBefore: before),
                      "this week is sent, or it would follow the usual week and lose it")
        XCTAssertTrue(WeekPlanGenerator.needsSave(choices[next]!, original: original[next], usualEvents: usualEvents, usualEventsBefore: before))
        XCTAssertFalse(WeekPlanGenerator.needsSave(loaded, original: loaded, usualEvents: before, usualEventsBefore: before))

        // A match on the next Monday: this Sunday replans too.
        var nextMatch = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        nextMatch.toggleEvent("Soccer", day: 0)
        let empty = WeekPlanChoice(days: Array(repeating: [], count: 7), rest: [])
        let days = WeekPlanGenerator.changedDays(weeks: [mon, next], today: "2026-11-24", choices: [mon: empty, next: nextMatch],
                                                 original: [mon: empty, next: empty], usual: Array(repeating: 60, count: 7), usualBefore: Array(repeating: 60, count: 7))
        XCTAssertEqual(days, ["2026-11-29", "2026-11-30"])
    }
}
