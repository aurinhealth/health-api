import SwiftUI

struct FoodView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.tabActions) private var actions
    @State private var adding: AddFoodTarget?
    @State private var scanning = false

    var body: some View {
        NavigationStack(path: model.path(.food)) {
            screen
                .navBarVisibility(.hidden)
                .appRoutes()
                .tabRoot(.food)
        }
        .task { await model.refreshIfStale(.food) }
        .sheet(item: $adding) { target in AddFoodSheet(meal: target.meal) }
        .fullScreenCover(isPresented: $scanning) { BarcodeScanSheet(meal: MealSlot.now(slots: model.food?.mealSlots)) }
    }

    private var screen: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            if let food = model.food {
                PageScroll {
                    FoodContent(food: food, add: { adding = AddFoodTarget(meal: $0) }, scan: { scanning = true })
                        .padding(.bottom, 100)
                }
                .refreshable { await model.refreshFood() }
                .tabTopBar {
                    DayBar(date: model.headerDay(food.date), ahead: true)
                    Spacer(minLength: 0)
                    HeaderCapsule(coach: actions.coach, settings: actions.settings) {
                        HeaderIcon(systemImage: "barcode.viewfinder", label: "Skenovat čárový kód") { scanning = true }
                    }
                }
            } else if let message = model.foodError {
                VStack(spacing: 16) {
                    Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                    Button("Zkusit znovu") { Task { await model.refreshFood() } }.font(Typo.bodyStrong)
                }
                .padding(32)
            } else {
                ProgressView()
            }
        }
    }
}

struct AddFoodTarget: Identifiable {
    let meal: String
    var id: String { meal }
}

enum MealSlot {
    /// Every meal a day can have, in its order (src/app-food.js MEALS).
    struct Slot: Identifiable {
        let id: String
        let label: String
    }

    static let all: [Slot] = [
        Slot(id: "breakfast", label: "Snídaně"), Slot(id: "snack_am", label: "Dopolední svačina"), Slot(id: "lunch", label: "Oběd"),
        Slot(id: "snack_pm", label: "Odpolední svačina"), Slot(id: "dinner", label: "Večeře"), Slot(id: "snack_late", label: "Druhá večeře")
    ]
    static let usual = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"]
    static let labels = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0.label) })

    /// The meal for the time of day, as the server sorts entries (app-food.js
    /// mealOf): late in the evening the second dinner, when the day has one.
    static func now(_ date: Date = Date(), slots: [String]? = nil) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let t = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        let chosen = slots ?? usual
        if t >= 1230, chosen.contains("snack_late") { return "snack_late" }
        let type = t < 600 ? "breakfast" : t < 690 ? "snack_am" : t < 870 ? "lunch" : t < 1050 ? "snack_pm" : "dinner"
        if chosen.contains(type) { return type }
        // A meal the day has not got: the nearest one it has.
        let order = all.map(\.id)
        let at = order.firstIndex(of: type) ?? 0
        return chosen.min { abs((order.firstIndex(of: $0) ?? 0) - at) < abs((order.firstIndex(of: $1) ?? 0) - at) } ?? type
    }

    /// "ke svačině", "k obědu": the end of "Přidat …".
    static func toMeal(_ type: String) -> String {
        switch type {
        case "breakfast": return "ke snídani"
        case "lunch": return "k obědu"
        case "dinner": return "k večeři"
        case "snack_late": return "k druhé večeři"
        default: return "ke svačině"
        }
    }

    /// "Přidat ke snídani" in the app's language.
    static func addText(_ type: String) -> String {
        L10n.tr("Přidat " + toMeal(type))
    }
}

