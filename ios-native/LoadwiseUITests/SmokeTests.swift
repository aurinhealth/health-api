import XCTest

/// Before every release (Vydat): the real app on the simulator, tapped through
/// its main screens like a person would, with the sample data. It fails when the
/// app crashes or a main screen does not appear, and saves a screenshot of each
/// step to SMOKE_DIR (CI: the Loadwise-native-screens artifact, smoke/).
/// The texts are the Czech ones: the app is started in Czech.
final class SmokeTests: XCTestCase {
    private var app: XCUIApplication!
    private var step = 0
    /// The test's number: 1-… the first launch, 2-… the main screens.
    private var prefix: String { name.contains("test1") ? "1" : "2" }

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// A new phone: the welcome pages, the sign-in, the e-mail code sheet, then
    /// "Prohlédnout ukázku" into the app. Runs first (tests go by name).
    func test1FirstLaunch() {
        launch()
        let skip = app.buttons["Přeskočit"]
        XCTAssertTrue(skip.waitForExistence(timeout: 20), "the welcome pages did not appear")
        shot("uvod")
        skip.tap()
        let email = app.buttons["Pokračovat e-mailem"]
        XCTAssertTrue(email.waitForExistence(timeout: 5), "the sign-in did not appear")
        // Its label also holds the "G" drawn as text.
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Pokračovat přes Google")).firstMatch.exists)
        shot("prihlaseni")
        email.tap()
        let cancel = app.buttons["Zrušit"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5), "the e-mail sign-in did not open")
        shot("prihlaseni-e-mailem")
        cancel.tap()
        let demo = app.buttons["Prohlédnout ukázku"]
        XCTAssertTrue(demo.waitForExistence(timeout: 5))
        demo.tap()
        XCTAssertTrue(tab("Dnes").waitForExistence(timeout: 10), "the sample data did not open")
        shot("ukazka-dnes")
    }

    /// The four tabs, a detail on each of Dnes and Zdraví, "+", the coach and
    /// the settings.
    func test2MainScreens() {
        launch("-demo")
        XCTAssertTrue(tab("Dnes").waitForExistence(timeout: 20), "Dnes did not appear")
        shot("dnes")

        for (name, file) in [("Trénink", "trenink"), ("Jídlo", "jidlo"), ("Zdraví", "zdravi")] {
            tab(name).tap()
            XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
            pause()
            XCTAssertTrue(tab(name).isSelected, "\(name) did not open")
            shot(file)
        }

        // Zdraví → Připravenost.
        open("readiness", "pripravenost")

        // Dnes → Spánek and Námaha.
        launch("-demo")
        _ = tab("Dnes").waitForExistence(timeout: 20)
        open("sleep", "spanek")
        launch("-demo")
        _ = tab("Dnes").waitForExistence(timeout: 20)
        open("strain", "namaha")

        // "+": what can be added.
        launch("-demo")
        let add = app.buttons["Přidat záznam"]
        XCTAssertTrue(add.waitForExistence(timeout: 20))
        add.tap()
        XCTAssertTrue(app.staticTexts["Co přidáme?"].waitForExistence(timeout: 5), "+ did not open")
        shot("pridat")

        // The coach.
        launch("-demo")
        XCTAssertTrue(tab("Dnes").waitForExistence(timeout: 20))
        hittable(app.buttons.matching(identifier: "Kouč")).tap()
        let coach = app.staticTexts["Na co se chceš zeptat?"]
        let consent = app.staticTexts["Kouč používá AI"]
        XCTAssertTrue(coach.waitForExistence(timeout: 8) || consent.exists, "the coach did not open")
        shot("kouc")

        // Profile and settings.
        launch("-demo")
        XCTAssertTrue(tab("Dnes").waitForExistence(timeout: 20))
        hittable(app.buttons.matching(identifier: "Profil a nastavení")).tap()
        XCTAssertTrue(app.staticTexts["Prohlížíš ukázková data. Změny se neukládají."].waitForExistence(timeout: 8), "the settings did not open")
        shot("nastaveni")

        // Dnes → the athlete's status (Aktivní, Nemoc, Zranění, Pauza).
        launch("-demo")
        XCTAssertTrue(tab("Dnes").waitForExistence(timeout: 20))
        hittable(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Stav sportovce"))).tap()
        XCTAssertTrue(app.staticTexts["Trénuješ a jsi v pořádku"].waitForExistence(timeout: 8), "the status did not open")
        pause()
        shot("stav")
    }

    // MARK: - Helpers

    private func launch(_ arguments: String...) {
        app.launchArguments = arguments + ["-AppleLanguages", "(cs)", "-AppleLocale", "cs_CZ"]
        app.launch()
    }

    private func tab(_ name: String) -> XCUIElement {
        app.buttons.matching(identifier: name).firstMatch
    }

    /// The first of several same-named buttons that can be tapped (the top bar
    /// shows one of two, depending on the scroll).
    private func hittable(_ query: XCUIElementQuery) -> XCUIElement {
        _ = query.firstMatch.waitForExistence(timeout: 5)
        return query.allElementsBoundByIndex.first { $0.isHittable } ?? query.firstMatch
    }

    /// A card that opens a detail (RouteLink, identifier "open.<route>").
    private func open(_ route: String, _ file: String) {
        let card = app.descendants(matching: .any).matching(identifier: "open.\(route)").firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 8), "the \(route) card is missing")
        if !card.isHittable { app.swipeUp() }
        card.tap()
        pause(2)
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5), "the app quit on \(route)")
        XCTAssertFalse(card.isHittable, "\(route) did not open")
        shot(file)
    }

    private func pause(_ seconds: TimeInterval = 1.5) {
        _ = XCTWaiter.wait(for: [expectation(description: "settle")], timeout: seconds)
    }

    /// Numbered in the order of the walk, so the folder reads as the flow.
    private func shot(_ name: String) {
        step += 1
        let file = String(format: "%@-%02d-%@", prefix, step, name)
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = file
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let dir = ProcessInfo.processInfo.environment["SMOKE_DIR"] else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? png.write(to: URL(fileURLWithPath: dir).appending(path: "\(file).png"))
    }
}
