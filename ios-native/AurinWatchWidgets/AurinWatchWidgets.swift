import SwiftUI
import WidgetKit

/// The complications on the watch face (mockup 24): small ones with a
/// segmented arc, an icon and one value (readiness, sleep, strain, calories,
/// drinks, HRV, resting HR, the workout, the alarm), and wide ones for the
/// day, the workout, food, drinks and the night. They draw the last Today
/// the watch app got from the iPhone (ComplicationShelf).
@main
struct AurinWatchWidgets: WidgetBundle {
    var body: some Widget {
        SmallComplication(metric: .readiness)
        SmallComplication(metric: .sleep)
        SmallComplication(metric: .strain)
        SmallComplication(metric: .calories)
        SmallComplication(metric: .drinks)
        SmallComplication(metric: .hrv)
        SmallComplication(metric: .restingHR)
        SmallComplication(metric: .workout)
        SmallComplication(metric: .alarm)
        WideComplication(kind: .day)
        WideComplication(kind: .workout)
        WideComplication(kind: .food)
        WideComplication(kind: .drinks)
        WideComplication(kind: .night)
    }
}

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let snapshot: WatchSnapshot?
}

/// One entry every 15 minutes for six hours, so the workout's countdown and
/// the alarm's day and night move on; the watch app reloads them with each new Today.
struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        completion(DayEntry(date: Date(), snapshot: ComplicationShelf.load() ?? (context.isPreview ? .sample : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let snapshot = ComplicationShelf.load()
        let now = Date()
        let start = Calendar.current.dateInterval(of: .minute, for: now)?.start ?? now
        let entries = (0..<24).map { DayEntry(date: start.addingTimeInterval(Double($0) * 900), snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
    }
}

// MARK: - Small

enum SmallMetric: String, CaseIterable {
    case readiness, sleep, strain, calories, drinks, hrv, restingHR, workout, alarm
}

struct SmallComplication: Widget {
    let metric: SmallMetric

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "aurin.small." + metric.rawValue, provider: DayProvider()) { entry in
            SmallView(metric: metric, value: Small.value(metric, entry.snapshot, at: entry.date), entry: entry)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName(Small.name(metric))
        .description(Small.about(metric))
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}

/// What a small complication shows: the arc's filled part, its colour, the icon and the value.
struct SmallValue {
    var fraction: Double
    var color: Color
    var symbol: String
    var text: String
    /// The inline line ("Readiness 72").
    var line: String
}

enum Small {
    static func name(_ m: SmallMetric) -> String {
        switch m {
        case .readiness: tr("Připravenost", "Readiness")
        case .sleep: tr("Spánek", "Sleep")
        case .strain: tr("Námaha", "Strain")
        case .calories: tr("Kalorie", "Calories")
        case .drinks: tr("Pití", "Drinks")
        case .hrv: "HRV"
        case .restingHR: tr("Klidový tep", "Resting HR")
        case .workout: tr("Trénink", "Workout")
        case .alarm: tr("Budík", "Alarm")
        }
    }

    static func about(_ m: SmallMetric) -> String {
        switch m {
        case .workout: tr("Kdy začíná dnešní trénink, odpočet poslední 3 hodiny.", "When today's workout starts, counting down in the last 3 hours.")
        case .alarm: tr("Přes den čas jít spát, v noci budík, ráno spánek.", "Bedtime during the day, the alarm at night, your sleep in the morning.")
        default: tr("Z dneška v aplikaci Aurin.", "From today in Aurin.")
        }
    }

    static func value(_ m: SmallMetric, _ s: WatchSnapshot?, at now: Date) -> SmallValue {
        let today = s.flatMap { $0.date == Day.key(now) ? $0 : nil }
        let empty = SmallValue(fraction: 0, color: C.muted, symbol: symbol(m), text: "–", line: name(m) + " –")
        switch m {
        case .readiness:
            guard let r = today?.readiness else { return empty }
            return SmallValue(fraction: Double(r) / 100, color: C.zone(today?.zone), symbol: "bolt.heart.fill", text: "\(r)",
                              line: name(m) + " \(r)")
        case .sleep:
            guard let minutes = today?.sleep?.minutes, minutes > 0 else { return empty }
            let need = today?.sleep?.need ?? 480
            return SmallValue(fraction: minutes / max(need, 1), color: C.indigo, symbol: "moon.fill", text: Day.hm(minutes),
                              line: name(m) + " " + Day.duration(minutes))
        case .strain:
            guard let score = today?.strain.score else { return empty }
            let top = max(today?.strain.high ?? 14, score, 1)
            return SmallValue(fraction: score / top, color: C.amber, symbol: "flame.fill", text: Day.one(score),
                              line: name(m) + " " + Day.one(score))
        case .calories:
            guard let food = today?.food, let kcal = food.kcal else { return empty }
            let target = food.target ?? 0
            return SmallValue(fraction: target > 0 ? kcal / target : 0, color: C.carbs, symbol: "fork.knife",
                              text: Day.int(kcal), line: Day.int(kcal) + (target > 0 ? " / " + Day.int(target) : "") + " kcal")
        case .drinks:
            guard let food = today?.food, let target = food.waterTarget, target > 0 else { return empty }
            let share = (food.water ?? 0) / target
            let percent = Int((share * 100).rounded())
            return SmallValue(fraction: share, color: C.blue, symbol: share >= 1 ? "checkmark" : "drop.fill", text: "\(percent)%",
                              line: name(m) + " \(percent) %")
        case .hrv:
            guard let metric = today?.hrv, let v = metric.value else { return empty }
            return SmallValue(fraction: band(v, metric), color: C.green, symbol: "waveform.path.ecg", text: Day.int(v),
                              line: "HRV " + Day.int(v) + " ms")
        case .restingHR:
            guard let metric = today?.restingHR, let v = metric.value else { return empty }
            return SmallValue(fraction: band(v, metric), color: C.pink, symbol: "heart.fill", text: Day.int(v),
                              line: name(m) + " " + Day.int(v))
        case .workout:
            return workout(s, at: now) ?? empty
        case .alarm:
            return alarm(s, at: now) ?? empty
        }
    }

    private static func symbol(_ m: SmallMetric) -> String {
        switch m {
        case .readiness: "bolt.heart.fill"
        case .sleep: "moon.fill"
        case .strain: "flame.fill"
        case .calories: "fork.knife"
        case .drinks: "drop.fill"
        case .hrv: "waveform.path.ecg"
        case .restingHR: "heart.fill"
        case .workout: "figure.strengthtraining.traditional"
        case .alarm: "alarm.fill"
        }
    }

    /// Where the value sits in the athlete's normal band, the band in the middle of the arc.
    private static func band(_ value: Double, _ metric: WatchSnapshot.Metric) -> Double {
        guard let low = metric.low, let high = metric.high, high > low else { return 0.5 }
        return min(1, max(0.05, 0.25 + (value - low) / (high - low) * 0.5))
    }

    /// Over 3 h before: the start time; in the last 3 h: the countdown filling
    /// the arc; no set time: its length; done: a tick and the day's strain;
    /// in the evening or once done: tomorrow's.
    static func workout(_ s: WatchSnapshot?, at now: Date) -> SmallValue? {
        guard let s else { return nil }
        let key = Day.key(now)
        let week = s.week ?? []
        let todays = week.filter { $0.date == key }
        let evening = Calendar.current.component(.hour, from: now) >= 18
        if let next = todays.first(where: { !$0.done }), !evening || Day.at(next.time, on: key).map({ $0 > now }) == true {
            let symbol = Day.sport(next.sport)
            if let start = Day.at(next.time, on: key) {
                let left = start.timeIntervalSince(now)
                if left > 3 * 3600 {
                    return SmallValue(fraction: 0, color: C.amber, symbol: symbol, text: next.time ?? "", line: next.title + " " + (next.time ?? ""))
                }
                if left > 0 {
                    let minutes = Int(left / 60)
                    return SmallValue(fraction: 1 - left / (3 * 3600), color: C.amber, symbol: symbol,
                                      text: String(format: "%d:%02d", minutes / 60, minutes % 60),
                                      line: next.title + " " + tr("za ", "in ") + Day.duration(Double(minutes)))
                }
            }
            let length = next.minutes.map { "\($0)′" } ?? ""
            return SmallValue(fraction: 0, color: C.amber, symbol: symbol, text: length, line: next.title + " " + length)
        }
        if !todays.isEmpty, todays.allSatisfy(\.done), !evening {
            let strain = s.date == key ? s.strain.score.map(Day.one) ?? "" : ""
            return SmallValue(fraction: 1, color: C.green, symbol: "checkmark", text: strain, line: tr("Trénink hotový", "Workout done"))
        }
        // Tomorrow's, in the evening or after today's.
        guard let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: now).map(Day.key),
              let next = week.first(where: { $0.date == tomorrow }) else { return nil }
        let day = Day.weekday(tomorrow)
        return SmallValue(fraction: 0, color: C.muted, symbol: Day.sport(next.sport), text: day,
                          line: day + " " + next.title + (next.time.map { " " + $0 } ?? ""))
    }

    /// During the day the bedtime with the day filling to it; from the bedtime
    /// the alarm with the night filling to it; in the morning the sleep.
    static func alarm(_ s: WatchSnapshot?, at now: Date) -> SmallValue? {
        guard let alarm = s?.alarm else { return nil }
        let key = Day.key(now)
        let hour = Calendar.current.component(.hour, from: now)
        if hour < 12, let slept = s?.sleep?.minutes, slept > 0, s?.date == key,
           let end = Day.at(s?.sleep?.end, on: key), now > end {
            return SmallValue(fraction: slept / max(s?.sleep?.need ?? 480, 1), color: C.amber, symbol: "sun.max.fill",
                              text: Day.hm(slept), line: tr("Spánek ", "Slept ") + Day.duration(slept))
        }
        let evening = alarm.evening ?? key
        guard let bed = Day.at(alarm.bedtime, on: evening) else {
            guard let wake = alarm.wake else { return nil }
            return SmallValue(fraction: 0, color: C.amber, symbol: "alarm.fill", text: wake, line: name(.alarm) + " " + wake)
        }
        let wakeDay = Calendar.current.date(byAdding: .day, value: 1, to: Day.date(evening) ?? now).map(Day.key) ?? key
        let wake = Day.at(alarm.wake, on: wakeDay)
        if now < bed {
            // The day from 7 in the morning to the bedtime.
            let morning = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: bed) ?? bed.addingTimeInterval(-15 * 3600)
            let share = now.timeIntervalSince(morning) / max(bed.timeIntervalSince(morning), 1)
            return SmallValue(fraction: min(1, max(0, share)), color: C.indigo, symbol: "moon.fill", text: alarm.bedtime ?? "",
                              line: tr("Spát v ", "Bed at ") + (alarm.bedtime ?? ""))
        }
        guard let wake, let wakeText = alarm.wake else {
            return SmallValue(fraction: 1, color: C.indigo, symbol: "moon.fill", text: alarm.bedtime ?? "", line: tr("Čas spát", "Time for bed"))
        }
        let share = now.timeIntervalSince(bed) / max(wake.timeIntervalSince(bed), 1)
        return SmallValue(fraction: min(1, max(0, share)), color: C.amber, symbol: "alarm.fill", text: wakeText,
                          line: name(.alarm) + " " + wakeText)
    }
}

struct SmallView: View {
    let metric: SmallMetric
    let value: SmallValue
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(value.line, systemImage: value.symbol)
        case .accessoryCorner:
            Image(systemName: value.symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(value.color)
                .widgetLabel {
                    Gauge(value: min(1, max(0, value.fraction))) { Text(Small.name(metric)) } currentValueLabel: { Text(value.text) }
                        .tint(value.color)
                }
        default:
            ZStack {
                SegmentedArc(fraction: value.fraction, color: value.color)
                VStack(spacing: 0) {
                    Image(systemName: value.symbol)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(value.color)
                        .widgetAccentable()
                    Text(value.text)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 6)
            }
        }
    }
}

