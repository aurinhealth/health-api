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
                        DayBar(date: model.headerDay(health.date))
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
            .tabRoot(.health)
        }
        .task { await model.refreshIfStale(.health) }
    }
}

/// A drill-down page: the section's background, a back button and a column.
struct DetailScreen<Content: View>: View {
    @Environment(\.tabGlow) private var tabGlow
    var glow: Color = Palette.Glow.health
    /// Shown in the pinned bar once the page is scrolled.
    var title: String? = nil
    /// The title always on top, as the planned gym detail's "GYM".
    var pinTitle = false
    /// The coach top right asks about this (CoachEntry); nil asks about the day.
    var coach: CoachSubject? = nil
    /// Every subpage has the coach top right (PRAVIDLO-KOUC-VPRAVO-NAHORE);
    /// off only where it is the coach itself or an add flow.
    var showsCoach = true
    /// The page's "i" or "…", in the coach's capsule.
    var info: ChromeAction? = nil
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: tabGlow ?? glow)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    BackSlot { dismiss() }
                    content
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: title, pinTitle: pinTitle, coach: showsCoach ? CoachEntry(subject: coach, view: Self.coachView(glow), companion: info) : nil) { dismiss() }
        .navBarVisibility(.hidden)
    }

    /// The section the page belongs to, for the coach asked about the day.
    static func coachView(_ glow: Color) -> String {
        switch glow {
        case Palette.Glow.training: return "training"
        case Palette.Glow.health: return "health"
        case Palette.Glow.food: return "food"
        default: return "today"
        }
    }
}

/// The Health screen without the scroll view, so tests can render it whole.
struct HealthContent: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var page
    let health: HealthSnapshot
    @Environment(\.tabActions) private var actions
    @State private var editing = false
    @State private var showMonth = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The top of the concept: "November ⌄" (the month calendar) and the
            // capsule, without the week strip (point 45); it stays put while
            // the day below is swiped, and a day drawn beside has none.
            if page == nil && !editing {
                VStack(alignment: .leading, spacing: 0) {
                    TabHeader(date: model.headerDay(health.date), month: { showMonth = true }, coach: actions.coach, settings: actions.settings)
                    // Without the week strip, another day than today is named under the month.
                    if let day = model.selectedDate {
                        Text(verbatim: Fmt.weekdayShort(day) + " " + Fmt.dayMonth(day)).font(Typo.caption).foregroundStyle(Palette.muted)
                            .padding(.top, 4)
                    }
                    // Stale or broken sources, as on Today (DATA-4: freshness and
                    // connection states stay).
                    if model.selectedDate == nil && !model.demo {
                        DataAgePill()
                        ConnectionProblemCard()
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
            }
            day
                .padding(.horizontal, 24)
                .padding(.top, editing ? 16 : 0)
                .daySwipe(date: health.date, enabled: !editing) { page in page.health.map { AnyView(HealthContent(health: $0)) } }
            // "Edit overview" as on Food, under the day rather than inside the
            // swiped page, which cut it in half (point 56).
            if page == nil && !editing {
                WidgetEditButton(title: "Upravit přehled") { withAnimation(.easeInOut(duration: 0.25)) { editing = true } }
                    .padding(.top, 28)
            }
        }
        .task { if model.cycle == nil { await model.loadCycle() } }
        .sheet(isPresented: $showMonth) { MonthCalendarSheet(date: health.date) }
    }

    /// The day under the week: what a swipe moves.
    private var day: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                // Redesign H: Aurin age on top, readiness is a row of Health
                // monitor below (D-ZDRAVI-1, -3).
                AurinAgeHero(health: health, pro: !model.coachLocked || model.demo, noWearable: model.noWearable)
                    .padding(.top, 20)
                if let age = health.aurinAge {
                    AurinAgeTrendCard(age: age).padding(.top, 20)
                    AurinAgeShapes(age: age, health: health).padding(.top, 28)
                    AurinAgeCoachCard(age: age).padding(.top, 12)
                }
                if model.noWearable {
                    NoDeviceCard(connect: actions.settings).padding(.top, 20)
                }
            }

            WidgetBoard(panel: .health,
                        data: WidgetData(panel: .health, today: page.map(\.today) ?? model.today, health: health, training: model.training, food: page.map(\.food) ?? model.food),
                        editing: $editing, editTitle: "Upravit přehled", editButtonBelow: true)
                .padding(.top, editing ? 0 : 30)

            // Cycle tracking, only for today and for those who track it, under
            // Body (D-ZDRAVI-20), with the morning question.
            if !editing, (page.map(\.selectedDate) ?? model.selectedDate) == nil, let cycle = model.cycle, cycle.enabled, let state = cycle.state {
                CycleHealthSection(state: state, today: (page.map(\.today) ?? model.today)?.cycle).padding(.top, 20)
            }
        }
    }
}

