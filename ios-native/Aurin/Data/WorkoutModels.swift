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
    /// A session joined to another of the day, one right after the other
    /// (a brick): the event it follows, and the one that follows it.
    var after: String? = nil
    var next: String? = nil
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

// MARK: - Gym (GET/POST /app/api/gym): the parts of the sheet only the iPhone uses

/// The sheet itself is in WatchShared/GymSheet.swift, shared with the watch.
extension GymDay {
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
