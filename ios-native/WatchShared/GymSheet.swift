import Foundation

// The day's gym sheet (GET/POST /app/api/gym, src/gym-plan-store.js), shared
// by the iPhone and the Apple Watch: the watch works on the same sheet with
// the same changes when the iPhone is out of reach (AurinWatch/GymStore.swift).
// The parts only the iPhone uses are extensions in Aurin/Data.

/// The stored gym plan: a sheet of rows. Rows 0–6 are the header (row 2 holds
/// the plan name in column 3), sets start at row 7 with the columns
/// Typ, Cvik, Série, Plán kg, Plán reps, Skutečně kg, Skutečně reps, RPE,
/// Hotovo, Poznámka, Video, Do selhání, Supersérie, Strana (L or P of a
/// one-sided exercise, GymSides.swift), Intenzita (W T E M H F PR D,
/// GymIntensity.swift). Typ DROP is a drop set: lighter, straight after the
/// set above it, no rest.
struct GymDay: Decodable, Equatable {
    let date: String?
    var values: [[JSONValue]]
    let cancelled: Bool?
    /// "partial": the server couldn't read the day (src/routes-gym.js), not an empty one.
    var status: String? = nil

    static let columns = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video", "Do selhání", "Supersérie", "Strana", "Intenzita"]
    static let firstSetRow = 7

    var planName: String? {
        guard values.count > 2, values[2].count > 3 else { return nil }
        return values[2][3].string
    }

    var note: String? {
        guard values.count > 3, values[3].count > 1 else { return nil }
        return values[3][1].string
    }

    /// The length chosen for the lifting (header row 4, "Časový limit (min)"); the routines come on top.
    var plannedMinutes: Int? {
        guard values.count > 4, values[4].count > 1, values[4][0].string == "Časový limit (min)" else { return nil }
        return values[4][1].number.map { Int($0) } ?? values[4][1].string.flatMap { Int($0) }
    }

