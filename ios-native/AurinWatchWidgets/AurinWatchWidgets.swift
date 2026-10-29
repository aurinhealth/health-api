import SwiftUI
import WidgetKit

/// The complications on the watch face (mockups apple-watch-komplikace 1–6):
/// small ones with the app's own ring (ten arcs over three quarters) and a
/// word in its gap, coloured by how the value stands (readiness, sleep,
/// strain, calories left, protein, drinks, HRV, resting HR, the workout, the
/// alarm, Aurin through the day and the logo), and wide ones for the day,
/// today, the workout, food, drinks, the night and Aurin through the day.
/// They draw the last Today the watch app got (ComplicationShelf); a tap
/// opens the watch app on its page (widgetURL, WatchRoot.open).
@main
struct AurinWatchWidgets: WidgetBundle {
    var body: some Widget {
        SmallAurin()
        SmallReadiness()
        SmallSleep()
        SmallStrain()
        SmallCalories()
        SmallProtein()
        SmallDrinks()
        SmallHrv()
        SmallRestingHR()
        SmallWorkout()
        SmallAlarm()
        SmallLogo()
        WideAurin()
        WideToday()
        WideDay()
        WideWorkout()
        WideFood()
        WideDrinks()
        WideNight()
    }
}

// A widget is made with init(), so each complication is its own type.
struct SmallAurin: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.aurin) } }
struct SmallReadiness: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.readiness) } }
struct SmallSleep: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.sleep) } }
struct SmallStrain: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.strain) } }
struct SmallCalories: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.calories) } }
struct SmallProtein: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.protein) } }
struct SmallDrinks: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.drinks) } }
struct SmallHrv: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.hrv) } }
struct SmallRestingHR: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.restingHR) } }
struct SmallWorkout: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.workout) } }
struct SmallAlarm: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.alarm) } }
struct SmallLogo: Widget { var body: some WidgetConfiguration { SmallComplication.configuration(.logo) } }
struct WideAurin: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.aurin) } }
struct WideToday: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.today) } }
struct WideDay: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.day) } }
struct WideWorkout: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.workout) } }
struct WideFood: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.food) } }
struct WideDrinks: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.drinks) } }
struct WideNight: Widget { var body: some WidgetConfiguration { WideComplication.configuration(.night) } }

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let snapshot: WatchSnapshot?
    /// The next ride's or run's steps, when the watch app has them.
    var plan: ComplicationShelf.Planned? = nil
    /// The Smart Stack puts Aurin on top when this is high: after waking,
    /// before a workout and before bed.
    var relevance: TimelineEntryRelevance? = nil
}

/// One entry every 15 minutes for six hours, so the workout's time, the
/// alarm's day and night and Aurin through the day move on; countdowns run
/// on their own (Text timerInterval). The watch app reloads them with each new Today.
struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        let snapshot = ComplicationShelf.load() ?? (context.isPreview ? .sample : nil)
        Lang.set(snapshot)
        completion(DayEntry(date: Date(), snapshot: snapshot, plan: ComplicationShelf.plan()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let snapshot = ComplicationShelf.load()
        let plan = ComplicationShelf.plan()
        Lang.set(snapshot)
        let now = Date()
        let start = Calendar.current.dateInterval(of: .minute, for: now)?.start ?? now
        let entries = (0..<24).map { i -> DayEntry in
            let date = start.addingTimeInterval(Double(i) * 900)
            return DayEntry(date: date, snapshot: snapshot, plan: plan, relevance: Moment.relevance(snapshot, at: date))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(6 * 3600))))
    }
}

/// What matters now, for Aurin through the day and the Smart Stack: the
/// workout in the last 3 hours before it, bedtime from 3 hours before it,
/// readiness the rest of the day.
enum Moment {
    case readiness, workout, night

    static func at(_ s: WatchSnapshot?, _ now: Date) -> Moment {
        guard let s, s.date == Days.key(now) else { return .readiness }
        if let next = Small.nextToday(s, at: now), let start = Days.at(next.time, on: s.date),
           start > now, start.timeIntervalSince(now) <= 3 * 3600 {
            return .workout
        }
        if let alarm = s.alarm, let bed = Days.at(alarm.bedtime, on: alarm.evening ?? s.date),
           now >= bed.addingTimeInterval(-3 * 3600) {
            return .night
        }
        return .readiness
    }

    /// High from waking for two hours, in the 90 minutes before a workout and
    /// the 2 hours before bed; none otherwise.
    static func relevance(_ s: WatchSnapshot?, at now: Date) -> TimelineEntryRelevance? {
        guard let s, s.date == Days.key(now) else { return nil }
        if let end = Days.at(s.sleep?.end, on: s.date), now >= end, now.timeIntervalSince(end) < 2 * 3600 {
            return TimelineEntryRelevance(score: 80, duration: 900)
        }
        if let next = Small.nextToday(s, at: now), let start = Days.at(next.time, on: s.date),
           start > now, start.timeIntervalSince(now) <= 90 * 60 {
            return TimelineEntryRelevance(score: 90, duration: 900)
        }
        if let alarm = s.alarm, let bed = Days.at(alarm.bedtime, on: alarm.evening ?? s.date),
           now < bed, bed.timeIntervalSince(now) <= 2 * 3600 {
            return TimelineEntryRelevance(score: 70, duration: 900)
        }
        return nil
    }
}

// MARK: - Small

enum SmallMetric: String, CaseIterable {
    case aurin, readiness, sleep, strain, calories, protein, drinks, hrv, restingHR, workout, alarm, logo
}

