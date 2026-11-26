import AppIntents
import SwiftUI
import WidgetKit

// The number widget (its metric picked in Edit Widget), the week (large) and
// the next workout (small, also for StandBy). Petr's yes on the mockup, 2026-10-28.

// MARK: - One number

enum WidgetMetric: String, AppEnum {
    case readiness, sleep, hrv, restingHR, steps, kcalLeft, water, strain

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: LocalizedStringResource("Údaj", table: "Controls"))
    static let caseDisplayRepresentations: [WidgetMetric: DisplayRepresentation] = [
        .readiness: DisplayRepresentation(title: LocalizedStringResource("Připravenost", table: "Controls")),
        .sleep: DisplayRepresentation(title: LocalizedStringResource("Spánek", table: "Controls")),
        .hrv: DisplayRepresentation(title: LocalizedStringResource("HRV", table: "Controls")),
        .restingHR: DisplayRepresentation(title: LocalizedStringResource("Klidový tep", table: "Controls")),
        .steps: DisplayRepresentation(title: LocalizedStringResource("Kroky", table: "Controls")),
        .kcalLeft: DisplayRepresentation(title: LocalizedStringResource("Zbývá kalorií", table: "Controls")),
        .water: DisplayRepresentation(title: LocalizedStringResource("Pití", table: "Controls")),
        .strain: DisplayRepresentation(title: LocalizedStringResource("Námaha", table: "Controls")),
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
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: entry.metric.link))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Denní čísla")))
        .description(Text(verbatim: L10n.tr("Námaha, HRV, voda, kroky nebo klidový tep na první pohled")))
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
        case .strain: return L10n.tr("Námaha")
        }
    }

    var link: String {
        switch self {
        case .readiness: return "aurin://open/readiness"
        case .sleep: return "aurin://open/sleep"
        case .hrv: return "aurin://open/hrv"
        case .restingHR: return "aurin://open/metric/restingHR"
        case .steps: return "aurin://open/steps"
        case .kcalLeft, .water: return "aurin://open/food"
        case .strain: return "aurin://open/strain"
        }
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
        case .strain:
            return (W.decimal(s.strain), "", s.strainLow.flatMap { low in s.strainHigh.map { L10n.f("cíl %@ až %@", W.int(low), W.int($0)) } })
        }
    }

    /// The small widget: the same dial as Today and Health.
    @MainActor @ViewBuilder func face(_ s: WidgetSnapshot) -> some View {
        switch self {
        case .readiness: WidgetFaces.readiness(s)
        case .sleep: WidgetFaces.sleep(s)
        case .hrv: WidgetFaces.hrv(s)
        case .restingHR: WidgetFaces.restingHR(s)
        case .steps: WidgetFaces.steps(s)
        case .kcalLeft: WidgetFaces.kcalLeft(s)
        case .water: WidgetFaces.water(s)
        case .strain: WidgetFaces.strain(s)
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
            // Steps from hours ago would read as now (Background App Refresh off): "cíl 10 000, před 3 h".
            let notes = [v.note, entry.metric == .steps ? W.age(s, at: entry.date) : nil].compactMap { $0 }
            let note = notes.isEmpty ? nil : notes.joined(separator: ", ")
            switch family {
            case .accessoryInline:
                Text(entry.metric.title + " " + v.number + (v.unit.isEmpty ? "" : " " + v.unit))
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.metric.title).font(.caption)
                    Text(v.number + (v.unit.isEmpty ? "" : " " + v.unit)).font(.headline)
                    if let note { Text(note).font(.caption) }
                }
            default:
                // The redesign's faces (widgets concept v3): Today's dials.
                entry.metric.face(s)
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
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/training"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Tento týden")))
        .description(Text(verbatim: L10n.tr("Splněné a naplánované tréninky po dnech")))
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct WeekWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeekEntry

    var body: some View {
        // The redesign's This week (widgets concept v3): Today's week strip, in large with what comes next.
        WeekFace(week: entry.week, today: entry.today, large: family == .systemLarge)
    }
}

// MARK: - The next workout (StandBy)

struct NextWorkoutWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "next", provider: SnapshotProvider()) { entry in
            NextWorkoutWidgetView(entry: entry)
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/training"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Další trénink")))
        .description(Text(verbatim: L10n.tr("Tvoje další jízda, běh, plavání nebo posilovna")))
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
            // The redesign's face: a Training row (sport disc, name, when, how long).
            WidgetFaces.next(s)
        } else {
            EmptyWidgetView()
        }
    }

    private func detail(_ s: WidgetSnapshot) -> String {
        [L10n.tr("Dnes") + (s.nextTime.map { " " + ClockText.format($0) } ?? ""), s.nextMinutes.map { W.hm(Double($0)) + " h" }]
            .compactMap { $0 }.joined(separator: ", ")
    }
}
