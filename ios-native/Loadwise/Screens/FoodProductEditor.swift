import SwiftUI

/// "Upravit produkt" from the barcode scanner: the serving (its name and
/// weight), the package and the values per 100 g. Saved as the user's own
/// food; for a catalogue food the correction can also go to the owner to
/// approve for everyone ("Navrhnout opravu pro všechny").
struct FoodProductEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let product: FoodProduct
    /// The corrected food, once saved.
    let saved: (FoodProduct) -> Void

    @State private var servingName = ""
    @State private var serving = ""
    @State private var package = ""
    @State private var name = ""
    @State private var brand = ""
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var sugar = ""
    @State private var fat = ""
    @State private var fiber = ""
    @State private var suggest = true
    @State private var filled = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 22) {
                ZStack {
                    Text("Upravit produkt").font(.headline).foregroundStyle(Palette.ink)
                    HStack { CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }; Spacer() }
                }
                if !product.perPortion {
                    SettingsGroup(title: "Porce") {
                        SettingsField(title: "Název porce", text: $servingName, keyboard: .default, placeholder: "porce")
                        SettingsDivider()
                        SettingsField(title: "Váha jedné porce", text: $serving, unit: product.unit)
                        SettingsDivider()
                        SettingsField(title: "Balení", text: $package, unit: product.unit)
                    }
                }
                SettingsGroup(title: product.perPortion ? "Jedna porce" : L10n.f("Na 100 %@", product.unit)) {
                    SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: "Potravina")
                    SettingsDivider()
                    SettingsField(title: "Výrobce, značka", text: $brand, keyboard: .default, placeholder: "nepovinné")
                    SettingsDivider()
                    SettingsField(title: "Energie", text: $kcal, unit: "kcal")
                    SettingsDivider()
                    SettingsField(title: "Bílkoviny", text: $protein, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "Sacharidy", text: $carbs, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "z toho cukry", text: $sugar, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "Tuky", text: $fat, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "Vláknina", text: $fiber, unit: "g")
                }
                if product.canSuggest && !product.perPortion {
                    SettingsGroup { SettingsToggle(title: "Navrhnout opravu pro všechny", isOn: $suggest) }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Button { Task { await save() } } label: {
                    Text(saving ? L10n.tr("Ukládám…") : L10n.tr("Uložit")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || current.name.isEmpty || current.calories_100g == nil)
            }
            .padding(24)
        }
        .background(Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear(perform: fill)
    }

    private func fill() {
        guard !filled else { return }
        filled = true
        servingName = product.serving_name ?? ""
        serving = product.usableServing.map(FoodAmountView.text) ?? ""
        package = FoodProduct.size(product.quantity, unit: product.unit).map(FoodAmountView.text) ?? ""
        name = product.name
        brand = product.brand ?? ""
        kcal = product.calories_100g.map(FoodAmountView.text) ?? ""
        protein = product.protein_100g.map(FoodAmountView.text) ?? ""
        carbs = product.carbs_100g.map(FoodAmountView.text) ?? ""
        sugar = product.sugars_100g.map(FoodAmountView.text) ?? ""
        fat = product.fat_100g.map(FoodAmountView.text) ?? ""
        fiber = product.fiber_100g.map(FoodAmountView.text) ?? ""
    }

    /// The product with the corrections; a cleared serving or package stays as it was.
    private var current: FoodProduct {
        var p = product
        p.name = name.trimmingCharacters(in: .whitespaces)
        p.brand = brand.trimmingCharacters(in: .whitespaces).nilIfBlank
        p.serving_name = servingName.trimmingCharacters(in: .whitespaces).nilIfBlank
        if let s = FoodAmountView.number(serving), s > 0, s != product.usableServing { p.serving_size = .string(FoodAmountView.text(s) + " " + product.unit) }
        if let q = FoodAmountView.number(package), q > 0, q != FoodProduct.size(product.quantity, unit: product.unit) { p.quantity = .string(FoodAmountView.text(q) + " " + product.unit) }
        p.calories_100g = FoodAmountView.number(kcal)
        p.protein_100g = FoodAmountView.number(protein)
        p.carbs_100g = FoodAmountView.number(carbs)
        p.sugars_100g = FoodAmountView.number(sugar)
        p.fat_100g = FoodAmountView.number(fat)
        p.fiber_100g = FoodAmountView.number(fiber)
        return p
    }

    private func save() async {
        let corrected = current
        guard corrected.values != product.values else { dismiss(); return }
        if model.demo { saved(corrected); dismiss(); return }
        saving = true
        defer { saving = false }
        do {
            let own = try await model.api.savePersonalFood(corrected)
            if suggest && product.canSuggest && !product.perPortion {
                // In the background: a refused suggestion (daily limit) must not hold up the food.
                let api = model.api, before = product
                Task.detached { try? await api.suggestFoodCorrection(before: before, after: corrected) }
            }
            var shown = own
            if shown.barcode == nil { shown.barcode = corrected.barcode }
            saved(shown)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
