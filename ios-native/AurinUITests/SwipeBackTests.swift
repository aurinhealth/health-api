import XCTest

/// The swipe from the left edge goes back from the details opened on Dnes
/// (TestFlight 602, 606 and 611: it did nothing on Readiness and Resting HR,
/// only the back button worked).
final class SwipeBackTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testEdgeSwipeBackFromReadiness() {
        swipeBack(from: "open.readiness")
    }

    /// Resting HR opened as its link would (-open), on top of Zdraví: back
    /// is the page's "Zpět", gone once the swipe went back.
    func testEdgeSwipeBackFromRestingHR() {
        app.launchArguments = ["-demo", "-swipeBackLog", "-open", "metric/restingHR", "-AppleLanguages", "(cs)", "-AppleLocale", "cs_CZ"]
        app.launch()
        let back = app.buttons.matching(identifier: "Zpět")
        XCTAssertTrue(waitUntil(20) { self.onScreen(back) != nil }, "Resting HR did not open")
        wait(1.5)
        edgeSwipe()
        expect(waitUntil { self.onScreen(back) == nil }, "the edge swipe did not go back from Resting HR")
    }

    private func swipeBack(from identifier: String) {
        app.launchArguments = ["-demo", "-swipeBackLog", "-AppleLanguages", "(cs)", "-AppleLocale", "cs_CZ"]
        app.launch()
        XCTAssertTrue(app.buttons.matching(identifier: "Dnes").firstMatch.waitForExistence(timeout: 20), "Dnes did not appear")

        // On iOS 26 the other tabs stay in the tree: take the card on screen.
        let cards = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", identifier))
        XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 10), "\(identifier) is missing on Dnes")
        let back = app.buttons.matching(identifier: "Zpět")
        // Five times over: the dropped swipe came now and then, not every time.
        for round in 1...5 {
            var card = onScreen(cards)
            for _ in 0..<3 where card == nil { app.swipeUp(); card = onScreen(cards) }
            guard let card else { return XCTFail("\(identifier) is not on screen") }
            card.tap()
            // The detail's "Zpět" tells it opened: the card itself, bound by index,
            // can lose its activation point under the pushed page (CI, #1259).
            XCTAssertTrue(waitUntil { self.onScreen(back) != nil }, "\(identifier) did not open")
            wait(1.5)
            edgeSwipe()
            // Let the pop settle before reading the screen (a cancelled pop is redone after it).
            wait(1)
            // One swipe has to do it: a dropped first swipe was a real bug (CI and
            // TestFlight 602 to 611). With "-swipeBackLog" the app keeps what the
            // swipe was asked on an invisible element, printed here when it fails.
            let wentBack = waitUntil { self.onScreen(back) == nil && self.onScreen(cards) != nil }
            if !wentBack {
                print("SwipeBack: round \(round), app log: \(app.descendants(matching: .any)["swipeBackLog"].label)")
                for element in back.allElementsBoundByIndex where element.isHittable {
                    print("SwipeBack: hittable Zpět at \(element.frame), label \(element.label)")
                }
            }
            expect(wentBack, "the edge swipe did not go back from \(identifier) (round \(round))")
            wait(1)
        }
    }

    /// A finger from the very left edge to two thirds across.
    private func edgeSwipe() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)
    }

    /// Fails with a screenshot of what the swipe left on screen.
    private func expect(_ ok: Bool, _ message: String) {
        if !ok {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "after-edge-swipe"
            shot.lifetime = .keepAlways
            add(shot)
        }
        XCTAssertTrue(ok, message)
    }

    /// The first element on screen. An element mid-animation (the page the
    /// swipe takes away) can have no frame to hit or be gone a moment later,
    /// and reading it then fails the test by itself: such an element is not on screen.
    private func onScreen(_ query: XCUIElementQuery) -> XCUIElement? {
        // Read through snapshot(), which throws instead of failing the test
        // when the element went away between the query and the read (CI, #1298).
        let screen = app.frame
        return query.allElementsBoundByIndex.first { element in
            guard let frame = (try? element.snapshot())?.frame, !frame.isEmpty,
                  screen.contains(CGPoint(x: frame.midX, y: frame.midY)) else { return false }
            return element.isHittable
        }
    }

    private func waitUntil(_ timeout: TimeInterval = 5, _ condition: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if condition() { return true }
            wait(0.25)
        }
        return condition()
    }

    private func wait(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [expectation(description: "settle")], timeout: seconds)
    }
}
