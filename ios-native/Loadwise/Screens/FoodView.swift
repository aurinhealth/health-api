import SwiftUI

struct FoodView: View {
    @Environment(AppModel.self) private var model
    @State private var adding: AddFoodTarget?
    @State private var scanning = false

    var body: some View {
        NavigationStack(path: model.path(.food)) {
            screen
                .toolbar(.hidden, for: .navigationBar)
                .appRoutes()
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
                    DayBar(date: food.date, ahead: true)
                    Spacer(minLength: 0)
                    ChromeButton(systemImage: "barcode.viewfinder", label: "Skenovat čárový kód") { scanning = true }
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
    var scan: () -> Void = {}
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if editing {
                board
            } else {
                content
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .daySwipe(date: food.date, ahead: true, enabled: !editing) { page in page.food.map { AnyView(FoodContent(food: $0)) } }
    }

    private var board: some View {
        WidgetBoard(panel: .food,
                    data: WidgetData(panel: .food, today: page.map(\.today) ?? model.today, health: page.map(\.health) ?? model.health, training: model.training, food: food),
                    editing: $editing,
                    editTitle: nil)
    }

    @ViewBuilder private var content: some View {
        HStack {
            DayNavigator(date: food.date, ahead: true)
            Spacer()
            CircleButton(systemImage: "barcode.viewfinder", label: "Skenovat čárový kód", action: scan)
        }

        HStack(alignment: .lastTextBaseline, spacing: 12) {
            Text(Fmt.int(food.kcal ?? 0)).font(Typo.number(104)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
            if let target = food.target {
                Text(L10n.f("z %@\nkcal", Fmt.int(target))).font(Typo.small).foregroundStyle(Palette.muted).lineSpacing(1)
            }
        }
        .padding(.top, 34)
        // An earlier day shows only its data; a day ahead keeps its sentence.
        let day = page.map(\.selectedDate) ?? model.selectedDate
        if day.map({ $0 > AppModel.localDate(Date()) }) ?? true {
            CoachTextCard(screen: "food", fallbackText: food.sentence, live: day == nil).padding(.top, 16)
        }

        MacroCells(macros: food.macros).padding(.top, 26)
        // Pro: the nutrients picked under Živiny → Upravit; the rest is one tap away.
        ForEach(food.nutrients ?? []) { item in
            NutrientRow(item: item).padding(.top, 8)
        }
        NavigationLink { NutrientsView(date: food.date) } label: {
            HStack(spacing: 6) {
                Text("Všechny živiny").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                Image(systemName: "chevron.right").font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted)
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 8)

        board.padding(.top, 18)

        HStack(alignment: .firstTextBaseline) {
            SectionLabel(text: "Jídla dne")
            Spacer()
            NavigationLink { MealSlotsSettingsView() } label: {
                Text("Upravit").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted)
            }
            .accessibilityLabel("Upravit jídla dne")
        }
        .padding(.top, 28)
        VStack(spacing: 0) {
            ForEach(Array(food.meals.enumerated()), id: \.element.id) { index, meal in
                MealRow(meal: meal, add: { add(meal.type) })
                if index < food.meals.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
            if food.meals.isEmpty {
                Text("Zatím nic. Přidej první jídlo dne.").font(Typo.small).foregroundStyle(Palette.muted).padding(.vertical, 14)
            }
        }
        .padding(.top, 6)

        VStack(spacing: 28) {
            Button { add(MealSlot.now(slots: food.mealSlots)) } label: {
                Label("Přidat jídlo", systemImage: "plus")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.button, in: Capsule())
            }
            WidgetEditButton { editing = true }
        }
        .padding(.top, 22)
    }
}

struct MacroCells: View {
    let macros: FoodSnapshot.Macros

    var body: some View {
        HStack(spacing: 0) {
            cell("Sacharidy", macros.carbs, Palette.carbs, first: true)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Bílkoviny", macros.protein, Palette.protein)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Tuky", macros.fat, Palette.fat)
        }
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    private func share(_ amount: FoodSnapshot.Amount) -> Double {
        guard let target = amount.target, target > 0 else { return 0 }
        return (amount.eaten ?? 0) / target
    }

    private func cell(_ title: String, _ amount: FoodSnapshot.Amount, _ color: Color, first: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(Fmt.int(amount.eaten ?? 0)).font(Typo.number(28)).foregroundStyle(Palette.ink)
                if let target = amount.target { Text("/ " + Fmt.int(target) + " g").font(Typo.number(15)).foregroundStyle(Palette.faint) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            ProgressLine(fraction: share(amount), color: color, height: 3)
                .padding(.trailing, 14)
        }
        .padding(.vertical, 16)
        .padding(.leading, first ? 0 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
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
    private var target: Double { max(water.target ?? 2500, 1) }
    private var fraction: Double { (water.ml ?? 0) / target }
    private var reached: Bool { fraction >= 1 }

    /// "ještě 1,3 l do cíle", "cíl splněn".
    static func remaining(ml: Double, target: Double) -> String {
        ml >= target ? L10n.tr("cíl splněn") : L10n.f("ještě %@ do cíle", litres(target - ml))
    }

    /// "1,3 l", or "44 fl oz" in imperial units.
    static func litres(_ ml: Double) -> String {
        Units.imperial ? Fmt.int(Units.volume(ml)) + " " + Units.volumeUnit : Fmt.decimal(ml / 1000) + " l"
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
                Text(Fmt.int(fraction * 100) + " %").font(.footnote.weight(.semibold)).foregroundStyle(Palette.blue)
            }
            ProgressLine(fraction: fraction, color: Palette.blue, height: 5)
        }
    }

    private var full: some View {
        Card {
            HStack(spacing: 8) {
                WidgetHeader(title: "Pití a hydratace", color: Palette.blue)
                Button { other = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Palette.onAccent)
                        .frame(width: 34, height: 34)
                        .background(Palette.blue, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Přidat pití")
            }
            if figure == .line {
                NavigationLink { DrinkHistoryView() } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        amount(34)
                        Spacer()
                        drunkNote
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Otevře dnešní pití")
                ProgressLine(fraction: fraction, color: Palette.blue, height: 5)
            } else {
                HStack(spacing: 16) {
                    DrinkFigure(kind: figure, fraction: fraction, size: 96, animate: animate)
                        .scaleEffect(pop ? 1.12 : 1)
                        .contentShape(Rectangle())
                        .onTapGesture { Task { await quickAdd() } }
                        .onLongPressGesture { choosing = true }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(quickLabel)
                        .accessibilityAction { Task { await quickAdd() } }
                        .accessibilityAction(named: "Vybrat postavičku") { choosing = true }
                    NavigationLink { DrinkHistoryView() } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            amount(40)
                            Text(Fmt.int(fraction * 100) + " %").font(.footnote.weight(.semibold)).foregroundStyle(Palette.blue)
                            Text(Self.remaining(ml: water.ml ?? 0, target: target)).font(Typo.caption).foregroundStyle(Palette.muted)
                            drunkNote
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Otevře dnešní pití")
                }
            }
            if let added {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Palette.blue)
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
            DrinkPresetRow(add: { ml, kind in await model.addDrink(ml: ml, kind: kind) })
        }
        .sensoryFeedback(.impact(weight: .light), trigger: adds)
        .animation(.easeInOut(duration: 0.6), value: water.ml)
        .onChange(of: reached) { _, now in
            guard now, animate else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) { pop = true }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.35)) { pop = false }
        }
        .sensoryFeedback(.success, trigger: reached) { _, now in now }
        .sheet(isPresented: $choosing) {
            NavigationStack {
                PageScroll { DrinkFigurePicker().padding(20) }
                    .background(Palette.settingsBackground.ignoresSafeArea())
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

/// "Káva 08:05 · 200 ml → 180".
struct DrinkLine: View {
    let drink: FoodSnapshot.Drink

    var body: some View {
        let kind = DrinkKind.find(drink.kind)
        HStack(spacing: 10) {
            Image(systemName: kind?.symbol ?? "drop.fill").font(.system(size: 13)).foregroundStyle(Palette.blue).frame(width: 20)
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
struct MealRow: View {
    let meal: FoodSnapshot.Meal
    var add: () -> Void = {}

    private var empty: Bool { meal.entries.isEmpty }
    private var goal: FoodSnapshot.Suggestion? { meal.target ?? meal.suggestion }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NavigationLink { MealDetailView(type: meal.type) } label: { summary }
                .buttonStyle(.plain)
            addButton.padding(.top, 2)
        }
        .padding(.vertical, 12)
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(meal.label).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(ClockText.format(meal.time)).font(Typo.caption).foregroundStyle(Palette.faint)
                Spacer(minLength: 6)
                Text(Fmt.int(meal.kcal ?? 0)).font(Typo.number(20)).foregroundStyle(empty ? Palette.faint : Palette.ink)
                if let goal { Text("/ " + Fmt.int(goal.kcal) + " kcal").font(Typo.number(14)).foregroundStyle(Palette.faint) }
            }
            MacroBars(carbs: sum(\.carbs), protein: sum(\.protein), fat: sum(\.fat), goal: goal)
            if !empty {
                Text(meal.entries.map(\.name).joined(separator: ", "))
                    .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
        }
        .contentShape(Rectangle())
    }

    private func sum(_ key: KeyPath<FoodSnapshot.Entry, Double?>) -> Double {
        meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +)
    }

    private var addButton: some View {
        let fill: Color = empty ? Palette.button : .clear
        let tint: Color = empty ? Palette.onButton : Palette.ink
        let ring: Double = empty ? 0 : 0.2
        return Button(action: add) {
            Image(systemName: "plus").font(.system(size: 13, weight: .bold))
                .frame(width: 32, height: 32)
                .foregroundStyle(tint)
                .background(fill, in: Circle())
                .overlay(Circle().stroke(Palette.ink.opacity(ring), lineWidth: 1))
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
                .font(.system(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(Palette.secondary)
                .frame(width: 72, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(title) + " " + FiberRow.text(eaten: eaten, target: target, limit: false))
    }
}
