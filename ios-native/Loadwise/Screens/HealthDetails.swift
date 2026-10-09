import SwiftUI

// MARK: - Sleep

struct SleepDetailView: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var detail: NightDetail?

    var body: some View {
        DetailScreen(glow: Palette.Glow.health) {
            SleepDetailContent(health: health, detail: detail)
        }
        .task {
            guard !model.demo, detail == nil, health.sleep.night != nil else { return }
            detail = try? await model.api.night(date: health.date)
        }
    }
}

struct SleepDetailContent: View {
    let health: HealthSnapshot
    let detail: NightDetail?

    var body: some View {
        let sleep = health.sleep
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Spánek · noc na " + weekday(health.date)).padding(.top, 24)
            if let night = sleep.night {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(Fmt.hoursMinutes(night.minutes)).font(Typo.number(116)).foregroundStyle(Palette.ink)
                    if let index = night.index { Pill(text: "index \(index)", foreground: Palette.indigo, background: Palette.lilac) }
                }
                .padding(.top, 12)
            } else {
                Text("Dnešní noc ještě není nahraná.").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
            }
            Text(sentence).font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 12)

            if let night = sleep.night {
                ThreeCells(cells: [("Usnutí", night.start ?? "–"), ("Probuzení", night.end ?? "–"), ("V posteli", Fmt.hoursMinutes(night.inBedMinutes))])
                    .padding(.top, 26)
                if let stages = night.stages {
                    SectionLabel(text: "Fáze spánku").padding(.top, 30)
                    Card {
                        if let segments = detail?.night?.segments, !segments.isEmpty {
                            Hypnogram(segments: segments)
                            HStack {
                                Text(night.start ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                                Spacer()
                                Text(night.end ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                            }
                            .padding(.leading, 56)
                        }
                        StageTotals(stages: stages, wakeups: detail?.night?.stats?.wakeups)
                    }
                    .padding(.top, 14)
                }
            }

            if let hr = detail?.night?.hr, hr.count > 3 {
                SectionLabel(text: "Tělo během noci").padding(.top, 30)
                HStack(alignment: .firstTextBaseline) {
                    Text("Tep").font(.body)
                    Spacer()
                    if let stats = detail?.night?.stats {
                        Text("průměr " + Fmt.int(stats.avgHr) + " · nejníž " + Fmt.int(stats.lowHr)).font(Typo.small).foregroundStyle(Palette.muted)
                    }
                }
                .padding(.top, 14)
                let values = hr.compactMap(\.avg)
                LineChart(values: values, color: Palette.rust, lo: (values.min() ?? 40) - 2, hi: (values.max() ?? 70) + 2, height: 70)
                    .padding(.top, 6)
            }
            VStack(spacing: 0) {
                if let stats = detail?.night?.stats, let hrv = stats.hrv {
                    StatRow(title: "HRV v noci", value: Fmt.int(hrv), unit: "ms" + (stats.hrvLow.map { " · " + Fmt.int($0) + "–" + Fmt.int(stats.hrvHigh) } ?? ""))
                }
                if let r = health.respiration { StatRow(title: "Dechová frekvence", value: Fmt.decimal(r.value), unit: "/ min") }
                if let t = health.skinTemp { StatRow(title: "Teplota zápěstí", value: Fmt.signed(t.deviation, digits: 1), unit: "°C od normy") }
                if let o = health.oxygen { StatRow(title: "Kyslík v krvi", value: Fmt.decimal(o.value, digits: o.value.rounded() == o.value ? 0 : 1), unit: "%") } else { AppleHealthRow(title: "Kyslík v krvi") }
                AppleHealthRow(title: "Poruchy dýchání")
            }
            .padding(.top, 14)

            SectionLabel(text: "Potřeba a dluh").padding(.top, 32)
            Card {
                HStack(alignment: .firstTextBaseline) {
                    Text("Potřeba na dnešní noc").font(.body)
                    Spacer()
                    Text(Fmt.hoursMinutes(Double(sleep.tonight.need))).font(Typo.number(28))
                }
                VStack(spacing: 6) {
                    NeedRow(title: "Základ podle věku", minutes: sleep.tonight.base, signed: false)
                    if sleep.tonight.strain > 0 { NeedRow(title: "Dnešní zátěž", minutes: sleep.tonight.strain) }
                    if sleep.tonight.hrv > 0 { NeedRow(title: "Nízké HRV", minutes: sleep.tonight.hrv) }
                    if sleep.tonight.debt > 0 { NeedRow(title: "Doplnění dluhu", minutes: sleep.tonight.debt) }
                    if sleep.tonight.naps > 0 { NeedRow(title: "Zdřímnutí", minutes: -sleep.tonight.naps) }
                }
                if let debt = sleep.debt {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    HStack(alignment: .firstTextBaseline) {
                        Text("Spánkový dluh za 7 dní").font(.body)
                        Spacer()
                        Text(Fmt.hoursMinutes(Double(debt.minutes))).font(Typo.number(28)).foregroundStyle(Palette.amber)
                    }
                    ProgressLine(fraction: Double(debt.minutes) / 360, color: Palette.amberBar)
                }
            }
            .padding(.top, 14)

            if let reg = sleep.regularity {
                SectionLabel(text: "Pravidelnost · \(reg.nights.count) nocí").padding(.top, 32)
                Text("Usínáš obvykle ve \(reg.bedtime), odchylka ± \(reg.spread) min.")
                    .font(Typo.sentence(18)).foregroundStyle(Palette.secondary).padding(.top, 10)
                // Later bedtime = lower bar, so a late night stands out.
                let late: Double = reg.nights.map(\.value).max() ?? 0
                let usual: Double = reg.nights.map(\.value).reduce(0, +) / Double(max(reg.nights.count, 1))
                BarChart(values: reg.nights.map { late + 60 - $0.value },
                         styles: reg.nights.map { BarStyle(fill: abs($0.value - usual) > 45 ? Palette.amberBar.opacity(0.6) : Palette.lilac) },
                         labels: reg.nights.map { Fmt.weekdayInitial($0.date) },
                         highlighted: reg.nights.count - 1,
                         height: 80)
                    .padding(.top, 14)
                Text("vyšší sloupec = dřívější usnutí").font(Typo.tiny).foregroundStyle(Palette.faint).padding(.top, 6)
            }
            if let night = sleep.night {
                VStack(spacing: 0) {
                    if let latency = night.latencyMinutes { StatRow(title: "Doba do usnutí", value: Fmt.int(latency), unit: "min") }
                    if let eff = night.efficiency { StatRow(title: "Efektivita spánku", value: String(eff), unit: "%") }
                    AppleHealthRow(title: "Večerní hluk v ložnici")
                }
                .padding(.top, 18)
            }
        }
    }

    private var sentence: String {
        let t = health.sleep.tonight
        var s = ""
        if let night = health.sleep.night, let minutes = night.minutes {
            s = minutes >= Double(health.sleep.need) ? "Noc pokryla tvoji potřebu. " : "O \(Fmt.duration(health.sleep.need - Int(minutes))) méně, než potřebuješ. "
        }
        s += "Dnes potřebuješ \(Fmt.duration(t.need))"
        if let bed = t.bedtime { s += ", jdi spát do \(bed)" }
        return s + "."
    }

    private func weekday(_ iso: String) -> String {
        let names = ["Ne": "neděli", "Po": "pondělí", "Út": "úterý", "St": "středu", "Čt": "čtvrtek", "Pá": "pátek", "So": "sobotu"]
        return names[Fmt.weekdayShort(iso)] ?? iso
    }
}

