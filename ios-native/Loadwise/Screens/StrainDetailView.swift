import Charts
import SwiftUI

/// Zátěž from Today: the day's strain on a dial with the plan, what it is
/// made of, and fitness and fatigue with the forecast to the end of the week.
struct StrainDetailView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            if let today = model.today {
                StrainDetailContent(today: today, training: model.training)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task {
            if model.today == nil { await model.refresh() }
            if model.training == nil { await model.refreshTraining() }
        }
    }
}

struct StrainDetailContent: View {
    let today: TodaySnapshot
    let training: TrainingSnapshot?

    /// The same 0–21 scale as the planned strain on the server (app-today.js).
    static func strain(tss: Double) -> Double { tss > 0 ? 21 * (1 - exp(-tss / 90)) : 0 }

    static func level(_ score: Double) -> (String, Color) {
        switch score {
        case ..<7: return ("lehká", Palette.green)
        case ..<14: return ("střední", Palette.amber)
        case ..<18: return ("vysoká", Palette.rust)
        default: return ("maximální", Palette.rust)
        }
    }

    private var sessions: [WeekSession] {
        today.plan.compactMap { $0.kind == "workout" ? $0.session : nil }
    }

    /// The day's strain split into training, the rest of the day's movement
    /// and what the sessions still planned would add.
    private var parts: (training: Double, movement: Double, planned: Double) {
        let score = today.strain.score ?? 0
        let doneTss = sessions.filter { $0.status == "done" }.compactMap(\.tss).reduce(0, +)
        let openTss = sessions.filter { $0.status == "planned" }.compactMap(\.tss).reduce(0, +)
        let trainingPart = Swift.min(score, Self.strain(tss: doneTss))
        let planned = Self.strain(tss: doneTss + openTss) - Self.strain(tss: doneTss)
        return (trainingPart, Swift.max(0, score - trainingPart), Swift.max(0, planned))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Zátěž").font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink).padding(.top, 24)
            dial
            if let target = today.strain.target {
                SectionLabel(text: "Dnešní cíl").padding(.top, 30)
                targetRows(target).padding(.top, 12)
            }
            SectionLabel(text: "Z čeho je").padding(.top, 30)
            sources.padding(.top, 12)
            if let form = training?.form, !form.series.isEmpty {
                SectionLabel(text: "Kondice a únava").padding(.top, 30)
                FitnessChart(form: form, upcoming: upcomingTss)
                    .padding(.top, 12)
            }
        }
    }

    private var dial: some View {
        let score: Double = today.strain.score ?? 0
        let split = parts
        let level: (String, Color) = Self.level(score)
        return VStack(spacing: 0) {
            StrainDial(score: score, planned: today.strain.planned, target: today.strain.target)
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
            Pill(text: L10n.tr(level.0), foreground: level.1, background: level.1.opacity(0.14))
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
            Card { StrainSplitBar(training: split.training, movement: split.movement, planned: split.planned) }
                .padding(.top, 20)
        }
    }

    /// What set today's target: readiness, sleep debt, the morning answer, the plan.
    private func targetRows(_ t: TodaySnapshot.Strain.Target) -> some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                targetRow("Připravenost", t.readiness.map { String($0) } ?? "–", first: true)
                targetRow("Spánkový dluh", t.debt.map { Fmt.hoursMinutesLong($0) } ?? "–")
                if let feeling = t.feeling, let option = MorningCheckinCard.options.first(where: { $0.id == feeling }) {
                    targetRow("Pocit", L10n.tr(option.label))
                }
                targetRow("Plán", t.plan ?? L10n.tr("nic v plánu"))
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func targetRow(_ title: String, _ value: String, first: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(L10n.tr(title)).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 12)
            Text(verbatim: value).font(.body).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }

    private var sources: some View {
        let split = parts
        let done: [WeekSession] = sessions.filter { $0.status == "done" }
        let open: [WeekSession] = sessions.filter { $0.status == "planned" }
        let doneTss: Double = done.compactMap(\.tss).reduce(0, +)
        let openTss: Double = open.compactMap(\.tss).reduce(0, +)
        let firstDone: String? = done.first?.id
        return Card(padding: 0) {
            VStack(spacing: 0) {
                ForEach(done) { (s: WeekSession) in
                    StrainRow(symbol: SportIcon.symbol(s.sport), color: Palette.amberBar, title: s.title, meta: meta(s),
                              value: share(split.training, s.tss, of: doneTss), planned: false, first: s.id == firstDone)
                }
                StrainRow(symbol: "shoeprints.fill", color: Palette.sand, title: L10n.tr("Pohyb během dne"), meta: movementMeta,
                          value: split.movement, planned: false, first: done.isEmpty)
                ForEach(open) { (s: WeekSession) in
                    StrainRow(symbol: SportIcon.symbol(s.sport), color: Palette.amberBar, title: s.title, meta: L10n.tr("v plánu"),
                              value: share(split.planned, s.tss, of: openTss), planned: true, first: false)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func share(_ total: Double, _ tss: Double?, of all: Double) -> Double? {
        all > 0 ? total * (tss ?? 0) / all : nil
    }

    private func meta(_ s: WeekSession) -> String {
        [s.time.map { ClockText.format($0) }, s.minutes.map { Fmt.duration($0) }, s.tss.map { Fmt.int($0) + " TSS" }].compactMap { $0 }.joined(separator: " · ")
    }

    private var movementMeta: String {
        var parts: [String] = []
        if let steps = today.steps.today { parts.append(Fmt.int(steps) + " " + L10n.tr("kroků")) }
        if let active = today.steps.activeMinutes { parts.append(Fmt.int(active.today) + " " + L10n.tr("aktivních min")) }
        return parts.joined(separator: " · ")
    }

    /// Planned TSS per day from tomorrow to Sunday (today's open sessions count today).
    private var upcomingTss: [(date: String, tss: Double)] {
        let all = training?.sessions ?? []
        let sunday = ISODay.shift(today.date, 6 - ISODay.weekdayIndex(today.date))
        let end = sunday == today.date ? ISODay.shift(today.date, 7) : sunday
        return ISODay.range(today.date, end).map { day in
            (day, all.filter { $0.date == day && $0.status == "planned" }.compactMap(\.tss).reduce(0, +))
        }
    }
}

/// The day's strain on a 270° dial out of 21, the plan as a lighter arc.
struct StrainDial: View {
    let score: Double
    let planned: Double?
    var target: TodaySnapshot.Strain.Target? = nil

    var body: some View {
        let sweep = 0.75
        ZStack {
            Circle().trim(from: 0, to: sweep)
                .stroke(Palette.track, style: StrokeStyle(lineWidth: 14, lineCap: .round))
            // Today's target as a green band on the track.
            if let target {
                Circle().trim(from: sweep * Swift.min(target.low, 21) / 21, to: sweep * Swift.min(target.high, 21) / 21)
                    .stroke(Palette.green.opacity(0.45), style: StrokeStyle(lineWidth: 14))
            }
            if target == nil, let planned, planned > score {
                Circle().trim(from: 0, to: sweep * Swift.min(planned, 21) / 21)
                    .stroke(Palette.amberBar.opacity(0.35), style: StrokeStyle(lineWidth: 14, lineCap: .round))
            }
            Circle().trim(from: 0, to: Swift.max(0.004, sweep * Swift.min(score, 21) / 21))
                .stroke(Palette.amberBar, style: StrokeStyle(lineWidth: 14, lineCap: .round))
        }
        .rotationEffect(.degrees(135))
        .frame(width: 180, height: 180)
        .overlay {
            VStack(spacing: 2) {
                Text(verbatim: Fmt.decimal(score)).font(Typo.number(54)).foregroundStyle(Palette.ink)
                Text(verbatim: subtitle)
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .overlay(alignment: .bottom) {
            HStack {
                Text(verbatim: "0")
                Spacer()
                Text(verbatim: "21")
            }
            .font(Typo.tiny).foregroundStyle(Palette.faint)
            .frame(width: 150)
            .offset(y: 4)
        }
        .dynamicTypeSize(...DynamicTypeSize.denseCap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: L10n.tr("Zátěž") + " " + Fmt.decimal(score) + ", " + subtitle))
    }

    private var subtitle: String {
        let head: String? = target.map { L10n.f("cíl %@–%@", Fmt.decimal($0.low), Fmt.decimal($0.high)) } ?? planned.map { L10n.f("plán ~%@", Fmt.decimal($0)) }
        return (head.map { $0 + " · " } ?? "") + L10n.f("z %@", "21")
    }
}

/// One line filled by training, movement and (dashed) the rest of the plan.
struct StrainSplitBar: View {
    let training: Double
    let movement: Double
    let planned: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geo in
                let unit = Swift.max(geo.size.width - 4, 0) / 21
                HStack(spacing: 2) {
                    if training > 0 { Rectangle().fill(Palette.amberBar).frame(width: unit * training) }
                    if movement > 0 { Rectangle().fill(Palette.amberBar.opacity(0.5)).frame(width: unit * movement) }
                    if planned > 0 {
                        Rectangle().strokeBorder(Palette.amberBar, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                            .frame(width: unit * Swift.min(planned, Swift.max(0, 21 - training - movement)))
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .background(Palette.track)
                .clipShape(Capsule())
            }
            .frame(height: 12)
            HStack(spacing: 14) {
                part(training, "trénink")
                part(movement, "pohyb")
                if planned > 0 { part(planned, "v plánu", plus: true) }
            }
        }
    }

    private func part(_ value: Double, _ label: String, plus: Bool = false) -> some View {
        (Text(verbatim: (plus ? "+" : "") + Fmt.decimal(value) + " ").font(.footnote.weight(.semibold)).foregroundColor(Palette.ink)
            + Text(LocalizedStringKey(label)).font(.footnote).foregroundColor(Palette.muted))
    }
}

/// One source of the day's strain: icon, name, details, its share and value.
struct StrainRow: View {
    let symbol: String
    let color: Color
    let title: String
    let meta: String
    let value: Double?
    let planned: Bool
    let first: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(planned ? color : Palette.onAccent)
                .frame(width: 38, height: 38)
                .background {
                    if planned {
                        RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(color, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    } else {
                        RoundedRectangle(cornerRadius: 11, style: .continuous).fill(color)
                    }
                }
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: title).font(.subheadline.weight(.semibold)).foregroundStyle(planned ? Palette.muted : Palette.ink).lineLimit(1)
                    Spacer()
                    if let value { Text(verbatim: (planned ? "+" : "") + Fmt.decimal(value)).font(Typo.number(19)).foregroundStyle(planned ? Palette.faint : Palette.ink) }
                }
                if !meta.isEmpty { Text(verbatim: meta).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
                if let value {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.track)
                            if planned {
                                Capsule().strokeBorder(color, style: StrokeStyle(lineWidth: 1.2, dash: [3, 2]))
                                    .frame(width: Swift.max(6, geo.size.width * Swift.min(value, 14) / 14))
                            } else {
                                Capsule().fill(color).frame(width: Swift.max(4, geo.size.width * Swift.min(value, 14) / 14))
                            }
                        }
                    }
                    .frame(height: 6)
                    .padding(.top, 4)
                }
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }
}

