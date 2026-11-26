import Charts
import SwiftUI

// MARK: - Training → Load (redesign T)
//
// Two dials, Load balance (every workout) and Muscle load (the gym's work sets
// only), each the last 7 days against the usual 4 weeks. In words only: no
// ratio number anywhere, no "optimal", never a risk of injury (Petr's decision
// B, 2026-11-16; the server's words from src/workload-ratio.js).

enum LoadKind: String, CaseIterable {
    case balance, muscle

    var title: String {
        switch self {
        case .balance: return L10n.tr("Vyváženost zátěže")
        case .muscle: return L10n.tr("Zátěž svalů")
        }
    }

    func view(_ training: TrainingSnapshot) -> TrainingSnapshot.LoadView? {
        switch self {
        case .balance: return training.loadBalance
        case .muscle: return training.muscleLoad
        }
    }

    /// Without any load on record (nil from the server).
    var missing: String {
        switch self {
        case .balance: return L10n.tr("Ukáže se po prvních trénincích.")
        case .muscle: return L10n.tr("Počítá jen posilovnu. Ukáže se po prvním tréninku v posilovně.")
        }
    }

    /// What the value is, under the learning bar and in "How it's measured".
    var about: String {
        switch self {
        case .balance: return L10n.tr("Vyváženost zátěže porovnává tvých posledních 7 dní s obvyklými 4 týdny.")
        case .muscle: return L10n.tr("Zátěž svalů porovnává tvých posledních 7 dní v posilovně s obvyklými 4 týdny.")
        }
    }

    var measured: String {
        switch self {
        case .balance:
            return L10n.tr("Každý trénink dostane zátěž podle délky a toho, jak byl těžký (TSS, bez wattmetru odhad z tepu). Aurin porovná posledních 7 dní s průměrem tvých 4 týdnů. Rozdělení podle intenzity je z času v zónách tepu. Je to odhad, ne měření tvého těla.")
        case .muscle:
            return L10n.tr("Zátěž svalů sčítá pracovní série, které zapíšeš v posilovně, z délky tréninku a úsilí. Kardio a vytrvalostní tréninky se nepočítají. Posledních 7 dní se porovnává s tvým obvyklým týdnem, průměrem 4 týdnů. Je to odhad pro plánování.")
        }
    }
}

/// The dial's scale and words for a LoadView, shared by the tile and the detail.
enum LoadWords {
    static let scale: ClosedRange<Double> = 0.5...1.8

    /// The dial's centre: "As usual", "Harder"…
    static func level(_ level: String?) -> String? {
        switch level {
        case "wellBelow": return L10n.tr("Mnohem lehčí")
        case "below": return L10n.tr("Lehčí")
        case "usual": return L10n.tr("Jako obvykle")
        case "above": return L10n.tr("Těžší")
        case "wellAbove": return L10n.tr("Mnohem těžší")
        default: return nil
        }
    }

    /// In, above or below the usual range, coloured as every detail's state.
    static func state(_ level: String?) -> MetricState? {
        switch level {
        case "usual": return .within
        case "below": return .off(above: false)
        case "above": return .off(above: true)
        // A much lighter week is no alarm: amber like "lighter", never red.
        case "wellBelow": return .off(above: false)
        case "wellAbove": return .far(above: true)
        default: return nil
        }
    }

    /// "In your usual range": the state's words with a capital first letter.
    static func sentence(_ state: MetricState) -> String {
        let words = state.words
        return words.prefix(1).uppercased(with: Fmt.locale) + words.dropFirst()
    }

    /// The tile's scale with the usual range in the middle, so "as usual"
    /// stands at the top of the arc (concept a-hlavni).
    static func scale(around view: TrainingSnapshot.LoadView) -> ClosedRange<Double> {
        let usual = band(view), middle = (usual.lowerBound + usual.upperBound) / 2
        let half = max(scale.upperBound - middle, middle - scale.lowerBound) * 0.7
        return (middle - half)...(middle + half)
    }

    static func band(_ view: TrainingSnapshot.LoadView) -> ClosedRange<Double> {
        min(view.band.low, view.band.high)...max(view.band.low, view.band.high)
    }

    /// Days still to learn, "Learning, 9 more days".
    static func learning(_ view: TrainingSnapshot.LoadView) -> String {
        let need = view.needsDays ?? 21, have = min(view.historyDays ?? 0, need)
        return need > have ? L10n.f("Učí se, ještě %@", L10n.plural("%lld dní", need - have)) : L10n.tr("Učí se")
    }
}

