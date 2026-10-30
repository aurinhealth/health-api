import AppIntents
import SwiftUI
import WidgetKit

// The number widget (its metric picked in Edit Widget), the week (large) and
// the next workout (small, also for StandBy). Petr's yes on the mockup, 2026-10-28.

// MARK: - One number

enum WidgetMetric: String, AppEnum {
    case readiness, sleep, hrv, restingHR, steps, kcalLeft, water

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: LocalizedStringResource("Údaj", table: "Controls"))
    static let caseDisplayRepresentations: [WidgetMetric: DisplayRepresentation] = [
        .readiness: DisplayRepresentation(title: LocalizedStringResource("Připravenost", table: "Controls")),
        .sleep: DisplayRepresentation(title: LocalizedStringResource("Spánek", table: "Controls")),
        .hrv: DisplayRepresentation(title: LocalizedStringResource("HRV", table: "Controls")),
        .restingHR: DisplayRepresentation(title: LocalizedStringResource("Klidový tep", table: "Controls")),
        .steps: DisplayRepresentation(title: LocalizedStringResource("Kroky", table: "Controls")),
        .kcalLeft: DisplayRepresentation(title: LocalizedStringResource("Zbývá kalorií", table: "Controls")),
        .water: DisplayRepresentation(title: LocalizedStringResource("Pití", table: "Controls")),
    ]
}

struct MetricWidgetIntent: WidgetConfigurationIntent {
    static let title = LocalizedStringResource("Údaj", table: "Controls")
    static let description = IntentDescription(LocalizedStringResource("Vyber, které číslo widget ukáže.", table: "Controls"))

    @Parameter(title: LocalizedStringResource("Údaj", table: "Controls"), default: .hrv)
    var metric: WidgetMetric
}

struct MetricEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let metric: WidgetMetric
}

struct MetricProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MetricEntry { MetricEntry(date: Date(), snapshot: .sample, metric: .hrv) }

    func snapshot(for configuration: MetricWidgetIntent, in context: Context) async -> MetricEntry {
        let saved = context.isPreview ? (WidgetSnapshot.load() ?? .sample) : WidgetSnapshot.load()
        return MetricEntry(date: Date(), snapshot: saved?.current(today: PendingDrinks.localDate()), metric: configuration.metric)
    }

    func timeline(for configuration: MetricWidgetIntent, in context: Context) async -> Timeline<MetricEntry> {
        // Like SnapshotProvider: now, and midnight starting the new day.
        let now = Date()
        let saved = WidgetSnapshot.load()
        var entries = [MetricEntry(date: now, snapshot: saved?.current(today: PendingDrinks.localDate(now)), metric: configuration.metric)]
        if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) {
            entries.append(MetricEntry(date: midnight, snapshot: saved?.current(today: PendingDrinks.localDate(midnight)), metric: configuration.metric))
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(60 * 60)))
    }
}

struct MetricWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "metric", intent: MetricWidgetIntent.self, provider: MetricProvider()) { entry in
            MetricWidgetView(entry: entry)
                .widgetURL(URL(string: entry.metric.link))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Jedno číslo")))
        .description(Text(verbatim: L10n.tr("Číslo, které si vybereš: HRV, klidový tep, kroky a další.")))
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryInline])
    }
}

extension WidgetMetric {
    var title: String {
        switch self {
        case .readiness: return L10n.tr("Připravenost")
        case .sleep: return L10n.tr("Spánek")
        case .hrv: return "HRV"
        case .restingHR: return L10n.tr("Klidový tep")
        case .steps: return L10n.tr("Kroky")
        case .kcalLeft: return L10n.tr("Zbývá kalorií")
        case .water: return L10n.tr("Pití")
        }
    }

    var color: Color {
        switch self {
        case .readiness: return W.green
        case .sleep, .hrv: return W.indigo
        case .restingHR, .kcalLeft: return W.rust
        case .steps: return W.amber
        case .water: return W.blue
        }
    }