    /// The sets grouped by exercise, in the plan's order.
    var exercises: [GymExercise] {
        var out: [GymExercise] = []
        for index in values.indices where index >= Self.firstSetRow {
            let row = values[index]
            guard let name = cell(row, 1), !name.isEmpty else { continue }
            let type = (cell(row, 0) ?? "WORK").uppercased()
            let set = GymSet(row: index,
                             warmup: type == "WARMUP",
                             number: cell(row, 2) ?? "",
                             plannedKg: cell(row, 3),
                             plannedReps: cell(row, 4),
                             kg: cell(row, 5),
                             reps: cell(row, 6),
                             rpe: cell(row, 7),
                             done: Self.isDone(cell(row, 8)),
                             note: cell(row, 9),
                             side: cell(row, 13).flatMap { $0 == "L" || $0 == "P" ? $0 : nil },
                             drop: type == "DROP",
                             intensity: GymIntensity.letter(cell(row, 14)))
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

    /// Records a set as the web does (dashboard-client.js saveGymSet). The
    /// letter: the one given, else from the RPE given, else the plan's; its
    /// RPE goes to the RPE column when none was given.
    /// The drop sets after it follow the weight it was done with (followDrops),
    /// but for those whose weight was typed in ahead (keepDrops).
    mutating func complete(row: Int, kg: String, reps: String, rpe: String, intensity: String? = nil, keepDrops: Set<Int> = []) {
        guard row < values.count else { return }
        let was = Self.isDone(cell(values[row], 8)) ? cell(values[row], 5) : cell(values[row], 3)
        followDrops(after: row, from: was, to: kg, keep: keepDrops)
        let letter = GymIntensity.letter(intensity) ?? (rpe.isEmpty ? GymIntensity.letter(cell(values[row], 14)) : GymIntensity.from(rpe: rpe))
        let effort = rpe.isEmpty ? (letter.flatMap(GymIntensity.rpe) ?? "") : rpe
        set(row: row, column: 5, kg)
        set(row: row, column: 6, reps)
        set(row: row, column: 7, effort)
        set(row: row, column: 8, "TRUE")
        set(row: row, column: 11, (letter.map { $0 == "F" } ?? (effort == "10")) ? "TRUE" : "FALSE")
        if let letter { set(row: row, column: 14, letter) }
    }

    /// The letter of a set; W makes a work set a warm-up. A done set's RPE
    /// and failure follow it.
    mutating func setIntensity(row: Int, _ letter: String) {
        guard row < values.count, let letter = GymIntensity.letter(letter) else { return }
        set(row: row, column: 14, letter)
        let type = (cell(values[row], 0) ?? "WORK").uppercased()
        if letter == "W", type == "WORK" { set(row: row, column: 0, "WARMUP") }
        if letter != "W", type == "WARMUP" { set(row: row, column: 0, "WORK") }
        guard Self.isDone(cell(values[row], 8)) else { return }
        set(row: row, column: 7, GymIntensity.rpe(letter) ?? "")
        set(row: row, column: 11, letter == "F" ? "TRUE" : "FALSE")
    }

    /// D on a set: a drop set row after it (and after its drop sets so far),
    /// about a fifth lighter than the row before, reps as many as clean. The
    /// set it follows goes to failure. Returns the new row.
    @discardableResult
    mutating func addDrop(after row: Int) -> Int? {
        guard row >= Self.firstSetRow, row < values.count, let name = cell(values[row], 1) else { return nil }
        var at = row
        while at + 1 < values.count, cell(values[at + 1], 1) == name, (cell(values[at + 1], 0) ?? "").uppercased() == "DROP" { at += 1 }
        let before = values[at]
        let kg = cell(before, 5)?.nilIfBlank ?? cell(before, 3)
        var drop = ["DROP", name, cell(values[row], 2) ?? "", GymIntensity.dropKg(kg), "max", "", "", "", "FALSE", "", "", "FALSE", "", cell(values[row], 13) ?? "", "D"].map { JSONValue.string($0) }
        while drop.count < Self.columns.count { drop.append(.string("")) }
        if (cell(values[row], 0) ?? "WORK").uppercased() == "WORK" { setIntensity(row: row, "F") }
        values.insert(drop, at: at + 1)
        return at + 1
    }

    /// Takes a drop set row out (not done yet).
    mutating func removeDrop(row: Int) {
        guard row >= Self.firstSetRow, row < values.count, (cell(values[row], 0) ?? "").uppercased() == "DROP", !Self.isDone(cell(values[row], 8)) else { return }
        values.remove(at: row)
    }

    mutating func undo(row: Int, keepDrops: Set<Int> = []) {
        guard row < values.count else { return }
        if Self.isDone(cell(values[row], 8)) { followDrops(after: row, from: cell(values[row], 5), to: cell(values[row], 3), keep: keepDrops) }
        set(row: row, column: 8, "FALSE")
    }

    /// A set done heavier or lighter than before (its plan, or as first
    /// ticked): the drop sets straight after it, not done yet, take the same
    /// share (35 kg done at 31.75 takes the 27.5 kg drop to 25), to 0.5 kg.
    /// Those in `keep` (typed in ahead) stay as they are.
    mutating func followDrops(after row: Int, from old: String?, to new: String?, keep: Set<Int> = []) {
        guard row < values.count, let name = cell(values[row], 1),
              let old = old.flatMap(Self.number), old > 0, let new = new.flatMap(Self.number), new > 0, abs(new - old) >= 0.01 else { return }
        var at = row + 1
        while at < values.count, cell(values[at], 1) == name, (cell(values[at], 0) ?? "").uppercased() == "DROP" {
            if !Self.isDone(cell(values[at], 8)), !keep.contains(at), let kg = cell(values[at], 3).flatMap(Self.number), kg > 0 {
                set(row: at, column: 3, Self.kgText((kg * new / old * 2).rounded() / 2))
            }
            at += 1
        }
    }

    /// Swaps an exercise for another in the sets not done yet.
    /// With kg (the load estimated for the new exercise) its sets take it;
    /// a drop set a fifth less than the row before it (as D adds one), a
    /// warm-up its step of the ramp (warmupKg(work:number:of:)).
    mutating func replace(exercise: String, with name: String, kg: String? = nil) {
        var before = kg ?? ""
        let open = values.indices.filter { $0 >= Self.firstSetRow && values[$0].count > 1 && values[$0][1].string == exercise
            && !(values[$0].count > 8 && Self.isDone(values[$0][8].string)) }
        let warmups = Set(open.filter { Self.isWarmupRow(values[$0]) }.map { cell(values[$0], 2) ?? "" }).count
        for index in open {
            values[index][1] = .string(name)
            let type = (cell(values[index], 0) ?? "").uppercased()
            if type == "DROP" {
                before = GymIntensity.dropKg(before)
                set(row: index, column: 3, before)
            } else {
                before = kg ?? ""
                set(row: index, column: 3, type == "WARMUP" ? Self.warmupKg(work: kg, number: cell(values[index], 2), of: warmups) : before)
            }
        }
    }

    /// A warm-up's weight from the work weight, as the generator ramps it
    /// (src/strength-generator.js warmupRows): of three sets 40, 65 and 80 %,
    /// a single one 65 %. Empty without a work weight.
    static func warmupKg(work: String?, number: String?, of count: Int) -> String {
        guard let kg = Self.number(work ?? ""), kg > 0 else { return "" }
        let ramp = count == 1 ? [0.65] : [0.4, 0.65, 0.8]
        let step = min(max((Int(number ?? "") ?? 1) - 1, 0), ramp.count - 1)
        return warmupKg(kg * ramp[step])
    }

    // MARK: Editing the plan (Režim tréninku → Upravit plán)

    /// The rows of each exercise in the plan's order, and the empty rows after them.
    var blocks: (exercises: [[[JSONValue]]], rest: [[JSONValue]]) {
        var out: [[[JSONValue]]] = [], rest: [[JSONValue]] = [], last: String?
        for index in values.indices where index >= Self.firstSetRow {
            let row = values[index]
            guard let name = cell(row, 1), !name.isEmpty else { rest.append(row); continue }
            if name == last, !out.isEmpty { out[out.count - 1].append(row) } else { out.append([row]) }
            last = name
        }
        return (out, rest)
    }

    mutating func write(_ exercises: [[[JSONValue]]], _ rest: [[JSONValue]]) {
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
        balanceWarmups()
    }

    /// Takes an exercise out of the plan. Sets already done stay recorded.
    mutating func removeExercise(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset) else { return }
        let kept = list[offset].filter { Self.isDone(cell($0, 8)) }
        if kept.isEmpty { list.remove(at: offset) } else { list[offset] = kept }
        write(list, rest)
    }

    private func sided(_ rows: [[JSONValue]]) -> Bool {
        rows.contains { ["L", "P"].contains(cell($0, 13) ?? "") }
    }

    /// One more set like the last one of the exercise (by sides: an L and a P).
    mutating func addSet(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset), var row = list[offset].last(where: { (cell($0, 0) ?? "WORK").uppercased() == "WORK" }) ?? list[offset].last else { return }
        while row.count < Self.columns.count { row.append(.string("")) }
        let work = Set(list[offset].filter { (cell($0, 0) ?? "WORK").uppercased() == "WORK" }.compactMap { cell($0, 2) }).count
        row[0] = .string("WORK")
        row[2] = .string(String(work + 1))
        for column in [5, 6, 7] { row[column] = .string("") }
        row[8] = .string("FALSE")
        row[11] = .string("FALSE")
        // The plan's letter of the set it copies, not what was chosen in it.
        if GymIntensity.letter(cell(row, 14)) == "F" || GymIntensity.letter(cell(row, 14)) == "PR" { row[14] = .string("H") }
        if sided(list[offset]) {
            row[13] = .string("L"); list[offset].append(row)
            row[13] = .string("P"); list[offset].append(row)
        } else {
            list[offset].append(row)
        }
        write(list, rest)
    }

