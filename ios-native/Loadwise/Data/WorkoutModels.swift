import Foundation

/// One row of Training → Tento týden (src/app-training.js sessionOf).
struct WeekSession: Decodable, Hashable, Identifiable {
    let id: String
    /// "activity", "planned" or "gym".
    let kind: String
    /// "done", "planned" or "missed".
    let status: String
    let date: String
    let time: String?
    let title: String
    /// ride, run, strength, swim, walk or other.
    let sport: String
    let minutes: Int?
    let tss: Double?
    /// Intervals.icu activity id for GET /app/api/activity-detail.
    let activityId: String?
    /// "planned:<id>" for /app/api/planned/move and delete.
    let eventId: String?
}

// MARK: - Gym (GET/POST /app/api/gym, src/gym-plan-store.js)

/// The stored gym plan: a sheet of rows. Rows 0–6 are the header (row 2 holds
/// the plan name in column 3), sets start at row 7 with the columns
/// Typ, Cvik, Série, Plán kg, Plán reps, Skutečně kg, Skutečně reps, RPE,
/// Hotovo, Poznámka, Video, Do selhání, Supersérie.
struct GymDay: Decodable, Equatable {
    let date: String?
    var values: [[JSONValue]]
    let cancelled: Bool?

    static let columns = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video", "Do selhání", "Supersérie"]
    static let firstSetRow = 7

    var planName: String? {
        guard values.count > 2, values[2].count > 3 else { return nil }
        return values[2][3].string
    }

    var note: String? {
        guard values.count > 3, values[3].count > 1 else { return nil }
        return values[3][1].string
    }

    /// The sets grouped by exercise, in the plan's order.
    var exercises: [GymExercise] {
        var out: [GymExercise] = []
        for index in values.indices where index >= Self.firstSetRow {
            let row = values[index]
            guard let name = cell(row, 1), !name.isEmpty else { continue }
            let set = GymSet(row: index,
                             warmup: (cell(row, 0) ?? "WORK").uppercased() == "WARMUP",
                             number: cell(row, 2) ?? "",
                             plannedKg: cell(row, 3),
                             plannedReps: cell(row, 4),
                             kg: cell(row, 5),
                             reps: cell(row, 6),
                             rpe: cell(row, 7),
                             done: Self.isDone(cell(row, 8)),
                             note: cell(row, 9))
            if let last = out.indices.last, out[last].name == name {
                out[last].sets.append(set)
            } else {
                out.append(GymExercise(name: name, superset: cell(row, 12), sets: [set]))
            }
        }
        return out
    }

    static func isDone(_ value: String?) -> Bool {
        ["TRUE", "1", "ANO", "✓", "☑", "YES"].contains((value ?? "").uppercased())
    }

    private func cell(_ row: [JSONValue], _ column: Int) -> String? {
        column < row.count ? row[column].string : nil
    }

    /// Writes a value into a cell, growing the row as needed.
    mutating func set(row: Int, column: Int, _ value: String) {
        guard row < values.count else { return }
        while values[row].count <= column { values[row].append(.string("")) }
        values[row][column] = .string(value)
    }

    /// Records a set as the web does (dashboard-client.js saveGymSet).
    mutating func complete(row: Int, kg: String, reps: String, rpe: String) {
        set(row: row, column: 5, kg)
        set(row: row, column: 6, reps)
        set(row: row, column: 7, rpe)
        set(row: row, column: 8, "TRUE")
        set(row: row, column: 11, rpe == "10" ? "TRUE" : "FALSE")
    }

    mutating func undo(row: Int) {
        set(row: row, column: 8, "FALSE")
    }

    /// Swaps an exercise for another in the sets not done yet.
    mutating func replace(exercise: String, with name: String) {
        for index in values.indices where index >= Self.firstSetRow {
            guard values[index].count > 1, values[index][1].string == exercise else { continue }
            if values[index].count > 8, Self.isDone(values[index][8].string) { continue }
            values[index][1] = .string(name)
            set(row: index, column: 3, "")
        }
    }

    // MARK: Editing the plan (Režim tréninku → Upravit plán)

