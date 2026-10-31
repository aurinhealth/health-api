import AppIntents
import XCTest
@testable import Aurin

/// What Siri says and the glass "Zapsat vodu" logs (App/SiriShortcuts.swift, Shared/QuickDrink.swift).
final class SiriShortcutsTests: XCTestCase {
    override func setUp() {
        L10n.setLanguage("cs")
        Units.setSystem("metric")
    }

    override func tearDown() {
        L10n.setLanguage("cs")
    }

    /// A locked phone asks for Face ID or the passcode before Siri reads or writes health data.
    func testHealthIntentsAskForUnlockOnALockedPhone() {
        let policies: [(String, IntentAuthenticationPolicy)] = [
            ("readiness", ReadinessTodayIntent.authenticationPolicy), ("workout", WorkoutTodayIntent.authenticationPolicy),
            ("activity", ActivityOfTheDayIntent.authenticationPolicy), ("sleep", SleepLastNightIntent.authenticationPolicy),
            ("coach", AskCoachIntent.authenticationPolicy), ("food", FoodLeftIntent.authenticationPolicy),
            ("drink", LogDrinkIntent.authenticationPolicy), ("weight", LogWeightIntent.authenticationPolicy),
            ("water", AddWaterIntent.authenticationPolicy), ("value", TodayValueIntent.authenticationPolicy)
        ]
        for (name, policy) in policies {
            guard case .requiresAuthentication = policy else { XCTFail("\(name) runs on a locked phone"); continue }
        }
    }

    func testReadinessSaysTheNumberTheWordAndTheAdvice() {
        XCTAssertEqual(SiriAnswer.readiness(score: 78, zone: "green", advice: " Dnes klidně tvrdý trénink. "),
                       "Připravenost je dnes 78, vysoká. Dnes klidně tvrdý trénink.")
        XCTAssertEqual(SiriAnswer.readiness(score: 41, zone: nil, advice: nil), "Připravenost je dnes 41.")
        XCTAssertTrue(SiriAnswer.readiness(score: nil, zone: "red", advice: "x").hasPrefix("Dnešní připravenost zatím není."))
    }

    func testReadinessInEnglish() {
        L10n.setLanguage("en")
        XCTAssertEqual(SiriAnswer.readiness(score: 78, zone: "yellow", advice: nil), "Your readiness today is 78, moderate.")
    }

    func testWeightSaysWhetherItWentOut() {
        XCTAssertEqual(SiriAnswer.weight(kg: 82.4, sent: true), "Zapsáno 82,4 kg.")
        XCTAssertEqual(SiriAnswer.weight(kg: 82, sent: false), "Zapsáno 82,0 kg. Odešle se, až bude signál.")
    }

    func testGlassIsTheSmallestSavedWaterAmount() {
        XCTAssertEqual(PendingDrinks.glassMl(saved: "500,330,0", imperial: false), 330)
        XCTAssertEqual(PendingDrinks.glassMl(saved: nil, imperial: false), 250)
        XCTAssertEqual(PendingDrinks.glassMl(saved: nil, imperial: true), Units.roundedMl(fluidOunces: 8))
    }

    func testWorkoutSaysWhatIsLeftThenWhatIsDoneThenTheCoachsPick() {
        let ride = TodaySnapshot.PlanItem(kind: "workout", time: "17:30", title: "Tempo 3 × 8 min", detail: nil, done: false)
        let gym = TodaySnapshot.PlanItem(kind: "workout", time: nil, title: "Posilovna", detail: nil, done: true)
        let meal = TodaySnapshot.PlanItem(kind: "meal", time: "12:00", title: "Oběd", detail: nil, done: false)
        XCTAssertEqual(SiriAnswer.workout(plan: [meal, gym, ride], pick: nil), "Dnes máš v plánu: Tempo 3 × 8 min, začátek v 17:30.")
        XCTAssertEqual(SiriAnswer.workout(plan: [gym], pick: nil), "Dnešní trénink máš hotový: Posilovna.")
        let pick = CoachPick.Option(kind: "run", title: "Lehký běh", detail: nil, reason: nil, best: true, action: "library")
        XCTAssertEqual(SiriAnswer.workout(plan: [meal], pick: pick), "Na dnes nemáš naplánovaný trénink. Aktivita dne doporučuje: Lehký běh.")
        XCTAssertEqual(SiriAnswer.activity(pick), "Aktivita dne: Lehký běh.")
    }

    func testSleepWithAndWithoutTheNight() {
        let night = TodaySnapshot.Sleep(minutes: 432, inBedMinutes: 458, index: 82, need: 525, start: "23:48", end: "07:02")
        let text = SiriAnswer.sleep(night)
        XCTAssertTrue(text.hasPrefix("Dnes v noci: "), text)
        XCTAssertTrue(text.contains("od 23:48 do 07:02. Index spánku 82. Potřeba byla "), text)
        XCTAssertTrue(SiriAnswer.sleep(nil).hasPrefix("Dnešní spánek zatím není."))
    }

    func testDrinkNamesTheDrinkAndAmount() {
        XCTAssertEqual(SiriAnswer.drink(SiriDrink.coffee.name, ml: 200, sent: true), "Zapsáno: Káva, 200 ml.")
        L10n.setLanguage("en")
        XCTAssertEqual(SiriAnswer.drink(SiriDrink.water.name, ml: 500, sent: true), "Logged: Water, 500 ml.")
    }

    func testFoodLeftListsWhatIsMissing() {
        typealias T = TodaySnapshot
        let left = T.Nutrition(kcal: 1380, target: 2650, trainingBonus: nil, protein: T.Macro(eaten: 84, target: 150),
                               carbs: T.Macro(eaten: 0, target: 0), fat: T.Macro(eaten: 0, target: 0), water: T.Water(ml: 2600, target: 2600))
        // Czech number and list formats put non-breaking spaces in "1 270" and after "a".
        XCTAssertEqual(SiriAnswer.foodLeft(left).replacingOccurrences(of: "\u{a0}", with: " "), "Dnes ti zbývá 1 270 kcal a 66 g bílkovin.")
        let done = T.Nutrition(kcal: 2700, target: 2650, trainingBonus: nil, protein: T.Macro(eaten: 150, target: 150),
                               carbs: T.Macro(eaten: 0, target: 0), fat: T.Macro(eaten: 0, target: 0), water: T.Water(ml: 3000, target: 2600))
        XCTAssertEqual(SiriAnswer.foodLeft(done), "Kalorie, bílkoviny i vodu máš na dnes splněné.")
    }

    func testCoachAnswerWithoutMarkdown() {
        XCTAssertEqual(SiriAnswer.coach("**Dnes** lehce.\n\n- Z2 45 min\n# Proč", proposal: false), "Dnes lehce.\nZ2 45 min\nProč")
        XCTAssertTrue(SiriAnswer.coach("Ok", proposal: true).hasSuffix("Návrh najdeš v aplikaci u kouče."))
    }
}
