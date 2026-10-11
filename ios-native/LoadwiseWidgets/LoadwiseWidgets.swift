import SwiftUI
import UIKit
import WidgetKit

// Home-screen and lock-screen widgets. They show what the app saved after its
// last refresh (WidgetSnapshot); a tap opens the matching screen in the app
// (loadwise://open/...).

@main
struct LoadwiseWidgetBundle: WidgetBundle {
    var body: some Widget {
        ReadinessWidget()
        SleepWidget()
        DayWidget()
        FoodWaterWidget()
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let saved = context.isPreview ? (WidgetSnapshot.load() ?? .sample) : WidgetSnapshot.load()
        completion(SnapshotEntry(date: Date(), snapshot: saved?.current(today: PendingDrinks.localDate())))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        // The app reloads the widgets after each refresh. Besides that: an entry
        // now, and one at midnight that starts the new day at zero.
        let now = Date()
        let saved = WidgetSnapshot.load()
        var entries = [SnapshotEntry(date: now, snapshot: saved?.current(today: PendingDrinks.localDate(now)))]
        if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) {
            entries.append(SnapshotEntry(date: midnight, snapshot: saved?.current(today: PendingDrinks.localDate(midnight))))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(60 * 60))))
    }
}

enum W {
    static let ink = Color.primary
    static let muted = Color.secondary
    static let green = Color(red: 0.12, green: 0.42, blue: 0.32)
    static let amber = Color(red: 0.77, green: 0.47, blue: 0.16)
    static let indigo = Color(red: 0.31, green: 0.27, blue: 0.78)
    static let rust = Color(red: 0.71, green: 0.33, blue: 0.18)

    static func number(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif) }

    static func zoneColor(_ zone: String?) -> Color {
        switch zone {
        case "green": return green
        case "yellow": return amber
        case "red": return rust
        default: return muted
        }
    }

    static func hm(_ minutes: Double?) -> String {
        guard let m = minutes else { return "–" }
        let total = Int(m.rounded())
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    static func int(_ v: Double?) -> String {
        guard let v else { return "–" }
        return Int(v.rounded()).formatted(.number.locale(L10n.locale))
    }

    static func decimal(_ v: Double?) -> String {
        guard let v else { return "–" }
        return v.formatted(.number.precision(.fractionLength(1)).locale(L10n.locale))
    }

    /// "1,2 / 2,8 l" or "41 / 95 fl oz".
    static func water(_ ml: Double?, _ target: Double?) -> String {
        if Units.imperial {
            return int(Units.volume(ml ?? 0)) + (target.map { " / " + int(Units.volume($0)) } ?? "") + " " + Units.volumeUnit
        }
        return decimal((ml ?? 0) / 1000) + (target.map { " / " + decimal($0 / 1000) } ?? "") + " l"
    }

    /// The widget's water buttons: a glass and a bottle, 250/500 ml or 8/16 fl oz.
    static var glass: Int { Units.imperial ? Units.roundedMl(fluidOunces: 8) : 250 }
    static var bottle: Int { Units.imperial ? Units.roundedMl(fluidOunces: 16) : 500 }
}