@MainActor
enum SmallComplication {
    static func configuration(_ metric: SmallMetric) -> some WidgetConfiguration {
        StaticConfiguration(kind: "aurin.small." + metric.rawValue, provider: DayProvider()) { entry in
            SmallView(metric: metric, value: Small.value(metric, entry.snapshot, at: entry.date))
                .containerBackground(.black, for: .widget)
                .widgetURL(Tap.url(for: metric, entry))
        }
        .configurationDisplayName(Small.name(metric))
        .description(Small.about(metric))
        .supportedFamilies(metric == .logo ? [.accessoryCircular, .accessoryCorner] : [.accessoryCircular, .accessoryCorner, .accessoryInline])
    }
}

/// What a small complication shows: the ring's filled part and colour, the
/// word in its gap, the value (or a countdown to `until`) and the inline line.
struct SmallValue {
    var fraction: Double
    var color: Color
    var word: String
    var text: String
    /// The inline line ("Readiness 72").
    var line: String
    var symbol: String
    /// A countdown that runs on its own instead of `text`.
    var until: Date? = nil
    /// ↑ or ↓ against yesterday, with its own colour.
    var arrow: (text: String, color: Color)? = nil
}

enum Small {
    static func name(_ m: SmallMetric) -> String {
        switch m {
        case .aurin: tr("Aurin přes den", "Aurin through the day")
        case .readiness: tr("Připravenost", "Readiness")
        case .sleep: tr("Spánek", "Sleep")
        case .strain: tr("Námaha", "Strain")
        case .calories: tr("Zbývá kalorií", "Calories left")
        case .protein: tr("Bílkoviny", "Protein")
        case .drinks: tr("Pití", "Drinks")
        case .hrv: "HRV"
        case .restingHR: tr("Klidový tep", "Resting HR")
        case .workout: tr("Trénink", "Workout")
        case .alarm: tr("Budík", "Alarm")
        case .logo: "Aurin"
        }
    }

    static func about(_ m: SmallMetric) -> String {
        switch m {
        case .aurin: tr("Ráno připravenost, před tréninkem odpočet, večer čas jít spát.", "Readiness in the morning, the countdown before a workout, bedtime in the evening.")
        case .workout: tr("Kdy začíná dnešní trénink, odpočet poslední 3 hodiny.", "When today's workout starts, counting down in the last 3 hours.")
        case .alarm: tr("Přes den čas jít spát, v noci budík, ráno spánek.", "Bedtime during the day, the alarm at night, your sleep in the morning.")
        case .logo: tr("Otevře Aurin.", "Opens Aurin.")
        default: tr("Z dneška v aplikaci Aurin.", "From today in Aurin.")
        }
    }

    /// The word in the ring's gap.
    static func word(_ m: SmallMetric) -> String {
        switch m {
        case .aurin, .readiness: tr("PŘIPR.", "READY")
        case .sleep: tr("SPÁNEK", "SLEEP")
        case .strain: tr("NÁMAHA", "STRAIN")
        case .calories: "KCAL"
        case .protein: tr("BÍLK.", "PROTEIN")
        case .drinks: tr("VODA", "WATER")
        case .hrv: "HRV"
        case .restingHR: tr("TEP", "REST HR")
        case .workout: tr("TRÉNINK", "WORKOUT")
        case .alarm: tr("BUDÍK", "ALARM")
        case .logo: ""
        }
    }

    static func symbol(_ m: SmallMetric) -> String {
        switch m {
        case .aurin, .readiness, .logo: "sun.max.fill"
        case .sleep: "moon.fill"
        case .strain: "flame.fill"
        case .calories: "fork.knife"
        case .protein: "fork.knife"
        case .drinks: "drop.fill"
        case .hrv: "waveform.path.ecg"
        case .restingHR: "heart.fill"
        case .workout: "figure.strengthtraining.traditional"
        case .alarm: "alarm.fill"
        }
    }