/// The arc of 12 segments around a small complication, filled from the top (mockup 24, M2d).
struct SegmentedArc: View {
    let fraction: Double
    let color: Color
    private let count = 12

    var body: some View {
        let filled = Int((min(1, max(0, fraction)) * Double(count)).rounded())
        ZStack {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .trim(from: Double(i) / Double(count) + 0.012, to: Double(i + 1) / Double(count) - 0.012)
                    .stroke(i < filled ? color : Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 4, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .widgetAccentable(i < filled)
            }
        }
        .padding(2)
    }
}

// MARK: - Wide

enum WideKind: String {
    case day, workout, food, drinks, night
}

struct WideComplication: Widget {
    let kind: WideKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "aurin.wide." + kind.rawValue, provider: DayProvider()) { entry in
            WideView(kind: kind, entry: entry)
                .containerBackground(.black, for: .widget)
        }
        .configurationDisplayName(name)
        .description(tr("Z dneška v aplikaci Aurin.", "From today in Aurin."))
        .supportedFamilies([.accessoryRectangular])
    }

    private var name: String {
        switch kind {
        case .day: tr("Den", "Day")
        case .workout: tr("Trénink", "Workout")
        case .food: tr("Jídlo", "Food")
        case .drinks: tr("Pití", "Drinks")
        case .night: tr("Noc", "Night")
        }
    }
}

