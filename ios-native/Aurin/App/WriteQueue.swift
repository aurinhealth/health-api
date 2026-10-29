import Foundation
import Observation

/// What becomes of a write the server did not take now: the one rule for every
/// write that goes through the queue (meals, drinks, weigh-ins, the gym sheet,
/// the morning check-in, a done activity to the apps in Zdroje dat).
enum WriteVerdict: Equatable {
    /// No signal: it waits and goes out when the network is back.
    case waitForSignal
    /// A server error (5xx, 408, 429): later, at most a few times.
    case retry(String)
    /// Too old an app (426): it waits for the new version, however long.
    case waitForUpdate
    /// Refused (4xx): it will never be taken, so it goes with a note.
    case reject(String)
    /// The session ended (401) or something else: the caller hears of it, the queue keeps it.
    case fail

    static func of(_ error: Error) -> WriteVerdict {
        if Outbox.isNoConnection(error) { return .waitForSignal }
        switch error {
        case OutboxRefusal.retry(let message): return .retry(message)
        case OutboxRefusal.outdated: return .waitForUpdate
        case OutboxRefusal.rejected(let message): return .reject(message)
        default: return .fail
        }
    }

    /// Kept for a later send (deliver puts it in the queue instead of throwing).
    var waits: Bool {
        switch self {
        case .waitForSignal, .retry, .waitForUpdate: return true
        case .reject, .fail: return false
        }
    }

    /// Server errors in a row before a write is given up.
    static let retries = 5
}

/// The writes that are made and left behind (the sheet closes at once): they
/// show on the screens right away (overlays) and go out in order, also after
/// the app was closed (OutboxStore). One sign-in owns them; signing out of
/// the account drops them (clear).
@MainActor
@Observable
final class WriteQueue {
    /// Waiting writes, oldest first; the screens show them meanwhile.
    private(set) var items: [OutboxItem] = []
    /// A waiting write the server turned down, shown until tapped away.
    var note: String?

    /// Whether writes may go out now (signed in, not the demo, the account known).
    @ObservationIgnored var canSend: @MainActor () -> Bool = { false }
    /// The waiting writes changed: the screens draw them again.
    @ObservationIgnored var changed: @MainActor () -> Void = {}
    /// A write found no signal (true) or went out (false).
    @ObservationIgnored var connection: @MainActor (_ lost: Bool) -> Void = { _ in }
    /// A write went out: Food and Health load again, Today when asked.
    @ObservationIgnored var sent: @MainActor (_ reloadToday: Bool) async -> Void = { _ in }
    /// A write that just went out, drawn over the screens until their next load.
    @ObservationIgnored var settled: @MainActor (_ id: UUID, _ overlay: OutboxOverlay) -> Void = { _, _ in }

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private var sending = false
    @ObservationIgnored private var sendAgain = false
    @ObservationIgnored private var reloadTodayAfterSend = false
    /// The write on its way now; a write made meanwhile asks for one more round.
    @ObservationIgnored private(set) var sendingItem: UUID?
    /// The server's id of a meal or drink logged on the phone (by its local
    /// id), so "Vrátit" or a delete right after the save finds it.
    @ObservationIgnored private var sentIds: [Int: Int] = [:]
    /// One save of a gym day at a time, and the newest sheet ticked meanwhile.
    @ObservationIgnored private var gymSaving: Set<String> = []
    @ObservationIgnored private var gymPending: [String: GymDay] = [:]

    init(api: APIClient, load: Bool) {
        self.api = api
        if load { items = OutboxStore.load() }
    }

    // MARK: - Adding

    /// A write that shows at once and goes out in the background.
    /// send: false when several are written at once and sent after the last.
    func add(_ item: OutboxItem, send: Bool = true) {
        enqueue(item)
        if send { Task { await self.send(reloadToday: true) } }
    }

    /// Sends a write now; when it cannot go now (WriteVerdict.waits) it waits
    /// in the queue and shows on the screens meanwhile. True when it went out
    /// now. Throws the server's refusal (4xx) and a 401.
    @discardableResult
    func deliver(_ item: OutboxItem) async throws -> Bool {
        try await deliverAnswer(item) != nil
    }