struct ThreeCells: View {
    let cells: [(String, String)]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(cells.indices, id: \.self) { i in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(width: 1) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(cells[i].0).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(cells[i].1).font(Typo.number(26)).foregroundStyle(Palette.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, i > 0 ? 14 : 0)
                .padding(.vertical, 14)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }
}

struct StatRow: View {
    let title: String
    let value: String
    var unit: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
            if let unit { Text(unit).font(Typo.small).foregroundStyle(Palette.faint) }
        }
        .padding(.vertical, 13)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}

/// A value that will come from Apple Health once the app may read it (it
/// needs the paid developer signing); until then the row stays empty.
struct AppleHealthRow: View {
    let title: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            HealthKitTag()
            Spacer()
            Text("–").font(Typo.number(22)).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 13)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityValue("zatím bez dat z Apple Health")
    }
}

struct NeedRow: View {
    let title: String
    let minutes: Int
    var signed = true

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text((signed ? (minutes < 0 ? "− " : "+ ") : "") + Fmt.hoursMinutes(Double(abs(minutes))))
        }
        .font(Typo.small).foregroundStyle(Palette.muted)
    }
}

enum StageStyle {
    static let order = ["AWAKE", "REM", "LIGHT", "DEEP"]
    static let labels = ["AWAKE": "Bdění", "REM": "REM", "LIGHT": "Lehký", "DEEP": "Hluboký"]
    static func color(_ type: String) -> Color {
        switch type {
        case "DEEP": return Color(light: 0x3B3A99, dark: 0x7C79E0)
        case "LIGHT": return Color(light: 0xA9B8EC, dark: 0x5A6AA8)
        case "REM": return Color(light: 0x7C74E8, dark: 0xA5A1FF)
        default: return Color(light: 0xE0A46A, dark: 0xE0A46A)
        }
    }
}