/// Fitness (CTL) and fatigue (ATL) over six weeks with the forecast from the
/// planned sessions (dashed), and form today and at the end of the week.
struct FitnessChart: View {
    let form: TrainingSnapshot.Form
    let upcoming: [(date: String, tss: Double)]

    private struct Point: Identifiable {
        let id: String
        let date: Date
        let value: Double
        let series: String
        let forecast: Bool
    }

    private struct Series {
        let points: [Point]
        let forecast: [Point]
        let lo: Double
        let hi: Double
        let today: Date?
        let endForm: Double?
    }

    private func series() -> Series {
        let past = Array(form.series.suffix(42))
        var ctl = past.last?.fitness ?? form.fitness
        var atl = past.last?.fatigue ?? form.fatigue
        var seeds: [(String, Double, Double)] = []
        if let last = past.last { seeds.append((last.date, last.fitness, last.fatigue)) }
        for day in upcoming.dropFirst() {
            ctl += (day.tss - ctl) / 42
            atl += (day.tss - atl) / 7
            seeds.append((day.date, ctl, atl))
        }
        let points: [Point] = past.flatMap { p -> [Point] in
            guard let date = ISODay.date(p.date) else { return [] }
            return [Point(id: "c" + p.date, date: date, value: p.fitness, series: "Kondice", forecast: false),
                    Point(id: "a" + p.date, date: date, value: p.fatigue, series: "Únava", forecast: false)]
        }
        let forecast: [Point] = seeds.count > 1 ? seeds.flatMap { item -> [Point] in
            let (day, c, a) = item
            guard let date = ISODay.date(day) else { return [] }
            return [Point(id: "fc" + day, date: date, value: c, series: "Kondice", forecast: true),
                    Point(id: "fa" + day, date: date, value: a, series: "Únava", forecast: true)]
        } : []
        let values = (points + forecast).map(\.value)
        let lo = Swift.max(0, ((values.min() ?? 0) - 8).rounded(.down))
        let hi = (values.max() ?? 1) + 8
        let endForm: Double? = seeds.count > 1 ? seeds[seeds.count - 1].1 - seeds[seeds.count - 1].2 : nil
        return Series(points: points, forecast: forecast, lo: lo, hi: hi, today: past.last.flatMap { ISODay.date($0.date) }, endForm: endForm)
    }

