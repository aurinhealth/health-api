import SwiftUI

/// Strain from Today (concept D, d-strain): Strain, Fitness and Fatigue as
/// cells on top; the day's strain on a dial against today's target with the
/// plan dotted; its last 30 days or 3 months; the trend; what it is made of;
/// the heart rate zones of the day's last workout and what set the target.
struct StrainDetailView: View {
    @Environment(AppModel.self) private var model
    /// A past day chosen on Training; nil is the day Today shows.
    var date: String? = nil
    /// That day as Today shows it, loaded here.
    @State private var day: TodaySnapshot?
    @State private var info = false

    private var shown: TodaySnapshot? {
        guard let date else { return model.today }
        return model.today?.date == date ? model.today : day
    }

    var body: some View {
        // Today's green from Today, Training's amber from a day on Training (section tint rule).
        let glow = date == nil ? Palette.Glow.today : Palette.Glow.training
        DetailTemplate(title: "Námaha", glow: glow) {
            CoachEntry(subject: .strain(date: date ?? model.selectedDate), view: DetailScreen<EmptyView>.coachView(glow),
                       companion: ChromeAction(systemImage: "info", label: "Jak se to měří") { info = true })
        } content: {
            if let today = shown {
                StrainDetailContent(today: today, training: model.training, past: date != nil)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .sheet(isPresented: $info) { StrainInfo() }
        .task {
            if let date {
                if model.today?.date != date, !model.demo { day = try? await model.api.today(date: date) }
            } else if model.today == nil {
                await model.refresh()
            }
            if model.training == nil { await model.refreshTraining() }
        }
    }
}

extension TodaySnapshot {
    /// The TSS of today's workouts that are "done" or still "planned".
    func sessionTss(_ status: String) -> Double {
        plan.compactMap { $0.kind == "workout" ? $0.session : nil }
            .filter { $0.status == status }.compactMap(\.tss).reduce(0, +)
    }

    /// What the workouts still planned today add to the strain: the dotted part
    /// of the dial, and the same number the Apple Watch shows.
    var strainStillPlanned: Double {
        let done = sessionTss("done")
        return Swift.max(0, StrainDetailContent.strain(tss: done + sessionTss("planned")) - StrainDetailContent.strain(tss: done))
    }
}

struct StrainDetailContent: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot
    let training: TrainingSnapshot?
    /// A past day chosen on Training: named above the dial, without the plan.
    var past = false

    @State private var cell = "strain"
    @State private var period: ChartPeriod = .days30
    @State private var zones: (title: String, rows: [ZoneList.Row])?

    /// The same 0–21 scale as the planned strain on the server (app-today.js).
    static func strain(tss: Double) -> Double { tss > 0 ? 21 * (1 - exp(-tss / 90)) : 0 }

    private var sessions: [WeekSession] {
        today.plan.compactMap { $0.kind == "workout" ? $0.session : nil }
    }

    /// The day's strain split into training, the rest of the day's movement
    /// and what the sessions still planned would add.
    private var parts: (training: Double, movement: Double, planned: Double) {
        let score = today.strain.score ?? 0
        let trainingPart = today.strain.training ?? Swift.min(score, Self.strain(tss: today.sessionTss("done")))
        let movement = today.strain.movement ?? (score - trainingPart)
        return (trainingPart, Swift.max(0, movement), past ? 0 : today.strainStillPlanned)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SiblingCells(cells: cells, selected: cell) { cell = $0; period = .days30 }.padding(.top, 16)
            if cell == "strain" {
                strainPage
            } else if let form = training?.form {
                formPage(form, fitness: cell == "fitness")
            }
        }
        .task { await model.loadQuarter(ending: today.date) }
        .task(id: lastDone?.id) { await loadZones() }
    }

    private var cells: [SiblingCell] {
        var list = [SiblingCell(id: "strain", title: "Námaha", value: Fmt.decimal(today.strain.score ?? 0), unit: L10n.f("z %@", "21"))]
        if let form = training?.form {
            list.append(SiblingCell(id: "fitness", title: "Kondice", value: Fmt.int(form.fitness)))
            list.append(SiblingCell(id: "fatigue", title: "Únava", value: Fmt.int(form.fatigue)))
        }
        return list
    }

    // MARK: Strain

