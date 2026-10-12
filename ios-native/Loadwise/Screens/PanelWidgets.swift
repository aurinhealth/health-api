import SwiftUI

// The widgets a panel (Dnes, Zdraví, Trénink, Jídlo) shows below its fixed
// top, in the order and sizes the athlete chose in "Upravit". Every widget is
// one of the existing cards, drawn at its size.

/// Malý is half the width, Střední the full width and compact, Velký the full
/// width with a bigger chart.
enum WidgetSize: String, CaseIterable, Identifiable, Codable {
    case small, medium, large

    var id: String { rawValue }

    /// "Střední" is also a heart-rate zone ("Moderate"), so the size names
    /// are not looked up in the translations.
    var title: String {
        switch self {
        case .small: return L10n.isEnglish ? "Small" : "Malý"
        case .medium: return L10n.isEnglish ? "Medium" : "Střední"
        case .large: return L10n.isEnglish ? "Large" : "Velký"
        }
    }
}

/// The tab panels with editable widgets.
enum WidgetPanel: String {
    case today, health, training, food

    var title: String {
        switch self {
        case .today: return "Dnes"
        case .health: return "Zdraví"
        case .training: return "Trénink"
        case .food: return "Jídlo"
        }
    }

    /// The layout before the athlete changes anything: the cards the panel
    /// always had, in the same order.
    var defaults: [PlacedWidget] {
        switch self {
        case .today:
            // Today is for deciding; the measurements (HRV, resting heart rate,
            // weight) are on Health.
            return [.init(kind: .food, size: .medium), .init(kind: .plan, size: .medium), .init(kind: .steps, size: .medium)]
        case .health:
            return [.init(kind: .sleep, size: .medium), .init(kind: .sleepDebt, size: .small), .init(kind: .oxygen, size: .small),
                    .init(kind: .respiration, size: .small), .init(kind: .skinTemp, size: .small), .init(kind: .bedtime, size: .medium),
                    .init(kind: .hrv, size: .medium), .init(kind: .restingHR, size: .small),
                    .init(kind: .weight, size: .medium), .init(kind: .bodyFat, size: .medium), .init(kind: .muscle, size: .medium)]
        case .training:
            return [.init(kind: .form, size: .small), .init(kind: .vo2max, size: .small), .init(kind: .thisWeek, size: .medium),
                    .init(kind: .sessions, size: .medium), .init(kind: .activeCalories, size: .medium), .init(kind: .zones, size: .medium)]
        case .food:
            return [.init(kind: .drinks, size: .medium)]
        }
    }

    /// "Doporučené" in the gallery, best first.
    var recommended: [WidgetKind] {
        switch self {
        case .today: return [.sleep, .vo2max, .drinks, .form, .activeCalories, .thisWeek, .sleepDebt, .oxygen]
        case .health: return [.steps, .vo2max, .form, .drinks, .food, .activeCalories]
        case .training: return [.sleep, .hrv, .restingHR, .steps, .food, .weight]
        case .food: return [.food, .macros, .weight, .steps, .activeCalories, .sleep]
        }
    }
}

/// The gallery's sections, each a coloured tile.
enum WidgetSection: String, CaseIterable, Identifiable, Hashable {
    case health, training, food, sleep, movement, body

    var id: String { rawValue }

    var title: String {
        switch self {
        case .health: return "Zdraví"
        case .training: return "Trénink"
        case .food: return "Jídlo a pití"
        case .sleep: return "Spánek"
        case .movement: return "Pohyb"
        case .body: return "Tělo"
        }
    }

    var icon: String {
        switch self {
        case .health: return "heart"
        case .training: return "waveform.path.ecg"
        case .food: return "fork.knife"
        case .sleep: return "bed.double"
        case .movement: return "figure.walk"
        case .body: return "scalemass"
        }
    }

    var color: Color {
        switch self {
        case .health: return Palette.rust
        case .training: return Palette.amberBar
        case .food: return Palette.gold
        case .sleep: return Palette.indigo
        case .movement: return Palette.green
        case .body: return Palette.blue
        }
    }
}

