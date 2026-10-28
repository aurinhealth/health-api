import Foundation

// Loading the screens: Today with the Apple Health sync, the other tabs,
// other days and the days around them. The data lives in the screen stores
// (ScreenStore.swift); what each sign-in started ends with it (AccountScope).
extension AppModel {
    /// The screens as they were last time, until the server answers.
    func loadSaved() {
        let decoder = JSONDecoder()
        if let data = OutboxStore.savedSnapshot("today"), let value = try? decoder.decode(TodaySnapshot.self, from: data) {
            todayScreen.show(value, data: data)
        }
        if let data = OutboxStore.savedSnapshot("food"), let value = try? decoder.decode(FoodSnapshot.self, from: data) {
            foodScreen.show(value, data: data)
        }
        applyOutbox()
        // Training and Health are not on the first screen: read off the main
        // thread, and only where the server has not answered meanwhile.
        let round = scope
        scope.task {
            let saved = await Task.detached(priority: .userInitiated) {
                SavedScreens(training: SnapshotCache.load(TrainingSnapshot.self, key: "training")?.value,
                             health: SnapshotCache.load(HealthSnapshot.self, key: "health")?.value)
            }.value
            guard self.stillSignedIn(round) else { return }
            if self.training == nil { self.training = saved.training }
            if self.health == nil { self.health = saved.health }
        }
        Task.detached(priority: .utility) { SnapshotCache.prune(today: AppModel.localDate(Date())) }
    }

    /// announce: the app was opened or pulled down, so the pill says it syncs.
    func refresh(announce: Bool = false) async {
        guard !demo, phase == .signedIn else { return }
        // The app opened or pulled down while a refresh runs (the app came
        // back as Today first loaded): that one brings the same data. A write
        // (refresh() without announce) still loads again after it.
        guard announce else { return await performRefresh(announce: false) }
        if let running = announcedRefresh { return await running.value }
        let task = scope.task { await self.performRefresh(announce: true) }
        announcedRefresh = task
        announcedSince = Date()
        // Leaving the app mid-sync: it goes on for the time iOS gives, then stops.
        let background = FinishInBackground("Today") { [weak self] in self?.dropRefresh() }
        defer { background.end() }
        await task.value
        if announcedRefresh == task { announcedRefresh = nil }
    }

    /// The app went to the background (RootView).
    func left() { leftAt = Date() }

    /// Back in the app (RootView). After more than the half minute iOS lets
    /// work go on, what was on its way then stayed frozen mid-request: the
    /// open does not wait for it but syncs anew.
    func cameBack() {
        guard let leftAt else { return }
        self.leftAt = nil
        guard Date().timeIntervalSince(leftAt) > 25 else { return }
        if announcedRefresh != nil, announcedSince < leftAt { dropRefresh() }
        AppleHealth.shared.dropFrozen(left: leftAt)
    }

    func dropRefresh() {
        announcedRefresh?.cancel()
        announcedRefresh = nil
    }