    static func value(_ m: SmallMetric, _ s: WatchSnapshot?, at now: Date) -> SmallValue {
        let today = s.flatMap { $0.date == Days.key(now) ? $0 : nil }
        let empty = SmallValue(fraction: 0, color: C.stale, word: word(m), text: "–", line: name(m) + " –", symbol: symbol(m))
        // Not today's yet (before the iPhone or the server sent it): yesterday
        // in grey with its day, never as if it were today.
        if today == nil, let s, m != .logo {
            switch m {
            case .aurin, .readiness:
                guard let r = s.readiness else { return empty }
                return SmallValue(fraction: Double(r) / 100, color: C.stale, word: Days.weekday(s.date).uppercased(), text: "\(r)",
                                  line: name(.readiness) + " \(r) · " + Days.weekday(s.date), symbol: symbol(m))
            case .sleep:
                return SmallValue(fraction: 0, color: C.stale, word: tr("ČEKÁM", "WAITING"), text: "···",
                                  line: tr("Spánek: čekám na noc", "Sleep: waiting for last night"), symbol: symbol(m))
            default:
                return empty
            }
        }
        switch m {
        case .aurin:
            switch Moment.at(today, now) {
            case .workout: return workout(today, at: now) ?? value(.readiness, s, at: now)
            case .night: return alarm(today, at: now) ?? value(.readiness, s, at: now)
            case .readiness: return value(.readiness, s, at: now)
            }
        case .readiness:
            guard let r = today?.readiness else { return empty }
            return SmallValue(fraction: Double(r) / 100, color: C.zone(today?.zone), word: word(m), text: "\(r)",
                              line: name(m) + " \(r)", symbol: symbol(m))
        case .sleep:
            guard let minutes = today?.sleep?.minutes, minutes > 0 else { return empty }
            let need = today?.sleep?.need ?? 480
            return SmallValue(fraction: minutes / max(need, 1), color: C.sleep(minutes, need: need), word: word(m), text: Days.hm(minutes),
                              line: name(m) + " " + Days.duration(minutes), symbol: symbol(m))
        case .strain:
            guard let score = today?.strain.score else { return empty }
            let top = max(today?.strain.high ?? 14, score, 1)
            return SmallValue(fraction: score / top, color: C.strain(score, low: today?.strain.low, high: today?.strain.high, at: now),
                              word: word(m), text: Days.one(score), line: name(m) + " " + Days.one(score), symbol: symbol(m))
        case .calories:
            guard let food = today?.food, let kcal = food.kcal else { return empty }
            let target = food.target ?? 0
            let left = target - kcal
            let reached = target > 0 && left <= 0
            var line = Days.int(kcal) + " kcal"
            if target > 0 {
                line = left >= 0 ? tr("Zbývá ", "") + Days.int(left) + tr(" kcal", " kcal left") : Days.int(-left) + tr(" kcal navíc", " kcal over")
            }
            let text = target > 0 ? Days.int(abs(left)) : Days.int(kcal)
            return SmallValue(fraction: target > 0 ? kcal / target : 0, color: reached ? C.green : C.carbs, word: word(m),
                              text: text, line: line, symbol: symbol(m))
        case .protein:
            guard let protein = today?.food?.protein, let eaten = protein.eaten else { return empty }
            let target = protein.target ?? 0
            let reached = target > 0 && eaten >= target
            return SmallValue(fraction: target > 0 ? eaten / target : 0, color: reached ? C.green : C.protein, word: word(m),
                              text: Days.int(eaten), line: name(m) + " " + Days.int(eaten) + (target > 0 ? " / " + Days.int(target) : "") + " g",
                              symbol: symbol(m))
        case .drinks:
            guard let food = today?.food, let target = food.waterTarget, target > 0 else { return empty }
            let share = (food.water ?? 0) / target
            let percent = Int((share * 100).rounded())
            return SmallValue(fraction: share, color: share >= 1 ? C.green : C.blue, word: word(m), text: "\(percent)%",
                              line: name(m) + " \(percent) %", symbol: share >= 1 ? "checkmark" : "drop.fill")
        case .hrv:
            guard let metric = today?.hrv, let v = metric.value else { return empty }
            var value = SmallValue(fraction: band(v, metric), color: C.normal(v, metric, higherIsBetter: true), word: word(m),
                                   text: Days.int(v), line: "HRV " + Days.int(v) + " ms", symbol: symbol(m))
            value.arrow = arrow(metric, step: 3, higherIsBetter: true)
            return value
        case .restingHR:
            guard let metric = today?.restingHR, let v = metric.value else { return empty }
            var value = SmallValue(fraction: band(v, metric), color: C.normal(v, metric, higherIsBetter: false), word: word(m),
                                   text: Days.int(v), line: name(m) + " " + Days.int(v), symbol: symbol(m))
            value.arrow = arrow(metric, step: 2, higherIsBetter: false)
            return value
        case .workout:
            return workout(s, at: now) ?? empty
        case .alarm:
            return alarm(s, at: now) ?? empty
        case .logo:
            return SmallValue(fraction: 0, color: C.amber, word: "", text: "", line: "Aurin", symbol: symbol(m))
        }
    }

    /// Where the value sits in the athlete's normal band, the band in the middle of the arc.
    private static func band(_ value: Double, _ metric: WatchSnapshot.Metric) -> Double {
        guard let low = metric.low, let high = metric.high, high > low else { return 0.5 }
        return min(1, max(0.05, 0.25 + (value - low) / (high - low) * 0.5))
    }

    /// ↑ or ↓ against the day before (the last two days of the history), green the good way.
    private static func arrow(_ metric: WatchSnapshot.Metric, step: Double, higherIsBetter: Bool) -> (text: String, color: Color)? {
        let last = metric.series.suffix(2)
        guard last.count == 2, let before = last.first?.value, let value = metric.value ?? last.last?.value else { return nil }
        let change = value - before
        guard abs(change) >= step else { return nil }
        let good = (change > 0) == higherIsBetter
        return (change > 0 ? "↑" : "↓", good ? C.green : C.amber)
    }

    /// The first workout of today not done yet, while it is still to come or under way.
    static func nextToday(_ s: WatchSnapshot, at now: Date) -> WatchSnapshot.Session? {
        (s.week ?? []).first { $0.date == s.date && !$0.done }
    }

    /// "RIDE", "RUN", "GYM".
    static func sportWord(_ sport: String) -> String {
        switch sport {
        case "ride": tr("JÍZDA", "RIDE")
        case "run": tr("BĚH", "RUN")
        case "strength": tr("POSILKA", "GYM")
        case "swim": tr("PLAVÁNÍ", "SWIM")
        case "walk": tr("CHŮZE", "WALK")
        default: tr("TRÉNINK", "WORKOUT")
        }
    }

