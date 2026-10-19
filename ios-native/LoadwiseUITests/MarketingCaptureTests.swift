import XCTest

/// Real simulator captures for the public website. Run only with
/// MARKETING_CAPTURE=1 (ios-marketing.yml); normal release smoke tests skip it.
/// The app's existing demo mode supplies sample data, never a signed-in account.
final class MarketingCaptureTests: XCTestCase {
    private var app: XCUIApplication!
    private var captured: [String] = []
    private var omitted: [[String: String]] = []
    private var requiredFailures: [String] = []
    private let gymDate = "2026-10-08" // DemoData.gym, not the runner's current date.

    override func setUpWithError() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["MARKETING_CAPTURE"] == "1",
                          "Website captures run separately from release smoke tests.")
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testMarketingJourney() throws {
        launch()
        capture("01-today", proving: ["Readiness", "78"])

        launch("-open", "readiness")
        capture("02-readiness", proving: ["What makes up today's score", "78"])

        launch("-open", "sleep")
        capture("03-sleep", proving: ["Sleep stages", "7:12"])

        launch("-open", "sleep-settings")
        capture("04-bedtime-planner", proving: ["Bedtime", "Wake"])

        // A populated calendar and weekly load, rather than an empty plan editor.
        launch("-tab", "training")
        capture("05-training-plan", proving: ["Training", "8.4"])

        launch("-open", "gym/\(gymDate)")
        capture("06-gym-plan", proving: ["Full body", "Today's workout"])
        captureTrainingJourney()

        launch("-open", "muscles")
        capture("10-muscle-recovery", proving: ["Muscle fatigue", "Rest"])

        launch("-tab", "food")
        capture("11-nutrition", proving: ["Protein", "kcal"])

        // This is deliberately not a marketing screenshot: demo mode has no
        // assistant response and disables sending (CoachView.send()).
        omit("12-ai-coach", reason: "Demo mode has no populated conversation and cannot send. An empty welcome screen does not demonstrate AI coaching.")
        omit("gym-builder", reason: "The builder starts as an unfilled form; the populated gym plan is a stronger proof of the product.")

        try saveManifest()
        XCTAssertTrue(requiredFailures.isEmpty,
                      "Required captures were omitted: \(requiredFailures.joined(separator: ", ")). See manifest.json and diagnostics/.")
        XCTAssertEqual(captured.count, 11, "The marketing journey should produce eleven populated screenshots.")
    }

    private func captureTrainingJourney() {
        // Open the mode through the real button on the gym plan. It may be
        // below the fold on smaller devices, so scroll without changing data.
        guard tapButton("Start workout", swipes: 3) else {
            failTraining("Start workout is missing from the gym plan.")
            return
        }
        settle()
        if button("Start workout").waitForExistence(timeout: 8) {
            guard tapButton("Start workout", swipes: 2) else {
                failTraining("Training mode did not start.")
                return
            }
        }
        settle()
        scrollTrainingToTop()
        capture("07-training-set", proving: ["Squat", "Set done"])

        guard tapButton("Set done", swipes: 2) else {
            failTraining("The first set cannot be completed.", excluding: ["07-training-set"])
            return
        }
        settle()
        dismissNotificationPrompt()
        scrollTrainingToTop()
        capture("08-training-rest", proving: ["Rest", "Skip"])

        // Complete the remaining sample sets with their real planned values.
        // Do not fabricate elapsed time, calories, heart rate or an AI answer.
        for _ in 0..<12 {
            if text("Workout done").exists { break }
            if button("Skip").exists {
                guard tapButton("Skip", swipes: 1) else { break }
                settle(0.7)
            }
            if text("Workout done").exists { break }
            guard tapButton("Set done", swipes: 2) else { break }
            settle(0.7)
        }
        // With every set done the app already shows its actual summary.
        // Finishing it changes the CTA to Rate and records completion in memory.
        if button("Finish workout").exists {
            _ = tapButton("Finish workout", swipes: 3)
            settle()
        }
        scrollTrainingToTop()
        capture("09-workout-done", proving: ["Workout done", "Full body"])
    }

    // MARK: Launch and interaction

    private func launch(_ arguments: String...) {
        if app.state != .notRunning { app.terminate() }
        app.launchArguments = ["-demo", "-appearance", "light"] + arguments + [
            "-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"
        ]
        app.launch()
        _ = app.wait(for: .runningForeground, timeout: 20)
        settle(2)
    }

    private func button(_ title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", title)).firstMatch
    }

    private func text(_ fragment: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS[c] %@", fragment)).firstMatch
    }

    @discardableResult
    private func tapButton(_ title: String, swipes: Int) -> Bool {
        let query = app.buttons.matching(NSPredicate(format: "label == %@", title))
        _ = query.firstMatch.waitForExistence(timeout: 5)
        for attempt in 0...swipes {
            if let target = query.allElementsBoundByIndex.first(where: { $0.isHittable }) {
                target.tap()
                return true
            }
            if attempt < swipes { app.swipeUp(); settle(0.6) }
        }
        return false
    }

    private func dismissNotificationPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        if alert.waitForExistence(timeout: 3) {
            // Notification permission is requested by the real rest timer.
            // Accepting it only affects this disposable simulator.
            let allow = alert.buttons["Allow"]
            if allow.exists { allow.tap(); settle(0.7) }
        }
    }

    private func settle(_ seconds: TimeInterval = 1.2) {
        _ = XCTWaiter.wait(for: [expectation(description: "UI settles")], timeout: seconds)
    }

    private func scrollTrainingToTop() {
        // The same ScrollView changes from set → rest → summary and can keep
        // an old offset after a button below the fold was tapped.
        let scroll = app.scrollViews.firstMatch
        if scroll.exists { scroll.swipeDown(); scroll.swipeDown(); settle(0.5) }
    }

    // MARK: Capture quality and provenance

    private func capture(_ name: String, proving fragments: [String]) {
        let missing = fragments.filter { !text($0).waitForExistence(timeout: 8) }
        guard app.state == .runningForeground, missing.isEmpty,
              !app.keyboards.firstMatch.exists,
              !XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch.exists else {
            requiredFailures.append(name)
            omit(name, reason: "Capture rejected: missing content \(missing); app must be in foreground without a keyboard or system alert.", diagnostic: true)
            return
        }
        settle(0.8)
        saveScreenshot(name, directory: "selected")
        captured.append(name)
    }

    private func failTraining(_ reason: String, excluding: [String] = []) {
        for name in ["07-training-set", "08-training-rest", "09-workout-done"]
        where !captured.contains(name) && !requiredFailures.contains(name) && !excluding.contains(name) {
            requiredFailures.append(name)
            omit(name, reason: reason, diagnostic: true)
        }
    }

    private func omit(_ name: String, reason: String, diagnostic: Bool = false) {
        omitted.append(["name": name, "reason": reason])
        if diagnostic { saveScreenshot(name, directory: "diagnostics") }
    }

    private func saveScreenshot(_ name: String, directory: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = "\(directory)-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let root = ProcessInfo.processInfo.environment["MARKETING_DIR"] else { return }
        let dir = URL(fileURLWithPath: root).appendingPathComponent(directory)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try png.write(to: dir.appendingPathComponent("\(name).png"))
        } catch {
            XCTFail("Screenshot exists in xcresult, but PNG export failed: \(error)")
        }
    }

    private func saveManifest() throws {
        let manifest: [String: Any] = [
            "source": "XCUIScreen.main.screenshot() on an iOS simulator",
            "sampleData": true, "sampleDate": gymDate, "language": "en_US",
            "appearance": "light", "statusBar": "9:41, full battery, Wi-Fi",
            "selected": captured, "omitted": omitted,
            "review": "Selected captures passed screen/content checks; inspect every PNG visually before publishing. No UI pixels or performance metrics have been edited."
        ]
        let data = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "marketing-manifest"
        attachment.lifetime = .keepAlways
        add(attachment)
        if let root = ProcessInfo.processInfo.environment["MARKETING_DIR"] {
            try FileManager.default.createDirectory(atPath: root, withIntermediateDirectories: true)
            try data.write(to: URL(fileURLWithPath: root).appendingPathComponent("manifest.json"))
        }
    }
}
