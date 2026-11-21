import Charts
import SwiftUI

/// A value of Health with its page on the new detail template (redesign H):
/// the sibling cells of its group on top, the number with its state, the
/// chart with the usual band, Trend analysis and the page's own cards. The
/// coach and the "i" sit top right (PRAVIDLO-KOUC-VPRAVO-NAHORE).
enum HealthValue: String, CaseIterable, Identifiable {
    case restingHR, hrv, respiration, oxygen, temperature
    case weight, bodyFat, muscle
    case steps, activeEnergy

    var id: String { rawValue }

    init?(metric: HealthMetric) { self.init(rawValue: metric.rawValue) }

    /// The page title and the cell's name (Czech keys).
    var title: String {
        switch self {
        case .restingHR: return "Klidový tep"
        case .hrv: return "HRV"
        case .respiration: return "Dech"
        case .oxygen: return "Kyslík"
        case .temperature: return "Teplota kůže"
        case .weight: return "Váha"
        case .bodyFat: return "Tělesný tuk"
        case .muscle: return "Svaly"
        case .steps: return "Kroky"
        case .activeEnergy: return "Aktivní energie"
        }
    }

    /// The siblings switched by the cells on top (concept 26 to 43).
    var group: [HealthValue] {
        switch self {
        case .restingHR, .hrv, .respiration, .oxygen, .temperature: return [.restingHR, .hrv, .respiration, .oxygen, .temperature]
        case .weight, .bodyFat, .muscle: return [.weight, .bodyFat, .muscle]
        case .steps, .activeEnergy: return [.steps, .activeEnergy]
        }
    }

    /// The metric of GET /app/api/health/series; nil keeps the points the
    /// Health, Today or Training snapshot already has.
    var seriesKey: String? {
        switch self {
        case .restingHR, .hrv, .respiration, .oxygen, .steps: return rawValue
        default: return nil
        }
    }

    var unit: String {
        switch self {
        case .restingHR: return "bpm"
        case .hrv: return "ms"
        case .respiration: return "za min"
        case .oxygen, .bodyFat: return "%"
        case .temperature: return Units.temperatureUnit
        case .weight, .muscle: return Units.weightUnit
        case .steps: return ""
        case .activeEnergy: return "kcal"
        }
    }

    var digits: Int {
        switch self {
        case .respiration, .temperature, .weight, .bodyFat, .muscle: return 1
        default: return 0
        }
    }

    /// A night's value (sleep) or a day's.
    var nightly: Bool { [.hrv, .respiration, .oxygen, .temperature].contains(self) }
    var hasBand: Bool { group.first == .restingHR }
    var partialToday: Bool { self == .steps || self == .activeEnergy }

    /// The coach about this value (P1 knows the metric keys).
    func coach(line: String?, date: String) -> CoachSubject {
        if let metric = HealthMetric(rawValue: rawValue) { return .metric(metric, line: line, date: date) }
        let questions: [String]
        switch self {
        case .weight: questions = ["Jak se mi vyvíjí váha?", "Jak upravit jídlo?", "Jak upravit trénink?"]
        case .steps: questions = ["Jak se mi daří s kroky?", "Jak se víc hýbat přes den?", "Mám dnes trénovat?"]
        default: questions = ["Jak se mi vyvíjí aktivní energie?", "Jak upravit jídlo?", "Mám dnes trénovat?"]
        }
        return CoachSubject(kind: .metric, title: L10n.tr(title), line: line, metric: rawValue, date: date, view: "health",
                            symbol: "waveform.path.ecg", color: Palette.green, questions: questions)
    }

    /// What the "i" says: how the value is measured, never what it means for health.
    var howMeasured: String {
        switch self {
        case .restingHR: return "Nejnižší tep dne v klidu, jak ho změří hodinky nebo prsten."
        case .hrv: return "Variabilita srdečního tepu v noci: jak moc se liší čas mezi údery srdce. Měří ji hodinky nebo prsten ve spánku."
        case .respiration: return "Počet dechů za minutu ve spánku, odhad hodinek nebo prstenu."
        case .oxygen: return "Kyslík v krvi ve spánku, odhad hodinek nebo prstenu. Není to lékařské měření."
        case .temperature: return "Teplota kůže ve spánku jako rozdíl proti tvým obvyklým nocím. Hodinky ani prsten neměří teplotu těla."
        case .weight, .bodyFat, .muscle: return "Hodnoty z chytré váhy nebo z tvých zápisů. Tuk a svaly jsou odhad váhy."
        case .steps: return "Kroky za den z telefonu, hodinek nebo prstenu."
        case .activeEnergy: return "Energie spálená pohybem nad klidovým výdejem, odhad hodinek nebo telefonu."
        }
    }
}