    /// Over 3 h before: the start time; in the last 3 h: the countdown filling
    /// the arc; no set time: its length; done: DONE and the strain the
    /// workouts added; in the evening or once done: tomorrow's.
    static func workout(_ s: WatchSnapshot?, at now: Date) -> SmallValue? {
        guard let s else { return nil }
        let key = Days.key(now)
        let week = s.week ?? []
        let todays = week.filter { $0.date == key }
        let evening = Calendar.current.component(.hour, from: now) >= 18
        if let next = todays.first(where: { !$0.done }), !evening || Days.at(next.time, on: key).map({ $0 > now }) == true {
            let symbol = Days.sport(next.sport)
            let word = sportWord(next.sport)
            if let start = Days.at(next.time, on: key) {
                let left = start.timeIntervalSince(now)
                if left > 3 * 3600 {
                    return SmallValue(fraction: 0, color: C.amber, word: word, text: next.time ?? "", line: next.title + " " + (next.time ?? ""), symbol: symbol)
                }
                if left > 0 {
                    let minutes = Int(left / 60)
                    return SmallValue(fraction: 1 - left / (3 * 3600), color: C.amber, word: word, text: Days.hm(Double(minutes)),
                                      line: next.title + " " + tr("za ", "in ") + Days.duration(Double(minutes)), symbol: symbol, until: start)
                }
            }
            let length = next.minutes.map { "\($0)′" } ?? ""
            return SmallValue(fraction: 0, color: C.amber, word: word, text: length, line: next.title + " " + length, symbol: symbol)
        }
        if !todays.isEmpty, todays.allSatisfy(\.done), !evening {
            let added = s.date == key ? (s.strain.training ?? s.strain.score) : nil
            return SmallValue(fraction: 1, color: C.green, word: tr("HOTOVO", "DONE"), text: added.map { "+" + Days.one($0) } ?? "✓",
                              line: tr("Trénink hotový", "Workout done") + (added.map { " · +" + Days.one($0) } ?? ""), symbol: "checkmark")
        }
        // Tomorrow's, in the evening or after today's.
        guard let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: now).map(Days.key),
              let next = week.first(where: { $0.date == tomorrow }) else { return nil }
        let day = Days.weekday(tomorrow)
        return SmallValue(fraction: 0, color: C.muted, word: day.uppercased(), text: next.time ?? (next.minutes.map { "\($0)′" } ?? "–"),
                          line: day + " " + next.title + (next.time.map { " " + $0 } ?? ""), symbol: Days.sport(next.sport))
    }

    /// During the day the bedtime with the day filling to it; from the bedtime
    /// the alarm with the night filling to it; in the morning the sleep.
    static func alarm(_ s: WatchSnapshot?, at now: Date) -> SmallValue? {
        guard let alarm = s?.alarm else { return nil }
        let key = Days.key(now)
        let hour = Calendar.current.component(.hour, from: now)
        if hour < 12, let slept = s?.sleep?.minutes, slept > 0, s?.date == key,
           let end = Days.at(s?.sleep?.end, on: key), now > end {
            let need = s?.sleep?.need ?? 480
            return SmallValue(fraction: slept / max(need, 1), color: C.sleep(slept, need: need), word: tr("SPAL", "SLEPT"),
                              text: Days.hm(slept), line: tr("Spánek ", "Slept ") + Days.duration(slept), symbol: "sun.max.fill")
        }
        let evening = alarm.evening ?? key
        guard let bed = Days.at(alarm.bedtime, on: evening) else {
            guard let wake = alarm.wake else { return nil }
            return SmallValue(fraction: 0, color: C.amber, word: tr("BUDÍK", "ALARM"), text: wake, line: name(.alarm) + " " + wake, symbol: "alarm.fill")
        }
        let wakeDay = Calendar.current.date(byAdding: .day, value: 1, to: Days.date(evening) ?? now).map(Days.key) ?? key
        let wake = Days.at(alarm.wake, on: wakeDay)
        if now < bed {
            // The day from 7 in the morning to the bedtime.
            let morning = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: bed) ?? bed.addingTimeInterval(-15 * 3600)
            let share = now.timeIntervalSince(morning) / max(bed.timeIntervalSince(morning), 1)
            return SmallValue(fraction: min(1, max(0, share)), color: C.indigo, word: tr("SPÁT", "BED"), text: alarm.bedtime ?? "",
                              line: tr("Spát v ", "Bed at ") + (alarm.bedtime ?? ""), symbol: "moon.fill")
        }
        guard let wake, let wakeText = alarm.wake else {
            return SmallValue(fraction: 1, color: C.indigo, word: tr("SPÁT", "BED"), text: alarm.bedtime ?? "", line: tr("Čas spát", "Time for bed"), symbol: "moon.fill")
        }
        let share = now.timeIntervalSince(bed) / max(wake.timeIntervalSince(bed), 1)
        return SmallValue(fraction: min(1, max(0, share)), color: C.amber, word: tr("BUDÍK", "ALARM"), text: wakeText,
                          line: name(.alarm) + " " + wakeText, symbol: "alarm.fill")
    }
}

struct SmallView: View {
    let metric: SmallMetric
    let value: SmallValue
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(value.line + (value.arrow.map { " " + $0.text } ?? ""), systemImage: value.symbol)
        case .accessoryCorner:
            if metric == .logo {
                AurinMark().padding(4)
            } else {
                // The name and the value along the edge, the icon in the corner.
                Image(systemName: value.symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(value.color)
                    .widgetAccentable()
                    .widgetLabel {
                        Gauge(value: min(1, max(0, value.fraction))) {
                            Text(value.word)
                        } currentValueLabel: {
                            Text(value.text)
                        } minimumValueLabel: {
                            Text(value.word)
                        } maximumValueLabel: {
                            valueText
                        }
                        .tint(value.color)
                    }
            }
        default:
            if metric == .logo {
                AurinMark()
            } else {
                ZStack {
                    SegmentedArc(fraction: value.fraction, color: value.color)
                    valueText
                        .font(.system(size: value.text.count > 4 || value.until != nil ? 13 : 17, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.bottom, 3)
                    Text(value.word)
                        .font(.system(size: 7.5, weight: .bold))
                        .foregroundStyle(value.color)
                        .widgetAccentable()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 1)
                }
                .overlay(alignment: .topTrailing) {
                    if let arrow = value.arrow {
                        Text(arrow.text)
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(arrow.color)
                            .frame(width: 14, height: 14)
                            .background { Circle().fill(.black) }
                    }
                }
            }
        }
    }

    /// The value, or the countdown that runs by itself.
    @ViewBuilder private var valueText: some View {
        if let until = value.until, until > Date() {
            Text(timerInterval: Date()...until, countsDown: true, showsHours: true)
        } else {
            Text(value.text)
        }
    }
}

/// The app's ring on the watch (WatchStyle Ring): ten thick arcs over three
/// quarters of a circle, open at the bottom for the word, the rest in a dim
/// shade of the same colour (mockup 45, A).
struct SegmentedArc: View {
    let fraction: Double
    let color: Color
    var lineWidth: CGFloat = 5.5
    private let count = 10
    private let sweep = 0.75