/// Every widget a panel can show.
enum WidgetKind: String, CaseIterable, Identifiable {
    case restingHR, hrv, vo2max, respiration, skinTemp, oxygen
    case form, thisWeek, sessions, plan, zones
    case food, drinks, macros
    case sleep, sleepDebt, bedtime
    case steps, activeCalories
    case weight, bodyFat, muscle

    var id: String { rawValue }

    var title: String {
        switch self {
        case .restingHR: return "Klidový tep"
        case .hrv: return "HRV"
        case .vo2max: return "VO2max"
        case .respiration: return "Dech ve spánku"
        case .skinTemp: return "Teplota zápěstí"
        case .oxygen: return "Kyslík v krvi"
        case .form: return "Forma"
        case .thisWeek: return "Tento týden"
        case .sessions: return "Tréninky týdne"
        case .plan: return "Plán dne"
        case .zones: return "Aktivní minuty v zónách"
        case .food: return "Jídlo a pití"
        case .drinks: return "Pití a hydratace"
        case .macros: return "Makroživiny"
        case .sleep: return "Spánek"
        case .sleepDebt: return "Spánkový dluh"
        case .bedtime: return "Večerka a cíl spánku"
        case .steps: return "Kroky"
        case .activeCalories: return "Aktivní výdej"
        case .weight: return "Váha"
        case .bodyFat: return "Tělesný tuk"
        case .muscle: return "Svalová hmota"
        }
    }

    var section: WidgetSection {
        switch self {
        case .restingHR, .hrv, .vo2max, .respiration, .skinTemp, .oxygen: return .health
        case .form, .thisWeek, .sessions, .plan, .zones: return .training
        case .food, .drinks, .macros: return .food
        case .sleep, .sleepDebt, .bedtime: return .sleep
        case .steps, .activeCalories: return .movement
        case .weight, .bodyFat, .muscle: return .body
        }
    }

    /// The sizes the widget comes in, smallest first.
    var sizes: [WidgetSize] {
        switch self {
        case .restingHR, .hrv, .vo2max, .form, .thisWeek, .sleep, .steps, .activeCalories, .weight, .bodyFat:
            return [.small, .medium, .large]
        case .respiration, .skinTemp, .oxygen, .zones, .food, .drinks, .sleepDebt, .muscle:
            return [.small, .medium]
        case .sessions, .plan, .macros, .bedtime:
            return [.medium]
        }
    }

    var defaultSize: WidgetSize {
        switch self {
        case .restingHR, .hrv, .vo2max, .respiration, .skinTemp, .oxygen, .form, .sleepDebt, .muscle: return .small
        default: return .medium
        }
    }

    /// The tab whose data the widget shows (loaded when another panel shows it).
    var source: AppTab? {
        switch self {
        case .restingHR, .hrv, .weight, .plan, .food, .steps: return .today
        case .respiration, .skinTemp, .oxygen, .sleep, .sleepDebt, .bedtime, .bodyFat: return .health
        case .vo2max, .form, .thisWeek, .sessions, .zones, .activeCalories: return .training
        case .drinks, .macros: return .food
        case .muscle: return nil
        }
    }
}

/// One widget on a panel. A widget is on a panel at most once.
struct PlacedWidget: Hashable, Identifiable {
    let kind: WidgetKind
    var size: WidgetSize

    var id: String { kind.rawValue }
}

/// Small widgets two to a row, the others across the whole width.
struct WidgetLayoutRow: Identifiable {
    let items: [PlacedWidget]
    let half: Bool

    var id: String { items.map(\.id).joined(separator: "+") }
}

/// The panel layouts in UserDefaults: a JSON list of {kind, size} per panel.
enum WidgetLayoutStore {
    private struct Stored: Codable {
        let kind: String
        let size: String
    }

    static func key(_ panel: WidgetPanel) -> String { "widgets." + panel.rawValue }

