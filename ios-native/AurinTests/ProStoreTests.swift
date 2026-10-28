import StoreKitTest
import XCTest
@testable import Aurin

/// Aurin Pro against StoreKit/Aurin.storekit (the plans, the free week on the
/// yearly one, an offer code), as the simulator buys it from the Aurin scheme.
@MainActor
final class ProStoreTests: XCTestCase {
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
        await store.load()
        XCTAssertEqual(Set(store.products.keys), Set(ProStore.ids))
        XCTAssertTrue(store.trialEligible, "a new Apple ID starts the yearly plan with the free week")
        let yearly = try XCTUnwrap(store.price(ProStore.yearlyID))
        XCTAssertTrue(yearly.contains("490"), yearly)
        XCTAssertTrue(try XCTUnwrap(store.perMonth(ProStore.yearlyID)).contains("124"))
        XCTAssertEqual(ProPlans.priced(store).first?.price, L10n.f("%@ / rok", yearly))

        let outcome = try await store.purchase(ProStore.yearlyID)
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
        await store.load()
        let outcome = try await store.purchase(ProStore.monthlyID)
        XCTAssertEqual(outcome, .purchased(trial: false))
        XCTAssertFalse(reminded)
        await store.refresh()
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
