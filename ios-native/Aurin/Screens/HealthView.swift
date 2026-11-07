import SwiftUI

struct HealthView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.tabActions) private var actions

    var body: some View {
        NavigationStack(path: model.path(.health)) {
            ZStack {
                ScreenBackground(glow: Palette.Glow.health)
                if let health = model.health {
                    PageScroll {
                        HealthContent(health: health)
                            .padding(.bottom, 100)
                    }
                    .refreshable { await model.refreshHealth() }
                    .tabTopBar {
                        DayBar(date: health.date)
                        Spacer(minLength: 0)
                        HeaderCapsule(coach: actions.coach, settings: actions.settings)
                    }
                } else if let message = model.healthError {
                    VStack(spacing: 16) {
                        Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                        Button("Zkusit znovu") { Task { await model.refreshHealth() } }.font(Typo.bodyStrong)
                    }
                    .padding(32)
                } else {
                    ProgressView()
                }
            }
            .navBarVisibility(.hidden)
            .appRoutes()
        }
        .task { await model.refreshIfStale(.health) }
    }
}

/// A drill-down page: the section's background, a back button and a column.
struct DetailScreen<Content: View>: View {
    var glow: Color = Palette.Glow.health
    /// Shown in the pinned bar once the page is scrolled.
    var title: String? = nil
    /// "✦ Kouč" beside the back button: the coach about this detail.
    var coach: CoachSubject? = nil
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: glow)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        BackSlot { dismiss() }
                        Spacer()
                        if let coach { CoachPill(subject: coach) }
                    }
                    content
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: title) { dismiss() }
        .navBarVisibility(.hidden)
    }
}

/// The Health screen without the scroll view, so tests can render it whole.
struct HealthContent: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var page
    let health: HealthSnapshot
    @Environment(\.tabActions) private var actions
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                // The same top as Dnes (TabHeader) and its week.
                TabHeader(date: health.date, coach: actions.coach, settings: actions.settings)
                WeekStrip(date: health.date, week: WeekStrip.week(of: health.date, in: page.map(\.today) ?? model.today))
                    .padding(.top, 14)

                RouteLink(route: .readiness) { ReadinessCard(readiness: health.readiness, date: health.date) }
                    .padding(.top, 24)

                // Cycle tracking, only for today, with the morning question
                // (on Today only in the Cyklus widget).
                if (page.map(\.selectedDate) ?? model.selectedDate) == nil, let cycle = model.cycle, cycle.enabled, let state = cycle.state {
                    CycleHealthSection(state: state, today: (page.map(\.today) ?? model.today)?.cycle).padding(.top, 12)
                }
            }

            WidgetBoard(panel: .health,
                        data: WidgetData(panel: .health, today: page.map(\.today) ?? model.today, health: health, training: model.training, food: page.map(\.food) ?? model.food),
                        editing: $editing)
                .padding(.top, editing ? 0 : 30)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .daySwipe(date: health.date, enabled: !editing) { page in page.health.map { AnyView(HealthContent(health: $0)) } }
        .task { if model.cycle == nil { await model.loadCycle() } }
    }
}

// MARK: - Readiness

struct ReadinessCard: View {
    @Environment(AppModel.self) private var model
    let readiness: HealthSnapshot.Readiness
    var date: String = ""

