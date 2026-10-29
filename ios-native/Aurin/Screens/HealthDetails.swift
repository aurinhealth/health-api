import SwiftUI

// MARK: - Sleep

struct SleepDetailView: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var detail: NightDetail?
    @State private var failed = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.health, title: "Spánek",
                     coach: .sleep(line: health.sleep.night?.minutes.map { L10n.f("Dnes %@", Fmt.duration(Int($0))) }, date: health.date)) {
            SleepDetailContent(health: health, detail: detail, failed: failed) { await load() }
        }
        .task {
            guard detail == nil, health.sleep.night != nil else { return }
            if model.demo { detail = DemoData.night; return }
            await load()
        }
    }

    private func load() async {
        do { detail = try await model.api.night(date: health.date); failed = false } catch { failed = true }
    }
}

struct SleepDetailContent: View {
    let health: HealthSnapshot
    let detail: NightDetail?
    /// The night's timeline didn't load: "Zkusit znovu" where the chart goes.
    var failed = false
    var retry: () async -> Void = {}

    var body: some View {
        let sleep = health.sleep
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: L10n.f("Spánek · noc na %@", weekday(health.date))).padding(.top, 24)
            if let night = sleep.night {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(Fmt.hoursMinutes(night.minutes)).font(Typo.number(116)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                    if let index = night.index { Pill(text: L10n.f("index %@", String(index)), foreground: Palette.indigo, background: Palette.lilac) }
                }
                .padding(.top, 12)
            } else {
                Text("Dnešní noc ještě není nahraná.").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
            }

