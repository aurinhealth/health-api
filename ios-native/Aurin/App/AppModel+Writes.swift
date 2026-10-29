import Foundation

// The writes: meals, drinks, weigh-ins, the gym sheet and a done activity
// to the apps in Zdroje dat. All of them go through the one queue
// (WriteQueue.swift) and its rule (WriteVerdict).
extension AppModel {
    /// A drink of any kind; true when it was saved (or waits for signal).
    @discardableResult
    func addDrink(ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        write(Self.drinkItem(ml: ml, kind: kind, date: writeDay))
        return true
    }

    /// A drink from Siri or Shortcuts: always today, whatever day the app shows.
    func addDrinkToday(ml: Int, kind: String) {
        guard !demo else { return }
        write(Self.drinkItem(ml: ml, kind: kind, date: Self.localDate(Date())))
    }

    /// POST /app/api/fluids with the time it was drunk, so a later send keeps it.
    static func drinkItem(ml: Int, kind: String, date: String, at: Date = Date()) -> OutboxItem {
        let localId = Outbox.localId()
        var body: JSONObject = ["ml": .number(Double(ml)), "kind": .string(kind), "date": .string(date),
                                "requestId": .string(UUID().uuidString)]
        if date == Self.localDate(at) { body["at"] = .string(Outbox.clock(at, withDay: true)) }
        return OutboxItem(path: "/app/api/fluids", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Pití"),
                          overlay: OutboxOverlay(kind: .drink, date: date, id: localId, ml: Double(ml), drink: kind,
                                                 time: date == Self.localDate(at) ? Outbox.clock(at) : nil))
    }

    // MARK: - The queue

    /// What the queue needs from the app: when it may send, how the screens
    /// draw what waits, and what loads again after a write went out.
    func connectWrites() {
        writes.canSend = { [weak self] in
            guard let self else { return false }
            return !self.demo && self.phase == .signedIn && !Self.accountUnconfirmed
        }
        writes.changed = { [weak self] in self?.applyOutbox() }
        writes.connection = { [weak self] lost in self?.offline = lost }
        writes.settled = { [weak self] id, overlay in
            self?.foodScreen.settle(id, overlay)
            self?.todayScreen.settle(id, overlay)
        }
        writes.sent = { [weak self] today in await self?.reloadAfterWrites(today: today) }
    }

    /// A meal or drink shows at once and goes out in the background, so the
    /// sheet closes without waiting for the server. Without signal it waits in
    /// the queue; one the server refuses comes back as the outbox note.
    /// send: false when several are written at once and sent after the last.
    func write(_ item: OutboxItem, send: Bool = true) {
        // The saved copy of another day no longer holds; its next load saves it anew.
        if let date = item.overlay?.date, date != Self.localDate(Date()) {
            for screen in ["today", "food", "health"] { SnapshotCache.remove(key: SnapshotCache.dayKey(screen, date)) }
        }
        writes.add(item, send: send)
    }

    /// Sends a write now, or lets it wait by the queue's rule (WriteVerdict).
    /// True when it went out now. Throws the server's refusal (4xx).
    func deliver(_ item: OutboxItem) async throws -> Bool {
        try await writes.deliver(item)
    }

    /// The Today and Food screens: the server's answer with the waiting writes.
    func applyOutbox() {
        let overlays = writes.items.compactMap(\.overlay)
        foodScreen.apply(overlays)
        todayScreen.apply(overlays)
    }

    /// Sends the waiting writes (WriteQueue.send). True when something went out.
    @discardableResult
    func sendOutbox(reloadToday reload: Bool = false) async -> Bool {
        await writes.send(reloadToday: reload)
    }

    /// Food, Health and Today load at once after writes went out.
    func reloadAfterWrites(today: Bool) async {
        await withTaskGroup(of: Void.self) { group in
            if food != nil { group.addTask { await self.refreshFood() } }
            if health != nil { group.addTask { await self.refreshHealth() } }
            if today { group.addTask { await self.reloadToday() } }
        }
    }

