import Foundation
import Observation
import StoreKit
import UserNotifications

/// Aurin Pro from the App Store (StoreKit 2): the subscription group "Aurin
/// Pro" with a monthly and a yearly plan, a free week on the yearly one for
/// whoever has not had it (Apple's introductory offer) and offer codes. The
/// yearly plan can also be paid monthly for 12 months (Apple's "Monthly with
/// 12-Month Commitment" billing plan, iOS 26.4 and later, not in every country).
/// Packs of extra coach messages are consumables: the server adds them to the
/// account (src/coach-packs.js) and only then is the transaction finished. Every
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
    /// Extra coach messages, by product id.
    nonisolated static let packs: [String: Int] = ["health.aurin.app.coach.messages40": 40, "health.aurin.app.coach.messages100": 100]
    nonisolated static var packIDs: [String] { packs.keys.sorted { (packs[$0] ?? 0) < (packs[$1] ?? 0) } }
    /// The day-5 reminder of the free week (Reminders keeps its own prefix).
    nonisolated static let trialReminderID = "aurin-trial-day5"

    /// By product id, once the App Store answered; empty means the fixed prices (ProPlans).
    private(set) var products: [String: Product] = [:]
    /// The yearly plan starts with the free week for this Apple ID.
    private(set) var trialEligible = false
    /// The yearly plan paid monthly, where the App Store offers it: "149 Kč" a
    /// month and "1 788 Kč" for the 12 months; nil elsewhere.
    private(set) var commitment: Commitment?
    struct Commitment: Equatable {
        let monthly: String
        let total: String
    }
    /// An Aurin Pro subscription is active on this Apple ID.
    private(set) var entitled = false
    private(set) var purchasing = false
    /// Plans the day-5 reminder when a free week starts (the tests plan nothing).
    @ObservationIgnored var trialReminder: @MainActor (Date, String) async -> Void = { await ProStore.remindTrialEnd(purchased: $0, price: $1) }

    @ObservationIgnored private var api: APIClient?
    @ObservationIgnored private var updates: Task<Void, Never>?
    @ObservationIgnored private var accountToken: UUID?

    init(trialEligible: Bool = false) {
        self.trialEligible = trialEligible
    }

    /// Once, after launch: listens for transactions (renewals, codes redeemed
    /// in the App Store, purchases approved by a parent) and loads the plans.
    /// No api with the sample data: purchases from Aurin.storekit stay on the phone.
    func start(api: APIClient?) {
        self.api = api
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates { await self?.handle(result) }
        }
        Task {
            await load()
            await refresh()
            // A pack the server has not heard of yet (no signal last time).
            for await result in Transaction.unfinished { await handle(result) }
        }
    }

    /// Signed out or another account: the next purchase asks for its token again.
    func forgetAccount() {
        accountToken = nil
    }

    func load() async {
        guard products.isEmpty else { return }
        do {
            let found = try await Product.products(for: Self.ids + Self.packIDs)
            products = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            if let yearly = products[Self.yearlyID], yearly.subscription?.introductoryOffer?.paymentMode == .freeTrial {
                trialEligible = await yearly.subscription?.isEligibleForIntroOffer ?? false
            } else {
                trialEligible = false
            }
            commitment = products[Self.yearlyID].flatMap(Self.commitmentPlan)
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

    /// monthly: the yearly plan paid monthly for 12 months (when `commitment` is there).
    func purchase(_ id: String, monthly: Bool = false) async throws -> Outcome {
        guard let product = products[id] else {
            throw APIError.message(L10n.tr("App Store teď tarify nenačetl. Zkus to za chvíli znovu."))
        }
        purchasing = true
        defer { purchasing = false }
        var options: Set<Product.PurchaseOption> = []
        if let token = await accountUUID() { options.insert(.appAccountToken(token)) }
        if #available(iOS 26.4, *), monthly, id == Self.yearlyID, commitment != nil { options.insert(.billingPlanType(.monthly)) }
        switch try await product.purchase(options: options) {
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

    /// A pack of extra coach messages: bought, sent to the server and finished.
    /// Returns the messages the account has now, or nil when it was not bought
    /// (cancelled, waiting for approval); once the server has it, the pack is there.
    func buyPack(_ id: String) async throws -> Int? {
        guard Self.packs[id] != nil, let product = products[id] else {
            throw APIError.message(L10n.tr("App Store teď balíčky nenačetl. Zkus to za chvíli znovu."))
        }
        purchasing = true
        defer { purchasing = false }
        var options: Set<Product.PurchaseOption> = []
        if let token = await accountUUID() { options.insert(.appAccountToken(token)) }
        guard case .success(let result) = try await product.purchase(options: options) else { return nil }
        guard case .verified(let transaction) = result else {
            throw APIError.message(L10n.tr("App Store nákup nepotvrdil. Zkus to znovu."))
        }
        // Xcode's StoreKit testing: the server never accepts its signature.
        if transaction.environment == .xcode { await transaction.finish(); return Self.packs[id] }
        guard let left = await sendPack(result) else {
            // Kept unfinished: it goes to the server on the next start.
            throw APIError.message(L10n.tr("Nákup proběhl, zprávy se přidají, jakmile bude spojení se serverem."))
        }
        await transaction.finish()
        return left
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

    /// The App Store's commitment billing plan of the yearly product, if any.
    private static func commitmentPlan(_ product: Product) -> Commitment? {
        guard #available(iOS 26.4, *),
              let terms = product.subscription?.pricingTerms.first(where: { $0.billingPlanType == .monthly }) else { return nil }
        return Commitment(monthly: terms.billingDisplayPrice, total: terms.commitmentInfo.displayPrice)
    }

    // MARK: - Transactions

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else { return }
        if Self.packs[transaction.productID] != nil {
            var sent = transaction.environment == .xcode
            if !sent { sent = await sendPack(result) != nil }
            if sent { await transaction.finish() }
            return
        }
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

    /// The pack to the server; the messages the account has then, nil without an answer.
    private func sendPack(_ result: VerificationResult<Transaction>) async -> Int? {
        guard let api else { return nil }
        struct Saved: Decodable { let left: Int? }
        let saved: Saved? = try? await api.send("/app/api/subscription/transaction", method: "POST",
                                                 body: ["signedTransaction": JSONValue.string(result.jwsRepresentation)])
        return saved.map { $0.left ?? 0 }
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