/// Stages through the night, one row per stage.
struct Hypnogram: View {
    let segments: [NightDetail.Segment]

    var body: some View {
        let end = max(segments.map(\.e).max() ?? 1, 1)
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(StageStyle.order, id: \.self) { type in
                    Text(StageStyle.labels[type] ?? type).font(Typo.tiny).foregroundStyle(Palette.muted).frame(height: 22, alignment: .leading)
                }
            }
            .frame(width: 48, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    ForEach(segments.indices, id: \.self) { i in
                        let s = segments[i], row = CGFloat(StageStyle.order.firstIndex(of: s.type) ?? 2)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(StageStyle.color(s.type))
                            .frame(width: max(1.5, geo.size.width * (s.e - s.s) / end), height: 16)
                            .offset(x: geo.size.width * s.s / end, y: row * 22 + 3)
                    }
                }
            }
            .frame(height: 88)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fáze spánku během noci")
    }
}

/// The night's stages one under the other: a bar of each one's share of the
/// sleep, the time and the percentage, and the awakenings.
struct StageTotals: View {
    let stages: HealthSnapshot.Stages
    let wakeups: Int?

    var body: some View {
        let asleep = max(stages.deep + stages.light + stages.rem, 1)
        let longest = max(stages.deep, stages.light, stages.rem, stages.awake, 1)
        VStack(spacing: 12) {
            row("DEEP", "Hluboký", stages.deep, share: stages.deep / asleep, longest: longest)
            row("REM", "REM", stages.rem, share: stages.rem / asleep, longest: longest)
            row("LIGHT", "Lehký", stages.light, share: stages.light / asleep, longest: longest)
            row("AWAKE", "Bdění", stages.awake, share: nil, longest: longest)
        }
        .padding(.top, 6)
    }

    private func row(_ type: String, _ label: String, _ minutes: Double, share: Double?, longest: Double) -> some View {
        HStack(spacing: 10) {
            Text(label).font(Typo.small).foregroundStyle(Palette.secondary).frame(width: 64, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(StageStyle.color(type)).frame(width: max(6, Double(geo.size.width) * minutes / longest))
                }
            }
            .frame(height: 10)
            Text(Fmt.hoursMinutes(minutes)).font(Typo.number(18)).foregroundStyle(Palette.ink).frame(width: 46, alignment: .trailing)
            Text(Self.note(share: share, wakeups: wakeups)).font(Typo.caption).foregroundStyle(Palette.muted)
                .frame(width: 40, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label + " " + Fmt.hoursMinutes(minutes) + ", " + Self.note(share: share, wakeups: wakeups))
    }

    /// "19 %", or the awakenings for the awake row ("3×").
    static func note(share: Double?, wakeups: Int?) -> String {
        if let share { return Fmt.int(share * 100) + " %" }
        return wakeups.map { "\($0)×" } ?? ""
    }
}

// MARK: - Heart