    @ViewBuilder
    private var strainPage: some View {
        let split = parts
        Text(verbatim: past ? Fmt.dayShort(today.date, today: AppModel.localDate(Date())) : L10n.tr("Námaha dnes, zatím"))
            .font(Typo.body).foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity).padding(.top, 22)
        StrainDial(score: today.strain.score ?? 0, planned: split.planned, target: today.strain.target)
            .frame(maxWidth: .infinity).padding(.top, 14)
        let points = strainPoints
        // The grey band is drawn only after 7 earlier days: never name it
        // when it isn't there (review 2026-11-25).
        let band = points.contains { $0.low != nil }
        Card {
            DetailChart(points: points, today: today.date, period: $period, digits: 1,
                        note: band ? (past ? "Každý bod je jeden den. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období."
                            : "Každý bod je jeden den. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období. Dnešek je zatím jen část dne.")
                            : (past ? "Každý bod je jeden den. Čárkovaně průměr období."
                               : "Každý bod je jeden den. Čárkovaně průměr období. Dnešek je zatím jen část dne."),
                        periods: [.days30, .months3])
        }
        .padding(.top, 24)
        let rows = TrendMath.rows(points.filter { $0.date < today.date }, today: ISODay.shift(today.date, -1))
        if !rows.isEmpty {
            SectionLabel(text: "Analýza trendu").padding(.top, 28)
            Card { TrendTable(rows: rows, digits: 1) }.padding(.top, 10)
        }
        SectionLabel(text: "Z čeho je").padding(.top, 28)
        sources(split).padding(.top, 10)
        if let zones {
            SectionLabel(text: L10n.f("Tepové zóny, %@", zones.title)).padding(.top, 28)
            Card { ZoneList(rows: zones.rows, bars: true) }.padding(.top, 10)
        }
        if let target = today.strain.target {
            SectionLabel(text: past ? "Co určilo cíl dne" : "Co určuje dnešní cíl").padding(.top, 28)
            targetRows(target).padding(.top, 10)
        }
    }

    /// The days' strain from /app/api/days with the usual range of the 28
    /// days before each (mean ± one SD, from 7 days on), as the Health charts.
    private var strainPoints: [ChartPoint] {
        var values: [String: Double] = [:]
        for (date, day) in model.dayValues where date <= today.date { if let s = day.strain { values[date] = s } }
        if let score = today.strain.score { values[today.date] = score }
        let dates = values.keys.sorted()
        return dates.map { date in
            let before = dates.filter { $0 < date && $0 >= ISODay.shift(date, -28) }.compactMap { values[$0] }
            var point = ChartPoint(date: date, value: values[date] ?? 0)
            if before.count >= 7, let mean = ChartBuckets.mean(before) {
                let sd = (before.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(before.count)).squareRoot()
                point.low = Swift.max(0, mean - sd)
                point.high = Swift.min(21, mean + sd)
            }
            return point
        }
    }

    // MARK: What it is made of

    private func sources(_ split: (training: Double, movement: Double, planned: Double)) -> some View {
        let done = sessions.filter { $0.status == "done" }
        let open = past ? [] : sessions.filter { $0.status == "planned" }
        let doneTss = done.compactMap(\.tss).reduce(0, +)
        let openTss = open.compactMap(\.tss).reduce(0, +)
        return Card {
            StrainSplitBar(training: split.training, movement: split.movement, planned: split.planned, target: today.strain.target)
            ForEach(done) { s in
                Rectangle().fill(Palette.hairline).frame(height: 1)
                StrainRow(symbol: SportIcon.symbol(s.sport, type: s.type), color: Palette.Sport.color(s.sport), title: s.title, meta: meta(s),
                          value: share(split.training, s.tss, of: doneTss), planned: false)
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            StrainRow(symbol: "figure.walk", color: Palette.ink, title: L10n.tr("Pohyb během dne"), meta: movementMeta,
                      value: split.movement, planned: false)
            ForEach(open) { s in
                Rectangle().fill(Palette.hairline).frame(height: 1)
                StrainRow(symbol: SportIcon.symbol(s.sport, type: s.type), color: Palette.Sport.color(s.sport), title: s.title,
                          meta: [ClockText.format(optional: s.time), L10n.tr("naplánováno")].compactMap { $0 }.joined(separator: ", "),
                          value: share(split.planned, s.tss, of: openTss), planned: true)
            }
        }
    }

    private func share(_ total: Double, _ tss: Double?, of all: Double) -> Double? {
        all > 0 ? total * (tss ?? 0) / all : nil
    }

    /// "07:30, 42 min, 8.2 km": what the athlete knows, no TSS (point 68).
    private func meta(_ s: WeekSession) -> String {
        [ClockText.format(optional: s.time), s.minutes.map { Fmt.duration($0) },
         s.distanceKm.flatMap { $0 > 0 ? Fmt.decimal(Units.distance($0)) + " " + Units.distanceUnit : nil }]
            .compactMap { $0 }.joined(separator: ", ")
    }

    private var movementMeta: String {
        var parts: [String] = []
        if let steps = today.steps.today { parts.append(L10n.plural("%@ kroků", Fmt.int(steps), Int(steps.rounded()))) }
        if let active = today.steps.activeMinutes { parts.append(L10n.f("%@ aktivních min", Fmt.int(active.today))) }
        return parts.joined(separator: ", ")
    }

    // MARK: Heart rate zones

    private var lastDone: WeekSession? {
        sessions.last { $0.status == "done" && $0.activityId != nil }
    }

    private func loadZones() async {
        guard let session = lastDone, let id = session.activityId, !model.demo,
              let detail = try? await model.api.activityDetail(id: id), let list = detail.hrZones, !list.isEmpty else { return }
        let total = Swift.max(list.compactMap(\.seconds).reduce(0, +), 1)
        let names = ZoneList.heartNames(list.count)
        let rows = list.enumerated().map { i, z -> ZoneList.Row in
            var range: String? = nil
            if let lo = z.min, let hi = z.max { range = Fmt.int(lo) + "–" + Fmt.int(hi) + " bpm" }
            else if let hi = z.max { range = "< " + Fmt.int(hi + 1) + " bpm" }
            else if let lo = z.min { range = Fmt.int(lo) + "+ bpm" }
            let seconds = z.seconds ?? 0
            return ZoneList.Row(id: i, name: i < names.count ? names[i] : "Z\(i + 1)", range: range, seconds: seconds, percent: z.percent ?? seconds / total * 100)
        }
        zones = (session.title, rows)
    }

    // MARK: What sets the target

    /// What set today's target: readiness, sleep debt, the plan. The morning
    /// answer is not one of them (T-HAB-1: it never moves readiness or the target).
    private func targetRows(_ t: TodaySnapshot.Strain.Target) -> some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                targetRow("Připravenost", t.readiness.map { String($0) } ?? "–", first: true)
                targetRow("Spánkový dluh", t.debt.map { TodayDials.length($0) } ?? "–")
                targetRow("Plán", t.plan ?? L10n.tr("nic v plánu"))
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private func targetRow(_ title: String, _ value: String, first: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(L10n.tr(title)).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 12)
            Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }

    // MARK: Fitness and fatigue

    @ViewBuilder
    private func formPage(_ form: TrainingSnapshot.Form, fitness: Bool) -> some View {
        let points = form.series.map { ChartPoint(date: $0.date, value: fitness ? $0.fitness : $0.fatigue) }
        DetailHeadline(value: Fmt.int(fitness ? form.fitness : form.fatigue))
            .padding(.top, 22)
        Text(verbatim: form.text).font(Typo.body).foregroundStyle(Palette.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity).multilineTextAlignment(.center)
            .padding(.top, 8)
        Card {
            DetailChart(points: points, today: points.last?.date ?? today.date, period: $period,
                        note: fitness ? "Kondice je tvoje tréninková zátěž za posledních 6 týdnů. Každý bod je jeden den."
                            : "Únava je tvoje tréninková zátěž za poslední týden. Každý bod je jeden den.",
                        periods: points.count > 35 ? [.days30, .months3] : [.days30])
        }
        .padding(.top, 20)
    }
}

