import Foundation

/// A planned ride or run as the watch draws it (AurinWatch/TrainingPage.swift
/// RideDetail): its steps in order with their length and zone. The iPhone
/// sends it on request from GET /app/api/workouts/planned, or the watch asks
/// the server itself with the sign-in it keeps.
struct WatchPlan: Codable, Equatable, Sendable {
    static let requestKey = "planRequest"
    static let replyKey = "plan"

    var name: String?
    var minutes: Int?
    var steps: [Step]

    struct Step: Codable, Equatable, Sendable {
        var seconds: Double
        /// 1–6 by % of FTP or threshold pace (Coggan), 2 without a target.
        var zone: Int
        var label: String
        /// The repeats of the block it belongs to, shown as "4 × 3′".
        var repeats: Int = 1
        /// The step's place in its block, so a list shows a repeated block once.
        var first: Bool = true
    }

    struct Request: Codable, Sendable {
        var eventId: String
        var date: String
    }

    /// Steps in the order they are ridden, the repeats unrolled.
    var ridden: [Step] {
        var out: [Step] = []
        var block: [Step] = []
        func flush() {
            guard let repeats = block.first?.repeats else { return }
            for _ in 0..<max(1, min(repeats, 20)) { out += block }
            block = []
        }
        for step in steps {
            if step.first { flush() }
            block.append(step)
        }
        flush()
        return out
    }

    static func zone(percent: Double?) -> Int {
        guard let p = percent else { return 2 }
        switch p {
        case ..<56: return 1
        case ..<76: return 2
        case ..<91: return 3
        case ..<106: return 4
        case ..<121: return 5
        default: return 6
        }
    }

    /// The step's name as the plan gives it, else what it is for.
    static func label(note: String?, intensity: String?, english: Bool) -> String {
        if let note, !note.trimmingCharacters(in: .whitespaces).isEmpty { return note }
        switch intensity {
        case "warmup": return english ? "Warm-up" : "Rozjetí"
        case "cooldown": return english ? "Cool-down" : "Vyjetí"
        case "recovery": return english ? "Easy" : "Volně"
        case "interval": return english ? "Interval" : "Interval"
        default: return english ? "Steady" : "Plynule"
        }
    }

    /// The server's answer (GET /app/api/workouts/planned): { workout: { name,
    /// duration_minutes, steps: [{ repeats, steps: [{ durationSeconds, percentLow, … }] }] } }.
    static func parse(_ data: Data, english: Bool) -> WatchPlan? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let workout = object["workout"] as? [String: Any] else { return nil }
        let number = { (v: Any?) -> Double? in (v as? NSNumber)?.doubleValue ?? (v as? String).flatMap(Double.init) }
        var steps: [Step] = []
        for block in workout["steps"] as? [[String: Any]] ?? [] {
            let repeats = max(1, Int(number(block["repeats"]) ?? 1))
            for (i, s) in (block["steps"] as? [[String: Any]] ?? []).enumerated() {
                let low = number(s["percentLow"]), high = number(s["percentHigh"])
                let mid = low.flatMap { l in high.map { (l + $0) / 2 } } ?? high ?? low
                steps.append(Step(seconds: number(s["durationSeconds"]) ?? 60, zone: zone(percent: mid),
                                  label: label(note: s["note"] as? String, intensity: s["intensity"] as? String, english: english),
                                  repeats: repeats, first: i == 0))
            }
        }
        guard !steps.isEmpty else { return nil }
        return WatchPlan(name: workout["name"] as? String, minutes: number(workout["duration_minutes"]).map { Int($0.rounded()) }, steps: steps)
    }

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchPlan? { try? JSONDecoder().decode(WatchPlan.self, from: data) }
}