/// Without a saved snapshot (not signed in yet, or the App Group is missing).
struct EmptyWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: "Loadwise").font(.caption.weight(.semibold)).foregroundStyle(W.muted)
            Spacer()
            Text(L10n.tr("Otevři aplikaci, ať se data načtou.")).font(.caption).foregroundStyle(W.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

extension View {
    /// iOS 17 widgets need a container background.
    func widgetCard() -> some View {
        containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
    }
}

// MARK: - Readiness

struct ReadinessWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "readiness", provider: SnapshotProvider()) { entry in
            ReadinessWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/readiness"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Připravenost")))
        .description(Text(verbatim: L10n.tr("Dnešní připravenost, spánek a zátěž.")))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct ReadinessWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            switch family {
            case .accessoryCircular:
                Gauge(value: Double(s.readiness ?? 0), in: 0...100) {
                    Text(L10n.tr("PŘ"))
                } currentValueLabel: {
                    Text(s.readiness.map(String.init) ?? "–")
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.f("Připravenost %@", s.readiness.map(String.init) ?? "–")).font(.headline)
                    Text(L10n.f("Spánek %@ · zátěž %@", W.hm(s.sleepMinutes), W.decimal(s.strain))).font(.caption)
                    if let bed = s.bedtime { Text(L10n.f("Do postele %@", bed)).font(.caption) }
                }
            default:
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Circle().fill(W.zoneColor(s.zone)).frame(width: 7, height: 7)
                        Text(L10n.tr("Připravenost")).font(.caption.weight(.medium)).foregroundStyle(W.muted)
                    }
                    Text(s.readiness.map(String.init) ?? "–").font(W.number(54)).foregroundStyle(W.ink).minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                    HStack {
                        Label(W.hm(s.sleepMinutes), systemImage: "moon.fill").foregroundStyle(W.indigo)
                        Spacer()
                        Label(W.decimal(s.strain), systemImage: "flame.fill").foregroundStyle(W.amber)
                    }
                    .font(.caption2.weight(.semibold))
                    .labelStyle(.titleAndIcon)
                }
            }
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - Sleep

struct SleepWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "sleep", provider: SnapshotProvider()) { entry in
            SleepWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/sleep"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Spánek")))
        .description(Text(verbatim: L10n.tr("Poslední noc a kdy dnes jít spát.")))
        .supportedFamilies([.systemSmall, .accessoryInline])
    }
}

struct SleepWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            if family == .accessoryInline {
                Text(L10n.f("Spánek %@", W.hm(s.sleepMinutes)) + (s.bedtime.map { " · " + L10n.f("postel %@", $0) } ?? ""))
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Circle().fill(W.indigo).frame(width: 7, height: 7)
                        Text(L10n.tr("Spánek")).font(.caption.weight(.medium)).foregroundStyle(W.muted)
                    }
                    Text(W.hm(s.sleepMinutes)).font(W.number(46)).foregroundStyle(W.ink).minimumScaleFactor(0.6)
                    if let index = s.sleepIndex { Text(L10n.f("index %@", String(index))).font(.caption2).foregroundStyle(W.indigo) }
                    Spacer(minLength: 0)
                    if let bed = s.bedtime {
                        Label(L10n.f("postel %@", bed), systemImage: "alarm").font(.caption2.weight(.semibold)).foregroundStyle(W.muted)
                    }
                }
            }
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - The day

struct DayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "day", provider: SnapshotProvider()) { entry in
            DayWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/today"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Můj den")))
        .description(Text(verbatim: L10n.tr("Připravenost, spánek, zátěž, jídlo, pití a další trénink.")))
        .supportedFamilies([.systemMedium])
    }
}