struct WideView: View {
    let kind: WideKind
    let entry: DayEntry

    private var today: WatchSnapshot? {
        entry.snapshot.flatMap { $0.date == Day.key(entry.date) ? $0 : nil }
    }

    var body: some View {
        switch kind {
        case .day: day
        case .workout: workout
        case .food: food
        case .drinks: drinks
        case .night: night
        }
    }

    /// Three arcs with their icons: readiness, sleep and strain (D8).
    private var day: some View {
        HStack(spacing: 6) {
            ForEach([SmallMetric.readiness, .sleep, .strain], id: \.self) { m in
                let v = Small.value(m, entry.snapshot, at: entry.date)
                ZStack {
                    SegmentedArc(fraction: v.fraction, color: v.color)
                    VStack(spacing: 0) {
                        Image(systemName: v.symbol).font(.system(size: 8, weight: .bold)).foregroundStyle(v.color)
                        Text(v.text).font(.system(size: 12, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6).lineLimit(1)
                    }
                    .padding(.horizontal, 4)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    /// The next workout: its sport, title, start and length, and how long until it starts (T1).
    private var workout: some View {
        let key = Day.key(entry.date)
        let week = entry.snapshot?.week ?? []
        let next = week.first { $0.date == key && !$0.done } ?? week.first { $0.date > key }
        return VStack(alignment: .leading, spacing: 2) {
            if let next {
                HStack(spacing: 4) {
                    Image(systemName: Day.sport(next.sport)).foregroundStyle(C.amber)
                    Text(next.date == key ? tr("Dnes", "Today") : Day.weekday(next.date))
                        .foregroundStyle(C.amber)
                    if let time = next.time { Text(time).foregroundStyle(.white) }
                }
                .font(.system(size: 12, weight: .semibold))
                Text(next.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                HStack(spacing: 4) {
                    if let minutes = next.minutes {
                        // The length as blocks, one per quarter hour.
                        ForEach(0..<min(8, max(1, minutes / 15)), id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 2).fill(C.amber).frame(width: 10, height: 6)
                        }
                        Text("\(minutes)′").font(.system(size: 11)).foregroundStyle(C.muted)
                    }
                }
            } else {
                Text(tr("Trénink", "Workout")).font(.system(size: 12, weight: .semibold)).foregroundStyle(C.amber)
                Text(tr("Tento týden už nic", "Nothing left this week")).font(.system(size: 14)).foregroundStyle(C.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Calories of the goal and a bar split into carbs, protein and fat (J6).
    private var food: some View {
        let food = today?.food
        let kcal = food?.kcal ?? 0
        let parts: [(Double, Color)] = [((food?.carbs.eaten ?? 0) * 4, C.carbs), ((food?.protein.eaten ?? 0) * 4, C.protein), ((food?.fat.eaten ?? 0) * 9, C.fat)]
        let total = max(food?.target ?? 0, parts.reduce(0) { $0 + $1.0 }, 1)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "fork.knife").foregroundStyle(C.carbs)
                Text(tr("Jídlo", "Food")).foregroundStyle(C.carbs)
            }
            .font(.system(size: 12, weight: .semibold))
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(food?.kcal == nil ? "–" : Day.int(kcal)).font(.system(size: 18, weight: .semibold, design: .rounded))
                if let target = food?.target { Text(tr("z ", "of ") + Day.int(target) + " kcal").font(.system(size: 11)).foregroundStyle(C.muted) }
            }
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                        Capsule().fill(part.1).frame(width: max(0, g.size.width * part.0 / total))
                    }
                    Spacer(minLength: 0)
                }
                .background(Capsule().fill(Color.white.opacity(0.18)))
            }
            .frame(height: 6)
        }
    }

    /// Water of the day's goal: a drop, the bar and the percent (P4).
    private var drinks: some View {
        let v = Small.value(.drinks, entry.snapshot, at: entry.date)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "drop.fill").foregroundStyle(C.blue)
                Text(tr("Pití", "Drinks")).foregroundStyle(C.blue)
                Spacer()
                Text(v.text).foregroundStyle(.white)
            }
            .font(.system(size: 13, weight: .semibold))
            if let food = today?.food, let target = food.waterTarget {
                Text(Day.liters(food.water ?? 0) + " / " + Day.liters(target)).font(.system(size: 15, weight: .semibold, design: .rounded))
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.18))
                    Capsule().fill(C.blue).frame(width: g.size.width * min(1, v.fraction))
                }
            }
            .frame(height: 6)
        }
    }

    /// Tonight from the bedtime to the alarm on a line, with the sleep it gives (S4).
    private var night: some View {
        let alarm = entry.snapshot?.alarm
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "moon.fill").foregroundStyle(C.indigo)
                Text(tr("Noc", "Night")).foregroundStyle(C.indigo)
                Spacer()
                if let sleep = alarm?.sleep { Text(Day.duration(Double(sleep))).foregroundStyle(.white) }
            }
            .font(.system(size: 12, weight: .semibold))
            HStack(spacing: 4) {
                Text(alarm?.bedtime ?? "–").font(.system(size: 15, weight: .semibold, design: .rounded))
                ZStack {
                    Capsule().fill(LinearGradient(colors: [C.indigo, C.amber], startPoint: .leading, endPoint: .trailing)).frame(height: 4)
                }
                Text(alarm?.wake ?? "–").font(.system(size: 15, weight: .semibold, design: .rounded))
            }
            HStack {
                Image(systemName: "bed.double.fill")
                Spacer()
                Image(systemName: "alarm.fill")
            }
            .font(.system(size: 9))
            .foregroundStyle(C.muted)
        }
    }
}

