import StoreKitTest
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
    }

    /// How long each StoreKit step took, in the CI log, so a slow one is named.
    private func step<T>(_ name: String, _ work: () async throws -> T) async rethrows -> T {
        let start = Date()
        print("ProStoreTests \(name): started")
        defer { print("ProStoreTests \(name): \(String(format: "%.1f", Date().timeIntervalSince(start))) s") }
        return try await work()
    }

    private func makeSession() throws -> SKTestSession {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Aurin", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
        return session
    }

    func testPlansFreeWeekAndPurchase() async throws {
        let session = try makeSession()
        let store = ProStore()
        var reminded: String?
        store.trialReminder = { _, price in reminded = price }
        await step("load") { await store.load() }
        XCTAssertEqual(Set(store.products.keys), Set(ProStore.ids))
        XCTAssertTrue(store.trialEligible, "a new Apple ID starts the yearly plan with the free week")
        let yearly = try XCTUnwrap(store.price(ProStore.yearlyID))
        XCTAssertTrue(yearly.contains("490"), yearly)
        XCTAssertTrue(try XCTUnwrap(store.perMonth(ProStore.yearlyID)).contains("124"))
        XCTAssertEqual(ProPlans.priced(store).first?.price, L10n.f("%@ / rok", yearly))

        let outcome = try await step("purchase yearly") { try await store.purchase(ProStore.yearlyID) }
        XCTAssertEqual(outcome, .purchased(trial: true))
        XCTAssertEqual(reminded, yearly, "the day-5 reminder names the price")
        XCTAssertTrue(store.entitled)
        XCTAssertFalse(store.trialEligible, "the free week once per Apple ID")
        XCTAssertEqual(session.allTransactions().count, 1)
    }

    func testMonthlyHasNoFreeWeek() async throws {
        let session = try makeSession()
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

    func testTrialReminderOnDayFive() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Prague"))
        let bought = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 11, day: 13, hour: 21, minute: 40)))
        let fire = try XCTUnwrap(ProStore.trialReminderDate(purchased: bought, calendar: calendar))
        XCTAssertEqual(calendar.dateComponents([.month, .day, .hour, .minute], from: fire), DateComponents(month: 11, day: 17, hour: 10, minute: 0))
    }
}
