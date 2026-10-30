import Foundation
import WatchConnectivity

/// Hands Today to the Apple Watch app (AurinWatch) over WatchConnectivity:
/// readiness, the night, resting HR and HRV with their history, and strain
/// (WatchShared/WatchSnapshot.swift). Called with WidgetBridge, so the watch
/// gets every new Today the widgets get. The history comes from Health, which
/// the bridge loads itself when the watch app is installed and it has none for the day.
@MainActor
final class WatchBridge: NSObject {
    static let shared = WatchBridge()

    private var today: TodaySnapshot?
    private var health: HealthSnapshot?
    private var training: TrainingSnapshot?
    /// When the watch last got Today, for Settings → Apple Watch.
    private(set) var lastSent: Date?
    /// The profile's wake times for the watch's alarm (Settings → Sleep).
    private var profile: JSONObject?
    private var healthLoaded: Date?
    private var loadingHealth = false
    /// The gym days the watch works on (WatchGymBridge.swift).
    var gymDays: [String: GymDay] = [:]

    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    /// From the app's launch (AppDelegate).
    func start() {
        guard let session, session.delegate == nil else { return }
        session.delegate = self
        session.activate()
    }

    func update(_ today: TodaySnapshot) {
        self.today = today
        send()
        loadHealthIfNeeded(for: today.date)
    }

    /// Health of the shown day from the app; only today's goes to the watch.
    func update(_ health: HealthSnapshot) {
        guard health.date == (today?.date ?? AppModel.localDate(Date())) else { return }
        self.health = health
        healthLoaded = Date()
        send()
    }

    /// This week's sessions for the watch's Training page.
    func update(_ training: TrainingSnapshot) {
        self.training = training
        send()
    }

    /// The profile after Settings saved it: new wake times for the watch.
    func update(profile: JSONObject) {
        self.profile = profile
        send()
    }

    func clear() {
        profile = nil
        today = nil
        health = nil
        training = nil
        healthLoaded = nil
        gymDays = [:]
        guard let session, session.activationState == .activated else { return }
        try? session.updateApplicationContext([:])
    }

    private var watchReady: Bool {
        guard let session, session.activationState == .activated else { return false }
        return session.isPaired && session.isWatchAppInstalled
    }

    /// The 90 days of resting HR and HRV live in Health only: loaded once an
    /// hour while the watch app is installed.
    private func loadHealthIfNeeded(for date: String) {
        guard watchReady, !loadingHealth else { return }
        if let health, health.date == date, let healthLoaded, Date().timeIntervalSince(healthLoaded) < 3600 { return }
        loadingHealth = true
        Task { @MainActor in
            defer { loadingHealth = false }
            let api = AppModel.live?.api ?? APIClient()
            guard api.hasSession else { return }
            // The week for the Training page, when the app has not loaded it yet.
            if training == nil, let week = try? await api.training() { training = week }
            if let loaded = try? await api.profile() { profile = loaded }
            guard let loaded = try? await api.health() else { send(); return }
            update(loaded)
        }
    }

    private var pending: Task<Void, Never>?

    /// The wake times as the watch has them.
    var currentAlarm: WatchSnapshot.Alarm? {
        today.flatMap { Self.snapshot($0, health: health, training: training, profile: profile).alarm }
    }

