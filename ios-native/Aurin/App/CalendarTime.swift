import CoreGraphics
import EventKit
import Foundation

// Trénink podle kalendáře v iPhonu (Kdy mám čas → Kalendář v iPhonu).
// "Číst kalendář": the app reads the events on the phone and sends the server
// only the minutes free for training on each day (POST /app/api/calendar-free,
// src/calendar-free.js), never the events. The week's plan, Aktivita dne and
// the generator then keep to them. "Zapisovat tréninky": "Uložit do
// kalendáře" in Plán týdne also puts the workouts into the chosen calendar
// (its own "Aurin" by default), each in that day's free time.

@MainActor
final class CalendarTime {
    static let shared = CalendarTime()

    static let readKey = "calendar.read"
    static let writeKey = "calendar.write"
    /// The calendar the workouts go to; empty: Aurin's own.
    static let targetKey = "calendar.target"
    private static let sentKey = "calendar.sent"
    /// The events Aurin wrote, by day, so a new save replaces them and the
    /// free time does not count them as busy.
    private static let eventsKey = "calendar.events"

    /// Training fits between 6:00 and 22:00 and keeps 15 minutes to get ready
    /// and change before the next event.
    static let dayStart = 6 * 60
    static let dayEnd = 22 * 60
    static let buffer = 15
    /// Today and the next 13 days: this week and the next one.
    static let days = 14
    /// Free time is placed from here when the gap allows (an evening workout).
    private static let preferredStart = 17 * 60

    /// One day's longest free stretch.
    struct Day: Equatable {
        let date: String
        /// The minutes free for training, the buffer taken off.
        let free: Int
        let start: Date
        let end: Date
    }

    private let store = EKEventStore()
    private var defaults: UserDefaults { .standard }
    /// The last reading, for the times next to the week's workouts.
    private(set) var reading: [String: Day] = [:]