    var body: some View {
        Card {
            HStack {
                Text("Připravenost").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                Spacer()
            }
            if let score = readiness.score {
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text(String(score)).font(Typo.number(88)).foregroundStyle(Palette.ink)
                    if let pill = ReadinessText.pill(readiness.zone) { Pill(text: pill.0, foreground: pill.1, background: pill.2) }
                }
                PartsRow(parts: readiness.parts)
            } else if let days = readiness.learningDays {
                ReadinessLearning(days: days, date: date, title: Typo.sentence(30, relativeTo: .title))
            } else if model.noWearable {
                NoWearableText(title: Typo.sentence(30, relativeTo: .title))
            } else {
                Text("Zatím bez čísla").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Připravenost potřebuje dnešní noc a aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Sleep, resting heart rate and HRV under the readiness: today's value,
/// higher or lower than usual and a band with the usual range. Parts without
/// a range (breathing, temperature, the morning check-in) follow in one line
/// as readiness points.
struct PartsRow: View {
    let parts: [HealthSnapshot.Part]

    private var measured: [HealthSnapshot.Part] { parts.filter { $0.value != nil && $0.low != nil && $0.high != nil } }
    private var others: [HealthSnapshot.Part] { parts.filter { !measured.contains($0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(measured.enumerated()), id: \.element.id) { index, part in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(width: 1).padding(.vertical, 2) }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ReadinessText.label(part.key)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text(ReadinessText.value(part)).font(Typo.number(24)).foregroundStyle(Palette.ink)
                            Text(ReadinessText.unit(part.key)).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        .lineLimit(1).minimumScaleFactor(0.7)
                        Text(ReadinessText.word(part)).font(Typo.caption.weight(.medium))
                            .foregroundStyle(ReadinessText.color(part)).lineLimit(1).minimumScaleFactor(0.8)
                        RangeBand(part: part).padding(.top, 6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, index > 0 ? 12 : 0)
                    .padding(.trailing, index < measured.count - 1 ? 12 : 0)
                }
            }
            if !others.isEmpty {
                Text(others.map { L10n.tr(ReadinessText.label($0.key)) + " " + Fmt.signed(Double($0.points)) }.joined(separator: " · "))
                    .font(Typo.caption).foregroundStyle(others.contains { $0.points < 0 } ? Palette.rust : Palette.green)
            }
        }
        .padding(.top, 4)
    }
}

/// The readiness part on the shared range bar.
struct RangeBand: View {
    let part: HealthSnapshot.Part

    var body: some View {
        if let value = part.value, let low = part.low, let high = part.high {
            RangeBar(value: value, low: low, high: high, color: ReadinessText.color(part))
        }
    }
}

enum ReadinessText {
    static func label(_ key: String) -> String {
        switch key {
        case "hrv": return "HRV"
        case "restingHR": return "Klidový tep"
        case "sleep": return "Spánek"
        case "respiration": return "Dech"
        case "skinTemp", "wristTemp": return "Teplota"
        case "checkin": return "Nemoc v Deníku"
        default: return key
        }
    }

    static func unit(_ key: String) -> String {
        switch key {
        case "hrv": return "ms"
        case "restingHR": return "bpm"
        case "sleep": return "h"
        default: return ""
        }
    }

    static func value(_ part: HealthSnapshot.Part) -> String {
        part.key == "sleep" ? Fmt.hoursMinutes(part.value) : Fmt.int(part.value)
    }

    /// "58–70 ms", "7:10–8:00 h".
    static func range(_ part: HealthSnapshot.Part) -> String {
        let show = { (x: Double?) in part.key == "sleep" ? Fmt.hoursMinutes(x) : Fmt.int(x) }
        // "7:20–8:10" needs no "h"; heart rate in bpm as everywhere else.
        return show(part.low) + "–" + show(part.high) + (part.key == "sleep" ? "" : " " + unit(part.key))
    }

    /// -1 under the usual range, 1 above it, 0 within.
    static func side(_ part: HealthSnapshot.Part) -> Int {
        guard let value = part.value, let low = part.low, let high = part.high else { return 0 }
        return value > high ? 1 : value < low ? -1 : 0
    }

    /// "↑ vyšší", "↓ kratší", "obvyklé" on the card.
    static func word(_ part: HealthSnapshot.Part) -> String {
        switch side(part) {
        case 1: return "↑ " + L10n.tr(part.key == "sleep" ? "delší" : "vyšší")
        case -1: return "↓ " + L10n.tr(part.key == "sleep" ? "kratší" : "nižší")
        default: return L10n.tr("obvyklé")
        }
    }

    /// "lepší než obvykle" in the readiness detail: what the value means, in the
    /// colour of its points, since a lower resting heart rate helps and a shorter
    /// night costs (the bar above already shows the direction).
    static func longWord(_ part: HealthSnapshot.Part) -> String {
        if side(part) == 0 { return L10n.tr("v obvyklém rozmezí") }
        if part.points > 0 { return L10n.tr("lepší než obvykle") }
        if part.points < 0 { return L10n.tr("horší než obvykle") }
        return side(part) == 1 ? "↑ " + L10n.tr("nad obvyklým rozmezím") : "↓ " + L10n.tr("pod obvyklým rozmezím")
    }

    /// Green when the value helps the readiness, rust when it costs points.
    static func color(_ part: HealthSnapshot.Part) -> Color {
        part.points < 0 ? Palette.rust : Palette.green
    }

    /// "−8 bodů připravenosti".
    static func points(_ points: Int) -> String {
        L10n.plural("%@ bodů připravenosti", Fmt.signed(Double(points)), abs(points))
    }

