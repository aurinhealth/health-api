import SwiftUI
import UIKit
import WidgetKit

// Home-screen and lock-screen widgets. They show what the app saved after its
// last refresh (WidgetSnapshot); a tap opens the matching screen in the app
// (aurin://open/...).

@main
struct AurinWidgetBundle: WidgetBundle {
    var body: some Widget {
        // The picker's order (widgets concept v3): the coach first.
        DayWidget()
        ReadinessWidget()
        NextWorkoutWidget()
        WeekWidget()
        FoodWaterWidget()
        SleepWidget()
        StepsWidget()
        MetricWidget()
        AurinAgeWidget()
        NightValuesWidget()
        GymActivityWidget()
        if #available(iOS 18.0, *) {
            WaterControl()
            StartGymControl()
            SkipRestControl()
        }
        #if canImport(AlarmKit)
        // The ringing alarm from Nastavení → Spánek, also in the Dynamic Island.
        if #available(iOS 26.0, *) {
            WakeAlarmWidget()
        }
        #endif
    }
}

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    /// The widget gallery or a placeholder: Health widgets show the sample too.
    var preview = false
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { SnapshotEntry(date: Date(), snapshot: .sample, preview: true) }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        let saved = context.isPreview ? (WidgetSnapshot.load() ?? .sample) : WidgetSnapshot.load()
        completion(SnapshotEntry(date: Date(), snapshot: saved?.current(today: PendingDrinks.localDate()), preview: context.isPreview))
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

/// The app's colours (Shared/Palette.swift), each with its dark-mode variant.
enum W {
    static let ink = Palette.ink
    static let muted = Palette.muted
    static let green = Palette.green
    static let amber = Palette.amber
    static let indigo = Palette.indigo
    static let rust = Palette.rust
    static let blue = Palette.blue

    static func number(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif) }

    static func zoneColor(_ zone: String?) -> Color {
        switch zone {
        case "green": return Palette.Status.good
        case "yellow": return Palette.Status.warn
        case "red": return Palette.Status.bad
        default: return muted
        }
    }

    /// The readiness zone in a word: "dobrá", "střední", "nízká".
    static func zoneWord(_ zone: String?) -> String? {
        switch zone {
        case "green": return L10n.tr("dobrá")
        case "yellow": return L10n.tr("střední")
        case "red": return L10n.tr("nízká")
        default: return nil
        }
    }

    /// "před 3 h" when the snapshot is 2 hours old or more at the entry's time.
    static func age(_ s: WidgetSnapshot, at date: Date) -> String? {
        guard let hours = s.hoursOld(at: date) else { return nil }
        return hours < 48 ? L10n.f("před %@ h", String(hours)) : L10n.f("před %@ dny", String(hours / 24))
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
}

/// Today's dial in small: the zone's ring and the number in the app's serif.
/// Both take the tint on a tinted Home Screen.
struct WidgetRing: View {
    let score: Int?
    let zone: String?
    var lineWidth: CGFloat = 9
    var fontSize: CGFloat = 40
    var track: Color = W.muted.opacity(0.18)
    var ink: Color = W.ink

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle().trim(from: 0, to: CGFloat(min(100, max(0, score ?? 0))) / 100)
                .stroke(W.zoneColor(zone), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
            Text(score.map(String.init) ?? "–").font(WidgetStyle.serif(fontSize)).foregroundStyle(ink)
                .minimumScaleFactor(0.5).lineLimit(1).padding(lineWidth)
                .widgetAccentable()
        }
        .padding(lineWidth / 2)
    }
}

