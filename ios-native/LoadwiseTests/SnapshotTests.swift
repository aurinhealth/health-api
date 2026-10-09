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

    func testNewScreens() throws {
        try render("add-sheet", height: 1000) { AddSheet().environment(AppModel(demo: true)) }
        try render("body-map", height: 320) {
            BodyMap(load: ["chest": 1, "biceps": 0.6, "quads": 0.3], selected: ["chest"]).padding(20)
        }
        try render("sleep-settings", height: 800) { NavigationStack { SleepSettingsView(given: SettingsStore(api: APIClient(), demo: true)) }.environment(AppModel(demo: true)) }
    }

    func testCoachMarkdownBlocks() {
        let text = "## Shrnutí\nDnes **lehce**.\n\n- spánek\n- HRV\n\n1. rozjezd\n2. klid\n\n| den | km |\n|---|---|\n| po | 10 |\n\n---"
        let blocks = CoachMarkdown.blocks(text)
        XCTAssertEqual(blocks.first, .heading(2, "Shrnutí"))
        XCTAssertTrue(blocks.contains(.bullets(["spánek", "HRV"])))
        XCTAssertTrue(blocks.contains(.numbered(["rozjezd", "klid"])))
        XCTAssertTrue(blocks.contains(.table([["den", "km"], ["po", "10"]])))
        XCTAssertEqual(blocks.last, .rule)
    }

    func testBodyFigurePaths() {
        for part in BodyFigure.front + BodyFigure.back {
            let box = SVGPath.parse(part.path).boundingRect
            XCTAssertFalse(box.isEmpty, part.id)
            XCTAssertLessThanOrEqual(box.maxX, BodyFigure.size.width + 1, part.id)
            XCTAssertLessThanOrEqual(box.maxY, BodyFigure.size.height + 1, part.id)
        }
        XCTAssertEqual(BodyFigure.label("biceps"), BodyFigure.muscles.first { $0.id == "biceps" }?.label)
    }

    func testDeepLinks() {
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/sleep")!), .sleep)
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/gym/2026-10-08")!), .gym("2026-10-08"))
        XCTAssertNil(AppRoute(url: URL(string: "loadwise://open/food")!))
        XCTAssertNil(AppRoute(url: URL(string: "https://open/sleep")!))
        XCTAssertEqual(TabLink.tab(URL(string: "loadwise://open/food")!), .food)
        let model = AppModel(demo: true)
        model.handle(URL(string: "loadwise://open/sleep")!)
        XCTAssertEqual(model.tab, .health)
        XCTAssertEqual(model.paths[.health], [.sleep])
    }

    func testNewFieldsDecode() throws {
        let food = DemoData.food
        XCTAssertEqual(food.macros.fiber?.target, 32)
        XCTAssertEqual(food.water.drinks?.count, 3)
        XCTAssertEqual(food.water.drunkMl, 1600)
        XCTAssertEqual(DemoData.today.plan.first?.sport, "strength")
        XCTAssertEqual(DemoData.today.tonight?.wakeSet, true)
        let result = try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ahoj","visuals":["sleep","form"]}"#.utf8))
        XCTAssertEqual(result.visuals, ["sleep", "form"])
        let old = try JSONDecoder().decode(AssistantResult.self, from: Data(#"{"status":"ok","answer":"Ahoj"}"#.utf8))
        XCTAssertNil(old.visuals)
        let snapshot = WidgetSnapshot.sample
        XCTAssertEqual(snapshot.readiness, 78)
    }

    func testPlanEditing() {
        var day = DemoData.gym
        day.moveExercise(from: 2, to: 0)
        XCTAssertEqual(day.exercises.map(\.name), ["Přítahy v předklonu", "Dřep", "Tlak na lavici"])
        day.moveExercise(from: 0, to: 3)
        XCTAssertEqual(day.exercises.map(\.name), ["Dřep", "Tlak na lavici", "Přítahy v předklonu"])
        XCTAssertEqual(day.planName, "Celé tělo", "the head of the sheet stays")

        let sets = day.exercises[1].sets.count
        day.addSet(at: 1)
        XCTAssertEqual(day.exercises[1].sets.count, sets + 1)
        XCTAssertEqual(day.exercises[1].sets.last?.done, false)
        day.removeSet(at: 1)
        XCTAssertEqual(day.exercises[1].sets.count, sets)

        day.removeExercise(at: 0)
        XCTAssertEqual(day.exercises.first?.name, "Dřep", "a done set stays recorded")
        XCTAssertTrue(day.exercises[0].sets.allSatisfy(\.done))
        day.addExercise("Leg press", sets: 3, reps: "10-12")
        XCTAssertEqual(day.exercises.last?.name, "Leg press")
        XCTAssertEqual(day.exercises.last?.sets.map(\.plannedReps), ["10-12", "10-12", "10-12"])
        guard case .array(let rows) = day.saveBody["values"] else { return XCTFail("body") }
        XCTAssertEqual(rows.count, day.exercises.reduce(0) { $0 + $1.sets.count })
    }

    func testMealSlotsAndTargets() {
        let late = Calendar.current.date(bySettingHour: 21, minute: 15, second: 0, of: Date())!
        XCTAssertEqual(MealSlot.now(late), "dinner")
        XCTAssertEqual(MealSlot.now(late, slots: ["breakfast", "lunch", "dinner", "snack_late"]), "snack_late")
        let morning = Calendar.current.date(bySettingHour: 10, minute: 30, second: 0, of: Date())!
        XCTAssertTrue(["breakfast", "lunch"].contains(MealSlot.now(morning, slots: ["breakfast", "lunch", "dinner"])), "a meal the day has")
        XCTAssertEqual(MealSlot.toMeal("snack_late"), "k druhé večeři")
        let food = DemoData.food
        XCTAssertEqual(food.mealSlots?.count, 5)
        XCTAssertEqual(food.meals.first { $0.type == "lunch" }?.target?.kcal, 800)
        XCTAssertEqual(food.macros.sugar?.target, 66)
        XCTAssertEqual(food.meals[0].entries[0].sugar, 14)
        let recipe = try? JSONDecoder().decode(FoodRecipe.self, from: Data(#"{"id":"r1","name":"Rizoto","servings":2,"ingredients":[{"name":"Rýže","quantity":150,"unit":"g","calories":540}],"portion":{"name":"Rizoto","nutrition_basis":"portion","calories_100g":420,"protein_100g":30,"carbs_100g":50,"fat_100g":9},"calories":840}"#.utf8))
        XCTAssertEqual(recipe?.product.kcal(for: 1), 420)
        XCTAssertEqual(recipe?.product.source, "composed", "a recipe portion is not saved again as a food")
    }

    func testEquipmentAndLibrary() throws {
        let home = GymEquipment(equipment: "home", selected: ["dumbbells", "adjustable_bench"], gymName: "", gymUrl: "", dumbbellWeights: [5, 10])
        let curl = try JSONDecoder().decode(GymCatalogExercise.self, from: Data(#"{"name":"DB curl","muscle":"Biceps","stations":["dumbbells"]}"#.utf8))
        let press = try JSONDecoder().decode(GymCatalogExercise.self, from: Data(#"{"name":"Leg press","muscle":"Přední stehna","stations":["pivot_leg_press"],"muscles":{"quads":1,"hips":0.5}}"#.utf8))
        XCTAssertTrue(EquipmentView.fits(curl, home))
        XCTAssertFalse(EquipmentView.fits(press, home))
        XCTAssertTrue(ExerciseCatalog.works(curl, "biceps"), "an older server without the muscle map: by the muscle name")
        XCTAssertFalse(ExerciseCatalog.works(curl, "upper_back"))
        XCTAssertTrue(ExerciseCatalog.works(press, "quads"))
        XCTAssertFalse(ExerciseCatalog.works(press, "calves"))
        XCTAssertEqual(EquipmentView.summary(home), "Domácí posilovna · 2 věci")
        XCTAssertEqual(EquipmentView.kg(2.5), "2,5 kg")
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/vo2max")!), .vo2max)
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/library/run")!), .workoutLibrary("run"))
    }

    func testRoundTwoScreens() throws {
        let vo2 = try XCTUnwrap(DemoData.training.vo2max)
        try render("training-vo2max", glow: Palette.Glow.training) { VO2maxContent(vo2: vo2).padding(.top, 50).padding(.bottom, 40) }
        try render("plan-editor", height: 700) { PlanEditorSheet(day: DemoData.gym, catalog: [], save: { _ in }) }
        try render("body-map-legend", height: 360) {
            BodyMap(load: ["quads": 1, "hips": 0.6, "hamstrings": 0.35, "calves": 0.2], height: 280, legend: true).padding(20)
        }
        try render("drink-settings", height: 1000) { NavigationStack { DrinkSettingsView() } }
        try render("gym-rest-settings", height: 500) { NavigationStack { GymRestSettingsView() } }
        try render("food-amount-edit", height: 1100) {
            NavigationStack { FoodAmountView(product: DemoData.foods[0], meal: "snack_late", editing: true) }.environment(AppModel(demo: true))
        }
    }

    func testCalendarData() throws {
        let json = """
        {"status":"ok","start":"2026-10-05","end":"2026-10-06","today":"2026-10-06","days":[
         {"date":"2026-10-05","primary":"ride","count":2,"minutes":125,"kcal":1250,"planned":0,"activities":[
          {"id":"activity:i1","sport":"ride","status":"done","title":"Ranní kolo","date":"2026-10-05","time":"07:00","minutes":90,"km":42.3,"kcal":1100,"activityId":"i1","eventId":null},
          {"id":"g2","sport":"walk","status":"done","title":"Chůze","date":"2026-10-05","time":"17:00","minutes":35,"km":3.1,"kcal":150,"activityId":null,"eventId":null}]},
         {"date":"2026-10-06","primary":"rest","count":0,"minutes":0,"kcal":0,"planned":0,"activities":[]}]}
        """
        let calendar = try JSONDecoder().decode(TrainingCalendar.self, from: Data(json.utf8))
        let ride = try XCTUnwrap(calendar.days.first?.activities.first)
        XCTAssertEqual(ride.session.kind, "activity")
        XCTAssertEqual(CalendarDayList.route(ride), .activity(ride.session))
        XCTAssertEqual(CalendarActivityRow.detail(ride), "Kolo · 07:00 · 1 h 30 min · 42,3 km")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .count), "2")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .time), "2:05")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .kcal), Fmt.int(1250))
        XCTAssertEqual(MonthGrid.value(calendar.days.last, .count), " ")
        // October 2026 starts on a Thursday: three empty cells first.
        let grid = ISODay.monthGrid("2026-10-15")
        XCTAssertEqual(grid.first?.prefix(4).map { $0 ?? "" }, ["", "", "", "2026-10-01"])
        XCTAssertEqual(grid.flatMap { $0 }.compactMap { $0 }.count, 31)
        XCTAssertEqual(ISODay.addMonths("2026-12-20", 1), "2027-01-01")
        XCTAssertEqual(ISODay.monthEnd("2026-02-10"), "2026-02-28")
        XCTAssertEqual(ISODay.weekdayIndex("2026-10-12"), 0)
        XCTAssertEqual(ISODay.monthTitle("2026-10-01"), "Říjen 2026")
        XCTAssertFalse(DemoData.calendarByDate.isEmpty)
    }

    func testRoundThreeLogic() {
        let months = VO2maxContent.months([("2026-08-30", 47), ("2026-09-01", 47.5), ("2026-09-20", 48.5), ("2026-10-02", 48)])
        XCTAssertEqual(months.map(\.month), ["2026-10-01", "2026-09-01", "2026-08-01"])
        XCTAssertEqual(months[1].average, 48)
        XCTAssertEqual(months[1].change, 1)
        XCTAssertNil(months[2].change)
        XCTAssertEqual(VO2maxMonths.change(0), "=")
        XCTAssertEqual(StageTotals.note(share: 0.19, wakeups: 3), "19 %")
        XCTAssertEqual(StageTotals.note(share: nil, wakeups: 3), "3×")
        let entry = FoodSnapshot.Entry(id: 1, name: "Jogurt", time: "08:00", meal: "breakfast", kcal: 133, protein: 14, carbs: 6, fat: 5,
                                       amount: "140 g", brand: "Madeta", fiber: nil, sugar: 6, salt: 0.15)
        XCTAssertEqual(FoodEntryCard.detail(entry), "140 g · Madeta · 08:00")
        XCTAssertEqual(FoodEntryCard.extras(entry), "vláknina – · cukry 6,0 g · sůl 0,15 g")
    }

    func testRoundThreeScreens() throws {
        let model = AppModel(demo: true)
        let today = DemoData.training.date
        try render("training-calendar", glow: Palette.Glow.training, height: 700) {
            NavigationStack {
                VStack(spacing: 16) {
                    MonthGrid(month: ISODay.monthStart(today), today: today, selected: today, mode: .time, days: DemoData.calendarByDate, pick: { _ in }, move: { _ in })
                    CalendarDayList(date: ISODay.shift(today, -2), today: today, day: DemoData.calendarByDate[ISODay.shift(today, -2)])
                }
                .padding(.vertical, 14)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 24))
                .padding(24)
            }
            .environment(model)
        }
        try render("calendar-days", glow: Palette.Glow.training, height: 140) {
            HStack(spacing: 0) {
                ForEach(-2...2, id: \.self) { i in
                    let date = ISODay.shift(today, i)
                    DayCircle(date: date, today: today, selected: i == 0, day: DemoData.calendarByDate[date])
                }
            }
            .padding(20)
        }
        let breakfast = try XCTUnwrap(DemoData.food.meals.first)
        try render("meal-detail", glow: Palette.Glow.food, height: 1100) {
            MealDetailContent(meal: breakfast).environment(model)
        }
        try render("library-widget", glow: Palette.Glow.training, height: 220) {
            NavigationStack { LibraryWidget().padding(24) }
        }
    }

    func testRoundFourLogic() {
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/library")!), .library)
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/library/gym")!), .workoutLibrary("gym"))
        let presets = DrinkPrefs.presets(favorites: ["water", "coffee", "tea"], saved: { $0 == "tea" ? [300, 400, 500] : nil })
        XCTAssertEqual(presets.map(\.id), ["water.250", "water.500", "coffee.200", "tea.300", "tea.400"])
        XCTAssertEqual(DrinkPrefs.presets(favorites: DrinkKind.all.map(\.id), saved: { _ in nil }).count, 8, "at most eight choices")
        XCTAssertEqual(LibrarySport.find("run")?.label, "Běh")
        XCTAssertNil(LibrarySport.find("swim"))
    }

    func testRoundFourScreens() throws {
        let model = AppModel(demo: true)
        try render("training-tools", glow: Palette.Glow.training, height: 330) {
            NavigationStack { TrainingTools(today: DemoData.training.date).padding(24) }
        }
        try render("drinks-card", glow: Palette.Glow.food, height: 460) {
            DrinksCard(water: DemoData.food.water).environment(model).padding(24)
        }
        try render("library-choice", glow: Palette.Glow.training, height: 520) {
            NavigationStack { TrainingLibraryView() }.environment(model)
        }
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
