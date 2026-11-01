import SwiftUI

/// The day's calorie target in three parts under the big number on Food: the
/// base, the workouts already done and the ones still planned (targetParts in
/// src/app-food.js). A tap opens where the numbers come from.
struct TargetPartsRow: View {
    let parts: FoodSnapshot.TargetParts

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TargetPartsBar(parts: parts)
            HStack(alignment: .top, spacing: 0) {
                column("Základ", Fmt.int(parts.base), color: Palette.brown)
                column("Tréninky", added(parts.workouts), color: Palette.green, empty: parts.workouts <= 0)
                column("Naplánováno", added(parts.planned), color: Palette.amber, empty: parts.planned <= 0, planned: true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Základ") + " " + Fmt.int(parts.base) + ", " + L10n.tr("Tréninky") + " " + added(parts.workouts)
            + ", " + L10n.tr("Naplánováno") + " " + added(parts.planned))
        .accessibilityAddTraits(.isButton)
    }

    private func added(_ value: Double) -> String { value > 0 ? "+" + Fmt.int(value) : "0" }

    private func column(_ title: String, _ value: String, color: Color, empty: Bool = false, planned: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                // A plan is not done yet: a ring, as its part of the bar is striped.
                Group {
                    if planned { Circle().strokeBorder(color, lineWidth: 1.5) } else { Circle().fill(color) }
                }
                .frame(width: 7, height: 7)
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Text(verbatim: value).font(Typo.number(22)).foregroundStyle(empty ? Palette.faint : Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One thin bar: the base, the workouts done and the planned ones (striped).
struct TargetPartsBar: View {
    let parts: FoodSnapshot.TargetParts

    var body: some View {
        let total = max(parts.base + parts.workouts + parts.planned, 1)
        GeometryReader { geo in
            let gaps = CGFloat([parts.workouts, parts.planned].filter { $0 > 0 }.count) * 2
            let width = max(geo.size.width - gaps, 0)
            HStack(spacing: 2) {
                Rectangle().fill(Palette.brown).frame(width: width * parts.base / total)
                if parts.workouts > 0 { Rectangle().fill(Palette.green).frame(width: width * parts.workouts / total) }
                if parts.planned > 0 { Stripes(color: Palette.amber).frame(width: width * parts.planned / total) }
            }
        }
        .frame(height: 6)
        .clipShape(Capsule())
        .accessibilityHidden(true)
    }
}

/// A plan is not done yet: its part of the bar is striped.
private struct Stripes: View {
    let color: Color

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(color.opacity(0.35)))
            var x: CGFloat = -size.height
            while x < size.width {
                var path = Path()
                path.move(to: CGPoint(x: x, y: size.height)); path.addLine(to: CGPoint(x: x + size.height, y: 0))
                path.addLine(to: CGPoint(x: x + size.height + 3, y: 0)); path.addLine(to: CGPoint(x: x + 3, y: size.height))
                path.closeSubpath()
                context.fill(path, with: .color(color))
                x += 6
            }
        }
    }
}

/// Where the day's target comes from: the base line by line, each workout
/// done and planned with what it adds, and the target.
struct TargetPartsSheet: View {
    let parts: FoodSnapshot.TargetParts
    let target: Double
    let isToday: Bool
    /// A day gone by keeps only what was done: no plan section.
    var past = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.tr(isToday ? "Dnešní cíl" : "Cíl dne")).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .padding(.bottom, 6)

                section("Základ")
                if let lines = parts.lines {
                    line("Klidový výdej", Fmt.int(lines.restingBurn))
                    if lines.movement > 0 { line("Běžný pohyb", Fmt.signed(lines.movement)) }
                    if lines.goal != 0 { line("Cíl hmotnosti", Fmt.signed(lines.goal)) }
                    if lines.minimum > 0 { line("Bezpečné minimum", Fmt.signed(lines.minimum)) }
                    if lines.moreActive > 0 { line("Aktivnější den", Fmt.signed(lines.moreActive)) }
                } else {
                    line("Základ", Fmt.int(parts.base))
                }

                section("Tréninky")
                workouts("done", empty: "Zatím žádný trénink", color: Palette.green)
                if !past || !items("planned").isEmpty {
                    section("Naplánováno")
                    workouts("planned", empty: "Nic naplánováno", color: Palette.amber)
                }

                HStack(alignment: .firstTextBaseline) {
                    Text(L10n.tr("Cílový příjem")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Text(verbatim: Fmt.int(target) + " kcal").font(Typo.number(30)).foregroundStyle(Palette.ink)
                }
                .padding(.top, 14)
                .overlay(alignment: .top) { Rectangle().fill(Palette.muted.opacity(0.35)).frame(height: 1) }
                .padding(.top, 6)

                if !(parts.items ?? []).isEmpty {
                    Text(L10n.f("Tréninky se počítají ze %@ %% toho, co spálí.", Fmt.int((parts.coverage ?? 0.7) * 100)))
                        .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 12)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .glassSheetBackground()
    }

    private func items(_ kind: String) -> [FoodSnapshot.TargetParts.Item] { (parts.items ?? []).filter { $0.kind == kind } }

    private func section(_ title: String) -> some View {
        Text(L10n.tr(title).uppercased()).font(Typo.caption.weight(.medium)).tracking(1.6).foregroundStyle(Palette.muted)
            .padding(.top, 18).padding(.bottom, 2)
    }

    private func line(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink)
            Spacer()
            Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    @ViewBuilder private func workouts(_ kind: String, empty: String, color: Color) -> some View {
        let list = items(kind)
        if list.isEmpty {
            Text(L10n.tr(empty)).font(Typo.body).foregroundStyle(Palette.faint).padding(.vertical, 10)
        }
        ForEach(Array(list.enumerated()), id: \.offset) { _, item in
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: Self.symbol(item.type)).font(.subheadline.weight(.semibold)).foregroundStyle(color)
                    .frame(width: 22).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: item.name ?? L10n.tr(kind == "planned" ? "Plánovaný trénink" : "Odcvičený trénink"))
                        .font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
                    Text(verbatim: detail(item)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer()
                Text(verbatim: Fmt.signed(item.counted)).font(Typo.number(22)).foregroundStyle(color)
            }
            .padding(.vertical, 10)
        }
    }

    private func detail(_ item: FoodSnapshot.TargetParts.Item) -> String {
        let kcal = item.kind == "planned" ? L10n.f("asi %@ kcal", Fmt.int(item.kcal)) : Fmt.int(item.kcal) + " kcal"
        guard let minutes = item.minutes, minutes > 0 else { return kcal }
        return Fmt.duration(Int(minutes.rounded())) + " · " + kcal
    }

    /// The activity's symbol by its type (Intervals.icu / Google Health names).
    static func symbol(_ type: String?) -> String {
        let t = (type ?? "").lowercased()
        if t.contains("ride") || t.contains("cycl") || t.contains("bik") { return "bicycle" }
        if t.contains("run") { return "figure.run" }
        if t.contains("swim") { return "figure.pool.swim" }
        if t.contains("weight") || t.contains("strength") || t.contains("gym") { return "dumbbell.fill" }
        if t.contains("walk") || t.contains("hike") { return "figure.walk" }
        if t.contains("yoga") || t.contains("stretch") { return "figure.flexibility" }
        return "figure.mixed.cardio"
    }
}
