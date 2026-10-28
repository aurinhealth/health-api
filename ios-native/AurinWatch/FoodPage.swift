import SwiftUI

/// The third page by the crown (mockup 44): the day's energy in a ring with
/// what is left, carbs, protein and fat in the iPhone's colours, and water
/// with its bar and +250 ml that goes to the iPhone's day.
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
                macro(W.tr("Sacharidy", "Carbs"), food.carbs, W.carbs)
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

    private func macro(_ title: String, _ m: WatchSnapshot.Macro, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 9, weight: .semibold)).foregroundStyle(color).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(W.number(m.eaten ?? 0)).foregroundStyle(W.ink)
                Text((m.target.map { "/" + W.number($0) } ?? "") + " g").foregroundStyle(W.muted)
            }
            .font(.system(size: 11, weight: .medium).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Bar(fraction: fraction(m.eaten, m.target), color: color).padding(.top, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
                Bar(fraction: fraction(food.water, food.waterTarget), color: W.blue).padding(.top, 3)
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
