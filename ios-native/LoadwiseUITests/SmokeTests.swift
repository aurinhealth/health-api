import XCTest

/// Before every release (Vydat): the real app on the simulator, tapped through
/// its main screens like a person would, with the sample data. It fails when the
/// app crashes or a main screen does not appear, and saves a screenshot of each
/// step to SMOKE_DIR (CI: the Loadwise-native-screens artifact, smoke/).
/// The texts are the Czech ones: the app is started in Czech.
final class SmokeTests: XCTestCase {
    private var app: XCUIApplication!
    private var step = 0
    /// The test's number: 1-… the first launch, 2-… the main screens, 3-… the status, 4-… the website.
    private var prefix: String { name.contains("test1") ? "1" : name.contains("test2") ? "2" : name.contains("test3") ? "3" : "4" }

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// A new phone: the welcome pages, the sign-in and the e-mail code sheet.
    /// The sign-in offers no sample data. Runs first (tests go by name).
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
        XCTAssertTrue(email.waitForExistence(timeout: 5), "the sign-in did not come back")
        XCTAssertFalse(app.buttons["Prohlédnout ukázku"].exists, "the sign-in still offers the sample data")
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
        XCTAssertTrue(app.buttons["Upravit +"].waitForExistence(timeout: 5), "+ did not open")
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

    /// The athlete's status in Czech and English: the sheet with each state
    /// picked and Dnes after saving it (the sample data keeps it in memory).
    func test3AthleteStatus() {
        for language in ["cs", "en"] {
            let english = language == "en"
            let titles = english ? ["Sick", "Injured", "Rest", "Active"] : ["Nemoc", "Zranění", "Pauza", "Aktivní"]
            let files = ["nemoc", "zraneni", "pauza", "aktivni"]
            let save = english ? "Save" : "Uložit"
            app.launchArguments = ["-demo", "-language", language, "-AppleLanguages", "(\(language))", "-AppleLocale", english ? "en_US" : "cs_CZ"]
            app.launch()
            let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", english ? "Athlete status" : "Stav sportovce"))
            XCTAssertTrue(row.firstMatch.waitForExistence(timeout: 20), "the status row is missing (\(language))")
            shot("\(language)-aktivni-dnes")
            for (title, file) in zip(titles, files) {
                hittable(row).tap()
                let option = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
                XCTAssertTrue(option.waitForExistence(timeout: 8), "\(title) is missing in the sheet")
                if file == "nemoc" { shot("\(language)-panel") }
                option.tap()
                pause(1)
                shot("\(language)-\(file)-panel")
                app.buttons[save].tap()
                pause(2)
                XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
                shot("\(language)-\(file)-dnes")
            }
        }
    }

    /// The screens the website draws its scenes from, in English: sleep and the
    /// bedtime planner, readiness and what affects it, building a workout, the
    /// gym day and training mode up to the summary, muscles and one muscle, the ride library,
    /// food and the coach. It only takes pictures and never fails, so a changed
    /// label costs a picture, not a release.
    func test4WebsiteScenes() {
        continueAfterFailure = true
        for (route, file, swipes) in [("sleep", "spanek", 3), ("sleep-settings", "planovac", 1), ("readiness", "pripravenost", 2),
                                      ("gym-builder", "sestavit", 1), ("muscles", "svaly", 2), ("muscle/glutes", "sval", 2),
                                      ("library/ride", "jizda", 1), ("strain", "namaha", 1)] {
            english("-open", route)
            pause(4)
            shot(file)
            for i in 0..<swipes {
                app.swipeUp()
                pause(1)
                shot("\(file)-\(i + 2)")
            }
        }

        // What affects you: from the journal.
        english("-open", "journal")
        pause(4)
        shot("denik")
        if tapIfThere(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "What affects you")).firstMatch) {
            pause(3)
            shot("co-pusobi")
        }

        // The gym day, then training mode: the exercise, a set done, the rest, the
        // set's letter and the summary.
        english("-open", "gym/2026-10-08")
        pause(4)
        shot("posilovna")
        app.swipeUp()
        pause(1)
        shot("posilovna-2")
        app.swipeDown()
        if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Start workout")).firstMatch) {
            pause(3)
            shot("rezim")
            if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Start workout")).firstMatch) {
                pause(2)
                shot("rezim-zacatek")
            }
            if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Set done")).firstMatch) {
                pause(2)
                shot("odpocinek")
                app.swipeUp()
                pause(1)
                shot("odpocinek-2")
                if tapIfThere(app.buttons["Skip"]) {
                    pause(2)
                    shot("dalsi-serie")
                }
            }
            if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "How hard")).firstMatch) {
                pause(2)
                shot("pismena")
                tapIfThere(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "High")).firstMatch)
                pause(1)
            }
            if tapIfThere(app.buttons["Finish"].firstMatch) {
                pause(2)
                shot("dokoncit")
                if tapIfThere(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Finish workout")).firstMatch) {
                    pause(3)
                    shot("souhrn")
                    app.swipeUp()
                    pause(1)
                    shot("souhrn-2")
                }
            }
        }

        // Food, its add sheet, and the coach.
        english("-tab", "food")
        pause(4)
        shot("jidlo")
        app.swipeUp()
        pause(1)
        shot("jidlo-2")
        english()
        pause(4)
        if tapIfThere(app.buttons.matching(identifier: "Add entry").firstMatch) {
            pause(2)
            shot("pridat")
        }
        english()
        pause(4)
        if tapIfThere(app.buttons.matching(identifier: "Coach").allElementsBoundByIndex.first { $0.isHittable } ?? app.buttons["Coach"]) {
            pause(3)
            shot("kouc")
        }
    }

    // MARK: - Helpers

    /// The app in English and US English formats, as the website shows it.
    private func english(_ arguments: String...) {
        app.launchArguments = ["-demo"] + arguments + ["-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
    }

    /// Taps the element when it shows up; the website's pictures go on without it.
    @discardableResult
    private func tapIfThere(_ element: XCUIElement) -> Bool {
        guard element.waitForExistence(timeout: 6) else { return false }
        if !element.isHittable { app.swipeUp() }
        guard element.isHittable else { return false }
        element.tap()
        return true
    }

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