// MARK: - Look and words

enum C {
    static let muted = Color(red: 0x9A / 255, green: 0xA3 / 255, blue: 0x9F / 255)
    static let green = Color(red: 0x8F / 255, green: 0xE6 / 255, blue: 0xC4 / 255)
    static let amber = Color(red: 0xF2 / 255, green: 0xB4 / 255, blue: 0x6B / 255)
    static let indigo = Color(red: 0xA5 / 255, green: 0xA1 / 255, blue: 0xFF / 255)
    static let pink = Color(red: 0xF5 / 255, green: 0x9B / 255, blue: 0xB0 / 255)
    static let red = Color(red: 1, green: 0x6B / 255, blue: 0x5B / 255)
    static let carbs = Color(red: 1, green: 0xC2 / 255, blue: 0x74 / 255)
    static let protein = Color(red: 0x83 / 255, green: 0xC7 / 255, blue: 1)
    static let fat = Color(red: 0xB3 / 255, green: 0xA1 / 255, blue: 1)
    static let blue = Color(red: 0x7C / 255, green: 0xC3 / 255, blue: 0xF0 / 255)

    static func zone(_ zone: String?) -> Color {
        switch zone {
        case "yellow": amber
        case "red": red
        default: green
        }
    }
}

/// The iPhone app's language from the last Today, else the watch's.
var english: Bool {
    if let language = ComplicationShelf.load()?.language { return language == "en" }
    let first = Locale.preferredLanguages.first?.lowercased() ?? ""
    return !(first.hasPrefix("cs") || first.hasPrefix("sk"))
}