    /// The rows of each exercise in the plan's order, and the empty rows after them.
    private var blocks: (exercises: [[[JSONValue]]], rest: [[JSONValue]]) {
        var out: [[[JSONValue]]] = [], rest: [[JSONValue]] = [], last: String?
        for index in values.indices where index >= Self.firstSetRow {
            let row = values[index]
            guard let name = cell(row, 1), !name.isEmpty else { rest.append(row); continue }
            if name == last, !out.isEmpty { out[out.count - 1].append(row) } else { out.append([row]) }
            last = name
        }
        return (out, rest)
    }

    private mutating func write(_ exercises: [[[JSONValue]]], _ rest: [[JSONValue]]) {
        var head = Array(values.prefix(Self.firstSetRow))
        while head.count < Self.firstSetRow { head.append([]) }
        values = head + exercises.flatMap { $0 } + rest
    }

    /// Moves an exercise with all its sets, as List.onMove reports it.
    mutating func moveExercise(from source: Int, to destination: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(source) else { return }
        let block = list.remove(at: source)
        list.insert(block, at: min(max(0, destination > source ? destination - 1 : destination), list.count))
        write(list, rest)
    }

    /// Takes an exercise out of the plan. Sets already done stay recorded.
    mutating func removeExercise(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset) else { return }
        let kept = list[offset].filter { Self.isDone(cell($0, 8)) }
        if kept.isEmpty { list.remove(at: offset) } else { list[offset] = kept }
        write(list, rest)
    }

    /// One more set like the last one of the exercise.
    mutating func addSet(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset), var row = list[offset].last(where: { (cell($0, 0) ?? "WORK").uppercased() != "WARMUP" }) ?? list[offset].last else { return }
        while row.count < Self.columns.count { row.append(.string("")) }
        let work = list[offset].filter { (cell($0, 0) ?? "WORK").uppercased() != "WARMUP" }.count
        row[0] = .string("WORK")
        row[2] = .string(String(work + 1))
        for column in [5, 6, 7] { row[column] = .string("") }
        row[8] = .string("FALSE")
        row[11] = .string("FALSE")
        list[offset].append(row)
        write(list, rest)
    }

    /// One set fewer: the last one not done yet.
    mutating func removeSet(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset), let last = list[offset].lastIndex(where: { !Self.isDone(cell($0, 8)) }) else { return }
        guard list[offset].count > 1 else { removeExercise(at: offset); return }
        list[offset].remove(at: last)
        write(list, rest)
    }

    /// Adds an exercise at the end: its work sets with the planned reps.
    mutating func addExercise(_ name: String, sets: Int, reps: String, kg: String = "") {
        var (list, rest) = blocks
        list.append((1...max(1, min(sets, 10))).map { n in
            ["WORK", name, String(n), kg, reps, "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        })
        write(list, rest)
    }

    /// The body of POST /app/api/gym: the sets and the whole sheet.
    var saveBody: JSONObject {
        var full = values
        if full.count > 6, full[6].count < Self.columns.count { full[6] = Self.columns.map { .string($0) } }
        while let last = full.last, full.count > Self.firstSetRow, last.allSatisfy({ $0.string == nil }) { full.removeLast() }
        let rows = Array(full.dropFirst(Self.firstSetRow))
        return ["values": .array(rows.map { .array($0) }), "fullValues": .array(full.map { .array($0) })]
    }
}

struct GymExercise: Equatable, Identifiable {
    let name: String
    let superset: String?
    var sets: [GymSet]
    var id: String { name + "|" + String(sets.first?.row ?? 0) }
    var doneCount: Int { sets.filter { $0.done && !$0.warmup }.count }
    var workCount: Int { sets.filter { !$0.warmup }.count }
}

struct GymSet: Equatable, Identifiable {
    let row: Int
    let warmup: Bool
    let number: String
    let plannedKg: String?
    let plannedReps: String?
    let kg: String?
    let reps: String?
    let rpe: String?
    let done: Bool
    let note: String?
    var id: Int { row }
}

struct GymTechnique: Decodable, Equatable {
    let exercise: String?
    let muscles: [String]?
    let note: String?
    let setup: [String]?
    let steps: [String]?
    let mistakes: [String]?
    let breathing: String?
    let feel: [String]?
    let video: Video?
    let searchUrl: String?

    struct Video: Decodable, Equatable {
        let id: String?
        let title: String?
    }
}

struct GymAlternative: Decodable, Equatable, Identifiable {
    let name: String
    let muscle: String?
    let sets: JSONValue?
    let reps: JSONValue?
    let note: String?
    let station: String?
    var id: String { name }
}

// MARK: - Activity detail (GET /app/api/activity-detail, src/activity-detail.js)

struct ActivityDetail: Decodable, Equatable {
    let activity: Activity
    let analysis: Analysis?
    let streams: [Stream]?
    let intervals: [Lap]?
    let hrr: HeartRateRecovery?

    struct Activity: Decodable, Equatable {
        let name: String?
        let type: String?
        let distance: Double?
        let moving_time: Double?
        let total_elevation_gain: Double?
        let average_watts: Double?
        let icu_normalized_watts: Double?
        let average_heartrate: Double?
        let max_heartrate: Double?
        let average_cadence: Double?
        let icu_training_load: Double?
        let icu_intensity: Double?
        let average_speed: Double?
        let calories: Double?
        let icu_rpe: Double?
    }

    struct Zone: Decodable, Equatable {
        let zone: JSONValue?
        let seconds: Double?
        let percent: Double?
    }

    struct Analysis: Decodable, Equatable {
        let variability: Double?
        let aerobicDrift: Double?
        let zones: [Zone]?
    }

    struct StreamPoint: Decodable, Equatable {
        let t: Double
        let v: Double?
    }

    struct Stream: Decodable, Equatable {
        let type: String
        let points: [StreamPoint]
    }

    struct Lap: Decodable, Equatable {
        let label: String?
        let type: String?
        let seconds: Double?
        let watts: Double?
        let hr: Double?
        let speed: Double?
        let distance: Double?
    }

    struct HeartRateRecovery: Decodable, Equatable {
        let peak: Double?
        let after: Double?
        let drop: Double?
        let seconds: Double?
    }

    func stream(_ type: String) -> [Double] {
        (streams?.first { $0.type == type }?.points ?? []).compactMap(\.v)
    }
}

// MARK: - Planned workout (GET /app/api/workouts/planned)

struct PlannedWorkout: Decodable, Equatable {
    let source: String?
    let workout: Workout

    struct Step: Decodable, Equatable {
        let durationSeconds: Double?
        let percentLow: Double?
        let percentHigh: Double?
        let wattsLow: Double?
        let wattsHigh: Double?
        let paceSlow: Double?
        let paceFast: Double?
        let cadence: JSONValue?
        let note: String?

        enum CodingKeys: String, CodingKey {
            case durationSeconds, percentLow, percentHigh, wattsLow, wattsHigh, paceSlow, paceFast, cadence, note
        }

        /// Lenient: the library sends paces as "4:35" text, the plan as seconds.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let value = { (key: CodingKeys) in (try? c.decodeIfPresent(JSONValue.self, forKey: key)) ?? nil }
            let pace = { (key: CodingKeys) -> Double? in
                if case .string(let t) = value(key) {
                    let parts = t.split(separator: ":").compactMap { Double($0) }
                    return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
                }
                return value(key)?.number
            }
            durationSeconds = value(.durationSeconds)?.number
            percentLow = value(.percentLow)?.number
            percentHigh = value(.percentHigh)?.number
            wattsLow = value(.wattsLow)?.number
            wattsHigh = value(.wattsHigh)?.number
            paceSlow = pace(.paceSlow)
            paceFast = pace(.paceFast)
            cadence = value(.cadence)
            note = value(.note)?.string
        }
    }

    struct Block: Decodable, Equatable {
        let repeats: Int?
        let note: String?
        let steps: [Step]?
    }

    struct Workout: Decodable, Equatable {
        let name: String?
        let sport: String?
        let environment: String?
        let duration_minutes: Double?
        let target_load: Double?
        let intensity_factor: Double?
        let description: String?
        let steps: [Block]?
    }
}