    var body: some View {
        let filled = Int((min(1, max(0, fraction)) * Double(count)).rounded())
        ZStack {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .trim(from: sweep * Double(i) / Double(count) + 0.008, to: sweep * Double(i + 1) / Double(count) - 0.008)
                    .stroke(i < filled ? color : color.opacity(0.28), style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                    // The trim starts at 3 o'clock; the open quarter goes to the bottom.
                    .rotationEffect(.degrees(135))
                    .widgetAccentable(i < filled)
            }
        }
        .padding(2)
    }
}

/// Aurin's mark for the logo complication: the sun and its dashed arc.
struct AurinMark: View {
    var body: some View {
        ZStack {
            Circle().fill(Color(white: 0.09))
            GeometryReader { geo in
                let s = min(geo.size.width, geo.size.height)
                ZStack {
                    Circle()
                        .trim(from: 0.5, to: 1)
                        .stroke(C.amber, style: StrokeStyle(lineWidth: s * 0.06, lineCap: .round, dash: [s * 0.07, s * 0.08]))
                        .frame(width: s * 0.62, height: s * 0.62)
                        .offset(y: s * 0.06)
                    Circle().fill(C.amber).frame(width: s * 0.3, height: s * 0.3).offset(y: s * 0.06)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .widgetAccentable()
        }
        .accessibilityLabel("Aurin")
    }
}

// MARK: - Wide

enum WideKind: String {
    case aurin, today, day, workout, food, drinks, night
}

@MainActor
enum WideComplication {
    static func configuration(_ kind: WideKind) -> some WidgetConfiguration {
        StaticConfiguration(kind: "aurin.wide." + kind.rawValue, provider: DayProvider()) { entry in
            WideView(kind: kind, entry: entry)
                .containerBackground(.black, for: .widget)
                .widgetURL(Tap.url(for: kind, entry))
        }
        .configurationDisplayName(name(kind))
        .description(kind == .aurin ? Small.about(.aurin) : kind == .today
                     ? tr("Co dnes dělat: připravenost a další trénink.", "What to do today: readiness and the next workout.")
                     : tr("Z dneška v aplikaci Aurin.", "From today in Aurin."))
        .supportedFamilies([.accessoryRectangular])
    }

    static func name(_ kind: WideKind) -> String {
        switch kind {
        case .aurin: tr("Aurin přes den", "Aurin through the day")
        case .today: tr("Dnes", "Today")
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
        entry.snapshot.flatMap { $0.date == Days.key(entry.date) ? $0 : nil }
    }

    var body: some View {
        switch kind {
        case .aurin:
            switch Moment.at(today, entry.date) {
            case .workout: workout
            case .night: night
            case .readiness: morning
            }
        case .today: todayView
        case .day: day
        case .workout: workout
        case .food: food
        case .drinks: drinks
        case .night: night
        }
    }

    /// A small label over the line, in the value's colour.
    private func head(_ text: String, _ color: Color) -> some View {
        Text(text).font(.system(size: 8.5, weight: .bold)).tracking(0.4).foregroundStyle(color).lineLimit(1).widgetAccentable()
    }

    /// Readiness in the app's ring with its word at the bottom.
    private func readinessRing(_ value: SmallValue) -> some View {
        ZStack {
            SegmentedArc(fraction: value.fraction, color: value.color, lineWidth: 5)
            Text(value.text).font(.system(size: 17, weight: .bold, design: .rounded)).minimumScaleFactor(0.6).padding(.bottom, 2)
            Text(value.word).font(.system(size: 7, weight: .bold)).foregroundStyle(value.color)
                .lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxHeight: .infinity, alignment: .bottom).padding(.horizontal, 8)
        }
        .frame(width: 46, height: 46)
    }

    /// "Go hard", "Steady", "Easy" by the zone.
    private func dayWord(_ zone: String?) -> String {
        switch zone {
        case "red": tr("ZLEHKA", "EASY")
        case "yellow": tr("S MÍROU", "STEADY")
        default: tr("NAPLNO", "GO HARD")
        }
    }

    /// Today (new): readiness, the day's word and the next workout with its countdown.
    private var todayView: some View {
        let r = Small.value(.readiness, entry.snapshot, at: entry.date)
        var ring = r
        if today != nil, let zone = today?.zone { ring.word = zoneWord(zone) }
        let next = today.flatMap { Small.nextToday($0, at: entry.date) }
        return HStack(spacing: 8) {
            readinessRing(ring)
            VStack(alignment: .leading, spacing: 1) {
                if let today {
                    head(tr("DNES · ", "TODAY · ") + dayWord(today.zone), C.zone(today.zone))
                    if let next {
                        Text(next.title + (next.minutes.map { " \($0)′" } ?? ""))
                            .font(.system(size: 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        startLine(next, on: today.date)
                    } else if let headline = today.headline {
                        Text(headline).font(.system(size: 13, weight: .semibold)).lineLimit(2).minimumScaleFactor(0.8)
                    } else {
                        Text(tr("Bez tréninku", "No workout today")).font(.system(size: 14, weight: .semibold))
                    }
                } else {
                    head(tr("DNES", "TODAY"), C.stale)
                    Text(tr("Čekám na dnešek", "Waiting for today")).font(.system(size: 14, weight: .semibold)).foregroundStyle(C.muted)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// The ring's word: high, moderate, low.
    private func zoneWord(_ zone: String) -> String {
        switch zone {
        case "red": tr("NÍZKÁ", "LOW")
        case "yellow": tr("STŘEDNÍ", "MID")
        default: tr("VYSOKÁ", "HIGH")
        }
    }

    /// "17:30 · in 1 hr, 23 min" while it is still to come.
    @ViewBuilder private func startLine(_ s: WatchSnapshot.Session, on key: String) -> some View {
        if let start = Days.at(s.time, on: key), start > entry.date {
            (Text((s.time ?? "") + " · " + tr("za ", "in ")) + Text(start, style: .relative))
                .font(.system(size: 11)).foregroundStyle(C.muted).lineLimit(1)
        } else {
            Text([s.time, s.minutes.map { "\($0) min" }].compactMap { $0 }.joined(separator: " · "))
                .font(.system(size: 11)).foregroundStyle(C.muted).lineLimit(1)
        }
    }

    /// Aurin through the day in the morning: readiness, the night and HRV.
    private var morning: some View {
        let r = Small.value(.readiness, entry.snapshot, at: entry.date)
        return HStack(spacing: 8) {
            readinessRing(r)
            VStack(alignment: .leading, spacing: 1) {
                if let today {
                    head(tr("RÁNO · ", "MORNING · ") + (today.zone.map(zoneWord) ?? ""), C.zone(today.zone))
                    Text(today.sleep?.minutes.map { tr("Spánek ", "Slept ") + Days.hm($0) } ?? tr("Spánek –", "Sleep –"))
                        .font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    if let hrv = today.hrv?.value {
                        Text("HRV " + Days.int(hrv) + (today.hrv.map { m in
                            guard let low = m.low, let high = m.high else { return "" }
                            return " · " + (hrv < low ? tr("pod normálem", "below normal") : hrv > high ? tr("nad normálem", "above normal") : tr("v normálu", "normal"))
                        } ?? ""))
                        .font(.system(size: 11)).foregroundStyle(C.muted).lineLimit(1)
                    }
                } else {
                    head(tr("RÁNO", "MORNING"), C.stale)
                    Text(tr("Čekám na dnešek", "Waiting for today")).font(.system(size: 14, weight: .semibold)).foregroundStyle(C.muted)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /// Readiness, sleep and strain with their names, values and ten-step bars.
    private var day: some View {
        HStack(spacing: 0) {
            ForEach(Array([SmallMetric.readiness, .sleep, .strain].enumerated()), id: \.offset) { index, m in
                let v = Small.value(m, entry.snapshot, at: entry.date)
                VStack(alignment: .leading, spacing: 1) {
                    head(v.word, v.color)
                    Text(v.text).font(.system(size: 18, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.6)
                    StepBar(fraction: v.fraction, color: v.color)
                }
                .padding(.horizontal, 5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) {
                    if index > 0 { Rectangle().fill(Color.white.opacity(0.14)).frame(width: 1) }
                }
            }
        }
    }

    /// The next workout: its name and a countdown that runs, start and length,
    /// and the plan's steps by zone (or a block a quarter hour without them);
    /// once done, what it took and added.
    private var workout: some View {
        let key = Days.key(entry.date)
        let week = entry.snapshot?.week ?? []
        let todays = week.filter { $0.date == key }
        let next = todays.first { !$0.done } ?? week.first { $0.date > key }
        let evening = Calendar.current.component(.hour, from: entry.date) >= 18
        return VStack(alignment: .leading, spacing: 2) {
            if !todays.isEmpty, todays.allSatisfy(\.done), !evening, let last = todays.last {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                    Text(last.title + tr(" hotovo", " done")).lineLimit(1)
                }
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(C.green)
                let added = today?.strain.training
                Text([last.minutes.map { "\($0) min" }, added.map { "+" + Days.one($0) + tr(" námahy", " strain") }].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 15, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                if let score = today?.strain.score {
                    Text(tr("den ", "day ") + Days.one(score) + (today?.strain.high.map { h in
                        today?.strain.low.map { tr(" z ", " of ") + Days.int($0) + "–" + Days.int(h) } ?? ""
                    } ?? ""))
                    .font(.system(size: 11)).foregroundStyle(C.muted)
                }
            } else if let next {
                HStack(spacing: 4) {
                    Image(systemName: Days.sport(next.sport)).foregroundStyle(C.amber)
                    Text(next.title).foregroundStyle(C.amber).lineLimit(1)
                    Spacer(minLength: 2)
                    if next.date == key, let start = Days.at(next.time, on: key), start > entry.date, start.timeIntervalSince(entry.date) <= 3 * 3600 {
                        (Text(tr("za ", "in ")) + Text(timerInterval: entry.date...start, countsDown: true, showsHours: true))
                            .foregroundStyle(.white).monospacedDigit().lineLimit(1)
                    }
                }
                .font(.system(size: 12, weight: .semibold))
                Text([next.date == key ? tr("Dnes", "Today") : Days.weekday(next.date), next.time, next.minutes.map { "\($0) min" }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 11)).foregroundStyle(C.muted).lineLimit(1)
                if let plan = entry.plan, plan.id == next.eventId {
                    PlanSteps(plan: plan.plan).frame(height: 17).padding(.top, 2)
                } else if let minutes = next.minutes {
                    HStack(spacing: 4) {
                        // The length as blocks, one per quarter hour.
                        ForEach(0..<min(8, max(1, minutes / 15)), id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 2).fill(C.amber).frame(width: 10, height: 6)
                        }
                    }
                    .padding(.top, 3)
                }
            } else {
                Text(tr("Trénink", "Workout")).font(.system(size: 12, weight: .semibold)).foregroundStyle(C.amber)
                Text(tr("Tento týden už nic", "Nothing left this week")).font(.system(size: 14)).foregroundStyle(C.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// What is left of the day's energy, then carbs, protein and fat each against its goal.
    private var food: some View {
        let food = today?.food
        let kcal = food?.kcal ?? 0
        let target = food?.target ?? 0
        let rows: [(String, WatchSnapshot.Macro?, Color)] = [(tr("S", "C"), food?.carbs, C.carbs), (tr("B", "P"), food?.protein, C.protein), (tr("T", "F"), food?.fat, C.fat)]
        return VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "fork.knife").foregroundStyle(C.carbs)
                Group {
                    if food?.kcal == nil {
                        Text(tr("Jídlo", "Food"))
                    } else if target > 0 {
                        Text(kcal <= target ? tr("zbývá ", "") + Days.thousands(target - kcal) + tr(" kcal", " kcal left")
                                            : Days.thousands(kcal - target) + tr(" kcal navíc", " kcal over"))
                    } else {
                        Text(Days.thousands(kcal) + " kcal")
                    }
                }
                .foregroundStyle(target > 0 && kcal >= target ? C.green : C.carbs)
                .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 2)
                if target > 0 { Text(tr("z ", "of ") + Days.thousands(target)).font(.system(size: 10)).foregroundStyle(C.muted) }
            }
            .font(.system(size: 12, weight: .semibold))
            HStack(spacing: 6) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    let eaten = row.1?.eaten ?? 0
                    let goal = row.1?.target ?? 0
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(row.0 + " ").foregroundStyle(row.2) + Text(Days.int(eaten)).foregroundStyle(.white)
                            + Text(goal > 0 ? "/" + Days.int(goal) : "").foregroundStyle(C.muted))
                            .font(.system(size: 9.5, weight: .semibold))
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Line(fraction: goal > 0 ? eaten / goal : 0, color: goal > 0 && eaten >= goal ? C.green : row.2, height: 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    /// Water of the day's goal: a drop, the bar and the percent, green at the goal.
    private var drinks: some View {
        let v = Small.value(.drinks, entry.snapshot, at: entry.date)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "drop.fill").foregroundStyle(v.color)
                Text(tr("Pití", "Drinks")).foregroundStyle(v.color)
                Spacer()
                Text(v.text).foregroundStyle(.white)
            }
            .font(.system(size: 13, weight: .semibold))
            if let food = today?.food, let target = food.waterTarget {
                let imperial = today?.imperial == true
                Text(imperial ? Days.int((food.water ?? 0) / 29.5735) + " / " + Days.int(target / 29.5735) + " fl oz"
                              : Days.liters(food.water ?? 0) + " / " + Days.liters(target))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
            }
            Line(fraction: v.fraction, color: v.color, height: 6)
        }
    }

    /// Tonight: how long until bed (or the alarm), and where now is on the
    /// line from the morning through the bedtime to the wake time.
    private var night: some View {
        let alarm = entry.snapshot?.alarm
        let key = Days.key(entry.date)
        let evening = alarm?.evening ?? key
        let bed = Days.at(alarm?.bedtime, on: evening)
        let wakeDay = Calendar.current.date(byAdding: .day, value: 1, to: Days.date(evening) ?? entry.date).map(Days.key) ?? key
        let wake = Days.at(alarm?.wake, on: wakeDay)
        return VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "moon.fill")
                if let bed, bed > entry.date {
                    Text(tr("Spát za ", "Bed in ")) + Text(bed, style: .relative)
                } else if let wake, wake > entry.date {
                    Text(tr("Budík za ", "Alarm in ")) + Text(wake, style: .relative)
                } else {
                    Text(tr("Noc", "Night"))
                }
            }
            .font(.system(size: 12, weight: .semibold)).foregroundStyle(C.indigo).lineLimit(1)
            NightLine(now: entry.date, bed: bed, wake: wake)
                .frame(height: 11)
                .padding(.top, 2)
            HStack {
                Text(tr("teď", "now")).foregroundStyle(.white)
                Spacer()
                Text(alarm?.bedtime ?? "–").foregroundStyle(C.indigo)
                Spacer()
                Text(alarm?.wake ?? "–").foregroundStyle(C.amber)
            }
            .font(.system(size: 12, weight: .semibold))
        }
    }
}

/// Ten steps filled up to the value, the rest dim.
struct StepBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        let filled = Int((min(1, max(0, fraction)) * 10).rounded())
        HStack(spacing: 1.5) {
            ForEach(0..<10, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1)
                    .fill(i < filled ? color : color.opacity(0.28))
                    .widgetAccentable(i < filled)
            }
        }
        .frame(height: 4)
    }
}

/// A thin bar filled to `fraction`.
struct Line: View {
    let fraction: Double
    let color: Color
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18))
                Capsule().fill(color).frame(width: g.size.width * min(1, max(0, fraction))).widgetAccentable()
            }
        }
        .frame(height: height)
    }
}

