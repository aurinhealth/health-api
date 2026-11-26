import SwiftUI

/// The third page by the crown (watch concept 09, approved 2026-11-23): the
/// top of Food on the iPhone. "Eaten today" with the number in the serif, the
/// goal and what is left beside it and a bar; carbs, protein and fat with a
/// dot and a bar in the iPhone's macro colours; and water on its own row with
/// two separate targets: the line opens Water, the +250 ml pill adds a glass
/// (8 fl oz in imperial) that goes to the iPhone's day. Food is logged on the
/// iPhone; the watch adds drinks.
struct FoodPage: View {
    @EnvironmentObject private var store: WatchStore
    @State private var added = 0

    enum Page: Hashable { case water, drinks }

    var body: some View {
        Group {
            if let s = store.snapshot, s.date == WatchStore.localDate(WatchDemo.now), let food = s.food {
                content(food)
            } else {
                VStack(spacing: 6) {
                    Text(W.tr("Jídlo z iPhonu", "Food from your iPhone"))
                        .font(W.serif(19))
                        .foregroundStyle(W.num)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .sensoryFeedback(.success, trigger: added)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ReadinessHome.Page.coach) { WatchCoachLights() }
                    .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
        .containerBackground(W.glow(W.Glow.food), for: .navigation)
        .containerBackground(W.glow(W.Glow.food), for: .tabView)
    }

    private func content(_ food: WatchSnapshot.Food) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            eaten(food).padding(.top, W.small ? 12 : 16)
            macros(food).padding(.top, 8)
            Spacer(minLength: 6)
            waterRow(food)
        }
    }

    // MARK: Eaten today