    /// The label by the readiness number only describes the body (Today audit
    /// D1, FDA 2026: "usual range", never "normal"); its colour stays the zone's.
    /// What to do today is the verdict's line (`verdict`).
    static func pill(_ zone: String?) -> (String, Color, Color)? {
        switch zone {
        case "green": return (L10n.tr("v obvyklém rozmezí"), Palette.green, Palette.greenSoft)
        case "yellow": return (L10n.tr("pod obvyklým rozmezím"), Palette.amber, Palette.amberSoft)
        case "red": return (L10n.tr("pod obvyklým rozmezím"), Palette.rust, Palette.rust.opacity(0.14))
        default: return nil
        }
    }

    /// The day's verdict under the number on Today, one key from the server's
    /// list (src/day-verdict.js VERDICT_KEYS, the morning push says the same).
    static func verdict(_ key: String?) -> String? {
        switch key {
        case "hard": return L10n.tr("Dobrý den na tvrdý trénink")
        case "steady": return L10n.tr("Dnes s mírou")
        case "easy": return L10n.tr("Dnes v klidu")
        case "legs": return L10n.tr("Dej nohám pauzu")
        case "no_intensity": return L10n.tr("Dnes bez intenzity")
        case "rest": return L10n.tr("Dnes odpočinek")
        default: return nil
        }
    }
}

struct ReadinessDetailContent: View {
    let health: HealthSnapshot
    /// No watch or ring (AppModel.noWearable): why no number is coming.
    var noWearable = false
    /// Today's answer to "Jak se dnes cítíš?" (.some(nil) unanswered); nil hides the question.
    var checkin: String?? = nil

    var body: some View {
        let r = health.readiness
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Připravenost").padding(.top, 24)
            if let score = r.score {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(String(score)).font(Typo.number(116)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                    if let pill = ReadinessText.pill(r.zone) { Pill(text: pill.0, foreground: pill.1, background: pill.2) }
                }
                .padding(.top, 12)
            } else if let days = r.learningDays {
                // Without a number, why (audit 14.4): the same as the Health card.
                ReadinessLearning(days: days, date: health.date, title: Typo.sentence(30, relativeTo: .title))
            } else if noWearable {
                NoWearableText(title: Typo.sentence(30, relativeTo: .title))
            } else {
                Text("Zatím bez čísla").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 8)
                Text("Připravenost potřebuje dnešní noc a aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }

            if let checkin {
                MorningCheckinCard(feeling: checkin, keepAnswered: true, top: 24)
            }

            if !r.parts.isEmpty {
                SectionLabel(text: "Co ji dnes tvoří").padding(.top, 32)
                VStack(spacing: 0) {
                    ForEach(r.parts) { part in
                        if let route = Self.route(part.key) {
                            RouteLink(route: route) { partRow(part).contentShape(Rectangle()) }
                        } else {
                            partRow(part)
                        }
                        Rectangle().fill(Palette.hairline).frame(height: 1)
                    }
                }
                .padding(.top, 8)
            }

            if r.history.count > 1 {
                HStack {
                    SectionLabel(text: "Posledních 14 dní")
                    Spacer()
                    Text(L10n.f("průměr %@", Fmt.int(r.history.map(\.value).reduce(0, +) / Double(r.history.count)))).font(Typo.caption).foregroundStyle(Palette.faint)
                }
                .padding(.top, 32)
                BarChart(values: r.history.map(\.value),
                         styles: r.history.map { BarStyle(fill: $0.value >= 67 ? Palette.green.opacity(0.7) : $0.value >= 34 ? Palette.amberBar.opacity(0.8) : Palette.rust.opacity(0.8)) },
                         hi: 100,
                         labels: r.history.map { Fmt.weekdayShort($0.date) },
                         highlighted: r.history.count - 1,
                         height: 110,
                         scale: Self.readinessBands)
                    .padding(.top, 14)
            }
        }
    }

    /// The detail a part of the number opens (the check-in has none).
    static func route(_ key: String) -> AppRoute? {
        switch key {
        case "hrv": return .metric(.hrv)
        case "restingHR": return .metric(.restingHR)
        case "sleep": return .sleep
        case "respiration": return .metric(.respiration)
        case "skinTemp", "wristTemp": return .metric(.temperature)
        default: return nil
        }
    }