    func performRefresh(announce: Bool) async {
        refreshRound += 1
        let round = refreshRound
        let account = scope
        loading = true
        defer { if round == refreshRound { loading = false } }
        if announce { syncStatus = .syncing }
        if Self.accountUnconfirmed { await loadAccountInitial() }
        await sendOutbox()
        // The free time from the iPhone calendar, before Aktivita dne is made.
        await CalendarTime.shared.send(api: api)
        // The planned workouts into the iPhone calendar, alongside Today.
        let mirror = api
        Task { await CalendarTime.shared.mirror(api: mirror) }
        let health = AppleHealth.shared
        // Until a late-morning sync, last night and the morning's HRV from the
        // watch go out before Today is computed, waiting at most 8 s. Later in
        // the day (or after those 8 s) Today loads alongside the sync and again
        // only when it brought something new.
        let client = api
        var sync: Task<AppleHealth.SyncOutcome, Never>? = Task { await health.run(api: client) }
        var changed = false
        if !health.hasMorningData, let task = sync, let outcome = await Self.outcome(of: task, within: 8) {
            changed = outcome.changed
            sync = nil
        }
        do {
            try await loadToday()
            // The day is on screen: the arrows and swipes work again.
            loading = false
            if let sync, await sync.value.changed { changed = true; try? await loadToday() }
            // New nights or workouts reach the Health snapshot too: the sleep
            // detail opened from Today shows it.
            if changed {
                fetched[.health] = nil
                if self.health != nil { scope.task { await self.refreshHealth() } }
            }
            async let status = try? api.athleteStatus()
            if selectedDate == nil, let today {
                // Muscles and older days' strain follow new workouts too.
                if !pastStrain.isEmpty { let days = Array(pastStrain.keys); scope.task { for day in days { await self.loadPastStrain(day, again: true) } } }
                if muscleFatigue != nil, musclesStale { scope.task { await self.loadMuscles() } }
                async let cycle: Void = loadCycle()
                await Reminders.reschedule(from: today)
                WidgetBridge.update(today)
                prefetchAround(Self.localDate(Date()))
                await cycle
            }
            if let status = await status, stillSignedIn(account) { athleteStatus = status }
            if syncStatus == .syncing { finishSync(.done) }
        } catch APIError.unauthorized {
            syncStatus = nil
            signOut(expired: true)
        } catch {
            // Without signal the saved screen stays; an error only without one.
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { if round == refreshRound, syncStatus == .syncing { syncStatus = nil }; return }
            let lost = noteConnection(error)
            if !(lost && today != nil) { errorMessage = error.localizedDescription }
            // Offline has its own note; the pill takes a failed sync.
            if syncStatus == .syncing {
                finishSync(lost ? nil : .failed)
            } else if !lost && today != nil {
                notice = error.localizedDescription
            }
            // "Bez připojení" alone hides that a Wi-Fi wants a sign-in: say so.
            if lost, (error as? URLError)?.code == .secureConnectionFailed { notice = error.localizedDescription }
        }
    }

