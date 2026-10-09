import SwiftUI

struct HealthView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack(path: model.path(.health)) {
            ZStack {
                ScreenBackground(glow: Palette.Glow.health)
                if let health = model.health {
                    ScrollView {
                        HealthContent(health: health)
                            .padding(.bottom, 100)
                    }
                    .refreshable { await model.refreshHealth() }
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
            .toolbar(.hidden, for: .navigationBar)
            .appRoutes()
        }
        .task { if model.health == nil { await model.refreshHealth() } }
    }
}

/// A drill-down page: the section's background, a back button and a column.
struct DetailScreen<Content: View>: View {
    var glow: Color = Palette.Glow.health
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: glow)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                    content
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 100)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// The Health screen without the scroll view, so tests can render it whole.
struct HealthContent: View {
    let health: HealthSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DayNavigator(date: health.date)
                .frame(height: 36)

            RouteLink(route: .readiness) { ReadinessCard(readiness: health.readiness) }
                .padding(.top, 24)

            HealthSection(title: "Spánek") {
                RouteLink(route: .sleep) { SleepWidget(sleep: health.sleep) }
                if health.sleep.debt != nil || health.oxygen != nil {
                    WidgetRow {
                        if let debt = health.sleep.debt { RouteLink(route: .sleep) { SleepDebtWidget(debt: debt) } } else { Color.clear }
                    } right: {
                        if let oxygen = health.oxygen { RouteLink(route: .sleep) { OxygenWidget(oxygen: oxygen) } } else { Color.clear }
                    }
                }
                if health.respiration != nil || health.skinTemp != nil {
                    WidgetRow {
                        if let r = health.respiration { RouteLink(route: .sleep) { RespirationWidget(respiration: r) } } else { Color.clear }
                    } right: {
                        if let t = health.skinTemp { RouteLink(route: .sleep) { SkinTempWidget(skin: t) } } else { Color.clear }
                    }
                }
                RouteLink(route: .sleepSettings) { SleepSettingsCard(tonight: health.sleep.tonight) }
            }

            if health.hrv != nil || health.restingHR != nil {
                HealthSection(title: "Srdce") {
                    if let hrv = health.hrv {
                        RouteLink(route: .heart) { HRVWideWidget(hrv: hrv, restingHR: health.restingHR?.value) }
                    }
                    WidgetRow {
                        if let rhr = health.restingHR {
                            RouteLink(route: .heart) { RestingHRWidget(restingHR: TodaySnapshot.RestingHR(value: rhr.value, baseline: rhr.baseline, series: rhr.series)) }
                        } else { Color.clear }
                    } right: {
                        AppleHealthWidget(title: "Nálada", color: Palette.gold)
                    }
                }
            }

            HealthSection(title: "Tělo") {
                if let weight = health.weight {
                    RouteLink(route: .weight) {
                        WeightWidget(weight: TodaySnapshot.Weight(latest: weight.latest, goal: weight.goal, series: Array(weight.series.filter { $0.date > (AppModel.shift(health.date, by: -30) ?? "") })))
                    }
                    if let fat = weight.bodyFat { RouteLink(route: .weight) { BodyFatWidget(fat: fat) } }
                    AppleHealthWidget(title: "Svalová hmota", color: Palette.brown)
                } else {
                    RouteLink(route: .weight) {
                        Card {
                            WidgetHeader(title: "Váha", color: Palette.brown)
                            Text("Zatím žádné vážení. Klepni a zapiš první.").font(Typo.small).foregroundStyle(Palette.muted)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }
}

struct HealthSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: title)
            content
        }
        .padding(.top, 30)
    }
}

// MARK: - Readiness

struct ReadinessCard: View {
    let readiness: HealthSnapshot.Readiness