/// Without a saved snapshot (not signed in yet, or the App Group is missing).
/// The Lock Screen's round and one-line spaces get the "open the app" symbol
/// and a short line: the sentence did not fit there.
struct EmptyWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "arrow.up.forward.app").font(.title3)
            }
            .accessibilityElement()
            .accessibilityLabel(Text(verbatim: L10n.tr("Otevři aplikaci, ať se data načtou.")))
        case .accessoryInline:
            Label(L10n.tr("Aurin: otevři aplikaci"), systemImage: "arrow.up.forward.app")
        default:
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: "Aurin").font(.caption.weight(.semibold)).foregroundStyle(W.muted)
                Spacer()
                Text(L10n.tr("Otevři aplikaci, ať se data načtou.")).font(.caption).foregroundStyle(W.ink)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

extension View {
    /// iOS 17 widgets need a container background.
    func widgetCard() -> some View {
        containerBackground(for: .widget) { Palette.card }
    }
}

// MARK: - Readiness

struct ReadinessWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "readiness", provider: SnapshotProvider()) { entry in
            ReadinessWidgetView(entry: entry)
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/readiness"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Připravenost")))
        .description(Text(verbatim: L10n.tr("Připravenost proti tvému obvyklému rozmezí")))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct ReadinessWidgetView: View {
    @Environment(\.widgetFamily) private var family
    /// False in StandBy: one big ring without the card.
    @Environment(\.showsWidgetContainerBackground) private var card
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            switch family {
            case .accessoryCircular:
                // Concept v3: the number on Today's dial, no label.
                ReadinessCircleFace(readiness: s.readiness, zone: s.zone)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.f("Připravenost %@", s.readiness.map(String.init) ?? "–")).font(.headline)
                    Text(L10n.f("Spánek %@, námaha %@", W.hm(s.sleepMinutes), W.decimal(s.strain))).font(.caption)
                    if let bed = s.bedtime { Text(L10n.f("Do postele %@", ClockText.format(bed))).font(.caption) }
                }
            default:
                if card {
                    // The redesign's face (widgets concept v3): Readiness as its dial.
                    WidgetFaces.readiness(s)
                } else {
                    // StandBy: one big ring without the card, green only in the
                    // usual range, else neutral (MDR: no warning colour).
                    VStack(spacing: 8) {
                        WidgetRing(score: s.readiness, zone: s.zone == "green" ? "green" : nil, lineWidth: 14, fontSize: 62,
                                   track: Color.white.opacity(0.12), ink: .white)
                        Text(L10n.tr("Připravenost")).font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/sleep"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Spánek")))
        .description(Text(verbatim: L10n.tr("Minulá noc a kdy dnes jít spát")))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline])
    }
}

struct SleepWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            if family == .accessoryInline {
                Text(L10n.f("Spánek %@", W.hm(s.sleepMinutes)) + (s.bedtime.map { ", " + L10n.f("postel %@", ClockText.format($0)) } ?? ""))
            } else if family == .systemMedium {
                // The arc, this week's nights against the need and tonight's bedtime.
                SleepMediumFace(s: s, h: WidgetHealth.load() ?? (entry.preview ? .sample : nil))
            } else {
                // The redesign's face: Today's night arc.
                WidgetFaces.sleep(s)
            }
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - Steps

/// Steps on their own in the picker (widgets concept v3); "Daily numbers" keeps
/// Steps as an option for widgets already on a Home Screen.
struct StepsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "steps", provider: SnapshotProvider()) { entry in
            Group {
                if let s = entry.snapshot { WidgetFaces.steps(s) } else { EmptyWidgetView() }
            }
            .privacySensitive()
            .widgetURL(URL(string: "aurin://open/steps"))
            .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Kroky")))
        .description(Text(verbatim: L10n.tr("Dnešní kroky proti tvému cíli")))
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Aurin Age

struct AurinAgeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "aurinAge", provider: SnapshotProvider()) { entry in
            // The gallery shows the sample day, as the other widgets.
            AurinAgeWidgetView(h: WidgetHealth.load() ?? (entry.preview ? .sample : nil))
                .privacySensitive()
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Aurin Age")))
        .description(Text(verbatim: L10n.tr("Tvůj odhad Aurin Age, součást Aurin Pro")))
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular])
    }
}

