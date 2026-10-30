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
    /// On a done session: Intervals.icu's type ("Tennis"), for its icon.
    var type: String? = nil
    let minutes: Int?
    let tss: Double?
    /// Intervals.icu activity id for GET /app/api/activity-detail.
    let activityId: String?
    /// "planned:<id>" for /app/api/planned/move and delete.
    let eventId: String?
    /// On a done session: the plan it fulfils, for undoing a pairing.
    var plannedId: String? = nil
    /// A workout from the watch (Apple Health, Google Health): its detail
    /// (GET /app/api/activity-detail/watch).
    var watch: WatchRef? = nil
    /// On a done session: the calories the device reported.
    var kcal: Double? = nil
    /// When those look implausible (src/activity-energy-check.js): the
    /// realistic estimate and its range, to check (Kalorie k ověření).
    var kcalEstimate: KcalEstimate? = nil
    /// The user's choice for it: "estimate" or "device"; nil while unchecked.
    var kcalChoice: String? = nil
    /// The calories were set in Aurin (by hand or by the coach); kcalDevice
    /// is what the device said (src/activity-edits.js).
    var kcalEdited: Bool? = nil
    var kcalDevice: Double? = nil
    /// On a done ride or run: its distance and average power, when the
    /// device had them (Dnes → Den).
    var distanceKm: Double? = nil
    var watts: Double? = nil

    struct KcalEstimate: Decodable, Hashable {
        let value: Double?
        let low: Double?
        let high: Double?
        let reason: String?
    }

    /// The device's calories wait for the user's check.
    var kcalNeedsCheck: Bool { kcalEstimate?.value != nil && kcal != nil && kcalChoice == nil }

    /// The calories the day counts with: the estimate when chosen.
    var countedKcal: Double? {
        if kcalChoice == "estimate", let value = kcalEstimate?.value { return value }
        return kcal
    }
    /// On a done session: "good" (kept to the plan), "off" (done differently)
    /// or "offplan" (not in the plan, a walk for instance).
    var adherence: String? = nil
    /// With "off": why, in one line ("kratší než plán (1 h 30)").
    var adherenceReason: String? = nil
    /// Who recorded a done session (Aurin, Apple Watch): two after merging
    /// them (src/workout-merge.js), and whose calories and heart rate count.
    var sources: [ActivityDetail.Origin]? = nil
    var mergeEnergy: String? = nil
    /// On a done session with a plan: how much of the plan was done, in
    /// percent (src/plan-compliance.js), coloured by ComplianceScale.
    var compliance: Int? = nil
    /// On a done lifting session: it fulfils the day's gym plan saved in the
    /// app (pairedGym), or the user unpaired the two (unpaired) and it opens
    /// as an activity of its own (src/app-training.js daySessions).
    var pairedGym: Bool? = nil
    var unpaired: Bool? = nil

    /// What Odpárovat od plánu undoes: the plan it fulfils, or the day's gym
    /// plan (gym:<date>, src/manual-pairs.js).
    var unpairTarget: String? {
        guard kind == "activity", status == "done" else { return nil }
        if let plannedId { return plannedId }
        return pairedGym == true ? "gym:" + date : nil
    }
}

/// The answer to POST /app/api/planned/move (src/planned-events.js).
struct PlannedChange: Decodable {
    let date: String?
    /// Other changes the move brought to the plan, in one line, when the server says.
    let note: String?
}

