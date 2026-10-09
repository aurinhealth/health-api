import SwiftUI
import XCTest
@testable import Loadwise

/// Renders whole screens with the sample data to PNG, in light and dark mode.
/// CI passes SNAPSHOT_DIR (as TEST_RUNNER_SNAPSHOT_DIR) and uploads the images,
/// so the design can be checked without a Mac.
@MainActor
final class SnapshotTests: XCTestCase {
    private var outputDirectory: URL {
        let path = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"]
        return path.map { URL(fileURLWithPath: $0) } ?? FileManager.default.temporaryDirectory.appending(path: "snapshots")
    }

    func testTodayScreen() throws {
        try render("today", glow: Palette.Glow.today) { TodayContent(today: DemoData.today).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
    }

    func testTrainingScreen() throws {
        try render("training", glow: Palette.Glow.training) { TrainingContent(training: DemoData.training).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
    }

    func testFormDetailScreen() throws {
        try render("training-form", glow: Palette.Glow.training) { FormDetailContent(training: DemoData.training).padding(.top, 50).padding(.bottom, 40) }
    }

    func testHealthScreens() throws {
        let health = DemoData.health
        try render("health", glow: Palette.Glow.health) { NavigationStack { HealthContent(health: health) }.padding(.top, 50).padding(.bottom, 40) }
        try render("health-readiness", glow: Palette.Glow.health) { ReadinessDetailContent(health: health).padding(24).padding(.top, 30) }
        try render("health-sleep", glow: Palette.Glow.health) { SleepDetailContent(health: health, detail: nil).padding(24).padding(.top, 30) }
        try render("health-heart", glow: Palette.Glow.health) { HeartDetailContent(health: health).padding(24).padding(.top, 30) }
        try render("health-weight", glow: Palette.Glow.health) { WeightDetailContent(health: health).padding(24).padding(.top, 30) }
    }

    func testWorkoutScreens() throws {
        let gymDay = DemoData.gym
        try render("gym", glow: Palette.Glow.training) {
            VStack(spacing: 12) { ForEach(gymDay.exercises) { ExerciseCard(exercise: $0, onSet: { _, _, _, _ in }, onUndo: { _ in }, onTechnique: {}, onAlternatives: {}) } }
                .padding(24).padding(.top, 30)
        }
        let sessions = DemoData.training.sessions ?? []
        try render("training-sessions", glow: Palette.Glow.training) { NavigationStack { WeekSessionsList(sessions: sessions, today: "2026-10-08") }.padding(24).frame(height: 600) }
    }

    func testFoodScreens() throws {
        try render("food", glow: Palette.Glow.food) { FoodContent(food: DemoData.food).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
        try render("food-amount", height: 700) { NavigationStack { FoodAmountView(product: DemoData.foods[0], meal: "snack_pm") }.environment(AppModel(demo: true)) }
    }

    func testHealthAndFoodDecode() throws {
        let h = DemoData.health
        XCTAssertEqual(h.readiness.score, 89)
        XCTAssertEqual(h.readiness.parts.map(\.key), ["hrv", "restingHR", "sleep"])
        XCTAssertEqual(h.sleep.night?.stages?.deep, 83)
        let f = DemoData.food
        XCTAssertEqual(f.meals.map(\.type), ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"])
        XCTAssertEqual(f.meals[3].suggestion?.kcal, 360)
        let yogurt = DemoData.foods[0]
        XCTAssertEqual(yogurt.defaultAmount, 140)
        XCTAssertEqual(yogurt.kcal(for: 140) ?? 0, 133, accuracy: 0.01)
        XCTAssertEqual(MealSlot.now(Calendar.current.date(bySettingHour: 15, minute: 0, second: 0, of: Date())!), "snack_pm")
        // Lenient product decoding: text numbers and unknown keys.
        let product = try JSONDecoder().decode(FoodProduct.self, from: Data(#"{"name":"Rohlík","calories_100g":"287","protein_100g":9.2,"serving_size":"43 g","id":12,"confidence":"high"}"#.utf8))
        XCTAssertEqual(product.calories_100g, 287)
        XCTAssertEqual(product.defaultAmount, 43)
        // The empty shapes the server returns without data.
        let emptyHealth = """
        {"status":"ok","date":"2026-10-08","readiness":{"score":null,"zone":null,"missing":[],"flags":[],"parts":[],"hrv":null,"restingHR":null,"sleepMinutes":null,"strainYesterday":null,"history":[]},
         "sleep":{"night":null,"week":[],"need":480,"tonight":{"need":480,"base":480,"strain":0,"hrv":0,"debt":0,"naps":0,"bedtime":null,"wake":null},"debt":null,"regularity":null},
         "hrv":null,"restingHR":null,"respiration":null,"skinTemp":null,"oxygen":null,"weight":null}
        """
        XCTAssertNil(try JSONDecoder().decode(HealthSnapshot.self, from: Data(emptyHealth.utf8)).weight)
        let emptyFood = """
        {"status":"ok","date":"2026-10-08","kcal":0,"target":null,"trainingBonus":null,"sentence":null,
         "macros":{"carbs":{"eaten":0,"target":null},"protein":{"eaten":0,"target":null},"fat":{"eaten":0,"target":null}},"meals":[],"water":{"ml":null,"target":null,"entries":0}}
        """
        XCTAssertTrue(try JSONDecoder().decode(FoodSnapshot.self, from: Data(emptyFood.utf8)).meals.isEmpty)
    }

    func testGymPlan() throws {
        var day = DemoData.gym
        XCTAssertEqual(day.planName, "Celé tělo")
        let exercises = day.exercises
        XCTAssertEqual(exercises.map(\.name), ["Dřep", "Tlak na lavici", "Přítahy v předklonu"])
        XCTAssertEqual(exercises[0].sets.count, 4)
        XCTAssertTrue(exercises[0].sets[0].warmup)
        XCTAssertEqual(exercises[0].doneCount, 1)
        XCTAssertEqual(exercises[0].workCount, 3)
        XCTAssertEqual(exercises[1].superset, "A")

        let second = exercises[0].sets[2]
        day.complete(row: second.row, kg: "82.5", reps: "7", rpe: "10")
        XCTAssertEqual(day.exercises[0].doneCount, 2)
        XCTAssertEqual(day.values[second.row][5], .string("82.5"))
        XCTAssertEqual(day.values[second.row][11], .string("TRUE"), "RPE 10 is to failure")
        day.undo(row: second.row)
        XCTAssertEqual(day.exercises[0].doneCount, 1)

        day.replace(exercise: "Dřep", with: "Leg press")
        XCTAssertEqual(day.exercises.map(\.name), ["Dřep", "Leg press", "Tlak na lavici", "Přítahy v předklonu"], "done sets keep the old name")

        let body = day.saveBody
        guard case .array(let rows) = body["values"], case .array(let full) = body["fullValues"] else { return XCTFail("body") }
        XCTAssertEqual(full.count, rows.count + 7)
        XCTAssertEqual(rows.count, 8)
    }

    func testTrainingSessionsDecode() {
        let sessions = DemoData.training.sessions ?? []
        XCTAssertEqual(sessions.first { $0.activityId != nil }?.activityId, "i9001")
        XCTAssertEqual(sessions.first { $0.eventId != nil }?.eventId, "planned:42")
    }

    func testCoachActions() throws {
        let json = #"{"status":"ok","answer":"**Dnes** lehce.","chatId":12,"actions":[{"type":"move","eventId":"planned:9","date":"2026-10-10","reason":"Nohy potřebují den navíc.","draftId":456,"eventSnapshot":{"name":"Dlouhý běh","date":"2026-10-09","durationHours":1.5}},{"type":"workout","date":"2026-10-09","sport":"ride","minutes":60,"draftId":457,"preview":{"x":1}}]}"#
        let result = try JSONDecoder().decode(AssistantResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.chatId, 12)
        XCTAssertEqual(result.actions?.count, 2)
        XCTAssertEqual(result.actions?[0].title, "Přesunout „Dlouhý běh“ na So 10. října")
        XCTAssertEqual(result.actions?[1].title, "Naplánovat: jízda · 1 h · Pá 9. října")
        try render("coach-action", height: 300) {
            VStack { ForEach(result.actions ?? []) { ActionCard(action: $0, result: nil, decide: { _ in }) } }.padding(24)
        }
    }

    func testSettingsScreens() throws {
        let store = SettingsStore(api: APIClient(), demo: true)
        try render("settings", height: 1100) { NavigationStack { SettingsMenu(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-profile", height: 900) { NavigationStack { ProfileSettingsView(store: store) } }
        try render("settings-sources", height: 900) { NavigationStack { SourcesSettingsView(store: store) } }
    }

    func testJSONValueKeepsUnknownKeys() throws {
        let profile = try JSONDecoder().decode(JSONObject.self, from: Data(#"{"height":182,"sex":"male","birthDate":"x","extra":[1,null]}"#.utf8))
        var next = profile
        next.merge(["height": .field("183,5")]) { $1 }
        let back = try JSONDecoder().decode(JSONObject.self, from: JSONEncoder().encode(next))
        XCTAssertEqual(back["height"], .number(183.5))
        XCTAssertEqual(back["extra"], .array([.number(1), .null]))
        XCTAssertEqual(back["birthDate"], profile["birthDate"])
        XCTAssertEqual(JSONValue.field(""), .null)
        XCTAssertEqual(JSONValue.number(80).string, "80")
        XCTAssertEqual(ZonesSettingsView.pace(275), "4:35")
    }

    func testTrainingDemoDecodes() {
        let t = DemoData.training
        XCTAssertEqual(t.week, 41)
        XCTAssertEqual(t.days.count, 7)
        XCTAssertEqual(t.next?.exercises.first, "Dřep")
        XCTAssertEqual(t.event?.phases.map(\.state), ["done", "now", "next"])
        XCTAssertEqual(Fmt.weekdayShort("2026-10-08"), "Čt")
        XCTAssertEqual(Fmt.dayMonth("2026-11-01"), "1. listopadu")
        XCTAssertEqual(Fmt.relativeDay("2026-10-10", today: "2026-10-08"), "v sobotu")
        XCTAssertEqual(Fmt.duration(75), "1 h 15 min")
        XCTAssertEqual(Fmt.plural(24, "den", "dny", "dní"), "dní")
    }

    func testSignInScreen() throws {
        try render("login", height: 844) { LoginView().environment(AppModel()) }
    }

    func testDemoDataDecodes() {
        let today = DemoData.today
        XCTAssertEqual(today.readiness.score, 78)
        XCTAssertEqual(today.plan.count, 2)
        XCTAssertEqual(today.steps.hourly?.reduce(0, +), today.steps.today)
        XCTAssertEqual(Fmt.dayHeading(today.date), "ČTVRTEK 8. ŘÍJNA")
        XCTAssertEqual(Fmt.hoursMinutes(432), "7:12")
        XCTAssertEqual(Fmt.decimal(8.4), "8,4")
    }

    func testDayShift() {
        XCTAssertEqual(AppModel.shift("2026-10-09", by: -1), "2026-10-08")
        XCTAssertEqual(AppModel.shift("2026-03-01", by: -1), "2026-02-28")
        XCTAssertEqual(AppModel.shift("2026-10-25", by: 1), "2026-10-26", "across the end of summer time")
    }

    func testServerResponseDecodes() throws {
        // The shape src/app-today.js returns when there is no data yet.
        let json = """
        {"status":"ok","date":"2026-10-08","readiness":{"score":null,"zone":null,"missing":["hrv"],"flags":[]},"sleep":null,
         "strain":{"score":null,"planned":null},"hrv":null,"restingHR":null,"summary":null,
         "nutrition":{"kcal":null,"target":null,"trainingBonus":null,"protein":{"eaten":null,"target":null},"carbs":{"eaten":null,"target":null},
         "fat":{"eaten":null,"target":null},"water":{"ml":null,"target":null}},"plan":[],"tonight":null,
         "steps":{"today":null,"goal":10000,"week":[],"hourly":null,"usual":null,"hour":12},"weight":null}
        """
        let today = try JSONDecoder().decode(TodaySnapshot.self, from: Data(json.utf8))
        XCTAssertNil(today.readiness.score)
        XCTAssertEqual(today.steps.goal, 10000)
    }

    func testEmptyTrainingDecodes() throws {
        // The shape src/app-training.js returns without any data.
        let json = """
        {"status":"ok","date":"2026-10-08","week":41,"strain":{"score":null,"target":null,"band":null},
         "days":[{"date":"2026-10-05","strain":null,"planned":null,"today":false}],"next":null,"event":null,"form":null,
         "load":{"weeks":[{"start":"2026-10-05","week":41,"load":0,"planned":0}],"intensity":null},"zones":null,"vo2max":null,
         "activeCalories":null,"thisWeek":{"done":0,"planned":0,"doneLoad":0,"plannedLoad":0}}
        """
        let t = try JSONDecoder().decode(TrainingSnapshot.self, from: Data(json.utf8))
        XCTAssertNil(t.next)
        XCTAssertEqual(t.thisWeek.planned, 0)
    }

    private func render<V: View>(_ name: String, glow: Color = Palette.Glow.today, height: CGFloat? = nil, @ViewBuilder _ content: () -> V) throws {
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        for (suffix, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
            let view = content()
                .frame(width: 390, height: height)
                .background(ScreenBackground(glow: glow))
                .environment(\.colorScheme, scheme)
            let renderer = ImageRenderer(content: view)
            renderer.scale = 2
            let data = try XCTUnwrap(renderer.uiImage?.pngData(), "\(name) did not render")
            try data.write(to: outputDirectory.appending(path: "\(name)-\(suffix).png"))
        }
    }
}
