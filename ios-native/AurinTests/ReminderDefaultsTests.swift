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
}