// MARK: - Gym (GET/POST /app/api/gym, src/gym-plan-store.js)

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

    /// The warm-up before and the stretching after the session (src/stretching.js), nil without them.
    /// An older plan's warm-up began with easy cardio: that is the opening cardio now.
    var warmup: GymStretching? {
        guard let all = GymStretching.routines(values)?.warmup else { return nil }
        let cardio = all.items.filter { $0.id == "cardio" }
        guard !cardio.isEmpty else { return all }
        let moves = all.items.filter { $0.id != "cardio" }
        guard !moves.isEmpty else { return nil }
        let seconds = cardio.reduce(0) { $0 + $1.seconds }
        return GymStretching(minutes: max(1, all.minutes - Int((Double(seconds) / 60).rounded())), items: moves)
    }
    var stretching: GymStretching? { GymStretching.routines(values)?.stretching }
    /// The warm-up and the stretching turned off in Nastavení → Posilovna ("warmup", "stretching"): offered switched off.
    var routinesOff: [String] { GymStretching.routines(values)?.off ?? [] }
    /// The cardio at the start and at the end (an older plan: its warm-up's easy cardio).
    var cardio: GymStretching.Cardio? {
        let routines = GymStretching.routines(values)
        if let cardio = routines?.cardio { return cardio }
        guard let old = routines?.warmup?.items.first(where: { $0.id == "cardio" }) else { return nil }
        return GymStretching.Cardio(type: "exercise_bike", start: max(1, Int((Double(old.seconds) / 60).rounded())), end: nil)
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
    mutating func complete(row: Int, kg: String, reps: String, rpe: String, intensity: String? = nil) {
        guard row < values.count else { return }
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

    mutating func undo(row: Int) {
        set(row: row, column: 8, "FALSE")
    }

    /// Swaps an exercise for another in the sets not done yet.
    /// With kg (the load estimated for the new exercise) its sets take it;
    /// a warm-up's weight is left empty.
    mutating func replace(exercise: String, with name: String, kg: String? = nil) {
        for index in values.indices where index >= Self.firstSetRow {
            guard values[index].count > 1, values[index][1].string == exercise else { continue }
            if values[index].count > 8, Self.isDone(values[index][8].string) { continue }
            values[index][1] = .string(name)
            let warmup = (cell(values[index], 0) ?? "").uppercased() == "WARMUP"
            set(row: index, column: 3, warmup ? "" : kg ?? "")
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
        if Self.rowType(values[row]) == "WORK" {
            let number = cell(values[row], 2)
            if ["L", "P"].contains(cell(values[row], 13) ?? "") {
                drop += (start...end).filter { $0 != row && Self.rowType(values[$0]) == "WORK" && cell(values[$0], 2) == number }
            }
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
        var warmups = 0, work = 0, last: String?
        for i in start...end {
            switch Self.rowType(values[i]) {
            case "WARMUP":
                warmups += 1
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
            guard warms.count != ramp.count, !warms.contains(where: { Self.isDone(cell($0, 8)) }),
                  let work = list[i].first(where: { !Self.isWarmupRow($0) }), let kg = LiftWeight.number(cell(work, 3) ?? "") else { continue }
            var template = warms[0]
            while template.count < Self.columns.count { template.append(.string("")) }
            let rows: [[JSONValue]] = ramp.enumerated().map { n, step in
                var row = template
                row[2] = .string(String(n + 1))
                row[3] = .string(Self.warmupKg(kg * step.0))
                row[4] = .string(step.1)
                for column in [5, 6, 7] { row[column] = .string("") }
                row[8] = .string("FALSE")
                row[11] = .string("FALSE")
                if n > 0 { row[10] = .string("") }
                return row
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

    /// "Každá strana zvlášť": the work sets not done yet become an L and a P
    /// row each; back to "Obě strany najednou" keeps one row per set. Done
    /// sets stay as they were logged.
    mutating func setSides(at offset: Int, _ on: Bool) {
        var (list, rest) = blocks
        guard list.indices.contains(offset) else { return }
        var out: [[JSONValue]] = []
        for var row in list[offset] {
            while row.count < Self.columns.count { row.append(.string("")) }
            let open = !Self.isDone(cell(row, 8)) && (cell(row, 0) ?? "WORK").uppercased() != "WARMUP"
            let side = cell(row, 13) ?? ""
            guard open else { out.append(row); continue }
            if on, side.isEmpty {
                row[13] = .string("L"); out.append(row)
                row[13] = .string("P"); out.append(row)
            } else if !on, !side.isEmpty {
                // The L row stands for the set; the P row goes.
                if side == "L" || !out.contains(where: { cell($0, 2) == cell(row, 2) && !Self.isDone(cell($0, 8)) }) {
                    row[13] = .string(""); out.append(row)
                }
            } else {
                out.append(row)
            }
        }
        list[offset] = out
        write(list, rest)
    }

    /// Joins the exercise with the next one into a superset, or takes its
    /// superset apart when it already is in one.
    mutating func toggleSuperset(at offset: Int) {
        var (list, rest) = blocks
        guard list.indices.contains(offset) else { return }
        func letter(_ i: Int) -> String? { ExerciseOrder.letter(list[i].first { $0.count > 12 }?[12].string) }
        func mark(_ i: Int, _ value: String) {
            for r in list[i].indices {
                while list[i][r].count < Self.columns.count { list[i][r].append(.string("")) }
                list[i][r][12] = .string(value)
            }
        }
        if let current = letter(offset) {
            for i in list.indices where letter(i) == current { mark(i, "") }
        } else if list.indices.contains(offset + 1) {
            let used = Set(list.indices.compactMap(letter))
            let value = letter(offset + 1) ?? "ABCDEFGHIJ".map(String.init).first { !used.contains($0) } ?? "A"
            mark(offset, value)
            mark(offset + 1, value)
        }
        write(list, rest)
    }

    /// Joins the exercise with another one into a superset: the other moves
    /// right after it (out of a superset it was in).
    mutating func superset(_ offset: Int, with other: Int) {
        let count = blocks.exercises.count
        guard offset != other, (0..<count).contains(offset), (0..<count).contains(other) else { return }
        if ExerciseOrder.letter(exercises[other].superset) != nil { toggleSuperset(at: other) }
        if ExerciseOrder.letter(exercises[offset].superset) != nil { toggleSuperset(at: offset) }
        moveExercise(from: other, to: offset + 1)
        toggleSuperset(at: other < offset ? offset - 1 : offset)
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
    /// The rest the plan gives after this set, "[Pauza 150 s]" in its note
    /// (src/strength-timing.js: by the kind of exercise and the gym goal).
    var plannedRest: Int? {
        guard let note, let range = note.range(of: #"\[Pauza (\d+) s\]"#, options: .regularExpression) else { return nil }
        return Int(note[range].filter(\.isNumber))
    }
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
    let photos: [String]?
    /// Width to height of the photos: 1.5 for Free Exercise DB, 1 for RepDB's drawings, 16:9 for video frames.
    let photoAspect: Double?
    /// The YouTube channel the photos are frames from, credited under them.
    let photoCredit: String?
    let video: Video?
    let searchUrl: String?

    struct Video: Decodable, Equatable {
        let id: String?
        let title: String?
        /// The video shows a close variant, not this exact exercise.
        let similar: Bool?
    }
}

struct GymAlternative: Decodable, Equatable, Identifiable {
    let name: String
    let muscle: String?
    let sets: JSONValue?
    let reps: JSONValue?
    let note: String?
    let station: String?
    /// The load estimated from the athlete's history (kg), when there is one.
    var kg: Double? = nil
    var id: String { name }
}

// MARK: - Activity detail (GET /app/api/activity-detail, src/activity-detail.js)

/// Where a watch workout is kept: source_family and external_id.
struct WatchRef: Decodable, Hashable {
    let source: String
    let id: String
    var hasGps: Bool? = nil
    /// The server has its route (Google); Apple's is read on the iPhone.
    var route: Bool? = nil

    /// The HealthKit workout's UUID of an Apple Health workout ("apple:<uuid>").
    var appleUUID: UUID? {
        guard source == "apple-health", id.hasPrefix("apple:") else { return nil }
        return UUID(uuidString: String(id.dropFirst(6)))
    }
}

struct ActivityDetail: Decodable, Equatable {
    let activity: Activity
    let analysis: Analysis?
    var streams: [Stream]?
    let intervals: [Lap]?
    let hrr: HeartRateRecovery?
    /// Heart-rate zones with their bpm range; power zones are in `analysis`.
    var hrZones: [Zone]? = nil
    /// The watch's copy (or the watch workout itself), for its route.
    var watch: WatchRef? = nil
    /// Who recorded it ("Google Health", "Wahoo"), shown under the name
    /// (src/activity-origin.js).
    var origin: Origin? = nil

    struct Origin: Decodable, Hashable {
        let name: String
        /// IntegrationIcon's id; nil: the name alone.
        let logo: String?

        /// A calendar session's source family, for a watch session without a detail.
        static func of(family: String?) -> Origin? {
            switch family {
            case "google-wearables": return Origin(name: "Google Health", logo: "google")
            case "apple-health": return Origin(name: "Apple Health", logo: "apple")
            case "wahoo": return Origin(name: "Wahoo", logo: "wahoo")
            case "intervals": return Origin(name: "Intervals.icu", logo: "intervals")
            default: return nil
            }
        }
    }

    /// Regenerace: the hours after it before hard training (src/recovery-hours.js);
    /// nil for a short easy one, the gym or an older server.
    var recoveryHours: Int? = nil

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
        var min: Double? = nil
        var max: Double? = nil
    }

    struct Analysis: Decodable, Equatable {
        let variability: Double?
        let aerobicDrift: Double?
        let zones: [Zone]?
        var ftp: Double? = nil
    }

    struct StreamPoint: Decodable, Equatable {
        let t: Double
        let v: Double?
        /// latlng: [latitude, longitude].
        var ll: [Double]? = nil

        init(t: Double, v: Double?, ll: [Double]? = nil) {
            self.t = t
            self.v = v
            self.ll = ll
        }

        enum CodingKeys: String, CodingKey { case t, v }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            t = try c.decode(Double.self, forKey: .t)
            let value = try? c.decodeIfPresent(JSONValue.self, forKey: .v)
            if case .array(let pair) = value {
                v = nil
                ll = pair.compactMap(\.number)
            } else {
                v = value?.number
            }
        }
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
    /// Today's ride or run outdoors on a hot day: how to adjust it (src/heat-advice.js).
    var heat: String? = nil

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
        /// Without FTP or threshold pace: the heart-rate zone of the step (bpm).
        let hrLow: Double?
        let hrHigh: Double?
        /// What the step is for: warmup, interval, recovery, active or cooldown.
        let intensity: String?
        /// A swim: the length in metres (paces are then per 100 m), or a rest at the wall.
        var meters: Double? = nil
        var rest: Bool? = nil

        enum CodingKeys: String, CodingKey {
            case durationSeconds, percentLow, percentHigh, wattsLow, wattsHigh, paceSlow, paceFast, cadence, note, hrLow, hrHigh, intensity, meters, rest
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
            hrLow = value(.hrLow)?.number
            hrHigh = value(.hrHigh)?.number
            intensity = value(.intensity)?.string
            meters = value(.meters)?.number
            if case .bool(let b)? = value(.rest) { rest = b }
        }
    }

    struct Block: Decodable, Equatable {
        let repeats: Int?
        let note: String?
        let steps: [Step]?
    }

    struct Workout: Decodable, Equatable {
        /// The library workout's id (source "library"); null for an Intervals.icu event.
        var id: JSONValue? = nil
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

// MARK: - Ratings (GET /app/api/workouts/scheduled, POST /app/api/workouts/feedback)

/// A library workout put in the calendar (workout-library.js getScheduledWorkouts).
struct ScheduledWorkout: Decodable, Equatable {
    let workoutId: String
    let sport: String?
    let scheduledDate: String
    /// The Intervals.icu event id ("local-…" for a session kept only in the app).
    let eventId: String?
    let feedbackId: Int?
    let feedbackRpe: Double?
    let durationMinutes: Double?

    enum CodingKeys: String, CodingKey {
        case workout_id, sport, scheduled_date, intervals_event_id, feedback_id, feedback_rpe, duration_minutes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let value = { (key: CodingKeys) in (try? c.decodeIfPresent(JSONValue.self, forKey: key)) ?? nil }
        workoutId = value(.workout_id)?.string ?? ""
        sport = value(.sport)?.string
        scheduledDate = value(.scheduled_date)?.string ?? ""
        eventId = value(.intervals_event_id)?.string
        feedbackId = value(.feedback_id)?.number.map { Int($0) }
        feedbackRpe = value(.feedback_rpe)?.number
        durationMinutes = value(.duration_minutes)?.number
    }

    var rated: Bool { feedbackId != nil }
    var local: Bool { eventId?.hasPrefix("local-") == true }

    /// The calendar link of a week session: by its event, else the day and sport.
    static func link(for session: WeekSession, in links: [ScheduledWorkout]) -> ScheduledWorkout? {
        let event = session.eventId.map { String($0.dropFirst($0.hasPrefix("planned:") ? 8 : 0)) }
        if let event, let byEvent = links.first(where: { $0.eventId == event }) { return byEvent }
        let sameDay = links.filter { $0.scheduledDate == session.date && !$0.workoutId.isEmpty }
        return sameDay.first { $0.sport == session.sport } ?? (sameDay.count == 1 ? sameDay.first : nil)
    }
}

/// What POST /app/api/workouts/feedback answers.
struct WorkoutFeedbackResult: Decodable {
    let completedPercent: Double?
    let intervals: Intervals?
    /// "pending" while the coach writes the note, else "unavailable".
    let reflection: String?

    struct Intervals: Decodable {
        let status: String?
        let message: String?
    }
}

/// The coach's note on a day (coach-reflection.js listReflections).
struct CoachReflection: Decodable, Equatable, Identifiable {
    let id: String
    let date: String?
    let workoutId: String?
    let rpe: Double?
    let notes: String?
    let text: String?

    enum CodingKeys: String, CodingKey { case id, date, workoutId, rpe, notes, text }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let value = { (key: CodingKeys) in (try? c.decodeIfPresent(JSONValue.self, forKey: key)) ?? nil }
        date = value(.date)?.string
        workoutId = value(.workoutId)?.string
        rpe = value(.rpe)?.number
        notes = value(.notes)?.string
        text = value(.text)?.string
        id = value(.id)?.string ?? ((date ?? "") + "|" + (text ?? ""))
    }
}