    /// A readiness zone's colour and its range under the last 14 days.
    /// The bands' edges as hairlines, each band's name in its colour at its middle.
    static var readinessBands: [ScaleTick] {
        [34, 67].map { ScaleTick(value: $0, text: "") } + [
            ScaleTick(value: 83.5, text: L10n.tr("vysoká"), color: Palette.green, line: false),
            ScaleTick(value: 50.5, text: L10n.tr("střední"), color: Palette.amber, line: false),
            ScaleTick(value: 17, text: L10n.tr("nízká"), color: Palette.rust, line: false),
        ]
    }

    private func partRow(_ part: HealthSnapshot.Part) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(ReadinessText.label(part.key)).font(.body).foregroundStyle(Palette.ink)
                Spacer()
                Text(value(part.key)).font(Typo.number(20)).foregroundStyle(Palette.ink)
            }
            if part.low != nil, part.high != nil, part.value != nil {
                HStack(alignment: .firstTextBaseline) {
                    Text(L10n.f("obvyklé rozmezí %@", ReadinessText.range(part))).font(Typo.caption).foregroundStyle(Palette.muted)
                    Spacer()
                    Text(ReadinessText.longWord(part)).font(Typo.caption.weight(.medium)).foregroundStyle(ReadinessText.color(part))
                }
                RangeBand(part: part).padding(.top, 8)
            }
            HStack {
                Spacer()
                Text(ReadinessText.points(part.points)).font(Typo.caption.weight(.medium))
                    .foregroundStyle(ReadinessText.color(part))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Palette.ink.opacity(0.06), in: Capsule())
            }
            .padding(.top, 6)
        }
        .padding(.vertical, 13)
    }

    private func value(_ key: String) -> String {
        let r = health.readiness
        switch key {
        case "hrv": return r.hrv.map { Fmt.int($0) + " ms" } ?? "–"
        case "restingHR": return r.restingHR.map { Fmt.int($0) + " bpm" } ?? "–"
        case "sleep": return Fmt.hoursMinutes(r.sleepMinutes)
        case "respiration": return health.respiration.map { Fmt.decimal($0.value) + " /min" } ?? "–"
        case "skinTemp": return health.skinTemp.map { Fmt.signed(Units.temperatureChange($0.deviation), digits: 1) + " " + Units.temperatureUnit } ?? "–"
        case "wristTemp": return health.wristTemp?.deviation.map { Fmt.signed(Units.temperatureChange($0), digits: 1) + " " + Units.temperatureUnit } ?? "–"
        case "checkin": return MorningCheckinCard.options.first { $0.id == r.checkin }.map { L10n.tr($0.label) } ?? ""
        default: return ""
        }
    }
}

// MARK: - Sleep widgets

struct SleepWidget: View {
    @Environment(AppModel.self) private var model
    let sleep: HealthSnapshot.Sleep
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Spánek", color: Palette.indigo)
            SizedWidgetBody(size: size) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    NumberText(value: Fmt.hoursMinutes(sleep.night?.minutes), unit: "h", spoken: Fmt.hoursMinutesSpoken(sleep.night?.minutes))
                    Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                }
                if let index = sleep.night?.index {
                    Text(L10n.f("index %@", String(index))).font(Typo.caption).foregroundStyle(Palette.indigo)
                } else {
                    // Without a watch or ring no night is coming (audit 14.2).
                    Text(sleep.night != nil ? " " : model.noWearable ? "měří hodinky" : "dnešní noc chybí").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            } chart: { height in
                if !sleep.week.isEmpty {
                    // The usual need (age or own goal), the one the week's debt counts
                    // against, not last night's need with the day's strain (chart review 15).
                    let need = Double(sleep.tonight.base)
                    BarChart(values: sleep.week.map(\.value),
                             styles: sleep.week.indices.map { i in BarStyle(fill: i == sleep.week.count - 1 ? Palette.indigo : Palette.lilac) },
                             hi: max(need * 1.15, sleep.week.map(\.value).max() ?? 0),
                             target: need,
                             labels: sleep.week.map { Fmt.weekdayShort($0.date) },
                             highlighted: sleep.week.count - 1,
                             spacing: size == .small ? 3 : 4,
                             height: height,
                             targetTag: (name: L10n.tr("odhad potřeby"), value: Fmt.hoursMinutes(need)))
                }
            }
        }
    }
}