/// The Food screen without the scroll view, so tests can render it whole.
struct FoodContent: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var page
    let food: FoodSnapshot
    var add: (String) -> Void = { _ in }
    /// The coach card's row (concept 02-jidlo/000, point 4): the next meal still
    /// empty with what is left for it, and "+ Add". The server gives a meal's
    /// suggestion only while it is still ahead.
    /// Settings → Coach on screens → Food off: no card, so no row either (the row alone would bring the card back).
    @AppStorage(CoachTextPlaces.shownKey("food")) private var coachShown = true
    private var nextMeal: FoodSnapshot.Meal? {
        food.meals.first { $0.entries.isEmpty && ($0.suggestion?.kcal ?? 0) > 0 }
    }
    var scan: () -> Void = {}
    @Environment(\.tabActions) private var actions
    @State private var editing = false
    /// The month with a ring a day (redesign J, a-jidlo/001).
    @State private var showMonth = false
    /// "Přidat" on a food that AI found after "Co přidáme?" closed.
    @State private var adding: PendingFood?
    @Environment(\.wideLayout) private var wide

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The same top as Dnes (TabHeader), with the barcode; the week reaches
            // two weeks ahead. Both stay put while the day below is swiped; a
            // day drawn beside has none.
            if page == nil && !editing {
                VStack(alignment: .leading, spacing: 0) {
                    TabHeader(date: model.headerDay(food.date), month: { showMonth = true }, coach: actions.coach, settings: actions.settings) {
                        HeaderIcon(systemImage: "barcode.viewfinder", label: "Skenovat čárový kód", action: scan)
                    }
                    WeekStrip(date: model.headerDay(food.date), ahead: true).padding(.top, 14)
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
            }
            VStack(alignment: .leading, spacing: 0) {
                if editing {
                    board
                } else {
                    content
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, editing ? 16 : 0)
            .daySwipe(date: food.date, ahead: true, enabled: !editing) { page in page.food.map { AnyView(FoodContent(food: $0)) } }
        }
        .sheet(isPresented: $showMonth) { FoodMonthSheet(date: food.date) }
    }

    private var board: some View {
        WidgetBoard(panel: .food,
                    data: WidgetData(panel: .food, today: page.map(\.today) ?? model.today, health: page.map(\.health) ?? model.health, training: model.training, food: food),
                    editing: $editing,
                    editTitle: "Upravit přehled")
    }

    @ViewBuilder private var content: some View {
        let today = AppModel.localDate(Date())
        // A wide window: the day's numbers and the coach on the left, the meals and drinks on the right.
        WideColumns {
            FoodHero(food: food, setTarget: actions.settings)
                .padding(.top, 22)
            // The macros in one card with "All nutrients" (and the Pro nutrients pinned under them).
            if food.target != nil || (food.kcal ?? 0) > 0 {
                VStack(alignment: .leading, spacing: 0) {
                    MacroCells(macros: food.macros)
                    ForEach(food.nutrients ?? []) { item in
                        NutrientRow(item: item).padding(.bottom, 8)
                    }
                    NavigationLink { NutrientsView(date: food.date) } label: {
                        VStack(spacing: 0) {
                            Rectangle().fill(Palette.hairline).frame(height: 1)
                            HStack {
                                Text("Všechny živiny").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                                Spacer()
                                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                            }
                            .frame(minHeight: 48)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .cardSurface(cornerRadius: 22)
                .padding(.top, 20)
            }

            // The coach: today and the days ahead; a day gone by shows only its data.
            let day = page.map(\.selectedDate) ?? model.selectedDate
            if day.map({ $0 > today }) ?? true {
                CoachTextCard(screen: "food", fallbackText: food.target == nil ? L10n.tr("Zapiš první jídlo a pomůžu ti s energií na trénink.") : food.sentence,
                              live: day == nil, tip: day == nil && coachShown ? nextMeal.map { meal in AnyView(NextMealRow(meal: meal, add: { add($0.type) })) } : nil)
                    .padding(.top, 14)
            }
        } right: {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Jídla")
                Spacer()
                NavigationLink { MealSlotsSettingsView(title: "Časy jídel") } label: {
                    Text("Časy jídel").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, wide ? 22 : 24)
            .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(Array(food.meals.enumerated()), id: \.element.id) { index, meal in
                    MealRow(meal: meal, showTargets: food.target != nil, add: { add(meal.type) })
                    pendingRows(pending.filter { $0.meal == meal.type })
                    if index < food.meals.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                }
                // A meal the day has no row for.
                pendingRows(pending.filter { item in !food.meals.contains { $0.type == item.meal } })
                if food.meals.isEmpty {
                    Text("Zatím nic. Přidej první jídlo dne.").font(Typo.small).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
            .cardSurface(cornerRadius: 22)
            .sheet(item: $adding) { item in AddFoodSheet(meal: item.meal, pending: item) }

            // Also on a day gone by: it is added to the day shown (D-JIDLO-5).
            Button { add(food.date == today ? MealSlot.now(slots: food.mealSlots) : (food.mealSlots?.last ?? "dinner")) } label: {
                Label("Přidat jídlo", systemImage: "plus")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.track, in: Capsule())
                    .overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .padding(.top, 14)

            // The drinks and anything added under Edit overview.
            board.environment(\.wideLayout, false).padding(.top, 24)
        }
    }
}

/// Carbs, protein and fat in three columns (redesign J): the signature
/// colours, "177 g", a bar and "of 330 g". Past a target the bar runs on in a
/// lighter shade and the line reads "14 over 287 g", calmly: only the total
/// kcal turns red (Petr 2026-11-12).
struct MacroCells: View {
    let macros: FoodSnapshot.Macros

    var body: some View {
        HStack(spacing: 0) {
            // Keto: net carbs against a limit (src/diet.js).
            cell(macros.carbs.net == true ? "Čisté sacharidy" : "Sacharidy", macros.carbs, Palette.carbs, first: true)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Bílkoviny", macros.protein, Palette.protein)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Tuky", macros.fat, Palette.fat)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// "of 330 g", "of max 66 g", "14 over 287 g".
    static func caption(eaten: Double, target: Double?, limit: Bool) -> String {
        guard let target else { return "" }
        let over = eaten.rounded() - target.rounded()
        if over >= 1 { return L10n.f("%@ navíc z %@ g", Fmt.int(over), Fmt.int(target)) }
        return L10n.f(limit ? "z max %@ g" : "z %@ g", Fmt.int(target))
    }

    private func cell(_ title: String, _ amount: FoodSnapshot.Amount, _ color: Color, first: Bool = false) -> some View {
        let limit = amount.limit == true
        let eaten = amount.eaten ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(verbatim: Fmt.int(eaten)).font(Typo.number(30)).foregroundStyle(Palette.ink)
                Text(verbatim: "g").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            OverBar(eaten: eaten, target: amount.target, color: color, height: 4)
                // A limit ends in a tick.
                .overlay(alignment: .trailing) {
                    if limit, eaten <= (amount.target ?? 0) { Rectangle().fill(Palette.ink).frame(width: 2, height: 9) }
                }
            Text(verbatim: Self.caption(eaten: eaten, target: amount.target, limit: limit))
                .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.vertical, 16)
        .padding(.leading, first ? 0 : 14)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(title) + " " + Fmt.int(eaten) + " g, " + Self.caption(eaten: eaten, target: amount.target, limit: limit))
    }
}

/// A bar against a target; past it the target is the bar's first part and the
/// rest runs on in a lighter shade of the same colour, never red.
struct OverBar: View {
    let eaten: Double
    let target: Double?
    let color: Color
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            let w = Double(geo.size.width)
            let t = max(target ?? 0, 0)
            if t > 0, eaten > t {
                HStack(spacing: 2) {
                    Capsule().fill(color).frame(width: max(w * t / eaten - 2, 0))
                    Capsule().fill(color.opacity(0.4))
                }
            } else {
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(color).frame(width: w * (t > 0 ? min(eaten / t, 1) : 0))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// "Vláknina 12 / 30 g" under the macros; sugar against its limit ("nejvýš 66 g").
struct FiberRow: View {
    var title = "Vláknina"
    let amount: FoodSnapshot.Amount
    var color: Color = Palette.green
    var limit = false

    init(title: String = "Vláknina", amount: FoodSnapshot.Amount, color: Color = Palette.green, limit: Bool = false) {
        self.title = title
        self.amount = amount
        self.color = color
        self.limit = limit
    }

    init(fiber: FoodSnapshot.Amount) {
        self.init(amount: fiber)
    }

    /// "12 / 30 g", or "41 / max 66 g" for a limit.
    static func text(eaten: Double, target: Double?, limit: Bool) -> String {
        guard let target else { return Fmt.int(eaten) + " g" }
        let separator = limit ? " / max " : " / "
        return Fmt.int(eaten) + separator + Fmt.int(target) + " g"
    }

    var body: some View {
        let eaten = amount.eaten ?? 0, target = amount.target ?? 30
        let over = limit && eaten > target
        HStack(spacing: 12) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 70, alignment: .leading)
            ProgressLine(fraction: eaten / max(target, 1), color: over ? Palette.rust : color, height: 3)
            Text(Self.text(eaten: eaten, target: amount.target, limit: limit))
                .font(Typo.number(16)).foregroundStyle(over ? Palette.rust : Palette.ink).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Pití: how much the drinks hydrate (coffee, beer… count less than water),
/// water at one tap and any other drink. A tap on the glass adds the first
/// favourite drink (with a way back), a tap on the number opens Pití dnes.
struct DrinksCard: View {
    @Environment(AppModel.self) private var model
    let water: FoodSnapshot.Water
    var size: WidgetSize = .medium
    /// The panel the card is on: on Jídlo the figure moves now and then, elsewhere once.
    var panel: WidgetPanel = .food
    /// On a panel (not while editing or in the gallery): the figure may move on its own.
    var live = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var other = false
    @State private var choosing = false
    @State private var pop = false
    /// The drink the glass just added, for "Vrátit".
    @State private var added: (id: Int?, text: String)?
    @State private var adds = 0
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @AppStorage(DrinkFigureKind.storageKey) private var figureRaw = DrinkFigureKind.fallback.rawValue
    @AppStorage(DrinkFigureKind.animateKey) private var animate = true

    private var figure: DrinkFigureKind { DrinkFigureKind.from(figureRaw) }

    private var idle: DrinkFigureIdle {
        if !live || !animate { return .off }
        return panel == .food ? .fidget : .once
    }

    /// The card's tab is open with nothing pushed over it (hidden tabs stay built).
    private var shown: Bool {
        let tab = panel.tab
        if model.tab != tab { return false }
        return model.paths[tab]?.isEmpty ?? true
    }
    private var target: Double { max(water.target ?? 2500, 1) }
    private var fraction: Double { (water.ml ?? 0) / target }
    private var reached: Bool { fraction >= 1 }

    /// "ještě 1,3 l do cíle", "cíl splněn".
    static func remaining(ml: Double, target: Double) -> String {
        ml >= target ? L10n.tr("cíl splněn") : L10n.f("ještě %@ do cíle", litres(target - ml))
    }

    /// "1,3 l", or "44 fl oz" in imperial units.
    static func litres(_ ml: Double) -> String {
        Units.imperial ? Fmt.int(Units.volume(ml)) + " " + Units.volumeUnit : Fmt.decimal(ml / 1000) + (L10n.isEnglish ? " L" : " l")
    }

    /// The big number: litres, or fluid ounces in imperial units.
    private static func bigNumber(_ ml: Double) -> String {
        Units.imperial ? Fmt.int(Units.volume(ml)) : Fmt.decimal(ml / 1000)
    }

    private func amount(_ size: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(Self.bigNumber(water.ml ?? 0)).font(Typo.number(size)).foregroundStyle(Palette.ink)
            Text("/ " + Self.litres(target)).font(Typo.number(size / 2)).foregroundStyle(Palette.faint)
        }
    }

    @ViewBuilder private var drunkNote: some View {
        if let drunk = water.drunkMl, abs(drunk - (water.ml ?? 0)) >= 20 {
            Text(L10n.f("vypito %@", Self.litres(drunk))).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    var body: some View {
        if size == .small { compact } else { full }
    }

    /// The small widget: how much of the day's goal, without the buttons.
    private var compact: some View {
        Card {
            WidgetHeader(title: "Pití", color: Palette.blue)
            VStack(alignment: .leading, spacing: 4) {
                amount(30)
                Text(Fmt.int(fraction * 100) + Fmt.percentSign).font(.footnote.weight(.semibold)).foregroundStyle(Palette.blue)
            }
            ProgressLine(fraction: fraction, color: Palette.blue, height: 5)
        }
    }

    /// "1.5 of 2.6 L" over "1.1 L to go" (redesign J).
    private var amountText: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: Self.bigNumber(water.ml ?? 0)).font(Typo.number(44)).foregroundStyle(Palette.ink)
                Text(verbatim: L10n.f("z %@", Self.litres(target))).font(Typo.small).foregroundStyle(Palette.muted)
            }
            Text(verbatim: Self.remaining(ml: water.ml ?? 0, target: target)).font(Typo.small).foregroundStyle(Palette.muted)
            drunkNote
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var addButton: some View {
        Button { other = true } label: {
            Image(systemName: "plus").scaledFont(15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44)
                .background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Přidat pití")
    }

    /// On Food the card sits under its own section label, as in the concept;
    /// on another tab it carries its widget header.
    private var full: some View {
        VStack(alignment: .leading, spacing: 10) {
            if panel == .food { SectionLabel(text: "Pití").padding(.horizontal, 4) }
            fullCard
        }
    }

    private var fullCard: some View {
        Card {
            if panel != .food { WidgetHeader(title: "Pití a hydratace", color: Palette.blue) }
            HStack(alignment: .top, spacing: 14) {
                if figure == .line {
                    NavigationLink { DrinkHistoryView() } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            amountText
                            ProgressLine(fraction: fraction, color: Palette.blue, height: 5)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Otevře dnešní pití")
                } else {
                    DrinkFigure(kind: figure, fraction: fraction, size: 96, animate: animate, idle: idle, shown: shown)
                        .scaleEffect(pop ? 1.12 : 1)
                        .contentShape(Rectangle())
                        .onTapGesture { Task { await quickAdd() } }
                        .onLongPressGesture { choosing = true }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(quickLabel)
                        .accessibilityAction { Task { await quickAdd() } }
                        .accessibilityAction(named: "Vybrat postavičku") { choosing = true }
                    NavigationLink { DrinkHistoryView() } label: { amountText.padding(.top, 14) }
                        .buttonStyle(.plain)
                        .accessibilityHint("Otevře dnešní pití")
                }
                addButton
            }
            if let added {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark").scaledFont(14, weight: .bold).foregroundStyle(Palette.blue)
                    Text(added.text).font(Typo.small).foregroundStyle(Palette.ink)
                    Spacer(minLength: 6)
                    if let id = added.id {
                        Button("Vrátit") {
                            withAnimation(.easeOut(duration: 0.2)) { self.added = nil }
                            Task { _ = await model.deleteDrink(id: id) }
                        }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.blue)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(Palette.blue.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
            // Horko: today's ride or run outdoors on a hot day (src/heat-advice.js); the goal stays as it is.
            if let heat = water.heat { HeatLine(text: heat, compact: true) }
            DrinkPresetRow(add: { ml, kind in await model.addDrink(ml: ml, kind: kind) })
        }
        .sensoryFeedback(.impact(weight: .light), trigger: adds)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.6), value: water.ml)
        .onChange(of: reached) { _, now in
            // The lively figures jump themselves at the goal.
            guard now, animate, !reduceMotion, !figure.lively else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) { pop = true }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.35)) { pop = false }
        }
        .sensoryFeedback(.success, trigger: reached) { _, now in now }
        .sheet(isPresented: $choosing) {
            NavigationStack {
                PageScroll { DrinkFigurePicker().padding(20) }
                    .background { Palette.settingsBackground.ignoresSafeArea() }
                    .navigationTitle("Postavička pití")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { choosing = false } } }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $other) { DrinkSheet { ml, kind in _ = await model.addDrink(ml: ml, kind: kind) } }
    }

    /// What the glass adds: the first favourite drink in its usual glass.
    private var quick: DrinkPreset? { DrinkPrefs.presets(favorites: DrinkPrefs.list(favorites)).first }

    private var quickLabel: String {
        guard let q = quick else { return L10n.tr("Přidat pití") }
        return L10n.f("Přidat %@ %@", L10n.tr(DrinkKind.find(q.kind)?.label ?? q.kind).lowercased(with: L10n.locale), Units.volumeText(Double(q.ml)))
    }

    private func quickAdd() async {
        guard let q = quick else { other = true; return }
        let before = Set((model.food?.water.drinks ?? []).map(\.id))
        guard await model.addDrink(ml: q.ml, kind: q.kind) else { return }
        adds += 1
        let id = (model.food?.water.drinks ?? []).first { !before.contains($0.id) && $0.kind == q.kind }?.id
        let text = L10n.f("Přidáno: %@ %@", L10n.tr(DrinkKind.find(q.kind)?.label ?? q.kind).lowercased(with: L10n.locale), Units.volumeText(Double(q.ml)))
        withAnimation(.easeOut(duration: 0.2)) { added = (id, text) }
        let shown = adds
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        if adds == shown { withAnimation(.easeOut(duration: 0.2)) { added = nil } }
    }
}

/// "Káva 08:05, 200 ml → 180".
struct DrinkLine: View {
    let drink: FoodSnapshot.Drink

    var body: some View {
        let kind = DrinkKind.find(drink.kind)
        HStack(spacing: 10) {
            Image(systemName: kind?.symbol ?? "drop.fill").scaledFont(13, cap: .denseCap).foregroundStyle(Palette.blue).frame(width: 20)
            Text(kind?.label ?? drink.kind).font(Typo.small).foregroundStyle(Palette.secondary)
            if let t = drink.time { Text(ClockText.format(t)).font(Typo.tiny).foregroundStyle(Palette.faint) }
            if let app = drink.app { AppTag(name: app) }
            Spacer()
            Text(Units.volumeText(drink.ml)).font(Typo.number(16)).foregroundStyle(Palette.ink)
            if let h = drink.hydrationMl, let ml = drink.ml, abs(h - ml) >= 1 {
                Text("→ " + Fmt.int(Units.volume(h))).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}

/// One meal of the day: "Snídaně 120 / 430 kcal" and under it the carbs,
/// protein and fat against the meal's targets, each in its colour. A tap opens
/// the meal with every food's values.
extension FoodContent {
    /// The AI lookups and meal photos of this day still waiting to be added.
    private var pending: [PendingFood] { model.pendingFoods.filter { $0.day == food.date } }

    private func pendingRows(_ items: [PendingFood]) -> some View {
        ForEach(items) { item in
            PendingFoodRow(item: item, add: { adding = item }, discard: { model.removePendingFood(item.id) })
                .padding(.bottom, 12)
        }
    }
}

/// A food AI is looking up, or found, after "Co přidáme?" closed: under its
/// meal until "Přidat" (the amount screen, nothing is added on its own) or ✕.
struct PendingFoodRow: View {
    let item: PendingFood
    var add: () -> Void = {}
    var discard: () -> Void = {}

    var body: some View {
        HStack(spacing: 10) {
            switch item.state {
            case .looking:
                CoachDots(size: 6, spacing: 4)
                Text(item.query.map { L10n.f("Dohledávám „%@“…", $0) } ?? L10n.tr("AI čte fotku…"))
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                Spacer(minLength: 0)
            case .found:
                Image(systemName: "sparkles").scaledFont(14, weight: .semibold).foregroundStyle(Palette.indigo)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(detail).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 6)
                Button(action: add) {
                    Text("Přidat").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).frame(height: 32)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                closeButton
            case .missing:
                Image(systemName: "exclamationmark.circle").scaledFont(14, weight: .semibold).foregroundStyle(Palette.rust)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(item.message ?? "").font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
                Spacer(minLength: 6)
                closeButton
            }
        }
        .padding(.horizontal, 12).frame(minHeight: 52)
        .background(Palette.indigo.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Palette.indigo.opacity(0.4), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))
        }
    }

    private var closeButton: some View {
        Button(action: discard) {
            Image(systemName: "xmark").scaledFont(13, weight: .semibold).foregroundStyle(Palette.muted)
                .frame(width: 32, height: 32).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Zahodit")
    }

    /// "265 kcal, 100 g, dohledáno AI", or a photo's foods and their kcal.
    private var detail: String {
        if !item.items.isEmpty {
            let kcal = item.items.compactMap { $0.product.kcal(for: $0.amount) }.reduce(0, +)
            return L10n.plural("%lld položek na fotce", item.items.count) + ", " + Fmt.int(kcal) + " kcal"
        }
        guard let product = item.product else { return "" }
        let kcal = product.kcal(for: product.defaultAmount).map { Fmt.int($0) + " kcal" }
        let amount = product.perPortion ? L10n.tr("1 porce") : Fmt.int(product.defaultAmount) + " " + product.unit
        let source = item.query == nil ? L10n.tr("z fotky") : L10n.tr("dohledáno AI")
        return [kcal, amount, source].compactMap { $0 }.joined(separator: ", ")
    }
}

/// One meal of the day (redesign J): "Breakfast 07:40", its foods, "520 of
/// 600 kcal" and +, and under it the carbs, protein and fat against the meal's
/// targets in three columns. An empty meal shows its target ("630 kcal", Petr
/// 2026-11-16) and "Nothing yet". A tap opens the meal with every food.
struct MealRow: View {
    let meal: FoodSnapshot.Meal
    /// false without a day's target: only the name, the time and +.
    var showTargets = true
    var add: () -> Void = {}

    private var empty: Bool { meal.entries.isEmpty }
    private var goal: FoodSnapshot.Suggestion? { meal.target ?? meal.suggestion }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                NavigationLink { MealDetailView(type: meal.type) } label: { summary }
                    .buttonStyle(.plain)
                    .accessibilityValue(showTargets ? macrosSpoken : "")
                addButton
            }
            if showTargets {
                NavigationLink { MealDetailView(type: meal.type) } label: {
                    HStack(alignment: .top, spacing: 14) {
                        column("Sacharidy", sum(\.carbs), goal?.carbs, Palette.carbs)
                        column("Bílkoviny", sum(\.protein), goal?.protein, Palette.protein)
                        column("Tuky", sum(\.fat), goal?.fat, Palette.fat)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // One link per meal for VoiceOver: the macros are read with the summary.
                .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 14)
    }

    private var mealName: some View {
        Text(meal.label).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
    }

    private var mealTime: some View {
        Text(ClockText.format(meal.time)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).fixedSize()
    }

    private var summary: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                // The time drops under the name rather than cutting it.
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) { mealName; mealTime }
                    VStack(alignment: .leading, spacing: 1) { mealName; mealTime }
                }
                Text(empty ? L10n.tr("Zatím nic") : meal.entries.map(\.name).joined(separator: ", "))
                    .font(Typo.small).foregroundStyle(Palette.muted).lineLimit(2)
            }
            Spacer(minLength: 6)
            if empty {
                if showTargets, let goal { Text(verbatim: Fmt.int(goal.kcal) + " kcal").font(Typo.caption).foregroundStyle(Palette.muted) }
            } else {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(verbatim: Fmt.int(meal.kcal ?? 0)).font(Typo.number(26)).foregroundStyle(Palette.ink)
                    if showTargets, let goal { Text(verbatim: L10n.f("z %@ kcal", Fmt.int(goal.kcal))).font(Typo.caption).foregroundStyle(Palette.muted) }
                    else { Text(verbatim: "kcal").font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                .lineLimit(1)
            }
        }
        .contentShape(Rectangle())
    }

    private func column(_ title: String, _ eaten: Double, _ target: Double?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            OverBar(eaten: eaten, target: target, color: color, height: 3)
            (Text(verbatim: Fmt.int(eaten)).fontWeight(.semibold).foregroundColor(Palette.ink)
             + Text(verbatim: target.map { " / " + Fmt.int($0) + " g" } ?? " g").foregroundColor(Palette.muted))
                .font(Typo.caption.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "Carbs 72 / 75 g, Protein 24 / 34 g, Fat 14 / 18 g".
    private var macrosSpoken: String {
        [("Sacharidy", sum(\.carbs), goal?.carbs), ("Bílkoviny", sum(\.protein), goal?.protein), ("Tuky", sum(\.fat), goal?.fat)]
            .map { L10n.tr($0.0) + " " + FiberRow.text(eaten: $0.1, target: $0.2, limit: false) }
            .joined(separator: ", ")
    }

    private func sum(_ key: KeyPath<FoodSnapshot.Entry, Double?>) -> Double {
        meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +)
    }

    private var addButton: some View {
        Button(action: add) {
            Image(systemName: "plus").scaledFont(15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44)
                .background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(MealSlot.addText(meal.type))
    }
}

/// "Sacharidy 40 / 60 g" with a bar, for the carbs, protein and fat.
struct MacroBars: View {
    let carbs: Double
    let protein: Double
    let fat: Double
    let goal: FoodSnapshot.Suggestion?

    var body: some View {
        VStack(spacing: 5) {
            MacroBar(title: "Sacharidy", eaten: carbs, target: goal?.carbs, color: Palette.carbs)
            MacroBar(title: "Bílkoviny", eaten: protein, target: goal?.protein, color: Palette.protein)
            MacroBar(title: "Tuky", eaten: fat, target: goal?.fat, color: Palette.fat)
        }
    }
}

struct MacroBar: View {
    let title: String
    let eaten: Double
    let target: Double?
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .frame(width: 84, alignment: .leading)
            ProgressLine(fraction: eaten / max(target ?? 1, 1), color: color, height: 4)
            Text(FiberRow.text(eaten: eaten, target: target, limit: false))
                .scaledFont(12, weight: .medium, cap: .denseCap).monospacedDigit().foregroundStyle(Palette.secondary)
                .frame(width: 72, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(title) + " " + FiberRow.text(eaten: eaten, target: target, limit: false))
    }
}