    var link: String {
        switch self {
        case .readiness: return "loadwise://open/readiness"
        case .sleep: return "loadwise://open/sleep"
        case .hrv: return "loadwise://open/hrv"
        case .restingHR: return "loadwise://open/metric/restingHR"
        case .steps: return "loadwise://open/steps"
        case .kcalLeft, .water: return "loadwise://open/food"
        }
    }

    /// The last seven days and the usual range, for HRV and resting heart rate.
    func trend(_ s: WidgetSnapshot) -> (values: [Double], low: Double?, high: Double?)? {
        let picked: (series: [Double]?, low: Double?, high: Double?)
        switch self {
        case .hrv: picked = (s.hrvSeries, s.hrvLow, s.hrvHigh)
        case .restingHR: picked = (s.restingSeries, s.restingLow, s.restingHigh)
        default: return nil
        }
        guard let values = picked.series, values.count >= 2 else { return nil }
        return (values, picked.low, picked.high)
    }

    /// The number, its unit and the line under it.
    func value(_ s: WidgetSnapshot) -> (number: String, unit: String, note: String?) {
        switch self {
        case .readiness:
            return (s.readiness.map(String.init) ?? "–", "", W.zoneWord(s.zone))
        case .sleep:
            return (W.hm(s.sleepMinutes), "h", s.sleepIndex.map { L10n.f("index %@", String($0)) })
        case .hrv:
            return (W.int(s.hrv), "ms", Self.range(s.hrv, s.hrvLow, s.hrvHigh))
        case .restingHR:
            return (W.int(s.restingHR), "bpm", Self.range(s.restingHR, s.restingLow, s.restingHigh))
        case .steps:
            return (W.int(s.steps), "", s.stepsGoal.map { L10n.f("cíl %@", W.int($0)) })
        case .kcalLeft:
            guard let target = s.kcalTarget else { return ("–", "kcal", nil) }
            let left = target - (s.kcal ?? 0)
            return (W.int(max(0, left)), "kcal", L10n.f("z %@", W.int(target)))
        case .water:
            let litres = !Units.imperial
            let shown: (Double?) -> String = { ml in litres ? W.decimal((ml ?? 0) / 1000) : W.int(Units.volume(ml ?? 0)) }
            return (shown(s.waterMl), litres ? "l" : Units.volumeUnit, s.waterTarget.map { L10n.f("cíl %@", shown($0)) })
        }
    }

    private static func range(_ value: Double?, _ low: Double?, _ high: Double?) -> String? {
        guard let value, let low, let high else { return nil }
        if value < low { return L10n.tr("pod tvým rozmezím") }
        if value > high { return L10n.tr("nad tvým rozmezím") }
        return L10n.tr("v tvém rozmezí")
    }
}