/// The value as the page shows it, from the snapshots the app already has.
struct HealthValueReading {
    var value: Double?
    var text: String
    var label: String?
    var state: MetricState?
    var usual: String?
    var spoken: String?
    /// Points of the snapshot (oldest first) when the series endpoint has none.
    var local: [ChartPoint] = []
    /// The value measured for the page's day itself (not an older day's
    /// fallback): the chart's point for that day shows this same number.
    var current: Double? = nil
}

struct HealthValuePage: View {
    @Environment(AppModel.self) private var model
    @State var value: HealthValue
    @State private var period: ChartPeriod = .days30
    @State private var loaded: [String: HealthSeries] = [:]
    @State private var info = false
    @State private var adding = false

    private var today: String { HealthValueContent.today(model) }
    private var seriesId: String { value.rawValue + ":" + period.key }

    var body: some View {
        let reading = HealthValueContent.reading(value, model: model)
        DetailTemplate(title: value.title) {
            CoachEntry(subject: value.coach(line: reading.value == nil ? nil : reading.text + (value.unit.isEmpty ? "" : " " + L10n.tr(value.unit)), date: today),
                       view: "health",
                       companion: ChromeAction(systemImage: "info", label: "Jak se to měří") { info = true })
        } content: {
            HealthValueContent(value: $value, period: $period, loaded: loaded[seriesId], add: { adding = true })
        }
        .task(id: seriesId) { await load() }
        .task { await model.refreshIfStale(.health) }
        .task { if value.group.first == .steps, model.today == nil { await model.refresh() } }
        .task { if value.group.first == .steps, model.training == nil { await model.refreshTraining() } }
        .sheet(isPresented: $info) { HealthValueInfo(value: value) }
        .sheet(isPresented: $adding) { WeightEntrySheet() }
    }

    /// The period's series from the server, once per value and period; the
    /// demo and a failed load keep the snapshot's points.
    private func load() async {
        guard let key = value.seriesKey, loaded[seriesId] == nil, !model.demo else { return }
        let id = seriesId
        if let series = try? await model.api.healthSeries(metric: key, period: period) { loaded[id] = series }
    }
}

/// The page under the title row, without the scroll view, so tests can render it whole.
struct HealthValueContent: View {
    @Environment(AppModel.self) private var model
    @Binding var value: HealthValue
    @Binding var period: ChartPeriod
    /// GET /app/api/health/series for this value and period, when it came.
    var loaded: HealthSeries? = nil
    var add: () -> Void = {}

    private var today: String { Self.today(model) }

    static func today(_ model: AppModel) -> String { model.health?.date ?? model.today?.date ?? AppModel.localDate(Date()) }

    var body: some View {
        let reading = Self.reading(value, model: model)
        VStack(alignment: .leading, spacing: 0) {
            let cells = value.group.compactMap { v -> SiblingCell? in
                let r = Self.reading(v, model: model)
                guard r.value != nil else { return nil }
                return SiblingCell(id: v.rawValue, title: v.title, value: r.text, unit: v.unit.isEmpty ? nil : v.unit, spokenState: r.state?.words)
            }
            if cells.count > 1 {
                SiblingCells(cells: cells, selected: value.rawValue) { id in
                    if let next = HealthValue(rawValue: id) { value = next }
                }
                .padding(.top, 16)
            }
            if reading.value == nil {
                Card { LearningState(kind: .missing, text: Self.missingText(value)) }.padding(.top, 20)
                if value == .weight { addEntry.padding(.top, 12) }
            } else {
                DetailHeadline(label: reading.label, value: reading.text, unit: value.unit.isEmpty ? nil : value.unit,
                               state: reading.state, usual: reading.usual, spoken: reading.spoken)
                if value == .weight { addEntry }
                let points = chartPoints(reading)
                Card {
                    DetailChart(points: points, today: today, period: $period, unit: L10n.tr(value.unit), digits: value.digits,
                                note: note(points.count), source: source)
                }
                .padding(.top, 12)
                let rows = TrendMath.rows(points, today: lastDay(points), lags: period.weekly ? TrendLags.year : TrendLags.month)
                if !rows.isEmpty {
                    SectionLabel(text: "Analýza trendu").padding(.top, 28)
                    Card { TrendTable(rows: rows, unit: L10n.tr(value.unit), digits: value.digits) }.padding(.top, 10)
                }
                extraCards
            }
        }
    }