    /// A food logged on this phone (a negative id): its id on the server once it
    /// went out, nil while it still waits for signal.
    func sentFoodId(_ localId: Int) async -> Int? {
        localId > 0 ? localId : await writes.serverId(of: localId)
    }

    /// The network came back: send what waited and load the screens again.
    func networkBack() async {
        guard !demo, phase == .signedIn, offline || !outbox.isEmpty else { return }
        await refresh()
        if food != nil { await refreshFood() }
    }

    /// A weigh-in (kg); waits for signal when there is none. Throws the server's
    /// refusal. True when it went out now. reload: false for Siri, which waits
    /// for the answer and needs no screens loaded.
    @discardableResult
    func addWeight(kg: Double, reload: Bool = true) async throws -> Bool {
        guard !demo else { return true }
        let date = Self.localDate(Date())
        let item = Self.weightItem(kg: kg, date: date)
        // Apple Health gets it too when weight is switched on in Zdroje dat (Aurin posílá).
        Task { await AppleHealthExport.shared.saveWeight(kg: kg, date: date) }
        let sent = try await deliver(item)
        if sent && reload {
            await refreshHealth()
            await refresh()
        }
        return sent
    }

    /// POST /app/api/weight; the requestId keeps one weigh-in when it goes out twice.
    nonisolated static func weightItem(kg: Double, date: String) -> OutboxItem {
        let body: JSONObject = ["kg": .number(kg), "date": .string(date), "requestId": .string(UUID().uuidString)]
        return OutboxItem(path: "/app/api/weight", method: "POST", body: OutboxItem.json(body), label: L10n.tr("Váha"),
                          overlay: OutboxOverlay(kind: .weight, date: date, kg: kg))
    }

    // MARK: - Synchronizace

    /// The server destinations a done activity goes to (Google Health,
    /// Intervals.icu), as last seen in Zdroje dat (Aurin posílá): the toast lists
    /// them as "odešle se" while there is no signal.
    static let activityDestinationsKey = "sync.activityDestinations"

    /// A finished gym session (Posilovna or Režim tréninku) to those apps, under
    /// the day's key, so finishing it again updates the same activity.
    /// `appleSaved`: the live workout is in Apple Health already.
    func shareGym(_ day: GymDay, date: String, start: Date? = nil, minutes: Int? = nil, appleSaved: Bool = false) async {
        let done = day.exercises.filter { $0.doneCount > 0 }
        guard !done.isEmpty, let start = day.startedAt ?? start else { return }
        let length = max(1, minutes ?? day.loggedMinutes ?? Int((Date().timeIntervalSince(start) / 60).rounded()))
        let sets = done.map { $0.name + ": " + GymCoach.setsLine($0.sets) }.joined(separator: "\n")
        await shareActivity(ActivityToSync(key: "gym:" + date, sport: "gym", name: day.planName ?? L10n.tr("Silový trénink"), date: date,
                                           start: start, minutes: length, notes: sets), apple: !appleSaved)
    }

