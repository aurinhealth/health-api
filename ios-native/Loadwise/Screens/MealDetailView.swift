import SwiftUI

/// Jídlo → a meal: its calories and macros against the meal's targets, the
/// fibre, sugar and salt, and every food with all its values.
struct MealDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let type: String
    @State private var adding = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            ScrollView {
                if let meal = model.food?.meals.first(where: { $0.type == type }) {
                    MealDetailContent(meal: meal, back: { dismiss() }, add: { adding = true })
                        .padding(.bottom, 100)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                        Text("Tohle jídlo dnes není.").font(Typo.body).foregroundStyle(Palette.muted)
                    }
                    .padding(24)
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $adding) { AddFoodSheet(meal: type) }
    }
}

struct MealDetailContent: View {
    let meal: FoodSnapshot.Meal
    var back: () -> Void = {}
    var add: () -> Void = {}

    private var goal: FoodSnapshot.Suggestion? { meal.target ?? meal.suggestion }

    private func sum(_ key: KeyPath<FoodSnapshot.Entry, Double?>) -> Double {
        meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CircleButton(systemImage: "chevron.left", label: "Zpět", action: back)
                Spacer()
                SectionLabel(text: L10n.f("Jídlo · %@", meal.time))
                Spacer()
                CircleButton(systemImage: "plus", label: MealSlot.addText(meal.type), action: add)
            }

            Text(meal.label).font(Typo.sentence(34, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 28)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(Fmt.int(meal.kcal ?? 0)).font(Typo.number(76)).foregroundStyle(Palette.ink)
                if let goal { Text(L10n.f("z %@ kcal", Fmt.int(goal.kcal))).font(Typo.small).foregroundStyle(Palette.muted) }
            }
            if let goal {
                ProgressLine(fraction: (meal.kcal ?? 0) / max(goal.kcal, 1), color: Palette.amberBar, height: 5).padding(.top, 4)
            }

            Card {
                WidgetHeader(title: "Makra", color: Palette.carbs, trailing: goal == nil ? nil : "cíl jídla")
                MacroBars(carbs: sum(\.carbs), protein: sum(\.protein), fat: sum(\.fat), goal: goal)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(spacing: 0) {
                    extra("Vláknina", sum(\.fiber), unit: "g")
                    extra("Cukry", sum(\.sugar), unit: "g")
                    extra("Sůl", sum(\.salt), unit: "g", digits: 1)
                }
            }
            .padding(.top, 22)

            SectionLabel(text: meal.entries.isEmpty ? "Zatím nic" : L10n.f("Potraviny · %@", String(meal.entries.count))).padding(.top, 28)
            if meal.entries.isEmpty {
                Text("Do tohoto jídla zatím nic není. Přidej první potravinu.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 10)
                PrimaryButton(title: MealSlot.addText(meal.type), systemImage: "plus", action: add).padding(.top, 16)
            } else {
                VStack(spacing: 10) {
                    ForEach(meal.entries) { FoodEntryCard(entry: $0) }
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    private func extra(_ title: String, _ value: Double, unit: String, digits: Int = 0) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(digits == 0 ? Fmt.int(value) : Fmt.decimal(value, digits: digits)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                Text(unit).font(Typo.caption).foregroundStyle(Palette.faint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One food of the meal with every value it has.
struct FoodEntryCard: View {
    @Environment(AppModel.self) private var model
    let entry: FoodSnapshot.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                    if let detail = Self.detail(entry) {
                        Text(detail).font(Typo.caption).foregroundStyle(Palette.faint)
                    }
                }
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(Fmt.int(entry.kcal)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                    Text("kcal").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            HStack(spacing: 6) {
                value(L10n.isEnglish ? "C" : "S", entry.carbs, Palette.carbs)
                value(L10n.isEnglish ? "P" : "B", entry.protein, Palette.protein)
                value(L10n.isEnglish ? "F" : "T", entry.fat, Palette.fat)
            }
            Text(Self.extras(entry)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .padding(14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contextMenu {
            Button(role: .destructive) { Task { await model.deleteFood(id: entry.id) } } label: { Label("Smazat", systemImage: "trash") }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Podržením smažeš")
    }

    private func value(_ letter: String, _ grams: Double?, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(verbatim: letter).font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                .frame(width: 18, height: 18).background(color, in: Circle())
            Text(Fmt.decimal(grams ?? 0, digits: (grams ?? 0) < 10 ? 1 : 0) + " g").font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(color.opacity(0.12), in: Capsule())
    }

    /// "150 g · Madeta".
    static func detail(_ e: FoodSnapshot.Entry) -> String? {
        let parts = [e.amount, e.brand, e.time].compactMap { $0?.nilIfBlank }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "vláknina 3 g · cukry 12 g · sůl 0,4 g".
    static func extras(_ e: FoodSnapshot.Entry) -> String {
        let fiberGrams: String = e.fiber.map { Fmt.decimal($0) + " g" } ?? "–"
        let sugarGrams: String = e.sugar.map { Fmt.decimal($0) + " g" } ?? "–"
        let saltGrams: String = e.salt.map { Fmt.decimal($0, digits: 2) + " g" } ?? "–"
        let fiber = L10n.f("vláknina %@", fiberGrams)
        let sugar = L10n.f("cukry %@", sugarGrams)
        let salt = L10n.f("sůl %@", saltGrams)
        return [fiber, sugar, salt].joined(separator: " · ")
    }
}