            if let night = sleep.night {
                ThreeCells(cells: [("Usnutí", ClockText.format(optional: night.start) ?? "–"), ("Probuzení", ClockText.format(optional: night.end) ?? "–"), ("V posteli", Fmt.hoursMinutes(night.inBedMinutes))])
                    .padding(.top, 26)
                if let stages = night.stages {
                    SectionLabel(text: "Fáze spánku").padding(.top, 30)
                    Card {
                        if failed && detail == nil {
                            RetryRow(message: "Průběh noci se nepodařilo načíst.", retry: retry)
                        } else if let segments = detail?.night?.segments, !segments.isEmpty {
                            Hypnogram(segments: segments)
                            HStack {
                                Text(ClockText.format(optional: night.start) ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                                Spacer()
                                Text(ClockText.format(optional: night.end) ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                            }
                            .padding(.leading, 56)
                        }
                        StageTotals(stages: stages, wakeups: detail?.night?.stats?.wakeups)
                    }
                    .padding(.top, 14)
                } else if failed && detail == nil {
                    RetryRow(message: "Průběh noci se nepodařilo načíst.", retry: retry).padding(.top, 26)
                }
            }

            if let night = detail?.night, let hr = night.hr, hr.count > 3 {
                SectionLabel(text: "Tělo během noci").padding(.top, 30)
                // Opens Tep ve spánku with the night already loaded here.
                NavigationLink { SleepHeartRateView(health: health, night: night) } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Tep").font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: Fmt.int(night.stats?.avgHr)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                            Text("bpm").font(Typo.small).foregroundStyle(Palette.faint)
                            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                        }
                        .padding(.vertical, 13)
                        let end = SleepHeartRate.end(night)
                        NightHeartChart(hr: hr, low: SleepHeartRate.low(night), end: end, height: 78)
                            .padding(.top, 2)
                        NightStageStrip(segments: night.segments ?? [], end: end).padding(.top, 6)
                        NightClockRow(night: night).padding(.top, 6)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableCardStyle())
                .accessibilityElement(children: .combine)
                .accessibilityLabel(L10n.f("Tep ve spánku, průměr %@ bpm", Fmt.int(night.stats?.avgHr)))
                .accessibilityIdentifier("open.sleepHeartRate")
            }
            VStack(spacing: 0) {
                if let stats = detail?.night?.stats, let hrv = stats.hrv {
                    MetricRow(metric: .hrv, title: "HRV v noci", value: Fmt.int(hrv), unit: "ms" + (stats.hrvLow.map { " · " + Fmt.int($0) + "–" + Fmt.int(stats.hrvHigh) } ?? ""))
                }
                if let r = health.respiration { MetricRow(metric: .respiration, title: "Dechová frekvence", value: Fmt.decimal(r.value), unit: "/ min") }
                if let d = health.wristTemp?.deviation ?? health.skinTemp?.deviation {
                    MetricRow(metric: .temperature, title: "Teplota zápěstí", value: Fmt.signed(Units.temperatureChange(d), digits: 1), unit: L10n.f("%@ od normy", Units.temperatureUnit))
                }
                if let o = health.oxygen { MetricRow(metric: .oxygen, title: "Kyslík v krvi", value: Fmt.decimal(o.value, digits: o.value.rounded() == o.value ? 0 : 1), unit: "%") }
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
                    if sleep.tonight.strain > 0 { NeedRow(title: "Dnešní námaha", minutes: sleep.tonight.strain) }
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

            if let reg = sleep.regularity, !reg.nights.isEmpty {
                let usual = RegularityChart.usual(reg.nights)
                SectionLabel(text: L10n.f("Pravidelnost · %@ nocí", String(reg.nights.count))).padding(.top, 32)
                Text(L10n.f("Usínáš obvykle mezi %@ a %@.", RegularityChart.clock(usual - RegularityChart.band), RegularityChart.clock(usual + RegularityChart.band)))
                    .font(Typo.sentence(18)).foregroundStyle(Palette.secondary).padding(.top, 10)
                Card { RegularityChart(nights: reg.nights) }.padding(.top, 14)
            }
            if let night = sleep.night {
                VStack(spacing: 0) {
                    if let latency = night.latencyMinutes { StatRow(title: "Doba do usnutí", value: Fmt.int(latency), unit: "min") }
                    if let eff = night.efficiency { StatRow(title: "Efektivita spánku", value: String(eff), unit: "%") }
                }
                .padding(.top, 18)
            }
        }
    }

    private func weekday(_ iso: String) -> String {
        if L10n.isEnglish {
            // "Noc na čtvrtek" (ending Thursday morning) is Wednesday night in English.
            let formatter = DateFormatters.iso()
            let before = formatter.date(from: iso).flatMap { Calendar.current.date(byAdding: .day, value: -1, to: $0) }.map { formatter.string(from: $0) } ?? iso
            let english = ["Su": "Sunday", "Mo": "Monday", "Tu": "Tuesday", "We": "Wednesday", "Th": "Thursday", "Fr": "Friday", "Sa": "Saturday"]
            return english[Fmt.weekdayShort(before)] ?? iso
        }
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

struct NeedRow: View {
    let title: String
    let minutes: Int
    var signed = true

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text((signed ? (minutes < 0 ? "−" : "+") : "") + Fmt.hoursMinutes(Double(abs(minutes))))
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
        .accessibilityLabel(L10n.tr(label) + " " + Fmt.hoursMinutes(minutes) + ", " + Self.note(share: share, wakeups: wakeups))
    }

    /// "19 %", or the awakenings for the awake row ("3×").
    static func note(share: Double?, wakeups: Int?) -> String {
        if let share { return Fmt.int(share * 100) + Fmt.percentSign }
        return wakeups.map { "\($0)×" } ?? ""
    }
}

// MARK: - Weight