func tr(_ czech: String, _ englishText: String) -> String { english ? englishText : czech }

enum Day {
    static func key(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// "6:30" on the day `key`.
    static func at(_ time: String?, on key: String) -> Date? {
        guard let time, let day = date(key) else { return nil }
        let parts = time.prefix(5).split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
    }

    static func weekday(_ key: String) -> String {
        guard let day = date(key) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: english ? "en_US" : "cs_CZ")
        f.dateFormat = "EEE"
        return f.string(from: day).capitalized
    }

    static func sport(_ sport: String) -> String {
        switch sport {
        case "ride": "figure.outdoor.cycle"
        case "run": "figure.run"
        case "swim": "figure.pool.swim"
        case "walk": "figure.walk"
        case "strength": "dumbbell.fill"
        default: "figure.mixed.cardio"
        }
    }

    static func int(_ v: Double) -> String { String(Int(v.rounded())) }

    static func one(_ v: Double) -> String {
        let f = NumberFormatter()
        f.minimumFractionDigits = 1
        f.maximumFractionDigits = 1
        f.locale = Locale(identifier: english ? "en_US" : "cs_CZ")
        return f.string(from: NSNumber(value: v)) ?? String(format: "%.1f", v)
    }

    /// "7h38", as on the small ones.
    static func hm(_ minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return "\(m / 60)h\(String(format: "%02d", m % 60))"
    }

