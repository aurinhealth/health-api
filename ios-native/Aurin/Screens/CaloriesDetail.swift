import SwiftUI

/// GET /app/api/food/history (src/nutrition-days.js, part S3): each day of the
/// period with what was eaten (nil when nothing was logged) against that day's
/// kept target, oldest first.
struct FoodHistory: Decodable, Equatable {
    let today: String
    let days: Int
    let daysLogged: Int
    var average: Totals? = nil
    var targetsFrom: String? = nil
    let list: [Day]

    struct Totals: Decodable, Equatable {
        var kcal: Double? = nil
        var protein: Double? = nil
        var carbs: Double? = nil
        var fat: Double? = nil
    }

    struct Day: Decodable, Equatable {
        let date: String
        var kcal: Double? = nil
        var protein: Double? = nil
        var carbs: Double? = nil
        var fat: Double? = nil
        var target: Double? = nil
        var proteinTarget: Double? = nil
        var carbsTarget: Double? = nil
        var fatTarget: Double? = nil
        var logged = false
    }

    /// The server takes 30, 90, 180 or 365 days (HISTORY_DAYS).
    static func days(for period: ChartPeriod) -> Int {
        switch period {
        case .days30: return 30
        case .months3: return 90
        case .months6: return 180
        case .year: return 365
        }
    }

    /// The sample day's month: the demo's target with a few days over and
    /// under and three days without a log.
    static func demo(today: String, target: Double, days: Int = 30) -> FoodHistory {
        let pattern: [Double] = [0.97, 1.04, 0.93, 0.99, 0.86, 1.01, 0.95, 0.98, 1.08, 0.9]
        let list = (0..<days).map { i -> Day in
            let date = ISODay.shift(today, i - days + 1)
            if i == days - 1 { return Day(date: date, kcal: 1380, protein: 84, carbs: 177, fat: 36, target: target, proteinTarget: 150, carbsTarget: 330, fatTarget: 80, logged: true) }
            if i % 11 == 4 { return Day(date: date, target: target, proteinTarget: 150, carbsTarget: 330, fatTarget: 80) }
            let k = pattern[i % pattern.count]
            return Day(date: date, kcal: (target * k).rounded(), protein: (150 * k).rounded(), carbs: (330 * k).rounded(), fat: (80 * k).rounded(),
                       target: target, proteinTarget: 150, carbsTarget: 330, fatTarget: 80, logged: true)
        }
        return FoodHistory(today: today, days: days, daysLogged: list.filter(\.logged).count, list: list)
    }
}

extension APIClient {
    func foodHistory(days: Int) async throws -> FoodHistory {
        try await get("/app/api/food/history?days=\(days)")
    }
}

/// One of the four values on the page; the switch on top changes the page.
enum FoodValue: String, CaseIterable {
    case calories, carbs, protein, fat

    var title: String {
        switch self {
        case .calories: return "Kalorie"
        case .carbs: return "Sacharidy"
        case .protein: return "Bílkoviny"
        case .fat: return "Tuky"
        }
    }

    var unit: String { self == .calories ? "kcal" : "g" }

    /// The month's sentence for a macro: days its target was met of the days with one.
    var metFormat: String {
        switch self {
        case .calories, .protein: return "Dny se splněným cílem bílkovin: %lld z %lld."
        case .carbs: return "Dny se splněným cílem sacharidů: %lld z %lld."
        case .fat: return "Dny se splněným cílem tuků: %lld z %lld."
        }
    }

    var color: Color {
        switch self {
        case .calories: return Palette.ink
        case .carbs: return Palette.carbs
        case .protein: return Palette.protein
        case .fat: return Palette.fat
        }
    }

    func eaten(_ day: FoodHistory.Day) -> Double? {
        switch self {
        case .calories: return day.kcal
        case .carbs: return day.carbs
        case .protein: return day.protein
        case .fat: return day.fat
        }
    }

    func target(_ day: FoodHistory.Day) -> Double? {
        switch self {
        case .calories: return day.target
        case .carbs: return day.carbsTarget
        case .protein: return day.proteinTarget
        case .fat: return day.fatTarget
        }
    }

    func today(_ food: FoodSnapshot) -> (eaten: Double, target: Double?) {
        switch self {
        case .calories: return (food.kcal ?? 0, food.target)
        case .carbs: return (food.macros.carbs.eaten ?? 0, food.macros.carbs.target)
        case .protein: return (food.macros.protein.eaten ?? 0, food.macros.protein.target)
        case .fat: return (food.macros.fat.eaten ?? 0, food.macros.fat.target)
        }
    }
}