/// "LOAD" on Training: the two dials side by side, each opening its detail.
/// Without logged gym sets (no Muscle load from the server) only Load balance,
/// across the whole width (617 review p10 and C12): a Gym workout from Apple
/// Health has no sets, so "No gym workouts yet" under it read as a mistake.
struct LoadSection: View {
    let training: TrainingSnapshot

    static func kinds(_ training: TrainingSnapshot) -> [LoadKind] {
        training.muscleLoad == nil ? [.balance] : LoadKind.allCases
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Zátěž")
            HStack(alignment: .top, spacing: 12) {
                ForEach(Self.kinds(training), id: \.self) { kind in
                    RouteLink(route: .load(kind.rawValue)) { LoadTile(kind: kind, view: kind.view(training)) }
                }
            }
            // Both tiles as tall as the taller one.
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct LoadTile: View {
    let kind: LoadKind
    let view: TrainingSnapshot.LoadView?

    var body: some View {
        VStack(spacing: 8) {
            // The title names the tile in small capitals with the way into its
            // detail (concept a-hlavni "LOAD BALANCE >"), whole (never "Load balan…").
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                // Two lines kept for both tiles, so their dials stand level.
                Text(verbatim: kind.title.uppercased(with: Fmt.locale))
                    .font(.caption2.weight(.medium)).tracking(1.6).foregroundStyle(Palette.muted)
                    .lineLimit(2, reservesSpace: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
            }
            RangeDial(value: view?.plot, scale: view.map(LoadWords.scale(around:)) ?? LoadWords.scale, band: view.map(LoadWords.band), size: 112, lineWidth: 7,
                      tint: state?.color ?? Palette.green, spoken: spoken) {
                Text(verbatim: centre).font(Typo.heading(19)).foregroundStyle(view?.plot == nil ? Palette.muted : Palette.ink)
            }
            .frame(maxWidth: .infinity)
            Text(verbatim: caption)
                .font(Typo.small.weight(.medium))
                .foregroundStyle(state?.color ?? Palette.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(kind.title)
        .accessibilityValue(spoken)
        .accessibilityAddTraits(.isButton)
    }

    private var state: MetricState? { LoadWords.state(view?.level) }

    private var centre: String {
        guard let view else { return "–" }
        switch view.state {
        case "ready": return LoadWords.level(view.level) ?? "–"
        case "learning": return L10n.tr("Učí se")
        default: return "–"
        }
    }

    private var caption: String {
        guard let view else { return kind == .muscle ? L10n.tr("Zatím bez posilovny") : L10n.tr("Zatím bez tréninků") }
        switch view.state {
        case "ready": return state.map(LoadWords.sentence) ?? ""
        case "learning": return LoadWords.learning(view)
        default: return L10n.tr("Žádný trénink za 4 týdny")
        }
    }

    private var spoken: String { [centre == "–" ? nil : centre, caption].compactMap { $0 }.joined(separator: ", ") }
}

// MARK: - Detail

/// Load balance or Muscle load (concepts K04/020 and 021): the three values on
/// top, the dial in words, the days against the usual band, Load by
/// intensity or Days by load status, Trend analysis and How it's measured.
/// The ratio is never printed (Petr's decision B, 2026-11-16).
struct LoadDetailView: View {
    @State var kind: LoadKind
    let training: TrainingSnapshot
    @State private var info = false

    var body: some View {
        DetailTemplate(title: kind.title, glow: Palette.Glow.training) {
            CoachEntry(subject: kind == .balance ? CoachSubject.load(title: kind.title, date: training.date) : nil, view: "training",
                       companion: ChromeAction(systemImage: "info", label: "Jak se to měří") { info = true })
        } content: {
            LoadDetailContent(kind: $kind, training: training)
        }
        .sheet(isPresented: $info) {
            ScrollView { LoadDetailContent.howMeasured(kind, kind.view(training)).padding(24) }
                .presentationDetents([.medium, .large])
                .presentationBackground(Palette.sheet)
        }
    }
}

struct LoadDetailContent: View {
    @Binding var kind: LoadKind
    let training: TrainingSnapshot
    /// "level", "load" or "usual": the value on top that the page shows.
    @State var cell = "level"
    @State private var period: ChartPeriod = .days30

    var body: some View {
        let view = kind.view(training)
        VStack(alignment: .leading, spacing: 0) {
            if let view, view.state == "ready" {
                let cells = Self.cells(kind, view)
                if cells.count > 1 {
                    SiblingCells(cells: cells, selected: cell) { cell = $0 }.padding(.top, 16)
                }
                if cell == "level" {
                    dial(view)
                    Card { LoadChart(view: view, today: training.date, grey: kind == .muscle) }
                } else if let history = view.history {
                    DetailHeadline(label: cell == "load" ? "Posledních 7 dní" : "Tvůj průměrný týden, poslední 4 týdny",
                                   value: Fmt.int((cell == "load" ? view.load : view.usual) ?? 0), unit: cell == "load" ? "body zátěže" : "za týden")
                    Card {
                        DetailChart(points: history.map { ChartPoint(date: $0.date, value: $0.load) }, today: training.date, period: $period,
                                    note: "Každý bod je zátěž 7 dní končících tím dnem. Čárkovaně průměr období.", periods: [.days30, .months3])
                    }
                }
                if kind == .balance, let parts = view.intensity, !parts.isEmpty {
                    SectionLabel(text: "Zátěž podle intenzity").padding(.top, 28)
                    Card { LoadIntensity(parts: parts) }.padding(.top, 10)
                    Text(verbatim: L10n.tr("Zátěž posledních 7 dní rozdělená podle toho, jak tvrdě pracovalo srdce. Světlejší část pruhu je tvoje obvyklé rozmezí z posledních 4 týdnů."))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8).padding(.horizontal, 4)
                }
                if kind == .muscle {
                    SectionLabel(text: "Dny podle stavu zátěže, posledních 30 dní").padding(.top, 28)
                    Card { LoadDaysByStatus(series: view.series) }.padding(.top, 10)
                }
                let rows = TrendMath.dailyRows((view.history ?? []).map { ChartPoint(date: $0.date, value: $0.load) })
                if !rows.isEmpty {
                    SectionLabel(text: "Analýza trendu").padding(.top, 28)
                    Card {
                        TrendTable(rows: rows, nowCaption: kind == .muscle ? "zátěž svalů za posledních 7 dní" : "zátěž za posledních 7 dní",
                                   footnote: "Každý řádek je zátěž 7 dní tehdy vedle zátěže posledních 7 dní.")
                    }
                    .padding(.top, 10)
                }
                if kind == .muscle, let balance = training.loadBalance, balance.state == "ready" {
                    Button { kind = .balance; cell = "level" } label: {
                        Card {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: LoadKind.balance.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                    Text(verbatim: L10n.f("%@, posledních 7 dní proti průměru 4 týdnů", LoadWords.level(balance.level) ?? "–"))
                                        .font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 12)
                }
            } else if let view, view.state == "learning" {
                Card { LearningState(kind: LearningState.kind(have: view.historyDays, need: view.needsDays), text: kind.about) }.padding(.top, 16)
            } else if let view {
                Card { LearningState(kind: .missing, text: view.state == "quiet" ? L10n.tr("Za poslední 4 týdny tu není žádný trénink.") : kind.about) }.padding(.top, 16)
            } else {
                Card { LearningState(kind: .missing, text: kind.missing) }.padding(.top, 16)
            }
            Self.howMeasured(kind, view).padding(.top, 28)
        }
        .onChange(of: kind) { cell = "level" }
    }

    /// Load balance "As usual", Load 7 days "412", Average "368 a week"; the plain
    /// loads only from a server that sends them.
    static func cells(_ kind: LoadKind, _ view: TrainingSnapshot.LoadView) -> [SiblingCell] {
        var cells = [SiblingCell(id: "level", title: kind.title, value: LoadWords.level(view.level) ?? "–", spokenState: LoadWords.state(view.level)?.words)]
        if view.history != nil, let load = view.load {
            cells.append(SiblingCell(id: "load", title: kind == .muscle ? "Svaly 7 dní" : "Zátěž 7 dní", value: Fmt.int(load), unit: "body zátěže"))
            if let usual = view.usual { cells.append(SiblingCell(id: "usual", title: "Průměr", value: Fmt.int(usual), unit: "za týden")) }
        }
        return cells
    }

    private func dial(_ view: TrainingSnapshot.LoadView) -> some View {
        let state = LoadWords.state(view.level)
        return VStack(spacing: 8) {
            Text(verbatim: L10n.tr(kind == .muscle ? "Posledních 7 dní proti tvému obvyklému týdnu" : "Posledních 7 dní proti tvému průměru 4 týdnů"))
                .font(Typo.body).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            RangeDial(value: view.plot, scale: LoadWords.scale(around: view), band: LoadWords.band(view), size: 190, lineWidth: 12,
                      tint: state?.color ?? Palette.green,
                      spoken: [kind.title, LoadWords.level(view.level), state?.words].compactMap { $0 }.joined(separator: ", ")) {
                Text(verbatim: LoadWords.level(view.level) ?? "–").font(Typo.heading(30)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).minimumScaleFactor(0.7).padding(.horizontal, 24)
            }
            if let state {
                Text(verbatim: state.words).font(Typo.bodyStrong).foregroundStyle(state.color)
            }
            if let load = view.load, let usual = view.usual {
                Text(verbatim: L10n.f(kind == .muscle ? "%@ za posledních 7 dní, %@ je tvůj obvyklý týden" : "%@ za posledních 7 dní, %@ je tvůj průměr 4 týdnů", Fmt.int(load), Fmt.int(usual)))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            } else if let text = view.text {
                Text(verbatim: text).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    static func howMeasured(_ kind: LoadKind, _ view: TrainingSnapshot.LoadView?) -> some View {
        var rows: [(String, String)] = []
        // The 7-day loads of the four weeks ending today, oldest first.
        if let history = view?.history, let last = history.last?.date {
            let byDay = Dictionary(history.map { ($0.date, $0.load) }, uniquingKeysWith: { _, b in b })
            let weeks = [21, 14, 7, 0].compactMap { byDay[ISODay.shift(last, -$0)] }
            if weeks.count == 4 { rows.append(("Poslední čtyři týdny", weeks.map { Fmt.int($0) }.joined(separator: ", "))) }
        }
        rows.append(("Aktualizace", "po každém tréninku"))
        return HowMeasuredCard(text: kind.measured, rows: rows)
    }
}

/// The last 14 or 30 days against the usual band (concept K04/020): a dot per
/// day, the band, the usual week dashed, a finger to read one day in words.
/// No values on the axis: the place against the band is the meaning, the
/// ratio itself is never shown.
struct LoadChart: View {
    let view: TrainingSnapshot.LoadView
    let today: String
    /// Muscle load's band is grey (concept K04/021).
    var grey = false
    @State private var days = 14
    @State private var page = 0
    @State private var picked: Date?

    private struct Day: Identifiable {
        let date: Date
        let iso: String
        let plot: Double
        let level: String?
        var id: String { iso }
    }

    private var all: [Day] {
        view.series.compactMap { p in
            guard let plot = p.plot, let date = ISODay.date(p.date) else { return nil }
            return Day(date: date, iso: p.date, plot: min(max(plot, LoadWords.scale.lowerBound), LoadWords.scale.upperBound), level: p.level)
        }
    }

    private var shown: [Day] {
        let list = all, end = list.count - page * days
        return Array(list[max(0, end - days)..<max(0, end)])
    }

    var body: some View {
        let list = shown
        VStack(alignment: .leading, spacing: 14) {
            header(list)
            if list.isEmpty {
                Text(verbatim: L10n.tr("Za toto období nejsou data.")).font(Typo.small).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, minHeight: 150)
            } else {
                plot(list)
            }
            if all.count > 14 { spanControl }
            Text(verbatim: L10n.tr(grey ? "Každá tečka je jeden den: zátěž svalů 7 dní končících tím dnem proti tvému obvyklému týdnu. Šedé pásmo je tvoje obvyklé rozmezí, čárkovaně tvůj obvyklý týden."
                                    : "Každá tečka je jeden den: zátěž 7 dní končících tím dnem proti tvému průměru 4 týdnů. Zelené pásmo je tvoje obvyklé rozmezí, čárkovaně tvůj obvyklý týden."))
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onChange(of: days) { page = 0; picked = nil }
    }

    private func header(_ list: [Day]) -> some View {
        let older = all.count - (page + 1) * days > 0
        return HStack {
            Button { page += 1; picked = nil } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .disabled(!older)
                .foregroundStyle(older ? Palette.ink : Palette.faint.opacity(0.5))
                .accessibilityLabel(L10n.tr("Předchozí období"))
            Spacer(minLength: 0)
            if let first = list.first?.iso, let last = list.last?.iso {
                Text(verbatim: DetailChart.periodTitle(start: first, end: last, year: false))
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            }
            Spacer(minLength: 0)
            Button { page = max(page - 1, 0); picked = nil } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .disabled(page == 0)
                .foregroundStyle(page > 0 ? Palette.ink : Palette.faint.opacity(0.5))
                .accessibilityLabel(L10n.tr("Další období"))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -12)
    }

    private func plot(_ list: [Day]) -> some View {
        let band = LoadWords.band(view)
        let values = list.map(\.plot) + [band.lowerBound, band.upperBound, 1]
        let lo = (values.min() ?? 0.8) - 0.08, hi = (values.max() ?? 1.3) + 0.08
        let selected = picked.flatMap { date in list.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) } }
        let shownDay = selected ?? list.last
        let bandFill = grey ? Palette.ink.opacity(0.09) : Palette.green.opacity(0.16)
        let first = list.first?.date ?? Date(), last = list.last?.date ?? Date()
        // Room after the last day for the "Usual" pill.
        let domainEnd = last.addingTimeInterval(Double(list.count) * 86400 * 0.16)
        return Chart {
            RectangleMark(xStart: .value("Od", first), xEnd: .value("Do", last),
                          yStart: .value("Obvyklé od", band.lowerBound), yEnd: .value("Obvyklé do", band.upperBound))
                .foregroundStyle(bandFill)
            RuleMark(y: .value("Obvyklý týden", 1))
                .foregroundStyle(Palette.faint)
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 4]))
            ForEach(list) { day in
                LineMark(x: .value("Den", day.date), y: .value("Zátěž", day.plot))
                    .foregroundStyle(Palette.green)
                    .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                PointMark(x: .value("Den", day.date), y: .value("Zátěž", day.plot))
                    .foregroundStyle(dotColor(day))
                    .symbolSize(22)
            }
            if let shownDay {
                if selected != nil {
                    RuleMark(x: .value("Den", shownDay.date)).foregroundStyle(Palette.faint).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 4]))
                }
                PointMark(x: .value("Den", shownDay.date), y: .value("Zátěž", shownDay.plot))
                    .symbol { LatestDot(color: dotColor(shownDay)) }
            }
        }
        .chartXScale(domain: first...max(domainEnd, first))
        .chartYScale(domain: lo...hi)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: DetailChart.ticks(start: list.first?.iso ?? today, end: list.last?.iso ?? today).enumerated().filter { $0.offset != 2 }.map(\.element)) { value in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        let iso = ISODay.iso(date)
                        Text(verbatim: iso == today ? L10n.tr("Dnes") : Fmt.dayMonthShort(iso)).font(.caption2).foregroundStyle(Palette.faint)
                    }
                }
            }
        }
        .chartXSelection(value: $picked)
        .chartOverlay { proxy in
            GeometryReader { geo in
                if let frame = proxy.plotFrame {
                    let rect = geo[frame]
                    if let y = proxy.position(forY: 1.0) {
                        AveragePill(text: L10n.tr("Obvykle"))
                            .frame(width: rect.maxX, alignment: .trailing)
                            .position(x: rect.maxX / 2, y: rect.minY + y)
                    }
                    if let shownDay, let x = proxy.position(forX: shownDay.date) {
                        DayBubble(date: shownDay.iso == today ? L10n.f("Dnes, %@", Fmt.dayMonthShort(shownDay.iso)) : Fmt.weekdayShort(shownDay.iso) + " " + Fmt.dayMonthShort(shownDay.iso),
                                  value: LoadWords.level(shownDay.level) ?? "–")
                            .fixedSize()
                            .position(x: min(max(rect.minX + x, 60), max(geo.size.width - 60, 60)), y: rect.minY - 36)
                    }
                }
            }
        }
        .frame(height: 170)
        .padding(.top, 64)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Posledních %@ dní", String(list.count)))
        .accessibilityValue(view.text ?? "")
    }

    private func dotColor(_ day: Day) -> Color { LoadWords.state(day.level)?.color ?? Palette.green }

    /// 14 days | 30 days, the chart's control in the look of PeriodControl.
    private var spanControl: some View {
        HStack(spacing: 2) {
            ForEach([14, 30], id: \.self) { n in
                let on = n == days
                Button { days = n } label: {
                    Text(verbatim: L10n.plural("%lld dní", n))
                        .scaledFont(13, weight: on ? .semibold : .regular, cap: .denseCap)
                        .foregroundStyle(on ? Palette.ink : Palette.muted)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(on ? Palette.card : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.track, in: Capsule())
    }
}

/// Load by intensity (concept K04/020): the last 7 days' load of each part,
/// a bar with the usual range lighter behind it and the state in words.
struct LoadIntensity: View {
    let parts: [TrainingSnapshot.LoadView.Part]

    var body: some View {
        let top = max(parts.map { max($0.high * 1.25, $0.load * 1.05) }.max() ?? 1, 1)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.element.id) { i, part in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.vertical, 12) }
                row(part, top: top)
            }
        }
    }

    private func row(_ part: TrainingSnapshot.LoadView.Part, top: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Circle().fill(Self.color(part.key)).frame(width: 7, height: 7).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: Self.name(part.key)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(verbatim: Self.hint(part.key)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 8)
                Text(verbatim: Fmt.int(part.load)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                Text(verbatim: L10n.tr("body zátěže")).font(.caption).foregroundStyle(Palette.faint)
                Text(verbatim: Self.state(part)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                    .frame(minWidth: 64, alignment: .trailing)
            }
            GeometryReader { geo in
                let x = { (v: Double) in geo.size.width * CGFloat(min(max(v / top, 0), 1)) }
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Rectangle().fill(Palette.ink.opacity(0.3)).frame(width: max(x(part.high) - x(part.low), 2)).offset(x: x(part.low))
                    Capsule().fill(Palette.ink).frame(width: max(x(part.load), 3))
                    // The range's edges stay visible over the fill (concept K04/020).
                    ForEach([part.low, part.high], id: \.self) { edge in
                        Rectangle().fill(Palette.muted).frame(width: 1.5).offset(x: x(edge) - 0.75)
                    }
                }
            }
            .frame(height: 6)
            .clipShape(Capsule())
            .accessibilityHidden(true)
            Text(verbatim: L10n.f("Obvykle %@ až %@", Fmt.int(part.low), Fmt.int(part.high))).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }

    static func name(_ key: String) -> String {
        switch key {
        case "low": return L10n.tr("Nízká aerobní")
        case "high": return L10n.tr("Vysoká aerobní")
        default: return L10n.tr("Anaerobní")
        }
    }

    static func hint(_ key: String) -> String {
        switch key {
        case "low": return L10n.tr("lehce, dá se mluvit")
        case "high": return L10n.tr("tvrdě, ale stabilně")
        default: return L10n.tr("krátce, naplno")
        }
    }

    /// Heart-rate zone colours: Z2 blue, Z4 amber, Z5 red.
    static func color(_ key: String) -> Color {
        Palette.Zone.color(key == "low" ? 1 : key == "high" ? 3 : 4)
    }

    static func state(_ part: TrainingSnapshot.LoadView.Part) -> String {
        part.load < part.low ? L10n.tr("Pod") : part.load > part.high ? L10n.tr("Nad") : L10n.tr("V rozmezí")
    }
}

