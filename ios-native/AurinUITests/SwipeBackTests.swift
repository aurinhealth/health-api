import XCTest

/// The swipe from the left edge goes back from the details opened on Dnes
/// (TestFlight 602, 606 and 611: it did nothing on Readiness and Resting HR,
/// only the back button worked). HRV opens the same page as Resting HR.
final class SwipeBackTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testEdgeSwipeBackFromReadiness() {
        swipeBack(from: "open.readiness")
    }

    func testEdgeSwipeBackFromHeartValue() {
        swipeBack(from: "open.metric")
    }

    private func swipeBack(from identifier: String) {
        app.launchArguments = ["-demo", "-AppleLanguages", "(cs)", "-AppleLocale", "cs_CZ"]
        app.launch()
        XCTAssertTrue(app.buttons.matching(identifier: "Dnes").firstMatch.waitForExistence(timeout: 20), "Dnes did not appear")

        // On iOS 26 the other tabs stay in the tree: take the card on screen.
        let cards = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", identifier))
        XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 10), "\(identifier) is missing on Dnes")
        var card = onScreen(cards)
        for _ in 0..<3 where card == nil { app.swipeUp(); card = onScreen(cards) }
        guard let card else { return XCTFail("\(identifier) is not on screen") }
        card.tap()
        XCTAssertTrue(waitUntil { !card.isHittable }, "\(identifier) did not open")
        wait(1.5)

        // A finger from the very left edge to two thirds across.
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)

        let back = waitUntil { card.isHittable }
        if !back {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "after-edge-swipe-\(identifier)"
            shot.lifetime = .keepAlways
            add(shot)
        }
        XCTAssertTrue(back, "the edge swipe did not go back from \(identifier)")
    }

    private func onScreen(_ query: XCUIElementQuery) -> XCUIElement? {
        query.allElementsBoundByIndex.first { $0.isHittable }
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