    /// The saved layout; before the first change the panel's defaults (on
    /// Today without the cards hidden in the old "Upravit přehled").
    static func decode(_ json: String, panel: WidgetPanel) -> [PlacedWidget] {
        guard !json.isEmpty, let stored = try? JSONDecoder().decode([Stored].self, from: Data(json.utf8)) else {
            return initial(panel)
        }
        var seen = Set<WidgetKind>()
        var out: [PlacedWidget] = []
        for item in stored {
            guard let kind = WidgetKind(rawValue: item.kind), !seen.contains(kind) else { continue }
            var size = kind.defaultSize
            if let saved = WidgetSize(rawValue: item.size), kind.sizes.contains(saved) { size = saved }
            seen.insert(kind)
            out.append(PlacedWidget(kind: kind, size: size))
        }
        return out
    }

    static func encode(_ items: [PlacedWidget]) -> String {
        let stored = items.map { Stored(kind: $0.kind.rawValue, size: $0.size.rawValue) }
        guard let data = try? JSONEncoder().encode(stored) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    /// The old Today setting "todayHidden": comma-separated food, plan, steps,
    /// heart (resting heart rate and HRV) and weight.
    private static func initial(_ panel: WidgetPanel) -> [PlacedWidget] {
        guard panel == .today, let hidden = UserDefaults.standard.string(forKey: "todayHidden"), !hidden.isEmpty else {
            return panel.defaults
        }
        var removed = Set<WidgetKind>()
        for name in hidden.split(separator: ",").map(String.init) {
            switch name {
            case "food": removed.insert(.food)
            case "plan": removed.insert(.plan)
            case "steps": removed.insert(.steps)
            case "heart": removed.insert(.restingHR); removed.insert(.hrv)
            case "weight": removed.insert(.weight)
            default: break
            }
        }
        return panel.defaults.filter { !removed.contains($0.kind) }
    }

    static func rows(_ items: [PlacedWidget]) -> [WidgetLayoutRow] {
        var rows: [WidgetLayoutRow] = []
        var pending: PlacedWidget?
        for item in items {
            if item.size == .small {
                if let first = pending {
                    rows.append(WidgetLayoutRow(items: [first, item], half: true))
                    pending = nil
                } else {
                    pending = item
                }
            } else {
                if let first = pending {
                    rows.append(WidgetLayoutRow(items: [first], half: true))
                    pending = nil
                }
                rows.append(WidgetLayoutRow(items: [item], half: false))
            }
        }
        if let first = pending { rows.append(WidgetLayoutRow(items: [first], half: true)) }
        return rows
    }
}

/// What the widgets draw from: the panel's own snapshot and whatever the
/// other tabs have loaded.
struct WidgetData {
    let panel: WidgetPanel
    var today: TodaySnapshot?
    var health: HealthSnapshot?
    var training: TrainingSnapshot?
    var food: FoodSnapshot?
    /// Where the week list reports a moved or cancelled workout.
    var planToast: Binding<PlanToast?> = .constant(nil)

    func has(_ tab: AppTab) -> Bool {
        switch tab {
        case .today: return today != nil
        case .health: return health != nil
        case .training: return training != nil
        case .food: return food != nil
        }
    }

    /// Health's numbers on Zdraví, Today's elsewhere.
    var restingHR: TodaySnapshot.RestingHR? {
        let fromHealth = health?.restingHR.map { TodaySnapshot.RestingHR(value: $0.value, baseline: $0.baseline, series: $0.series.lastDays(30)) }
        return panel == .health ? (fromHealth ?? today?.restingHR) : (today?.restingHR ?? fromHealth)
    }

    var hrv: TodaySnapshot.HRV? {
        let fromHealth = health?.hrv.map { TodaySnapshot.HRV($0) }
        return panel == .health ? (fromHealth ?? today?.hrv) : (today?.hrv ?? fromHealth)
    }

    var weight: TodaySnapshot.Weight? {
        var fromHealth: TodaySnapshot.Weight?
        if let h = health, let w = h.weight {
            let from = AppModel.shift(h.date, by: -30) ?? ""
            fromHealth = TodaySnapshot.Weight(latest: w.latest, goal: w.goal, series: w.series.filter { $0.date > from })
        }
        return panel == .health ? (fromHealth ?? today?.weight) : (today?.weight ?? fromHealth)
    }

