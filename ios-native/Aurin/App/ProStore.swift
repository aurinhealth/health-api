import Foundation
import Observation
import StoreKit
import UIKit
import UserNotifications

/// Aurin Pro from the App Store (StoreKit 2): the subscription group "Aurin
/// Pro" with a monthly and a yearly plan, a free week on the yearly one for
/// whoever has not had it (Apple's introductory offer) and offer codes. Every
/// transaction goes to the server (POST /app/api/subscription/transaction),
/// which checks Apple's signature and unlocks AI for the account
/// (src/app-store.js); Apple tells it about renewals, refunds and expiry
/// itself. The purchase carries the account's appAccountToken, so the server
/// knows whose it is. During the pilot the server gives everyone AI anyway,
/// so a test purchase in TestFlight only shows the flow.
/// Aurin.storekit (the Aurin scheme) answers in the simulator: its
/// transactions are signed by Xcode, not Apple, so they stay on the phone.
@MainActor
@Observable
final class ProStore {
    static let shared = ProStore()

    nonisolated static let monthlyID = "health.aurin.app.pro.monthly"
    nonisolated static let yearlyID = "health.aurin.app.pro.yearly"
    nonisolated static let ids = [yearlyID, monthlyID]
    /// The day-5 reminder of the free week (Reminders keeps its own prefix).
    nonisolated static let trialReminderID = "aurin-trial-day5"

    /// By product id, once the App Store answered; empty means the fixed prices (ProPlans).
    private(set) var products: [String: Product] = [:]
    /// The yearly plan starts with the free week for this Apple ID.
    private(set) var trialEligible = false
    /// An Aurin Pro subscription is active on this Apple ID.
    private(set) var entitled = false
    private(set) var purchasing = false
    /// Plans the day-5 reminder when a free week starts (the tests plan nothing).
    @ObservationIgnored var trialReminder: @MainActor (Date, String) async -> Void = { await ProStore.remindTrialEnd(purchased: $0, price: $1) }

    @ObservationIgnored private var api: APIClient?
    @ObservationIgnored private var updates: Task<Void, Never>?
    @ObservationIgnored private var accountToken: UUID?

    /// The app is the host of the unit tests (AurinTests), not used on a phone.
    /// The smoke test (AurinUITests) runs the app on its own, without this.
    nonisolated static let hostsUnitTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    init(trialEligible: Bool = false) {
        self.trialEligible = trialEligible
    }

