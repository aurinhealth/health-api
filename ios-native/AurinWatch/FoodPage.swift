import SwiftUI

/// The third page by the crown (mockup 44): the day's energy in a ring with
/// what is left, carbs, protein and fat in the iPhone's colours, and water
/// with its bar and +250 ml (8 fl oz in imperial) that goes to the iPhone's day.
/// Undo takes a drink back for a few seconds; the drop opens the favourite
/// drinks from Food → Drinks on the iPhone (mockup 9).
struct FoodPage: View {
    @EnvironmentObject private var store: WatchStore
    @State private var added = 0
    @State private var drinks = false

    var body: some View {
        Group {
            if let s = store.snapshot, s.date == WatchStore.localDate(Date()), let food = s.food {
                content(food)
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "fork.knife").font(.system(size: 22)).foregroundStyle(W.amber)
                    Text(W.tr("Jídlo z iPhonu", "Food from your iPhone"))
                        .font(W.serif(19))
                        .multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(W.glow(W.Glow.food), for: .navigation)
        .containerBackground(W.glow(W.Glow.food), for: .tabView)
    }

    private func content(_ food: WatchSnapshot.Food) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Below the time, which hangs over the page.
            HStack(spacing: 10) {
                Ring(fraction: fraction(food.kcal, food.target), color: W.amber, size: 74) {
                    RingValue(value: W.number(food.kcal ?? 0), label: food.target.map { W.tr("z ", "of ") + W.number($0) } ?? "kcal",
                              color: W.muted, size: 20)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(W.tr("Jídlo", "Food")).font(.system(size: 12, weight: .semibold)).foregroundStyle(W.amber)
                    Text(left(food))
                        .font(W.news(16))
                        .foregroundStyle(W.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                    if (food.kcal ?? 0) <= 0 {
                        Text(W.tr("zapiš ho v iPhonu", "log it on your iPhone")).font(.system(size: 10)).foregroundStyle(W.muted)
                    }
                }
            }
            .padding(.top, 18)
            HStack(alignment: .top, spacing: 7) {
                macro(food.carbs.net == true ? W.tr("Sacharidy", "Net carbs") : W.tr("Sacharidy", "Carbs"), food.carbs, W.carbs)
                macro(W.tr("Bílkoviny", "Protein"), food.protein, W.protein)
                macro(W.tr("Tuky", "Fat"), food.fat, W.fat)
            }
            .padding(.top, 10)
            Spacer(minLength: 6)
            water(food)
        }
    }

    /// "977 kcal left", "120 kcal over", "Nothing yet".
    private func left(_ food: WatchSnapshot.Food) -> String {
        let kcal = food.kcal ?? 0
        guard kcal > 0 else { return W.tr("Zatím nic", "Nothing yet") }
        guard let target = food.target, target > 0 else { return W.number(kcal) + " kcal" }
        let rest = target - kcal
        return rest >= 0 ? W.tr("zbývá \(W.number(rest)) kcal", "\(W.number(rest)) kcal left")
            : W.tr("o \(W.number(-rest)) kcal víc", "\(W.number(-rest)) kcal over")
    }

    /// Keto and less carbs: the carbs are a limit (mockup strava-hodinky-web 1), with a tick at
    /// its end (Czech keeps "Sacharidy": "Čisté sacharidy" does not fit the cell); past it the number and the bar turn rust, as on the iPhone's Food.
    private func macro(_ title: String, _ m: WatchSnapshot.Macro, _ color: Color) -> some View {
        let limit = m.limit == true
        let over = limit && (m.eaten ?? 0) > (m.target ?? .infinity)
        return VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 9, weight: .semibold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(W.number(m.eaten ?? 0)).foregroundStyle(over ? W.rust : W.ink)
                Text((m.target.map { "/" + W.number($0) } ?? "") + " g").foregroundStyle(W.muted)
            }
            .font(.system(size: 11, weight: .medium).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Bar(fraction: fraction(m.eaten, m.target), color: over ? W.rust : color)
                .overlay(alignment: .trailing) {
                    if limit { Capsule().fill(W.ink).frame(width: 2, height: 9) }
                }
                .padding(.top, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func water(_ food: WatchSnapshot.Food) -> some View {
        let favorites = store.snapshot?.drinks ?? []
        return HStack(spacing: 6) {
            Button {
                drinks = true
            } label: {
                Image(systemName: "waterbottle.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(W.blue)
                    .frame(width: 22, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(favorites.isEmpty)
            .accessibilityLabel(W.tr("Nápoje", "Drinks"))
            VStack(alignment: .leading, spacing: 0) {
                Text(store.drink.flatMap(\.name).map { $0 + " · " + W.water(food.water ?? 0) } ?? waterLine(food))
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Bar(fraction: fraction(food.water, food.waterTarget), color: W.blue).padding(.top, 3)
            }
            Spacer(minLength: 2)
            if store.drink != nil {
                Button {
                    store.undoDrink()
                } label: {
                    Text(W.tr("Zpět", "Undo"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(W.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.14), in: Capsule())
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    store.addWater(ml: W.glassMl)
                    added += 1
                } label: {
                    Text(W.imperial ? "+8 oz" : "+250")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(W.blue, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(W.imperial ? W.tr("Přidat 8 fl oz vody", "Add 8 fl oz of water") : W.tr("Přidat 250 ml vody", "Add 250 ml of water"))
            }
        }
        .sensoryFeedback(.success, trigger: added)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $drinks) {
            DrinksList(drinks: favorites) { drink in
                store.addWater(ml: drink.ml, kind: drink.kind, name: drink.name, factor: drink.factor)
                added += 1
                drinks = false
            }
        }
    }

    private func fraction(_ value: Double?, _ target: Double?) -> Double {
        guard let value, let target, target > 0 else { return 0 }
        return min(max(value / target, 0), 1)
    }

    /// "1,2 / 2,5 l" or "41 / 85 fl oz".
    private func waterLine(_ food: WatchSnapshot.Food) -> String {
        guard let target = food.waterTarget else { return W.water(food.water ?? 0) }
        let unit = W.imperial ? " fl oz" : " l"
        return W.water(food.water ?? 0).replacingOccurrences(of: unit, with: "") + " / " + W.water(target)
    }

    private struct Bar: View {
        let fraction: Double
        let color: Color

        var body: some View {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(W.track)
                    Capsule().fill(color).frame(width: max(geo.size.width * fraction, fraction > 0 ? 4 : 0))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
        }
    }
}

/// Under the drop: the favourite drinks from Food → Drinks on the iPhone in
/// their usual glasses; one tap adds one.
struct DrinksList: View {
    let drinks: [WatchSnapshot.Drink]
    let add: (WatchSnapshot.Drink) -> Void

    var body: some View {
        List(drinks) { drink in
            Button { add(drink) } label: {
                HStack(spacing: 8) {
                    Image(systemName: drink.symbol).foregroundStyle(drink.kind == "coffee" ? W.amber : W.blue)
                    Text(drink.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(W.ink).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(W.glass(drink.ml)).font(.system(size: 13)).foregroundStyle(W.muted).lineLimit(1)
                }
            }
        }
        .navigationTitle(W.tr("Nápoje", "Drinks"))
    }
}