    // MARK: Points

    /// The server's series when it came, else the snapshot's points. A day
    /// that is still running (steps, active energy) stays out, so the chart
    /// never shows a drop each morning (D-ZDRAVI-19); the number on top has it.
    private func chartPoints(_ reading: HealthValueReading) -> [ChartPoint] {
        let points = loaded?.shown ?? reading.local
        return value.partialToday ? points.filter { $0.date < today } : Self.withCurrent(points, today: today, current: reading.current)
    }

    /// The headline's number is the chart's point for the day (DES-4, 1 bpm
    /// apart), and a day the series doesn't have yet is added, so "Last
    /// night" never selects an older night (DES-11, oxygen).
    static func withCurrent(_ points: [ChartPoint], today: String, current: Double?) -> [ChartPoint] {
        guard let current else { return points }
        var points = points.filter { $0.date <= today }
        if let i = points.firstIndex(where: { $0.date == today }) {
            let p = points[i]
            points[i] = ChartPoint(date: today, value: current, low: p.low, high: p.high, state: p.state, side: p.side)
        } else {
            points.append(ChartPoint(date: today, value: current, low: points.last?.low, high: points.last?.high))
        }
        return points
    }

    /// The last finished day the Trend rows end on.
    private func lastDay(_ points: [ChartPoint]) -> String {
        value.partialToday ? ISODay.shift(today, -1) : (points.last?.date ?? today)
    }

    private func note(_ count: Int) -> String {
        switch value {
        // One measurement says so, the line needs a second (DES-11).
        case .weight, .bodyFat, .muscle: return count == 1 ? "Zatím jediné měření. Čára se začne kreslit od druhého." : "Každý bod je jedno měření."
        case .steps, .activeEnergy: return period.weekly ? "Každý bod je týdenní průměr. Čárkovaně průměr období." : "Každý bod je jeden celý den. Čárkovaně průměr období."
        case .temperature: return "Každý bod je jedna noc jako rozdíl proti tvé obvyklé noci. Šedý pruh je tvoje obvyklé rozmezí."
        default:
            if period.weekly { return "Každý bod je týdenní průměr. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období." }
            return value.nightly ? "Každý bod je jedna noc. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období."
                : "Každý bod je jeden den. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období."
        }
    }

    /// "Apple Watch" from the service that measured the newest days (HRV sends it).
    private var source: String? {
        guard let stretch = loaded?.sources?.last, let id = stretch.source else { return nil }
        return Self.serviceName(id)
    }

    static func serviceName(_ id: String) -> String {
        switch id.lowercased() {
        case "apple", "apple-health", "applehealth", "healthkit": return "Apple Health"
        case "google", "google-health", "fitbit": return "Google Health"
        case "whoop": return "WHOOP"
        case "oura": return "Oura"
        case "garmin": return "Garmin"
        case "ultrahuman": return "Ultrahuman"
        case "intervals", "intervals.icu": return "Intervals.icu"
        case "wahoo": return "Wahoo"
        case "polar": return "Polar"
        default: return id
        }
    }

    // MARK: Cards of one page

