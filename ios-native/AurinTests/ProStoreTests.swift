import StoreKit
import StoreKitTest
import UIKit
import XCTest
@testable import Aurin

/// Aurin Pro against StoreKit/Aurin.storekit (the plans, the free week on the
/// yearly one, an offer code), as the simulator buys it from the Aurin scheme.
@MainActor
final class ProStoreTests: XCTestCase {
    override func setUp() async throws {
        // The simulator's first test purchase can take close to a minute on
        // CI (51 s seen with the app's own App Store calls already off), so a
        // purchase gets five minutes; one that StoreKit never answers fails
        // then (ios-native.yml turns test timeouts on) instead of holding CI.
        executionTimeAllowance = 300
        // The purchase sheet needs the app's window to anchor to; the host app
        // may still be starting when the first test runs.
        for _ in 0..<100 where ProStore.anchorScene() == nil {
            try await Task.sleep(for: .milliseconds(200))
        }
        XCTAssertNotNil(ProStore.anchorScene(), "the host app has no window scene for the purchase sheet")
        XCTAssertTrue(ProStore.hostsUnitTests, "the host app leaves the App Store alone while the tests buy")
        if !Self.warmedUp {
            Self.warmedUp = true
            try await warmUp()
        }
    }

    private static var warmedUp = false

    /// On the iOS 27 simulator every purchase in the first test process after the
    /// simulator boots stops at a system "Sign in to Apple Account" alert and never
    /// returns; in the next process they go straight to the test store (CI's
    /// screenshots, 2026-11-02). ios-native.yml therefore runs one short test
    /// first, whose process makes this purchase and leaves it waiting. A message
    /// pack, so a late answer never touches the subscriptions' free week.
    private func warmUp() async throws {
        let session = try await makeSession()
        let store = ProStore()
        await store.load()
        guard let product = ProStore.packIDs.first.flatMap({ store.products[$0] }) else { return }
        let start = Date()
        let answer = Answer()
        Task.detached {
            // Finished, so the pack test finds no transaction left open.
            if case .success(.verified(let transaction)) = try? await product.purchase() {
                await transaction.finish()
            }
            await answer.set()
        }
        for _ in 0..<30 where !answer.done {
            try await Task.sleep(for: .milliseconds(500))
        }
        print("ProStoreTests warm-up purchase after \(String(format: "%.1f", Date().timeIntervalSince(start))) s: \(answer.done ? "answered" : "still waiting")")
        session.clearTransactions()
    }

    @MainActor private final class Answer {
        private(set) var done = false
        func set() { done = true }
    }