    /// deliver with the server's answer; nil when it waits.
    func deliverAnswer(_ item: OutboxItem) async throws -> Data? {
        // The same key already waits (the gym sheet of a day): this one goes after it, the newer wins.
        if let key = item.key, items.contains(where: { $0.key == key }) {
            enqueue(item)
            await send()
            return nil
        }
        do {
            return try await api.sendQueued(item)
        } catch {
            let verdict = WriteVerdict.of(error)
            guard verdict.waits else { throw error }
            enqueue(item)
            if verdict == .waitForSignal { connection(true) }
            return nil
        }
    }

    func enqueue(_ item: OutboxItem) {
        if let key = item.key, let i = items.firstIndex(where: { $0.key == key }) {
            items[i] = item
        } else {
            items.append(item)
        }
        save()
    }

    private func save() {
        OutboxStore.save(items)
        changed()
    }

    // MARK: - Changing what waits

    /// A drink not sent yet changes while it waits; false when it is no longer here.
    func changeWaitingDrink(localId: Int, ml: Int, kind: String) -> Bool {
        guard let i = items.firstIndex(where: { $0.overlay?.id == localId }) else { return false }
        var fields = items[i].fields
        fields["ml"] = .number(Double(ml))
        fields["kind"] = .string(kind)
        items[i].body = OutboxItem.json(fields)
        items[i].overlay?.ml = Double(ml)
        items[i].overlay?.drink = kind
        save()
        return true
    }

    /// A meal or drink taken back before it was sent.
    func dropWaiting(localId: Int) {
        items.removeAll { $0.overlay?.id == localId && ($0.overlay?.kind == .food || $0.overlay?.kind == .drink) }
        save()
    }

    /// A meal or drink logged on the phone (negative local id) as the server
    /// knows it: nil while it still waits to be sent, its server id once sent.
    func serverId(of localId: Int) async -> Int? {
        // On its way right now: its answer brings the id.
        while let sending = sendingItem, items.first(where: { $0.id == sending })?.overlay?.id == localId {
            try? await Task.sleep(for: .milliseconds(100))
        }
        return sentIds[localId]
    }

    /// Water added from the widget or Siri while the app was closed joins the queue.
    private func takeWidgetDrinks() {
        let drinks = PendingDrinks.take()
        guard !drinks.isEmpty else { return }
        items += drinks.map { AppModel.drinkItem(ml: $0.ml, kind: "water", date: $0.date) }
        save()
    }

    // MARK: - Sending

    /// Sends the waiting writes in order and lets the screens load again.
    /// reloadToday: Today too (after a meal or drink; refresh() loads Today
    /// itself). True when something went out.
    @discardableResult
    func send(reloadToday reload: Bool = false) async -> Bool {
        guard canSend() else { return false }
        if reload { reloadTodayAfterSend = true }
        // Already sending: the running loop takes the new write in one more round.
        guard !sending else { sendAgain = true; return false }
        sending = true
        // A meal saved just before leaving the app still goes out.
        let background = FinishInBackground("Outbox")
        defer { sending = false; background.end() }
        var sentAny = false
        repeat {
            sendAgain = false
            takeWidgetDrinks()
            guard !items.isEmpty else { break }
            let went = await sendWaiting()
            save()
            if went {
                sentAny = true
                connection(false)
                let today = reloadTodayAfterSend
                reloadTodayAfterSend = false
                await sent(today)
            }
        } while sendAgain && canSend()
        return sentAny
    }