    private var addEntry: some View {
        HStack {
            Spacer()
            Button(action: add) {
                Label { Text("Přidat záznam") } icon: { Image(systemName: "plus") }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 18).frame(minHeight: 44)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18)) }
            }
            .buttonStyle(.plain)
            Spacer()
        }
    }

    @ViewBuilder private var extraCards: some View {
        switch value {
        case .restingHR: moreHeart
        case .steps: stepsCards
        default: EmptyView()
        }
    }

    /// "More heart data" (D-ZDRAVI-24): each value with its state in words.
    @ViewBuilder private var moreHeart: some View {
        if let health = model.health, health.hrRecovery != nil || health.walkingHR != nil {
            SectionLabel(text: "Další data srdce").padding(.top, 28)
            Card {
                if let r = health.hrRecovery {
                    heartRow("Zotavení tepu po tréninku", r.value, health.states?["hrRecovery"]?.metricState)
                }
                if health.hrRecovery != nil && health.walkingHR != nil { Rectangle().fill(Palette.hairline).frame(height: 1) }
                if let w = health.walkingHR {
                    heartRow("Tep při chůzi", w.value, health.states?["walkingHR"]?.metricState)
                }
            }
            .padding(.top, 10)
        }
    }

    private func heartRow(_ title: String, _ bpm: Double, _ state: MetricState?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink)
                Text(verbatim: state?.words ?? L10n.tr("Zatím málo dat pro obvyklé rozmezí"))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 12)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: Fmt.int(bpm)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                Text(verbatim: "bpm").font(.caption2).foregroundStyle(Palette.faint)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// One Steps page (D-ZDRAVI-18, Petr 2026-11-16): today through the day
    /// against the usual day, then the active minutes.
    @ViewBuilder private var stepsCards: some View {
        if let steps = model.today?.steps {
            if let hourly = steps.hourly, hourly.count == 24, steps.hour != nil {
                SectionLabel(text: "Během dne").padding(.top, 28)
                Card { StepsThroughDay(steps: steps, hourly: hourly) }.padding(.top, 10)
            }
            if let active = steps.activeMinutes {
                SectionLabel(text: "Aktivní minuty").padding(.top, 28)
                Card {
                    HStack(alignment: .firstTextBaseline, spacing: 28) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: Fmt.int(active.today) + " min").font(Typo.number(30)).foregroundStyle(Palette.ink)
                            Text("dnes").font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: Fmt.int(active.week) + " min").font(Typo.number(30)).foregroundStyle(Palette.ink)
                            Text(verbatim: L10n.f("tento týden, cíl %@", Fmt.int(active.target ?? 150))).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    Text("Minuta v intenzivní nebo maximální zóně se počítá dvakrát, jak to doporučuje WHO.")
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 10)
            }
        }
    }

    // MARK: Readings

    static func missingText(_ value: HealthValue) -> String {
        switch value {
        case .weight: return "Zapiš si váhu a začne se kreslit graf."
        case .bodyFat, .muscle: return "Ukáže se, až chytrá váha pošle první měření."
        case .steps, .activeEnergy: return "Ukáže se, až telefon nebo hodinky pošlou první den."
        default: return "Zatím bez měření. Vezmi si hodinky nebo prsten do postele a hodnota se ukáže po první noci."
        }
    }

    /// "Obvyklé rozmezí 50 až 56 bpm".
    static func usual(_ low: Double?, _ high: Double?, _ value: HealthValue) -> String? {
        guard let low, let high, high > low else { return nil }
        let unit = value.unit.isEmpty ? "" : " " + L10n.tr(value.unit)
        return L10n.f("Obvyklé rozmezí %@ až %@", Fmt.decimal(low, digits: value.digits), Fmt.decimal(high, digits: value.digits)) + unit
    }

    static func points(_ list: [Point], low: Double? = nil, high: Double? = nil, map: (Double) -> Double = { $0 }) -> [ChartPoint] {
        list.map { ChartPoint(date: $0.date, value: map($0.value), low: low, high: high) }
    }

    /// The night's value only when the snapshot's newest point is that day
    /// (oxygen and the others carry the newest night, which can be older).
    static func current(_ value: Double?, _ series: [Point], _ day: String?) -> Double? {
        series.last?.date == day ? value : nil
    }

    static func reading(_ value: HealthValue, model: AppModel) -> HealthValueReading {
        let health = model.health
        let state = health?.states?[value.rawValue]?.metricState
        let text = { (v: Double) in Fmt.decimal(v, digits: value.digits) }
        switch value {
        case .restingHR:
            guard let r = health?.restingHR, let v = r.value ?? r.series.last?.value else { return HealthValueReading(text: "–") }
            return HealthValueReading(value: v, text: text(v), label: "Dnes, nejnižší tep v klidu", state: state,
                                      usual: usual(r.usual?.lowerBound, r.usual?.upperBound, value), local: points(r.series, low: r.usual?.lowerBound, high: r.usual?.upperBound),
                                      current: r.value)
        case .hrv:
            guard let h = health?.hrv, let v = h.value ?? h.series.last?.value else { return HealthValueReading(text: "–") }
            return HealthValueReading(value: v, text: text(v), label: "Minulá noc, variabilita tepu", state: state,
                                      usual: usual(h.low, h.high, value), local: points(h.series, low: h.low, high: h.high), current: Self.current(h.value, h.series, health?.date))
        case .respiration:
            guard let r = health?.respiration else { return HealthValueReading(text: "–") }
            let low = r.baseline.map { $0 - 0.5 }, high = r.baseline.map { $0 + 0.5 }
            return HealthValueReading(value: r.value, text: text(r.value), label: "Minulá noc, dechů za minutu ve spánku",
                                      state: state ?? (r.elevated ? .off(above: true) : nil),
                                      usual: usual(low, high, value), local: points(r.series, low: low, high: high), current: Self.current(r.value, r.series, health?.date))
        case .oxygen:
            guard let o = health?.oxygen else { return HealthValueReading(text: "–") }
            // The same band and state as Health monitor (oxygen is never "above").
            let band = HealthMonitorCard.oxygenBand(low: o.low, high: o.high)
            return HealthValueReading(value: o.value, text: Fmt.decimal(o.value, digits: o.value.rounded() == o.value ? 0 : 1),
                                      label: "Minulá noc, kyslík v krvi ve spánku",
                                      state: HealthMonitorCard.oxygenState(state, value: o.value, band: band),
                                      usual: band.map { usual($0.lowerBound, $0.upperBound, value) } ?? nil,
                                      local: points(o.series, low: band?.lowerBound, high: band?.upperBound), current: Self.current(o.value, o.series, health?.date))
        case .temperature:
            // The night against the athlete's own nights: within half a degree is the usual night.
            let deviation = health?.wristTemp?.deviation ?? health?.skinTemp?.deviation
            guard let d = deviation else { return HealthValueReading(text: "–") }
            let list = health?.wristTemp?.deviations ?? health?.skinTemp?.series ?? []
            let elevated = health?.skinTemp?.elevated == true
            let night: MetricState = elevated ? .off(above: true) : abs(d) <= 0.5 ? .within : .off(above: d > 0)
            let shown = Units.temperatureChange(d)
            let half = Units.temperatureChange(0.5)
            return HealthValueReading(value: shown, text: Fmt.signed(shown, digits: 1), label: "Minulá noc, teplota kůže proti obvyklé",
                                      state: night, usual: L10n.f("Obvyklé rozmezí do %@ %@ na obě strany", Fmt.decimal(half, digits: 1), Units.temperatureUnit),
                                      local: points(list, low: -half, high: half, map: Units.temperatureChange))
        case .weight:
            guard let w = health?.weight else { return HealthValueReading(text: "–") }
            let v = Units.weight(w.latest)
            return HealthValueReading(value: v, text: text(v), label: L10n.f("Poslední vážení, %@", Fmt.dayMonth(w.date)), state: nil,
                                      usual: w.goal.map { L10n.f("Cíl %@ %@", Fmt.decimal(Units.weight($0), digits: 1), Units.weightUnit) },
                                      local: points(w.series, map: Units.weight))
        case .bodyFat:
            guard let f = health?.weight?.bodyFat else { return HealthValueReading(text: "–") }
            return HealthValueReading(value: f.value, text: text(f.value), label: f.series.last.map { L10n.f("Poslední měření, %@", Fmt.dayMonth($0.date)) },
                                      usual: "z chytré váhy", local: points(f.series))
        case .muscle:
            guard let m = health?.weight?.muscle else { return HealthValueReading(text: "–") }
            let v = Units.weight(m.value)
            return HealthValueReading(value: v, text: text(v), label: m.series.last.map { L10n.f("Poslední měření, %@", Fmt.dayMonth($0.date)) },
                                      usual: "z chytré váhy", local: points(m.series, map: Units.weight))
        case .steps:
            guard let s = model.today?.steps, let v = s.today else { return HealthValueReading(text: "–") }
            return HealthValueReading(value: v, text: Fmt.int(v), label: "Kroky dnes, zatím",
                                      usual: L10n.f("z tvého cíle %@", Fmt.int(s.goal)), local: points(s.month ?? s.week))
        case .activeEnergy:
            guard let a = model.training?.activeCalories, let v = a.today else { return HealthValueReading(text: "–") }
            return HealthValueReading(value: v, text: Fmt.int(v), label: "Aktivní energie dnes, zatím",
                                      usual: a.usual.map { L10n.f("Obvykle %@ kcal za den", Fmt.int($0)) }, local: points(a.days ?? a.week))
        }
    }
}