struct SleepDebtWidget: View {
    let debt: HealthSnapshot.Debt
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Spánkový dluh", color: Palette.amberBar)
            if size == .small {
                NumberText(value: Fmt.hoursMinutes(Double(debt.minutes)), unit: "h", spoken: Fmt.hoursMinutesSpoken(Double(debt.minutes)))
                Text(nights).font(Typo.caption).foregroundStyle(Palette.faint)
                DebtStrip(minutes: debt.minutes)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    NumberText(value: Fmt.hoursMinutes(Double(debt.minutes)), unit: "h", spoken: Fmt.hoursMinutesSpoken(Double(debt.minutes)))
                    Spacer(minLength: 8)
                    Text(nights).font(Typo.caption).foregroundStyle(Palette.faint)
                }
                DebtStrip(minutes: debt.minutes, height: 6)
            }
        }
    }

    private var nights: String { L10n.plural("za %lld nocí", debt.nights) }
}

/// The week's debt on a strip from 0 to 6 h, its ends labelled and in one
/// colour: no red past 3 h that nothing explains (chart review 15).
struct DebtStrip: View {
    let minutes: Int
    var height: CGFloat = 4

    var body: some View {
        VStack(spacing: 4) {
            ProgressLine(fraction: Double(minutes) / 360, color: Palette.amberBar, height: height)
            ChartSpan(start: "0", end: "6 h")
        }
    }
}

struct OxygenWidget: View {
    let oxygen: HealthSnapshot.Oxygen
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Kyslík v krvi", color: Palette.blue)
            SizedWidgetBody(size: size, smallChart: 30, mediumChart: 44, smallShowsChart: oxygen.high <= oxygen.low) {
                NumberText(value: Fmt.decimal(oxygen.value, digits: oxygen.value.rounded() == oxygen.value ? 0 : 1), unit: "%")
                if oxygen.high > oxygen.low {
                    TileRange(value: oxygen.value, low: oxygen.low, high: oxygen.high, edges: (Fmt.int(oxygen.low), Fmt.int(oxygen.high)), tint: Palette.blue)
                } else {
                    // Too few nights for a usual range: the span of the 14 days shown.
                    Text(L10n.f("14 dní %@–%@ %%", Fmt.int(values.min() ?? oxygen.value), Fmt.int(values.max() ?? oxygen.value))).font(Typo.caption).foregroundStyle(Palette.faint)
                }
            } chart: { height in
                VStack(spacing: 6) {
                    LineChart(values: values, color: Palette.blue, lo: (values.min() ?? 90) - 1, hi: 100, height: height)
                    ChartSpan(dates: oxygen.series.map(\.date))
                }
            }
        }
    }

    private var values: [Double] { oxygen.series.map(\.value) }
}

struct RespirationWidget: View {
    let respiration: HealthSnapshot.Respiration
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Dech ve spánku", color: Palette.green)
            SizedWidgetBody(size: size, smallChart: 30, mediumChart: 44, smallShowsChart: respiration.baseline == nil) {
                NumberText(value: Fmt.decimal(respiration.value), unit: "/min")
                if let base = respiration.baseline {
                    TileRange(value: respiration.value, low: base - 0.5, high: base + 0.5, edges: (Fmt.decimal(base - 0.5), Fmt.decimal(base + 0.5)), tint: Palette.green)
                } else {
                    Text(respiration.elevated ? "nad obvyklým rozmezím" : "v obvyklém rozmezí").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            } chart: { height in
                VStack(spacing: 6) {
                    LineChart(values: values, color: Palette.green, lo: (values.min() ?? 12) - 0.5, hi: (values.max() ?? 18) + 0.5,
                              band: respiration.baseline.map { ($0 - 0.5)...($0 + 0.5) }, height: height)
                    ChartSpan(dates: respiration.series.map(\.date))
                }
            }
        }
    }

    private var values: [Double] { respiration.series.map(\.value) }
}

struct SkinTempWidget: View {
    let skin: HealthSnapshot.SkinTemp
    var size: WidgetSize = .small

    var body: some View {
        Card {
            WidgetHeader(title: "Teplota zápěstí", color: Palette.amber)
            SizedWidgetBody(size: size, smallChart: 30, mediumChart: 44, smallShowsChart: false) {
                NumberText(value: Fmt.signed(Units.temperatureChange(skin.deviation), digits: 1), unit: Units.temperatureUnit)
                // The usual night is within half a degree of the athlete's own average.
                TileRange(value: skin.deviation, low: -0.5, high: 0.5, text: TileRange.temperatureWord(skin.deviation), edges: TileRange.temperatureEdges, tint: Palette.amber)
            } chart: { height in
                VStack(spacing: 6) {
                    DeviationBars(values: skin.series.map(\.value), band: 0.5, height: height)
                    ChartSpan(dates: skin.series.map(\.date))
                    if size != .small { DeviationLegend() }
                }
            }
        }
    }
}

