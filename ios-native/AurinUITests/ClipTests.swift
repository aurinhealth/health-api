import XCTest

/// Short screen recordings of the app for Aurin's socials (app-videos.yml): CI
/// records the simulator from each test's start() to its end(), so the launch
/// and the test runner stay out. English, the sample data. They only move
/// through the app and never fail; the smoke test (AurinSmoke) skips them.
final class ClipTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = true
    }

    /// Today from the top down and back.
    func testToday() {
        english()
        pause(3)
        start()
        scroll(3)
        pause(1)
        scroll(3, up: true)
        pause(1)
        end()
    }

    func testSleep() {
        english("-open", "sleep")
        pause(4)
        start()
        scroll(3)
        end()
    }

    func testReadiness() {
        english("-open", "readiness")
        pause(4)
        start()
        scroll(2)
        end()
    }

    func testStrain() {
        english("-open", "strain")
        pause(4)
        start()
        scroll(2)
        end()
    }

    /// The 3D figure turned one way and back, then the muscles below.
    func testMuscles() {
        english("-open", "muscles")
        pause(5)
        start()
        let middle = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
        middle.press(forDuration: 0.1, thenDragTo: middle.withOffset(CGVector(dx: 160, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.2)
        pause(2)
        middle.press(forDuration: 0.1, thenDragTo: middle.withOffset(CGVector(dx: -160, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.2)
        pause(2)
        scroll(2)
        end()
    }

    /// The gym day into training mode: a set done, the rest timer counting, the
    /// next set, and the summary at the finish.
    func testWorkout() {
        english("-open", "gym/2026-10-08")
        pause(4)
        start()
        pause(1)
        // Straight to the button, as test4WebsiteScenes does: after a scroll it sits
        // under the top bar and the tap missed it.
        if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Start workout")).firstMatch) {
            pause(2)
            if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Start workout")).firstMatch) { pause(2) }
            if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Set done")).firstMatch) {
                // The first rest asks for notifications; the system's question would cover the timer.
                let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
                if allow.waitForExistence(timeout: 3) { allow.tap() }
                pause(5)
                if tapIfThere(app.buttons["Skip"]) { pause(2) }
            }
            if tapIfThere(app.buttons["Finish"].firstMatch) {
                pause(2)
                if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Finish workout")).firstMatch) {
                    pause(3)
                    scroll(1)
                }
            }
        }
        end()
    }

    /// Food, scrolled, and what can be added.
    func testFood() {
        english("-tab", "food")
        pause(4)
        start()
        scroll(2)
        scroll(2, up: true)
        if tapIfThere(app.buttons.matching(identifier: "Add entry").firstMatch) { pause(3) }
        end()
    }

    func testCoach() {
        english()
        pause(4)
        start()
        let coach = app.buttons.matching(identifier: "Coach")
        _ = coach.firstMatch.waitForExistence(timeout: 6)
        if let button = coach.allElementsBoundByIndex.first(where: { $0.isHittable }) {
            button.tap()
            pause(4)
        }
        end()
    }

    // MARK: - Helpers

    private func english(_ arguments: String...) {
        app.launchArguments = ["-demo"] + arguments + ["-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
    }

    /// The clip's start and end, agreed with app-videos.yml through files in
    /// CLIP_DIR: the test says "ready" once the screen is up, CI starts the
    /// recording and answers "go", and "done" stops it. The recording's own clock
    /// leaves out the seconds the screen stood still, so cut times taken from a
    /// clock missed by seconds.
    private func start() {
        guard let dir = clipDir else { return }
        FileManager.default.createFile(atPath: "\(dir)/\(clip).ready", contents: nil)
        let wait = Date().addingTimeInterval(30)
        while !FileManager.default.fileExists(atPath: "\(dir)/\(clip).go"), Date() < wait {
            pause(0.25)
        }
        pause(0.5)
    }

    private func end() {
        pause(1)
        guard let dir = clipDir else { return }
        FileManager.default.createFile(atPath: "\(dir)/\(clip).done", contents: nil)
    }

    private var clipDir: String? {
        guard let dir = ProcessInfo.processInfo.environment["CLIP_DIR"] else { return nil }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        return dir
    }

    /// "testToday" → "today", the clip's file name.
    private var clip: String {
        name.components(separatedBy: "test").last?.trimmingCharacters(in: CharacterSet(charactersIn: "]")).lowercased() ?? "clip"
    }

    private func scroll(_ times: Int, up: Bool = false) {
        for _ in 0..<times {
            if up { app.swipeDown(velocity: .slow) } else { app.swipeUp(velocity: .slow) }
            pause(1.2)
        }
    }

    @discardableResult
    private func tapIfThere(_ element: XCUIElement) -> Bool {
        guard element.waitForExistence(timeout: 6) else { return false }
        if !element.isHittable { app.swipeUp() }
        guard element.isHittable else { return false }
        element.tap()
        return true
    }

    private func pause(_ seconds: TimeInterval = 1.5) {
        _ = XCTWaiter.wait(for: [expectation(description: "settle")], timeout: seconds)
    }
}