/// Logged days against their own target: over from the first unit above it
/// (as the total on Food and the month's rings), "well below" more than 8 %
/// under, at target in between (D-JIDLO-3, tester's version: well below
/// stays, under-eating is a risk for athletes).
enum TargetDays {
    struct Count: Equatable {
        var over = 0
        var at = 0
        var below = 0
        var total: Int { over + at + below }
    }

    static let belowShare = 0.92

    static func count(_ days: [FoodHistory.Day], value: FoodValue = .calories) -> Count {
        var count = Count()
        for day in days where day.logged {
            guard let eaten = value.eaten(day), let target = value.target(day), target > 0 else { continue }
            if FoodHero.over(eaten: eaten, target: target) >= 1 { count.over += 1 }
            else if eaten < target * belowShare { count.below += 1 }
            else { count.at += 1 }
        }
        return count
    }
}

/// Calories (redesign J): replaces the "Today's target" sheet. The switch
/// between Calories, Carbs, Protein and Fat, today's dial against the target,
/// where today's target comes from, the logged days of 30 days to a year,
/// the days against their target, the trend and how it is counted. The coach
/// top right.
struct CaloriesDetailView: View {
    let food: FoodSnapshot
    @State var value: FoodValue = .calories

    var body: some View {
        DetailTemplate(title: value.title, glow: Palette.Glow.food) {
            CoachEntry(view: "food")
        } content: {
            CaloriesDetailContent(food: food, value: $value)
        }
    }
}

struct CaloriesDetailContent: View {
    @Environment(AppModel.self) private var model
    let food: FoodSnapshot
    @Binding var value: FoodValue
    /// Given in tests and previews; otherwise loaded per period.
    var history: FoodHistory? = nil
    @State private var loaded: [Int: FoodHistory] = [:]
    @State private var period: ChartPeriod = .days30
    @State private var failed = false

    private var isToday: Bool { food.date == AppModel.localDate(Date()) }
    private var shown: FoodHistory? { history ?? loaded[FoodHistory.days(for: period)] ?? loaded[30] }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SiblingCells(cells: FoodValue.allCases.map { v in
                SiblingCell(id: v.rawValue, title: v.title, value: Fmt.int(v.today(food).eaten), unit: v.unit)
            }, selected: value.rawValue) { id in value = FoodValue(rawValue: id) ?? .calories }
            .padding(.top, 16)

            dial

            if value == .calories, let parts = food.targetParts {
                TargetSourceCard(parts: parts, target: food.target ?? parts.base + parts.workouts + parts.planned, isToday: isToday)
            }

            if let history = shown {
                historySections(history)
            } else if failed {
                Card { LearningState(kind: .missing, text: L10n.tr("Historii teď nejde načíst. Zkus to za chvíli.")) }
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            }