/// What strain is, from the "i" top right.
struct StrainInfo: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(verbatim: L10n.tr("Námaha")).font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                }
                HowMeasuredCard(text: "Námaha je zátěž celého dne na stupnici 0 až 21: tréninky z jejich délky a intenzity a pohyb během dne. Cíl dne určuje připravenost, spánkový dluh a plán. Je to odhad, ne měření tvého těla.")
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
    }
}

/// The day's strain on a 270° dial out of 21 (concept d-strain): the score in
/// ink, today's target as a green band, the rest of the plan dotted to an
/// open dot, and where the day lands against the target.
struct StrainDial: View {
    let score: Double
    /// What the sessions still planned add.
    let planned: Double
    var target: TodaySnapshot.Strain.Target? = nil

    private let sweep = 0.75
    private func at(_ value: Double) -> Double { sweep * Swift.min(Swift.max(value, 0), 21) / 21 }

    var body: some View {
        let end = score + planned
        ZStack {
            Circle().trim(from: 0, to: sweep)
                .stroke(Palette.track, style: StrokeStyle(lineWidth: 12, lineCap: .round))
            if let target {
                Circle().trim(from: at(target.low), to: at(target.high))
                    .stroke(Palette.green.opacity(0.55), style: StrokeStyle(lineWidth: 12))
            }
            if planned > 0.05 {
                Circle().trim(from: at(score), to: at(end))
                    .stroke(Palette.ink, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [0.5, 5]))
            }
            Circle().trim(from: 0, to: Swift.max(0.004, at(score)))
                .stroke(Palette.ink, style: StrokeStyle(lineWidth: 12, lineCap: .round))
            if planned > 0.05 {
                // The open dot where the plan takes the day.
                Circle().fill(Palette.card).overlay { Circle().stroke(Palette.ink, lineWidth: 2.5) }
                    .frame(width: 13, height: 13)
                    .offset(x: 105)
                    .rotationEffect(.degrees(360 * at(end)))
            }
        }
        .rotationEffect(.degrees(135))
        .frame(width: 210, height: 210)
        .overlay {
            VStack(spacing: 4) {
                Text(verbatim: Fmt.decimal(score)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                if planned > 0.05 {
                    Text(verbatim: L10n.f("%@ v plánu navíc", Fmt.decimal(planned))).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
                }
            }
        }
        .overlay(alignment: .bottom) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: "0")
                Spacer()
                if let landing { Text(verbatim: landing.0).font(Typo.caption).foregroundStyle(landing.1) }
                Spacer()
                Text(verbatim: "21")
            }
            .font(Typo.tiny).foregroundStyle(Palette.faint)
            .frame(width: 170)
            .offset(y: 10)
        }
        .padding(.bottom, 12)
        .dynamicTypeSize(...DynamicTypeSize.denseCap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }

    private var spoken: String {
        var parts: [String] = [L10n.tr("Námaha") + " " + Fmt.decimal(score) + " " + L10n.f("z %@", "21")]
        if planned > 0.05 { parts.append(L10n.f("%@ v plánu navíc", Fmt.decimal(planned))) }
        if let target { parts.append(L10n.f("cíl %@ až %@", Fmt.int(target.low), Fmt.int(target.high))) }
        if let landing { parts.append(landing.0) }
        return parts.joined(separator: ", ")
    }

    /// "lands in target" in green, above it in amber, below it in grey.
    private var landing: (String, Color)? {
        guard let target else { return nil }
        let end = score + planned, withPlan = planned > 0.05
        if end > target.high { return (L10n.tr(withPlan ? "skončí nad cílem" : "nad cílem dne"), Palette.amber) }
        if end >= target.low { return (L10n.tr(withPlan ? "skončí v cíli" : "v cíli"), Palette.green) }
        return (L10n.tr(withPlan ? "skončí pod cílem" : "pod cílem"), Palette.muted)
    }
}