struct HeartDetailContent: View {
    let health: HealthSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "HRV a klidový tep").padding(.top, 24)
            if let hrv = health.hrv {
                Text("Variabilita srdečního tepu v noci").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 24)
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    Text(Fmt.int(hrv.value ?? hrv.series.last?.value)).font(Typo.number(104)).foregroundStyle(Palette.ink)
                    Text("ms").font(Typo.small).foregroundStyle(Palette.faint)
                    if let s = status(hrv) { Pill(text: s.0, foreground: s.1, background: s.2) }
                }
                Text(sentence(hrv)).font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                Card {
                    WidgetHeader(title: "HRV po nocích", color: Palette.green, trailing: "\(hrv.series.count) dní")
                    TrendChart(points: hrv.series, color: Palette.green, unit: "ms",
                               band: Self.range(hrv.low, hrv.high), bandLabel: Self.normLabel(hrv.low, hrv.high))
                }
                .padding(.top, 20)
                ThreeCells(cells: [("7 dní", Fmt.int(hrv.week)), ("Norma (60 dní)", Fmt.int(hrv.baseline)), ("Trend", trend(hrv.trend))])
                    .padding(.top, 20)
            }
            if let rhr = health.restingHR {
                SectionLabel(text: "Klidový tep").padding(.top, 32)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(Fmt.int(rhr.value)).font(Typo.number(56)).foregroundStyle(Palette.ink)
                    Text("bpm" + (rhr.baseline.map { " · norma " + Fmt.decimal($0) } ?? "")).font(Typo.small).foregroundStyle(Palette.faint)
                }
                .padding(.top, 8)
                Card {
                    WidgetHeader(title: "Klidový tep po dnech", color: Palette.rust, trailing: "\(rhr.series.count) dní")
                    TrendChart(points: rhr.series, color: Palette.rust, unit: "bpm",
                               band: rhr.baseline.map { ($0 - 2)...($0 + 2) },
                               bandLabel: "norma ± 2 bpm", height: 160)
                }
                .padding(.top, 12)
                Text(Self.restingSentence(rhr)).font(Typo.small).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 10)
            }
            SectionLabel(text: "Srdce a návyky").padding(.top, 32)
            VStack(spacing: 0) {
                AppleHealthRow(title: "Zotavení tepu po tréninku")
                AppleHealthRow(title: "Tep při chůzi")
                AppleHealthRow(title: "Dechová cvičení")
                AppleHealthRow(title: "Nálada")
            }
            .padding(.top, 8)
        }
    }

    /// "norma 56–66 ms".
    static func normLabel(_ low: Double?, _ high: Double?) -> String {
        guard let low, let high else { return "tvoje norma" }
        return "norma " + Fmt.int(low) + "–" + Fmt.int(high) + " ms"
    }

    static func range(_ low: Double?, _ high: Double?) -> ClosedRange<Double>? {
        guard let low, let high, high > low else { return nil }
        return low...high
    }

    /// What the resting heart rate says against its normal.
    static func restingSentence(_ rhr: HealthSnapshot.RestingHR) -> String {
        guard let value = rhr.value, let base = rhr.baseline else { return "Klidový tep se měří v noci, nejnižší hodnota dne." }
        let d = value - base
        if d >= 4 { return "O \(Fmt.int(d)) tepů nad normou. Bývá to únavou, nemocí, alkoholem nebo pozdním jídlem." }
        if d <= -3 { return "Pod normou, dobré znamení zotavení a rostoucí kondice." }
        return "V normě. Klidový tep je nejnižší tep za noc, sleduj hlavně jeho dlouhý trend."
    }

    private func status(_ hrv: HealthSnapshot.HRV) -> (String, Color, Color)? {
        guard let v = hrv.value, let low = hrv.low, let high = hrv.high else { return nil }
        if v > high { return ("nad normou", Palette.green, Palette.greenSoft) }
        if v < low { return ("pod normou", Palette.rust, Palette.rust.opacity(0.14)) }
        return ("v normě", Palette.green, Palette.greenSoft)
    }

    private func trend(_ t: String?) -> String {
        switch t {
        case "up": return "↑ stoupá"
        case "down": return "↓ klesá"
        case "stable": return "stabilní"
        default: return "–"
        }
    }

    private func sentence(_ hrv: HealthSnapshot.HRV) -> String {
        switch hrv.trend {
        case "down": return "Týdenní průměr klesl pod tvoji normu. Tělo nestíhá vstřebat zátěž, zařaď lehčí dny."
        case "up": return "Týdenní průměr stoupá. Nervová soustava je v klidu a tělo zvládá zátěž."
        default: return "HRV se drží ve tvé normě, zátěž a odpočinek jsou v rovnováze."
        }
    }
}

