import SwiftUI

/// What is left of the day's target once these foods are in, before "Přidat":
/// "Po přidání zbývá dnes 860 kcal · 42 g bílkovin" with a thin bar (eaten in
/// ink, this food in grey). Past the target the line turns amber, never red.
/// It counts the day the food goes into (`day`), and hides without a target
/// or without that day's numbers on the phone (no extra request).
struct DayLeftLine: View {
    @Environment(AppModel.self) private var model
    let day: String
    /// This food (or all items together) at the chosen amount.
    let kcal: Double
    let protein: Double
    let carbs: Double

    var body: some View {
        if let intake = intake(on: shownDay), let target = intake.kcalTarget, target > 0 {
            let eaten = intake.kcal
            let left = (target - eaten - kcal).rounded()
            let over = left <= -1
            VStack(alignment: .leading, spacing: 6) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        title(over: over)
                        Spacer(minLength: 4)
                        amounts(left: left, over: over)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        title(over: over)
                        amounts(left: left, over: over)
                    }
                }
                bar(eaten: eaten, target: target, over: over)
                if !over {
                    Text(verbatim: L10n.f("%@ z %@ kcal snědeno · tohle jídlo %@ kcal", Fmt.int(eaten), Fmt.int(target), Fmt.int(kcal)))
                        .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// The sample day keeps its own date (2026-10-08) whatever the phone's.
    private var shownDay: String { model.demo ? model.food?.date ?? day : day }
    private var isToday: Bool { model.demo || day == AppModel.localDate(Date()) }

    private func title(over: Bool) -> some View {
        let text = over ? L10n.tr("Po přidání")
            : isToday ? L10n.tr("Po přidání zbývá dnes") : L10n.f("Po přidání zbývá %@", Fmt.onWeekday(day))
        return Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.ink).lineLimit(1)
    }

    @ViewBuilder private func amounts(left: Double, over: Bool) -> some View {
        if over {
            let text = isToday ? L10n.f("%@ kcal nad dnešním cílem", Fmt.int(-left))
                : L10n.f("%@ kcal nad cílem %@", Fmt.int(-left), Fmt.onWeekday(day))
            Text(verbatim: text).font(Typo.small.weight(.semibold)).foregroundStyle(Palette.amber).lineLimit(1)
        } else {
            (Text(verbatim: L10n.f("%@ kcal", Fmt.int(left))).font(Typo.small.weight(.bold))
             + Text(verbatim: second.map { " · " + $0 } ?? "").font(Typo.small))
                .foregroundStyle(Palette.ink).lineLimit(1)
        }
    }

    /// Keto and less carbs: the carb limit; otherwise the protein still to eat.
    private var second: String? {
        guard let intake = intake(on: shownDay) else { return nil }
        if intake.carbsLimit, let limit = intake.carbsTarget {
            let left = (limit - intake.carbs - carbs).rounded()
            return left >= 0 ? L10n.f("limit sacharidů: zbývá %@ g", Fmt.int(left))
                : L10n.f("%@ g nad limitem sacharidů", Fmt.int(-left))
        }
        guard let target = intake.proteinTarget else { return nil }
        let left = (target - intake.protein - protein).rounded()
        return left >= 1 ? L10n.f("%@ g bílkovin", Fmt.int(left)) : nil
    }

    private func bar(eaten: Double, target: Double, over: Bool) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                if over {
                    Capsule().fill(Palette.amberBar)
                } else {
                    Capsule().fill(Palette.faint.opacity(0.55)).frame(width: width * min(max((eaten + kcal) / target, 0), 1))
                    Capsule().fill(Palette.ink).frame(width: width * min(max(eaten / target, 0), 1))
                }
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }

    /// The day's numbers as the phone has them: Food when it shows that day,
    /// else Today's for today.
    private func intake(on day: String) -> DayIntake? {
        if let food = model.food, food.date == day {
            return DayIntake(kcal: food.kcal ?? 0, kcalTarget: food.target,
                             protein: food.macros.protein.eaten ?? 0, proteinTarget: food.macros.protein.target,
                             carbs: food.macros.carbs.eaten ?? 0, carbsTarget: food.macros.carbs.target,
                             carbsLimit: food.macros.carbs.limit == true)
        }
        if let today = model.today, today.date == day {
            let n = today.nutrition
            return DayIntake(kcal: n.kcal ?? 0, kcalTarget: n.target,
                             protein: n.protein.eaten ?? 0, proteinTarget: n.protein.target,
                             carbs: n.carbs.eaten ?? 0, carbsTarget: n.carbs.target,
                             carbsLimit: n.carbs.limit == true)
        }
        return nil
    }

    private struct DayIntake {
        let kcal: Double
        let kcalTarget: Double?
        let protein: Double
        let proteinTarget: Double?
        let carbs: Double
        let carbsTarget: Double?
        let carbsLimit: Bool
    }
}
