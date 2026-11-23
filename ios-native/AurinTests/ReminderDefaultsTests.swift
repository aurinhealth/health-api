import UserNotifications
import XCTest
@testable import Aurin

/// Notifications concept v3: water off for a new install only, weigh-in on Monday.
final class ReminderDefaultsTests: XCTestCase {
    private func fresh() -> UserDefaults {
        let name = "ReminderDefaultsTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testNewInstallLeavesWaterOff() {
        let defaults = fresh()
        Reminders.adoptNewDefaults(defaults)
        XCTAssertNil(defaults.object(forKey: Reminders.waterKey))
    }

    func testEarlierUseKeepsWaterOn() {
        let defaults = fresh()
        defaults.set("true,true,true,true", forKey: "push.sentChoices")
        Reminders.adoptNewDefaults(defaults)
        XCTAssertEqual(defaults.object(forKey: Reminders.waterKey) as? Bool, true)
    }

    func testOwnChoiceStaysAndRunsOnce() {
        let defaults = fresh()
        defaults.set(false, forKey: Reminders.waterKey)
        defaults.set(true, forKey: Reminders.mealsKey)
        Reminders.adoptNewDefaults(defaults)
        XCTAssertEqual(defaults.object(forKey: Reminders.waterKey) as? Bool, false)
        defaults.removeObject(forKey: Reminders.waterKey)
        Reminders.adoptNewDefaults(defaults)
        XCTAssertNil(defaults.object(forKey: Reminders.waterKey))
    }

    func testWeighInOnMondayWeekPlanOnSunday() {
        XCTAssertEqual(Reminders.defaultDays(Reminders.weightKey), 2)
        XCTAssertTrue(Reminders.has(Reminders.defaultDays(Reminders.weightKey), 2))
        XCTAssertEqual(Reminders.defaultDays(Reminders.weekKey), 1)
        XCTAssertEqual(Reminders.defaultDays(Reminders.bedtimeKey), Reminders.everyDay)
    }

    func testWeighInAlreadyOnKeepsEveryDay() {
        let defaults = fresh()
        defaults.set(true, forKey: Reminders.weightKey)
        Reminders.adoptNewDefaults(defaults)
        XCTAssertEqual(defaults.object(forKey: Reminders.daysKey(Reminders.weightKey)) as? Int, Reminders.everyDay)
    }

    // MARK: Daily cap and meal nudges

    private func tomorrow(_ id: String, hour: Int, category: String? = nil) -> UNNotificationRequest {
        let day = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: Date()))!
        let fire = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: day)!
        let content = UNMutableNotificationContent()
        if let category { content.categoryIdentifier = category }
        let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        return UNNotificationRequest(identifier: "aurin." + id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
    }

    func testFullDayDropsWaterFirstAndKeepsThePill() {
        let planned = [tomorrow("water.600", hour: 10), tomorrow("water.780", hour: 13), tomorrow("meal.lunch.1", hour: 14),
                       tomorrow("meal.dinner.1", hour: 20), tomorrow("weight.2", hour: 7), tomorrow("food.1", hour: 21),
                       tomorrow("pill.1", hour: 21, category: Reminders.pillCategory)]
        let kept = Set(Reminders.capped(planned, perDay: 4).map(\.identifier))
        XCTAssertEqual(kept, ["aurin.meal.lunch.1", "aurin.meal.dinner.1", "aurin.food.1", "aurin.weight.2", "aurin.pill.1"])
    }

    func testLunchAndDinnerAreNudgedFirst() {
        let ids = Reminders.meals.map(\.id).sorted { Reminders.nudgeRank($0) < Reminders.nudgeRank($1) }
        XCTAssertEqual(Array(ids.prefix(2)), ["lunch", "dinner"])
        XCTAssertTrue(Reminders.isMealNudge("aurin.meal.lunch.0"))
        XCTAssertTrue(Reminders.isMealNudge("aurin.food.3"))
        XCTAssertFalse(Reminders.isMealNudge("aurin.water.600"))
    }

    func testLoggedMealsOnlyForTheirDay() {
        let defaults = fresh()
        defaults.set("2026-11-23|breakfast,lunch", forKey: "remind.loggedMeals")
        XCTAssertEqual(Reminders.loggedMeals(on: "2026-11-23", defaults), ["breakfast", "lunch"])
        XCTAssertTrue(Reminders.loggedMeals(on: "2026-11-24", defaults).isEmpty)
    }
}