    /// Today, health and the week come one after another on a refresh: sent
    /// once, half a second after the last of them, not three times.
    private func send() {
        pending?.cancel()
        pending = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            sendContext()
        }
    }

    /// A glass of water from the watch's Food page: through the app's outbox
    /// when it runs (Today reloads and comes back to the watch), else straight to the server.
    func addWater(ml: Int, kind: String = "water") async {
        let kind = DrinkKind.find(kind) == nil ? "water" : kind
        if let model = AppModel.live {
            model.addDrinkToday(ml: ml, kind: kind)
            return
        }
        _ = try? await APIClient().sendQueued(AppModel.drinkItem(ml: ml, kind: kind, date: AppModel.localDate(Date())))
    }

    /// Food → Drinks: the favourite drinks in their usual glasses, for the watch.
    static func watchDrinks() -> [WatchSnapshot.Drink] {
        let favorites = UserDefaults.standard.string(forKey: DrinkPrefs.favoritesKey) ?? DrinkPrefs.defaultFavorites
        return DrinkPrefs.presets(favorites: DrinkPrefs.list(favorites)).compactMap { preset in
            guard let kind = DrinkKind.find(preset.kind) else { return nil }
            return WatchSnapshot.Drink(kind: preset.kind, ml: preset.ml, name: L10n.tr(kind.label), symbol: kind.symbol, factor: kind.factor)
        }
    }

    /// Today and today's gym (WatchGymBridge.swift) as the application context.
    func sendContext() {
        guard watchReady, let session else { return }
        var context: [String: Any] = [:]
        var alarm: WatchSnapshot.Alarm?
        if let today {
            let snapshot = Self.snapshot(today, health: health, training: training, profile: profile)
            alarm = snapshot.alarm
            if let data = snapshot.encoded() { context[WatchSnapshot.contextKey] = data }
        }
        // The iPhone's backup for the watch's alarm follows the wake times.
        Task { await updateAlarmBackup(alarm) }
        if let gym = gymContext { context[WatchGym.replyKey] = gym }
        guard !context.isEmpty else { return }
        context[WatchSettings.contextKey] = Self.settings.encoded()
        if let signIn = Self.signIn()?.encoded() { context[WatchSession.contextKey] = signIn }
        try? session.updateApplicationContext(context)
        lastSent = Date()
    }

    /// Training mode finished on the iPhone: the watch ends its workout and saves it.
    func endWatchGym() {
        guard let session, session.activationState == .activated, session.isWatchAppInstalled else { return }
        let message: [String: Any] = [WatchGym.endKey: true]
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in WCSession.default.transferUserInfo(message) }
        } else {
            session.transferUserInfo(message)
        }
    }

    /// The session cookie for the watch's own requests (WatchShared/WatchSession.swift).
    static func signIn() -> WatchSession? {
        let api = AppModel.live?.api ?? APIClient()
        guard api.hasSession,
              let cookie = HTTPCookieStorage.shared.cookies(for: api.baseURL)?.first(where: { $0.name == APIClient.sessionCookie })
        else { return nil }
        let server = api.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return WatchSession(server: server, name: cookie.name, value: cookie.value,
                            expires: api.baseURL.host().flatMap(SessionKeychain.expires) ?? cookie.expiresDate,
                            apiLevel: APIClient.apiLevel, language: L10n.language, imperial: Units.imperial)
    }

    /// Settings → Apple Watch, kept on the iPhone and sent with every Today.
    static var settings: WatchSettings {
        get { UserDefaults.standard.data(forKey: WatchSettings.contextKey).flatMap(WatchSettings.decode) ?? WatchSettings() }
        set {
            UserDefaults.standard.set(newValue.encoded(), forKey: WatchSettings.contextKey)
            shared.sendContext()
        }
    }

    /// Settings → Apple Watch: paired, the app installed, in reach now.
    var watchState: (paired: Bool, installed: Bool, reachable: Bool) {
        guard let session, session.activationState == .activated else { return (false, false, false) }
        return (session.isPaired, session.isWatchAppInstalled, session.isReachable)
    }

    /// The saved Today when the app was woken only for the watch.
    private func restore() {
        if today == nil, let saved = SnapshotCache.load(TodaySnapshot.self, key: "today")?.value,
           saved.date == AppModel.localDate(Date()) {
            today = saved
        }
        if training == nil { training = SnapshotCache.load(TrainingSnapshot.self, key: "training")?.value }
        if health == nil, let saved = SnapshotCache.load(HealthSnapshot.self, key: "health")?.value,
           saved.date == today?.date {
            health = saved
        }
    }

    static func snapshot(_ today: TodaySnapshot, health: HealthSnapshot?, training: TrainingSnapshot? = nil, profile: JSONObject? = nil) -> WatchSnapshot {
        let day = { (points: [Point]) in points.map { WatchSnapshot.Day(date: $0.date, value: $0.value) } }
        let night = health?.sleep.night.flatMap { $0.date == today.date ? $0 : nil }
        let sleep = today.sleep.map { s in
            WatchSnapshot.Sleep(minutes: s.minutes, need: s.need.map { Double($0) } ?? health.map { Double($0.sleep.need) },
                                start: s.start.map(clock), end: s.end.map(clock),
                                deep: night?.stages?.deep, rem: night?.stages?.rem, light: night?.stages?.light,
                                nights: day(health?.sleep.week ?? []))
        }
        let rhrSeries = health?.restingHR?.series ?? today.restingHR?.series ?? []
        let restingHR = (today.restingHR != nil || !rhrSeries.isEmpty) ? WatchSnapshot.Metric(
            value: today.restingHR?.value ?? health?.restingHR?.value,
            low: today.restingHR?.low ?? today.restingHR?.baseline.map { $0 - 2 },
            high: today.restingHR?.high ?? today.restingHR?.baseline.map { $0 + 2 },
            series: day(rhrSeries)) : nil
        let hrvSeries = health?.hrv?.series ?? today.hrv?.series ?? []
        let hrv = (today.hrv != nil || !hrvSeries.isEmpty) ? WatchSnapshot.Metric(
            value: today.hrv?.value ?? health?.hrv?.value,
            low: today.hrv?.low ?? health?.hrv?.low, high: today.hrv?.high ?? health?.hrv?.high,
            series: day(hrvSeries)) : nil
        let next = today.plan.first { $0.kind == "workout" && !$0.done }
        let strain = WatchSnapshot.Strain(score: today.strain.score, low: today.strain.target?.low, high: today.strain.target?.high,
                                          training: today.strain.training, movement: today.strain.movement,
                                          planned: today.strain.planned, nextTitle: next?.title, nextTime: next?.time)
        let week = training?.sessions?.filter { $0.status != "missed" }.map {
            WatchSnapshot.Session(date: $0.date, time: $0.time, title: $0.title, sport: $0.sport, minutes: $0.minutes, done: $0.status == "done",
                                  eventId: $0.eventId, after: $0.after, next: $0.next)
        }
        let n = today.nutrition
        let macro = { (m: TodaySnapshot.Macro) in WatchSnapshot.Macro(eaten: m.eaten, target: m.target, limit: m.limit) }
        let food = WatchSnapshot.Food(kcal: n.kcal, target: n.target, carbs: macro(n.carbs), protein: macro(n.protein), fat: macro(n.fat),
                                      water: n.water.ml, waterTarget: n.water.target)
        let tonight = health?.sleep.tonight
        let wakeText = { (key: String) in profile?[key]?.string.flatMap { $0.isEmpty ? nil : $0 } }
        let alarm = (profile != nil || tonight != nil) ? WatchSnapshot.Alarm(
            work: wakeText("wakeTime"), weekend: wakeText("wakeTimeWeekend"),
            evening: tonight?.date, wake: tonight?.wake.map(clock), wakeOnce: tonight?.wakeOnce,
            bedtime: tonight?.bedtime.map(clock), inBed: tonight?.inBed, sleep: tonight?.sleep ?? tonight?.need) : nil
        return WatchSnapshot(date: today.date, updated: Date(), language: L10n.language,
                             readiness: today.readiness.score, zone: today.readiness.zone,
                             headline: today.summary?.headline, summary: today.summary?.text,
                             sleep: sleep, restingHR: restingHR, hrv: hrv, strain: strain, steps: today.steps.today,
                             week: week, food: food, alarm: alarm, imperial: Units.imperial, drinks: watchDrinks())
    }

    /// "23:05" from an ISO time or a clock time.
    private static func clock(_ value: String) -> String {
        if let date = ISO8601DateFormatter().date(from: value) ?? ISO8601DateFormatter.withFraction.date(from: value) {
            let formatter = DateFormatter()
            formatter.dateFormat = "H:mm"
            return formatter.string(from: date)
        }
        // "07:02" as the app writes it: "7:02".
        return value.hasPrefix("0") && value.count == 5 ? String(value.dropFirst()) : value
    }
}