// MARK: - Readiness

/// The readiness part on the shared range bar.
struct RangeBand: View {
    let part: HealthSnapshot.Part

    var body: some View {
        if let value = part.value, let low = part.low, let high = part.high {
            RangeBar(value: value, low: low, high: high, color: ReadinessText.color(part))
        }
    }
}

/// What readiness is, from the "i" top right.
struct ReadinessInfo: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(verbatim: L10n.tr("Připravenost")).font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                }
                HowMeasuredCard(text: "Připravenost porovnává tvou poslední noc, HRV, klidový tep, dech a teplotu s tvými obvyklými dny, na stupnici 0 až 100. Ranní odpověď ji nemění. Je to odhad, ne měření tvého těla.")
                Text(verbatim: L10n.tr("Nejde o lékařské hodnocení."))
                    .font(Typo.body).foregroundStyle(Palette.muted)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
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

    /// -1 under the usual range, 1 above it, 0 within.
    static func side(_ part: HealthSnapshot.Part) -> Int {
        guard let value = part.value, let low = part.low, let high = part.high else { return 0 }
        return value > high ? 1 : value < low ? -1 : 0
    }

    /// Where the value is against the usual range, in words only (intended
    /// purpose); the colour of its points says whether it helps.
    static func longWord(_ part: HealthSnapshot.Part) -> String {
        switch side(part) {
        case 1: return L10n.tr("nad obvyklým rozmezím")
        case -1: return L10n.tr("pod obvyklým rozmezím")
        default: return L10n.tr("v obvyklém rozmezí")
        }
    }

    /// Green when the value helps the readiness, rust when it costs points.
    static func color(_ part: HealthSnapshot.Part) -> Color {
        part.points < 0 ? Palette.rust : Palette.green
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
    /// Today's rule-based sentence and advice (TodaySnapshot.summary) for the coach card.
    var summary: TodaySnapshot.Summary? = nil
    /// No watch or ring (AppModel.noWearable): why no number is coming.
    var noWearable = false
    /// Today's answer to "Jak se dnes cítíš?" (.some(nil) unanswered); nil hides the question.
    var checkin: String?? = nil
    @Environment(\.tabActions) private var actions

    @Environment(AppModel.self) private var model
    @State private var period: ChartPeriod = .days30

    var body: some View {
        let r = health.readiness
        VStack(alignment: .leading, spacing: 0) {
            // Concept 4 (Připravenost): the dial 0 to 100, no label over it
            // (the title says it, D.md decision 4), no range numbers (SCI-4).
            if let score = r.score {
                let zone = ReadinessText.pill(r.zone)
                RangeDial(value: Double(score), scale: 0...100, fill: true, bandColor: nil, dotColor: zone?.1,
                          ends: ("0", "100"), size: 210, spoken: L10n.tr("Připravenost") + " " + String(score) + (zone.map { ", " + $0.0 } ?? "")) {
                    VStack(spacing: 2) {
                        Text(String(score)).font(Typo.number(72)).foregroundStyle(Palette.ink)
                        if let zone { Text(verbatim: zone.0).font(Typo.caption.weight(.medium)).foregroundStyle(zone.1) }
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 20)
                if let line = ReadinessText.numbersLine(model.today?.readiness.numbersLine) {
                    Text(verbatim: line + ".").font(Typo.heading(24, relativeTo: .title3)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                        .padding(.top, 12)
                }
            } else if let days = r.learningDays {
                // Without a number, why (audit 14.4): the same as the Health card.
                ReadinessLearning(days: days, title: Typo.heading(30, relativeTo: .title))
            } else if noWearable {
                NoDeviceCard(connect: actions.settings).padding(.top, 12)
            } else {
                Text("Zatím bez čísla").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 8)
                Text("Připravenost potřebuje dnešní noc a aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }

            if let checkin {
                MorningCheckinCard(feeling: checkin, keepAnswered: true, top: 24)
            }

            // The morning answer is not a part of the number (T-HAB-1).
            let parts = r.parts.filter { $0.key != "checkin" }
            if !parts.isEmpty {
                // Not "What shapes it": that is Aurin age's (D-ZDRAVI-22).
                SectionLabel(text: "Minulá noc proti tvému obvyklému").padding(.top, 30)
                Card {
                    ForEach(Array(parts.enumerated()), id: \.element.id) { i, part in
                        if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                        if let route = Self.route(part.key) {
                            RouteLink(route: route) { partRow(part).contentShape(Rectangle()) }
                        } else {
                            partRow(part)
                        }
                    }
                }
                .padding(.top, 10)
            }

            let points = historyPoints
            if points.count > 1 {
                Card {
                    DetailChart(points: points, today: points.last?.date ?? health.date, period: $period,
                                note: "Každý bod je jedno ráno. Čárkovaně průměr období.", periods: [.days30, .months3])
                }
                .padding(.top, 24)
            }

            // The coach card at the bottom (concept 4); Ask Coach is its last
            // row, the coach itself is top right.
            if let summary, let lead = summary.headline ?? summary.text {
                CoachSentenceCard(lead: lead, key: summary.recommendation).padding(.top, 24)
            }
        }
        .task { await model.loadQuarter(ending: health.date) }
    }

    /// The mornings from /app/api/days (90 days), the snapshot's 14 days where those are missing.
    private var historyPoints: [ChartPoint] {
        var values: [String: Double] = [:]
        for point in health.readiness.history { values[point.date] = point.value }
        for (date, day) in model.dayValues where date <= health.date {
            if let score = day.readiness?.score { values[date] = Double(score) }
        }
        if let score = health.readiness.score { values[health.date] = Double(score) }
        return values.keys.sorted().map { ChartPoint(date: $0, value: values[$0] ?? 0) }
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

    /// Concept 4: the name and the value on the left, the bar with the usual
    /// range in the middle, where the value is in words on the right. No
    /// points (concept note: a state in words instead of signed points).
    private func partRow(_ part: HealthSnapshot.Part) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ReadinessText.label(part.key)).font(Typo.caption).foregroundStyle(Palette.muted)
                Text(value(part.key)).font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(minWidth: 96, alignment: .leading)
            if part.low != nil, part.high != nil, part.value != nil {
                // The word and the bar, no range numbers on readiness (SCI-4).
                RangeBand(part: part).frame(maxWidth: 90)
                Spacer(minLength: 4)
                Text(ReadinessText.longWord(part)).font(Typo.caption.weight(.medium)).foregroundStyle(ReadinessText.color(part))
                    .multilineTextAlignment(.trailing)
            } else {
                Spacer(minLength: 4)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func value(_ key: String) -> String {
        let r = health.readiness
        switch key {
        case "hrv": return r.hrv.map { Fmt.int($0) + " ms" } ?? "–"
        case "restingHR": return r.restingHR.map { Fmt.int($0) + " bpm" } ?? "–"
        case "sleep": return r.sleepMinutes.map(Fmt.hoursMinutesLong) ?? "–"
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
                    NumberText(value: sleep.night?.minutes.map(Fmt.hoursMinutesLong) ?? "–", spoken: Fmt.hoursMinutesSpoken(sleep.night?.minutes))
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
                             targetTag: (name: L10n.tr("odhad potřeby"), value: Fmt.hoursMinutesLong(need)))
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
                NumberText(value: Fmt.duration(debt.minutes), spoken: Fmt.hoursMinutesSpoken(Double(debt.minutes)))
                Text(nights).font(Typo.caption).foregroundStyle(Palette.faint)
                DebtStrip(minutes: debt.minutes)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    NumberText(value: Fmt.duration(debt.minutes), spoken: Fmt.hoursMinutesSpoken(Double(debt.minutes)))
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
/// colour: no red past 3 h that nothing explains (chart review 15). A debt
/// over 6 h stretches the strip to its whole hour, so the bar isn't just full.
struct DebtStrip: View {
    let minutes: Int
    var height: CGFloat = 4

    static func scaleHours(_ minutes: Int) -> Int { max(6, Int((Double(minutes) / 60).rounded(.up))) }

    var body: some View {
        let hours = Self.scaleHours(minutes)
        VStack(spacing: 4) {
            ProgressLine(fraction: Double(minutes) / Double(hours * 60), color: Palette.amberBar, height: height)
            ChartSpan(start: "0", end: "\(hours) h")
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