// MARK: - Weight

struct WeightDetailView: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var adding = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.health) {
            WeightDetailContent(health: health, add: { adding = true })
        }
        .sheet(isPresented: $adding) { WeightEntrySheet() }
    }
}

struct WeightDetailContent: View {
    let health: HealthSnapshot
    var add: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Váha a složení těla").padding(.top, 24)
            if let w = health.weight {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(Fmt.decimal(w.latest)).font(Typo.number(104)).foregroundStyle(Palette.ink)
                    Text("kg").font(Typo.small).foregroundStyle(Palette.faint)
                }
                .padding(.top, 24)
                if let s = sentence(w) {
                    Text(s).font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                }
                Card {
                    let raw = w.series.map(\.value)
                    let all = raw + [w.goal].compactMap { $0 }
                    TrendDotsChart(raw: raw, trend: smoothed(raw), goal: w.goal, lo: (all.min() ?? 70) - 0.5, hi: (all.max() ?? 90) + 0.5, height: 160)
                    Text("90 dní · body = vážení, čára = trend").font(Typo.tiny).foregroundStyle(Palette.faint)
                }
                .padding(.top, 20)
                ThreeCells(cells: [("Průměr 7 dní", Fmt.decimal(w.average)), ("Za 30 dní", w.change.map { Fmt.signed($0, digits: 1) } ?? "–"),
                                   ("Do cíle", w.goal.map { Fmt.decimal(max(0, (w.average ?? w.latest) - $0)) + " kg" } ?? "–")])
                    .padding(.top, 20)
                SectionLabel(text: "Složení těla").padding(.top, 32)
                VStack(spacing: 0) {
                    if let fat = w.bodyFat {
                        StatRow(title: "Tělesný tuk", value: Fmt.decimal(fat.value), unit: "%" + (fat.change.map { " · " + ($0 < 0 ? "↓ " : "↑ ") + Fmt.decimal(abs($0)) } ?? ""))
                    } else {
                        AppleHealthRow(title: "Tělesný tuk")
                    }
                    AppleHealthRow(title: "Svalová hmota")
                    AppleHealthRow(title: "Obvod pasu")
                }
                .padding(.top, 8)
            } else {
                Text("Zatím žádné vážení.").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 24)
            }
            Button(action: add) {
                Label("Zapsat váhu", systemImage: "plus")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.button, in: Capsule())
            }
            .padding(.top, 28)
        }
    }

    private func smoothed(_ values: [Double]) -> [Double] {
        var out: [Double] = []
        for v in values { out.append(out.last.map { $0 + 0.25 * (v - $0) } ?? v) }
        return out
    }

    private func sentence(_ w: HealthSnapshot.Weight) -> String? {
        guard let change = w.change else { return nil }
        var s = change < 0 ? "Za měsíc o \(Fmt.decimal(abs(change))) kg méně." : change > 0 ? "Za měsíc o \(Fmt.decimal(change)) kg více." : "Za měsíc beze změny."
        if let goal = w.goal, let avg = w.average, change < 0, avg > goal {
            let weeks = Int(((avg - goal) / (abs(change) / 30 * 7)).rounded(.up))
            s += " Tímhle tempem jsi na cíli \(Fmt.decimal(goal, digits: 0)) kg zhruba za \(weeks) " + Fmt.plural(weeks, "týden", "týdny", "týdnů") + "."
        }
        return s
    }
}

struct WeightEntrySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Zapsat váhu").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            HStack(alignment: .firstTextBaseline) {
                TextField("82,4", text: $text).keyboardType(.decimalPad).font(Typo.number(56)).focused($focused)
                Text("kg").font(Typo.body).foregroundStyle(Palette.faint)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            Button {
                Task { await save() }
            } label: {
                Text(saving ? "Ukládám…" : "Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .disabled(saving || value == nil)
            Spacer()
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
        .onAppear { focused = true }
    }

    private var value: Double? {
        guard let v = Double(text.replacingOccurrences(of: ",", with: ".")), v >= 30, v <= 300 else { return nil }
        return v
    }

    private func save() async {
        guard let value else { return }
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        do {
            try await model.api.addWeight(kg: value)
            await model.refreshHealth()
            await model.refresh()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
