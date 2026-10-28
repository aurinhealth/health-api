import XCTest

/// The App Store preview video (app preview): the sample day walked through at a
/// viewer's pace (Today, Training, food, then a gym set and its rest), in English and in Czech. ios-native.yml records the simulator's
/// screen while this runs; the test writes when each clip starts and ends to
/// PREVIEW_DIR/marks.txt, and scripts/app-preview.mjs cuts the clips out of the
/// recording (no launches, no test runner) into one 15–30 s video per language.
/// It never fails the run: a changed label costs a scene, not a release.
final class AppPreviewTests: XCTestCase {
    private var app: XCUIApplication!
    private var language = "en"

    private struct Labels {
        let today, training, food, start, setDone, skip: String
    }

    private let labels = [
        "en": Labels(today: "Today", training: "Training", food: "Food",
                     start: "Start workout", setDone: "Set done", skip: "Skip"),
        "cs": Labels(today: "Dnes", training: "Trénink", food: "Jídlo",
                     start: "Začít trénink", setDone: "Série hotová", skip: "Přeskočit")]

    override func setUp() {
        continueAfterFailure = true
        app = XCUIApplication()
    }

    func testAppPreview() {
        warmUp()
        for language in ["en", "cs"] {
            self.language = language
            let l = labels[language]!

            // Every tap waits for the app to settle (about 3 s with the dial and the
            // charts moving), so the taps themselves give each screen its time.
            // Today as it opens (the dial turns), then Training. No scrolling first:
            // on iOS 26 the tab bar hides while Today scrolls.
            launch("-tab", "today")
            guard tab(l.today).waitForExistence(timeout: 20) else { continue }
            mark("in")
            pause(3)
            tapIfThere(tab(l.training))
            pause(1)
            mark("out")

            // Food: eaten against the target and the day's meals.
            launch("-tab", "food")
            guard tab(l.food).waitForExistence(timeout: 20) else { continue }
            mark("in")
            pause(3)
            mark("out")

            // The gym day into training mode: a set done, the rest counting down, the next set.
            launch("-open", "gym/2026-10-08")
            let start = button(containing: l.start)
            guard start.waitForExistence(timeout: 20) else { continue }
            mark("in")
            tapIfThere(start)
            tapIfThere(button(containing: l.start))
            tapIfThere(button(containing: l.setDone))
            pause(2)
            tapIfThere(app.buttons[l.skip])
            pause(0.5)
            mark("out")
        }
    }

    // MARK: - Helpers

    /// The first rest asks to send notifications: answered here, before the
    /// camera rolls, so the system's question never shows in the video.
    private func warmUp() {
        launch("-open", "gym/2026-10-08")
        let start = button(containing: labels["en"]!.start)
        guard start.waitForExistence(timeout: 20) else { return }
        tapIfThere(start)
        tapIfThere(button(containing: labels["en"]!.start))
        tapIfThere(button(containing: labels["en"]!.setDone))
        let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        pause(1)
    }

    private func launch(_ arguments: String...) {
        let locale = language == "en" ? "en_US" : "cs_CZ"
        app.launchArguments = ["-demo"] + arguments + ["-language", language, "-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
    }

    private func tab(_ name: String) -> XCUIElement {
        app.buttons.matching(identifier: name).firstMatch
    }

    private func button(containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    @discardableResult
    private func tapIfThere(_ element: XCUIElement) -> Bool {
        guard element.waitForExistence(timeout: 6) else { return false }
        if !element.isHittable { app.swipeUp() }
        guard element.isHittable else { return false }
        element.tap()
        return true
    }

    private func pause(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [expectation(description: "settle")], timeout: seconds)
    }

    /// One line per cut, "<language> in|out <seconds since 1970>": the simulator
    /// runs on the Mac's clock, the same one the recording's start is taken on.
    private func mark(_ edge: String) {
        guard let dir = ProcessInfo.processInfo.environment["PREVIEW_DIR"] else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let line = String(format: "%@ %@ %.3f\n", language, edge, Date().timeIntervalSince1970)
        let url = URL(fileURLWithPath: dir).appending(path: "marks.txt")
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(Data(line.utf8))
            try? handle.close()
        } else {
            try? Data(line.utf8).write(to: url)
        }
    }
}