/// Steps today as a running total from 6:00, against the usual day (dotted)
/// and the goal line (concept 16, now a card on Steps).
struct StepsThroughDay: View {
    let steps: TodaySnapshot.Steps
    let hourly: [Double]

    private struct Mark: Identifiable {
        let hour: Int
        let value: Double
        let series: String
        var id: String { series + String(hour) }
    }

    var body: some View {
        let now = min(max(steps.hour ?? 23, 0), 23)
        let totals = hourly.count == 24 ? Self.runningTotals(hourly) : Array(repeating: 0, count: 24)
        let hours = Array(6...23)
        let done = hours.filter { $0 <= now }.map { Mark(hour: $0, value: totals[$0], series: "today") }
        let usual = (steps.usual ?? []).count == 24 ? hours.map { Mark(hour: $0, value: steps.usual![$0], series: "usual") } : []
        let byNow = (steps.usual ?? []).count == 24 ? steps.usual![now] : nil
        VStack(alignment: .leading, spacing: 10) {
            if let byNow {
                Text(verbatim: L10n.f("Obvykle %@ kroků touhle dobou.", Fmt.int(byNow))).font(Typo.body).foregroundStyle(Palette.secondary)
            }
            Chart {
                ForEach(usual) { m in
                    LineMark(x: .value("Hodina", m.hour), y: .value("Kroky", m.value), series: .value("Řada", "usual"))
                        .foregroundStyle(Palette.faint)
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [2, 4]))
                }
                ForEach(done) { m in
                    LineMark(x: .value("Hodina", m.hour), y: .value("Kroky", m.value), series: .value("Řada", "today"))
                        .foregroundStyle(Palette.green)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .interpolationMethod(.monotone)
                }
                if let last = done.last {
                    PointMark(x: .value("Hodina", last.hour), y: .value("Kroky", last.value)).foregroundStyle(Palette.green).symbolSize(40)
                }
                RuleMark(y: .value("Cíl", steps.goal))
                    .foregroundStyle(Palette.faint.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .annotation(position: .top, alignment: .trailing) {
                        Text(verbatim: L10n.f("cíl %@", Fmt.int(steps.goal))).font(.caption2).foregroundStyle(Palette.muted)
                    }
            }
            .chartXScale(domain: 6...23)
            .chartXAxis {
                AxisMarks(values: [6, 10, 14, 18, 22]) { v in
                    AxisValueLabel { Text(verbatim: "\(v.as(Int.self) ?? 0):00") }.foregroundStyle(Palette.faint)
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in
                    AxisGridLine().foregroundStyle(Palette.hairline)
                    AxisValueLabel().foregroundStyle(Palette.faint)
                }
            }
            .frame(height: 170)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.f("Dnes %@ kroků z cíle %@", Fmt.int(totals[min(now, 23)]), Fmt.int(steps.goal)))
            HStack(spacing: 16) {
                legend(dashed: false, "dnes zatím")
                if !usual.isEmpty { legend(dashed: true, "tvůj obvyklý den") }
            }
        }
    }

    static func runningTotals(_ hourly: [Double]) -> [Double] {
        var running = 0.0
        return hourly.map { (v: Double) -> Double in running += v; return running }
    }

    private func legend(dashed: Bool, _ text: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(dashed ? Palette.faint : Palette.green).frame(width: 14, height: dashed ? 1.5 : 2.5)
            Text(verbatim: L10n.tr(text)).font(.caption2).foregroundStyle(Palette.muted)
        }
    }
}

/// The page's "i": how the value is measured, the usual range and that it is
/// not a medical assessment (plan, Health law).
struct HealthValueInfo: View {
    let value: HealthValue
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(verbatim: L10n.tr(value.title)).font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                }
                HowMeasuredCard(text: value.howMeasured)
                if value.hasBand {
                    Text(verbatim: L10n.tr("Obvyklé rozmezí počítá Aurin z tvých posledních 60 dní. Hodnota mimo ně jen říká, že se liší od tvých obvyklých dní."))
                        .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Text(verbatim: L10n.tr("Nejde o lékařské hodnocení."))
                    .font(Typo.body).foregroundStyle(Palette.muted)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
    }
}
