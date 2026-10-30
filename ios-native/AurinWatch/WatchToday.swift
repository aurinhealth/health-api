import Foundation

/// Today straight from the server with the watch's own sign-in, when the
/// iPhone is out of reach or has nothing for today yet: GET /app/api/today
/// and /app/api/training, read into a WatchSnapshot as the iPhone builds it
/// (App/WatchBridge.swift snapshot). What only Health on the iPhone has (the
/// 90 days of history, the sleep stages, the alarm's times) stays from the
/// last snapshot the iPhone sent.
@MainActor
enum WatchToday {
    /// Only what the watch draws; every field optional, so a newer server never breaks it.
    private struct Today: Decodable {
        var date: String
        var readiness: Readiness?
        var sleep: Sleep?
        var strain: Strain?
        var hrv: Metric?
        var restingHR: Metric?
        var summary: Summary?
        var nutrition: Nutrition?
        var plan: [PlanItem]?
        var steps: Steps?

        struct Readiness: Decodable { var score: Int?; var zone: String? }
        struct Sleep: Decodable { var minutes: Double?; var need: Double?; var start: String?; var end: String? }
        struct Strain: Decodable {
            var score: Double?; var training: Double?; var movement: Double?; var planned: Double?; var target: Target?
            struct Target: Decodable { var low: Double?; var high: Double? }
        }
        struct Point: Decodable { var date: String; var value: Double }
        struct Metric: Decodable { var value: Double?; var baseline: Double?; var low: Double?; var high: Double?; var series: [Point]? }
        struct Summary: Decodable { var headline: String?; var text: String? }
        struct Macro: Decodable { var eaten: Double?; var target: Double?; var limit: Bool?; var net: Bool? }
        struct Water: Decodable { var ml: Double?; var target: Double? }
        struct Nutrition: Decodable { var kcal: Double?; var target: Double?; var protein: Macro?; var carbs: Macro?; var fat: Macro?; var water: Water? }
        struct PlanItem: Decodable { var kind: String?; var time: String?; var title: String?; var done: Bool? }
        struct Steps: Decodable { var today: Double? }
    }

    private struct Training: Decodable {
        var sessions: [Session]?
        struct Session: Decodable {
            var status: String?; var date: String; var time: String?; var title: String; var sport: String?; var minutes: Int?; var eventId: String?
        }
    }

    /// The day from the server, on top of the last snapshot; nil when the
    /// watch isn't signed in or has no connection.
    static func load(over last: WatchSnapshot?) async -> WatchSnapshot? {
        guard let data = await WatchAPI.get("/app/api/today"),
              let today = try? JSONDecoder().decode(Today.self, from: data) else { return nil }
        let training = await WatchAPI.get("/app/api/training").flatMap { try? JSONDecoder().decode(Training.self, from: $0) }
        let sameDay = last?.date == today.date
        let points = { (p: [Today.Point]?) in (p ?? []).map { WatchSnapshot.Day(date: $0.date, value: $0.value) } }
        let metric = { (m: Today.Metric?, old: WatchSnapshot.Metric?, spread: Double) -> WatchSnapshot.Metric? in
            guard let m else { return old }
            let series = points(m.series)
            return WatchSnapshot.Metric(value: m.value, low: m.low ?? m.baseline.map { $0 - spread },
                                        high: m.high ?? m.baseline.map { $0 + spread },
                                        series: series.isEmpty ? old?.series ?? [] : series)
        }
        let sleep = today.sleep.map { s in
            WatchSnapshot.Sleep(minutes: s.minutes, need: s.need ?? last?.sleep?.need, start: s.start.map(clock), end: s.end.map(clock),
                                deep: sameDay ? last?.sleep?.deep : nil, rem: sameDay ? last?.sleep?.rem : nil,
                                light: sameDay ? last?.sleep?.light : nil, nights: last?.sleep?.nights ?? [])
        }
        let next = (today.plan ?? []).first { $0.kind == "workout" && $0.done != true }
        let strain = WatchSnapshot.Strain(score: today.strain?.score, low: today.strain?.target?.low, high: today.strain?.target?.high,
                                          training: today.strain?.training, movement: today.strain?.movement,
                                          planned: today.strain?.planned, nextTitle: next?.title, nextTime: next?.time)
        let week = training?.sessions?.filter { $0.status != "missed" }.map {
            WatchSnapshot.Session(date: $0.date, time: $0.time, title: $0.title, sport: $0.sport ?? "other", minutes: $0.minutes,
                                  done: $0.status == "done", eventId: $0.eventId)
        } ?? last?.week
        let macro = { (m: Today.Macro?) in WatchSnapshot.Macro(eaten: m?.eaten, target: m?.target, limit: m?.limit, net: m?.net) }
        let n = today.nutrition
        let food = n.map {
            WatchSnapshot.Food(kcal: $0.kcal, target: $0.target, carbs: macro($0.carbs), protein: macro($0.protein), fat: macro($0.fat),
                               water: $0.water?.ml, waterTarget: $0.water?.target)
        }
        return WatchSnapshot(date: today.date, updated: Date(), language: last?.language ?? WatchAPI.session?.language ?? "en",
                             readiness: today.readiness?.score, zone: today.readiness?.zone,
                             headline: today.summary?.headline, summary: today.summary?.text,
                             sleep: sleep, restingHR: metric(today.restingHR, last?.restingHR, 2), hrv: metric(today.hrv, last?.hrv, 0),
                             strain: strain, steps: today.steps?.today, week: week, food: food,
                             alarm: last?.alarm, imperial: last?.imperial ?? WatchAPI.session?.imperial)
    }

    /// "23:05" from an ISO time, "7:02" from "07:02".
    private static func clock(_ value: String) -> String {
        let iso = ISO8601DateFormatter()
        let fraction = ISO8601DateFormatter()
        fraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: value) ?? fraction.date(from: value) {
            return W.dateFormatter("H:mm", posix: true).string(from: date)
        }
        return value.hasPrefix("0") && value.count == 5 ? String(value.dropFirst()) : value
    }
}