/// One line filled by training (ink), movement (grey) and, dotted, the rest
/// of the plan, with today's target as a green band (concept "What it's made of").
struct StrainSplitBar: View {
    let training: Double
    let movement: Double
    let planned: Double
    var target: TodaySnapshot.Strain.Target? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { geo in
                let unit = geo.size.width / 21
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    if let target {
                        Rectangle().fill(Palette.green.opacity(0.45))
                            .frame(width: unit * Swift.max(0, Swift.min(target.high, 21) - target.low))
                            .offset(x: unit * target.low)
                    }
                    HStack(spacing: 0) {
                        Rectangle().fill(Palette.ink).frame(width: unit * training)
                        Rectangle().fill(Palette.muted).frame(width: unit * movement)
                        if planned > 0 {
                            Rectangle().strokeBorder(Palette.ink, style: StrokeStyle(lineWidth: 1.2, dash: [3, 2]))
                                .frame(width: unit * Swift.min(planned, Swift.max(0, 21 - training - movement)))
                        }
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 10)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Text(verbatim: "0")
                    if let target {
                        Text("cíl námahy").foregroundStyle(Palette.green)
                            .position(x: geo.size.width * (target.low + target.high) / 42, y: 7)
                    }
                    Text(verbatim: "21").frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .font(Typo.tiny).foregroundStyle(Palette.faint)
            .frame(height: 14)
            .accessibilityHidden(true)
            HStack(spacing: 14) {
                part(training, "trénink", Palette.ink)
                part(movement, "pohyb", Palette.muted)
                if planned > 0 { part(planned, "naplánováno", nil) }
            }
            .padding(.top, 4)
        }
    }

    private func part(_ value: Double, _ label: String, _ fill: Color?) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(fill ?? .clear)
                .overlay { if fill == nil { RoundedRectangle(cornerRadius: 2).stroke(Palette.ink, lineWidth: 1.2) } }
                .frame(width: 9, height: 9)
            (Text(verbatim: Fmt.decimal(value) + " ").font(.footnote.weight(.semibold)).foregroundColor(Palette.ink)
                + Text(LocalizedStringKey(label)).font(.footnote).foregroundColor(Palette.muted))
        }
    }
}

/// One source of the day's strain: a round icon in its sport's colour, the
/// name and details, and its part of the score (concept d-strain-02).
struct StrainRow: View {
    let symbol: String
    let color: Color
    let title: String
    let meta: String
    let value: Double?
    let planned: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .scaledFont(15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(color)
                .frame(width: 40, height: 40)
                .background(color.opacity(planned ? 0.08 : 0.16), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: title).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                if !meta.isEmpty { Text(verbatim: meta).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
            }
            Spacer(minLength: 8)
            if let value {
                Text(verbatim: (planned ? "+" : "") + Fmt.decimal(value)).font(Typo.number(24))
                    .foregroundStyle(planned ? Palette.muted : Palette.ink)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