    /// Once, after launch: listens for transactions (renewals, codes redeemed
    /// in the App Store, purchases approved by a parent) and loads the plans.
    /// No api with the sample data: purchases from Aurin.storekit stay on the phone.
    func start(api: APIClient?) {
        // The unit tests run inside the app: its own App Store calls at launch
        // (the plans, what is active, AppTransaction) would go to the real App
        // Store, which has no account in the simulator, and StoreKit makes the
        // tests' purchases from Aurin.storekit wait behind them, sometimes forever.
        guard !Self.hostsUnitTests else { return }
        self.api = api
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates { await self?.handle(result) }
        }
        Task {
            await load()
            await refresh()
            await reportInstall()
        }
    }

    /// Signed out or another account: the next purchase asks for its token again,
    /// and the next account hears where this app came from.
    func forgetAccount() {
        accountToken = nil
        UserDefaults.standard.removeObject(forKey: Self.installSentKey)
    }

    // MARK: - Where the app came from

    /// What reportInstall last told the server: the build and its environment.
    nonisolated static let installSentKey = "proStore.installSent"

    /// Tells the server whether this app is a TestFlight build or the App
    /// Store one (POST /app/api/subscription/install), with the AppTransaction
    /// Apple signed: a tester without a test purchase then counts with
    /// TestFlight for AI (src/ai-limit-share.js). Once per build and account;
    /// a failure tries again at the next start or sign-in.
    func reportInstall() async {
        guard !Self.hostsUnitTests, let api, let result = try? await AppTransaction.shared, case .verified(let app) = result else { return }
        // Xcode signs with its own key, which the server never accepts.
        guard app.environment == .sandbox || app.environment == .production else { return }
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        let sent = "\(build)|\(app.environment.rawValue)"
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: Self.installSentKey) != sent else { return }
        do {
            let _: JSONValue = try await api.send("/app/api/subscription/install", method: "POST",
                                                  body: ["signedAppTransaction": JSONValue.string(result.jwsRepresentation)])
            defaults.set(sent, forKey: Self.installSentKey)
        } catch {
            // Signed out or no signal: the next start or sign-in tries again.
        }
    }

    func load() async {
        guard products.isEmpty else { return }
        do {
            let found = try await Product.products(for: Self.ids)
            products = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            if let yearly = products[Self.yearlyID], yearly.subscription?.introductoryOffer?.paymentMode == .freeTrial {
                trialEligible = await yearly.subscription?.isEligibleForIntroOffer ?? false
            } else {
                trialEligible = false
            }
        } catch {
            ErrorLog.add(path: "StoreKit products", status: nil, message: error.localizedDescription)
        }
    }

    /// What is active now; also sends it to the server again, in case the
    /// last time had no signal.
    func refresh() async {
        var active = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, Self.ids.contains(transaction.productID) else { continue }
            if transaction.revocationDate == nil { active = true }
            await send(result, transaction)
        }
        entitled = active
        // The renewal turned off before the free week ended: no reminder that it ends.
        if let statuses = try? await products[Self.yearlyID]?.subscription?.status,
           statuses.contains(where: { if case .verified(let info) = $0.renewalInfo { return !info.willAutoRenew } else { return false } }) {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.trialReminderID])
        }
    }

    enum Outcome: Equatable {
        case purchased(trial: Bool)
        /// Waiting for a parent's approval (Ask to Buy) or the bank.
        case pending
        case cancelled
    }

    func purchase(_ id: String) async throws -> Outcome {
        guard let product = products[id] else {
            throw APIError.message(L10n.tr("App Store teď tarify nenačetl. Zkus to za chvíli znovu."))
        }
        purchasing = true
        defer { purchasing = false }
        var options: Set<Product.PurchaseOption> = []
        if let token = await accountUUID() { options.insert(.appAccountToken(token)) }
        // The purchase sheet is shown over the app's window. Without a scene to
        // anchor it, StoreKit logs "Could not find a UI anchor" and the purchase
        // can wait forever (seen in the simulator right after the app starts).
        let result: Product.PurchaseResult
        if let scene = Self.anchorScene() {
            result = try await product.purchase(confirmIn: scene, options: options)
        } else {
            result = try await product.purchase(options: options)
        }
        switch result {
        case .success(let result):
            guard case .verified(let transaction) = result else {
                throw APIError.message(L10n.tr("App Store nákup nepotvrdil. Zkus Obnovit nákup."))
            }
            let trial = transaction.offer?.type == .introductory && transaction.offer?.paymentMode == .freeTrial
            await handle(result)
            if trial { await trialReminder(transaction.purchaseDate, product.displayPrice) }
            trialEligible = false
            return .purchased(trial: trial)
        case .pending:
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .cancelled
        }
    }

    /// The window scene the purchase sheet appears over: the one in front,
    /// else any scene with a window.
    static func anchorScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive && $0.keyWindow != nil }
            ?? scenes.first { $0.activationState == .foregroundActive }
            ?? scenes.first { !$0.windows.isEmpty }
            ?? scenes.first
    }

    /// Obnovit nákup: asks the App Store for this Apple ID's purchases (it may
    /// ask for the password) and says what it found.
    func restore() async -> String {
        do {
            try await AppStore.sync()
        } catch {
            if let error = error as? StoreKitError, case .userCancelled = error {
                return L10n.tr("Obnovení nákupu bylo zrušeno.")
            }
            return L10n.f("Nákupy se nepodařilo obnovit: %@", error.localizedDescription)
        }
        await refresh()
        return entitled ? L10n.tr("Aurin Pro je obnovené a aktivní.") : L10n.tr("Na tomto Apple ID jsme žádné aktivní předplatné Aurin Pro nenašli.")
    }

    // MARK: - Prices

    /// "1 490 Kč" from the App Store, or the fixed one.
    func price(_ id: String) -> String? { products[id]?.displayPrice }

    /// The yearly price a month, in the store's currency: "124 Kč", "5,00 €".
    func perMonth(_ id: String) -> String? {
        guard let product = products[id] else { return nil }
        let monthly = product.price / 12
        // A whole yearly price (1 490 Kč) a month in whole units, else with cents.
        let whole = NSDecimalNumber(decimal: product.price).doubleValue.truncatingRemainder(dividingBy: 1) == 0
        return monthly.formatted(product.priceFormatStyle.precision(.fractionLength(whole ? 0 : 2)))
    }

    // MARK: - Transactions

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else { return }
        guard Self.ids.contains(transaction.productID) else { await transaction.finish(); return }
        if await send(result, transaction) { await transaction.finish() }
        if transaction.revocationDate == nil, (transaction.expirationDate ?? .distantFuture) > Date() { entitled = true }
    }

    /// true once the server answered (or nothing is to be sent); without
    /// signal or a session the transaction stays unfinished and comes again.
    @discardableResult
    private func send(_ result: VerificationResult<Transaction>, _ transaction: Transaction) async -> Bool {
        // Xcode's StoreKit testing signs with its own key, which the server never accepts.
        if transaction.environment == .xcode { return true }
        guard let api else { return false }
        do {
            let _: JSONValue = try await api.send("/app/api/subscription/transaction", method: "POST",
                                                  body: ["signedTransaction": JSONValue.string(result.jwsRepresentation)])
            return true
        } catch let error as APIError {
            // Refused (another account's purchase) or a server error: Apple tells the server itself.
            return error != .unauthorized
        } catch {
            return false
        }
    }

    /// The account's UUID from the server (/app/api/subscription).
    private func accountUUID() async -> UUID? {
        if let accountToken { return accountToken }
        guard let api, let text = (try? await api.subscription())?.appAccountToken, let uuid = UUID(uuidString: text) else { return nil }
        accountToken = uuid
        return uuid
    }

    /// Day 5 of the free week at 10:00: it ends in two days. Asks for
    /// notifications now if nobody has yet, since the offer promised it;
    /// turned off, nothing is planned.
    static func remindTrialEnd(purchased: Date, price: String) async {
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined { status = await Reminders.requestPermission() ? .authorized : .denied }
        guard status == .authorized || status == .provisional else { return }
        let calendar = Calendar.current
        guard let fire = trialReminderDate(purchased: purchased, calendar: calendar), fire > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = L10n.tr("Týden zdarma končí za 2 dny")
        content.body = L10n.f("Pak začne roční předplatné Aurin Pro za %@. Zrušit ho můžeš v Nastavení → Aurin Pro.", price)
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire), repeats: false)
        try? await center.add(UNNotificationRequest(identifier: trialReminderID, content: content, trigger: trigger))
    }

    /// 10:00 on day 5 of the free week, the day of the purchase being day 1.
    nonisolated static func trialReminderDate(purchased: Date, calendar: Calendar) -> Date? {
        calendar.date(byAdding: .day, value: 4, to: purchased).flatMap { calendar.date(bySettingHour: 10, minute: 0, second: 0, of: $0) }
    }
}