    static var authorized: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }
    var reads: Bool { defaults.bool(forKey: Self.readKey) && Self.authorized }
    var writes: Bool { reads && defaults.bool(forKey: Self.writeKey) }

    /// iPhone asks once; afterwards only iOS Settings changes the answer.
    func requestAccess() async -> Bool {
        if Self.authorized { return true }
        guard EKEventStore.authorizationStatus(for: .event) == .notDetermined else { return false }
        return (try? await store.requestFullAccessToEvents()) ?? false
    }

    // MARK: Reading

    /// The free time from today on, read from every calendar on the phone.
    func read(now: Date = Date()) -> [Day] {
        guard reads else { return [] }
        let cal = Calendar.current
        let ours = written
        var out: [Day] = []
        for i in 0..<Self.days {
            guard let day = cal.date(byAdding: .day, value: i, to: cal.startOfDay(for: now)) else { continue }
            let windowStart = day.addingTimeInterval(Double(Self.dayStart * 60))
            let windowEnd = day.addingTimeInterval(Double(Self.dayEnd * 60))
            // Today counts from now, rounded up to five minutes.
            let from = i == 0 ? max(windowStart, Date(timeIntervalSince1970: (now.timeIntervalSince1970 / 300).rounded(.up) * 300)) : windowStart
            let events = store.events(matching: store.predicateForEvents(withStart: day, end: day.addingTimeInterval(86_400), calendars: nil))
            var busy: [(Date, Date)] = []
            for e in events where !ours.contains(e.eventIdentifier ?? "") && e.status != .canceled {
                // A birthday or a holiday is all day but free; a trip marked busy is not.
                if e.isAllDay {
                    if e.availability == .busy || e.availability == .unavailable { busy.append((windowStart, windowEnd)) }
                } else if e.availability != .free {
                    busy.append((max(e.startDate, from), min(e.endDate, windowEnd)))
                }
            }
            out.append(Self.longestGap(date: AppModel.localDate(day), from: from, to: windowEnd, busy: busy))
        }
        reading = Dictionary(out.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        return out
    }

    /// The longest stretch between `from` and `to` that no busy interval covers.
    nonisolated static func longestGap(date: String, from: Date, to: Date, busy: [(Date, Date)]) -> Day {
        var best = (from, from)
        var cursor = from
        for (s, e) in busy.filter({ $0.1 > $0.0 }).sorted(by: { $0.0 < $1.0 }) {
            if s > cursor, s.timeIntervalSince(cursor) > best.1.timeIntervalSince(best.0) { best = (cursor, min(s, to)) }
            cursor = max(cursor, e)
        }
        if to > cursor, to.timeIntervalSince(cursor) > best.1.timeIntervalSince(best.0) { best = (cursor, to) }
        let minutes = Int(best.1.timeIntervalSince(best.0) / 60)
        return Day(date: date, free: max(0, minutes - buffer), start: best.0, end: best.1)
    }

    /// The day's time with the calendar, as the server counts it
    /// (src/calendar-free.js calendarMinutes): never more than the athlete's own.
    nonisolated static func capped(_ own: Int, free: Int?) -> Int {
        guard let free else { return own }
        let usable = free < 20 ? 0 : free
        if own < 0 { return usable < 240 ? usable : own }
        return min(own, usable)
    }

    /// Sends the free time when it changed since the last time (or `force`).
    func send(api: APIClient, force: Bool = false) async {
        guard reads, api.hasSession else { return }
        let days = read()
        let body: JSONObject = ["days": .array(days.map { .object(["date": .string($0.date), "minutes": .number(Double($0.free))]) })]
        let account = defaults.string(forKey: AvatarStore.emailKey) ?? ""
        let key = account + "|" + days.map { "\($0.date)=\($0.free)" }.joined(separator: ",")
        guard force || defaults.string(forKey: Self.sentKey) != key else { return }
        struct Response: Decodable { let status: String? }
        do {
            let _: Response = try await api.send("/app/api/calendar-free", method: "POST", body: body)
            defaults.set(key, forKey: Self.sentKey)
        } catch {
            defaults.removeObject(forKey: Self.sentKey)
        }
    }

    /// "Číst kalendář" off: the calendar no longer limits any day.
    func stopReading(api: APIClient) async throws {
        defaults.set(false, forKey: Self.readKey)
        defaults.removeObject(forKey: Self.sentKey)
        reading = [:]
        struct Response: Decodable { let status: String? }
        let _: Response = try await api.send("/app/api/calendar-free", method: "DELETE", body: JSONObject())
    }

    // MARK: Writing

    /// The times of the day's workouts in its free time, one after another
    /// with the buffer between them; nil when the day was not read.
    func slots(date: String, minutes: [Int]) -> [(start: Date, end: Date)]? {
        guard let day = reading[date] else { return nil }
        let cal = Calendar.current
        let total = minutes.reduce(0, +) + Self.buffer * max(0, minutes.count - 1)
        let dayStart = cal.startOfDay(for: day.start)
        // Late afternoon when the gap allows, else from the gap's start.
        let preferred = dayStart.addingTimeInterval(Double(Self.preferredStart * 60))
        let latest = day.end.addingTimeInterval(-Double((total + Self.buffer) * 60))
        var cursor = latest >= preferred ? max(day.start, preferred) : day.start
        return minutes.map { m in
            let start = cursor, end = start.addingTimeInterval(Double(m * 60))
            cursor = end.addingTimeInterval(Double(Self.buffer * 60))
            return (start: start, end: end)
        }
    }

    /// "18:30–19:15" for the week's row.
    func slotText(date: String, minutes: [Int], index: Int) -> String? {
        guard reads, let slots = slots(date: date, minutes: minutes), slots.indices.contains(index) else { return nil }
        let style = Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale)
        return slots[index].start.formatted(style) + "–" + slots[index].end.formatted(style)
    }

    /// The calendars a workout can go to: Aurin's own first (always "").
    func calendars() -> [(id: String, title: String)] {
        guard Self.authorized else { return [] }
        let others = store.calendars(for: .event).filter { $0.allowsContentModifications && $0.calendarIdentifier != ownId }
            .sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
        return [(id: "", title: "Aurin")] + others.map { (id: $0.calendarIdentifier, title: $0.title) }
    }

    var target: String {
        get { defaults.string(forKey: Self.targetKey) ?? "" }
        set { defaults.set(newValue, forKey: Self.targetKey) }
    }

    private static let ownKey = "calendar.own"
    private var ownId: String { defaults.string(forKey: Self.ownKey) ?? "" }

    /// The chosen calendar, or Aurin's own, made on the first write.
    private func targetCalendar() throws -> EKCalendar {
        if !target.isEmpty, let chosen = store.calendar(withIdentifier: target), chosen.allowsContentModifications { return chosen }
        if let own = store.calendar(withIdentifier: ownId) { return own }
        let own = EKCalendar(for: .event, eventStore: store)
        own.title = "Aurin"
        own.cgColor = CGColor(red: 0xE0 / 255, green: 0x9A / 255, blue: 0x55 / 255, alpha: 1)
        // iCloud when the phone syncs calendars, else the calendars on the phone.
        own.source = store.defaultCalendarForNewEvents?.source ?? store.sources.first { $0.sourceType == .local }
        do {
            try store.saveCalendar(own, commit: true)
        } catch {
            guard let fallback = store.defaultCalendarForNewEvents else { throw error }
            return fallback
        }
        defaults.set(own.calendarIdentifier, forKey: Self.ownKey)
        target = ""
        return own
    }

    /// One thing for the calendar: a planned workout or a plan's race day.
    struct Entry: Equatable {
        /// The planned workout's id, or "race|<plan>".
        let key: String
        let date: String
        let title: String
        /// nil: all day (the race).
        let minutes: Int?
        /// "18:30" when the workout has its own time.
        let time: String?
        let notes: String
        let link: URL?

        var signature: String { [date, title, minutes.map(String.init) ?? "day", time ?? ""].joined(separator: "|") }
    }

    /// What Aurin wrote: the entry's key → [event id, signature].
    private var mirrored: [String: [String]] {
        get { (defaults.dictionary(forKey: Self.eventsKey) as? [String: [String]]) ?? [:] }
        set { defaults.set(newValue, forKey: Self.eventsKey) }
    }

    /// The events Aurin wrote do not count as busy.
    private var written: Set<String> { Set(mirrored.values.compactMap(\.first)) }

    /// The planned workouts of the next four weeks.
    static let mirrorDays = 28
    private var mirroredAt = Date.distantPast

    /// "Zapisovat tréninky": every planned workout of the next four weeks
    /// (Plán týdne, a training plan, the coach, Intervals.icu) and the race day
    /// of a race plan go into the calendar; changed ones are moved, removed ones
    /// go. At most every ten minutes unless `force`.
    func mirror(api: APIClient, force: Bool = false) async {
        guard writes, api.hasSession, force || Date().timeIntervalSince(mirroredAt) > 600 else { return }
        let today = AppModel.localDate(Date())
        let end = AppModel.shift(today, by: Self.mirrorDays - 1) ?? today
        guard let calendar = try? await api.trainingCalendar(start: today, end: end) else { return }
        let plans = try? await api.trainingPlans()
        var entries: [Entry] = calendar.days.flatMap(\.activities).filter { $0.status == "planned" && $0.date >= today }.map { a in
            let minutes = a.minutes.map { Int($0.rounded()) }.flatMap { $0 > 0 ? $0 : nil } ?? 60
            return Entry(key: a.id, date: a.date, title: a.title, minutes: minutes, time: a.time,
                         notes: [Self.sportLabel(a.sport), Fmt.duration(minutes)].compactMap { $0 }.joined(separator: " · "),
                         link: URL(string: a.sport == "strength" ? "aurin://open/gym/" + a.date : "aurin://open/training"))
        }
        // A workout done today keeps its place in the calendar.
        let done = Set(calendar.days.flatMap(\.activities).compactMap(\.plannedId))
        for plan in [plans?.active, plans?.activeGym].compactMap({ $0 }) {
            guard let race = plan.raceDate, race >= today else { continue }
            entries.append(Entry(key: "race|" + plan.templateId, date: race, title: L10n.f("Závod · %@", plan.name), minutes: nil, time: nil,
                                 notes: plan.raceKm.map { Fmt.decimal($0) + " km" } ?? "", link: URL(string: "aurin://open/training")))
        }
        _ = read()
        do {
            try apply(entries, keep: done, today: today)
            mirroredAt = Date()
        } catch {
            ErrorLog.add(path: "EventKit calendar", status: nil, message: error.localizedDescription)
        }
    }

    private func apply(_ entries: [Entry], keep: Set<String>, today: String) throws {
        let calendar = try targetCalendar()
        var known = mirrored
        let wanted = Dictionary(entries.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        // Gone from the plan (past days stay as they were).
        for (key, value) in known where wanted[key] == nil && !keep.contains(key) {
            guard (value.last ?? "").prefix(10) >= today else { continue }
            if let id = value.first, let old = store.event(withIdentifier: id) { try? store.remove(old, span: .thisEvent, commit: false) }
            known[key] = nil
        }
        // New or changed, placed day by day.
        for (date, list) in Dictionary(grouping: entries, by: \.date) {
            let changed = list.filter { e in
                guard let value = known[e.key], value.last == e.signature, let id = value.first else { return true }
                return store.event(withIdentifier: id) == nil
            }
            guard !changed.isEmpty else { continue }
            let untimed = changed.filter { $0.time == nil && $0.minutes != nil }
            var free = (slots(date: date, minutes: untimed.compactMap(\.minutes)) ?? Self.fallback(date: date, minutes: untimed.compactMap(\.minutes)))[...]
            for e in changed {
                if let id = known[e.key]?.first, let old = store.event(withIdentifier: id) { try? store.remove(old, span: .thisEvent, commit: false) }
                guard let day = DateFormatters.iso().date(from: e.date) else { continue }
                let event = EKEvent(eventStore: store)
                event.calendar = calendar
                event.title = e.title
                event.notes = e.notes
                event.url = e.link
                if let minutes = e.minutes {
                    let start: Date
                    if let time = e.time, let at = Self.clock(time) {
                        start = Calendar.current.startOfDay(for: day).addingTimeInterval(Double(at * 60))
                    } else {
                        start = free.popFirst()?.start ?? Calendar.current.startOfDay(for: day).addingTimeInterval(Double(Self.preferredStart * 60))
                    }
                    event.startDate = start
                    event.endDate = start.addingTimeInterval(Double(minutes * 60))
                    event.availability = .busy
                } else {
                    event.isAllDay = true
                    event.startDate = Calendar.current.startOfDay(for: day)
                    event.endDate = event.startDate
                    event.availability = .free
                }
                try store.save(event, span: .thisEvent, commit: false)
                if let id = event.eventIdentifier { known[e.key] = [id, e.signature] }
            }
        }
        try store.commit()
        mirrored = known
    }

    /// "Zapisovat tréninky" off: the workouts Aurin wrote for today on go.
    func removeMirrored() {
        let today = AppModel.localDate(Date())
        var known = mirrored
        for (key, value) in known where (value.last ?? "").prefix(10) >= today {
            if let id = value.first, let old = store.event(withIdentifier: id) { try? store.remove(old, span: .thisEvent, commit: false) }
            known[key] = nil
        }
        try? store.commit()
        mirrored = known
    }

    /// "18:30" → 1110.
    private static func clock(_ text: String) -> Int? {
        let parts = text.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0..<24).contains(parts[0]), (0..<60).contains(parts[1]) else { return nil }
        return parts[0] * 60 + parts[1]
    }

    private static func sportLabel(_ sport: String) -> String? {
        ["ride": "Kolo", "run": "Běh", "strength": "Posilovna", "gym": "Posilovna", "swim": "Plavání", "walk": "Chůze"][sport].map { L10n.tr($0) }
    }

    /// A day not read (beyond two weeks): from 17:00.
    private static func fallback(date: String, minutes: [Int]) -> [(start: Date, end: Date)] {
        guard let d = DateFormatters.iso().date(from: date) else { return [] }
        var cursor = Calendar.current.startOfDay(for: d).addingTimeInterval(Double(preferredStart * 60))
        return minutes.map { m in
            let start = cursor, end = start.addingTimeInterval(Double(m * 60))
            cursor = end.addingTimeInterval(Double(buffer * 60))
            return (start: start, end: end)
        }
    }
}