/// From the morning (7:00) to the bedtime and on to the wake time, with a
/// white dot where now is: the day dim, the night from indigo to amber.
struct NightLine: View {
    let now: Date
    let bed: Date?
    let wake: Date?

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let start = bed.flatMap { Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: $0) } ?? now.addingTimeInterval(-12 * 3600)
            let end = wake ?? (bed ?? now).addingTimeInterval(8 * 3600)
            let span = max(end.timeIntervalSince(start), 1)
            let x = { (d: Date) in CGFloat(min(1, max(0, d.timeIntervalSince(start) / span))) * w }
            let bedX = bed.map(x) ?? w * 0.6
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18)).frame(height: 5)
                Capsule().fill(C.indigo.opacity(0.45)).frame(width: bedX, height: 5)
                Capsule().fill(LinearGradient(colors: [C.indigo, C.amber], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(0, w - bedX), height: 5)
                    .offset(x: bedX)
                Circle().fill(.white).frame(width: 9, height: 9)
                    .overlay { Circle().stroke(.black, lineWidth: 2) }
                    .offset(x: x(now) - 4.5)
            }
            .frame(height: g.size.height)
        }
    }
}

/// A ride's or run's steps as blocks over time, their height and colour by
/// zone (the watch app's PlanBars).
struct PlanSteps: View {
    let plan: WatchPlan