    /// A done activity (a gym session, a workout typed in) to the apps chosen
    /// in Zdroje dat (Aurin posílá); `sends` when the server already sent it (a manual
    /// workout). Shows the toast when it went anywhere.
    /// `toApple` false when the workout is in Apple Health already.
    func shareActivity(_ activity: ActivityToSync, sends: [SyncSend]? = nil, apple toApple: Bool = true) async {
        guard !demo else { return }
        var rows: [SyncReport.Row] = []
        if let sends {
            rows = sends.map { SyncReport.Row(destination: $0.destination, status: SyncReport.status($0.status), message: $0.message, needsScope: $0.needsScope) }
        } else {
            // Through the queue by its rule: without signal, on a server error or
            // too old an app it waits there (after the gym sheet of the day) and
            // the toast says where it will go.
            let item = OutboxItem(path: "/app/api/sync/activity", method: "POST", body: OutboxItem.json(activity.body),
                                  label: activity.name, key: "sync:" + activity.key)
            do {
                if let answer = try await writes.deliverAnswer(item) {
                    let result = try? JSONDecoder().decode(SyncActivityResult.self, from: answer)
                    rows = (result?.sends ?? []).map { SyncReport.Row(destination: $0.destination, status: SyncReport.status($0.status), message: $0.message, needsScope: $0.needsScope) }
                } else {
                    let waiting = UserDefaults.standard.stringArray(forKey: Self.activityDestinationsKey) ?? []
                    rows = waiting.map { SyncReport.Row(destination: $0, status: .pending) }
                }
            } catch {
                rows = []
            }
        }
        let apple = AppleHealthExport.shared
        if toApple && apple.writesWorkouts {
            let failed = await apple.saveWorkout(activity)
            rows.insert(SyncReport.Row(destination: "apple", status: failed == nil ? .sent : .error, message: failed), at: 0)
        }
        rows.sort { (SyncApp.order.firstIndex(of: $0.destination) ?? 9) < (SyncApp.order.firstIndex(of: $1.destination) ?? 9) }
        syncReport = rows.isEmpty ? nil : SyncReport(activity: activity, rows: rows)
    }

    /// "Zkusit znovu" in the toast's sheet.
    func retrySync(_ destination: String) async {
        guard var report = syncReport, let i = report.rows.firstIndex(where: { $0.destination == destination }) else { return }
        report.rows[i].working = true
        syncReport = report
        var row = report.rows[i]
        if destination == "apple" {
            let failed = await AppleHealthExport.shared.saveWorkout(report.activity)
            row.status = failed == nil ? .sent : .error
            row.message = failed
        } else {
            do {
                // Google first needs the permission to write workouts.
                if row.needsScope != nil {
                    guard let event = try await connect(provider: "google-extra"), event == "google" else {
                        row.working = false
                        update(row)
                        return
                    }
                }
                let send = try await api.retrySend(key: report.activity.key, destination: destination)
                row.status = SyncReport.status(send.status)
                row.message = send.message
                row.needsScope = send.needsScope
            } catch {
                // Never reached the server (it waited without signal): send it whole.
                if let result = try? await api.sendActivity(report.activity), let send = result.sends?.first(where: { $0.destination == destination }) {
                    row.status = SyncReport.status(send.status)
                    row.message = send.message
                    row.needsScope = send.needsScope
                } else {
                    row.status = .error
                    row.message = error.localizedDescription
                }
            }
        }
        row.working = false
        update(row)
    }

    private func update(_ row: SyncReport.Row) {
        guard var report = syncReport, let i = report.rows.firstIndex(where: { $0.destination == row.destination }) else { return }
        report.rows[i] = row
        syncReport = report
    }

    /// Saves a day's gym sheet (WriteQueue.saveGym); without signal or on a
    /// server error the newest sheet of the day waits. Throws the server's refusal.
    func saveGym(_ day: GymDay, date: String) async throws {
        guard !demo else { return }
        WatchBridge.shared.gymSaved(day, date: date)
        try await writes.saveGym(day, date: date)
        // The muscles count this workout at their next load.
        musclesAt = nil
    }

    /// Zahodit trénink (WriteQueue.discardGym).
    func discardGym(date: String) async throws {
        guard !demo else { return }
        try await writes.discardGym(date: date)
    }

    /// A day's gym sheet: the one waiting to be sent, the server's, or the
    /// last one seen on the phone when there is no signal.
    func gymDay(date: String) async throws -> GymDay {
        if let day = writes.waitingGym(date: date) { return day }
        do {
            let day = try await api.gym(date: date)
            // The server couldn't read the day: an error, never an empty sheet to save over it.
            if day.status == "partial" { throw APIError.message(L10n.tr("Plán se nepodařilo načíst.")) }
            GymDayCache.save(day, date: date)
            return day
        } catch where Outbox.isNoConnection(error) {
            if let saved = GymDayCache.load(date: date) { return saved }
            throw error
        }
    }