    /// "7 h 38 min".
    static func duration(_ minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return m >= 60 ? "\(m / 60) h \(m % 60) min" : "\(m) min"
    }

    static func liters(_ ml: Double) -> String { one(ml / 1000) + " l" }
}

extension WatchSnapshot {
    /// The watch face's gallery before the first Today.
    static var sample: WatchSnapshot {
        let key = Day.key(Date())
        return WatchSnapshot(
            date: key, updated: Date(), language: english ? "en" : "cs", readiness: 78, zone: "green",
            headline: nil, summary: nil,
            sleep: Sleep(minutes: 458, need: 480, start: "22:50", end: "6:40", deep: nil, rem: nil, light: nil, nights: []),
            restingHR: Metric(value: 52, low: 49, high: 56, series: []),
            hrv: Metric(value: 64, low: 55, high: 72, series: []),
            strain: Strain(score: 6.2, low: 8, high: 14, training: nil, movement: nil, planned: nil, nextTitle: nil, nextTime: nil),
            steps: nil,
            week: [Session(date: key, time: "17:30", title: "Sweet spot", sport: "ride", minutes: 75, done: false)],
            food: Food(kcal: 1240, target: 2400, carbs: Macro(eaten: 150, target: 300), protein: Macro(eaten: 80, target: 150),
                       fat: Macro(eaten: 40, target: 80), water: 1200, waterTarget: 2500),
            alarm: Alarm(work: "6:30", weekend: "8:00", evening: key, wake: "6:30", wakeOnce: nil, bedtime: "22:45", inBed: 465, sleep: 450))
    }
}
