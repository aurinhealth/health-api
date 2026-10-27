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
    private var healthLoaded: Date?
    private var loadingHealth = false

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

    func clear() {
        today = nil
        health = nil
        healthLoaded = nil
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
            guard api.hasSession, let loaded = try? await api.health() else { return }
            update(loaded)
        }
    }

    private func send() {
        guard watchReady, let session, let today, let data = Self.snapshot(today, health: health).encoded() else { return }
        try? session.updateApplicationContext([WatchSnapshot.contextKey: data])
    }

    /// The saved Today when the app was woken only for the watch.
    private func restore() {
        if today == nil, let saved = SnapshotCache.load(TodaySnapshot.self, key: "today")?.value,
           saved.date == AppModel.localDate(Date()) {
            today = saved
        }
        if health == nil, let saved = SnapshotCache.load(HealthSnapshot.self, key: "health")?.value,
           saved.date == today?.date {
            health = saved
        }
    }

    static func snapshot(_ today: TodaySnapshot, health: HealthSnapshot?) -> WatchSnapshot {
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
        return WatchSnapshot(date: today.date, updated: Date(), language: L10n.language,
                             readiness: today.readiness.score, zone: today.readiness.zone,
                             headline: today.summary?.headline, summary: today.summary?.text,
                             sleep: sleep, restingHR: restingHR, hrv: hrv, strain: strain, steps: today.steps.today)
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

    /// The watch app opened and asks for the newest data.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in
            restore()
            if let today, let data = Self.snapshot(today, health: health).encoded() {
                replyHandler([WatchSnapshot.contextKey: data])
            } else {
                replyHandler([:])
            }
        }
    }
}