    var body: some View {
        let steps = plan.ridden
        let total = max(steps.map(\.seconds).reduce(0, +), 1)
        GeometryReader { geo in
            let gap: CGFloat = steps.count > 30 ? 0.5 : 1.5
            let width = geo.size.width - gap * CGFloat(max(steps.count - 1, 0))
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(C.zoneStep(s.zone))
                        .frame(width: max(1, width * CGFloat(s.seconds / total)),
                               height: geo.size.height * CGFloat(0.28 + 0.12 * Double(min(s.zone, 6))))
                }
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
    }
}

// MARK: - Taps

/// Where a tap on a complication opens the watch app (WatchRoot.open).
enum Tap {
    static func url(for metric: SmallMetric, _ entry: DayEntry) -> URL? {
        let page: String
        switch metric {
        case .aurin:
            switch Moment.at(entry.snapshot, entry.date) {
            case .workout: page = "training"
            case .night: page = "alarm"
            case .readiness: page = "readiness"
            }
        case .readiness, .logo: page = "readiness"
        case .sleep: page = "sleep"
        case .strain: page = "strain"
        case .hrv: page = "hrv"
        case .restingHR: page = "restingHR"
        case .calories, .protein, .drinks: page = "food"
        case .workout: page = "training"
        case .alarm: page = "alarm"
        }
        return URL(string: "aurinwatch://open/" + page)
    }

