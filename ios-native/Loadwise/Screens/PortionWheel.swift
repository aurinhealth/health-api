import SwiftUI

/// How much, on a wheel: servings (¼ to 10) or grams/ml, with a switch between
/// them. Servings count from the food's serving, else from the whole package;
/// a serving stored as "1 g" does not count (FoodProduct.usableServing).
struct PortionWheel: View {
    let product: FoodProduct
    /// The amount in the food's unit (grams, ml, or portions for a per-portion food).
    @Binding var amount: Double

    @State private var byPortion = true
    @State private var portion = 5
    @State private var units = 100
    @State private var ready = false

    static let fractions: [(label: String, value: Double)] = [
        ("¼", 0.25), ("⅓", 1.0 / 3), ("½", 0.5), ("⅔", 2.0 / 3), ("¾", 0.75), ("1", 1), ("1¼", 1.25), ("1⅓", 4.0 / 3), ("1½", 1.5),
        ("1¾", 1.75), ("2", 2), ("2½", 2.5), ("3", 3), ("3½", 3.5), ("4", 4), ("5", 5), ("6", 6), ("8", 8), ("10", 10)
    ]
    static let unitValues = Array(1...1000)

    /// One serving, else the package, in the food's unit; 1 for a per-portion food.
    private var reference: (size: Double, isPackage: Bool)? {
        if product.perPortion { return (1, false) }
        if let s = product.usableServing { return (s, false) }
        if let q = FoodProduct.size(product.quantity, unit: product.unit) { return (q, true) }
        return nil
    }

    var body: some View {
        VStack(spacing: 6) {
            if let reference, !product.perPortion {
                Picker("Jednotka", selection: $byPortion) {
                    Text(reference.isPackage ? "Balení" : "Porce").tag(true)
                    Text(product.unit == "ml" ? "Mililitry" : "Gramy").tag(false)
                }
                .pickerStyle(.segmented)
            }
            if byPortion, reference != nil {
                wheel(selection: $portion, values: Array(Self.fractions.indices), label: { Self.fractions[$0].label }, unit: unitName)
            } else {
                wheel(selection: $units, values: Self.unitValues, label: { String($0) }, unit: product.unit)
            }
        }
        .onAppear(perform: start)
        .onChange(of: byPortion) {
            // The other wheel opens on about the same amount.
            if byPortion, let reference {
                portion = Self.fractions.indices.min { abs(Self.fractions[$0].value * reference.size - amount) < abs(Self.fractions[$1].value * reference.size - amount) } ?? 5
            } else {
                units = min(1000, max(1, Int(amount.rounded())))
            }
            update()
        }
        .onChange(of: portion) { update() }
        .onChange(of: units) { update() }
    }

    /// The name under the wheel in servings: "porce", "sušenka" or "balení".
    private var unitName: String {
        reference?.isPackage == true ? L10n.tr("balení") : product.servingName
    }

    /// "1⅓ porce", "1 sušenka", "2 × sušenka", "½ balení" or "19 g", for the add button.
    var label: String { Self.label(product: product, amount: amount) }

    static func label(product: FoodProduct, amount: Double) -> String {
        let size = product.perPortion ? 1 : product.usableServing
        if let size, let f = fractions.first(where: { abs($0.value * size - amount) < 0.01 }) {
            let name = product.servingName
            if product.serving_name == nil || f.value == 1 { return f.label + " " + name }
            return f.label + " × " + name
        }
        if product.perPortion { return Fmt.decimal(amount, digits: 2) + " " + L10n.tr("porce") }
        if let q = FoodProduct.size(product.quantity, unit: product.unit), product.usableServing == nil,
           let f = fractions.first(where: { abs($0.value * q - amount) < 0.01 }) {
            return f.label + " " + L10n.tr("balení")
        }
        return String(Int(amount.rounded())) + " " + product.unit
    }

    private func wheel(selection: Binding<Int>, values: [Int], label: @escaping (Int) -> String, unit: String) -> some View {
        Picker("Množství", selection: selection) {
            ForEach(values, id: \.self) { Text(verbatim: label($0)).font(.title3.weight(.semibold)).tag($0) }
        }
        .pickerStyle(.wheel)
        .frame(height: 140)
        .clipped()
        .overlay(alignment: .trailing) {
            Text(unit).font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                .padding(.trailing, 16).allowsHitTesting(false)
        }
    }

    /// Opens on the amount given: a whole serving when the food has one, else grams.
    private func start() {
        guard !ready else { return }
        ready = true
        if let reference, let i = Self.fractions.firstIndex(where: { abs($0.value * reference.size - amount) < 0.01 }) {
            portion = i
            byPortion = true
        } else {
            byPortion = product.perPortion
            units = min(1000, max(1, Int(amount.rounded())))
        }
        update()
    }

    private func update() {
        guard ready else { return }
        if byPortion, let reference {
            amount = Self.fractions[portion].value * reference.size
        } else {
            amount = Double(units)
        }
    }
}
