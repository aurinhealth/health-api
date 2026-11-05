import SwiftUI
import XCTest
@testable import Aurin

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

    /// The tabs at the iPhone Duo's widths (duo-*): closed (466), a third and half
    /// of the open display in landscape (317, 475) and the whole of it (951, two
    /// columns: WideLayout).
    func testDuoWidths() throws {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        let widths: [(String, CGFloat)] = [("closed", 466), ("third", 317), ("half", 475), ("open", 951)]
        for (name, width) in widths {
            let wide = width >= WideLayout.minWidth
            try render("duo-\(name)-today", glow: Palette.Glow.today, width: width, window: true) {
                TodayContent(today: DemoData.today).padding(.top, 50).padding(.bottom, 40)
                    .environment(AppModel(demo: true)).environment(\.locale, L10n.locale).environment(\.wideLayout, wide)
            }
            // A NavigationStack does not measure its height, and a very tall window draws
            // nothing: these two stop at a set height, their top as on the screen.
            try render("duo-\(name)-health", glow: Palette.Glow.health, height: 1500, width: width, window: true) {
                NavigationStack { ScrollView { HealthContent(health: DemoData.health) }.scrollIndicators(.hidden) }.padding(.top, 50).padding(.bottom, 40)
                    .environment(AppModel(demo: true)).environment(\.locale, L10n.locale).environment(\.wideLayout, wide)
            }
            try render("duo-\(name)-food", glow: Palette.Glow.food, width: width, window: true) {
                FoodContent(food: DemoData.food).padding(.top, 50).padding(.bottom, 40)
                    .environment(AppModel(demo: true)).environment(\.locale, L10n.locale).environment(\.wideLayout, wide)
            }
            try render("duo-\(name)-training", glow: Palette.Glow.training, height: 1500, width: width, window: true) {
                ScrollView { TrainingContent(training: DemoData.training).padding(.top, 50) }.scrollIndicators(.hidden)
                    .environment(AppModel(demo: true)).environment(\.locale, L10n.locale).environment(\.wideLayout, wide)
            }
        }
    }

    func testRecoveryTimeDays() {
        // Half a day at most, never a clock time or hours (Today audit 15);
        // after 22:00 it counts for the next morning.
        var parts = DateComponents(year: 2026, month: 10, day: 15, hour: 23, minute: 30)
        let lateThursday = Calendar.current.date(from: parts) ?? Date()
        XCTAssertEqual(RecoveryTime.part(lateThursday, today: "2026-10-15"), "zítra dopoledne")
        parts.hour = 17
        let thursday = Calendar.current.date(from: parts) ?? Date()
        XCTAssertEqual(RecoveryTime.part(thursday, today: "2026-10-15"), "dnes večer")
        XCTAssertEqual(RecoveryTime.part(thursday, today: "2026-10-14"), "zítra večer")
        XCTAssertEqual(RecoveryTime.part(thursday, today: "2026-10-13"), "za 2 dny")
        parts.hour = 14
        XCTAssertEqual(RecoveryTime.short(Calendar.current.date(from: parts) ?? Date()), "Čt odpoledne")
        XCTAssertEqual(RecoveryTime.dayName("2026-10-11", today: "2026-10-15"), "neděle")
        XCTAssertEqual(RecoveryTime.dayName("2026-10-14", today: "2026-10-15"), "včera")
        let gym = RecoveryTime.Cause(kind: "gym", title: "Posilovna, celé tělo", detail: nil, date: "2026-10-11", hours: 96, readyAt: "2026-10-15T15:49:00Z")
        XCTAssertEqual(RecoveryTimeContent.detail(gym, today: "2026-10-15"), "neděle · svaly")
        // A yellow or red morning: hard training waits for a greener one.
        let time = DemoData.today.recoveryTime
        XCTAssertEqual(time.flatMap { RecoveryTime.hardLine($0, today: "2026-10-08", zone: "red") }, "tvrdý trénink ne dřív než po zelenějším ránu")
        // Still recovering on a red morning: the time, and a greener morning on top.
        parts.day = 16
        let friday = Calendar.current.date(from: parts) ?? Date()
        let ready = ISO8601DateFormatter().string(from: friday)
        let recovering = RecoveryTime(readyAt: ready, from: ready, lightAt: nil, hours: 0, progress: 0, causes: [])
        XCTAssertEqual(RecoveryTime.hardLine(recovering, today: "2026-10-15", zone: "red", now: thursday), "tvrdý trénink zítra odpoledne, po zelenějším ránu")
        // Passed already (an older Today kept on the phone): now, never "this evening" of yesterday.
        XCTAssertEqual(RecoveryTime.part(thursday, today: "2026-10-16"), "už teď")
        XCTAssertEqual(RecoveryTime.part(thursday, today: "2026-10-15", now: thursday.addingTimeInterval(60)), "už teď")
    }

    /// Dnes → Den: the night, readiness, done workout and its strain, steps,
    /// "teď", then the plan with bedtime last; no "teď" on another day.
    func testDayTimelineOrder() {
        let today = DemoData.today
        let rows = DayTimelineRows.make(today, now: 15 * 60)
        XCTAssertEqual(rows.map(\.id), ["sleep", "readiness", today.plan[0].id, "strain", "steps", "now", today.plan[1].id, today.plan[2].id])
        if case .strain(let end, let score, let added) = rows[3] {
            XCTAssertEqual(end, 7 * 60 + 30 + 42)
            XCTAssertEqual(score, 8.4)
            XCTAssertEqual(added, 5.1)
        } else {
            XCTFail("the strain follows the workout")
        }
        XCTAssertFalse(DayTimelineRows.make(today, now: nil).contains { $0.id == "now" })
        XCTAssertEqual(DayTimelineRows.stats(today.plan[0].session).map(\.label), ["Vzdálenost", "Délka", "Energie"])
    }

    /// A nap sits among what was done in the order of the day.
    func testDayTimelineNap() {
        var today = DemoData.today
        today.naps = [TodaySnapshot.Nap(start: "14:05", end: "15:43", minutes: 92)]
        let rows = DayTimelineRows.make(today, now: 17 * 60)
        XCTAssertEqual(rows.map(\.id), ["sleep", "readiness", today.plan[0].id, "strain", "nap-14:05", "steps", "now", today.plan[1].id, today.plan[2].id])
        today.naps = [TodaySnapshot.Nap(start: "06:00", end: "07:00", minutes: 60)]
        XCTAssertEqual(DayTimelineRows.make(today, now: nil)[2].id, "nap-06:00")
    }

    func testDayTimelineCard() throws {
        try render("today-den", height: 760) { DayTimeline(today: DemoData.today).padding(24).environment(AppModel(demo: true)) }
    }

    func testRecoveryTimeScreen() throws {
        let today = DemoData.today
        let time = try XCTUnwrap(today.recoveryTime)
        try render("today-recovery", glow: Palette.Glow.today) {
            RecoveryTimeContent(time: time, today: today.date, now: RecoveryTime.date("2026-10-08T08:00:00Z") ?? Date()).padding(24).padding(.top, 30)
        }
        try render("today-recovery-yellow", glow: Palette.Glow.today) {
            RecoveryTimeContent(time: time, today: today.date, zone: "yellow", now: RecoveryTime.date("2026-10-08T08:00:00Z") ?? Date()).padding(24).padding(.top, 30)
        }
    }

    func testTrainingScreen() throws {
        try render("training", glow: Palette.Glow.training) { TrainingContent(training: DemoData.training).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
    }

    func testFormDetailScreen() throws {
        try render("training-form", glow: Palette.Glow.training) { FormDetailContent(training: DemoData.training).padding(.top, 50).padding(.bottom, 40) }
    }

    func testHealthScreens() throws {
        let health = DemoData.health
        try render("health", glow: Palette.Glow.health) { NavigationStack { HealthContent(health: health) }.padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
        try render("health-readiness", glow: Palette.Glow.health) { ReadinessDetailContent(health: health).padding(24).padding(.top, 30) }
        try render("health-sleep", glow: Palette.Glow.health) { SleepDetailContent(health: health, detail: DemoData.night).padding(24).padding(.top, 30) }
        // The night's timeline didn't load: "Zkusit znovu" in the stages card.
        try render("health-sleep-failed", glow: Palette.Glow.health) { SleepDetailContent(health: health, detail: nil, failed: true).padding(24).padding(.top, 30) }
        for metric in HealthMetric.allCases {
            try render("health-" + metric.rawValue, glow: Palette.Glow.health) { MetricDetailContent(metric: metric, health: health).padding(24).padding(.top, 30) }
        }
        try render("health-weight", glow: Palette.Glow.health) { WeightDetailContent(health: health).padding(24).padding(.top, 30) }
    }

    func testWorkoutScreens() throws {
        let gymDay = DemoData.gym
        try render("gym", glow: Palette.Glow.training) {
            VStack(spacing: 12) { ForEach(gymDay.exercises) { ExerciseCard(exercise: $0, onSet: { _, _, _, _ in }, onUndo: { _ in }, onTechnique: {}, onAlternatives: {}) } }
                .padding(24).padding(.top, 30)
        }
        let sessions = DemoData.training.sessions ?? []
        try render("training-sessions", glow: Palette.Glow.training) { NavigationStack { WeekSessionsList(sessions: sessions, today: "2026-10-08") }.environment(AppModel(demo: true)).padding(24).frame(height: 600) }
    }

    func testFoodScreens() throws {
        try render("food", glow: Palette.Glow.food) { FoodContent(food: DemoData.food).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
        var pinned = DemoData.food
        pinned.nutrients = DemoData.pinnedNutrients
        try render("food-nutrients-pinned", glow: Palette.Glow.food) { FoodContent(food: pinned).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)) }
        try render("nutrients", glow: Palette.Glow.food) { VStack(spacing: 0) { NutrientsTopBar(title: "Živiny", back: {}) { Text("Upravit").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted) }; NutrientsContent(page: DemoData.nutrients, week: .constant(false), date: "2026-10-08", editTarget: { _ in }).padding(.top, 20) }.padding(24).padding(.top, 30).environment(AppModel(demo: true)) }
        try render("nutrients-free", glow: Palette.Glow.food) { VStack(spacing: 0) { NutrientsTopBar(title: "Živiny", back: {}); NutrientsContent(page: DemoData.nutrientsFree, week: .constant(false), date: "2026-10-08", editTarget: { _ in }).padding(.top, 20) }.padding(24).padding(.top, 30).environment(AppModel(demo: true)) }
        try render("nutrient-detail", glow: Palette.Glow.food) { VStack(spacing: 0) { NutrientsTopBar(title: DemoData.nutrientDetail.name, back: {}); NutrientDetailContent(detail: DemoData.nutrientDetail) }.padding(24).padding(.top, 30) }
        try render("nutrient-favorites", glow: Palette.Glow.food) { VStack(spacing: 0) { NutrientsTopBar(title: "Na obrazovce Jídlo", back: {}); NutrientFavoritesList(items: DemoData.nutrients.items, chosen: .constant(DemoData.nutrients.favorites)).padding(.top, 24) }.padding(24).padding(.top, 30) }
        try render("food-amount", height: 700) { NavigationStack { FoodAmountView(product: DemoData.foods[0], meal: "snack_pm") }.environment(AppModel(demo: true)) }
    }

    func testHealthAndFoodDecode() throws {
        let h = DemoData.health
        XCTAssertEqual(h.readiness.score, 78, "the same morning as Today")
        XCTAssertEqual(h.readiness.parts.map(\.key), ["sleep", "restingHR", "hrv"])
        XCTAssertEqual(h.sleep.night?.stages?.deep, 83)
        let f = DemoData.food
        XCTAssertEqual(f.meals.map(\.type), ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"])
        XCTAssertEqual(f.meals[3].suggestion?.kcal, 360)
        let yogurt = DemoData.foods[0]
        XCTAssertEqual(yogurt.defaultAmount, 140)
        XCTAssertEqual(yogurt.kcal(for: 140) ?? 0, 205, accuracy: 0.5)
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
        XCTAssertEqual(exercises.map(\.name), ["Dřep", "Tlak na lavici", "Přítahy", "Rumunský mrtvý tah", "Výpady"])
        XCTAssertEqual(exercises[0].sets.count, 5)
        XCTAssertTrue(exercises[0].sets[0].warmup)
        XCTAssertEqual(exercises[0].doneCount, 1)
        XCTAssertEqual(exercises[0].workCount, 4)
        XCTAssertEqual(exercises[1].superset, "A")

        let second = exercises[0].sets[2]
        day.complete(row: second.row, kg: "82.5", reps: "7", rpe: "10")
        XCTAssertEqual(day.exercises[0].doneCount, 2)
        XCTAssertEqual(day.values[second.row][5], .string("82.5"))
        XCTAssertEqual(day.values[second.row][11], .string("TRUE"), "RPE 10 is to failure")
        day.undo(row: second.row)
        XCTAssertEqual(day.exercises[0].doneCount, 1)

        day.replace(exercise: "Dřep", with: "Leg press")
        XCTAssertEqual(day.exercises.map(\.name), ["Dřep", "Leg press", "Tlak na lavici", "Přítahy", "Rumunský mrtvý tah", "Výpady"], "done sets keep the old name")

        let body = day.saveBody
        guard case .array(let rows) = body["values"], case .array(let full) = body["fullValues"] else { return XCTFail("body") }
        XCTAssertEqual(full.count, rows.count + 7)
        XCTAssertEqual(rows.count, 17)
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

    /// Under the last answer: copy, thumbs and the time; copied, up and down; and the panel after a thumb down.
    func testCoachAnswerActions() throws {
        let at = Date(timeIntervalSince1970: 1_793_213_880)
        try render("coach-answer-actions", height: 520) {
            VStack(alignment: .leading, spacing: 14) {
                BubbleView(bubble: CoachView.Bubble(mine: false, text: "Ano. HRV je zpátky v obvyklém rozmezí a spal jsi 7:12, takže dnes sedí plánované **VO2max 5×4 min**.", at: at),
                           last: true, rate: { _ in }, decide: { _, _ in })
                AnswerActions(text: "x", rating: "up", at: at, rate: { _ in })
                AnswerActions(text: "x", rating: "down", at: at, rate: { _ in })
                AnswerActions(text: "x", rating: nil, at: nil, rate: nil)
            }
            .padding(24).environment(AppModel(demo: true))
        }
        try render("coach-answer-feedback", height: 420) {
            AnswerFeedbackSheet(send: { _ in }, report: {})
        }
    }

    /// The coach's swim cards: 8×100 m at CSS in the pool, and open water with the safety line.
    func testCoachSwimCards() throws {
        func step(_ meters: Int, _ pct: Double, css: Double = 108, rest: Bool = false) -> String {
            let pace = css * 100 / pct
            return rest ? #"{"durationSeconds":15,"percentLow":0,"percentHigh":0,"rest":true}"# : #"{"durationSeconds":\#(Double(meters) / 100 * pace),"percentLow":\#(pct - 2),"percentHigh":\#(pct + 2),"paceSlow":\#(pace + 2),"paceFast":\#(pace - 2),"meters":\#(meters)}"#
        }
        let css = "[" + [#"{"repeats":1,"steps":[\#(step(300, 86))]}"#, #"{"repeats":8,"steps":[\#(step(100, 100)),\#(step(0, 0, rest: true))]}"#, #"{"repeats":1,"steps":[\#(step(200, 86)),\#(step(100, 84))]}"#].joined(separator: ",") + "]"
        let lake = "[" + [#"{"repeats":1,"steps":[\#(step(200, 86))]}"#, #"{"repeats":6,"steps":[\#(step(50, 96)),\#(step(50, 88))]}"#, #"{"repeats":1,"steps":[\#(step(1100, 95)),\#(step(100, 84))]}"#].joined(separator: ",") + "]"
        let json = #"{"status":"ok","answer":"Prahové série v CSS.","chatId":13,"actions":[{"type":"workout","date":"2026-11-06","sport":"swim","minutes":45,"kind":"threshold","draftId":460,"reason":"CSS","preview":{"workout":{"id":"swim-css-8x100","name":"Práh 8×100 m","primary_system":"threshold","duration_minutes":45,"distance_meters":1900,"environment":"indoor","steps":\#(css)}}},{"type":"workout","date":"2026-11-07","sport":"swim","minutes":45,"kind":"endurance","openWater":true,"draftId":461,"reason":"Volná voda","preview":{"workout":{"id":"swim-open-water-2000","name":"Volná voda 2000 m","primary_system":"endurance","duration_minutes":45,"distance_meters":2000,"environment":"outdoor","steps":\#(lake)}}}]}"#
        let result = try JSONDecoder().decode(AssistantResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.actions?[1].openWater, true)
        try render("coach-swim-cards", height: 640) {
            VStack(spacing: 14) { ForEach(result.actions ?? []) { ActionCard(action: $0, result: nil, decide: { _ in }) } }.padding(24)
        }
    }

    func testEnglishAndImperial() throws {
        L10n.setLanguage("en")
        Units.setSystem("imperial")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
            Units.setSystem("metric")
        }
        XCTAssertEqual(L10n.tr("Spánek"), "Sleep")
        XCTAssertEqual(RecoveryTime.part(Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 16, hour: 14)) ?? Date(), today: "2026-10-15"), "tomorrow afternoon")
        XCTAssertEqual(L10n.tr("text bez překladu"), "text bez překladu")
        XCTAssertEqual(L10n.plural("dní", 5), "days")
        XCTAssertEqual(Units.weightText(100, digits: 0), "220 lb")
        XCTAssertEqual(Units.distanceText(10), "6.2 mi")
        // Every translation keeps the placeholders of its Czech key.
        let path = try XCTUnwrap(Bundle(for: AppModel.self).path(forResource: "en", ofType: "lproj"))
        let table = try XCTUnwrap(NSDictionary(contentsOfFile: path + "/Localizable.strings") as? [String: String])
        XCTAssertGreaterThan(table.count, 1000)
        let specifier = try NSRegularExpression(pattern: "%(?:[0-9]+\\$)?(@|lld|lf|d|%)")
        func specifiers(_ s: String) -> [String] {
            specifier.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { (s as NSString).substring(with: $0.range(at: 1)) }.sorted()
        }
        for (key, value) in table { XCTAssertEqual(specifiers(key), specifiers(value), key) }
        try render("today-en", glow: Palette.Glow.today) { TodayContent(today: DemoData.today).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)).environment(\.locale, L10n.locale) }
        try render("health-weight-en", glow: Palette.Glow.health) { WeightDetailContent(health: DemoData.health).padding(24).padding(.top, 30) }
        let store = SettingsStore(api: APIClient(), demo: true)
        try render("settings-en", height: 1100) { NavigationStack { SettingsMenu(store: store) }.environment(AppModel(demo: true)).environment(\.locale, L10n.locale) }
    }

    /// The long Today in English and metric units: the website's coach chapter is cut from it.
    func testWebsiteToday() throws {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        try render("site-today", glow: Palette.Glow.today) { TodayContent(today: DemoData.today).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)).environment(\.locale, L10n.locale) }
        // Whole screens for the website's scenes, longer than the simulator's screenshots.
        let health = DemoData.health
        try render("site-sleep", glow: Palette.Glow.health) { SleepDetailContent(health: health, detail: DemoData.night).padding(24).padding(.top, 30).environment(\.locale, L10n.locale) }
        try render("site-readiness", glow: Palette.Glow.health) { ReadinessDetailContent(health: health).padding(24).padding(.top, 30).environment(\.locale, L10n.locale) }
        try render("site-food", glow: Palette.Glow.food) { FoodContent(food: DemoData.food).padding(.top, 50).padding(.bottom, 40).environment(AppModel(demo: true)).environment(\.locale, L10n.locale) }
        try render("site-gym", glow: Palette.Glow.training) {
            VStack(spacing: 12) { ForEach(DemoData.gym.exercises) { ExerciseCard(exercise: $0, onSet: { _, _, _, _ in }, onUndo: { _ in }, onTechnique: {}, onAlternatives: {}) } }
                .padding(24).padding(.top, 30).environment(\.locale, L10n.locale)
        }
    }

    func testSettingsScreens() throws {
        let store = SettingsStore(api: APIClient(), demo: true)
        try render("settings", height: 1700) { NavigationStack { SettingsMenu(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-profile", height: 900) { NavigationStack { ProfileSettingsView(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-sources", height: 900) { NavigationStack { SourcesSettingsView(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-sports", height: 900) { NavigationStack { SportsSettingsView(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-goals", height: 1300) { NavigationStack { GoalsSettingsView(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-zones", height: 700) { NavigationStack { ZonesSettingsView(store: store) }.environment(AppModel(demo: true)) }
        try render("settings-gym", height: 700) { NavigationStack { GymSettingsView() }.environment(AppModel(demo: true)) }
        try render("settings-gym-goal", height: 760) { GymGoalSheet(goal: .constant("auto"), recommended: "strength_muscle") }
        try render("settings-rest-lengths", height: 180) { RestLengthGrid(value: .constant(GymRestSettingsView.byExercise)) {}.padding(20) }
        XCTAssertEqual(GymRestSettingsView.short(90), "1:30")
        XCTAssertEqual(GymRestSettingsView.short(120), "2 min")
        XCTAssertEqual(GymRestSettingsView.before(nil, setting: 45), 45)
        XCTAssertEqual(GymRestSettingsView.before(nil, setting: GymRestSettingsView.byExercise), 120)
        try render("gym-stretching", height: 520) {
            StretchingCard(stretching: GymStretching(minutes: 5, items: [
                .init(id: "hip_flexor", name: "Kyčelní flexory v kleku", seconds: 30, sides: true, rounds: 2, steps: ["Klekni si na jedno koleno."]),
                .init(id: "hamstring", name: "Zadní strana stehen v sedu", seconds: 30, sides: true, rounds: 2, steps: ["Sedni si."]),
                .init(id: "chest", name: "Hrudník: lokty dozadu", seconds: 30, sides: false, steps: ["Postav se rovně."]),
                .init(id: "child", name: "Dětská pozice", seconds: 45, sides: false)
            ]), date: "2026-10-14").padding(20)
        }
        try render("gym-time", height: 200) { GymTimeCard(minutes: 60, warmup: 6, stretching: 5).padding(20) }
        let why = "Cíl podle tvého sportu – síla a svaly: těžší hlavní cviky. Na tvoje přání šetřím nohy a trénink soustředím na horní část těla; cviky vybírám podle čerstvosti a nedávné svalové zátěže. Cviky se liší od plánu na čt 29. 10. Časový plán: přibližně 74 z 75 minut včetně rozcvičení, pauz, nastavování strojů a rezervy."
        try render("gym-why", height: 360) { GymWhyCard(reasons: GymWhy.reasons(why)).padding(20) }
        try render("gym-stretch-info", height: 700) {
            StretchInfoSheet(item: .init(id: "child", name: "Dětská pozice", seconds: 45, sides: false,
                                         steps: ["Z pozice na všech čtyřech si sedni hýžděmi na paty.", "Paže nech natažené před sebou na zemi a čelo polož na podložku.", "Zhluboka dýchej a s každým výdechem povol záda."]))
        }
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
        XCTAssertEqual(L10n.plural("dní", 24), "dní")
    }

    func testSignInScreen() throws {
        try render("login", height: 844) { LoginView().environment(AppModel()) }
        // The welcome's pages as they end, in Czech and in English.
        for language in ["cs", "en"] {
            L10n.setLanguage(language)
            for page in WelcomePage.allCases {
                try render("welcome-\(page.rawValue)-\(language)", glow: page.glow, height: 700) {
                    WelcomePageView(page: page, active: false, still: true).padding(24).environment(\.locale, L10n.locale)
                }
            }
        }
        L10n.setLanguage("cs")
        UserDefaults.standard.removeObject(forKey: "AppleLanguages")
    }

    func testDemoDataDecodes() {
        let today = DemoData.today
        XCTAssertEqual(today.readiness.score, 78)
        XCTAssertEqual(today.plan.count, 3)
        XCTAssertEqual(today.steps.hourly?.reduce(0, +), today.steps.today)
        XCTAssertEqual(Fmt.dayHeading(today.date), "ČTVRTEK 8. ŘÍJNA")
        XCTAssertEqual(Fmt.dayTitle("2026-10-08", today: "2026-10-08"), "Dnes")
        XCTAssertEqual(Fmt.daySubtitle("2026-10-08", today: "2026-10-08"), "čtvrtek 8. října")
        XCTAssertEqual(Fmt.dayShort("2026-10-08", today: "2026-10-08"), "Dnes · čt 8. 10.")
        XCTAssertEqual(Fmt.dayTitle("2026-10-07", today: "2026-10-08"), "Včera")
        XCTAssertEqual(Fmt.dayTitle("2026-10-05", today: "2026-10-08"), "Pondělí")
        XCTAssertEqual(Fmt.daySubtitle("2026-10-05", today: "2026-10-08"), "5. října")
        XCTAssertEqual(Fmt.dayShort("2026-10-05", today: "2026-10-08"), "Po 5. 10.")
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

    /// The first-run setup's sport, goal and time pages, in English as the site and App Store show the app.
    func testSetupFocusPages() throws {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        var focus = SetupFocus(profile: ["mainSport": .string("triathlon"), "sportGoal": .string("závod"), "eventName": .string("Ironman 70.3"), "eventDate": .string("2027-06-13")])
        // A profile from before the list: its one main sport is ticked and main.
        XCTAssertEqual(focus.sports.kinds, ["ride", "run", "swim"])
        XCTAssertEqual(focus.sports.mainSport, "triathlon")
        XCTAssertEqual(focus.goal, "race")
        let saved = focus.applied(to: ["sex": .string("male")])
        XCTAssertEqual(saved["sex"], .string("male"))
        XCTAssertEqual(saved["mainSport"], .string("triathlon"))
        XCTAssertEqual(saved["sports"], .array([.string("ride"), .string("run"), .string("swim")]))
        XCTAssertEqual(saved["eventDate"], .string("2027-06-13"))
        // Ride and Run main without a duathlon, the gym too (Petr 2026-11-03).
        var choice = SportsChoice()
        choice.toggle("ride")
        XCTAssertEqual(choice.mains, ["ride"], "the first sport ticked is the main one")
        choice.toggleMain("run")
        choice.toggle("strength")
        XCTAssertEqual(choice.kinds, ["ride", "run", "strength"])
        XCTAssertEqual(choice.mains, ["ride", "run"])
        XCTAssertEqual(choice.mainSport, "cycling")
        choice.toggle("ride")
        XCTAssertEqual(choice.mains, ["run"], "a sport unticked stops being main")
        choice.toggle("ride")
        choice.toggleMain("ride")
        XCTAssertEqual(SportsChoice(profile: choice.applied(to: [:])), choice)
        focus.sports = choice
        focus.swims100 = true
        try render("setup-sport-en", height: 844) { SetupSportPage(focus: .constant(focus)).padding(24).padding(.top, 40).environment(\.locale, L10n.locale) }
        try render("setup-sport-swim-en", height: 844) {
            SetupSportPage(focus: .constant(SetupFocus(profile: ["sports": .array([.string("ride"), .string("swim"), .string("strength")]), "mainSports": .array([.string("ride")]), "swims100": .bool(true)])))
                .padding(24).padding(.top, 40).environment(\.locale, L10n.locale)
        }
        try render("setup-goal-en", height: 844) { SetupGoalPage(focus: .constant(focus)).padding(24).padding(.top, 40).environment(\.locale, L10n.locale) }
        // The steps over the pages (point 6): the goal is page 4 of 6.
        try render("setup-steps-en", height: 80) { SetupSteps(done: 4, total: 6).padding(24) }
        try render("setup-time-en", height: 844) {
            SetupTimePage(minutes: .constant([60, 0, 75, 0, 45, 270, 120]), loading: false, lifts: true) {}
                .padding(24).padding(.top, 40).environment(\.locale, L10n.locale)
        }
        XCTAssertEqual(AvailabilityBarRow.maxMinutes, 480)
        XCTAssertEqual(WeekSessionDraft.lengths("ride", including: 60).last, 480)
        XCTAssertEqual(WeekSessionDraft.lengths("run", including: 60).last, 360)
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
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/sleep")!), .sleep)
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/heart")!), .metric(.hrv))
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/metric/temperature")!), .metric(.temperature))
        XCTAssertNil(AppRoute(url: URL(string: "aurin://open/metric/nope")!))
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/gym/2026-10-08")!), .gym("2026-10-08"))
        XCTAssertNil(AppRoute(url: URL(string: "aurin://open/food")!))
        XCTAssertNil(AppRoute(url: URL(string: "https://open/sleep")!))
        XCTAssertEqual(TabLink.tab(URL(string: "aurin://open/food")!), .food)
        let model = AppModel(demo: true)
        model.handle(URL(string: "aurin://open/sleep")!)
        XCTAssertEqual(model.tab, .health)
        XCTAssertEqual(model.paths[.health], [.sleep])
    }

    func testNewFieldsDecode() throws {
        let food = DemoData.food
        XCTAssertEqual(food.macros.fiber?.target, 32)
        XCTAssertEqual(food.water.drinks?.count, 3)
        XCTAssertEqual(food.water.drunkMl, 1600)
        XCTAssertEqual(DemoData.today.plan.first { !$0.done }?.sport, "strength")
        XCTAssertEqual(DemoData.today.plan.first?.session?.distanceKm, 8.2)
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
        XCTAssertEqual(day.exercises.map(\.name), ["Přítahy", "Dřep", "Tlak na lavici", "Rumunský mrtvý tah", "Výpady"])
        day.moveExercise(from: 0, to: 3)
        XCTAssertEqual(day.exercises.map(\.name), ["Dřep", "Tlak na lavici", "Přítahy", "Rumunský mrtvý tah", "Výpady"])
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
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/vo2max")!), .vo2max)
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/library/run")!), .workoutLibrary("run"))
        // The equipment picker: every station once, by kind, with the muscles it is for.
        let stations = try JSONDecoder().decode([GymEquipment.Station].self, from: Data(#"""
        [{"id":"dumbbells","group":"Volné váhy","label":"Jednoručky","sections":["free_weights"],"uses":"Celé tělo","keywords":"cinky"},
         {"id":"chest_press","group":"Prsa","label":"Tlaky na prsa (stroj)","sections":["upper_machines"],"uses":"Prsa · triceps"},
         {"id":"pec_deck","group":"Záda a ramena","label":"Pec deck (rozpažování a zadní ramena)","sections":["upper_machines"],"uses":"Prsa · zadní ramena","keywords":"butterfly motýlek"},
         {"id":"cables","group":"Kladky","label":"Kladky (kabelový stroj)","sections":["cables"],"uses":"Celé tělo"},
         {"id":"sled","group":"Kardio","label":"Saně","sections":[]}]
        """#.utf8))
        let sections = [GymEquipment.Section(id: "free_weights", label: "Volné váhy"), GymEquipment.Section(id: "cables", label: "Kladky"),
                        GymEquipment.Section(id: "upper_machines", label: "Stroje – horní část těla")]
        let place = GymPlace(id: "p", kind: "gym", name: "METAGYM Kutná Hora", stations: ["dumbbells", "pec_deck"], url: "", dumbbellWeights: [])
        XCTAssertEqual(GymPlaceView.folded("Motýlek"), "motylek")
        try render("gym-place", glow: Palette.Glow.training, height: 1100) {
            GymPlaceView(place: .constant(place), stations: stations, sections: sections, catalog: .constant([curl, press]), onDelete: {}, scrolls: false)
                .frame(maxHeight: .infinity, alignment: .top)
        }
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
        // A done lifting activity opens the day's gym sheet for itself: a day can
        // have several, and deleting one leaves the exercises with the others.
        let lift = CalendarActivity(id: "apple-health:w3", sport: "strength", status: "done", title: "Posilovna", date: "2026-10-05", time: "18:00",
                                    minutes: 40, km: nil, kcal: 210, activityId: nil, eventId: nil)
        XCTAssertEqual(CalendarDayList.route(lift), .gymSession(lift.session))
        XCTAssertEqual(CalendarActivityRow.detail(ride), "Kolo · " + ClockText.format("07:00") + " · 1 h 30 min · 42,3 km")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .count), "2")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .time), "2:05")
        XCTAssertEqual(MonthGrid.value(calendar.days.first, .kcal), Fmt.int(1250))
        XCTAssertEqual(MonthGrid.value(calendar.days.last, .count), " ")
        // A response without the plan's state still decodes: done counts as outside the plan.
        XCTAssertNil(calendar.days.first?.plan)
        XCTAssertEqual(PlanState(day: calendar.days.first), .offPlan)
        XCTAssertNil(PlanState(day: calendar.days.last))
        let dayJSON = """
        {"date":"2026-10-07","primary":"ride","count":1,"minutes":60,"kcal":700,"planned":0,"missed":1,"plan":"missed","activities":[
         {"id":"activity:a2","sport":"ride","status":"done","title":"Tempo","date":"2026-10-07","time":"07:00","minutes":60,"km":null,"kcal":700,"activityId":"a2","eventId":null,"adherence":"off","adherenceReason":"kratší než plán (1 h 30)","plannedId":"planned:2"},
         {"id":"planned:3","sport":"run","status":"missed","title":"Běh","date":"2026-10-07","time":null,"minutes":45,"km":null,"kcal":null,"activityId":null,"eventId":"planned:3"}]}
        """
        let planDay = try JSONDecoder().decode(CalendarDay.self, from: Data(dayJSON.utf8))
        XCTAssertEqual(PlanState(day: planDay), .missed)
        XCTAssertEqual(planDay.missed, 1)
        let off = try XCTUnwrap(planDay.activities.first)
        XCTAssertEqual(PlanState(off.session), .off)
        XCTAssertEqual(off.session.plannedId, "planned:2")
        let missed = try XCTUnwrap(planDay.activities.last)
        XCTAssertEqual(PlanState(missed.session), .missed)
        XCTAssertEqual(CalendarActivityRow.detail(missed), "Neodjeto · 45 min")
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
        XCTAssertEqual(FoodEntryCard.detail(entry), "140 g · Madeta · " + ClockText.format("08:00"))
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
        try render("watch-settings", glow: Palette.Glow.training, height: 1100) {
            NavigationStack { WatchSettingsView() }
        }
    }

    func testRoundFourLogic() {
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/library")!), .library)
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/library/gym")!), .workoutLibrary("gym"))
        let presets = DrinkPrefs.presets(favorites: ["water", "coffee", "tea"], saved: { $0 == "tea" ? [300, 400, 500] : nil })
        XCTAssertEqual(presets.map(\.id), ["water.250", "water.500", "coffee.200", "tea.300", "tea.400"])
        XCTAssertEqual(DrinkPrefs.presets(favorites: DrinkKind.all.map(\.id), saved: { _ in nil }).count, 8, "at most eight choices")
        XCTAssertEqual(LibrarySport.find("run")?.label, "Běh")
        XCTAssertEqual(LibrarySport.all.map(\.id), ["ride", "run", "swim", "tri", "gym"], "the app's order of sports")
        XCTAssertEqual(LibrarySport.single.map(\.id), ["ride", "run", "swim", "gym"], "one workout: no bricks")
        XCTAssertNil(LibrarySport.find("rowing"))
        XCTAssertEqual(DrinkFigureKind.from("octopus"), .octopus)
        XCTAssertEqual(DrinkFigureKind.from("dragon"), .whale, "an unknown figure falls back to the whale")
        XCTAssertEqual(DrinksCard.remaining(ml: 1200, target: 2500), "ještě 1,3 l do cíle")
        XCTAssertEqual(DrinksCard.remaining(ml: 2600, target: 2500), "cíl splněn")
    }

    func testDataAgeLoadNoteAndWristTemperature() throws {
        let calendar = Calendar.current
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 10, day: 8, hour: 20)))
        XCTAssertNil(DataAgePill.text(last: now.addingTimeInterval(-2 * 3600), now: now), "fresh data: nothing")
        let today = try XCTUnwrap(DataAgePill.text(last: now.addingTimeInterval(-5 * 3600), now: now))
        XCTAssertTrue(today.hasPrefix("data z "), today)
        let yesterday = try XCTUnwrap(DataAgePill.text(last: now.addingTimeInterval(-23 * 3600), now: now))
        XCTAssertTrue(yesterday.hasPrefix("data ze včera "), yesterday)
        let older = try XCTUnwrap(DataAgePill.text(last: now.addingTimeInterval(-3 * 86400), now: now))
        XCTAssertTrue(older.hasPrefix("data z 5. 10. "), older)

        let raised = TrainingSnapshot.ACWR(value: 1.42, zone: "elevated", acute: 60, chronic: 42)
        let monotonous = TrainingSnapshot.Monotony(value: 2.3, strain: 900, high: true)
        let normal = TrainingSnapshot.Monotony(value: 1.2, strain: 500, high: false)
        XCTAssertEqual(FormWidget.loadNote(acwr: raised, monotony: monotonous), "Poměr zátěže 1,42 · jednotvárný týden")
        XCTAssertEqual(FormWidget.loadNote(acwr: raised, monotony: normal), "Poměr zátěže 1,42")
        XCTAssertEqual(FormWidget.loadNote(acwr: TrainingSnapshot.ACWR(value: 0.6, zone: "low", acute: 20, chronic: 33), monotony: monotonous), "Jednotvárný týden")
        XCTAssertNil(FormWidget.loadNote(acwr: TrainingSnapshot.ACWR(value: 0.6, zone: "low", acute: 20, chronic: 33), monotony: normal))
        XCTAssertNil(FormWidget.loadNote(acwr: TrainingSnapshot.ACWR(value: 1.1, zone: "sweetSpot", acute: 40, chronic: 36), monotony: nil))

        let week: [Point] = [Point(date: "2026-10-01", value: 1), Point(date: "2026-10-02", value: 2), Point(date: "2026-10-08", value: 3)]
        XCTAssertEqual(week.lastDays(7).map(\.date), ["2026-10-02", "2026-10-08"])

        let nights = (0..<14).map { i in Point(date: ISODay.shift("2026-10-08", i - 13), value: i == 13 ? 0.9 : (i == 12 ? 0.4 : Double(i % 3) * 0.1 - 0.1)) }
        let wrist = HealthSnapshot.WristTemp(value: 36.9, deviation: 0.9, series: [], deviations: nights)
        try render("health-wrist-temperature", glow: Palette.Glow.health) {
            VStack(spacing: 12) {
                WristTempWidget(wrist: wrist, size: .medium)
                WristTempWidget(wrist: HealthSnapshot.WristTemp(value: 36.3, deviation: nil, series: []), size: .small)
            }
            .padding(24)
        }
    }

    func testMuscleScreens() throws {
        let model = AppModel(demo: true)
        try render("muscles-widgets", glow: Palette.Glow.training, height: 1500) {
            VStack(spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    MusclesWidget(figure: true, size: .small)
                    MusclesWidget(figure: false, size: .small)
                }
                MusclesWidget(figure: true, size: .medium)
                MusclesWidget(figure: false, size: .medium)
                MusclesWidget(figure: true, size: .large)
            }
            .padding(24).environment(model)
        }
        try render("muscles", glow: Palette.Glow.training, height: 1500) {
            NavigationStack { MusclesView() }.environment(model)
        }
        try render("muscle-detail", glow: Palette.Glow.training, height: 1300) {
            NavigationStack { MuscleDetailView(id: "quads", detail: DemoData.muscleDetail("quads")) }.environment(model)
        }
        try render("gym-builder-muscles", glow: Palette.Glow.training, height: 1100) {
            NavigationStack { GymBuilderView(date: DemoData.training.date) }.environment(model)
        }
    }

    func testRoundFourScreens() throws {
        let model = AppModel(demo: true)
        try render("training-tools", glow: Palette.Glow.training, height: 330) {
            NavigationStack { TrainingTools(today: DemoData.training.date).padding(24) }.environment(model)
        }
        try render("drinks-card", glow: Palette.Glow.food, height: 460) {
            DrinksCard(water: DemoData.food.water).environment(model).padding(24)
        }
        try render("drink-figures", glow: Palette.Glow.food, height: 760) {
            VStack(spacing: 6) {
                ForEach(DrinkFigureKind.allCases) { kind in
                    HStack(spacing: 12) {
                        Text(kind.label).font(.caption).frame(width: 80, alignment: .leading)
                        ForEach([0.0, 0.5, 1.0], id: \.self) { DrinkFigure(kind: kind, fraction: $0, size: 80, animate: false) }
                    }
                }
            }
            .padding(20)
        }
        try render("library-choice", glow: Palette.Glow.training, height: 520) {
            NavigationStack { TrainingLibraryView() }.environment(model)
        }
    }

    func testZonesActiveEnergyAndWeather() throws {
        let zones = try XCTUnwrap(DemoData.training.zones)
        let weeks = try XCTUnwrap(zones.weeks)
        XCTAssertEqual(weeks.count, 4)
        XCTAssertEqual(weeks[3].counted, 62 + 2 * (16 + 1), "vigorous and peak minutes count twice")
        XCTAssertEqual(ZoneStyle.status(weeks[3]), "chybí 54 min")
        XCTAssertEqual(ZoneStyle.status(weeks[0]), "doporučení splněno")
        XCTAssertEqual(DemoData.training.activeCalories?.days?.count, 27)
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/zones")!), .zones)
        XCTAssertEqual(AppRoute(url: URL(string: "aurin://open/active-energy")!), .activeEnergy)
        let weather = try XCTUnwrap(DemoData.today.weather)
        XCTAssertEqual(weather.place, "Praha")
        XCTAssertTrue(AppleWeather.credited(weather))
        XCTAssertEqual(WeatherText.symbol(weather.code), "cloud.sun.fill")
        XCTAssertEqual(WeatherText.symbol(95), "cloud.bolt.rain.fill")
        XCTAssertEqual(WeatherText.description(63), "déšť")
        XCTAssertEqual(SkyLook(code: 61, daylight: false), SkyLook(code: 63, daylight: false))
        XCTAssertTrue(SkyLook(code: 61, daylight: false).rains)
        XCTAssertEqual(SkyLook(code: 61, daylight: false).stars, 0, "a rainy night has no stars")
        XCTAssertTrue(SkyLook(code: 2, daylight: false).showsBody, "a partly cloudy night shows the moon")
        XCTAssertGreaterThan(SkyLook(code: 0, daylight: false).stars, 0)
        XCTAssertEqual(SkyLook(code: 2, daylight: nil).night, false)
        XCTAssertEqual(WeatherText.windWord(18) != nil, true)
        XCTAssertNil(WeatherText.compass(nil))

        let model = AppModel(demo: true)
        let active = try XCTUnwrap(DemoData.training.activeCalories)
        try render("training-zones", glow: Palette.Glow.training) {
            ZonesDetailContent(zones: zones).padding(.horizontal, 24).padding(.bottom, 40)
        }
        try render("training-active-energy", glow: Palette.Glow.training) {
            ActiveEnergyContent(active: active, today: DemoData.training.date, calendar: DemoData.calendarByDate)
                .padding(.horizontal, 24).padding(.bottom, 40).environment(model)
        }
        try render("weather-details", height: 900) {
            NavigationStack { WeatherDetails(weather: weather) }.environment(model)
        }
    }

    /// Pití dnes: the day's drinks by kind (most hydrating first) and by part of the day.
    func testDrinkHistoryGroups() throws {
        let drinks = try XCTUnwrap(DemoData.food.water.drinks)
        let kinds = DrinkHistory.byKind(drinks)
        XCTAssertEqual(kinds.map(\.kind), ["water", "coffee"])
        XCTAssertEqual(kinds[0].count, 2)
        XCTAssertEqual(kinds[0].ml, 1400)
        XCTAssertEqual(kinds[1].hydrationMl, 100)
        let parts = DrinkHistory.byPart(drinks)
        XCTAssertEqual(parts.map(\.title), ["Ráno", "Odpoledne"])
        XCTAssertEqual(parts[0].drinks.map(\.id), [11, 12])
    }

    /// The offer in night violet: the opening at moments of its animation,
    /// the offer with its phones, all plans and the free week.
    func testPaywallTour() throws {
        for time in [0.5, 2.0, 3.6, 5.0, 8.0] {
            try render("paywall-\(Int(time * 10))", height: 844) { PaywallView(close: {}, frozenTime: time, store: ProStore()) }
        }
        try render("paywall-plans", height: 844) { PaywallView(close: {}, frozenTime: 3, step: 1, store: ProStore()) }
        try render("paywall-plans-trial", height: 844) { PaywallView(close: {}, frozenTime: 5.5, step: 1, store: ProStore(trialEligible: true)) }
        try render("paywall-free-week", height: 844) { PaywallView(close: {}, frozenTime: 3, step: 2, store: ProStore(trialEligible: true)) }
        // The end of the first setup (point 7): no way back, "Teď ne" under the button.
        try render("paywall-setup-end", height: 844) { PaywallView(close: {}, frozenTime: 3, step: 2, store: ProStore(trialEligible: true), notNow: true) }
        // "View more plans" (variant 8c): where the year can be paid monthly (CZ) and where it can't (US).
        let czech = ProOffer.plans(yearly: "1 490 Kč", monthly: "199 Kč", perMonth: "124 Kč",
                                   commitment: ProStore.Commitment(monthly: "149 Kč", total: "1 788 Kč"), trial: true)
        try render("paywall-all-plans", height: 900, window: true) {
            AllProPlans(offers: czech, selected: .constant(.yearMonthly), buying: false, start: {}, redeem: {}, restore: {})
                .background(Night.bottom)
        }
        try render("paywall-all-plans-monthly", height: 900, window: true) {
            AllProPlans(offers: czech, selected: .constant(.monthly), buying: false, start: {}, redeem: {}, restore: {})
                .background(Night.bottom)
        }
        try render("paywall-all-plans-large-text", height: 1400, typeSize: .accessibility3, window: true) {
            AllProPlans(offers: czech, selected: .constant(.yearMonthly), buying: false, start: {}, redeem: {}, restore: {})
                .background(Night.bottom)
        }
        L10n.setLanguage("en")
        defer { L10n.setLanguage("cs"); UserDefaults.standard.removeObject(forKey: "AppleLanguages") }
        let american = ProOffer.plans(yearly: "$59.99", monthly: "$6.99", perMonth: "$5.00", commitment: nil, trial: true)
        try render("paywall-all-plans-us-en", height: 900, window: true) {
            AllProPlans(offers: american, selected: .constant(.yearOnce), buying: false, start: {}, redeem: {}, restore: {})
                .background(Night.bottom).environment(\.locale, L10n.locale)
        }
    }

    /// What each plan saves against paying monthly (variant 8c): only the yearly plans, in whole percent.
    func testPlanSavings() throws {
        let czech = ProOffer.plans(yearly: "1\u{202F}490,00\u{00A0}Kč", monthly: "199,00\u{00A0}Kč", perMonth: "124\u{00A0}Kč",
                                   commitment: ProStore.Commitment(monthly: "149,00\u{00A0}Kč", total: "1\u{202F}788,00\u{00A0}Kč"), trial: true)
        XCTAssertEqual(czech.map(\.kind), [.yearMonthly, .yearOnce, .monthly])
        XCTAssertEqual(czech.map(\.save), [25, 37, nil], "149 vs 199, 1 490 vs 12 × 199 (37.6, rounded down), monthly none")
        let american = ProOffer.plans(yearly: "$59.99", monthly: "$6.99", perMonth: "$5.00", commitment: nil, trial: true)
        XCTAssertEqual(american.map(\.save), [28, nil])
        // An English phone in Czechia or Germany: the same numbers, never "SAVE 100%".
        let english = ProOffer.plans(yearly: "CZK 1,490", monthly: "CZK 199", perMonth: nil,
                                     commitment: ProStore.Commitment(monthly: "CZK 149.00", total: "CZK 1,788.00"), trial: true)
        XCTAssertEqual(english.map(\.save), [25, 37, nil])
        XCTAssertEqual(ProStore.number("1.490,00 €"), 1490)
        XCTAssertEqual(ProStore.number("1\u{202F}490\u{00A0}Kč"), 1490)
        XCTAssertEqual(ProStore.number("$59.99"), Decimal(string: "59.99"))
        XCTAssertEqual(ProStore.number("5,99 €"), Decimal(string: "5.99"))
        XCTAssertNil(ProStore.number("Kč"))
        XCTAssertNil(ProOffer.saving(Decimal(string: "1.49"), months: 12, against: Decimal(199)), "a price read wrong, no label")
        XCTAssertNil(ProOffer.saving(Decimal(199), months: 1, against: Decimal(199)), "no saving, no label")
        XCTAssertNil(ProOffer.saving(nil, months: 12, against: Decimal(199)), "a price without a number, no label")
    }

    /// Settings → Aurin Pro in night violet: active, the free week on day 3,
    /// the year paid monthly at payment 3 of 12, extra messages, the week running
    /// low with none, and the packs page with purchases.
    @MainActor
    func testProSettings() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let day = { (m: Int, d: Int, y: Int) in calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 9))! }
        let extra = CoachAllowance(limit: 30, used: 12, left: 55, weekLeft: 18, extra: 37, resetsOn: "2026-11-09", near: false)
        let low = CoachAllowance(limit: 30, used: 27, left: 3, weekLeft: 3, extra: 0, resetsOn: "2026-11-09", near: true)
        let active = ProPageState(hasPro: true, unlocked: true, renewal: "Obnoví se 5. listopadu", allowance: extra, packsOnSale: true)
        try render("pro-settings-active", height: 1100, window: true) { ProPage(state: active, calendar: calendar) }
        var week = active
        week.freeWeek = DateInterval(start: day(10, 29, 2026), end: day(11, 5, 2026))
        week.firstPayment = "Čt 5. 11. · 149 Kč"
        week.allowance = nil
        try render("pro-settings-free-week", height: 1000, window: true) { ProPage(state: week, now: day(10, 31, 2026), calendar: calendar) }
        var monthly = active
        monthly.payments = ProStore.Payments(number: 3, total: 12, next: day(2, 5, 2027), ends: day(11, 5, 2027))
        monthly.allowance = low
        try render("pro-settings-paid-monthly", height: 1250, window: true) { ProPage(state: monthly, calendar: calendar) }
        // Without Pro (the list with sparkles, the way to the offer) and during the pilot (all ticked).
        let free = ProPageState(loaded: true, trial: true)
        try render("pro-settings-free", height: 1150, window: true) { ProPage(state: free, calendar: calendar) }
        let pilot = ProPageState(unlocked: true, pilot: true, loaded: true)
        try render("pro-settings-pilot", height: 1150, window: true) { ProPage(state: pilot, calendar: calendar) }
        let purchases = [
            CoachPacks.Purchase(productId: "health.aurin.app.coach.messages100", messages: 100, counted: true, environment: "Production", price: 7.99, currency: "EUR", purchasedAt: "2026-11-02T00:12:00.000Z", refunded: false),
            CoachPacks.Purchase(productId: "health.aurin.app.coach.messages40", messages: 40, counted: true, environment: "Production", price: 3.99, currency: "EUR", purchasedAt: "2026-10-12T10:00:00Z", refunded: false),
            CoachPacks.Purchase(productId: "health.aurin.app.coach.messages40", messages: 40, counted: false, environment: "Sandbox", price: 3.99, currency: "EUR", purchasedAt: "2026-09-28T10:00:00Z", refunded: false)
        ]
        let prices = ["health.aurin.app.coach.messages40": "€3.99", "health.aurin.app.coach.messages100": "€7.99"]
        try render("pro-packs", height: 900, window: true) {
            CoachPacksPage(left: 137, purchases: purchases, price: { prices[$0] }, chosen: .constant("health.aurin.app.coach.messages100"), added: 100)
        }
    }

    func testPaymentDotsMonths() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let ends = try XCTUnwrap(calendar.date(from: DateComponents(year: 2027, month: 11, day: 5)))
        let first = try XCTUnwrap(calendar.date(byAdding: .month, value: -12, to: ends))
        XCTAssertEqual(calendar.dateComponents([.year, .month], from: first), DateComponents(year: 2026, month: 11), "12 payments from Nov 2026")
    }

    func testFreeWeekDates() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let bought = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 21)))
        let first = PaywallView.firstPayment(from: bought, calendar: calendar)
        XCTAssertEqual(calendar.dateComponents([.month, .day], from: first), DateComponents(month: 11, day: 5), "Thursday to Thursday")
        // The reminder (ProStore, day 5) comes before the first payment.
        XCTAssertLessThan(try XCTUnwrap(ProStore.trialReminderDate(purchased: bought, calendar: calendar)), first)
    }

    @MainActor
    func testOffersWithoutMonthlyPayments() throws {
        // No "Monthly with 12-Month Commitment" here (older iOS, the US, the simulator): yearly and monthly.
        let plans = ProOffer.main(ProStore(trialEligible: true))
        XCTAssertEqual(plans.map(\.kind), [.yearOnce, .monthly])
        XCTAssertEqual(plans.map(\.trial), [true, false], "the free week only on the yearly plan")
    }

    /// Training plans: before the start, the running plan, a week and the result.
    /// "Splnění plánu": the card under a ride's numbers, its sheet with the
    /// plan against what was done, a run well over the plan and the colours.
    func testPlanComplianceScreens() throws {
        func step(_ label: String, _ role: String, _ min: Double, _ lo: Double?, _ hi: Double?, _ v: Double?, _ status: String?) -> PlanCompliance.Step {
            PlanCompliance.Step(label: label, role: role, seconds: min * 60, plannedSeconds: min * 60, lo: lo, hi: hi, value: v,
                                text: v.map { "\(Int(min)):00 · \(Int($0)) W" }, status: status)
        }
        let ride = PlanCompliance(percent: 92, word: "Podle plánu",
            rows: [.init(kind: "tss", done: 73, plan: 79, percent: 92), .init(kind: "time", done: 68, plan: 60, percent: 113)],
            steps: .init(unit: "W", inBand: 3, of: 4, steps: [
                step("Rozjetí", "warmup", 10, 150, 195, 175, "in"), step("Práh 1", "work", 8, 285, 300, 291, "in"), step("Pauza", "rest", 4, 150, 180, 165, "in"),
                step("Práh 2", "work", 8, 285, 300, 294, "in"), step("Pauza", "rest", 4, 150, 180, 160, "in"), step("Práh 3", "work", 8, 285, 300, 288, "in"),
                step("Pauza", "rest", 4, 150, 180, 168, "in"), step("Práh 4", "work", 8, 285, 300, 264, "under"), step("Vyjetí", "cooldown", 6, 135, 180, nil, "missing")]),
            target: "Cíl prahu byl 95–100 %, tedy zhruba 285–300 W při FTP 300 W.")
        let run = PlanCompliance(percent: 140, word: "Výrazně víc",
            rows: [.init(kind: "tss", done: 63, plan: 45, percent: 140), .init(kind: "time", done: 62, plan: 45, percent: 138), .init(kind: "distance", done: 11.4, plan: 8, percent: 143)])
        try render("plan-compliance", glow: Palette.Glow.training) {
            VStack(spacing: 14) {
                PlanComplianceCard(compliance: ride) {}
                PlanComplianceCard(compliance: run, run: true) {}
            }
            .padding(24).padding(.top, 30)
        }
        try render("plan-compliance-sheet", glow: Palette.Glow.training) { PlanComplianceSheet(compliance: ride, title: "Práh 4×8 min") }
        try render("plan-colors-legend", glow: Palette.Glow.training, height: 900) { PlanColorsLegend() }
    }

    func testTrainingPlanScreens() throws {
        func block(_ minutes: Double, _ low: Double, _ high: Double, repeats: Int = 1) -> String {
            #"{"repeats":\#(repeats),"steps":[{"durationSeconds":\#(minutes * 60),"percentLow":\#(low),"percentHigh":\#(high)}]}"#
        }
        let ss = "[" + [block(12, 50, 60), block(15, 88, 92), block(5, 50, 55), block(15, 88, 92), block(13, 45, 55)].joined(separator: ",") + "]"
        let thr = "[" + [block(12, 50, 60), block(8, 96, 100), block(4, 50, 55), block(8, 96, 100), block(4, 50, 55), block(8, 96, 100), block(12, 45, 55)].joined(separator: ",") + "]"
        let z2 = "[" + [block(10, 50, 60), block(55, 65, 72), block(10, 45, 55)].joined(separator: ",") + "]"
        let phases: [(String, String, Double, [String])] = [
            ("test", "Test FTP", 1, ["Test FTP", "Sweet spot 2×15"]), ("build", "Budování", 1.04, ["Práh 3×8", "Sweet spot 2×20"]),
            ("build", "Budování", 1.07, ["Práh 4×8", "Nad/pod prahem 3×12"]), ("recovery", "Odpočinek", 0.65, ["Tempo 2×15"]),
            ("build", "Budování", 1.04, ["Práh 3×12", "Sweet spot 2×25"]), ("build", "Budování", 1.07, ["Práh 2×20", "Nad/pod prahem 3×9"]),
            ("peak", "Vrchol", 1.1, ["Práh 2×20", "Nad/pod prahem 3×15"]), ("test", "Test FTP", 0.7, ["Test FTP"])]
        let minutes = [290, 305, 315, 190, 305, 315, 325, 205]
        let weeks = phases.enumerated().map { i, p in
            #"{"week":\#(i + 1),"phase":"\#(p.0)","phaseLabel":"\#(p.1)","load":\#(p.2),"keys":[\#(p.3.map { "\"\($0)\"" }.joined(separator: ","))],"longMinutes":null,"race":false}"#
        }.joined(separator: ",")
        let template = #"{"id":"ride-ftp","sport":"ride","name":"Kolo: FTP","goal":"Vyšší FTP za 8 týdnů","description":"","level":"intermediate","weeksCount":8,"days":[3,6],"race":null,"weeks":[\#(weeks)]}"#
        let plansJSON = #"{"templates":[\#(template)],"active":{"id":7,"templateId":"ride-ftp","name":"Kolo: FTP","startDate":"2026-10-20","firstDay":null,"endDate":"2026-12-14","raceDate":null,"raceKm":null,"week":3,"weeksCount":8,"phaseLabel":"Budování","started":true,"paused":false,"shiftedWeeks":0,"returning":false,"weekDays":null,"completion":{"1":97,"2":84},"template":\#(template)},"activeGym":null,"started":null}"#
        let previewWeeks = phases.enumerated().map { i, p in
            #"{"week":\#(i + 1),"phase":"\#(p.0)","phaseLabel":"\#(p.1)","keys":[],"race":false,"sessions":\#(i == 3 || i == 7 ? 3 : 4),"minutes":\#(minutes[i]),"tss":\#(minutes[i] * 86 / 100)}"#
        }.joined(separator: ",")
        let previewJSON = #"{"startDate":"2026-10-20","firstDay":null,"endDate":"2026-12-14","days":[1,3,5,6],"weeks":[\#(previewWeeks)],"totals":{"sessions":30,"minutes":2250,"tss":1935}}"#
        func session(_ date: String, _ name: String, _ kind: String, _ minutes: Int, _ load: Int, _ steps: String, done: Bool) -> String {
            #"{"date":"\#(date)","label":"\#(name)","kind":"\#(kind)","minutes":\#(minutes),"workoutId":"w-\#(date)","done":\#(done),"editable":\#(!done),"edited":false,"workout":{"name":"\#(name)","sport":"ride","environment":"outdoor","duration_minutes":\#(minutes),"target_load":\#(load),"intensity_factor":0.8,"description":null,"steps":\#(steps)}}"#
        }
        let weekJSON = #"{"week":3,"weeksCount":8,"monday":"2026-11-03","phaseLabel":"Budování","weekDays":null,"sessions":["# + [
            session("2026-11-04", "Práh 4×8", "quality", 75, 86, thr, done: true),
            session("2026-11-06", "Z2 1 h 15", "easy", 75, 55, z2, done: false),
            session("2026-11-08", "Nad/pod prahem 3×12", "quality", 90, 98, ss, done: false),
            session("2026-11-09", "Z2 1 h 30", "long", 90, 64, z2, done: false)].joined(separator: ",") + "]}"
        let resultJSON = #"{"id":7,"templateId":"ride-ftp","name":"Kolo: FTP","sport":"ride","startDate":"2026-10-20","endDate":"2026-12-14","ftpStart":248,"ftpEnd":263,"ctlStart":52,"ctlEnd":61,"sessionsDone":28,"sessionsPlanned":30,"minutesDone":2110,"minutesPlanned":2250,"completion":{"1":97,"2":84,"3":100,"4":92,"5":71,"6":88,"7":95,"8":100},"weeks":[\#(weeks)],"next":[{"id":"ride-vo2","name":"Kolo: VO₂max blok","goal":"Vyšší strop aerobního výkonu"}]}"#
        let decoder = JSONDecoder()
        let plans = try decoder.decode(TrainingPlans.self, from: Data(plansJSON.utf8))
        let preview = try decoder.decode(PlanPreview.self, from: Data(previewJSON.utf8))
        let week = try decoder.decode(PlanWeekDetail.self, from: Data(weekJSON.utf8))
        let result = try decoder.decode(PlanResult.self, from: Data(resultJSON.utf8))
        let active = try XCTUnwrap(plans.active)
        let model = AppModel(demo: true)
        try render("plan-card", glow: Palette.Glow.training, height: 260) { ActivePlanSummary(active: active).padding(24) }
        try render("plan-preview", glow: Palette.Glow.training, height: 1150) {
            PlanPreviewContent(template: active.template, preview: preview) {}.padding(.horizontal, 24).environment(model)
        }
        // A plan of Aurin Pro without Pro: the adaptive plan card and "Začít s Aurin Pro" instead of "Začít plán".
        var locked = active.template
        locked.locked = true
        try render("plan-preview-locked", glow: Palette.Glow.training, height: 1250) {
            PlanPreviewContent(template: locked, preview: preview) {}.padding(.horizontal, 24).environment(model)
        }
        try render("plan-preview-failed", glow: Palette.Glow.training, height: 1150) {
            PlanPreviewContent(template: active.template, preview: nil, failed: true, canStart: false) {}.padding(.horizontal, 24).environment(model)
        }
        try render("plan-active", glow: Palette.Glow.training, height: 1500) {
            NavigationStack { ActivePlanContent(active: active, preview: preview, week: week).padding(.horizontal, 24) }.environment(model)
        }
        try render("plan-week", glow: Palette.Glow.training, height: 1000) {
            NavigationStack { PlanWeekContent(week: active.template.weeks[2], sport: "ride", detail: week).padding(.horizontal, 24) }.environment(model)
        }
        try render("plan-week-days", height: 700) { WeekDaysSheet(week: week, usual: 4).environment(model) }
        // Free time by weekday, two weeks in turn, this week only and the plan's days.
        let timeJSON = #"{"days":[45,60,0,60,0,180,240],"total":585,"daysB":[0,90,90,0,90,240,120],"totalB":630,"alternate":"2026-10-26","suits":[300,420],"short":false}"#
        let time = try decoder.decode(PlanPreview.Time.self, from: Data(timeJSON.utf8))
        try render("plan-free-time", height: 900) { FreeTimeSheet(time: time, planDays: [1, 3, 5, 6]).environment(model) }
        let weekWithTime = try decoder.decode(PlanWeekDetail.self, from: Data(weekJSON.replacingOccurrences(of: #""weekDays":null,"#, with: #""weekDays":null,"time":{"days":[45,60,0,45,0,120,180],"own":true,"weekB":false},"#).utf8))
        try render("plan-time-this-week", height: 900) { TimeThisWeekSheet(week: weekWithTime, planDays: [1, 3, 5, 6], usual: 4).environment(model) }
        let long = try decoder.decode(PlanPreview.Long.self, from: Data(#"{"day":5,"auto":5,"own":false}"#.utf8))
        try render("plan-days-and-time", height: 700) { DaysAndTimeSheet(sport: "ride", range: 3...6, initial: [1, 3, 5, 6], time: time, long: long).environment(model) }
        try render("plan-long-day", height: 600) { NavigationStack { LongDayPicker(sport: "run", days: [1, 3, 5, 6], time: time, auto: 5, selection: .constant(6)) } }
        try render("plan-time-short", height: 120) { PlanTimeNote(text: L10n.tr("Na tento plán je času málo. Klíčové jízdy zůstanou, lehké se zkrátí a odhad cíle bude opatrnější.")).padding(16) }
        // The "Úpravy" tiles must fit: an iPhone SE in both languages, and the largest text (one tile a row).
        let language = L10n.language
        defer { L10n.setLanguage(language) }
        for name in ["cs", "en"] {
            L10n.setLanguage(name)
            try render("plan-active-se-\(name)", glow: Palette.Glow.training, height: 1500, width: 320) {
                NavigationStack { ActivePlanContent(active: active, preview: preview, week: weekWithTime).padding(.horizontal, 16) }.environment(model).environment(\.locale, L10n.locale)
            }
            try render("plan-active-xxxl-\(name)", glow: Palette.Glow.training, height: 2600, width: 320, typeSize: .accessibility3) {
                NavigationStack { ActivePlanContent(active: active, preview: preview, week: weekWithTime).padding(.horizontal, 16) }.environment(model).environment(\.locale, L10n.locale)
            }
        }
        try render("plan-choose", height: 900) { TrainingPlansSheet(plans: plans).environment(model) }
        try render("plan-move", height: 340) { MoveSessionSheet(session: week.sessions[2], detail: week) { _ in } }
        try render("plan-result", glow: Palette.Glow.today, height: 1150) {
            NavigationStack { PlanResultContent(result: result, plans: plans).padding(.horizontal, 24) }.environment(model)
        }

        // A cycling race: the countdown on Training and the race's power and time.
        let gfWeeks = ["base", "base", "build", "recovery", "build", "build", "build", "recovery", "peak", "peak", "taper", "race"].enumerated().map { i, p in
            #"{"week":\#(i + 1),"phase":"\#(p)","phaseLabel":"\#(p)","load":1,"keys":["Sweet spot 3×15"],"longMinutes":null,"race":\#(p == "race")}"#
        }.joined(separator: ",")
        let gf = #"{"id":"ride-granfondo","sport":"ride","name":"Gran fondo","goal":"Dlouhý závod 100–200 km","description":"","level":"intermediate","weeksCount":12,"days":[3,6],"race":{"km":160,"options":[100,160,200],"kind":"granfondo"},"weeks":[\#(gfWeeks)]}"#
        let raceDay = ISODay.shift(APIClient.localToday(), 9)
        let ridePlan = #"{"templates":[\#(gf)],"active":{"id":8,"templateId":"ride-granfondo","name":"Gran fondo","startDate":"2026-10-19","raceDate":"\#(raceDay)","raceKm":160,"week":11,"weeksCount":12,"phaseLabel":"Ladění","started":true,"paused":false,"shiftedWeeks":0,"returning":false,"completion":{"1":100,"2":92,"3":88,"4":100,"5":76,"6":95,"7":90,"8":100,"9":84,"10":97},"race":{"km":160,"kind":"granfondo","minutes":298,"low":163,"high":188,"share":70,"estimated":false},"template":\#(gf)},"activeGym":null,"started":null}"#
        let ride = try XCTUnwrap(try decoder.decode(TrainingPlans.self, from: Data(ridePlan.utf8)).active)
        try render("plan-race-card", glow: Palette.Glow.training, height: 330) { ActivePlanSummary(active: ride).padding(24) }
        try render("plan-race-ride", glow: Palette.Glow.training, height: 700) {
            NavigationStack { ActivePlanContent(active: ride, preview: nil, week: nil).padding(.horizontal, 24) }.environment(model)
        }
        // A running race with a goal time: the goal, the estimate and the wheels to change it.
        let half = #"{"id":"run-half","sport":"run","name":"Půlmaraton","goal":"Půlmaraton v cílovém čase","description":"","level":"intermediate","weeksCount":10,"days":[4,5],"race":{"km":21.1,"options":null},"weeks":[\#(weeks)]}"#
        let runPlan = #"{"templates":[\#(half)],"active":{"id":9,"templateId":"run-half","name":"Půlmaraton","startDate":"2026-10-19","raceDate":"2027-04-04","raceKm":21.1,"week":6,"weeksCount":10,"phaseLabel":"Budování","started":true,"paused":false,"shiftedWeeks":0,"returning":false,"target":6120,"race":{"km":21.1,"estimate":6190,"estimateStart":6270,"target":6120,"goalPace":290,"verdict":"bold"},"template":\#(half)},"activeGym":null,"started":null}"#
        let run = try XCTUnwrap(try decoder.decode(TrainingPlans.self, from: Data(runPlan.utf8)).active)
        try render("plan-race-run", glow: Palette.Glow.training, height: 700) {
            NavigationStack { ActivePlanContent(active: run, preview: nil, week: nil, editGoal: {}).padding(.horizontal, 24) }.environment(model)
        }
        try render("plan-goal-time", height: 620) { GoalTimeSheet(km: 21.1, estimate: 6270, weeks: 10, initial: 6120) { _ in } }
        // Multisport in English, as the post on X shows it (the server's English
        // templates, src/training-plans.js): a sprint duathlon (its race's sports, run,
        // ride, run on race day, the same race as the watch's -race) and a plan without
        // a race with picked sports, each sheet with its overview instead of the spinner.
        L10n.setLanguage("en")
        typealias PlanWeek = (phase: String, label: String, load: Double, keys: [String], sessions: Int, minutes: Int, tss: Int)
        func planWeekJSON(_ list: [PlanWeek]) -> String {
            list.enumerated().map { i, w in
                #"{"week":\#(i + 1),"phase":"\#(w.phase)","phaseLabel":"\#(w.label)","load":\#(w.load),"keys":[\#(w.keys.map { "\"\($0)\"" }.joined(separator: ","))],"longMinutes":null,"race":\#(w.phase == "race")}"#
            }.joined(separator: ",")
        }
        func previewWeekJSON(_ list: [PlanWeek]) -> String {
            list.enumerated().map { i, w in
                #"{"week":\#(i + 1),"phase":"\#(w.phase)","phaseLabel":"\#(w.label)","keys":[\#(w.keys.map { "\"\($0)\"" }.joined(separator: ","))],"race":\#(w.phase == "race"),"sessions":\#(w.sessions),"minutes":\#(w.minutes),"tss":\#(w.tss)}"#
            }.joined(separator: ",")
        }
        let duWeekList: [PlanWeek] = [
            ("base", "Base", 1, ["Tempo 2×10", "Fartlek pyramid 1-2-3-2-1"], 5, 365, 315),
            ("base", "Base", 1.03, ["Tempo 2×15", "Hills 6×90 s"], 5, 375, 324),
            ("base", "Base", 1.06, ["Tempo 2×15", "Fartlek pyramid 1-2-3-4-3-2-1"], 5, 390, 337),
            ("recovery", "Recovery", 0.7, [], 5, 260, 225),
            ("build", "Build", 1.04, ["Sweet Spot 3×15", "Threshold intervals 3×10 min"], 5, 365, 315),
            ("peak", "Peak", 1.08, ["Threshold 2×20", "Sub-threshold 4×8 min"], 5, 385, 333),
            ("peak", "Peak", 1.08, ["Threshold 2×20", "Sub-threshold 4×8 min"], 5, 390, 337),
            ("recovery", "Recovery", 0.7, [], 5, 255, 220),
            ("taper", "Taper", 0.72, ["Threshold 3×10", "Threshold intervals 3×8 min"], 5, 250, 216),
            ("race", "Race", 0.5, [], 5, 165, 143)]
        let du = #"{"id":"du-sprint","sport":"triathlon","name":"Sprint duathlon","goal":"5 km run, 20 km ride, 2.5 km run","description":"","level":"beginner","weeksCount":10,"days":[4,6],"race":{"km":27.5,"options":null,"kind":"du-sprint","legList":[{"sport":"run","km":5},{"sport":"ride","km":20},{"sport":"run","km":2.5}]},"perSport":{"ride":2,"run":3},"sports":["ride","run"],"weeks":[\#(planWeekJSON(duWeekList))]}"#
        let duPlan = #"{"templates":[\#(du)],"active":{"id":11,"templateId":"du-sprint","name":"Sprint duathlon","startDate":"2026-10-05","raceDate":"2026-12-13","raceKm":27.5,"week":5,"weeksCount":10,"phaseLabel":"Build","started":true,"paused":false,"shiftedWeeks":0,"returning":false,"sports":["ride","run"],"perSport":{"ride":2,"run":3},"completion":{"1":100,"2":94,"3":88,"4":100},"race":{"km":27.5,"kind":"du-sprint","minutes":80,"legList":[{"sport":"run","km":5,"minutes":22},{"sport":"ride","km":20,"minutes":36},{"sport":"run","km":2.5,"minutes":12}]},"template":\#(du)},"activeGym":null,"started":null}"#
        let duathlon = try XCTUnwrap(try decoder.decode(TrainingPlans.self, from: Data(duPlan.utf8)).active)
        try render("plan-race-duathlon", glow: Palette.Glow.training, height: 700) {
            NavigationStack { ActivePlanContent(active: duathlon, preview: nil, week: nil).padding(.horizontal, 24) }.environment(model).environment(\.locale, L10n.locale)
        }
        let duPreview = try decoder.decode(PlanPreview.self, from: Data(#"{"startDate":"2026-11-09","firstDay":null,"endDate":"2027-01-17","days":[1,2,4,5,6],"weeks":[\#(previewWeekJSON(duWeekList))],"totals":{"sessions":50,"minutes":3200,"tss":2765}}"#.utf8))
        try render("plan-start-duathlon", height: 1500) { StartPlanSheet(template: duathlon.template, initial: duPreview).environment(model).environment(\.locale, L10n.locale) }
        let multiWeekList: [PlanWeek] = [
            ("base", "Base", 1, ["Tempo 2×10", "Fartlek pyramid 1-2-3-2-1"], 6, 365, 315),
            ("base", "Base", 1.03, ["Tempo 2×10", "Hills 6×90 s"], 6, 375, 324),
            ("base", "Base", 1.06, ["Tempo 2×15", "Fartlek pyramid 1-2-3-2-1"], 6, 390, 337),
            ("recovery", "Recovery", 0.7, [], 6, 260, 225),
            ("base", "Base", 1, ["Tempo 2×15", "Fartlek pyramid 1-2-3-4-3-2-1"], 6, 355, 307),
            ("build", "Build", 1.06, ["Threshold 2×15", "Tempo run 25 min"], 6, 375, 324),
            ("build", "Build", 1.08, ["Sweet Spot 3×15", "Threshold intervals 4×8 min"], 6, 385, 333),
            ("recovery", "Recovery", 0.7, [], 6, 255, 220),
            ("build", "Build", 1.04, ["Sweet Spot 3×15", "Threshold intervals 3×10 min"], 6, 360, 311),
            ("peak", "Peak", 1.08, ["Threshold 2×20", "Sub-threshold 4×8 min"], 6, 375, 324),
            ("peak", "Peak", 1.08, ["Threshold 2×20", "Sub-threshold 4×8 min"], 6, 380, 328),
            ("recovery", "Recovery", 0.7, [], 6, 250, 216)]
        let multi = try decoder.decode(TrainingPlans.Template.self, from: Data(#"{"id":"multi-base","sport":"triathlon","name":"Multisport","goal":"Fitness in two or three sports","description":"","level":"intermediate","weeksCount":12,"days":[4,7],"race":null,"perSport":{"ride":2,"run":2,"swim":2},"sports":["ride","run","swim"],"choose":true,"weeks":[\#(planWeekJSON(multiWeekList))]}"#.utf8))
        let multiPreview = try decoder.decode(PlanPreview.self, from: Data(#"{"startDate":"2026-11-09","firstDay":null,"endDate":"2027-01-31","days":[1,2,4,5,6],"sports":["ride","run"],"weeks":[\#(previewWeekJSON(multiWeekList))],"totals":{"sessions":72,"minutes":4125,"tss":3564}}"#.utf8))
        try render("plan-start-multisport", height: 1700) { StartPlanSheet(template: multi, initial: multiPreview).environment(model).environment(\.locale, L10n.locale) }
        try render("plan-sports", height: 420) { PlanSportsSheet(initial: ["ride", "swim"]).environment(model) }
        // A gym plan with its strength tests, and its result with the lifts before and after.
        let testKeys = "\"Dřep, bench, mrtvý tah: odhad maxima\",\"3× týdně\"", workKeys = "\"3× týdně\",\"5 × 5\",\"RPE 8\""
        let strengthWeeks = (1...12).map { (i: Int) -> String in
            let test = i == 1 || i == 12
            let phase = test ? "test" : i == 4 || i == 8 ? "recovery" : "build", label = test ? "Test síly" : "Síla", keys = test ? testKeys : workKeys
            return #"{"week":\#(i),"phase":"\#(phase)","phaseLabel":"\#(label)","load":1,"keys":[\#(keys)],"longMinutes":null,"race":false}"#
        }.joined(separator: ",")
        let strength = try decoder.decode(TrainingPlans.Template.self, from: Data(#"{"id":"gym-strength","sport":"gym","name":"Síla","goal":"Těžší dřep, bench a mrtvý tah","description":"12 týdnů, tři tréninky týdně.","level":"intermediate","weeksCount":12,"days":[3,4],"race":null,"tests":true,"weeks":[\#(strengthWeeks)]}"#.utf8))
        try render("plan-gym-strength", height: 1500) {
            NavigationStack { PlanDetailView(template: strength, active: nil, days: [0, 2, 4]) }.environment(model)
        }
        // Gym five times a week: push, pull and legs, each day's time up to 90 minutes.
        let gymPreviewJSON = #"{"startDate":"2026-11-02","endDate":"2027-01-24","days":[0,1,2,3,4],"weeks":[],"totals":{"sessions":0,"minutes":0,"tss":0},"added":[1,3],"gym":{"perWeek":5,"usual":3,"range":[2,7],"split":"Tlaky / tahy / nohy","days":[{"day":0,"part":"push","label":"tlaky","minutes":60},{"day":1,"part":"pull","label":"tahy","minutes":45},{"day":2,"part":"legs","label":"nohy","minutes":90},{"day":3,"part":"push","label":"tlaky","minutes":60},{"day":4,"part":"pull","label":"tahy","minutes":75}]}}"#
        let gymPreview = try decoder.decode(PlanPreview.self, from: Data(gymPreviewJSON.utf8))
        try render("plan-gym-five", height: 2000) {
            NavigationStack { PlanDetailView(template: strength, active: nil, days: [0, 1, 2, 3, 4], gymPreview: gymPreview) }.environment(model)
        }
        let gymResultJSON = #"{"id":10,"templateId":"gym-strength","name":"Síla","sport":"gym","startDate":"2026-10-19","endDate":"2027-01-10","ftpStart":null,"ftpEnd":null,"ctlStart":null,"ctlEnd":null,"sessionsDone":33,"sessionsPlanned":34,"minutesDone":0,"minutesPlanned":null,"completion":{"1":100,"2":100,"3":67,"4":100,"5":100,"6":100,"7":100,"8":100,"9":67,"10":100,"11":100,"12":100},"weeks":[\#(strengthWeeks)],"next":[],"lifts":[{"exercise":"Barbell back squat","before":136,"after":148},{"exercise":"Barbell bench press","before":104,"after":110},{"exercise":"Barbell Deadlift","before":158,"after":171}]}"#
        let gymResult = try decoder.decode(PlanResult.self, from: Data(gymResultJSON.utf8))
        try render("plan-result-gym", glow: Palette.Glow.today, height: 1100) {
            NavigationStack { PlanResultContent(result: gymResult).padding(.horizontal, 24) }.environment(model)
        }
        // An open-water race: one swim leg, the time estimated from CSS.
        let ow = #"{"id":"swim-open-water","sport":"swim","name":"Závod ve volné vodě","goal":"Závod 1,5 až 5 km ve volné vodě","description":"","level":"intermediate","weeksCount":12,"days":[3,4],"race":{"km":3.8,"options":[1.5,3.8,5],"swim":true},"weeks":[\#(weeks)]}"#
        let owPlan = #"{"templates":[\#(ow)],"active":{"id":12,"templateId":"swim-open-water","name":"Závod ve volné vodě","startDate":"2026-10-19","raceDate":"2027-01-10","raceKm":3.8,"week":6,"weeksCount":12,"phaseLabel":"Budování","started":true,"paused":false,"shiftedWeeks":0,"returning":false,"race":{"km":3.8,"kind":"swim","minutes":76,"estimated":false,"legList":[{"sport":"swim","meters":3800,"minutes":76}]},"template":\#(ow)},"activeGym":null,"started":null}"#
        let openWater = try XCTUnwrap(try decoder.decode(TrainingPlans.self, from: Data(owPlan.utf8)).active)
        try render("plan-race-open-water", glow: Palette.Glow.training, height: 700) {
            NavigationStack { ActivePlanContent(active: openWater, preview: nil, week: nil).padding(.horizontal, 24) }.environment(model)
        }
        // Faster swimming: the result with CSS before and after.
        let swimResultJSON = #"{"id":13,"templateId":"swim-css","name":"Rychlejší plavání","sport":"swim","startDate":"2026-10-19","endDate":"2026-12-27","ftpStart":null,"ftpEnd":null,"cssStart":112,"cssEnd":105,"ctlStart":31,"ctlEnd":38,"sessionsDone":28,"sessionsPlanned":30,"minutesDone":1290,"minutesPlanned":1350,"completion":{"1":100,"2":100,"3":67,"4":100,"5":100,"6":100,"7":100,"8":100},"weeks":[\#(weeks)],"next":[]}"#
        let swimResult = try decoder.decode(PlanResult.self, from: Data(swimResultJSON.utf8))
        try render("plan-result-swim", glow: Palette.Glow.today, height: 1150) {
            NavigationStack { PlanResultContent(result: swimResult).padding(.horizontal, 24) }.environment(model)
        }
    }

    /// `window`: draw from a window, as for a NavigationStack; ImageRenderer leaves a
    /// ScrollView empty (the Aurin Pro pages showed only their background).
    private func render<V: View>(_ name: String, glow: Color = Palette.Glow.today, height: CGFloat? = nil, width: CGFloat = 390, typeSize: DynamicTypeSize = .large, window: Bool = false, @ViewBuilder _ content: () -> V) throws {
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        for (suffix, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
            let view = content()
                .dynamicTypeSize(typeSize)
                .frame(width: width, height: height)
                .background { ScreenBackground(glow: glow) }
                .environment(\.colorScheme, scheme)
            let image: UIImage?
            let type = String(reflecting: V.self)
            if window || type.contains("NavigationStack") || type.contains("Sheet") {
                // ImageRenderer stops the whole test run on iOS 27 ("no current update
                // to enqueue action to") when the view holds a NavigationStack, which it
                // cannot flatten; such a screen, and every sheet (most open with their
                // own NavigationStack), is drawn from a window instead.
                image = hosted(view, width: width, height: height, scheme: scheme)
            } else {
                let renderer = ImageRenderer(content: view)
                renderer.scale = 2
                image = renderer.uiImage
            }
            let data = try XCTUnwrap(image?.pngData(), "\(name) did not render")
            try data.write(to: outputDirectory.appending(path: "\(name)-\(suffix).png"))
        }
    }

    /// The view in a window of the test host, drawn as the screen shows it.
    private func hosted<V: View>(_ view: V, width: CGFloat, height: CGFloat?, scheme: ColorScheme) -> UIImage? {
        let controller = UIHostingController(rootView: view)
        controller.safeAreaRegions = []
        controller.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        controller.view.backgroundColor = .clear
        // Without a set height the view's own height, as ImageRenderer measured it;
        // a view that takes any height it gets stops at a long phone screen.
        let fitted = height ?? controller.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
        let size = CGSize(width: width, height: fitted.isFinite && fitted > 0 ? min(ceil(fitted), 4000) : 1600)
        guard let scene = ProStore.anchorScene() else { return nil }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = controller
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        controller.view.frame = window.bounds
        controller.view.layoutIfNeeded()
        // SwiftUI's first update and the async images settle.
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        controller.view.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            _ = controller.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
        }
    }
}