    /// One set fewer: the last one not done yet (by sides: both of its rows).
    mutating func removeSet(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset), let last = list[offset].lastIndex(where: { !Self.isDone(cell($0, 8)) }) else { return }
        let number = cell(list[offset][last], 2)
        let drop = sided(list[offset])
            ? list[offset].indices.filter { cell(list[offset][$0], 2) == number && !Self.isDone(cell(list[offset][$0], 8)) && (cell(list[offset][$0], 0) ?? "WORK").uppercased() != "WARMUP" }
            : [last]
        // Warm-ups alone are no exercise: with the last set the exercise goes.
        let left = list[offset].indices.filter { !drop.contains($0) }
        guard left.contains(where: { !Self.isWarmupRow(list[offset][$0]) }) else { removeExercise(at: offset); return }
        for i in drop.reversed() { list[offset].remove(at: i) }
        write(list, rest)
    }

    /// A set taken out by its row (swiped away), done or not, by sides both of
    /// its rows, with the drop sets right after it; the sets of the exercise
    /// are numbered again (a drop set keeps the number of the set above). The
    /// last set gone, the exercise leaves the plan with its warm-ups not done
    /// yet. Returns the rows taken out, as they were numbered before.
    @discardableResult
    mutating func deleteSet(row: Int) -> [Int] {
        guard row >= Self.firstSetRow, row < values.count,
              let name = cell(values[row], 1), !name.isEmpty else { return [] }
        var start = row, end = row
        while start - 1 >= Self.firstSetRow, cell(values[start - 1], 1) == name { start -= 1 }
        while end + 1 < values.count, cell(values[end + 1], 1) == name { end += 1 }
        var drop = [row]
        let type = Self.rowType(values[row])
        // By sides the other side's row of the set (or warm-up) goes along.
        if type != "DROP", ["L", "P"].contains(cell(values[row], 13) ?? "") {
            let number = cell(values[row], 2)
            drop += (start...end).filter { $0 != row && Self.rowType(values[$0]) == type && cell(values[$0], 2) == number }
        }
        if type == "WORK" {
            // Its drop sets go with it.
            for at in drop.sorted() {
                var next = at + 1
                while next <= end, Self.rowType(values[next]) == "DROP" { drop.append(next); next += 1 }
            }
        }
        // No set left but warm-ups: those not done go too.
        if !(start...end).contains(where: { !drop.contains($0) && !Self.isWarmupRow(values[$0]) }) {
            drop += (start...end).filter { Self.isWarmupRow(values[$0]) && !Self.isDone(cell(values[$0], 8)) }
        }
        drop = Array(Set(drop)).sorted()
        for i in drop.reversed() { values.remove(at: i) }
        end -= drop.count
        guard end >= start else { return drop }
        var warmups = 0, work = 0, last: String?, lastWarmup: String?
        for i in start...end {
            switch Self.rowType(values[i]) {
            case "WARMUP":
                // By sides an L and a P row share a number.
                let number = cell(values[i], 2)
                if number != lastWarmup || lastWarmup == nil || (cell(values[i], 13) ?? "") != "P" { warmups += 1 }
                lastWarmup = number
                set(row: i, column: 2, String(warmups))
            case "DROP":
                set(row: i, column: 2, String(max(work, 1)))
            default:
                let number = cell(values[i], 2)
                if number != last || last == nil { work += 1 }
                last = number
                set(row: i, column: 2, String(work))
            }
        }
        return drop
    }

    /// The warm-up sets follow the order (src/strength-generator.js
    /// warmupRows): of the exercises that have them, the first gets three
    /// ramp-up sets (40, 65 and 80 % of its weight), every later one a single
    /// set at 65 %. An exercise whose warm-up has begun keeps it as it is.
    mutating func balanceWarmups() {
        var (list, rest) = blocks
        let main = list.indices.filter { list[$0].contains(where: Self.isWarmupRow) }
        guard !main.isEmpty else { return }
        for (position, i) in main.enumerated() {
            let warms = list[i].filter(Self.isWarmupRow)
            let ramp: [(Double, String)] = position == 0 ? [(0.4, "8"), (0.65, "5"), (0.8, "3")] : [(0.65, "5")]
            // An exercise done by sides warms up both: each step an L and a P row.
            let sides = warms.contains { !(cell($0, 13) ?? "").isEmpty } ? ["L", "P"] : [""]
            guard warms.count != ramp.count * sides.count, !warms.contains(where: { Self.isDone(cell($0, 8)) }),
                  let work = list[i].first(where: { !Self.isWarmupRow($0) }), let kg = Self.number(cell(work, 3) ?? "") else { continue }
            var template = warms[0]
            while template.count < Self.columns.count { template.append(.string("")) }
            let rows: [[JSONValue]] = ramp.enumerated().flatMap { n, step in
                sides.map { side in
                    var row = template
                    row[2] = .string(String(n + 1))
                    row[3] = .string(Self.warmupKg(kg * step.0))
                    row[4] = .string(step.1)
                    for column in [5, 6, 7] { row[column] = .string("") }
                    row[8] = .string("FALSE")
                    row[11] = .string("FALSE")
                    row[13] = .string(side)
                    if n > 0 { row[10] = .string("") }
                    return row
                }
            }
            list[i] = rows + list[i].filter { !Self.isWarmupRow($0) }
        }
        write(list, rest)
    }

    static func isWarmupRow(_ row: [JSONValue]) -> Bool { rowType(row) == "WARMUP" }

    /// WORK, WARMUP or DROP.
    static func rowType(_ row: [JSONValue]) -> String { (row.first?.string ?? "WORK").uppercased() }

    /// A warm-up weight: at least 2 kg, to whole kilos under 20 kg, else to 2.5 kg.
    static func warmupKg(_ kg: Double) -> String {
        let value = max(2, kg < 20 ? kg.rounded() : (kg / 2.5).rounded() * 2.5)
        return value.rounded() == value ? String(Int(value)) : String(value).replacingOccurrences(of: ".", with: ",")
    }

    /// "Každá strana zvlášť": the sets not done yet (warm-ups too) become an
    /// L and a P row each; back to "Obě strany najednou" keeps one row per
    /// set. Done sets stay as they were logged.
    mutating func setSides(at offset: Int, _ on: Bool) {
        var (list, rest) = blocks
        guard list.indices.contains(offset) else { return }
        var out: [[JSONValue]] = []
        for var row in list[offset] {
            while row.count < Self.columns.count { row.append(.string("")) }
            let side = cell(row, 13) ?? ""
            guard !Self.isDone(cell(row, 8)) else { out.append(row); continue }
            if on, side.isEmpty {
                row[13] = .string("L"); out.append(row)
                row[13] = .string("P"); out.append(row)
            } else if !on, !side.isEmpty {
                // The L row stands for the set; the P row goes.
                if side == "L" || !out.contains(where: { Self.rowType($0) == Self.rowType(row) && cell($0, 2) == cell(row, 2) && !Self.isDone(cell($0, 8)) }) {
                    row[13] = .string(""); out.append(row)
                }
            } else {
                out.append(row)
            }
        }
        list[offset] = out
        write(list, rest)
    }

    /// Adds an exercise at the end: its work sets with the planned reps.
    /// sides: by sides (L and P rows), as last time or by its name.
    mutating func addExercise(_ name: String, sets: Int, reps: String, kg: String = "", sides: Bool = false) {
        var (list, rest) = blocks
        list.append((1...max(1, min(sets, 10))).flatMap { n in
            (sides ? ["L", "P"] : [""]).map { side in
                ["WORK", name, String(n), kg, reps, "", "", "", "FALSE", "", "", "FALSE", "", side].map { JSONValue.string($0) }
            }
        })
        write(list, rest)
    }

    /// The sheet the watch wrote alone, with the sets this copy has done that
    /// the watch's has not: a set ticked on the iPhone while the watch thought
    /// it was out of reach (a message that timed out) is not lost when the
    /// iPhone takes the watch's sheet. Only a row of the same exercise and kind
    /// at the same place is taken; anything the watch changed stays the watch's.
    static func merged(_ watch: [[JSONValue]], keepingDoneFrom phone: [[JSONValue]]) -> [[JSONValue]] {
        var out = watch
        for row in out.indices where row >= firstSetRow && row < phone.count {
            let mine = phone[row], theirs = out[row]
            guard mine.count > 8, theirs.count > 1, rowType(mine) == rowType(theirs), mine[1] == theirs[1],
                  isDone(mine[8].string), !(theirs.count > 8 && isDone(theirs[8].string)) else { continue }
            out[row] = mine
        }
        return out
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
    /// By sides a set is its L and P rows together.
    var doneCount: Int {
        let work = sets.filter(\.work)
        guard bySides else { return work.filter(\.done).count }
        return Set(work.map(\.number)).filter { n in work.filter { $0.number == n }.allSatisfy(\.done) }.count
    }
    var workCount: Int {
        let work = sets.filter(\.work)
        return bySides ? Set(work.map(\.number)).count : work.count
    }
    /// Done by sides (L and P rows).
    var bySides: Bool { sets.contains { $0.side != nil } }
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
    /// "L" or "P" on a one-sided exercise done by sides.
    var side: String? = nil
    /// A drop set (Typ DROP): lighter, straight after the set above it.
    var drop = false
    /// W T E M H F PR D (GymIntensity.swift): the plan's, or as it was done.
    var intensity: String? = nil
    var id: Int { row }
    /// A work set: not a warm-up nor a drop set (counts, progression, history).
    var work: Bool { !warmup && !drop }
    /// Which set the weight and reps fields are for. The row alone is not
    /// enough: a set swiped away or a drop set added moves the rows after it,
    /// so the next exercise's first set (or the new drop set) can take the
    /// row of the set at hand, and its fields kept the old weight.
    func fieldKey(in exercise: String) -> String { "\(exercise)|\(row)|\(number)|\(side ?? "")|\(drop)" }
    /// The rest the plan gives after this set, "[Pauza 150 s]" in its note
    /// (src/strength-timing.js: by the kind of exercise and the gym goal).
    var plannedRest: Int? {
        guard let note, let range = note.range(of: #"\[Pauza (\d+) s\]"#, options: .regularExpression) else { return nil }
        return Int(note[range].filter(\.isNumber))
    }
}


// MARK: - Times of a logged workout (header row 5)

extension GymDay {
    /// Row 5 of the header: "Odcvičeno", start and end (ISO 8601).
    static let timeRow = 5

    // ISO8601DateFormatter is thread-safe.
    nonisolated(unsafe) private static let iso: ISO8601DateFormatter = ISO8601DateFormatter()

    func text(_ row: Int, _ column: Int) -> String? {
        guard row < values.count, column < values[row].count else { return nil }
        return values[row][column].string
    }

    /// The row is also where a generated plan keeps its warm-up and
    /// stretching ("Rozcvička a protažení", JSON; src/stretching.js): the
    /// times then go after them, so they stay.
    private var timeColumn: Int { text(Self.timeRow, 0) == "Rozcvička a protažení" ? 2 : 0 }

    var startedAt: Date? { text(Self.timeRow, timeColumn + 1).flatMap { Self.iso.date(from: $0) } }
    var finishedAt: Date? { text(Self.timeRow, timeColumn + 2).flatMap { Self.iso.date(from: $0) } }

    mutating func markStarted(_ date: Date) {
        guard values.count > Self.timeRow else { return }
        let base = timeColumn
        if base == 0 { set(row: Self.timeRow, column: 0, "Odcvičeno") }
        set(row: Self.timeRow, column: base + 1, Self.iso.string(from: date))
    }

    mutating func markFinished(_ date: Date) {
        guard values.count > Self.timeRow else { return }
        let base = timeColumn
        if base == 0 { set(row: Self.timeRow, column: 0, "Odcvičeno") }
        set(row: Self.timeRow, column: base + 2, Self.iso.string(from: date))
    }

    /// Pokračovat v tréninku: the workout is under way again.
    mutating func clearFinished() {
        guard values.count > Self.timeRow else { return }
        set(row: Self.timeRow, column: timeColumn + 2, "")
    }
}

extension GymDay {
    /// A number of the sheet: "62,5" or "62.5".
    static func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    /// The sheet's kg text: "85", "82.5".
    static func kgText(_ kg: Double) -> String {
        let r = (kg * 100).rounded() / 100
        return r.rounded() == r ? String(Int(r)) : String(r)
    }

    /// The leading whole number: "8" of "8-12".
    static func firstNumber(_ text: String?) -> Int? {
        guard let text else { return nil }
        let digits = text.trimmingCharacters(in: .whitespaces).prefix { $0.isNumber }
        return digits.isEmpty ? nil : Int(String(digits))
    }
}

extension GymSet {
    /// The rest after the set: the length chosen in Nastavení → Pauzy
    /// (`setting`, GymRestSettingsView.byExercise for the plan's), else the plan's.
    func rest(setting: Int) -> Int {
        setting >= 0 ? setting : plannedRest ?? 90
    }
}

extension String {
    var nilIfBlank: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self }
}

