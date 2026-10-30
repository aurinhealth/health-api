import Foundation

/// A planned ride, run or swim as the watch draws it (AurinWatch/TrainingPage.swift
/// RideDetail): its steps in order with their length and zone. The iPhone
/// sends it on request from GET /app/api/workouts/planned, or the watch asks
/// the server itself with the sign-in it keeps.
struct WatchPlan: Codable, Equatable, Sendable {
    static let requestKey = "planRequest"
    static let replyKey = "plan"

    var name: String?
    var minutes: Int?
    var steps: [Step]
    /// A swim in open water: by time, no rests at the wall.
    var openWater: Bool? = nil
    /// A ride or run indoors (a trainer, a treadmill).
    var indoor: Bool? = nil

    struct Step: Codable, Equatable, Sendable {
        var seconds: Double
        /// 1–6 by % of FTP or threshold pace (Coggan), 2 without a target.
        var zone: Int
        var label: String
        /// The repeats of the block it belongs to, shown as "4 × 3′".
        var repeats: Int = 1
        /// The step's place in its block, so a list shows a repeated block once.
        var first: Bool = true
        /// A swim: the length in metres, or a rest at the wall.
        var meters: Double? = nil
        var rest: Bool? = nil
        /// The plan calls it an interval.
        var interval: Bool? = nil
    }

    struct Request: Codable, Sendable {
        var eventId: String
        var date: String
    }

    /// No repeats and no interval steps, or no steps at all: a leg a multisport
    /// workout loses nothing of (the same test as WatchWorkout.steady on the iPhone).
    var steady: Bool { !steps.contains { $0.repeats > 1 || $0.interval == true } }

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

    /// A swim's zone by % of CSS speed (src/training-zones.js swimZones).
    static func zone(percent: Double?, swim: Bool = false) -> Int {
        guard let p = percent else { return 2 }
        if swim {
            switch p {
            case ..<90: return 1
            case ..<96: return 2
            case ..<99: return 3
            case ..<103: return 4
            default: return 5
            }
        }
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
    static func label(note: String?, intensity: String?, english: Bool, swim: Bool = false, rest: Bool = false) -> String {
        if let note, !note.trimmingCharacters(in: .whitespaces).isEmpty { return note }
        if rest { return english ? "Rest" : "Pauza" }
        switch intensity {
        case "warmup": return english ? "Warm-up" : swim ? "Rozplavání" : "Rozjetí"
        case "cooldown": return english ? "Cool-down" : swim ? "Vyplavání" : "Vyjetí"
        case "recovery": return english ? "Easy" : "Volně"
        case "interval": return english ? "Interval" : "Interval"
        default: return english ? "Steady" : "Plynule"
        }
    }

    /// The server's answer (GET /app/api/workouts/planned): { workout: { name,
    /// sport, environment, duration_minutes, steps: [{ repeats, steps: [{ durationSeconds, percentLow, meters, rest, … }] }] } }.
    static func parse(_ data: Data, english: Bool) -> WatchPlan? {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let workout = object["workout"] as? [String: Any] else { return nil }
        let number = { (v: Any?) -> Double? in (v as? NSNumber)?.doubleValue ?? (v as? String).flatMap(Double.init) }
        let swim = workout["sport"] as? String == "swim"
        var steps: [Step] = []
        for block in workout["steps"] as? [[String: Any]] ?? [] {
            let repeats = max(1, Int(number(block["repeats"]) ?? 1))
            for (i, s) in (block["steps"] as? [[String: Any]] ?? []).enumerated() {
                steps.append(step(seconds: number(s["durationSeconds"]), low: number(s["percentLow"]), high: number(s["percentHigh"]),
                                  note: s["note"] as? String, intensity: s["intensity"] as? String, meters: number(s["meters"]),
                                  rest: s["rest"] as? Bool == true, swim: swim, english: english, repeats: repeats, first: i == 0))
            }
        }
        // A plan without steps (a steady run after a ride) still comes back: a brick needs to know it.
        return WatchPlan(name: workout["name"] as? String, minutes: number(workout["duration_minutes"]).map { Int($0.rounded()) }, steps: steps,
                         openWater: swim && workout["environment"] as? String == "outdoor" ? true : nil,
                         indoor: !swim && workout["environment"] as? String == "indoor" ? true : nil)
    }

    /// One step of the server's plan; a rest at the wall is zone 1.
    static func step(seconds: Double?, low: Double?, high: Double?, note: String?, intensity: String?, meters: Double?, rest: Bool,
                     swim: Bool, english: Bool, repeats: Int, first: Bool) -> Step {
        let mid = low.flatMap { l in high.map { (l + $0) / 2 } } ?? high ?? low
        return Step(seconds: seconds ?? 60, zone: rest ? 1 : zone(percent: mid, swim: swim),
                    label: label(note: note, intensity: intensity, english: english, swim: swim, rest: rest),
                    repeats: repeats, first: first, meters: swim && !rest ? meters.flatMap { $0 > 0 ? $0 : nil } : nil, rest: rest ? true : nil,
                    interval: intensity == "interval" ? true : nil)
    }

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchPlan? { try? JSONDecoder().decode(WatchPlan.self, from: data) }
}