    static func url(for kind: WideKind, _ entry: DayEntry) -> URL? {
        let page: String
        switch kind {
        case .aurin:
            switch Moment.at(entry.snapshot, entry.date) {
            case .workout: page = "training"
            case .night: page = "alarm"
            case .readiness: page = "readiness"
            }
        case .today, .workout: page = "training"
        case .day: page = "readiness"
        case .food, .drinks: page = "food"
        case .night: page = "alarm"
        }
        return URL(string: "aurinwatch://open/" + page)
    }
}

// MARK: - Look and words

enum C {
    static let muted = Color(red: 0x9A / 255, green: 0xA3 / 255, blue: 0x9F / 255)
    /// Not today's data: yesterday's number in grey.
    static let stale = Color(red: 0x6E / 255, green: 0x74 / 255, blue: 0x71 / 255)
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

    /// The night against its need: green within half an hour of it (as on the
    /// first page), amber short of that, red under three quarters.
    static func sleep(_ minutes: Double, need: Double) -> Color {
        if minutes >= need - 30 { return green }
        return minutes >= need * 0.75 ? amber : red
    }

    /// Strain against the day's target: neutral before 18:00 (the morning is
    /// always under it), green within it, amber over it or still under it in the evening.
    static func strain(_ score: Double, low: Double?, high: Double?, at now: Date) -> Color {
        guard let low, let high else { return amber }
        if score > high { return amber }
        if score >= low { return green }
        return Calendar.current.component(.hour, from: now) >= 18 ? amber : indigo
    }

    /// HRV or resting HR against the athlete's normal: green within it or
    /// better, amber the worse way.
    static func normal(_ value: Double, _ m: WatchSnapshot.Metric, higherIsBetter: Bool) -> Color {
        guard let low = m.low, let high = m.high, high > low else { return green }
        let worse = higherIsBetter ? value < low : value > high
        return worse ? amber : green
    }

    /// The watch app's zone colours (PlanStore.color).
    static func zoneStep(_ zone: Int) -> Color {
        switch zone {
        case 1: Color(red: 0x6B / 255, green: 0x72 / 255, blue: 0x75 / 255)
        case 2: blue
        case 3: green
        case 4: amber
        case 5: Color(red: 0xF0 / 255, green: 0x90 / 255, blue: 0x7A / 255)
        default: indigo
        }
    }
}

/// The iPhone app's language from the last Today, else the watch's, read
/// once per timeline (Lang.set) instead of from the Keychain for every word.
enum Lang {
    nonisolated(unsafe) private static var cached: Bool?

    static var english: Bool {
        if let cached { return cached }
        let value = compute(ComplicationShelf.load())
        cached = value
        return value
    }

    static func set(_ snapshot: WatchSnapshot?) {
        cached = compute(snapshot)
    }

    private static func compute(_ snapshot: WatchSnapshot?) -> Bool {
        if let language = snapshot?.language { return language == "en" }
        let first = Locale.preferredLanguages.first?.lowercased() ?? ""
        return !(first.hasPrefix("cs") || first.hasPrefix("sk"))
    }
}

var english: Bool { Lang.english }

func tr(_ czech: String, _ englishText: String) -> String { english ? englishText : czech }

enum Days {
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

    nonisolated(unsafe) private static var formatters: [String: DateFormatter] = [:]
    nonisolated(unsafe) private static var numbers: [String: NumberFormatter] = [:]

    private static var locale: Locale { Locale(identifier: english ? "en_US" : "cs_CZ") }

    static func weekday(_ key: String) -> String {
        guard let day = date(key) else { return "" }
        let id = english ? "en" : "cs"
        let f = formatters[id] ?? {
            let f = DateFormatter()
            f.locale = locale
            f.dateFormat = "EEE"
            formatters[id] = f
            return f
        }()
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

    private static func number(_ digits: Int, grouping: Bool) -> NumberFormatter {
        let id = (english ? "en" : "cs") + "\(digits)\(grouping)"
        if let f = numbers[id] { return f }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.usesGroupingSeparator = grouping
        f.minimumFractionDigits = digits
        f.maximumFractionDigits = digits
        f.locale = locale
        numbers[id] = f
        return f
    }

    static func one(_ v: Double) -> String {
        number(1, grouping: false).string(from: NSNumber(value: v)) ?? String(format: "%.1f", v)
    }

    /// "2,400" / "2 400".
    static func thousands(_ v: Double) -> String {
        number(0, grouping: true).string(from: NSNumber(value: v.rounded())) ?? int(v)
    }

    /// "7:38", as on the small ones.
    static func hm(_ minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return "\(m / 60):\(String(format: "%02d", m % 60))"
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
        let key = Days.key(Date())
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