/// How hard a set is meant to be or was, as one letter (column 14 of the gym
/// sheet, src/gym-intensity.js). The letters are the same in every language;
/// the names and colours under them are in Aurin/Data/GymIntensity.swift.
enum GymIntensity {
    static let letters = ["W", "T", "E", "M", "H", "F", "PR", "D"]

    /// The letter in a cell, or nil.
    static func letter(_ value: String?) -> String? {
        let v = (value ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        return letters.contains(v) ? v : nil
    }

    /// The RPE the letter is saved as for the next weights (src/gym-intensity.js).
    static func rpe(_ letter: String) -> String? {
        ["T": "5", "E": "6", "M": "7.5", "H": "9", "F": "10", "PR": "9", "D": "10"][letter]
    }

    /// A set saved before the letters ("Jak to šlo?", RPE 6–10).
    static func from(rpe: String?) -> String? {
        guard let n = GymDay.number(rpe ?? ""), n > 0 else { return nil }
        return n >= 10 ? "F" : n >= 8 ? "H" : n >= 7 ? "M" : n >= 6 ? "E" : "T"
    }

    /// A drop set's weight: about a fifth lighter, to the half kilo.
    static func dropKg(_ kg: String?) -> String {
        guard let value = GymDay.number(kg ?? ""), value > 0 else { return "" }
        let drop = (value * 0.8 * 2).rounded() / 2
        return drop.rounded() == drop ? String(Int(drop)) : String(drop)
    }
}

/// An exercise's name as the app shows it.
enum ExerciseName {
    /// A catalog name as a sentence: "Cable Single Arm Rear Delt Row" from the
    /// exercise database reads "Cable single arm rear delt row", like "Face
    /// pull". Names already written so, letters (EZ, DB, V) and digits stay.
    static func shown(_ name: String) -> String {
        let words = name.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        let titled = words.dropFirst().filter { $0.first?.isLetter == true }
        guard titled.count >= 2, titled.allSatisfy({ $0.first?.isUppercase == true }) else { return name }
        // "Single-Arm" as a part of a word too: "Single-arm cable fly".
        let lower: (String) -> String = { part in
            part.count > 1 && part.dropFirst().allSatisfy({ !$0.isUppercase && !$0.isNumber }) ? part.lowercased() : part
        }
        return words.enumerated().map { index, word in
            word.split(separator: "-", omittingEmptySubsequences: false).enumerated().map { at, part in
                index == 0 && at == 0 ? String(part) : lower(String(part))
            }.joined(separator: "-")
        }.joined(separator: " ")
    }
}

// MARK: - The sheet for the watch, and what the watch does to it

extension WatchGym {
    /// The day's plan as the watch works on it, with the sheet itself so the
    /// watch can go on without the iPhone. restSets: Nastavení → Pauzy between
    /// sets (GymRestSettingsView.byExercise for the plan's), restExercises: before the next exercise.
    init(_ day: GymDay, date: String, restSets: Int, restExercises: Int) {
        let exercises = day.exercises.map { exercise -> WatchGym.Exercise in
            let lifts = exercise.sets.map { set in
                WatchGym.Lift(row: set.row, number: set.number, warmup: set.warmup, drop: set.drop, side: set.side,
                              kg: set.kg.flatMap(GymDay.number) ?? set.plannedKg.flatMap(GymDay.number),
                              reps: GymDay.firstNumber(set.reps) ?? GymDay.firstNumber(set.plannedReps),
                              plannedReps: set.plannedReps, done: set.done,
                              rest: set.warmup ? 60 : set.rest(setting: restSets),
                              intensity: GymIntensity.letter(set.intensity),
                              plannedKg: set.plannedKg.flatMap(GymDay.number))
            }
            let shown = ExerciseName.shown(exercise.name)
            let letter = (exercise.superset ?? "").trimmingCharacters(in: .whitespaces).uppercased()
            let set = exercise.sets.first { !$0.done && $0.work } ?? exercise.sets.first { !$0.done }
            return WatchGym.Exercise(name: exercise.name, shown: shown == exercise.name ? nil : shown, lifts: lifts,
                                     superset: letter.isEmpty ? nil : letter, rest: set?.plannedRest)
        }
        self.init(date: date, title: day.planName, minutes: day.plannedMinutes, restExercises: restExercises,
                  exercises: day.cancelled == true ? [] : exercises, sheet: day.values)
    }
}

extension GymDay {
    /// A set done on the watch, as a set ticked in Training mode: its start
    /// marks the workout's start when nothing did yet.
    mutating func apply(_ done: WatchGym.Done, start: Date) {
        complete(row: done.row, kg: Self.kgText(done.kg), reps: String(done.reps), rpe: "")
        if startedAt == nil { markStarted(start) }
    }

