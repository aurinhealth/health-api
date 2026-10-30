import BackgroundTasks
import UIKit

/// Aurin without being opened. Two ways iOS wakes the app on its own:
/// new Apple Health data (HKObserverQuery, AppleHealth.start) and this
/// refresh task, which iOS runs a few times a day when it chooses. Either
/// way what is new in Apple Health goes to the server and the widgets get
/// the server's Today, with Google Health and Intervals.icu data too, and
/// the day's activity (Aktivita dne) for what is new.
/// A locked iPhone keeps Apple Health closed, so that part waits for the
/// next wake after unlocking.
@MainActor
enum BackgroundRefresh {
    /// Also in project.yml (BGTaskSchedulerPermittedIdentifiers).
    static let identifier = "health.aurin.app.refresh"

    /// At launch (AppDelegate), before the launch ends, as iOS requires.
    static func register(api: APIClient) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: .main) { task in
            guard let task = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            MainActor.assumeIsolated { run(task, api: api) }
        }
    }

    /// Leaving the app and after each run: the next one in an hour at the
    /// earliest; iOS picks the moment (usually a few times a day).
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func run(_ task: BGAppRefreshTask, api: APIClient) {
        schedule()
        let work = Task { @MainActor in
            task.setTaskCompleted(success: await refresh(api: api, widgets: true))
        }
        // iOS calls this on a queue of its own, not the main thread
        // (assumeIsolated here stopped the app), so it hops there.
        task.expirationHandler = { @Sendable in
            work.cancel()
            Task { @MainActor in AppleHealth.shared.abandon() }
        }
    }

    /// Apple Health out, then Today for the widgets: always from the refresh
    /// task, from a HealthKit wake only when the server got something new.
    @discardableResult
    static func refresh(api: APIClient, widgets always: Bool) async -> Bool {
        guard api.hasSession else { return false }
        let outcome = await AppleHealth.shared.run(api: api)
        let synced = outcome.ok
        await CalendarTime.shared.send(api: api)
        await CalendarTime.shared.mirror(api: api)
        guard always || outcome.changed else { return synced }
        guard !Task.isCancelled, await followToday(api: api) else { return false }
        return synced || !AppleHealth.shared.enabled
    }

    /// The morning readiness push wakes the app (content-available): the
    /// server already has the night, so Today for the widgets follows, and
    /// the widgets show the morning before the app is opened.
    static func morningPush(api: APIClient) async -> Bool {
        guard api.hasSession else { return false }
        return await followToday(api: api)
    }

    /// The server's Today for the widgets and the reminders (water after the
    /// day's target, a workout the watch already brought), then Aktivita dne
    /// for the new data, kept for Today's card (CoachPick.stored), so it opens
    /// ready without loading.
    private static func followToday(api: APIClient) async -> Bool {
        guard let today = try? await api.today() else { return false }
        WidgetBridge.update(today)
        await Reminders.reschedule(from: today)
        if !Task.isCancelled { _ = try? await api.coachPick() }
        return true
    }

    /// A HealthKit wake in the background. HealthKit is told it was handled
    /// as soon as the data went out: it slows the wakes of an app that takes
    /// long. The mornings bring several types at once (sleep, HRV, heart
    /// rate…), each its own wake; Today and Aktivita dne follow once for all
    /// of them, a moment after the last.
    static func healthWake(api: APIClient) async {
        let outcome = await AppleHealth.shared.run(api: api)
        wakeChanged = wakeChanged || outcome.changed
        follow?.cancel()
        let background = FinishInBackground("Health wake")
        follow = Task { @MainActor in
            defer { background.end() }
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled, api.hasSession else { return }
            follow = nil
            let changed = wakeChanged
            wakeChanged = false
            await CalendarTime.shared.send(api: api)
            await CalendarTime.shared.mirror(api: api)
            if changed { _ = await followToday(api: api) }
        }
    }
    private static var follow: Task<Void, Never>?
    private static var wakeChanged = false
}

/// Leaving the app mid-sync: iOS froze the app within seconds, the requests on
/// their way stayed frozen until the next open, and that open waited for them
/// (the sync took minutes or never ended). This asks iOS for the time to
/// finish (about half a minute); when it runs out, `expired` stops the work
/// first, so nothing is left frozen half done.
@MainActor
final class FinishInBackground {
    private var id = UIBackgroundTaskIdentifier.invalid

    init(_ name: String, expired: @escaping @MainActor @Sendable () -> Void = {}) {
        id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            MainActor.assumeIsolated {
                expired()
                self?.end()
            }
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}