    /// How long each StoreKit step took, in the CI log, so a slow one is named.
    private func step<T>(_ name: String, _ work: () async throws -> T) async rethrows -> T {
        let start = Date()
        print("ProStoreTests \(name): started")
        // A step still waiting after a minute names what the purchase sheet would
        // anchor to: the scene's state and what its window shows.
        let watch = Task { @MainActor in
            try await Task.sleep(for: .seconds(60))
            for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                let shown = scene.windows.map { window in
                    let presented = window.rootViewController?.presentedViewController.map { "\(type(of: $0))" } ?? "none"
                    return "\(type(of: window)) key=\(window.isKeyWindow) presented=\(presented)"
                }
                print("ProStoreTests \(name) after 60 s: scene \(scene.activationState.rawValue), windows \(shown)")
            }
        }
        defer {
            watch.cancel()
            print("ProStoreTests \(name): \(String(format: "%.1f", Date().timeIntervalSince(start))) s")
        }
        return try await work()
    }

    private func makeSession() async throws -> SKTestSession {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Aurin", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
        // The test store answers with its storefront (CZE, Aurin.storekit); until
        // then the tests wait.
        var storefront = await Storefront.current?.countryCode
        for _ in 0..<60 where storefront != "CZE" {
            try await Task.sleep(for: .seconds(1))
            storefront = await Storefront.current?.countryCode
        }
        print("ProStoreTests storefront: \(storefront ?? "none")")
        XCTAssertEqual(storefront, "CZE", "StoreKit answers from Aurin.storekit, not the App Store")
        // On iOS 27 the yearly plan's free week comes back a moment after the
        // purchases are cleared (an earlier test bought the monthly plan).
        var eligible = false
        for _ in 0..<40 {
            let yearly = try? await Product.products(for: [ProStore.yearlyID]).first
            eligible = await yearly?.subscription?.isEligibleForIntroOffer ?? false
            if eligible { break }
            try await Task.sleep(for: .milliseconds(500))
        }
        print("ProStoreTests free week available: \(eligible)")
        return session
    }

    func testPlansFreeWeekAndPurchase() async throws {
        let session = try await makeSession()
        let store = ProStore()
        var reminded: String?
        store.trialReminder = { _, price in reminded = price }
        await step("load") { await store.load() }
        XCTAssertEqual(Set(store.products.keys), Set(ProStore.ids + ProStore.packIDs))
        XCTAssertTrue(store.trialEligible, "a new Apple ID starts the yearly plan with the free week")
        let yearly = try XCTUnwrap(store.price(ProStore.yearlyID))
        XCTAssertTrue(yearly.contains("490"), yearly)
        let perMonth = try XCTUnwrap(store.perMonth(ProStore.yearlyID))
        let yearlyProduct = try XCTUnwrap(store.products[ProStore.yearlyID])
        XCTAssertTrue(perMonth.contains("124"), "\(perMonth): price \(yearlyProduct.price), shown \(yearlyProduct.displayPrice)")
        XCTAssertEqual(ProPlans.priced(store).first?.price, L10n.f("%@ / rok", yearly))

        let outcome = try await step("purchase yearly") { try await store.purchase(ProStore.yearlyID) }
        XCTAssertEqual(outcome, .purchased(trial: true))
        XCTAssertEqual(reminded, yearly, "the day-5 reminder names the price")
        XCTAssertTrue(store.entitled)
        XCTAssertFalse(store.trialEligible, "the free week once per Apple ID")
        XCTAssertEqual(session.allTransactions().count, 1)
    }

    func testMonthlyHasNoFreeWeek() async throws {
        let session = try await makeSession()
        let store = ProStore()
        var reminded = false
        store.trialReminder = { _, _ in reminded = true }
        await step("load") { await store.load() }
        let outcome = try await step("purchase monthly") { try await store.purchase(ProStore.monthlyID) }
        XCTAssertEqual(outcome, .purchased(trial: false))
        XCTAssertFalse(reminded)
        await step("refresh") { await store.refresh() }
        XCTAssertTrue(store.entitled)
        _ = session
    }

    func testPackIsBoughtAndFinished() async throws {
        let session = try await makeSession()
        let store = ProStore()
        await step("load") { await store.load() }
        XCTAssertEqual(ProStore.packIDs, ["health.aurin.app.coach.messages40", "health.aurin.app.coach.messages100"])
        XCTAssertTrue(try XCTUnwrap(store.price("health.aurin.app.coach.messages40")).contains("99"))
        // Xcode's test purchase never reaches the server: the pack's own messages come back.
        let left = try await step("buy pack") { try await store.buyPack("health.aurin.app.coach.messages100") }
        XCTAssertEqual(left, 100)
        XCTAssertFalse(store.entitled, "a pack is not Aurin Pro")
        var unfinished = 0
        for await _ in Transaction.unfinished { unfinished += 1 }
        XCTAssertEqual(unfinished, 0)
        _ = session
    }

    func testTrialReminderOnDayFive() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let bought = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: 13, hour: 21, minute: 40)))
        let fire = try XCTUnwrap(ProStore.trialReminderDate(purchased: bought, calendar: calendar))
        XCTAssertEqual(calendar.dateComponents([.month, .day, .hour, .minute], from: fire), DateComponents(month: 11, day: 17, hour: 10, minute: 0))
    }

    func testAmountFromShownPrice() {
        let cs = Locale(identifier: "cs_CZ"), de = Locale(identifier: "de_DE"), us = Locale(identifier: "en_US")
        XCTAssertEqual(ProStore.amount("1\u{202F}490,00\u{00A0}Kč", locale: cs), 1490)
        XCTAssertEqual(ProStore.amount("1 490 Kč", locale: cs), 1490)
        XCTAssertEqual(ProStore.amount("1.490,00 €", locale: de), 1490)
        XCTAssertEqual(ProStore.amount("5,99 €", locale: de), Decimal(string: "5.99"))
        XCTAssertEqual(ProStore.amount("$59.99", locale: us), Decimal(string: "59.99"))
        XCTAssertEqual(ProStore.amount("$1,490.00", locale: us), 1490)
        XCTAssertNil(ProStore.amount("Kč", locale: cs))
    }
}