/// Days by load status, last 30 days (concept K04/021): how many of the days
/// were below, in or above the usual range.
struct LoadDaysByStatus: View {
    let series: [TrainingSnapshot.LoadView.Point]

    var body: some View {
        let levels = series.compactMap(\.level)
        let groups: [(String, Int, Bool)] = [
            ("Pod", levels.filter { $0 == "below" || $0 == "wellBelow" }.count, false),
            ("V rozmezí", levels.filter { $0 == "usual" }.count, true),
            ("Nad", levels.filter { $0 == "above" || $0 == "wellAbove" }.count, false)
        ]
        let total = max(levels.count, 1)
        VStack(spacing: 14) {
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                let (name, count, usual) = group
                HStack(spacing: 12) {
                    Text(verbatim: L10n.tr(name)).font(Typo.body).foregroundStyle(Palette.ink)
                        .frame(width: 84, alignment: .leading)
                    Text(verbatim: L10n.plural("%lld dní", count)).font(Typo.caption).foregroundStyle(Palette.muted)
                        .frame(width: 62, alignment: .leading)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.track)
                            Capsule().fill(usual ? Palette.green : Palette.muted).frame(width: geo.size.width * CGFloat(count) / CGFloat(total))
                        }
                    }
                    .frame(height: 5)
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text(verbatim: String(Int((Double(count) / Double(total) * 100).rounded()))).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        Text(verbatim: "%").font(.caption2).foregroundStyle(Palette.faint)
                    }
                    .frame(width: 44, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

extension CoachSubject {
    /// Training → Load balance (P1: the server adds its words, src/entrypoint.js metric "load").
    static func load(title: String, date: String?) -> CoachSubject {
        CoachSubject(kind: .metric, title: title, metric: "load", date: date, view: "training",
                     symbol: "gauge.with.dots.needle.50percent", color: Palette.amber,
                     questions: ["Co mi tohle říká?", "Mám tento týden přidat, nebo ubrat?", "Jak rozložit zbytek týdne?"])
    }
}
