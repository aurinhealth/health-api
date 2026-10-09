import SwiftUI

struct FoodView: View {
    @Environment(AppModel.self) private var model
    @State private var adding: AddFoodTarget?
    @State private var scanning = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            if let food = model.food {
                ScrollView {
                    FoodContent(food: food, add: { adding = AddFoodTarget(meal: $0) }, scan: { scanning = true })
                        .padding(.bottom, 100)
                }
                .refreshable { await model.refreshFood() }
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
        .task { if model.food == nil { await model.refreshFood() } }
        .sheet(item: $adding) { target in AddFoodSheet(meal: target.meal) }
        .fullScreenCover(isPresented: $scanning) { BarcodeScanSheet(meal: MealSlot.now(slots: model.food?.mealSlots)) }
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
}

/// The Food screen without the scroll view, so tests can render it whole.
struct FoodContent: View {
    @Environment(AppModel.self) private var model
    let food: FoodSnapshot
    var add: (String) -> Void = { _ in }
    var scan: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                SectionLabel(text: "Jídlo · " + Fmt.capitalized(Fmt.dayHeading(food.date).components(separatedBy: " ").first?.lowercased() ?? ""))
                Spacer()
                CircleButton(systemImage: "barcode.viewfinder", label: "Skenovat čárový kód", action: scan)
            }

            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text(Fmt.int(food.kcal ?? 0)).font(Typo.number(104)).foregroundStyle(Palette.ink)
                if let target = food.target {
                    Text("z " + Fmt.int(target) + "\nkcal").font(Typo.small).foregroundStyle(Palette.muted).lineSpacing(1)
                }
            }
            .padding(.top, 34)
            if let sentence = food.sentence {
                Text(sentence).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            }

            MacroCells(macros: food.macros).padding(.top, 26)
            if let fiber = food.macros.fiber {
                FiberRow(title: "Vláknina", amount: fiber, color: Palette.green).padding(.top, 12)
            }
            if let sugar = food.macros.sugar, (sugar.eaten ?? 0) > 0 {
                FiberRow(title: "Cukry", amount: sugar, color: Palette.amberBar, limit: true).padding(.top, 8)
            }

            DrinksCard(water: food.water).padding(.top, 18)

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

            Button { add(MealSlot.now(slots: food.mealSlots)) } label: {
                Label("Přidat jídlo", systemImage: "plus")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.button, in: Capsule())
            }
            .padding(.top, 22)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }
}

struct MacroCells: View {
    let macros: FoodSnapshot.Macros