    func updateDrink(id: Int, ml: Int, kind: String) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            if let sent = await writes.serverId(of: id) {
                id = sent
            } else {
                // A drink not sent yet changes while it waits.
                _ = writes.changeWaitingDrink(localId: id, ml: ml, kind: kind)
                return true
            }
        }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids", method: "PATCH",
                              body: OutboxItem.json(["id": JSONValue.number(Double(id)), "ml": .number(Double(ml)), "kind": .string(kind)]),
                              label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .editDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: Double(ml), drink: kind,
                                                     previousMl: old?.ml, previousDrink: old?.kind))
        write(item)
        return true
    }

    @discardableResult
    func deleteDrink(id: Int) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            guard let sent = await writes.serverId(of: id) else { writes.dropWaiting(localId: id); return true }
            id = sent
        }
        let old = food?.water.drinks?.first { $0.id == id }
        let item = OutboxItem(path: "/app/api/fluids?id=\(id)", method: "DELETE", body: OutboxItem.json(JSONObject()), label: L10n.tr("Pití"),
                              overlay: OutboxOverlay(kind: .removeDrink, date: food?.date ?? Self.localDate(Date()), id: id, ml: old?.ml, drink: old?.kind))
        write(item)
        return true
    }

    /// Logs a food: it shows at once and goes out in the background (nil; a
    /// refusal comes later as the outbox note).
    /// `day`: another day than the one shown (a food the coach drafted from a sentence);
    /// `refreshAfter: false` when several are logged at once and sent after the last.
    func logFood(product: FoodProduct, amount: Double, meal: String, day: String? = nil, refreshAfter: Bool = true) async -> String? {
        guard !demo else { return nil }
        let date = day ?? writeDay
        let request = FoodLogRequest(date: date, product: product.forLogging, quantity: amount, unit: product.unit, mealType: meal)
        let overlay = OutboxOverlay(kind: .food, date: date, id: Outbox.localId(), name: product.name, meal: meal,
                                    kcal: product.kcal(for: amount), protein: product.grams(product.protein_100g, for: amount),
                                    carbs: product.grams(product.carbs_100g, for: amount), fat: product.grams(product.fat_100g, for: amount),
                                    time: date == Self.localDate(Date()) ? Outbox.clock() : nil)
        // Today's meal keeps the time it was logged, also when it waits for signal.
        var extra: JSONObject = ["requestId": .string(UUID().uuidString)]
        if date == Self.localDate(Date()) { extra["time"] = .string(Outbox.clock()) }
        let item = OutboxItem(path: "/app/api/food/log", method: "POST", body: OutboxItem.json(request, adding: extra),
                              label: product.name, overlay: overlay)
        write(item, send: refreshAfter)
        return nil
    }

    /// true when it was deleted (or waits for signal).
    @discardableResult
    func deleteFood(id: Int) async -> Bool {
        guard !demo else { return true }
        var id = id
        if id < 0 {
            guard let sent = await writes.serverId(of: id) else { writes.dropWaiting(localId: id); return true }
            id = sent
        }
        let entry = food?.meals.flatMap(\.entries).first { $0.id == id }
        let item = OutboxItem(path: "/app/api/food/entry", method: "DELETE", body: OutboxItem.json(["id": JSONValue.number(Double(id))]),
                              label: entry?.name ?? L10n.tr("Jídlo"),
                              overlay: OutboxOverlay(kind: .removeFood, date: food?.date ?? Self.localDate(Date()), id: id,
                                                     kcal: entry?.kcal, protein: entry?.protein, carbs: entry?.carbs, fat: entry?.fat))
        write(item)
        return true
    }

    @discardableResult
    func addWater(ml: Int) async -> Bool {
        await addDrink(ml: ml, kind: "water")
    }
}