    /// The panel leaves out a widget without data (but shows it while editing).
    func hasData(_ kind: WidgetKind) -> Bool {
        switch kind {
        case .restingHR: return restingHR != nil
        case .hrv: return hrv != nil
        case .vo2max: return training?.vo2max != nil
        case .respiration: return health?.respiration != nil
        // Apple Watch's wrist temperature, else Google's skin temperature.
        case .skinTemp: return health?.wristTemp != nil || health?.skinTemp != nil
        case .oxygen: return health?.oxygen != nil
        // Shown only with data (a scale that measures muscle mass); until then
        // it waits in the widget gallery.
        case .muscle: return health?.weight?.muscle != nil
        case .form: return training?.form != nil
        case .thisWeek: return training != nil
        case .sessions: return !(training?.sessions ?? []).isEmpty
        case .plan:
            guard let t = today else { return false }
            return !t.plan.isEmpty || (t.tonight == nil && t.steps.hour != nil)
        case .zones: return training?.zones != nil
        case .food: return today != nil
        case .drinks, .macros: return food != nil
        case .sleep, .bedtime: return health != nil
        case .sleepDebt: return health?.sleep.debt != nil
        case .steps: return today != nil
        case .activeCalories: return training?.activeCalories != nil
        // Zdraví always had the weight card, with an offer to weigh in.
        case .weight: return weight != nil || panel == .health
        case .bodyFat: return health?.weight?.bodyFat != nil
        }
    }
}

/// The number, its note and a chart laid out for a widget size: small stacks
/// them, medium puts the chart beside the number, large gives the chart room.
struct SizedWidgetBody<Value: View, Chart: View>: View {
    let size: WidgetSize
    var smallChart: CGFloat = 40
    var mediumChart: CGFloat = 56
    var largeChart: CGFloat = 120
    let value: Value
    let chart: (CGFloat) -> Chart

    init(size: WidgetSize, smallChart: CGFloat = 40, mediumChart: CGFloat = 56, largeChart: CGFloat = 120,
         @ViewBuilder value: () -> Value, @ViewBuilder chart: @escaping (CGFloat) -> Chart) {
        self.size = size
        self.smallChart = smallChart
        self.mediumChart = mediumChart
        self.largeChart = largeChart
        self.value = value()
        self.chart = chart
    }

    var body: some View {
        switch size {
        case .small:
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) { value }
                chart(smallChart)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .medium:
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) { value }
                    .frame(width: 120, alignment: .leading)
                chart(mediumChart)
            }
        case .large:
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) { value }
                chart(largeChart)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// One widget drawn from the data, opening its detail when `linked`.
struct PanelWidget: View {
    let item: PlacedWidget
    let data: WidgetData
    /// On the panel a card opens its detail; while editing and in the gallery
    /// it is only a picture.
    var linked = true

    var body: some View {
        if linked, let route = route {
            RouteLink(route: route) { card }
        } else if linked, item.kind == .food, data.panel != .food {
            TabLinkCard(tab: .food) { card }
        } else {
            card
        }
    }

    private var route: AppRoute? {
        switch item.kind {
        case .restingHR, .hrv: return .heart
        case .vo2max: return .vo2max
        case .respiration, .skinTemp, .oxygen, .sleep, .sleepDebt: return .sleep
        case .bedtime: return .sleepSettings
        case .form: return .form
        case .zones: return .zones
        case .activeCalories: return .activeEnergy
        case .steps: return .steps
        case .weight, .bodyFat: return .weight
        default: return nil
        }
    }

    private var card: some View {
        Group {
            if data.hasData(item.kind) {
                content
            } else {
                WidgetPlaceholder(kind: item.kind)
            }
        }
        // A small card is half the screen wide: its number and chart stop growing sooner.
        .dynamicTypeSize(...(item.size == .small ? DynamicTypeSize.denseCap : DynamicTypeSize.screenCap))
    }