struct DayWidgetView: View {
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            HStack(alignment: .top, spacing: 14) {
                Link(destination: URL(string: "loadwise://open/readiness")!) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.tr("Připravenost")).font(.caption.weight(.medium)).foregroundStyle(W.muted)
                        Text(s.readiness.map(String.init) ?? "–").font(W.number(50)).foregroundStyle(W.ink)
                        Circle().fill(W.zoneColor(s.zone)).frame(width: 8, height: 8)
                        Spacer(minLength: 0)
                        if let title = s.nextTitle {
                            Text((s.nextTime.map { $0 + " " } ?? "") + title).font(.caption2.weight(.semibold)).foregroundStyle(W.amber).lineLimit(2)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 7) {
                    Link(destination: URL(string: "loadwise://open/sleep")!) { row("moon.fill", W.indigo, "Spánek", W.hm(s.sleepMinutes)) }
                    Link(destination: URL(string: "loadwise://open/training")!) { row("flame.fill", W.amber, "Zátěž", W.decimal(s.strain) + (s.strainPlanned.map { " / " + W.decimal($0) } ?? "")) }
                    Link(destination: URL(string: "loadwise://open/food")!) { row("fork.knife", W.rust, "Jídlo", W.int(s.kcal) + (s.kcalTarget.map { " / " + W.int($0) } ?? "") + " kcal") }
                    Link(destination: URL(string: "loadwise://open/food")!) { row("drop.fill", .blue, "Pití", W.water(s.waterMl, s.waterTarget)) }
                    if let bed = s.bedtime {
                        Link(destination: URL(string: "loadwise://open/sleep-settings")!) { row("alarm", W.indigo, "Do postele", bed) }
                    }
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            EmptyWidgetView()
        }
    }

    private func row(_ symbol: String, _ color: Color, _ title: String, _ value: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.caption2).foregroundStyle(color).frame(width: 14)
            Text(L10n.tr(title)).font(.caption2).foregroundStyle(W.muted)
            Spacer(minLength: 4)
            Text(value).font(.caption.weight(.semibold)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Food and drinks

struct FoodWaterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "food", provider: SnapshotProvider()) { entry in
            FoodWaterWidgetView(entry: entry)
                .widgetURL(URL(string: "loadwise://open/food"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Jídlo a pití")))
        .description(Text(verbatim: L10n.tr("Kalorie, živiny a pití. Vodu přidáš jedním klepnutím.")))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FoodWaterWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    static let protein = Color(red: 0.18, green: 0.5, blue: 0.85)
    static let carbs = Color(red: 0.85, green: 0.54, blue: 0.02)
    static let fat = Color(red: 0.49, green: 0.36, blue: 0.88)

    var body: some View {
        if let s = entry.snapshot {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        kcal(s)
                        macro("Bílkoviny", s.protein, s.proteinTarget, Self.protein)
                        macro("Sacharidy", s.carbs, s.carbsTarget, Self.carbs)
                        macro("Tuky", s.fat, s.fatTarget, Self.fat)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        water(s)
                        HStack(spacing: 6) {
                            add(W.glass)
                            add(W.bottle)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    kcal(s)
                    Spacer(minLength: 0)
                    water(s)
                    add(W.glass)
                }
            }
        } else {
            EmptyWidgetView()
        }
    }

    private func kcal(_ s: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.tr("Jídlo")).font(.caption.weight(.medium)).foregroundStyle(W.muted)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(W.int(s.kcal)).font(W.number(30)).foregroundStyle(W.ink).minimumScaleFactor(0.6)
                if let target = s.kcalTarget { Text("/ " + W.int(target)).font(.caption2).foregroundStyle(W.muted) }
            }
        }
    }

    private func water(_ s: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: "drop.fill").font(.caption2).foregroundStyle(.blue)
                Text(W.water(s.waterMl, s.waterTarget))
                    .font(.caption.weight(.semibold)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
            }
            bar(s.waterMl, s.waterTarget, .blue)
        }
    }

    private func macro(_ title: String, _ eaten: Double?, _ target: Double?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(L10n.tr(title)).font(.caption2).foregroundStyle(W.muted)
                Spacer(minLength: 2)
                Text(W.int(eaten) + (target.map { "/" + W.int($0) } ?? "") + " g").font(.caption2.weight(.semibold)).foregroundStyle(W.ink)
            }
            bar(eaten, target, color)
        }
    }

    private func bar(_ value: Double?, _ target: Double?, _ color: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.18))
                Capsule().fill(color).frame(width: geo.size.width * min(1, max(0, (value ?? 0) / max(1, target ?? 1))))
            }
        }
        .frame(height: 4)
    }

    private func add(_ ml: Int) -> some View {
        Button(intent: AddWaterIntent(ml: ml)) {
            Label(Units.imperial ? W.int(Units.volume(Double(ml))) + " " + Units.volumeUnit : Units.volumeText(Double(ml)), systemImage: "plus")
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .tint(.blue)
    }
}