    var body: some View {
        Card {
            HStack {
                Text("Připravenost").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                Spacer()
            }
            if let score = readiness.score {
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text(String(score)).font(Typo.number(88)).foregroundStyle(Palette.ink)
                    if let pill = ReadinessText.pill(readiness.zone) { Pill(text: pill.0, foreground: pill.1, background: pill.2) }
                }
                Text(ReadinessText.sentence(readiness))
                    .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                PartsRow(parts: readiness.parts)
            } else {
                Text("Zatím bez čísla").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Připravenost potřebuje dnešní noc a aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// "HRV +12 · Tep +6 · Spánek +4 · Zátěž …": what moved readiness from 70.
struct PartsRow: View {
    let parts: [HealthSnapshot.Part]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.element.id) { index, part in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(width: 1, height: 34) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(ReadinessText.label(part.key)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    Text(Fmt.signed(Double(part.points))).font(Typo.number(22))
                        .foregroundStyle(part.points >= 0 ? Palette.green : Palette.rust)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, index > 0 ? 12 : 0)
            }
        }
        .padding(.top, 4)
    }
}

enum ReadinessText {
    static func label(_ key: String) -> String {
        switch key {
        case "hrv": return "HRV"
        case "restingHR": return "Tep"
        case "sleep": return "Spánek"
        case "respiration": return "Dech"
        case "skinTemp": return "Teplota"
        default: return key
        }
    }

    static func pill(_ zone: String?) -> (String, Color, Color)? {
        switch zone {
        case "green": return ("vysoká", Palette.green, Palette.greenSoft)
        case "yellow": return ("střední", Palette.amber, Palette.amberSoft)
        case "red": return ("nízká", Palette.rust, Palette.rust.opacity(0.14))
        default: return nil
        }
    }

    /// One sentence from the biggest parts: "HRV nad průměrem, tep pod ním."
    static func sentence(_ r: HealthSnapshot.Readiness) -> String {
        var bits: [String] = []
        for part in r.parts.sorted(by: { abs($0.points) > abs($1.points) }).prefix(2) {
            switch (part.key, part.points >= 0) {
            case ("hrv", true): bits.append("HRV je nad tvým průměrem")
            case ("hrv", false): bits.append("HRV je pod tvým průměrem")
            case ("restingHR", true): bits.append("klidový tep je nízko")
            case ("restingHR", false): bits.append("klidový tep je zvýšený")
            case ("sleep", true): bits.append("spánku bylo dost")
            case ("sleep", false): bits.append("spánku bylo málo")
            case ("respiration", _): bits.append("dech ve spánku je zrychlený")
            case ("skinTemp", _): bits.append("teplota je zvýšená")
            default: break
            }
        }
        var text = bits.isEmpty ? "Tělo je ve své normě" : Fmt.capitalized(bits.joined(separator: " a "))
        text += "."
        if r.flags.contains("respiration_elevated") || r.flags.contains("skin_temp_elevated") {
            text += " Může to být začínající nemoc, dnes raději lehce."
        } else if let strain = r.strainYesterday, strain >= 14 {
            text += " Včerejší zátěž ještě trochu doznívá."
        }
        return text
    }
}

struct ReadinessDetailContent: View {
    let health: HealthSnapshot

