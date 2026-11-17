import SwiftUI

/// VO2max on the new detail template (redesign H, Petr's decision 4,
/// 2026-11-16): only Aurin's own estimate, no label over the number, the
/// FRIEND bands of the athlete's sex and age, the estimate marked in the
/// chart's note and in "How it's measured" with "Data from" and "Compared with".
struct VO2maxPage: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var period: ChartPeriod = .months6
    @State private var loaded: [ChartPeriod: HealthSeries] = [:]
    @State private var info = false

    private var vo2: HealthVO2max? { health.vo2max }

    var body: some View {
        DetailTemplate(title: "VO2max") {
            CoachEntry(subject: coach, view: "health",
                       companion: ChromeAction(systemImage: "info", label: "Jak se to měří") { info = true })
        } content: {
            VO2maxDetailContent(health: health, period: $period, loaded: loaded[period])
        }
        .task(id: period) { await load() }
        .sheet(isPresented: $info) {
            ScrollView { VO2maxDetailContent.howMeasured(vo2).padding(24) }
                .presentationDetents([.medium, .large])
                .presentationBackground(Palette.background)
        }
    }

    private var coach: CoachSubject {
        CoachSubject(kind: .metric, title: "VO2max", line: vo2.map { L10n.f("Odhad Aurinu %@", Fmt.decimal($0.value, digits: 1)) },
                     metric: "vo2max", date: health.date, view: "health", symbol: "heart.circle", color: Palette.green,
                     questions: ["Jak zvýšit VO2max?", "Jak se mi vyvíjí VO2max?", "Mám dnes trénovat?"])
    }

    private func load() async {
        guard loaded[period] == nil, !model.demo else { return }
        if let series = try? await model.api.healthSeries(metric: "vo2max", period: period) { loaded[period] = series }
    }

    static func sources(_ list: [String]?) -> String? {
        let names = (list ?? []).map(HealthValueContent.serviceName)
        return names.isEmpty ? nil : ListFormatter.localizedString(byJoining: names)
    }

    /// "Men aged 30 to 39 in lab tests (FRIEND registry)".
    static func group(_ b: FriendBands) -> String {
        L10n.f(b.sex == "female" ? "Ženy ve věku %@ až %@ v laboratorních testech (registr FRIEND)" : "Muži ve věku %@ až %@ v laboratorních testech (registr FRIEND)",
               String(b.ageFrom), String(b.ageTo))
    }

    /// Where the estimate falls among the group, in words, never Good or Poor.
    static func position(_ value: Double, in b: FriendBands) -> String {
        let female = b.sex == "female"
        let key: String
        if value >= b.p90 { key = female ? "v horní desetině žen ve věku %@ až %@" : "v horní desetině mužů ve věku %@ až %@" }
        else if value >= b.p75 { key = female ? "v horní čtvrtině žen ve věku %@ až %@" : "v horní čtvrtině mužů ve věku %@ až %@" }
        else if value >= b.p50 { key = female ? "v horní polovině žen ve věku %@ až %@" : "v horní polovině mužů ve věku %@ až %@" }
        else if value >= b.p25 { key = female ? "ve druhé čtvrtině žen ve věku %@ až %@" : "ve druhé čtvrtině mužů ve věku %@ až %@" }
        else { key = female ? "v dolní čtvrtině žen ve věku %@ až %@" : "v dolní čtvrtině mužů ve věku %@ až %@" }
        return L10n.f(key, String(b.ageFrom), String(b.ageTo))
    }
}