    /// What the sync did if it ends within `seconds`; nil when it takes longer
    /// (it goes on, only this wait ends).
    private static func outcome(of task: Task<AppleHealth.SyncOutcome, Never>, within seconds: Double) async -> AppleHealth.SyncOutcome? {
        let once = FirstAnswer()
        return await withCheckedContinuation { continuation in
            Task { @MainActor in
                let value = await task.value
                if once.take() { continuation.resume(returning: value) }
            }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                if once.take() { continuation.resume(returning: nil) }
            }
        }
    }

    /// Today of the shown day from the server, with the waiting writes over it.
    func loadToday() async throws {
        let settled = todayScreen.settlingIds
        let day = selectedDate
        let account = scope
        let (snapshot, data) = try await api.todayData(date: day)
        // Signed out meanwhile: the answer belongs to no one on screen.
        guard stillSignedIn(account) else { throw CancellationError() }
        // Another day was chosen meanwhile: its own load shows it.
        guard selectedDate == day else { return }
        // The same answer again (back in the app, pulled down): Today is not drawn anew.
        todayScreen.show(snapshot, data: data, settled: settled)
        fetched[.today] = (Date(), shownDay)
        dataRevision += 1
        todayRevision += 1
        applyOutbox()
        errorMessage = nil
        _ = noteConnection(nil)
    }

    /// Today again after a meal or drink went out: without the Apple Health
    /// sync, the cycle and the athlete status, which a meal does not change.
    func reloadToday() async {
        guard !demo, phase == .signedIn else { return }
        do {
            try await loadToday()
            if selectedDate == nil, let today {
                await Reminders.reschedule(from: today)
                WidgetBridge.update(today)
            }
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // The write stays drawn over the screen; the next load brings it.
        }
    }

    /// "Synchronizováno" goes away after 3 seconds; a failure stays until tapped.
    func finishSync(_ status: SyncStatus?) {
        syncStatus = status
        guard status == .done else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            if syncStatus == .done { syncStatus = nil }
        }
    }

    /// A tap on the failed pill: try again, or put it away.
    func dismissSyncFailure() { if syncStatus == .failed { syncStatus = nil } }

    /// A tab's data again unless it came from the server in the last 5 minutes
    /// for the same day. Without this a tab kept the copy saved on the phone
    /// (yesterday's night on Health while Today already had last night).
    func refreshIfStale(_ tab: AppTab) async {
        guard !demo, phase == .signedIn, !refreshing.contains(tab) else { return }
        // Today is already loading (the app came back): no second request.
        if tab == .today && loading { return }
        // A coming day is Food's only: Today and Health go back to today.
        if tab != .food && tab != .training && showsFutureDay { selectedDate = nil }
        let day = tab == .training ? Self.localDate(Date()) : shownDay
        if fresh(tab, day: day) { return }
        refreshing.insert(tab)
        let background = FinishInBackground("Refresh")
        defer { refreshing.remove(tab); background.end() }
        switch tab {
        case .today: await refresh(announce: true)
        case .training: await refreshTraining()
        case .health: await refreshHealth()
        case .food: await refreshFood()
        }
    }

    /// The tab's data came from the server in the last 5 minutes, for this day.
    func fresh(_ tab: AppTab, day: String) -> Bool {
        guard let last = fetched[tab] else { return false }
        return last.day == day && Date().timeIntervalSince(last.at) < 300
    }

    /// Back in the app (RootView): Today again by the rule of refreshIfStale,
    /// and after a time without signal. What waited for signal (and water added
    /// from the widget) goes out either way.
    func refreshOnReturn() async {
        guard !demo, phase == .signedIn else { return }
        // Google Health may have been disconnected meanwhile: then Apple Health gets the food, weight and workouts again.
        scope.task { await self.loadGoogleSync() }
        if !offline && fresh(.today, day: shownDay) {
            await sendOutbox(reloadToday: true)
        } else {
            await refresh(announce: true)
        }
    }

    /// The morning check-in on Today. It lowers the readiness, so Today loads
    /// again; without signal the answer waits in the outbox (a newer one
    /// replaces it) and Today follows once it went out.
    func setMorningCheckin(_ feeling: String?) async throws {
        guard !demo, let today else { return }
        guard try await deliver(APIClient.morningCheckinItem(feeling, date: today.date)) else { return }
        await refresh()
        if health != nil { await refreshHealth() }
    }

    /// A new Stav sportovce. The coach and the plans follow it, so Today and
    /// Training load again.
    func setAthleteStatus(_ status: String, until: String?, note: String?, cancel: [String] = []) async throws {
        guard !demo else { athleteStatus = AthleteStatus(status: status, note: note, statusUntil: until); return }
        athleteStatus = try await api.setAthleteStatus(status, until: until, note: note, cancel: cancel)
        await refresh()
        if training != nil { await refreshTraining() }
    }

    /// What the server writes to Google Health, so Apple Health does not
    /// carry the same food, weight or workout there a second time.
    func loadGoogleSync() async {
        guard !demo, phase == .signedIn else { return }
        guard let google = try? await api.syncOverview().destinations.first(where: { $0.id == "google" }) else { return }
        AppleHealthExport.shared.setGoogle(google)
    }

    /// Every tab again, e.g. after a change of language (the server's texts).
    func refreshAll() async {
        fetched = [:]
        await refresh()
        if training != nil { await refreshTraining() }
        if health != nil { await refreshHealth() }
        if food != nil { await refreshFood() }
    }

    func refreshTraining() async {
        guard !demo, phase == .signedIn else { return }
        let account = scope
        do {
            let value = try await api.training()
            guard stillSignedIn(account) else { return }
            training = value
            fetched[.training] = (Date(), Self.localDate(Date()))
            dataRevision += 1
            trainingError = nil
            _ = noteConnection(nil)
            // The calendar too: loadCalendar alone fetches only missing days, so a
            // moved or deleted session, or a new activity, stayed as it was.
            let today = Self.localDate(Date())
            await loadCalendar(from: ISODay.shift(today, -14), to: ISODay.shift(today, 28), force: true)
            // A workout planned or moved anywhere reaches the iPhone calendar at once.
            let client = api
            Task { await CalendarTime.shared.mirror(api: client, force: true) }
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && training != nil) { trainingError = error.localizedDescription }
            if !lost && training != nil { notice = error.localizedDescription }
        }
    }

    func refreshHealth() async {
        guard !demo, phase == .signedIn else { return }
        await AppleHealth.shared.sync(api: api)
        do {
            let day = selectedDate, account = scope
            let value = try await api.health(date: day)
            guard stillSignedIn(account), selectedDate == day else { return }
            health = value
            fetched[.health] = (Date(), shownDay)
            dataRevision += 1
            healthError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && health != nil) { healthError = error.localizedDescription }
            if !lost && health != nil { notice = error.localizedDescription }
        }
    }

    func refreshFood() async {
        guard !demo, phase == .signedIn else { return }
        let settled = foodScreen.settlingIds
        do {
            let day = selectedDate, account = scope
            let (snapshot, data) = try await api.foodData(date: day)
            guard stillSignedIn(account), selectedDate == day else { return }
            foodScreen.show(snapshot, data: data, settled: settled)
            // The day's food and water to Apple Health when switched on in Zdroje dat (Aurin posílá).
            Task { await AppleHealthExport.shared.saveFoodDay(snapshot) }
            fetched[.food] = (Date(), shownDay)
            dataRevision += 1
            applyOutbox()
            foodError = nil
            _ = noteConnection(nil)
        } catch APIError.unauthorized {
            signOut(expired: true)
        } catch {
            // A request cut short (a newer load of the same data, a closed screen) is no error.
            if Self.isCancellation(error) { return }
            let lost = noteConnection(error)
            if !(lost && food != nil) { foodError = error.localizedDescription }
            if !lost && food != nil { notice = error.localizedDescription }
        }
    }


    /// One day back or forward from the day on screen; forward stops at today,
    /// on Food (ahead) two weeks later. saved: the day as a swipe drew it beside.
    func showDay(offset: Int, ahead: Bool = false, saved page: DayPage? = nil) async {
        let todayDate = Self.localDate(Date())
        guard !demo, let date = Self.shift(selectedDate ?? todayDate, by: offset) else { return }
        if date > todayDate {
            guard ahead, let last = Self.shift(todayDate, by: Self.foodDaysAhead), date <= last else { return }
            selectedDate = date
            // The day as last seen (or loaded ahead) at once, as on the days before.
            showSaved(date, page: page?.date == date ? page : nil)
            await refreshFood()
            if selectedDate == date, foodError == nil { prefetchFoodAhead(date) }
            return
        }
        selectedDate = date == todayDate ? nil : date
        showSaved(selectedDate, page: page?.date == date ? page : nil)
        await refreshDay()
    }

    /// A day picked in Today's week strip; today or earlier.
    func showDate(_ date: String) async {
        let todayDate = Self.localDate(Date())
        guard !demo, date <= todayDate, date != (selectedDate ?? todayDate) else { return }
        selectedDate = date == todayDate ? nil : date
        showSaved(selectedDate)
        await refreshDay()
    }

    func showToday() async {
        guard selectedDate != nil else { return }
        selectedDate = nil
        showSaved(nil)
        await refreshDay()
    }

    /// The day changed: Today, and Food and Health when they were opened.
    func refreshDay() async {
        if let date = selectedDate {
            await loadOtherDay(date)
            return
        }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.refresh() }
            if food != nil { group.addTask { await self.refreshFood() } }
            if health != nil { group.addTask { await self.refreshHealth() } }
        }
    }

    /// The saved copy of a day (SnapshotCache), on screen at once while the
    /// day loads; without one the screens keep the day before until it comes.
    /// page: the same copy, read already for the swipe (DayPage.saved).
    func showSaved(_ date: String?, page: DayPage? = nil) {
        if let page {
            if let value = page.today, let data = page.todayData { todayScreen.show(value, data: data) }
            if food != nil, let value = page.food, let data = page.foodData { foodScreen.show(value, data: data) }
            if health != nil, let value = page.health { health = value }
            applyOutbox()
            return
        }
        let decoder = JSONDecoder()
        if let saved = SnapshotCache.data(key: SnapshotCache.dayKey("today", date)),
           let value = try? decoder.decode(TodaySnapshot.self, from: saved.data) {
            todayScreen.show(value, data: saved.data)
        }
        if food != nil, let saved = SnapshotCache.data(key: SnapshotCache.dayKey("food", date)),
           let value = try? decoder.decode(FoodSnapshot.self, from: saved.data) {
            foodScreen.show(value, data: saved.data)
        }
        if health != nil, let saved = SnapshotCache.data(key: SnapshotCache.dayKey("health", date)),
           let value = try? decoder.decode(HealthSnapshot.self, from: saved.data) {
            health = value
        }
        applyOutbox()
    }

    /// Another day than today: its Today, Food and Health from the server at
    /// once, without the Apple Health sync, the waiting writes and the
    /// athlete status, which belong to today. The arrows stay free: a newer
    /// day chosen meanwhile wins and this answer is dropped.
    func loadOtherDay(_ date: String) async {
        guard !demo, phase == .signedIn else { return }
        let wantFood = food != nil, wantHealth = health != nil
        let settledToday = todayScreen.settlingIds, settledFood = foodScreen.settlingIds
        let api = api
        async let todayAnswer: Result<(TodaySnapshot, Data), Error> = Self.attempt { try await api.todayData(date: date) }
        async let foodAnswer: Result<(FoodSnapshot, Data), Error>? = wantFood ? Self.attempt { try await api.foodData(date: date) } : nil
        async let healthAnswer: Result<HealthSnapshot, Error>? = wantHealth ? Self.attempt { try await api.health(date: date) } : nil
        let account = scope
        let (t, f, h) = await (todayAnswer, foodAnswer, healthAnswer)
        guard stillSignedIn(account), selectedDate == date else { return }
        var failure: Error?
        switch t {
        case .success(let (snapshot, data)):
            todayScreen.show(snapshot, data: data, settled: settledToday)
            fetched[.today] = (Date(), date)
        case .failure(let error): failure = error
        }
        if case .success(let (snapshot, data))? = f {
            foodScreen.show(snapshot, data: data, settled: settledFood)
            fetched[.food] = (Date(), date)
            Task { await AppleHealthExport.shared.saveFoodDay(snapshot) }
        }
        if case .success(let value)? = h {
            health = value
            fetched[.health] = (Date(), date)
        }
        dataRevision += 1
        applyOutbox()
        guard let failure else {
            errorMessage = nil
            _ = noteConnection(nil)
            prefetchAround(date)
            return
        }
        if (failure as? APIError) == .unauthorized { signOut(expired: true); return }
        if Self.isCancellation(failure) { return }
        // Without signal the saved day stays on screen; an error only without one.
        let lost = noteConnection(failure)
        if !lost { notice = failure.localizedDescription }
    }

    nonisolated private static func attempt<T>(_ body: () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await body()) } catch { return .failure(error) }
    }

    /// The days before and after the one on screen kept on the phone in
    /// advance (each at most once an hour), with Food and Health when they
    /// were opened, so the next swipe or arrow opens at once.
    func prefetchAround(_ date: String) {
        let todayDate = Self.localDate(Date())
        let wantFood = food != nil, wantHealth = health != nil
        let api = api
        if wantFood { prefetchFoodAhead(date) }
        for offset in [-1, 1] {
            // Today itself is always loaded; later days have no Today or Health.
            guard let day = Self.shift(date, by: offset), day < todayDate else { continue }
            func stale(_ screen: String) -> Bool {
                guard let saved = SnapshotCache.savedAt(key: SnapshotCache.dayKey(screen, day)) else { return true }
                return Date().timeIntervalSince(saved) >= 3600
            }
            let today = stale("today"), food = wantFood && stale("food"), health = wantHealth && stale("health")
            guard today || food || health else { continue }
            scope.task(priority: .utility) {
                if today { _ = try? await api.todayData(date: day) }
                if food { _ = try? await api.foodData(date: day) }
                if health { _ = try? await api.health(date: day) }
            }
        }
    }

    /// Food's days ahead beside the one on screen (each at most once an hour),
    /// so the next arrow or swipe forward opens at once too.
    func prefetchFoodAhead(_ date: String) {
        let todayDate = Self.localDate(Date())
        guard let last = Self.shift(todayDate, by: Self.foodDaysAhead) else { return }
        let api = api
        for offset in [-1, 1] {
            guard let day = Self.shift(date, by: offset), day > todayDate, day <= last else { continue }
            if let saved = SnapshotCache.savedAt(key: SnapshotCache.dayKey("food", day)),
               Date().timeIntervalSince(saved) < 3600 { continue }
            scope.task(priority: .utility) { _ = try? await api.foodData(date: day) }
        }
    }
}

/// The first of two racing waits answers; the other one finds it taken.
@MainActor
final class FirstAnswer {
    private var taken = false
    func take() -> Bool {
        guard !taken else { return false }
        taken = true
        return true
    }
}

/// Training and Health read from disk off the main thread (AppModel.loadSaved);
/// read once, then handed over.
final class SavedScreens: @unchecked Sendable {
    let training: TrainingSnapshot?
    let health: HealthSnapshot?
    init(training: TrainingSnapshot?, health: HealthSnapshot?) {
        self.training = training
        self.health = health
    }
}
