import SwiftUI

/// GET /app/api/food/week (src/app-food-week.js): Monday to Sunday, the day
/// targets added up (everyday intake plus what training adds) against what
/// was eaten.
struct FoodWeek: Decodable, Equatable {
    let start: String?
    let end: String?
    let today: String
    /// Nil until there is a calorie target (profile and weight).
    let target: Double?
    let base: Double?
    let exercise: Double?
    let eaten: Double
    /// The days up to today added up: where the bar should be by tonight.
    var byToday: Double? = nil
    var left: Double? = nil
    var over: Double? = nil
    /// What is left shared by today and the days ahead.
    var perDay: Double? = nil
}

extension APIClient {
    func foodWeek(date: String? = nil) async throws -> FoodWeek {
        try await get("/app/api/food/week" + (date.map { "?date=" + $0 } ?? ""))
    }
}

/// Týdenní kalorie (Jídlo, off until added in Upravit widgety): one bar for
/// the week. It fills gold while the eating stays within the everyday intake,
/// coral once it eats into what training added, and red past the week's target.
struct FoodWeekWidget: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dayPage) private var page
    @State private var week: FoodWeek?

    /// The week of the day on screen (Jídlo can show another day).
    private var date: String? { page.map(\.selectedDate) ?? model.selectedDate }

    var body: some View {
        Card {
            WidgetHeader(title: WidgetKind.weekCalories.title, color: Palette.gold, trailing: week.flatMap(Self.range))
            if let week, let target = week.target {
                content(week, target: target)
            } else if week != nil {
                Text("Týden spočítám, až budu znát tvůj denní cíl.").font(Typo.small).foregroundStyle(Palette.muted)
            } else {
                Text("–").font(Typo.number(34)).foregroundStyle(Palette.faint)
            }
        }
        // Again when the day's food changes (a meal added on Jídlo).
        .task(id: (date ?? "") + "|" + Fmt.int((page?.food ?? model.food)?.kcal)) { await load() }
    }

    @ViewBuilder private func content(_ week: FoodWeek, target: Double) -> some View {
        let over = (week.over ?? 0) > 0
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            Text(Fmt.int(week.eaten)).font(Typo.number(38)).foregroundStyle(over ? Palette.red : Palette.ink)
            Text(L10n.f("z %@ kcal snědeno", Fmt.int(target))).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
        }
        WeekCaloriesBar(base: week.base ?? target, exercise: week.exercise ?? 0, eaten: week.eaten, byToday: week.byToday)
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 10) {
            legend(Circle().strokeBorder(Palette.ink, lineWidth: 1.5), "Celkem na týden", Fmt.int(target))
            legend(Circle().fill(Palette.gold), "Denní příjem", Fmt.int(week.base ?? target))
            legend(Circle().fill(Palette.rust), "Cvičení", "+" + Fmt.int(week.exercise ?? 0))
            legend(Circle().fill(over ? Palette.red : Palette.ink), "Snězeno", Fmt.int(week.eaten))
        }
        Rectangle().fill(Palette.hairline).frame(height: 1)
        footer(week).font(Typo.caption).foregroundStyle(Palette.muted)
    }

    private func legend(_ dot: some View, _ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            dot.frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                Text(verbatim: value).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func footer(_ week: FoodWeek) -> Text {
        if let over = week.over, over > 0 {
            return Text(L10n.f("O %@ kcal víc", Fmt.int(over))).foregroundColor(Palette.red) + Text(verbatim: " " + L10n.tr("než cíl týdne"))
        }
        let left = Text(L10n.f("Zbývá %@ kcal", Fmt.int(week.left ?? 0))).foregroundColor(Palette.ink)
        guard let perDay = week.perDay else { return left }
        return left + Text(verbatim: " · " + L10n.f("zhruba %@ na den", Fmt.int(perDay)))
    }

    /// "13.–19. 10.", "Oct 13–19".
    nonisolated static func range(_ week: FoodWeek) -> String? {
        guard let start = week.start, let end = week.end else { return nil }
        let part = { (iso: String) -> (Int, Int)? in
            let bits = iso.split(separator: "-").compactMap { Int($0) }
            return bits.count == 3 ? (bits[1], bits[2]) : nil
        }
        guard let (m1, d1) = part(start), let (m2, d2) = part(end) else { return nil }
        if L10n.isEnglish {
            let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            return m1 == m2 ? "\(months[m1 - 1]) \(d1)–\(d2)" : "\(months[m1 - 1]) \(d1)–\(months[m2 - 1]) \(d2)"
        }
        return m1 == m2 ? "\(d1).–\(d2). \(m2)." : "\(d1). \(m1).–\(d2). \(m2)."
    }

    private func load() async {
        if model.demo {
            week = DemoData.foodWeek
            return
        }
        if let fresh = try? await model.api.foodWeek(date: date) { week = fresh }
    }
}

/// The week's target as one track (everyday intake, then what training
/// adds), filled with what was eaten in the colour of the part it reached.
struct WeekCaloriesBar: View {
    let base: Double
    let exercise: Double
    let eaten: Double
    let byToday: Double?

    private let height: CGFloat = 22
    private let gap: CGFloat = 3

    var body: some View {
        let target = base + exercise, over = max(0, eaten - target)
        VStack(spacing: 4) {
            GeometryReader { geo in
                let scale = max(target, eaten, 1), width = geo.size.width
                let x = { (value: Double) in CGFloat(value / scale) * width }
                ZStack(alignment: .leading) {
                    segment(Palette.gold.opacity(0.16), from: 0, to: x(base), last: exercise <= 0 && over <= 0)
                    if exercise > 0 { segment(Palette.rust.opacity(0.18), from: x(base), to: x(target), last: over <= 0) }
                    segment(Palette.gold, from: 0, to: x(min(eaten, base)), last: eaten <= base)
                    if eaten > base, exercise > 0 { segment(Palette.rust, from: x(base), to: x(min(eaten, target)), last: over <= 0) }
                    if over > 0 { segment(Palette.red, from: x(target), to: x(eaten), last: true) }
                }
                .frame(width: width, height: height, alignment: .leading)
                .clipShape(Capsule())
                .overlay(alignment: .topLeading) {
                    // Past the target the line marks the target; before it, today's share.
                    if let mark = over > 0 ? Optional(target) : byToday, mark > 0, mark < scale {
                        Capsule().fill(Palette.ink).frame(width: 2, height: height + 8).offset(x: x(mark) - 1, y: -4)
                    }
                }
            }
            .frame(height: height)
            GeometryReader { geo in
                let scale = max(target, eaten, 1)
                if let mark = over > 0 ? Optional(target) : byToday, mark > 0, mark < scale {
                    let label = over > 0 ? L10n.f("cíl %@", Fmt.int(target)) : L10n.f("do dneška %@", Fmt.int(mark))
                    Text(verbatim: label).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).fixedSize()
                        .position(x: min(max(CGFloat(mark / scale) * geo.size.width, 50), geo.size.width - 50), y: 8)
                }
            }
            .frame(height: 16)
        }
        .accessibilityElement()
        .accessibilityLabel(L10n.f("Snězeno %@ z %@ kcal", Fmt.int(eaten), Fmt.int(target)))
    }

    /// One part of the bar from x to x, with a thin gap before the next part.
    private func segment(_ color: Color, from start: CGFloat, to end: CGFloat, last: Bool) -> some View {
        let width = max(0, end - start - (last ? 0 : gap))
        return Rectangle().fill(color).frame(width: width, height: height).offset(x: start)
    }
}