    /// The waiting writes out in order, by WriteVerdict. Stops at the first
    /// that has to wait.
    private func sendWaiting() async -> Bool {
        var went = false
        while canSend(), let item = items.first {
            if Outbox.isOthers(item, account: Outbox.account) {
                items.removeAll { $0.id == item.id }
                OutboxStore.save(items)
                continue
            }
            sendingItem = item.id
            defer { sendingItem = nil }
            do {
                let answer = try await api.sendQueued(item)
                settle(item, answer: answer)
                items.removeAll { $0.id == item.id }
                went = true
            } catch {
                switch WriteVerdict.of(error) {
                case .reject(let message):
                    items.removeAll { $0.id == item.id }
                    note = L10n.f("Neuloženo – %@: %@", item.label, message)
                case .retry(let message):
                    // A server error: later, but not forever.
                    guard let i = items.firstIndex(where: { $0.id == item.id }) else { continue }
                    items[i].failures += 1
                    if items[i].failures >= WriteVerdict.retries {
                        items.remove(at: i)
                        note = L10n.f("Neuloženo – %@: %@", item.label, message)
                        OutboxStore.save(items)
                        continue
                    }
                    return went
                case .waitForSignal:
                    connection(true)
                    return went
                case .waitForUpdate, .fail:
                    // The new version of the app, or the next sign-in: the rest waits.
                    return went
                }
            }
            OutboxStore.save(items)
        }
        return went
    }

    /// A new meal or drink takes its server id; the write stays drawn until
    /// the screens load it from the server.
    private func settle(_ item: OutboxItem, answer: Data) {
        guard var overlay = item.overlay else { return }
        if let local = overlay.id, local < 0, let id = Outbox.entryId(answer) {
            sentIds[local] = id
            overlay.id = id
        }
        settled(item.id, overlay)
    }

    // MARK: - The gym sheet

    /// Saves a day's gym sheet; one save of a day at a time, and sets ticked
    /// meanwhile go out after it, only the newest sheet, so an older sheet can
    /// never land last. Throws the server's refusal.
    func saveGym(_ day: GymDay, date: String) async throws {
        GymDayCache.save(day, date: date)
        if gymSaving.contains(date) { gymPending[date] = day; return }
        gymSaving.insert(date)
        defer { gymSaving.remove(date) }
        var next: GymDay? = day
        while let current = next {
            gymPending[date] = nil
            do {
                try await deliver(Self.gymItem(current, date: date))
            } catch {
                // Sets ticked while this save failed still go out, with the queue's retries.
                if let newer = gymPending.removeValue(forKey: date) {
                    enqueue(Self.gymItem(newer, date: date))
                    Task { await self.send() }
                }
                throw error
            }
            next = gymPending[date]
        }
    }

    static func gymItem(_ day: GymDay, date: String) -> OutboxItem {
        OutboxItem(path: "/app/api/gym", method: "POST", body: OutboxItem.json(APIClient.gymBody(day, date: date)),
                   label: L10n.tr("Posilovna"), key: "gym:" + date)
    }

    /// The day's gym sheet still waiting, if any.
    func waitingGym(date: String) -> GymDay? {
        items.last(where: { $0.key == "gym:" + date }).flatMap { Outbox.gymDay($0, date: date) }
    }

    /// Zahodit trénink: the day's sets still waiting (the next sheet, the
    /// queue, the copy kept without signal) leave with it, and a save already
    /// on its way lands first, so nothing sent later brings the workout back.
    /// When the server refuses, what waited goes back to the queue.
    func discardGym(date: String) async throws {
        let key = "gym:" + date
        gymPending[date] = nil
        var waiting = items.filter { $0.key == key }
        items.removeAll { $0.key == key }
        save()
        let cached = GymDayCache.load(date: date)
        let ids = Set(waiting.map(\.id))
        for _ in 0..<150 {
            guard gymSaving.contains(date) || sendingItem.map(ids.contains) == true else { break }
            try? await Task.sleep(for: .milliseconds(100))
        }
        // A save that found no signal meanwhile waits in the queue again: it goes too.
        waiting += items.filter { $0.key == key }
        items.removeAll { $0.key == key }
        save()
        GymDayCache.remove(date: date)
        do {
            try await api.discardGym(date: date)
        } catch {
            if let newest = waiting.last, !items.contains(where: { $0.key == key }) { enqueue(newest) }
            if let cached { GymDayCache.save(cached, date: date) }
            throw error
        }
    }

    // MARK: - Signing out

    /// Another account, another server or "Odhlásit se": what waited goes, on disk too.
    func clear() {
        items = []
        OutboxStore.clear()
        forgetSent()
    }

    /// What only this run of the sign-in knew (expired sessions keep the writes).
    func forgetSent() {
        note = nil
        sentIds = [:]
        gymPending = [:]
        reloadTodayAfterSend = false
    }
}