    private func eaten(_ food: WatchSnapshot.Food) -> some View {
        let kcal = food.kcal ?? 0
        return VStack(alignment: .leading, spacing: 2) {
            Text(W.tr("Snědeno dnes", "Eaten today"))
                .watchFont(13, .medium).foregroundStyle(W.muted)
                .padding(.horizontal, 3)
            HStack(alignment: .bottom, spacing: 6) {
                Text(W.number(kcal))
                    .font(W.serif(W.small ? 36 : 42))
                    .foregroundStyle(W.num)
                    .lineLimit(1)
                    .fixedSize()
                VStack(alignment: .leading, spacing: 1) {
                    if let target = food.target, target > 0 {
                        Text(W.tr("z ", "of ") + W.number(target) + " kcal").foregroundStyle(W.muted)
                    }
                    Text(left(food)).foregroundStyle(W.ink)
                }
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.bottom, 5)
            }
            Bar(fraction: fraction(food.kcal, food.target), color: W.ink, height: 5)
                .padding(.top, 2)
        }
        .accessibilityElement(children: .combine)
    }

    /// "1,270 to go", "120 over", "log it on your iPhone".
    private func left(_ food: WatchSnapshot.Food) -> String {
        let kcal = food.kcal ?? 0
        guard kcal > 0 else { return W.tr("zapiš ho v iPhonu", "log it on your iPhone") }
        guard let target = food.target, target > 0 else { return "kcal" }
        let rest = target - kcal
        return rest >= 0 ? W.tr("zbývá \(W.number(rest))", "\(W.number(rest)) to go")
            : W.tr("o \(W.number(-rest)) víc", "\(W.number(-rest)) over")
    }

    // MARK: Carbs, protein, fat

    private func macros(_ food: WatchSnapshot.Food) -> some View {
        HStack(alignment: .top, spacing: 6) {
            macro(W.tr("Sacharidy", "Carbs"), food.carbs, W.carbs)
            macro(W.tr("Bílkoviny", "Protein"), food.protein, W.protein)
            macro(W.tr("Tuky", "Fat"), food.fat, W.fat)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(W.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(W.hair, lineWidth: 1) }
    }

    /// Keto and less carbs: the carbs are a limit, "max 66 g" under the
    /// number, with a tick at the bar's end; past it the number and the bar turn rust.
    private func macro(_ title: String, _ m: WatchSnapshot.Macro, _ color: Color) -> some View {
        let limit = m.limit == true
        let over = limit && (m.eaten ?? 0) > (m.target ?? .infinity)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Circle().fill(color).frame(width: 5, height: 5)
                Text(title).foregroundStyle(W.secondary)
            }
            .font(.system(size: 12, weight: .medium))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(W.number(m.eaten ?? 0)).font(W.serif(19)).foregroundStyle(over ? W.rust : W.num)
                Text("g").font(.system(size: 11, weight: .medium)).foregroundStyle(W.muted)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            Bar(fraction: fraction(m.eaten, m.target), color: over ? W.rust : color)
                .overlay(alignment: .trailing) {
                    if limit { Capsule().fill(W.ink).frame(width: 2, height: 8) }
                }
            if let target = m.target {
                Text((limit ? "max " : W.tr("z ", "of ")) + W.number(target) + " g")
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(W.muted)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: Water

    /// Two separate targets (concept 09 point 3): the line opens Water, the
    /// pill adds a glass. While Undo can take it back the line says so.
    private func waterRow(_ food: WatchSnapshot.Food) -> some View {
        HStack(spacing: 6) {
            NavigationLink(value: Page.water) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(W.tr("Voda", "Water")).watchFont(12, .medium).foregroundStyle(W.muted)
                    HStack(spacing: 3) {
                        Text(Self.waterLine(food)).watchFont(13, .medium).foregroundStyle(W.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(W.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                store.addWater(ml: W.glassMl)
                added += 1
            } label: {
                Text(W.glassText)
                    .watchFont(14, .semibold)
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 12)
                    .frame(minHeight: 38)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .overlay { Capsule().stroke(Color.white.opacity(0.25), lineWidth: 0.6) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(W.imperial ? W.tr("Přidat 8 fl oz vody", "Add 8 fl oz of water") : W.tr("Přidat 250 ml vody", "Add 250 ml of water"))
        }
        .padding(.horizontal, 3)
    }

    /// "0.8 of 2.5 L" or "27 of 85 fl oz".
    static func waterLine(_ food: WatchSnapshot.Food) -> String {
        guard let target = food.waterTarget else { return W.water(food.water ?? 0) }
        return W.water(food.water ?? 0).replacingOccurrences(of: " " + W.waterUnit, with: "") + W.tr(" z ", " of ") + W.water(target)
    }

    private func fraction(_ value: Double?, _ target: Double?) -> Double {
        guard let value, let target, target > 0 else { return 0 }
        return min(max(value / target, 0), 1)
    }

    struct Bar: View {
        let fraction: Double
        let color: Color
        var height: CGFloat = 4

        var body: some View {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(W.track)
                    Capsule().fill(color).frame(width: max(geo.size.width * fraction, fraction > 0 ? height : 0))
                }
            }
            .frame(height: height)
            .accessibilityHidden(true)
        }
    }
}

/// Water (concept 09): the iPhone's Water widget small, the litres in the
/// middle of a green arc, the day's goal under it; − and + change the glass,
/// Add puts it in. After a drink "Added 250 ml" with Undo for a few seconds.
/// Other drinks lead to the favourites from Food → Drinks.
struct WaterPage: View {
    @EnvironmentObject private var store: WatchStore
    @State private var glass = W.glassMl
    @State private var added = 0

    private var step: Int { W.imperial ? 59 : 50 }

    var body: some View {
        let food = store.snapshot?.food
        let water = food?.water ?? 0
        let target = food?.waterTarget ?? 0
        ScrollView {
            VStack(spacing: 0) {
                Text(W.tr("Voda dnes", "Water today"))
                    .watchFont(13, .medium).foregroundStyle(W.muted)
                WaterRing(fraction: target > 0 ? min(water / target, 1) : 0,
                          number: W.water(water).replacingOccurrences(of: " " + W.waterUnit, with: ""),
                          unit: W.waterUnit)
                    .padding(.top, 4)
                if target > 0 {
                    Text(W.tr("z ", "of ") + W.water(target))
                        .watchFont(13).foregroundStyle(W.muted)
                        .padding(.top, 2)
                }
                if let drink = store.drink {
                    HStack(spacing: 6) {
                        Text(W.tr("Přidáno ", "Added ") + W.glass(drink.ml))
                            .watchFont(14, .medium).foregroundStyle(W.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Spacer(minLength: 2)
                        Button(W.tr("Zpět", "Undo")) { store.undoDrink() }
                            .buttonStyle(.bordered)
                            .fixedSize()
                    }
                    .padding(.leading, 12)
                    .padding(4)
                    .background(Color.white.opacity(0.08), in: Capsule())
                    .padding(.top, 8)
                } else {
                    HStack(spacing: 6) {
                        round("minus", W.tr("Méně", "Less")) { glass = max(step, glass - step) }
                        Button {
                            store.addWater(ml: glass)
                            added += 1
                        } label: {
                            Text(W.tr("Přidat ", "Add ") + W.glass(glass))
                                .watchFont(15, .semibold).foregroundStyle(.black)
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity)
                        }
                        .mainButton()
                        round("plus", W.tr("Víc", "More")) { glass = min(step * 20, glass + step) }
                    }
                    .padding(.top, 8)
                }
                if !(store.snapshot?.drinks ?? []).isEmpty {
                    NavigationLink(value: FoodPage.Page.drinks) {
                        HStack {
                            Text(W.tr("Další nápoje", "Other drinks")).watchFont(15, .medium).foregroundStyle(W.ink)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(W.muted)
                        }
                        .frame(minHeight: 38)
                        .overlay(alignment: .top) { Rectangle().fill(W.hair).frame(height: 1) }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .sensoryFeedback(.success, trigger: added)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ReadinessHome.Page.coach) { WatchCoachLights() }
                    .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
        .containerBackground(W.glow(W.Glow.food), for: .navigation)
    }

    private func round(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 14, weight: .bold)).foregroundStyle(W.ink)
                .frame(width: 38, height: 38)
                .background(Color.white.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The small Water widget's arc: three quarters of a circle, green up to the drunk share.
private struct WaterRing: View {
    let fraction: Double
    let number: String
    let unit: String

    var body: some View {
        let size: CGFloat = W.small ? 80 : 92
        let line: CGFloat = 6
        ZStack {
            arc(1).stroke(W.track, style: StrokeStyle(lineWidth: line, lineCap: .round))
            if fraction > 0 {
                arc(fraction).stroke(W.green, style: StrokeStyle(lineWidth: line, lineCap: .round))
            }
            VStack(spacing: 0) {
                Text(number).font(W.serif(size * 0.36)).foregroundStyle(W.num).lineLimit(1).minimumScaleFactor(0.6)
                Text(unit).font(.system(size: 11, weight: .medium)).foregroundStyle(W.muted)
            }
            .padding(.horizontal, 14)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .combine)
    }

    private func arc(_ share: Double) -> Path {
        let size: CGFloat = W.small ? 80 : 92
        return Path { path in
            path.addArc(center: CGPoint(x: size / 2, y: size / 2), radius: size / 2 - 5,
                        startAngle: .degrees(135), endAngle: .degrees(135 + 270 * share), clockwise: false)
        }
    }
}

/// Other drinks (concept 09): the favourite drinks from Food → Drinks on the
/// iPhone in their usual glasses, and how much of each counts as water; one
/// tap adds one.
struct DrinksList: View {
    @EnvironmentObject private var store: WatchStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let drinks = store.snapshot?.drinks ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(W.tr("Další nápoje", "Other drinks"))
                    .watchFont(13, .medium).foregroundStyle(W.muted)
                    .padding(.bottom, 2)
                ForEach(drinks) { drink in
                    Button {
                        store.addWater(ml: drink.ml, kind: drink.kind, name: drink.name, factor: drink.factor)
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(drink.name).watchFont(15, .medium).foregroundStyle(W.ink).lineLimit(1)
                                Text(W.tr("počítá se ", "counts ") + W.glass(Int((Double(drink.ml) * drink.factor).rounded())))
                                    .watchFont(13).foregroundStyle(W.muted).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            Text(W.glass(drink.ml)).watchFont(13, .medium).foregroundStyle(W.ink).lineLimit(1)
                        }
                        .padding(.vertical, 6)
                        .overlay(alignment: .top) { Rectangle().fill(W.hair).frame(height: 1) }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .containerBackground(W.glow(W.Glow.food), for: .navigation)
    }
}
