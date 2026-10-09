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
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: context.isPreview ? (WidgetSnapshot.load() ?? .sample) : WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        // The app reloads the widgets after each refresh; this is only a fallback.
        let entry = SnapshotEntry(date: Date(), snapshot: WidgetSnapshot.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 60))))
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
        return Int(v.rounded()).formatted(.number.locale(Locale(identifier: "cs_CZ")))
    }

    static func decimal(_ v: Double?) -> String {
        guard let v else { return "–" }
        return v.formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: "cs_CZ")))
    }
}

/// Without a saved snapshot (not signed in yet, or the App Group is missing).
struct EmptyWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Loadwise").font(.caption.weight(.semibold)).foregroundStyle(W.muted)
            Spacer()
            Text("Otevři aplikaci, ať se data načtou.").font(.caption).foregroundStyle(W.ink)
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
        .configurationDisplayName("Připravenost")
        .description("Dnešní připravenost, spánek a zátěž.")
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
                    Text("PŘ")
                } currentValueLabel: {
                    Text(s.readiness.map(String.init) ?? "–")
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text("Připravenost " + (s.readiness.map(String.init) ?? "–")).font(.headline)
                    Text("Spánek " + W.hm(s.sleepMinutes) + " · zátěž " + W.decimal(s.strain)).font(.caption)
                    if let bed = s.bedtime { Text("Do postele " + bed).font(.caption) }
                }
            default:
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Circle().fill(W.zoneColor(s.zone)).frame(width: 7, height: 7)
                        Text("Připravenost").font(.caption.weight(.medium)).foregroundStyle(W.muted)
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
        .configurationDisplayName("Spánek")
        .description("Poslední noc a kdy dnes jít spát.")
        .supportedFamilies([.systemSmall, .accessoryInline])
    }
}

struct SleepWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            if family == .accessoryInline {
                Text("Spánek " + W.hm(s.sleepMinutes) + (s.bedtime.map { " · postel " + $0 } ?? ""))
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Circle().fill(W.indigo).frame(width: 7, height: 7)
                        Text("Spánek").font(.caption.weight(.medium)).foregroundStyle(W.muted)
                    }
                    Text(W.hm(s.sleepMinutes)).font(W.number(46)).foregroundStyle(W.ink).minimumScaleFactor(0.6)
                    if let index = s.sleepIndex { Text("index \(index)").font(.caption2).foregroundStyle(W.indigo) }
                    Spacer(minLength: 0)
                    if let bed = s.bedtime {
                        Label("postel " + bed, systemImage: "alarm").font(.caption2.weight(.semibold)).foregroundStyle(W.muted)
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
        .configurationDisplayName("Můj den")
        .description("Připravenost, spánek, zátěž, jídlo, pití a další trénink.")
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
                        Text("Připravenost").font(.caption.weight(.medium)).foregroundStyle(W.muted)
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
                    Link(destination: URL(string: "loadwise://open/food")!) { row("drop.fill", .blue, "Pití", W.decimal((s.waterMl ?? 0) / 1000) + (s.waterTarget.map { " / " + W.decimal($0 / 1000) } ?? "") + " l") }
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
            Text(title).font(.caption2).foregroundStyle(W.muted)
            Spacer(minLength: 4)
            Text(value).font(.caption.weight(.semibold)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}
