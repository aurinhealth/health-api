import SwiftUI

/// "Nový recept": a name, how many portions it makes and the ingredients
/// (found among the own foods and the catalog) with their amounts. One portion
/// then adds in one tap from Recepty.
struct RecipeEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var saved: () -> Void = {}
    @State private var name = ""
    @State private var servings = 2.0
    @State private var items: [Item] = []
    @State private var picking = false
    @State private var saving = false
    @State private var error: String?

    struct Item: Identifiable {
        let id = UUID()
        let product: FoodProduct
        var amount: String
        var value: Double { Double(amount.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    }

    private func total(_ key: (FoodProduct, Double) -> Double?) -> Double {
        items.reduce(0) { $0 + (key($1.product, $1.value) ?? 0) }
    }

    private var portionKcal: String {
        let kcal: Double = total { p, q in p.kcal(for: q) } / servings
        return Fmt.int(kcal) + " kcal"
    }

    private var portionMacros: String {
        let protein: Double = total { p, q in p.grams(p.protein_100g, for: q) } / servings
        let carbs: Double = total { p, q in p.grams(p.carbs_100g, for: q) } / servings
        let fat: Double = total { p, q in p.grams(p.fat_100g, for: q) } / servings
        return L10n.f("bílkoviny %@ g, sacharidy %@ g, tuky %@ g", Fmt.int(protein), Fmt.int(carbs), Fmt.int(fat))
    }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 18) {
                BackSlot { dismiss() }
                Text("Nový recept").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                SettingsGroup {
                    SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: "Kuřecí rizoto")
                    SettingsDivider()
                    NumberStepper(title: "Porcí", value: $servings, range: 1...20, step: 1, unit: "")
                }

                SectionLabel(text: "Suroviny")
                VStack(spacing: 0) {
                    ForEach($items) { $item in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.product.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                                Text(Fmt.int(item.product.kcal(for: item.value)) + " kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            Spacer(minLength: 8)
                            TextField("100", text: $item.amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                                .font(Typo.number(20)).frame(width: 70)
                            Text(item.product.perPortion ? "ks" : item.product.unit).font(Typo.caption).foregroundStyle(Palette.muted)
                            Button { items.removeAll { $0.id == item.id } } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Odebrat surovinu")
                        }
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
                Button { picking = true } label: {
                    Label("Přidat surovinu", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                }
                .buttonStyle(.plain)

                if !items.isEmpty {
                    Card {
                        WidgetHeader(title: "Jedna porce", color: Palette.amberBar)
                        Text(portionKcal).font(Typo.number(26)).foregroundStyle(Palette.ink)
                        Text(portionMacros).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: saving ? "Ukládám…" : "Uložit recept", systemImage: "checkmark", busy: saving) { Task { await save() } }
                    .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty || items.isEmpty || items.contains { $0.value <= 0 })
            }
            .padding(24)
        }
        .background { Palette.background.ignoresSafeArea() }
        .floatingBack { dismiss() }
        .navBarVisibility(.hidden)
        .sheet(isPresented: $picking) {
            // The same search as logging a meal: own foods first, then the catalog and AI.
            AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), pick: { product, amount in
                // No thousands separator: Item.value reads "1500", not "1,500" or "1 500".
                items.append(Item(product: product, amount: amount.formatted(.number.grouping(.never).precision(.fractionLength(0...1)).locale(L10n.locale))))
                picking = false
            })
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let ingredients: [JSONValue] = items.map { item in
            let p = item.product, q = item.value
            var values: JSONObject = [
                "name": .string(p.name), "quantity": .number(q), "unit": .string(p.perPortion ? "piece" : p.unit),
                "calories": .number(p.kcal(for: q) ?? 0), "protein_g": .number(p.grams(p.protein_100g, for: q) ?? 0),
                "carbs_g": .number(p.grams(p.carbs_100g, for: q) ?? 0), "fat_g": .number(p.grams(p.fat_100g, for: q) ?? 0)
            ]
            // Sugars, fibre and salt only when the food has them.
            for (key, per100) in [("sugar_g", p.sugars_100g), ("fiber_g", p.fiber_100g), ("salt_g", p.salt_100g)] {
                if let g = p.grams(per100, for: q) { values[key] = .number(g) }
            }
            return .object(values)
        }
        do {
            try await model.api.saveRecipe(name: name.trimmingCharacters(in: .whitespaces), servings: servings, ingredients: ingredients)
            error = nil
            saved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