    /// A change from the watch's menu (≡).
    /// The header rows, the date and the column names, for a day without a plan
    /// (an empty workout on the iPhone or the watch).
    mutating func ensureHeader(date: String) {
        while values.count < Self.firstSetRow { values.append([]) }
        if text(2, 0) == nil {
            set(row: 2, column: 0, "Datum")
            set(row: 2, column: 1, date)
        }
        if values[6].count < Self.columns.count { values[6] = Self.columns.map { JSONValue.string($0) } }
    }

    mutating func apply(_ change: WatchGym.Change) {
        if change.kind == .parts {
            if let parts = change.parts { setDayParts(parts) }
            return
        }
        let names = exercises.map(\.name)
        // The first exercise of an empty workout has no place to follow.
        guard names.indices.contains(change.exercise) || (change.kind == .addExercise && names.isEmpty) else { return }
        switch change.kind {
        case .addSet: addSet(at: change.exercise)
        case .removeSet: removeSet(at: change.exercise)
        case .removeExercise: removeExercise(at: change.exercise)
        case .swap:
            guard let option = change.option else { return }
            replace(exercise: names[change.exercise], with: option.name, kg: option.kg.map(Self.kgText))
        case .addExercise:
            guard let option = change.option else { return }
            addExercise(option.name, sets: option.sets ?? 3, reps: option.reps ?? "10", kg: option.kg.map(Self.kgText) ?? "")
        case .move:
            guard let to = change.to else { return }
            moveExercise(from: change.exercise, to: to)
        case .parts:
            return
        }
    }
}