    var body: some View {
        HStack(spacing: 0) {
            cell("Sacharidy", macros.carbs, Palette.amber, first: true)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Bílkoviny", macros.protein, Palette.rust)
            Rectangle().fill(Palette.hairline).frame(width: 1)
            cell("Tuky", macros.fat, Palette.indigo)
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
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
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

    var body: some View {
        let eaten = amount.eaten ?? 0, target = amount.target ?? 30
        let over = limit && eaten > target
        HStack(spacing: 12) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 70, alignment: .leading)
            ProgressLine(fraction: eaten / max(target, 1), color: over ? Palette.rust : color, height: 3)
            Text(Fmt.int(eaten) + (amount.target.map { (limit ? " / max " : " / ") + Fmt.int($0) } ?? "") + " g")
                .font(Typo.number(16)).foregroundStyle(over ? Palette.rust : Palette.ink).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Pití: how much the drinks hydrate (coffee, beer… count less than water),
/// the day's drinks, water at one tap and any other drink.
struct DrinksCard: View {
    @Environment(AppModel.self) private var model
    let water: FoodSnapshot.Water
    @State private var other = false

    var body: some View {
        Card {
            WidgetHeader(title: "Pití a hydratace", color: Palette.blue)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.decimal((water.ml ?? 0) / 1000)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                Text("/ " + Fmt.decimal((water.target ?? 2500) / 1000) + " l").font(Typo.number(17)).foregroundStyle(Palette.faint)
                Spacer()
                if let drunk = water.drunkMl, abs(drunk - (water.ml ?? 0)) >= 20 {
                    Text("vypito " + Fmt.decimal(drunk / 1000) + " l").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            ProgressLine(fraction: (water.ml ?? 0) / max(water.target ?? 2500, 1), color: Palette.blue, height: 5)
            if let drinks = water.drinks, !drinks.isEmpty {
                VStack(spacing: 0) {
                    ForEach(drinks) { d in
                        HStack(spacing: 10) {
                            Image(systemName: DrinkKind.find(d.kind)?.symbol ?? "drop.fill").font(.system(size: 13)).foregroundStyle(Palette.blue).frame(width: 20)
                            Text(DrinkKind.find(d.kind)?.label ?? d.kind).font(Typo.small).foregroundStyle(Palette.secondary)
                            if let t = d.time { Text(t).font(Typo.tiny).foregroundStyle(Palette.faint) }
                            Spacer()
                            Text(Fmt.int(d.ml) + " ml").font(Typo.number(16)).foregroundStyle(Palette.ink)
                            if let h = d.hydrationMl, let ml = d.ml, abs(h - ml) >= 1 {
                                Text("→ " + Fmt.int(h)).font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                        }
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                        .contextMenu {
                            Button(role: .destructive) { Task { await model.deleteDrink(id: d.id) } } label: { Label("Smazat", systemImage: "trash") }
                        }
                    }
                }
            }
            DrinkQuickRow(add: { ml, kind in _ = await model.addDrink(ml: ml, kind: kind) }, other: { other = true })
            Text("Klepni na nápoj a pak na množství. Káva se počítá z 90 %, pivo napůl, víno vůbec. Podržením nápoj smažeš. Oblíbené nápoje upravíš v Nastavení.")
                .font(Typo.tiny).foregroundStyle(Palette.faint).fixedSize(horizontal: false, vertical: true)
        }
        .sheet(isPresented: $other) { DrinkSheet { ml, kind in _ = await model.addDrink(ml: ml, kind: kind) } }
    }
}

struct MealRow: View {
    let meal: FoodSnapshot.Meal
    var add: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ForEach(meal.entries) { entry in
                EntryRow(entry: entry)
            }
        }
    }

    private var empty: Bool { meal.entries.isEmpty }

    private var header: some View {
        HStack(spacing: 16) {
            Text(meal.time).font(Typo.number(20)).foregroundStyle(empty ? Palette.faint : Palette.muted)
                .frame(width: 50, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(meal.label).font(.subheadline.weight(.medium)).foregroundStyle(empty ? Palette.muted : Palette.ink)
                if let hint = targets {
                    Text(hint).font(Typo.caption).foregroundStyle(empty ? Palette.amber : Palette.muted)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if let kcal = meal.kcal {
                Text(Fmt.int(kcal)).font(Typo.number(20)).foregroundStyle(Palette.ink)
            }
            addButton
        }
        .padding(.vertical, 12)
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
        .accessibilityLabel("Přidat " + MealSlot.toMeal(meal.type))
    }

    /// What to aim for before the meal: "Cíl 560 kcal: bílkoviny 60 g,
    /// sacharidy 55 g, tuky 15 g" (what is left of the day shared out, else the
    /// meal's part of the day); then what it has against its target:
    /// "Bílkoviny 42 z 60 g · sacharidy 50 z 55 g · tuky 12 z 15 g".
    private var targets: String? {
        let aim = meal.suggestion ?? meal.target
        if empty {
            guard let aim else { return nil }
            let macros = [("bílkoviny", aim.protein), ("sacharidy", aim.carbs), ("tuky", aim.fat)]
                .compactMap { label, value in value.map { label + " " + Fmt.int($0) + " g" } }
            return "Cíl " + Fmt.int(aim.kcal) + " kcal" + (macros.isEmpty ? "" : ": " + macros.joined(separator: ", "))
        }
        let sum = { (key: KeyPath<FoodSnapshot.Entry, Double?>) in meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +) }
        let goal = meal.target ?? meal.suggestion
        let part = { (label: String, eaten: Double, target: Double?) in label + " " + Fmt.int(eaten) + (target.map { " z " + Fmt.int($0) } ?? "") }
        var text = [part("Bílkoviny", sum(\.protein), goal?.protein), part("sacharidy", sum(\.carbs), goal?.carbs), part("tuky", sum(\.fat), goal?.fat)]
            .joined(separator: " · ") + " g"
        if let goal { text += " · cíl " + Fmt.int(goal.kcal) + " kcal" }
        return text
    }
}

struct EntryRow: View {
    @Environment(AppModel.self) private var model
    let entry: FoodSnapshot.Entry

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.name).font(Typo.small).foregroundStyle(Palette.secondary).lineLimit(2)
                if let detail {
                    Text(detail).font(Typo.tiny).foregroundStyle(Palette.faint)
                }
            }
            Spacer()
            Text(Fmt.int(entry.kcal)).font(Typo.number(17)).foregroundStyle(Palette.muted)
        }
        .padding(.leading, 66)
        .padding(.bottom, 10)
        .contentShape(Rectangle())
        .contextMenu {
            Button(role: .destructive) { Task { await model.deleteFood(id: entry.id) } } label: { Label("Smazat", systemImage: "trash") }
        }
    }

    private var detail: String? {
        let parts = [entry.amount, entry.brand].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