private extension ISO8601DateFormatter {
    static var withFraction: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }
}

extension WatchBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            restore()
            send()
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Another watch was paired: the new one gets the snapshot too.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in
            restore()
            send()
            if let date = today?.date { loadHealthIfNeeded(for: date) }
        }
    }

    /// The watch app opened and asks for the newest data, the day's gym
    /// plan, or sends a set it finished.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        let gymDate = message[WatchGym.requestKey] as? String
        let done = (message[WatchGym.doneKey] as? Data).flatMap(WatchGym.Done.decode)
        let rated = (message[WatchGym.ratedKey] as? Data).flatMap(WatchGym.Rated.decode)
        let change = (message[WatchGym.changeKey] as? Data).flatMap(WatchGym.Change.decode)
        let options = (message[WatchGym.optionsKey] as? Data).flatMap(WatchGym.OptionsRequest.decode)
        let water = message[WatchSnapshot.waterKey] as? Int
        let drinkKind = message[WatchSnapshot.drinkKindKey] as? String ?? "water"
        let alarmChange = (message[WatchSnapshot.AlarmChange.key] as? Data).flatMap(WatchSnapshot.AlarmChange.decode)
        let onWatch = message[WatchSnapshot.alarmOnWatchKey] as? Bool
        let alarmStopped = message[WatchSnapshot.alarmStoppedKey] as? Bool == true
        let alarmSnoozed = message[WatchSnapshot.alarmSnoozedKey] as? Date
        let coach = (message[WatchCoach.askKey] as? Data).flatMap(WatchCoach.Ask.decode)
        let live = (message[WatchGym.liveKey] as? Data).flatMap(WatchGym.Live.decode)
        let plan = (message[WatchPlan.requestKey] as? Data).flatMap { try? JSONDecoder().decode(WatchPlan.Request.self, from: $0) }
        Task { @MainActor in
            if let plan {
                let steps = await planSteps(plan)
                replyHandler(steps?.encoded().map { [WatchPlan.replyKey: $0] } ?? [:])
                return
            }
            if let live {
                LiveWorkout.shared.watch(live)
                replyHandler(["ok": true])
                return
            }
            if let coach {
                // The answer takes longer than a reply waits: it comes as its own message.
                replyHandler(["ok": true])
                await askCoach(coach)
                return
            }
            if let alarmChange {
                let ok = await applyAlarm(alarmChange)
                replyHandler(["ok": ok])
                return
            }
            if let onWatch {
                await alarmOnWatch(onWatch)
                replyHandler(["ok": true])
                return
            }
            if alarmStopped || alarmSnoozed != nil {
                replyHandler(["ok": true])
                await watchAlarm(stopped: alarmStopped, snoozedUntil: alarmSnoozed)
                return
            }
            if let water {
                await addWater(ml: water, kind: drinkKind)
                replyHandler(["ok": true])
                return
            }
            if let change {
                let gym = await applyGym(change)
                replyHandler(gym?.encoded().map { [WatchGym.replyKey: $0] } ?? [:])
                return
            }
            if let options {
                let list = await gymOptions(options)
                replyHandler((try? JSONEncoder().encode(list)).map { [WatchGym.optionsKey: $0] } ?? [:])
                return
            }
            if let gymDate {
                let gym = await loadGym(date: gymDate)
                replyHandler(gym?.encoded().map { [WatchGym.replyKey: $0] } ?? [:])
                return
            }
            if let done {
                await applyGym(done)
                replyHandler(["ok": true])
                return
            }
            if let rated {
                await applyGym(rated)
                replyHandler(["ok": true])
                return
            }
            restore()
            // In the morning the iPhone may not have opened Aurin yet: it
            // loads today itself, so the watch doesn't wait on yesterday.
            if today?.date != AppModel.localDate(Date()) { await loadTodayForWatch() }
            if let today, let data = Self.snapshot(today, health: health, training: training, profile: profile).encoded() {
                replyHandler([WatchSnapshot.contextKey: data])
            } else {
                replyHandler([:])
            }
        }
    }

    /// Today, the week and health from the server, when the app has none for today.
    private func loadTodayForWatch() async {
        let api = AppModel.live?.api ?? APIClient()
        guard api.hasSession, let loaded = try? await api.today() else { return }
        today = loaded
        if let week = try? await api.training() { training = week }
        if let fresh = try? await api.health(), fresh.date == loaded.date {
            health = fresh
            healthLoaded = Date()
        }
    }

    /// A ride's, run's or swim's steps for its detail on the watch.
    private func planSteps(_ request: WatchPlan.Request) async -> WatchPlan? {
        let api = AppModel.live?.api ?? APIClient()
        // As Training's session detail asks (PlannedWorkoutView): the day only for today's.
        let today = request.date == AppModel.localDate(Date())
        guard let planned = try? await api.plannedWorkout(eventId: request.eventId, date: today ? request.date : nil) else { return nil }
        let workout = planned.workout
        let swim = workout.sport == "swim"
        var steps: [WatchPlan.Step] = []
        for block in workout.steps ?? [] {
            for (i, s) in (block.steps ?? []).enumerated() {
                steps.append(WatchPlan.step(seconds: s.durationSeconds, low: s.percentLow, high: s.percentHigh, note: s.note, intensity: s.intensity,
                                            meters: s.meters, rest: s.rest == true, swim: swim, english: L10n.isEnglish,
                                            repeats: max(1, block.repeats ?? 1), first: i == 0))
            }
        }
        // Without steps too: a brick's steady leg goes to the watch as one multisport workout.
        return WatchPlan(name: workout.name, minutes: workout.duration_minutes.map { Int($0.rounded()) }, steps: steps,
                         openWater: swim && workout.environment == "outdoor" ? true : nil,
                         indoor: !swim && workout.environment == "indoor" ? true : nil)
    }

    /// A set, a drink or the alarm's place sent while the iPhone was out of reach.
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        let done = (userInfo[WatchGym.doneKey] as? Data).flatMap(WatchGym.Done.decode)
        let rated = (userInfo[WatchGym.ratedKey] as? Data).flatMap(WatchGym.Rated.decode)
        let water = userInfo[WatchSnapshot.waterKey] as? Int
        let drinkKind = userInfo[WatchSnapshot.drinkKindKey] as? String ?? "water"
        let onWatch = userInfo[WatchSnapshot.alarmOnWatchKey] as? Bool
        let alarmStopped = userInfo[WatchSnapshot.alarmStoppedKey] as? Bool == true
        let alarmSnoozed = userInfo[WatchSnapshot.alarmSnoozedKey] as? Date
        Task { @MainActor in
            if let done { await applyGym(done) }
            if let rated { await applyGym(rated) }
            if let water { await addWater(ml: water, kind: drinkKind) }
            if let onWatch { await alarmOnWatch(onWatch) }
            if alarmStopped || alarmSnoozed != nil { await watchAlarm(stopped: alarmStopped, snoozedUntil: alarmSnoozed) }
        }
    }
}
