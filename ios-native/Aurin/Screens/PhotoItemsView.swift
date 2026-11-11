import SwiftUI

/// One food of a meal photo: the product (per 100 g, or one portion of an own
/// recipe) and how much of it is on the plate.
struct PhotoItem: Identifiable {
    let id = UUID()
    var product: FoodProduct
    var amount: Double
    /// Matched to one of the user's own foods, whose values it took.
    var mine = false
}

/// A meal photo with several foods on the plate (src/food-photo.js mealItems).
struct PhotoMeal: Hashable {
    let id = UUID()
    let photo: UIImage?
    let items: [PhotoItem]

    static func == (a: PhotoMeal, b: PhotoMeal) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// "Z fotky": the foods AI found on the plate, each with its own amount, then
/// the total and "Přidat k obědu", which logs every food on its own. A tap or
/// the pencil opens the amount screen to correct one; a swipe removes it.
struct PhotoItemsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let meal: PhotoMeal
    let mealType: String
    var done: () -> Void = {}
    @State private var items: [PhotoItem] = []
    @State private var filled = false
    @State private var chosenMeal: String?
    @State private var editing: PhotoItem?
    @State private var adding = false
    @State private var saving = false

    private var target: String { chosenMeal ?? mealType }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 16) {
                BackSlot { dismiss() }
                HStack(spacing: 14) {
                    if let photo = meal.photo {
                        Image(uiImage: photo).resizable().scaledToFill()
                            .frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .accessibilityHidden(true)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Z fotky").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted).textCase(.uppercase)
                        Text(verbatim: L10n.plural("%lld položek na fotce", items.count)).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    }
                }
                VStack(spacing: 0) {
                    ForEach($items) { $item in
                        SwipeRow(edit: { editing = item }, delete: { remove(item.id) }) { row($item) }
                            .overlay(alignment: .top) { if item.id != items.first?.id { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                    }
                    if items.count < 6 {
                        Button { adding = true } label: {
                            Label("Přidat položku", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 4)
                .cardSurface(cornerRadius: 22)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Celkem").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Spacer()
                        Text(Fmt.int(total(\.calories_100g))).font(Typo.number(28)).foregroundStyle(Palette.ink)
                        Text("kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Text(verbatim: L10n.f("%@ g bílkovin, %@ g sacharidů, %@ g tuků", Fmt.int(total(\.protein_100g)), Fmt.int(total(\.carbs_100g)), Fmt.int(total(\.fat_100g))))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
                DayLeftLine(day: model.writeDay, kcal: total(\.calories_100g), protein: total(\.protein_100g), carbs: total(\.carbs_100g))
                MissingMacrosLine(missing: missingMacros)
                Label("Množství jsou odhad z fotky. Omáčky a olej jsou nejméně přesné.", systemImage: "sparkles")
                    .font(Typo.caption).foregroundStyle(Palette.amber).fixedSize(horizontal: false, vertical: true)
                MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 }))
                Button { Task { await save() } } label: {
                    Text(saving ? L10n.tr("Ukládám…") : MealSlot.addText(target)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || items.isEmpty)
            }
            .padding(24)
        }
        .background { Palette.background.ignoresSafeArea() }
        .navBarVisibility(.hidden)
        .onAppear { if !filled { filled = true; items = meal.items } }
        .sheet(item: $editing) { item in
            NavigationStack {
                FoodAmountView(product: item.product, meal: target, start: item.amount, pick: { product, amount in
                    if let i = items.firstIndex(where: { $0.id == item.id }) {
                        items[i].product = product
                        items[i].amount = amount
                    }
                    editing = nil
                })
            }
            .presentationBackground(Palette.background)
        }
        .sheet(isPresented: $adding) {
            AddFoodSheet(meal: target, pick: { product, amount in
                items.append(PhotoItem(product: product, amount: amount, mine: ["personal", "manual", "recipe", "composed"].contains(product.source ?? "")))
                adding = false
            })
        }
    }

    private func row(_ item: Binding<PhotoItem>) -> some View {
        let product = item.wrappedValue.product, amount = item.wrappedValue.amount
        return HStack(spacing: 8) {
            Button { editing = item.wrappedValue } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(product.name).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if item.wrappedValue.mine { MyFoodTag() } else if product.source == "ai-estimate" { AIEstimateTag() }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            stepper(item)
            Text(Fmt.int(product.kcal(for: amount))).font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(Palette.ink).frame(minWidth: 36, alignment: .trailing)
        }
        .padding(.vertical, 11)
    }

    private func stepper(_ item: Binding<PhotoItem>) -> some View {
        let portion = item.wrappedValue.product.perPortion, step = portion ? 0.5 : 10
        let amount = item.wrappedValue.amount
        return HStack(spacing: 6) {
            stepButton("minus", L10n.tr("Méně")) { item.wrappedValue.amount = max(step, amount - step) }
            Text(verbatim: (amount.rounded() == amount ? Fmt.int(amount) : Fmt.decimal(amount, digits: 1)) + " " + (portion ? L10n.tr("porce") : item.wrappedValue.product.unit))
                .font(.footnote).foregroundStyle(Palette.ink).monospacedDigit().frame(minWidth: 48)
            stepButton("plus", L10n.tr("Více")) { item.wrappedValue.amount = min(portion ? 10 : 2000, amount + step) }
        }
    }

    private func stepButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 26, height: 26).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func remove(_ id: UUID) {
        withAnimation(.snappy) { items.removeAll { $0.id == id } }
    }

    /// The macros some food on the plate has no value for, each named once.
    private var missingMacros: [String] {
        var seen = Set<String>()
        return items.flatMap(\.product.missingMacros).filter { seen.insert($0).inserted }
    }

    private func total(_ key: KeyPath<FoodProduct, Double?>) -> Double {
        items.reduce(0) { $0 + ($1.product.grams($1.product[keyPath: key], for: $1.amount) ?? 0) }
    }

    /// Every food on its own, so each can be corrected in the diary later.
    private func save() async {
        saving = true
        defer { saving = false }
        for item in items {
            _ = await model.logFood(product: item.product, amount: item.amount, meal: target, refreshAfter: false)
        }
        Task { await model.sendOutbox(reloadToday: true) }
        done()
    }
}

/// "Moje potravina": a food from the photo matched to one of the user's own.
struct MyFoodTag: View {
    var body: some View {
        Text("moje potravina").font(.caption2.weight(.semibold)).foregroundStyle(Palette.green).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Palette.greenSoft, in: Capsule())
    }
}