/// "Afternoon snack / about 360 kcal, 45 g carbs" and "+ Add" under the coach's
/// sentence on Food (concept a-jidlo: fork icon, two lines, a dark 44 pt button).
struct NextMealRow: View {
    let meal: FoodSnapshot.Meal
    let add: (FoodSnapshot.Meal) -> Void

    private var detail: String? {
        guard let s = meal.suggestion else { return nil }
        var text = L10n.f("kolem %@ kcal", Fmt.int(s.kcal))
        if let carbs = s.carbs, carbs > 0 { text += L10n.f(", %@ g sacharidů", Fmt.int(carbs)) }
        return text
    }

    var body: some View {
        // Side by side; at the largest text sizes the button goes under the text.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { label; Spacer(minLength: 0); button }
            VStack(alignment: .leading, spacing: 10) { label; button }
        }
    }

    private var label: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "fork.knife").scaledFont(14, weight: .medium).foregroundStyle(Palette.muted)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: meal.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                if let detail { Text(verbatim: detail).font(Typo.small).foregroundStyle(Palette.muted) }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var button: some View {
        Button { add(meal) } label: {
            Label("Přidat", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                .lineLimit(1).fixedSize()
                .padding(.horizontal, 18).frame(height: 44)
                .background(Palette.button, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: MealSlot.addText(meal.type)))
    }
}