            HowMeasuredCard(text: value == .calories
                                ? "Kalorie jsou součet jídel, která jsi ten den zapsal. Cíl je odhad, který se mění s tréninkem. Den bez zápisu se vynechá, nepočítá se jako nula."
                                : "Gramy jsou součet jídel, která jsi ten den zapsal, proti cíli toho dne. Den bez zápisu se vynechá, nepočítá se jako nula.",
                            rows: howRows)
        }
        .task(id: FoodHistory.days(for: period)) { await load() }
    }

    private var howRows: [(String, String)] {
        var rows: [(String, String)] = [("Zdroj", L10n.tr("Tvůj jídelníček"))]
        if let history = shown {
            let last30 = history.list.suffix(30).filter(\.logged).count
            rows.append(("Zapsané dny za posledních 30", String(last30)))
            let targets = history.list.suffix(30).compactMap { value.target($0) }.filter { $0 > 0 }
            if !targets.isEmpty {
                rows.append(("Průměrný cíl", Fmt.int(targets.reduce(0, +) / Double(targets.count)) + " " + value.unit))
            }
        }
        return rows
    }

    private func load() async {
        guard history == nil else { return }
        let days = FoodHistory.days(for: period)
        guard loaded[days] == nil else { return }
        if model.demo {
            loaded[days] = FoodHistory.demo(today: food.date, target: food.target ?? 2650, days: days)
            return
        }
        do {
            loaded[days] = try await model.api.foodHistory(days: days)
            failed = false
        } catch {
            failed = loaded.isEmpty
        }
    }

    // MARK: Dial

    @ViewBuilder private var dial: some View {
        let now = value.today(food)
        VStack(spacing: 12) {
            // The label adds the time window the title does not say.
            Text(verbatim: L10n.tr(isToday ? "Snězeno dnes, zatím" : "Snězeno")).font(Typo.body).foregroundStyle(Palette.muted)
            if let target = now.target, target > 0 {
                let over = FoodHero.over(eaten: now.eaten, target: target)
                RangeDial(value: min(now.eaten, target), scale: 0...target, fill: true,
                          ends: ("0", Fmt.int(target)), size: 220,
                          spoken: [L10n.tr(value.title), Fmt.int(now.eaten) + " " + value.unit, L10n.f("z %@", Fmt.int(target) + " " + value.unit)].joined(separator: ", ")) {
                    VStack(spacing: 4) {
                        Text(verbatim: Fmt.int(now.eaten)).font(Typo.number(56)).foregroundStyle(Palette.ink)
                        if over >= 1 {
                            // Only the calories turn red, as on Food; the macros stay calm.
                            Text(verbatim: L10n.f("%@ navíc", Fmt.int(over) + " " + value.unit)).font(Typo.small.weight(.semibold))
                                .foregroundStyle(value == .calories ? Palette.red : Palette.muted)
                        } else {
                            Text(verbatim: L10n.f("zbývá %@", Fmt.int(target.rounded() - now.eaten.rounded()) + " " + value.unit)).font(Typo.small).foregroundStyle(Palette.ink)
                        }
                    }
                }
                if value == .calories, let parts = food.targetParts, parts.workouts > 0 || parts.planned > 0 {
                    HStack(spacing: 16) {
                        if parts.workouts > 0 { legend(AnyView(Circle().fill(Palette.green)), "Tréninky", "+" + Fmt.int(parts.workouts)) }
                        if parts.planned > 0 { legend(AnyView(Circle().strokeBorder(Palette.amber, lineWidth: 1.5)), "Naplánováno", "+" + Fmt.int(parts.planned)) }
                    }
                    .font(Typo.caption)
                }
            } else {
                Text(verbatim: Fmt.int(now.eaten) + " " + value.unit).font(Typo.number(56)).foregroundStyle(Palette.ink)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func legend(_ dot: AnyView, _ title: String, _ text: String) -> some View {
        HStack(spacing: 5) {
            dot.frame(width: 7, height: 7)
            Text(verbatim: L10n.tr(title)).foregroundStyle(Palette.muted)
            Text(verbatim: text).fontWeight(.semibold).foregroundStyle(Palette.ink)
        }
    }

    // MARK: History

    /// The finished logged days: today is still being eaten, so it stays out of
    /// the chart, the days against the target and the trend (the dial shows it).
    private func points(_ history: FoodHistory) -> [ChartPoint] {
        history.list.compactMap { day in
            guard day.logged, day.date < history.today, let eaten = value.eaten(day) else { return nil }
            return ChartPoint(date: day.date, value: eaten)
        }
    }

    @ViewBuilder private func historySections(_ history: FoodHistory) -> some View {
        let list = points(history)
        Card {
            DetailChart(points: list, today: history.today, period: $period, unit: value.unit,
                        color: value == .calories ? Palette.green : value.color,
                        note: "Každá tečka je jeden zapsaný den. Mezera je den bez zápisu.")
        }

        let count = TargetDays.count(history.list.suffix(FoodHistory.days(for: period)).filter { $0.date < history.today }, value: value)
        if count.total > 0 {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L10n.f("Proti cíli, %@", L10n.plural("%lld zapsaných dní", count.total)))
                Card {
                    // At target first, the one in green (concept 087).
                    targetRow("V cíli", count.at, of: count.total, color: Palette.green)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    targetRow("Nad cílem", count.over, of: count.total)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    targetRow("Výrazně pod cílem", count.below, of: count.total)
                }
                Text(verbatim: L10n.tr("Nad cílem už od první jednotky navíc. Výrazně pod cílem znamená o víc než 8 % méně než cíl toho dne."))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        } else {
            Card { LearningState(kind: .missing, text: L10n.tr("Zatím žádný zapsaný den s cílem. Zapiš jídlo a dny se tu začnou počítat.")) }
        }

        let rows = TrendMath.rows(list, today: history.today, lags: period == .days30 ? TrendLags.month : TrendLags.year)
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Analýza trendu")
                Card { TrendTable(rows: rows, unit: value.unit, color: value == .calories ? Palette.green : value.color) }
            }
        }
    }

    private func targetRow(_ title: String, _ days: Int, of total: Int, color: Color = Palette.ink) -> some View {
        let share = Double(days) / Double(max(total, 1))
        return HStack(spacing: 12) {
            Text(verbatim: L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink).frame(maxWidth: .infinity, alignment: .leading)
            Text(verbatim: L10n.plural("%lld dní", days)).font(Typo.caption).foregroundStyle(Palette.muted)
            ProgressLine(fraction: share, color: color, height: 4).frame(width: 64)
            Text(verbatim: Fmt.int(share * 100) + Fmt.percentSign).font(Typo.number(20)).foregroundStyle(Palette.ink)
                .frame(minWidth: 44, alignment: .trailing)
        }
        .frame(minHeight: 36)
        .accessibilityElement(children: .combine)
    }
}

