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
        .fullScreenCover(isPresented: $scanning) { BarcodeScanSheet(meal: MealSlot.now()) }
    }
}

struct AddFoodTarget: Identifiable {
    let meal: String
    var id: String { meal }
}

enum MealSlot {
    static let labels = ["breakfast": "Snídaně", "snack_am": "Dopolední svačina", "lunch": "Oběd", "snack_pm": "Odpolední svačina", "dinner": "Večeře"]

    /// The meal for the time of day, as the server sorts entries (app-food.js mealOf).
    static func now(_ date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let t = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return t < 600 ? "breakfast" : t < 690 ? "snack_am" : t < 870 ? "lunch" : t < 1050 ? "snack_pm" : "dinner"
    }

    /// "ke svačině", "k obědu": the end of "Přidat …".
    static func toMeal(_ type: String) -> String {
        switch type {
        case "breakfast": return "ke snídani"
        case "lunch": return "k obědu"
        case "dinner": return "k večeři"
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
                FiberRow(fiber: fiber).padding(.top, 12)
            }

            DrinksCard(water: food.water).padding(.top, 18)

            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Jídla dne")
                Spacer()
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

            Button { add(MealSlot.now()) } label: {
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

/// "Vláknina 12 / 30 g" under the macros.
struct FiberRow: View {
    let fiber: FoodSnapshot.Amount

    var body: some View {
        HStack(spacing: 12) {
            Text("Vláknina").font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 70, alignment: .leading)
            ProgressLine(fraction: (fiber.eaten ?? 0) / max(fiber.target ?? 30, 1), color: Palette.green, height: 3)
            Text(Fmt.int(fiber.eaten ?? 0) + (fiber.target.map { " / " + Fmt.int($0) } ?? "") + " g")
                .font(Typo.number(16)).foregroundStyle(Palette.ink).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Pití: how much the drinks hydrate (coffee, beer… count less than water),
/// the day's drinks, water at one tap and any other drink.
struct DrinksCard: View {
    @Environment(AppModel.self) private var model
    let water: FoodSnapshot.Water
    @State private var adding = false
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
            HStack(spacing: 8) {
                Button {
                    Task {
                        adding = true
                        await model.addWater(ml: 250)
                        adding = false
                    }
                } label: {
                    Label(adding ? "Přidávám…" : "Voda 250 ml", systemImage: "plus")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(adding)
                .accessibilityLabel("Přidat 250 mililitrů vody")
                Button { other = true } label: {
                    Label("Jiný nápoj", systemImage: "cup.and.saucer")
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Text("Káva se počítá z 90 %, pivo napůl, víno vůbec. Podržením nápoj smažeš.")
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

    /// What to aim for: "cíl ~520 kcal · B 30 · S 60 · T 18 g" before the meal,
    /// then what it has: "B 22 · S 40 · T 12 g z ~520 kcal".
    private var targets: String? {
        let s = meal.suggestion
        if empty {
            guard let s else { return nil }
            var parts = ["cíl ~" + Fmt.int(s.kcal) + " kcal"]
            let macros = [("B", s.protein), ("S", s.carbs), ("T", s.fat)].compactMap { label, value in value.map { label + " " + Fmt.int($0) } }
            if !macros.isEmpty { parts.append(macros.joined(separator: " · ") + " g") }
            return parts.joined(separator: " · ")
        }
        let sum = { (key: KeyPath<FoodSnapshot.Entry, Double?>) in meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +) }
        var text = "B " + Fmt.int(sum(\.protein)) + " · S " + Fmt.int(sum(\.carbs)) + " · T " + Fmt.int(sum(\.fat)) + " g"
        if let s { text += " z ~" + Fmt.int(s.kcal) + " kcal" }
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