struct MetricWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MetricEntry

    var body: some View {
        if let s = entry.snapshot {
            let v = entry.metric.value(s)
            switch family {
            case .accessoryInline:
                Text(entry.metric.title + " " + v.number + (v.unit.isEmpty ? "" : " " + v.unit))
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.metric.title).font(.caption)
                    Text(v.number + (v.unit.isEmpty ? "" : " " + v.unit)).font(.headline)
                    if let note = v.note { Text(note).font(.caption) }
                }
            default:
                let trend = entry.metric.trend(s)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Circle().fill(entry.metric.color).frame(width: 7, height: 7)
                        Text(entry.metric.title).font(.caption.weight(.medium)).foregroundStyle(W.muted)
                    }
                    if trend == nil { Spacer(minLength: 0) }
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(v.number).font(W.number(trend == nil ? 50 : 42)).foregroundStyle(W.ink).minimumScaleFactor(0.5).lineLimit(1)
                            .widgetAccentable()
                        if !v.unit.isEmpty { Text(v.unit).font(.caption).foregroundStyle(W.muted) }
                    }
                    // HRV and resting heart rate: the week's line over the usual range.
                    if let trend {
                        Spacer(minLength: 4)
                        WidgetTrend(values: trend.values, low: trend.low, high: trend.high, color: entry.metric.color)
                            .frame(height: 30)
                        if let note = v.note { Text(note + " · " + L10n.tr("7 dní")).font(.caption2).foregroundStyle(W.muted).lineLimit(1).padding(.top, 4) }
                    } else if let note = v.note {
                        Text(note).font(.caption2).foregroundStyle(W.muted).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - The week

struct WeekEntry: TimelineEntry {
    let date: Date
    let week: WidgetWeek?
    let zones: [String: String]
    let today: String
    var readiness: Int? = nil
    var zone: String? = nil
}

struct WeekProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeekEntry {
        WeekEntry(date: Date(), week: .sample, zones: ["2026-10-05": "green", "2026-10-06": "yellow", "2026-10-07": "green", "2026-10-09": "green"],
                  today: "2026-10-08", readiness: 78, zone: "green")
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        if context.isPreview, WidgetWeek.load() == nil { completion(placeholder(in: context)); return }
        completion(entry(Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        let now = Date()
        var entries = [entry(now)]
        if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) {
            entries.append(entry(midnight))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(60 * 60))))
    }

    private func entry(_ date: Date) -> WeekEntry {
        let today = PendingDrinks.localDate(date)
        let week = WidgetWeek.load().flatMap { $0.covers(today) ? $0 : nil }
        let snapshot = WidgetSnapshot.load()?.current(today: today)
        return WeekEntry(date: date, week: week, zones: snapshot?.weekZones ?? [:], today: today, readiness: snapshot?.readiness, zone: snapshot?.zone)
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "week", provider: WeekProvider()) { entry in
            WeekWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/training"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Týden")))
        .description(Text(verbatim: L10n.tr("Trénink po dnech, splněné tréninky a co tě čeká.")))
        .supportedFamilies([.systemLarge])
    }
}

struct WeekWidgetView: View {
    let entry: WeekEntry

    var body: some View {
        if let week = entry.week {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(L10n.tr("Tento týden")).font(.subheadline.weight(.semibold)).foregroundStyle(W.ink)
                        Text(summary(week)).font(.caption).foregroundStyle(W.muted)
                    }
                    Spacer()
                    // Today's readiness as a word and number, not a second ring
                    // beside the small Připravenost widget.
                    if let score = entry.readiness {
                        Text((W.zoneWord(entry.zone).map { $0.capitalized(with: L10n.locale) + " · " } ?? "") + String(score))
                            .font(.caption.weight(.semibold)).foregroundStyle(W.zoneColor(entry.zone))
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(W.zoneColor(entry.zone).opacity(0.14), in: Capsule())
                            .widgetAccentable()
                    }
                }
                bars(week).padding(.top, 14)
                Divider().padding(.top, 12).padding(.bottom, 4)
                if week.next.isEmpty {
                    Text(L10n.tr("Na zbytek týdne nic naplánovaného.")).font(.caption).foregroundStyle(W.muted)
                } else {
                    VStack(spacing: 7) {
                        ForEach(Array(week.next.enumerated()), id: \.offset) { _, session in row(session) }
                    }
                }
                Spacer(minLength: 0)
            }
        } else {
            EmptyWidgetView()
        }
    }

    private func summary(_ week: WidgetWeek) -> String {
        let time = W.hm(week.minutes) + " h"
        guard week.planned > 0 else { return time }
        return time + " · " + L10n.f("%@ z %@ splněno", String(week.done), String(week.planned))
    }

    /// Done training as solid bars in the day's readiness colour, what the
    /// plan still has as dashed ones; today's letter in a dark dot.
    private func bars(_ week: WidgetWeek) -> some View {
        let most = max(60, week.days.map { max($0.minutes, $0.planned) }.max() ?? 0)
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(week.days, id: \.date) { day in
                VStack(spacing: 5) {
                    if day.minutes > 0 {
                        RoundedRectangle(cornerRadius: 5).fill(color(day))
                            .frame(height: max(5, 112 * day.minutes / most))
                            .widgetAccentable()
                    } else if day.planned > 0 {
                        RoundedRectangle(cornerRadius: 5)
                            .strokeBorder(W.amber.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .background(RoundedRectangle(cornerRadius: 5).fill(W.amber.opacity(0.07)))
                            .frame(height: 112 * day.planned / most)
                    } else {
                        RoundedRectangle(cornerRadius: 3).fill(W.muted.opacity(0.18)).frame(height: 5)
                    }
                    let today = day.date == entry.today
                    Text(weekday(day.date)).font(.caption2.weight(today ? .bold : .medium))
                        .foregroundStyle(today ? Palette.onButton : W.muted)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(today ? Palette.button : .clear))
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 140, alignment: .bottom)
    }

    /// The day's readiness zone, else the training colour.
    private func color(_ day: WidgetWeek.Day) -> Color {
        entry.zones[day.date].map { W.zoneColor($0) } ?? W.amber
    }

    private func row(_ session: WidgetWeek.Session) -> some View {
        HStack(spacing: 10) {
            Image(systemName: Self.symbol(session.sport)).font(.caption).foregroundStyle(W.amber)
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 8).fill(Palette.amberSoft))
            Text(session.title).font(.subheadline.weight(.medium)).foregroundStyle(W.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(when(session)).font(.caption).foregroundStyle(W.muted).lineLimit(1)
        }
    }

    private func when(_ session: WidgetWeek.Session) -> String {
        let day = session.date == entry.today ? L10n.tr("Dnes") : weekday(session.date, short: false)
        return day + (session.time.map { " " + ClockText.format($0) } ?? "")
    }

    private func weekday(_ date: String, short: Bool = true) -> String {
        let parse = DateFormatter()
        parse.calendar = Calendar(identifier: .gregorian)
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let d = parse.date(from: date) else { return "" }
        let f = DateFormatter()
        f.locale = L10n.locale
        f.dateFormat = short ? "EEEEE" : "EEE"
        return f.string(from: d).capitalized(with: L10n.locale)
    }

    static func symbol(_ sport: String?) -> String {
        switch sport {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "strength": return "dumbbell.fill"
        case "swim": return "figure.pool.swim"
        case "walk": return "figure.walk"
        default: return "figure.mixed.cardio"
        }
    }
}

