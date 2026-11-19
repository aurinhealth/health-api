import SwiftUI

// Today's Food and Activity cards in the redesign (part D, concept 01-dnes
// a-hlavni points 6 and 8): a section label above the card, the main number
// with its target, and the same order and colours as the Food tab.

/// FOOD on Today: kcal of the target on an ink bar, the training's share in
/// words, then Carbs, Protein, Fat and Drinks with their targets (D-DNES-4).
/// Drinks are the Food tab's hydration (the server's `water.ml`, drinks
/// counted with HYDRATION_FACTORS, D-DNES-3).
struct TodayFoodCard: View {
    let nutrition: TodaySnapshot.Nutrition
    var waterFailed = false
    var foodFailed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Jídlo").padding(.leading, 4)
            Card {
                if foodFailed {
                    PartUnavailableNote(text: "Jídlo se teď nepodařilo načíst").padding(.horizontal, -16).padding(.vertical, -6)
                } else {
                    content
                }
            }
        }
        .accessibilityIdentifier("today.food")
    }

    @ViewBuilder private var content: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(verbatim: Fmt.int(nutrition.kcal)).font(Typo.number(34)).foregroundStyle(Palette.ink)
            if let target = nutrition.target {
                Text(verbatim: L10n.f("z %@ kcal", Fmt.int(target))).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                .accessibilityHidden(true)
        }
        ProgressLine(fraction: Self.fraction(nutrition.kcal, nutrition.target), color: Palette.ink, height: 6)
        if let bonus = nutrition.trainingBonus, bonus > 0 {
            Text(verbatim: L10n.f("Včetně %@ kcal za dnešní trénink", Fmt.int(bonus)))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        HStack(alignment: .top, spacing: 12) {
            column("Sacharidy", nutrition.carbs.eaten, nutrition.carbs.target, "g", Palette.carbs)
            column("Bílkoviny", nutrition.protein.eaten, nutrition.protein.target, "g", Palette.protein)
            column("Tuky", nutrition.fat.eaten, nutrition.fat.target, "g", Palette.fat)
            column("Pití", waterFailed ? nil : nutrition.water.ml.map(Self.volume), nutrition.water.target.map(Self.volume),
                   Units.imperial ? Units.volumeUnit : "l", Palette.blue, digits: Units.imperial ? 0 : 1,
                   fraction: waterFailed ? 0 : Self.fraction(nutrition.water.ml, nutrition.water.target))
        }
        .padding(.top, 4)
        if waterFailed {
            Divider().overlay(Palette.hairline)
            PartUnavailableNote(text: "Pití se teď nepodařilo načíst").padding(.horizontal, -16).padding(.vertical, -6)
        }
    }

    /// Millilitres in the user's unit: litres or fluid ounces.
    static func volume(_ ml: Double) -> Double { Units.imperial ? Units.volume(ml) : ml / 1000 }

    static func fraction(_ value: Double?, _ target: Double?) -> Double {
        guard let value, let target, target > 0 else { return 0 }
        return value / target
    }

    private func column(_ title: String, _ value: Double?, _ target: Double?, _ unit: String, _ color: Color,
                        digits: Int = 0, fraction: Double? = nil) -> some View {
        let number = { (v: Double?) in digits == 0 ? Fmt.int(v) : Fmt.decimal(v, digits: digits) }
        return VStack(alignment: .leading, spacing: 4) {
            Text(L10n.tr(title)).font(Typo.tiny).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(verbatim: number(value)).font(Typo.number(19)).foregroundStyle(Palette.ink)
                if value != nil { Text(verbatim: unit).font(Typo.tiny).foregroundStyle(Palette.faint) }
            }
            ProgressLine(fraction: fraction ?? Self.fraction(value, target), color: color, height: 3)
            if let target {
                Text(verbatim: L10n.f("z %@ %@", number(target), unit)).font(Typo.tiny).foregroundStyle(Palette.faint)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// ACTIVITY on Today: the steps of the goal, and the running total through
/// the day as one line with the goal dashed, in the Health charts' style
/// (concept point 8). Without hours, the week's bars as before.
struct TodayStepsCard: View {
    let steps: TodaySnapshot.Steps

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Pohyb").padding(.leading, 4)
            Card {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(verbatim: Fmt.int(steps.today)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                    Text(verbatim: L10n.f("z %@ kroků", Fmt.int(steps.goal))).font(Typo.caption).foregroundStyle(Palette.muted)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                        .accessibilityHidden(true)
                }
                ProgressLine(fraction: steps.goal > 0 ? (steps.today ?? 0) / steps.goal : 0, color: Palette.ink, height: 6)
                    .opacity(steps.hourly?.count == 24 ? 0 : 1)
                    .frame(height: steps.hourly?.count == 24 ? 0 : 6)
                if let hourly = steps.hourly, hourly.count == 24 {
                    StepsDayLine(hourly: hourly, goal: steps.goal, hour: steps.hour)
                        .frame(height: 110)
                        .accessibilityHidden(true)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.steps")
    }
}

/// The day's steps adding up from midnight to now, the goal as a dashed line
/// and the hours 00:00 to 24:00 under it.
struct StepsDayLine: View {
    let hourly: [Double]
    let goal: Double
    /// The current hour (nil: a past day, the whole day drawn).
    let hour: Int?

    /// The running total at the end of each hour up to `last`.
    static func totals(_ hourly: [Double], through last: Int) -> [Double] {
        var sum = 0.0
        return hourly.prefix(max(0, min(23, last)) + 1).map { sum += $0; return sum }
    }

    var body: some View {
        let last = hour ?? 23
        let totals = Self.totals(hourly, through: last)
        let top = max(goal * 1.1, totals.last ?? 0, 1)
        VStack(spacing: 6) {
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let x = { (i: Int) in w * CGFloat(i + 1) / 24 }
                let y = { (v: Double) in h * (1 - CGFloat(v / top)) }
                ZStack(alignment: .topLeading) {
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: y(goal)))
                        p.addLine(to: CGPoint(x: w, y: y(goal)))
                    }
                    .stroke(Palette.muted, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    Text("cíl").font(Typo.tiny).foregroundStyle(Palette.muted)
                        .position(x: w - 10, y: max(8, y(goal) - 9))
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: h))
                        for (i, v) in totals.enumerated() { p.addLine(to: CGPoint(x: x(i), y: y(v))) }
                    }
                    .stroke(Palette.ink, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    Path { p in
                        p.move(to: CGPoint(x: 0, y: h))
                        p.addLine(to: CGPoint(x: w, y: h))
                    }
                    .stroke(Palette.hairline, lineWidth: 1)
                    if let end = totals.last, hour != nil {
                        Circle().fill(Palette.background).overlay(Circle().strokeBorder(Palette.ink, lineWidth: 2))
                            .frame(width: 9, height: 9)
                            .position(x: x(totals.count - 1), y: y(end))
                    }
                }
            }
            HStack {
                ForEach([0, 6, 12, 18], id: \.self) { h in
                    Text(verbatim: ClockText.format(minutes: h * 60)).font(Typo.tiny).foregroundStyle(Palette.muted)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}