    @ViewBuilder private var content: some View {
        switch item.kind {
        case .restingHR:
            if let value = data.restingHR { RestingHRWidget(restingHR: value, size: item.size) }
        case .hrv:
            if let value = data.hrv {
                HRVWidget(hrv: value, restingHR: data.restingHR?.value, size: item.size)
            }
        case .vo2max:
            if let value = data.training?.vo2max { VO2maxWidget(vo2: value, size: item.size) }
        case .respiration:
            if let value = data.health?.respiration { RespirationWidget(respiration: value, size: item.size) }
        case .skinTemp:
            if let value = data.health?.wristTemp {
                WristTempWidget(wrist: value, size: item.size)
            } else if let value = data.health?.skinTemp {
                SkinTempWidget(skin: value, size: item.size)
            }
        case .oxygen:
            if let value = data.health?.oxygen { OxygenWidget(oxygen: value, size: item.size) }
        case .muscle:
            if let value = data.health?.weight?.muscle { MuscleWidget(muscle: value, size: item.size) }
        case .form:
            if let t = data.training, let value = t.form {
                FormWidget(form: value, loadNote: FormWidget.loadNote(acwr: t.acwr, monotony: t.monotony), size: item.size)
            }
        case .thisWeek:
            if let t = data.training { ThisWeekWidget(week: t.thisWeek, loads: t.load.weeks, size: item.size) }
        case .sessions:
            if let t = data.training, let sessions = t.sessions {
                Card {
                    WeekSessionsHeader()
                    WeekSessionsList(sessions: sessions, today: t.date, toast: data.planToast)
                }
            }
        case .plan:
            if let t = data.today { plan(t) }
        case .zones:
            if let value = data.training?.zones { ZonesWidget(zones: value, size: item.size) }
        case .food:
            if let t = data.today { FoodWidget(nutrition: t.nutrition, size: item.size) }
        case .drinks:
            if let f = data.food { DrinksCard(water: f.water, size: item.size) }
        case .macros:
            if let f = data.food {
                Card {
                    WidgetHeader(title: "Makroživiny", color: Palette.carbs)
                    MacroCells(macros: f.macros)
                }
            }
        case .sleep:
            if let h = data.health { SleepWidget(sleep: h.sleep, size: item.size) }
        case .sleepDebt:
            if let debt = data.health?.sleep.debt { SleepDebtWidget(debt: debt, size: item.size) }
        case .bedtime:
            if let h = data.health { SleepSettingsCard(tonight: h.sleep.tonight) }
        case .steps:
            if let t = data.today { StepsWidget(steps: t.steps, size: item.size) }
        case .activeCalories:
            if let value = data.training?.activeCalories { ActiveCaloriesWidget(active: value, size: item.size) }
        case .weight:
            if let value = data.weight {
                WeightWidget(weight: value, size: item.size)
            } else {
                Card {
                    WidgetHeader(title: "Váha", color: Palette.brown)
                    Text("Zatím žádné vážení. Klepni a zapiš první.").font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
        case .bodyFat:
            if let value = data.health?.weight?.bodyFat { BodyFatWidget(fat: value, size: item.size) }
        }
    }

    /// The day's plan, and on a day without an evening plan the offer to set
    /// the alarm and sleep goal.
    private func plan(_ t: TodaySnapshot) -> some View {
        VStack(spacing: 12) {
            if !t.plan.isEmpty { PlanWidget(items: t.plan, today: t.date) }
            if t.tonight == nil, t.steps.hour != nil {
                if linked {
                    RouteLink(route: .sleepSettings) { BedtimeSetupCard() }
                } else {
                    BedtimeSetupCard()
                }
            }
        }
    }
}

/// A widget whose data has not come yet (or does not exist for this athlete).
struct WidgetPlaceholder: View {
    let kind: WidgetKind

    var body: some View {
        Card {
            WidgetHeader(title: kind.title, color: kind.section.color)
            Text("–").font(Typo.number(34)).foregroundStyle(Palette.faint)
            Text("Zatím bez dat").font(Typo.caption).foregroundStyle(Palette.faint)
        }
        .accessibilityElement(children: .combine)
    }
}