/// Apple Watch's wrist temperature: last night against the athlete's own
/// nights and a bar for each of the last 14, last night's in full amber.
struct WristTempWidget: View {
    let wrist: HealthSnapshot.WristTemp
    var size: WidgetSize = .small

    private var bars: [Point] { Array((wrist.deviations ?? []).suffix(14)) }

    var body: some View {
        Card {
            WidgetHeader(title: "Teplota zápěstí", color: Palette.amber, trailing: nights)
            VStack(alignment: .leading, spacing: 14) {
                if let deviation = wrist.deviation {
                    VStack(alignment: .leading, spacing: 4) {
                        NumberText(value: Fmt.signed(Units.temperatureChange(deviation), digits: 1),
                                   unit: size == .small ? Units.temperatureUnit : L10n.f("%@ proti obvyklému", Units.temperatureUnit))
                        // The usual night is within half a degree of the athlete's own average.
                        TileRange(value: deviation, low: -0.5, high: 0.5, text: TileRange.temperatureWord(deviation), edges: TileRange.temperatureEdges, tint: Palette.amber)
                    }
                } else {
                    NumberText(value: Fmt.decimal(Units.temperature(wrist.value), digits: 1), unit: Units.temperatureUnit)
                }
                if bars.count > 1 && (size != .small || wrist.deviation == nil) {
                    VStack(spacing: 6) {
                        // Up and down from the usual: a cooler night shows as well as a warmer one.
                        DeviationBars(values: bars.map(\.value), band: 0.5, spacing: size == .small ? 2 : 4,
                                      height: size == .large ? 80 : size == .medium ? 48 : 34)
                        if size != .small { DeviationLegend() }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    /// "14 nocí" above the bars.
    private var nights: String? {
        guard bars.count > 1, size != .small else { return nil }
        return L10n.plural("%lld nocí", bars.count)
    }
}

// MARK: - Heart and body widgets

struct HRVWideWidget: View {
    let hrv: HealthSnapshot.HRV
    let restingHR: Double?

    var body: some View {
        HRVWidget(hrv: TodaySnapshot.HRV(hrv), restingHR: restingHR, size: .medium)
    }
}

struct MuscleWidget: View {
    let muscle: HealthSnapshot.BodyFat
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Svalová hmota", color: Palette.brown)
            SizedWidgetBody(size: size, mediumChart: 44) {
                NumberText(value: Fmt.decimal(Units.weight(muscle.value)), unit: Units.weightUnit)
                if let change = muscle.change, change != 0 {
                    Text(L10n.f("%@ %@ od %@", change > 0 ? "↑" : "↓", Fmt.decimal(abs(Units.weight(change))), Fmt.dayMonthShort(muscle.series.first?.date ?? ""))).font(Typo.caption)
                        .foregroundStyle(change > 0 ? Palette.green : Palette.amber)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            } chart: { height in
                let values = muscle.series.map { Units.weight($0.value) }
                VStack(spacing: 6) {
                    LineChart(values: values, color: Palette.brown, lo: (values.min() ?? 0) - 0.5, hi: (values.max() ?? 1) + 0.5, height: height)
                    ChartSpan(dates: muscle.series.map(\.date))
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct BodyFatWidget: View {
    let fat: HealthSnapshot.BodyFat
    var size: WidgetSize = .medium

    var body: some View {
        Card {
            WidgetHeader(title: "Tělesný tuk", color: Palette.gold)
            SizedWidgetBody(size: size, mediumChart: 44) {
                NumberText(value: Fmt.decimal(fat.value), unit: "%")
                if let change = fat.change, change != 0 {
                    Text(L10n.f("%@ %@ od %@", change < 0 ? "↓" : "↑", Fmt.decimal(abs(change)), Fmt.dayMonthShort(fat.series.first?.date ?? ""))).font(Typo.caption)
                        .foregroundStyle(change < 0 ? Palette.green : Palette.amber)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            } chart: { height in
                VStack(spacing: 6) {
                    LineChart(values: values, color: Palette.gold, lo: (values.min() ?? 10) - 0.5, hi: (values.max() ?? 25) + 0.5, height: height)
                    ChartSpan(dates: fat.series.map(\.date))
                }
            }
        }
    }

    private var values: [Double] { fat.series.map(\.value) }
}