/// "Where today's target comes from": the base line by line, each workout
/// done and planned, and the target as an estimate. No decorative icons;
/// a workout keeps its sport's colour.
struct TargetSourceCard: View {
    let parts: FoodSnapshot.TargetParts
    let target: Double
    let isToday: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: isToday ? "Z čeho je dnešní cíl" : "Z čeho byl cíl dne")
            Card {
                if let lines = parts.lines {
                    row("Klidový výdej", sub: "co tělo spálí v klidu", Fmt.int(lines.restingBurn))
                    if lines.movement > 0 { divider; row("Běžný pohyb", sub: "kroky a běžný den", Fmt.signed(lines.movement)) }
                    if lines.goal != 0 { divider; row("Cíl hmotnosti", sub: nil, Fmt.signed(lines.goal)) }
                    if lines.minimum > 0 { divider; row("Dorovnání na klidový metabolismus", sub: nil, Fmt.signed(lines.minimum)) }
                    if lines.moreActive > 0 { divider; row("Aktivnější den", sub: nil, Fmt.signed(lines.moreActive)) }
                } else {
                    row("Základ", sub: nil, Fmt.int(parts.base))
                }
                ForEach(Array((parts.items ?? []).enumerated()), id: \.offset) { _, item in
                    divider
                    workout(item)
                }
                Rectangle().fill(Palette.ink.opacity(0.35)).frame(height: 1)
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: L10n.tr(isToday ? "Dnešní cíl" : "Cíl dne")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: L10n.tr("odhad")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Text(verbatim: Fmt.int(target)).font(Typo.number(30)).foregroundStyle(Palette.ink)
                    Text(verbatim: "kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                }
                .accessibilityElement(children: .combine)
            }
            Text(verbatim: L10n.f("Tréninky se počítají ze %@ %% toho, co spálí. Klidový výdej se odhaduje z tvé váhy, výšky a věku.", Fmt.int((parts.coverage ?? 0.7) * 100)))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var divider: some View { Rectangle().fill(Palette.hairline).frame(height: 1) }

    private func row(_ title: String, sub: String?, _ value: String) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink)
                if let sub { Text(verbatim: L10n.tr(sub)).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            Text(verbatim: value).font(Typo.number(24)).foregroundStyle(Palette.ink)
        }
        .accessibilityElement(children: .combine)
    }

    private func workout(_ item: FoodSnapshot.TargetParts.Item) -> some View {
        let planned = item.kind == "planned"
        let kcal = planned ? L10n.f("asi %@ kcal", Fmt.int(item.kcal)) : Fmt.int(item.kcal) + " kcal"
        let detail = [item.minutes.flatMap { $0 > 0 ? Fmt.duration(Int($0.rounded())) : nil }, planned ? L10n.tr("naplánováno") : nil, kcal].compactMap { $0 }
        return HStack(alignment: .center, spacing: 10) {
            Circle().fill(Palette.Sport.color(item.type ?? "")).frame(width: 10, height: 10).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: item.name ?? L10n.tr(planned ? "Plánovaný trénink" : "Odcvičený trénink"))
                    .font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
                Text(verbatim: detail.joined(separator: ", ")).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(verbatim: Fmt.signed(item.counted)).font(Typo.number(24)).foregroundStyle(Palette.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Food → a tap on the month (redesign J, concept a-jidlo/001): the Z2 month
/// with Calories, Carbs, Protein and Fat; each day a ring of what was eaten
/// out of that day's target, red past it (from the first unit over), dashed
/// on a day without food logged. A tap on a day opens it on Food.
struct FoodMonthSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The day Food shows.
    let date: String
    @State private var month: String
    @State private var history: FoodHistory?
    @AppStorage("foodMonthValue") private var valueRaw = FoodValue.calories.rawValue

    init(date: String) {
        self.date = date
        _month = State(initialValue: ISODay.monthStart(date))
    }

    private var today: String { AppModel.localDate(Date()) }
    private var value: FoodValue { FoodValue(rawValue: valueRaw) ?? .calories }
    /// The server keeps 90 days for this sheet: back to that month.
    private var firstMonth: String { ISODay.monthStart(ISODay.shift(today, -89)) }
    private var days: [String: FoodHistory.Day] {
        Dictionary((history?.list ?? []).map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Zobrazit", selection: $valueRaw) {
                        ForEach(FoodValue.allCases, id: \.rawValue) { Text(L10n.tr($0.title)).tag($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    if let summary {
                        Text(verbatim: summary).font(Typo.heading(22, relativeTo: .title3)).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Card {
                        MonthCalendar(month: month, today: today, selected: date,
                                      pick: { day in
                                          dismiss()
                                          Task { await model.showDate(day) }
                                      },
                                      move: move,
                                      spoken: { spoken($0) }) { day in
                            FoodDayRing(day: days[day], value: value, future: day > today)
                        }
                    }
                    Text(verbatim: L10n.tr("Kroužek je, kolik jsi ten den snědl z cíle. Červený je nad cílem kalorií, šedý je den bez cíle, čárkovaný je den bez zapsaného jídla."))
                        .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 32)
            }
            .background { Palette.background.ignoresSafeArea() }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.large])
        .task { await load() }
    }

    private func move(_ by: Int) {
        let next = ISODay.addMonths(month, by)
        guard next >= firstMonth, next <= ISODay.monthStart(today) else { return }
        withAnimation(.snappy(duration: 0.25)) { month = next }
    }

    private func load() async {
        if model.demo {
            history = FoodHistory.demo(today: today, target: model.food?.target ?? 2650, days: 90)
            return
        }
        history = try? await model.api.foodHistory(days: 90)
    }

    /// The month in one sentence (concept a-jidlo/001): the average over the
    /// finished logged days, then calories at the target and over, or a
    /// macro's target met on how many days; days without a kept target only
    /// count in the average.
    private var summary: String? {
        let list = ISODay.range(month, min(ISODay.monthEnd(month), today)).compactMap { days[$0] }.filter(\.logged)
        guard history != nil else { return nil }
        guard !list.isEmpty else { return L10n.tr("Tento měsíc zatím bez zapsaného jídla.") }
        // Today is still being eaten: the average and the counts are of finished days.
        let done = list.filter { $0.date < today }
        guard !done.isEmpty else { return L10n.tr("Tento měsíc zatím bez zapsaného jídla.") }
        let eaten = done.compactMap { value.eaten($0) }
        let mean = eaten.reduce(0, +) / Double(max(eaten.count, 1))
        let count = TargetDays.count(done, value: value)
        let average = L10n.f("Průměr %@ za celé dny.", Fmt.int(mean) + " " + value.unit)
        guard count.total > 0 else { return average }
        if value != .calories {
            // Over is no failure for a macro: met is anything not well below.
            return average + " " + L10n.f(value.metFormat, Int64(count.at + count.over), Int64(count.total))
        }
        var text = average + " " + L10n.plural("%lld dní v cíli", count.at) + ", " + L10n.plural("%lld nad ním", count.over)
        if count.below > 0 { text += ", " + L10n.plural("%lld výrazně pod ním", count.below) }
        return text + "."
    }

    private func spoken(_ day: String) -> String? {
        guard day <= today else { return nil }
        guard let d = days[day], d.logged, let eaten = value.eaten(d) else { return L10n.tr("bez zapsaného jídla") }
        let target = value.target(d)
        var text = Fmt.int(eaten) + " " + value.unit
        if let target, target > 0 { text += ", " + L10n.f("z %@", Fmt.int(target) + " " + value.unit) }
        if let target, FoodHero.over(eaten: eaten, target: target) >= 1 { text += ", " + L10n.tr("nad cílem") }
        return text
    }
}

/// One day's ring under its number: eaten out of the target, red over the
/// calorie target (more protein, carbs or fat is no failure), a full grey ring
/// on a logged day without a kept target, dashed without a log, nothing for
/// days ahead.
struct FoodDayRing: View {
    let day: FoodHistory.Day?
    let value: FoodValue
    var future = false

    var body: some View {
        ZStack {
            if future {
                Color.clear
            } else if let day, day.logged, let eaten = value.eaten(day) {
                let target = value.target(day) ?? 0
                let over = value == .calories && target > 0 && FoodHero.over(eaten: eaten, target: target) >= 1
                Circle().stroke(Palette.track, lineWidth: 3)
                if target > 0 {
                    Circle().trim(from: 0, to: min(eaten / target, 1))
                        .stroke(over ? Palette.red : Palette.green, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                } else {
                    Circle().stroke(Palette.muted, lineWidth: 3)
                }
            } else {
                Circle().stroke(Palette.faint, style: StrokeStyle(lineWidth: 1.2, dash: [2, 3]))
            }
        }
        .frame(width: 16, height: 16)
    }
}