    var body: some View {
        let r = health.readiness
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Připravenost").padding(.top, 24)
            if let score = r.score {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(String(score)).font(Typo.number(116)).foregroundStyle(Palette.ink)
                    if let pill = ReadinessText.pill(r.zone) { Pill(text: pill.0, foreground: pill.1, background: pill.2) }
                }
                .padding(.top, 12)
                Text(ReadinessText.sentence(r)).font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 10)
            }

            SectionLabel(text: "Co ji dnes tvoří").padding(.top, 32)
            VStack(spacing: 0) {
                ForEach(r.parts) { part in
                    HStack {
                        Text(ReadinessText.label(part.key)).font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        Text(value(part.key)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        Text(Fmt.signed(Double(part.points))).font(Typo.number(20))
                            .foregroundStyle(part.points >= 0 ? Palette.green : Palette.rust)
                            .frame(width: 46, alignment: .trailing)
                    }
                    .padding(.vertical, 13)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                }
            }
            .padding(.top, 8)
            Text("Základ je 70, tvoje běžná hodnota. HRV váží polovinou, klidový tep a spánek čtvrtinou. Zrychlený dech nebo zvýšená teplota ubírají po 10 bodech.")
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)

            if r.history.count > 1 {
                HStack {
                    SectionLabel(text: "Posledních 14 dní")
                    Spacer()
                    Text("průměr " + Fmt.int(r.history.map(\.value).reduce(0, +) / Double(r.history.count))).font(Typo.caption).foregroundStyle(Palette.faint)
                }
                .padding(.top, 32)
                BarChart(values: r.history.map(\.value),
                         styles: r.history.map { BarStyle(fill: $0.value >= 67 ? Palette.green.opacity(0.7) : $0.value >= 34 ? Palette.amberBar.opacity(0.8) : Palette.rust.opacity(0.8)) },
                         hi: 100,
                         labels: r.history.map { Fmt.weekdayInitial($0.date) },
                         highlighted: r.history.count - 1,
                         height: 110)
                    .padding(.top, 14)
            }
        }
    }

    private func value(_ key: String) -> String {
        let r = health.readiness
        switch key {
        case "hrv": return r.hrv.map { Fmt.int($0) + " ms" } ?? "–"
        case "restingHR": return r.restingHR.map { Fmt.int($0) + " bpm" } ?? "–"
        case "sleep": return Fmt.hoursMinutes(r.sleepMinutes)
        case "respiration": return health.respiration.map { Fmt.decimal($0.value) + " /min" } ?? "–"
        case "skinTemp": return health.skinTemp.map { Fmt.signed($0.deviation, digits: 1) + " °C" } ?? "–"
        default: return ""
        }
    }
}

// MARK: - Sleep widgets

struct SleepWidget: View {
    let sleep: HealthSnapshot.Sleep

    var body: some View {
        Card {
            WidgetHeader(title: "Spánek", color: Palette.indigo)
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        NumberText(value: Fmt.hoursMinutes(sleep.night?.minutes), unit: "h")
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                    }
                    if let index = sleep.night?.index {
                        Text("index \(index)").font(Typo.caption).foregroundStyle(Palette.indigo)
                    } else {
                        Text(sleep.night == nil ? "dnešní noc chybí" : " ").font(Typo.caption).foregroundStyle(Palette.faint)
                    }
                }
                .frame(width: 120, alignment: .leading)
                if !sleep.week.isEmpty {
                    BarChart(values: sleep.week.map(\.value),
                             styles: sleep.week.indices.map { i in BarStyle(fill: i == sleep.week.count - 1 ? Palette.indigo : Palette.lilac) },
                             hi: max(Double(sleep.need) * 1.15, sleep.week.map(\.value).max() ?? 0),
                             target: Double(sleep.need),
                             labels: sleep.week.map { Fmt.weekdayInitial($0.date) },
                             highlighted: sleep.week.count - 1,
                             height: 56)
                }
            }
        }
    }
}

struct SleepDebtWidget: View {
    let debt: HealthSnapshot.Debt

    var body: some View {
        Card {
            WidgetHeader(title: "Spánkový dluh", color: Palette.amberBar)
            NumberText(value: Fmt.hoursMinutes(Double(debt.minutes)), unit: "h")
            Text("za \(debt.nights) " + Fmt.plural(debt.nights, "noc", "noci", "nocí")).font(Typo.caption).foregroundStyle(Palette.faint)
            ProgressLine(fraction: Double(debt.minutes) / 360, color: debt.minutes > 180 ? Palette.rust : Palette.amberBar)
        }
    }
}

struct OxygenWidget: View {
    let oxygen: HealthSnapshot.Oxygen

    var body: some View {
        Card {
            WidgetHeader(title: "Kyslík v krvi", color: Palette.blue)
            NumberText(value: Fmt.decimal(oxygen.value, digits: oxygen.value.rounded() == oxygen.value ? 0 : 1), unit: "%")
            Text("14 dní " + Fmt.int(oxygen.low) + "–" + Fmt.int(oxygen.high) + " %").font(Typo.caption).foregroundStyle(Palette.faint)
            let values = oxygen.series.map(\.value)
            LineChart(values: values, color: Palette.blue, lo: (values.min() ?? 90) - 1, hi: 100, height: 30)
        }
    }
}

struct RespirationWidget: View {
    let respiration: HealthSnapshot.Respiration