struct WeightDetailView: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var adding = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.health, title: "Váha") {
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
                    Text(Fmt.decimal(Units.weight(w.latest))).font(Typo.number(104)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                    Text(Units.weightUnit).font(Typo.small).foregroundStyle(Palette.faint)
                }
                .padding(.top, 24)
                Card {
                    let raw = w.series.map { Units.weight($0.value) }
                    let goal = w.goal.map { Units.weight($0) }
                    let all = raw + [goal].compactMap { $0 }
                    let lo = (all.min() ?? 70) - 0.5, hi = (all.max() ?? 90) + 0.5
                    let goalTick = goal.map { [ScaleTick(value: $0, text: L10n.f("%@ cíl", Fmt.int($0)), color: Palette.green, line: false)] } ?? []
                    VStack(spacing: 6) {
                        TrendDotsChart(raw: raw, trend: smoothed(raw), goal: goal, lo: lo, hi: hi, height: 160,
                                       scale: scaleTicks(lo, hi, extra: goalTick))
                        ChartDates(marks: monthMarks(w.series.map(\.date)), trailing: scaleWidth)
                    }
                }
                .padding(.top, 20)
                ThreeCells(cells: [("Průměr 7 dní", Fmt.decimal(w.average.map { Units.weight($0) })), ("Za 30 dní", w.change.map { Fmt.signed(Units.weight($0), digits: 1) } ?? "–"),
                                   ("Do cíle", w.goal.map { Units.weightText(abs((w.average ?? w.latest) - $0)) } ?? "–")])
                    .padding(.top, 20)
                if w.bodyFat != nil || w.muscle != nil {
                    SectionLabel(text: "Složení těla").padding(.top, 32)
                    VStack(spacing: 0) {
                        if let fat = w.bodyFat {
                            MetricRow(metric: .bodyFat, title: "Tělesný tuk", value: Fmt.decimal(fat.value), unit: "%" + (fat.change.map { " · " + ($0 < 0 ? "↓ " : "↑ ") + Fmt.decimal(abs($0)) } ?? ""))
                        }
                        if let muscle = w.muscle {
                            MetricRow(metric: .muscle, title: "Svalová hmota", value: Fmt.decimal(Units.weight(muscle.value)), unit: Units.weightUnit)
                        }
                    }
                    .padding(.top, 8)
                }
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
                TextField(placeholder, text: $text).keyboardType(.decimalPad).font(Typo.number(56)).focused($focused)
                Text(Units.weightUnit).font(Typo.body).foregroundStyle(Palette.faint)
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

    private var placeholder: String {
        Fmt.decimal(Units.imperial ? 181.7 : 82.4)
    }

    /// The typed weight in kg (typed in lb with imperial units).
    private var value: Double? {
        guard let shown = Double(text.replacingOccurrences(of: ",", with: ".")) else { return nil }
        let v = Units.kg(shown)
        guard LogWeightIntent.range.contains(v) else { return nil }
        return v
    }

