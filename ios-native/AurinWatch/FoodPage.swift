import SwiftUI

/// The third page by the crown, as Food on the iPhone: the day's energy
/// against its goal, carbs, protein and fat with their bars, and water with
/// +250 ml that goes to the iPhone's day.
struct FoodPage: View {
    @EnvironmentObject private var store: WatchStore
    @State private var added = 0

    private static let glass = 250

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
            Text(W.tr("Jídlo", "Food"))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(W.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 5) {
                Text(food.kcal.map { W.number($0) } ?? "0")
                    .font(W.serif(40))
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                if let target = food.target, target > 0 {
                    Text(W.tr("z ", "of ") + W.number(target) + " kcal")
                        .font(.system(size: 11))
                        .foregroundStyle(W.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text("kcal").font(.system(size: 11)).foregroundStyle(W.muted)
                }
            }
            Bar(fraction: fraction(food.kcal, food.target), color: W.green)
                .padding(.bottom, 8)
            VStack(spacing: 5) {
                macro(W.tr("Sacharidy", "Carbs"), food.carbs, W.carbs)
                macro(W.tr("Bílkoviny", "Protein"), food.protein, W.protein)
                macro(W.tr("Tuky", "Fat"), food.fat, W.fat)
            }
            Spacer(minLength: 6)
            water(food)
        }
    }

    private func macro(_ title: String, _ m: WatchSnapshot.Macro, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(title).font(.system(size: 11)).foregroundStyle(W.secondary)
                Spacer(minLength: 2)
                Text(W.number(m.eaten ?? 0) + (m.target.map { " / " + W.number($0) } ?? "") + " g")
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(W.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Bar(fraction: fraction(m.eaten, m.target), color: color)
        }
    }

    private func water(_ food: WatchSnapshot.Food) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "waterbottle.fill")
                .font(.system(size: 15))
                .foregroundStyle(W.blue)
            VStack(alignment: .leading, spacing: 0) {
                Text(liters(food.water ?? 0) + (food.waterTarget.map { " / " + liters($0) } ?? "") + " l")
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(W.tr("Voda", "Water")).font(.system(size: 10)).foregroundStyle(W.muted)
            }
            Spacer(minLength: 2)
            Button {
                store.addWater(ml: Self.glass)
                added += 1
            } label: {
                Text("+\(Self.glass)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(W.blue, in: Capsule())
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.success, trigger: added)
            .accessibilityLabel(W.tr("Přidat 250 ml vody", "Add 250 ml of water"))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
    }

    private func fraction(_ value: Double?, _ target: Double?) -> Double {
        guard let value, let target, target > 0 else { return 0 }
        return min(max(value / target, 0), 1)
    }

    private func liters(_ ml: Double) -> String { W.number(ml / 1000, digits: 1) }

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