// MARK: - The next workout (StandBy)

struct NextWorkoutWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "next", provider: SnapshotProvider()) { entry in
            NextWorkoutWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/training"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Další trénink")))
        .description(Text(verbatim: L10n.tr("Dnešní trénink, jeho čas a délka. Hodí se i do StandBy.")))
        .supportedFamilies([.systemSmall])
    }
}

struct NextWorkoutWidgetView: View {
    /// False in StandBy: the name big, without the card.
    @Environment(\.showsWidgetContainerBackground) private var card
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot, !card {
            VStack(alignment: .leading, spacing: 6) {
                Text(s.nextTitle == nil ? L10n.tr("Další trénink") : detail(s)).font(.subheadline).foregroundStyle(.white.opacity(0.6))
                Text(s.nextTitle ?? L10n.tr("Dnes už nic")).font(W.number(40)).foregroundStyle(.white)
                    .lineLimit(3).minimumScaleFactor(0.6).widgetAccentable()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else if let s = entry.snapshot {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Image(systemName: WeekWidgetView.symbol(s.nextSport)).font(.caption2).foregroundStyle(W.amber)
                    Text(L10n.tr("Další trénink")).font(.caption.weight(.medium)).foregroundStyle(W.muted)
                }
                Spacer(minLength: 0)
                if let title = s.nextTitle {
                    Text(title).font(W.number(24)).foregroundStyle(W.amber).lineLimit(3).minimumScaleFactor(0.7)
                    Text(detail(s)).font(.caption2).foregroundStyle(W.muted).lineLimit(2)
                } else {
                    Text(L10n.tr("Dnes už nic")).font(W.number(24)).foregroundStyle(W.ink)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else {
            EmptyWidgetView()
        }
    }

    private func detail(_ s: WidgetSnapshot) -> String {
        [L10n.tr("Dnes") + (s.nextTime.map { " " + ClockText.format($0) } ?? ""), s.nextMinutes.map { W.hm(Double($0)) + " h" }]
            .compactMap { $0 }.joined(separator: " · ")
    }
}