    private func save() async {
        guard let value else { return }
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        do {
            // Without signal the weigh-in waits on the phone (AppModel outbox).
            try await model.addWeight(kg: value)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Pravidelnost (Petr's design of 2026-10-17): one row per night with a dot
/// at the time of falling asleep on an hourly axis; the band is the usual
/// time ± 30 min. A dot in the band is indigo, outside it amber, earlier or
/// later alike. Sliding a finger over the chart shows the exact time there.
struct RegularityChart: View {
    /// Bedtime as minutes after 18:00 (src/app-health.js regularity).
    let nights: [Point]
    @State private var scrub: Double?

    static let band: Double = 30
    private static let rowHeight: CGFloat = 30
    private static let dayWidth: CGFloat = 30
    private static let timeWidth: CGFloat = 70
    /// Room above the rows for the time under the finger.
    private static let bubble: CGFloat = 30

    static func usual(_ nights: [Point]) -> Double {
        nights.map(\.value).reduce(0, +) / Double(max(nights.count, 1))
    }
    /// Minutes after 18:00 → the phone's clock.
    static func clock(_ minutes: Double) -> String { ClockText.format(minutes: Int(minutes.rounded()) + 18 * 60) }

    /// Where a time sits across the plot.
    private struct Scale {
        let lo: Double
        let hi: Double
        let x0: CGFloat
        let width: CGFloat
        func x(_ minutes: Double) -> CGFloat { x0 + CGFloat((minutes - lo) / (hi - lo)) * width }
        func minutes(_ x: CGFloat) -> Double { lo + Double((x - x0) / width) * (hi - lo) }
    }

    private var usual: Double { Self.usual(nights) }
    private var plotHeight: CGFloat { Self.rowHeight * CGFloat(nights.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GeometryReader { geo in
                plot(scale(geo.size.width), width: geo.size.width)
            }
            .frame(height: Self.bubble + plotHeight + 26)
            VStack(alignment: .leading, spacing: 7) {
                legend(Palette.indigo, "V obvyklém čase")
                legend(Palette.amber, "Dřív nebo později než obvykle")
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Usínáš obvykle mezi %@ a %@.", Self.clock(usual - Self.band), Self.clock(usual + Self.band)))
    }

    private func scale(_ width: CGFloat) -> Scale {
        let values = nights.map(\.value) + [usual - Self.band, usual + Self.band]
        let lo = ((values.min() ?? 0) / 60).rounded(.down) * 60
        let hi = max(lo + 120, ((values.max() ?? 0) / 60).rounded(.up) * 60)
        return Scale(lo: lo, hi: hi, x0: Self.dayWidth + 8, width: max(1, width - Self.dayWidth - Self.timeWidth - 16))
    }

    private func plot(_ scale: Scale, width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(stride(from: scale.lo, through: scale.hi, by: 60)), id: \.self) { hour in
                hourLine(hour, scale)
            }
            ForEach(Array(nights.enumerated()), id: \.offset) { index, night in
                nightRow(night, y: Self.bubble + Self.rowHeight * (CGFloat(index) + 0.5), scale: scale, width: width)
            }
            if let scrub { scrubMark(scrub, scale) }
        }
        .frame(width: width, height: Self.bubble + plotHeight + 26, alignment: .topLeading)
        .contentShape(Rectangle())
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { drag in
                let m = min(max(scale.minutes(drag.location.x), scale.lo), scale.hi)
                scrub = (m / 5).rounded() * 5
            }
            .onEnded { _ in scrub = nil })
    }

    private func hourLine(_ hour: Double, _ scale: Scale) -> some View {
        let x = scale.x(hour)
        return ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: x, y: Self.bubble))
                p.addLine(to: CGPoint(x: x, y: Self.bubble + plotHeight))
            }
            .stroke(Palette.hairline, style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
            Text(ClockText.format(minutes: Int(hour) + 18 * 60)).font(.caption2).foregroundStyle(Palette.faint)
                .fixedSize()
                .position(x: x, y: Self.bubble + plotHeight + 12)
        }
    }

    private func nightRow(_ night: Point, y: CGFloat, scale: Scale, width: CGFloat) -> some View {
        let inside = abs(night.value - usual) <= Self.band
        let left = scale.x(usual - Self.band), right = scale.x(usual + Self.band)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(Palette.lilac.opacity(0.6))
                .frame(width: right - left, height: Self.rowHeight - 6)
                .position(x: (left + right) / 2, y: y)
            Path { p in
                p.move(to: CGPoint(x: scale.x0, y: y))
                p.addLine(to: CGPoint(x: scale.x0 + scale.width, y: y))
            }
            .stroke(Palette.hairline, lineWidth: 1)
            Text(Fmt.weekdayShort(night.date)).font(Typo.caption).foregroundStyle(Palette.muted)
                .frame(width: Self.dayWidth, alignment: .leading)
                .position(x: Self.dayWidth / 2, y: y)
            Circle().fill(inside ? Palette.indigo : Palette.amber).frame(width: 12, height: 12)
                .position(x: scale.x(night.value), y: y)
            Text(Self.clock(night.value)).font(Typo.small).foregroundStyle(inside ? Palette.secondary : Palette.amber)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(width: Self.timeWidth, alignment: .trailing)
                .position(x: width - Self.timeWidth / 2, y: y)
        }
    }

    private func scrubMark(_ minutes: Double, _ scale: Scale) -> some View {
        let x = scale.x(minutes)
        return ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: x, y: Self.bubble - 2))
                p.addLine(to: CGPoint(x: x, y: Self.bubble + plotHeight))
            }
            .stroke(Palette.ink.opacity(0.85), lineWidth: 1.5)
            Text(Self.clock(minutes)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.card)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Palette.ink, in: Capsule())
                .fixedSize()
                .position(x: min(max(x, scale.x0 + 34), scale.x0 + scale.width - 34), y: Self.bubble / 2 - 2)
        }
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(L10n.tr(text)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}