    var body: some View {
        Card {
            WidgetHeader(title: "Dech ve spánku", color: Palette.green)
            NumberText(value: Fmt.decimal(respiration.value), unit: "/min")
            Text(respiration.elevated ? "zrychlený" : "stabilní").font(Typo.caption).foregroundStyle(respiration.elevated ? Palette.rust : Palette.green)
            let values = respiration.series.map(\.value)
            LineChart(values: values, color: Palette.green, lo: (values.min() ?? 12) - 0.5, hi: (values.max() ?? 18) + 0.5,
                      band: respiration.baseline.map { ($0 - 0.5)...($0 + 0.5) }, height: 30)
        }
    }
}

struct SkinTempWidget: View {
    let skin: HealthSnapshot.SkinTemp

    var body: some View {
        Card {
            WidgetHeader(title: "Teplota zápěstí", color: Palette.rust)
            NumberText(value: Fmt.signed(skin.deviation, digits: 1), unit: "°C")
            Text(skin.elevated ? "zvýšená" : "odchylka v normě").font(Typo.caption).foregroundStyle(skin.elevated ? Palette.rust : Palette.green)
            BarChart(values: skin.series.map { $0.value + 1 }, styles: skin.series.map { BarStyle(fill: $0.value > 0 ? Palette.rust.opacity(0.6) : Palette.blue.opacity(0.5)) },
                     lo: 0, hi: 2, target: 1, height: 30)
        }
    }
}

// MARK: - Heart and body widgets

struct HRVWideWidget: View {
    let hrv: HealthSnapshot.HRV
    let restingHR: Double?

    var body: some View {
        Card {
            WidgetHeader(title: "Srdce · HRV", color: Palette.green)
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        NumberText(value: Fmt.int(hrv.value ?? hrv.series.last?.value), unit: "ms")
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                    }
                    Text(status + (restingHR.map { " · tep " + Fmt.int($0) } ?? "")).font(Typo.caption).foregroundStyle(Palette.green)
                }
                .frame(width: 120, alignment: .leading)
                let values = hrv.series.map(\.value)
                LineChart(values: values, color: Palette.green,
                          lo: min(values.min() ?? 40, hrv.low ?? 40) - 4, hi: max(values.max() ?? 70, hrv.high ?? 70) + 4,
                          band: band, height: 56)
            }
            Text("30 dní · pásmo = tvoje norma").font(Typo.tiny).foregroundStyle(Palette.faint)
        }
    }

    private var band: ClosedRange<Double>? {
        guard let low = hrv.low, let high = hrv.high, low < high else { return nil }
        return low...high
    }

    private var status: String {
        guard let v = hrv.value, let low = hrv.low, let high = hrv.high else { return "30 dní" }
        return v > high ? "nad normou" : v < low ? "pod normou" : "v normě"
    }
}

/// A widget for an Apple Health value; empty until the app may read Apple Health.
struct AppleHealthWidget: View {
    let title: String
    let color: Color

    var body: some View {
        Card {
            WidgetHeader(title: title, color: color, appleHealth: true)
            Text("–").font(Typo.number(34)).foregroundStyle(Palette.faint)
            Text("z Apple Health · zatím bez dat").font(Typo.caption).foregroundStyle(Palette.faint)
        }
        .accessibilityElement(children: .combine)
    }
}

struct BodyFatWidget: View {
    let fat: HealthSnapshot.BodyFat

    var body: some View {
        Card {
            WidgetHeader(title: "Tělesný tuk", color: Palette.gold)
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    NumberText(value: Fmt.decimal(fat.value), unit: "%")
                    if let change = fat.change, change != 0 {
                        Text((change < 0 ? "↓ " : "↑ ") + Fmt.decimal(abs(change)) + " za 2 měsíce").font(Typo.caption)
                            .foregroundStyle(change < 0 ? Palette.green : Palette.amber)
                    }
                }
                .frame(width: 120, alignment: .leading)
                let values = fat.series.map(\.value)
                LineChart(values: values, color: Palette.gold, lo: (values.min() ?? 10) - 0.5, hi: (values.max() ?? 25) + 0.5, height: 44)
            }
        }
    }
}