    var body: some View {
        let data = series()
        let points = data.points, forecast = data.forecast, lo = data.lo, hi = data.hi
        let endForm = data.endForm, todayDate = data.today

        VStack(spacing: 12) {
            Card {
                HStack(spacing: 14) {
                    legend(Palette.green, L10n.tr("Kondice") + " " + Fmt.int(form.fitness))
                    legend(Palette.amberBar, L10n.tr("Únava") + " " + Fmt.int(form.fatigue))
                    Spacer()
                }
                Chart {
                    if let todayDate, let last = forecast.last?.date, last > todayDate {
                        RectangleMark(xStart: .value("Od", todayDate), xEnd: .value("Do", last))
                            .foregroundStyle(Palette.amberBar.opacity(0.07))
                        RuleMark(x: .value("Dnes", todayDate)).foregroundStyle(Palette.faint.opacity(0.5))
                    }
                    ForEach(points) { p in
                        LineMark(x: .value("Den", p.date), y: .value("Hodnota", p.value), series: .value("Řada", p.series))
                            .foregroundStyle(p.series == "Kondice" ? Palette.green : Palette.amberBar)
                            .lineStyle(StrokeStyle(lineWidth: p.series == "Kondice" ? 2.2 : 1.6))
                            .interpolationMethod(.monotone)
                    }
                    ForEach(forecast) { p in
                        LineMark(x: .value("Den", p.date), y: .value("Hodnota", p.value), series: .value("Řada", "f" + p.series))
                            .foregroundStyle(p.series == "Kondice" ? Palette.green : Palette.amberBar)
                            .lineStyle(StrokeStyle(lineWidth: p.series == "Kondice" ? 2.2 : 1.6, dash: [4, 3]))
                    }
                }
                .chartYScale(domain: lo...hi)
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 14)) { _ in
                        AxisGridLine().foregroundStyle(Palette.hairline)
                        AxisValueLabel(format: .dateTime.day().month(.defaultDigits).locale(Fmt.locale)).foregroundStyle(Palette.faint)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Palette.hairline)
                        AxisValueLabel().foregroundStyle(Palette.faint)
                    }
                }
                .frame(height: 170)
            }
            Card {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Forma dnes").font(Typo.caption).foregroundStyle(Palette.muted)
                        Text(verbatim: signed(form.form)).font(Typo.number(30)).foregroundStyle(Palette.ink)
                        Text(verbatim: form.label).font(Typo.caption).foregroundStyle(Palette.green)
                    }
                    Spacer()
                    if let endForm, let end = upcoming.last?.date {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(verbatim: L10n.f("Forma %@", Fmt.weekdayShort(end) + " " + Fmt.dayMonth(end))).font(Typo.caption).foregroundStyle(Palette.muted)
                            Text(verbatim: signed(endForm)).font(Typo.number(30)).foregroundStyle(Palette.ink)
                            Text(verbatim: L10n.tr(Self.formWord(endForm))).font(Typo.caption).foregroundStyle(endForm < -30 ? Palette.rust : Palette.green)
                        }
                    }
                }
            }
        }
    }

    static func formWord(_ tsb: Double) -> String {
        switch tsb {
        case ..<(-30): return "riziko přetížení"
        case ..<(-10): return "optimální trénink"
        case ..<5: return "neutrální"
        default: return "čerstvý"
        }
    }

    private func signed(_ v: Double) -> String {
        let r = v.rounded()
        return (r > 0 ? "+" : r < 0 ? "−" : "") + Fmt.int(abs(r))
    }

    private func legend(_ c: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 14, height: 3)
            Text(verbatim: text).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}