/// The page under the title row, without the scroll view, so tests can render it whole.
struct VO2maxDetailContent: View {
    let health: HealthSnapshot
    @Binding var period: ChartPeriod
    var loaded: HealthSeries? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let vo2 = health.vo2max {
                content(vo2)
            } else {
                Card { LearningState(kind: .missing, text: "Aurin odhadne tvůj VO2max z tréninků s tepem. Stačí pár běhů nebo jízd s hodinkami.") }
                    .padding(.top, 20)
            }
        }
    }

    @ViewBuilder private func content(_ vo2: HealthVO2max) -> some View {
        let compared = vo2.compared
        DetailHeadline(value: Fmt.decimal(vo2.value, digits: 1), unit: "ml/kg/min",
                       usual: compared.map { VO2maxPage.position(vo2.value, in: $0) })
        if let compared {
            Card { FriendBandsView(value: vo2.value, bands: compared) }
        }
        let points = loaded?.points ?? vo2.series.map { ChartPoint(date: $0.date, value: $0.value) }
        Card {
            DetailChart(points: points, today: health.date, period: $period, digits: 1,
                        note: "Každý bod je jeden odhad Aurinu, ne laboratorní test.",
                        source: VO2maxPage.sources(vo2.sources))
        }
        .padding(.top, 12)
        let rows = TrendMath.rows(points, today: points.last?.date ?? health.date, lags: period.weekly ? TrendLags.year : TrendLags.month)
        if !rows.isEmpty {
            SectionLabel(text: "Analýza trendu").padding(.top, 28)
            Card { TrendTable(rows: rows, digits: 1) }.padding(.top, 10)
        }
        if let years = health.aurinAge?.parts["vo2max"], abs(years) >= 0.05 {
            Card {
                HStack(alignment: .firstTextBaseline) {
                    Text("Vliv na Aurin age").font(Typo.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 12)
                    Text(verbatim: AurinAgeText.effect(years)).font(Typo.body).foregroundStyle(Palette.muted)
                }
                .accessibilityElement(children: .combine)
            }
            .padding(.top, 12)
        }
        Self.howMeasured(vo2).padding(.top, 28)
    }

    static func howMeasured(_ vo2: HealthVO2max?) -> some View {
        var rows: [(String, String)] = []
        if let from = VO2maxPage.sources(vo2?.sources) { rows.append(("Data z", from)) }
        if let compared = vo2?.compared { rows.append(("Ve srovnání s", VO2maxPage.group(compared))) }
        return HowMeasuredCard(text: "Aurin odhaduje tvůj VO2max ze všech tréninků, klidového tepu a profilu. Je to odhad, ne laboratorní test.",
                               rows: rows)
    }
}

/// The FRIEND bands of the athlete's group in one row, the estimate marked
/// in its band, the edges under it and the detailed sentence (Petr 19:54).
struct FriendBandsView: View {
    let value: Double
    let bands: FriendBands

    private var edges: [Double] { [bands.p25, bands.p50, bands.p75, bands.p90] }
    private var index: Int { edges.filter { value >= $0 }.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { i in
                    Capsule().fill(i == index ? Palette.green : Palette.track)
                        .frame(height: 8)
                        .overlay {
                            if i == index {
                                Circle().fill(Palette.card).frame(width: 12, height: 12)
                                    .overlay { Circle().stroke(Palette.green, lineWidth: 2) }
                            }
                        }
                }
            }
            .accessibilityHidden(true)
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { i in
                    Text(verbatim: label(i)).font(.caption2).foregroundStyle(i == index ? Palette.ink : Palette.faint)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
            Text(verbatim: sentence).font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func label(_ i: Int) -> String {
        let f = { (x: Double) in Fmt.decimal(x, digits: 1) }
        switch i {
        case 0: return L10n.f("pod %@", f(bands.p25))
        case 4: return L10n.f("nad %@", f(bands.p90))
        default: return f(edges[i - 1]) + "–" + f(edges[i])
        }
    }

    private var sentence: String {
        L10n.f(bands.sex == "female"
               ? "Ve srovnání se ženami ve věku %@ až %@ v laboratorních testech (registr FRIEND, 2015). Polovina z nich má méně než %@, každá desátá víc než %@."
               : "Ve srovnání s muži ve věku %@ až %@ v laboratorních testech (registr FRIEND, 2015). Polovina z nich má méně než %@, každý desátý víc než %@.",
               String(bands.ageFrom), String(bands.ageTo), Fmt.decimal(bands.p50, digits: 1), Fmt.decimal(bands.p90, digits: 1))
    }
}

/// Aurin age in words: effects as "1.6 years younger", never a signed number
/// or "yrs" (plan, Health texts).
enum AurinAgeText {
    /// `years`: + older, − younger.
    static func effect(_ years: Double) -> String {
        let size = Fmt.decimal(abs(years), digits: 1)
        if abs(years) < 0.05 { return L10n.tr("bez vlivu") }
        return L10n.f(years < 0 ? "o %@ roku mladší" : "o %@ roku starší", size)
    }
}
