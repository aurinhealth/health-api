import SwiftUI

/// The top of Food (redesign J, concept 02-jidlo): "Eaten today", the big
/// number, "of 2,650 kcal" and "1,270 to go", the bar of the day's target with
/// its workouts (green) and plans (striped) at the end, and Base / Workouts /
/// Planned under it. Past the target only the total turns red, from the first
/// kcal over and for every goal (Petr 2026-11-12 and 2026-11-16, decision 1).
struct FoodHero: View {
    let food: FoodSnapshot
    /// The bar and its parts open the Calories detail (not in a picture of the screen).
    var linked = true
    /// No target yet: where the body details are set.
    var setTarget: () -> Void = {}

    private var eaten: Double { food.kcal ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: Self.eatenLabel(date: food.date, today: AppModel.localDate(Date())))
                .font(Typo.body).foregroundStyle(Palette.muted)
            HStack(alignment: .lastTextBaseline, spacing: 14) {
                Text(verbatim: Fmt.int(eaten)).font(Typo.number(104)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                if let target = food.target, target > 0 {
                    targetLabel(target)
                } else {
                    Text(verbatim: "kcal").font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
            .accessibilityElement(children: .combine)
            if let target = food.target, target > 0 {
                Group {
                    if linked {
                        NavigationLink { CaloriesDetailView(food: food) } label: { parts(target) }
                            .buttonStyle(.plain)
                            .accessibilityHint(L10n.tr("Otevře, z čeho se cíl skládá"))
                    } else {
                        parts(target)
                    }
                }
                .padding(.top, 14)
            } else {
                NoTargetCard(action: setTarget).padding(.top, 16)
            }
        }
    }

    /// "Eaten today", "Eaten on Mon, Oct 5".
    static func eatenLabel(date: String, today: String) -> String {
        if date == today { return L10n.tr("Snězeno dnes") }
        guard let day = DateFormatters.iso().date(from: date) else { return L10n.tr("Snězeno") }
        let text = DateFormatters.make(L10n.isEnglish ? "EEE, MMM d" : "EEEE d. M.", locale: Fmt.locale, template: L10n.isEnglish).string(from: day)
        // "Snězeno: čtvrtek 8. 10." (a weekday after "Snězeno" alone is not Czech).
        return L10n.f("Snězeno: %@", text)
    }

    /// Kcal past the target, from the first one (no tolerance): 0 when not over.
    static func over(eaten: Double, target: Double) -> Double {
        max(0, eaten.rounded() - target.rounded())
    }

    private func targetLabel(_ target: Double) -> some View {
        let over = Self.over(eaten: eaten, target: target)
        return VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: L10n.f("z %@ kcal", Fmt.int(target))).font(Typo.small).foregroundStyle(Palette.muted)
            if over >= 1 {
                // Only numbers, never "too much"; the status red, semibold.
                Text(verbatim: L10n.f("%@ navíc", Fmt.int(over))).font(Typo.small.weight(.semibold)).foregroundStyle(Palette.red)
            } else {
                Text(verbatim: L10n.f("zbývá %@", Fmt.int(target.rounded() - eaten.rounded()))).font(Typo.small).foregroundStyle(Palette.ink)
            }
        }
        .lineLimit(1)
    }

    private func parts(_ target: Double) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            FoodTargetBar(eaten: eaten, target: target, parts: food.targetParts)
            TargetPartsRow(parts: food.targetParts, target: target, more: linked)
            // The target counts only part of a workout's burn, on purpose (about 70 %):
            // said in one line, so "+104" next to a 688 kcal ride doesn't read as a mistake.
            // Only when it is part: a target held up by the safe minimum counts the whole burn.
            if let parts = food.targetParts, let burned = parts.burnedDone, burned.rounded() > parts.workouts.rounded() {
                Text(verbatim: L10n.f("Tréninky jsou jen část ze spálených %@ kcal.", Fmt.int(burned)))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .contentShape(Rectangle())
    }
}

/// The day's target as one bar: what was eaten in ink over the track; the
/// workouts done (green) and the planned ones (striped) are the target's last
/// parts. Past the target the ink fills it and a grey piece shows the rest.
struct FoodTargetBar: View {
    let eaten: Double
    let target: Double
    var parts: FoodSnapshot.TargetParts? = nil

    var body: some View {
        GeometryReader { geo in
            let w = Double(geo.size.width)
            let over = eaten > target
            // Over: the whole bar is what was eaten, the target its first part.
            let scale = over ? w / max(eaten, 1) : w / max(target, 1)
            let workouts = max(parts?.workouts ?? 0, 0), planned = max(parts?.planned ?? 0, 0)
            let base = max(target - workouts - planned, 0)
            ZStack(alignment: .leading) {
                HStack(spacing: 3) {
                    Capsule().fill(Palette.track).frame(width: max(base * scale - 3, 0))
                    if workouts > 0 { Capsule().fill(Palette.green).frame(width: max(workouts * scale - 3, 2)) }
                    if planned > 0 { Stripes(color: Palette.amber).frame(width: max(planned * scale - 3, 2)).clipShape(Capsule()) }
                    if over { Capsule().fill(Palette.faint.opacity(0.6)).frame(width: max((eaten - target) * scale - 3, 4)) }
                }
                Capsule().fill(Palette.ink).frame(width: max(min(eaten, target) * scale - (over ? 3 : 0), 0))
            }
            .frame(width: geo.size.width, alignment: .leading)
            .clipShape(Capsule())
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }
}

/// Without a target (the body details were skipped): what sets it and the way
/// there, never "0 of 0" or a made-up number (D-JIDLO-1, critic's version).
struct NoTargetCard: View {
    let action: () -> Void

    var body: some View {
        Card {
            Text(verbatim: L10n.tr("Nastav si denní cíl")).font(Typo.heading(22)).foregroundStyle(Palette.ink)
            Text(verbatim: L10n.tr("Cíl se řídí tvou váhou, výškou, tréninkem a cílem."))
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button(action: action) {
                Text(verbatim: L10n.tr("Nastavit cíl")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 20).frame(minHeight: 44)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
