import SwiftUI

/// "K obědu jsem měl kuře s rýží" in the coach: the foods it read, with the
/// amounts to adjust, logged only after "Zapsat" (src/food-chat.js).
struct FoodDraftCard: View {
    let draft: FoodDraft
    /// "Zapsáno do oběda", "Nezapsáno." or an error once decided.
    let logged: String?
    /// The foods are in the diary.
    var ok = false
    /// The foods to log and the meal, or nil for "Ne".
    var log: ([(product: FoodProduct, amount: Double, meal: String)]?, String) -> Void

    @State private var amounts: [Double] = []
    @State private var meal = ""
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Zápis jídla").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                mealChip
            }
            .padding(.bottom, 10)
            ForEach(draft.items.indices, id: \.self) { i in row(i) }
            HStack {
                Text("Celkem").font(.subheadline.weight(.bold))
                Spacer()
                Text("\(Int(total(\.calories_100g).rounded())) kcal").font(.subheadline.weight(.bold)).monospacedDigit()
            }
            .foregroundStyle(Palette.ink)
            .padding(.top, 10)
            .overlay(alignment: .top) { Divider() }
            if logged == nil {
                HStack(spacing: 12) {
                    macro("B", total(\.protein_100g), Palette.protein)
                    macro("S", total(\.carbs_100g), Palette.carbs)
                    macro("T", total(\.fat_100g), Palette.fat)
                }
                .padding(.top, 6)
                HStack(spacing: 8) {
                    Button { confirm() } label: {
                        Text("Zapsat").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 40).background(Palette.button, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .disabled(sending || !draft.items.contains { $0.product != nil })
                    Button { log(nil, meal) } label: {
                        Text("Ne").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 40).background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .disabled(sending)
                }
                .buttonStyle(.plain)
                .padding(.top, 12)
            } else if let logged {
                Label(logged, systemImage: ok ? "checkmark" : "xmark")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ok ? Palette.green : Palette.muted)
                    .padding(.top, 10)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.hairline, lineWidth: 1))
        .onAppear {
            if amounts.isEmpty { amounts = draft.items.map(\.startAmount) }
            if meal.isEmpty { meal = draft.items.compactMap { $0.meal }.first { !$0.isEmpty } ?? MealSlot.now() }
        }
    }

    private var mealChip: some View {
        Menu {
            ForEach(MealSlot.all) { slot in
                Button(L10n.tr(slot.label)) { meal = slot.id }
            }
        } label: {
            Text(L10n.tr(MealSlot.labels[meal] ?? "Jídlo") + " · " + dayLabel)
                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.amber)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Palette.amberSoft, in: Capsule())
        }
        .disabled(logged != nil)
    }

    private var dayLabel: String {
        let today = AppModel.localDate(Date())
        if draft.date == today { return L10n.tr("dnes") }
        if draft.date == AppModel.localDate(Date().addingTimeInterval(-86_400)) { return L10n.tr("včera") }
        return draft.date
    }

    @ViewBuilder private func row(_ i: Int) -> some View {
        let item = draft.items[i], amount = i < amounts.count ? amounts[i] : item.startAmount
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(item.product?.name ?? item.name).font(.subheadline).foregroundStyle(Palette.ink).lineLimit(2)
                if ["ai", "ai-estimate"].contains(item.product?.source ?? "") {
                    Text("AI").font(.caption2.weight(.bold)).foregroundStyle(Palette.indigo)
                        .padding(.horizontal, 6).padding(.vertical, 2).background(Palette.lilac, in: RoundedRectangle(cornerRadius: 6))
                }
            }
            Spacer(minLength: 4)
            if let product = item.product {
                if logged == nil {
                    stepper(i, product: product, amount: amount)
                } else {
                    Text(amountText(amount, product)).font(.footnote).foregroundStyle(Palette.muted).monospacedDigit()
                }
                Text("\(Int((product.kcal(for: amount) ?? 0).rounded()))").font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(Palette.ink).frame(minWidth: 40, alignment: .trailing)
            } else {
                Text("bez hodnot").font(.footnote).foregroundStyle(Palette.muted)
            }
        }
        .padding(.vertical, 9)
        .overlay(alignment: .top) { Divider() }
    }

    private func stepper(_ i: Int, product: FoodProduct, amount: Double) -> some View {
        let step = product.perPortion ? 0.5 : 10
        return HStack(spacing: 6) {
            stepButton("minus") { if i < amounts.count { amounts[i] = max(step, amounts[i] - step) } }
            Text(amountText(amount, product)).font(.footnote).foregroundStyle(Palette.ink).monospacedDigit().frame(minWidth: 52)
            stepButton("plus") { if i < amounts.count { amounts[i] = min(product.perPortion ? 10 : 5000, amounts[i] + step) } }
        }
    }

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.ink)
                .frame(width: 26, height: 26).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
    }

    private func amountText(_ amount: Double, _ product: FoodProduct) -> String {
        let n = amount.rounded() == amount ? String(Int(amount)) : String(format: "%.1f", amount)
        return n + " " + (product.perPortion ? L10n.tr("porce") : product.nutrition_basis == "ml" ? "ml" : "g")
    }

    private func macro(_ letter: String, _ grams: Double, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(L10n.f(letter + " %d g", Int(grams.rounded()))).font(.caption).foregroundStyle(Palette.muted)
        }
    }

    private func total(_ key: KeyPath<FoodProduct, Double?>) -> Double {
        draft.items.indices.reduce(0) { sum, i in
            guard let product = draft.items[i].product else { return sum }
            let amount = i < amounts.count ? amounts[i] : draft.items[i].startAmount
            return sum + (product.grams(product[keyPath: key], for: amount) ?? 0)
        }
    }

    private func confirm() {
        sending = true
        let items = draft.items.indices.compactMap { i -> (product: FoodProduct, amount: Double, meal: String)? in
            guard let product = draft.items[i].product else { return nil }
            return (product, i < amounts.count ? amounts[i] : draft.items[i].startAmount, meal)
        }
        log(items, meal)
    }
}