struct AurinAgeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let h: WidgetHealth?

    /// Without Pro the whole widget opens the offer (concept v3), else the Aurin Age page.
    private var link: URL? {
        URL(string: h.map { $0.aurinAge == nil && !$0.pro } == true ? "aurin://open/pro" : "aurin://open/aurin-age")
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: L10n.tr(h.map { $0.aurinAge == nil && !$0.pro } == true ? "Aurin Age" : "Odhad Aurin age").uppercased(with: L10n.locale))
                        .font(.system(size: 11, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                    if let age = h?.aurinAge {
                        Text(verbatim: WidgetStyle.decimal(age)).font(WidgetStyle.serif(26)).widgetAccentable()
                        if let words = h?.aurinAgeWords { Text(verbatim: words).font(.system(size: 12)) }
                    } else if let h, !h.pro {
                        Label(L10n.tr("Odemknout s Pro"), systemImage: "lock.fill").font(.system(size: 13, weight: .semibold))
                    } else {
                        Text(verbatim: L10n.tr("Zatím málo dat")).font(.system(size: 13))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    if let age = h?.aurinAge {
                        VStack(spacing: -2) {
                            Text(verbatim: WidgetStyle.decimal(age)).font(WidgetStyle.serif(20)).minimumScaleFactor(0.6).widgetAccentable()
                            Text(verbatim: L10n.tr("VĚK")).font(.system(size: 8, weight: .semibold))
                        }
                    } else {
                        // Without Pro or data: the orb's outline, no number (concept v3).
                        WidgetOrb(locked: true, size: 40)
                    }
                }
            default:
                AurinAgeSmallFace(h: h)
            }
        }
        .widgetURL(link)
    }
}

// MARK: - Night values

struct NightValuesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "nightValues", provider: SnapshotProvider()) { entry in
            NightValuesFace(h: WidgetHealth.load() ?? (entry.preview ? .sample : nil),
                            today: entry.preview ? nil : PendingDrinks.localDate(entry.date))
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/health"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Noční hodnoty")))
        .description(Text(verbatim: L10n.tr("Hodnoty z noci z tvých hodinek nebo prstenu")))
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - The day

struct DayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "day", provider: SnapshotProvider()) { entry in
            DayWidgetView(entry: entry)
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/today"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Kouč")))
        .description(Text(verbatim: L10n.tr("Tvoje připravenost a jedna věta, co dnes dělat")))
        // The Lock Screen's default rectangle is the coach's advice (concept v3).
        .supportedFamilies([.systemMedium, .accessoryRectangular])
    }
}

struct DayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            if family == .accessoryRectangular {
                CoachRectangleFace(face: WidgetFaces.coach(s, WidgetCoach.load()))
            } else {
                // The redesign's Coach card (widgets concept v3), what Today's coach card says.
                WidgetFaces.coach(s, WidgetCoach.load())
            }
        } else {
            EmptyWidgetView()
        }
    }
}

// MARK: - Food and drinks

struct FoodWaterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "food", provider: SnapshotProvider()) { entry in
            FoodWaterWidgetView(entry: entry)
                // Redacted on the Lock Screen and in StandBy while the phone is locked.
                .privacySensitive()
                .widgetURL(URL(string: "aurin://open/food"))
                .widgetCard()
        }
        .configurationDisplayName(Text(verbatim: L10n.tr("Jídlo")))
        .description(Text(verbatim: L10n.tr("Snědené kalorie proti dnešnímu cíli")))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FoodWaterWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if let s = entry.snapshot {
            if family == .systemMedium {
                // The redesign's Food card: hero, training's share, macros and water.
                FoodMediumFace(s: s)
            } else {
                // The redesign's face: Food's hero; water has its own widget and control.
                WidgetFaces.food(s)
            }
        } else {
            EmptyWidgetView()
        }
    }
}
