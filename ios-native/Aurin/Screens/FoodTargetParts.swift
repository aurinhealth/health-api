import SwiftUI

/// The day's calorie target in its parts under the bar on Food: "Base 2,300,
/// Workouts +200, Planned +150 ›" on one line (redesign J); Base is neutral,
/// only the workouts (green) and the plans (an amber ring) have a colour. A day
/// without training says so; an own calorie goal has no parts.
struct TargetPartsRow: View {
    let parts: FoodSnapshot.TargetParts?
    let target: Double
    /// A chevron: the row opens where the numbers come from.
    var more = false

    var body: some View {
        HStack(spacing: 12) {
            // One line; where it doesn't fit (Czech), Planned goes to a second one.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 14) { head; tail }
                VStack(alignment: .leading, spacing: 4) { HStack(spacing: 14) { head }; tail }
            }
            Spacer(minLength: 0)
            if more {
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                    .accessibilityHidden(true)
            }
        }
        .font(Typo.caption)
        .frame(minHeight: 32)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(more ? .isButton : [])
    }

    @ViewBuilder private var head: some View {
        if let parts {
            part("Základ", Fmt.int(parts.base), dot: nil)
            if parts.workouts <= 0 && parts.planned <= 0 {
                Text(verbatim: L10n.tr("Den volna, žádný trénink navíc")).foregroundStyle(Palette.muted).lineLimit(1)
            } else if parts.workouts > 0 {
                part("Tréninky", "+" + Fmt.int(parts.workouts), dot: AnyView(Circle().fill(Palette.green)), note: burned(parts))
            }
        } else {
            part("Vlastní cíl", Fmt.int(target), dot: nil)
        }
    }

    @ViewBuilder private var tail: some View {
        if let parts, parts.planned > 0 {
            part("Naplánováno", "+" + Fmt.int(parts.planned), dot: AnyView(Circle().strokeBorder(Palette.amber, lineWidth: 1.5)))
        }
    }

    /// "(of 244 burned)": the target counts only part of a workout's burn, on
    /// purpose (about 70 %), so "+171" next to a 244 kcal ride doesn't read as a
    /// mistake (617 p1 v4, the sentence under the row is gone). Only when it is
    /// part: a target held up by the safe minimum counts the whole burn.
    private func burned(_ parts: FoodSnapshot.TargetParts) -> String? {
        guard let burned = parts.burnedDone, burned.rounded() > parts.workouts.rounded() else { return nil }
        return L10n.f("(ze spálených %@)", Fmt.int(burned))
    }

    private func part(_ title: String, _ value: String, dot: AnyView?, note: String? = nil) -> some View {
        HStack(spacing: 5) {
            if let dot { dot.frame(width: 7, height: 7) }
            Text(verbatim: L10n.tr(title)).foregroundStyle(Palette.muted)
            Text(verbatim: value).fontWeight(.semibold).monospacedDigit().foregroundStyle(Palette.ink)
            if let note { Text(verbatim: note).monospacedDigit().foregroundStyle(Palette.muted) }
        }
        .lineLimit(1)
        .fixedSize()
    }

    /// "Base 2,300, Workouts +200, Planned +150" for VoiceOver.
    private var spoken: String {
        guard let parts else { return L10n.tr("Vlastní cíl") + " " + Fmt.int(target) }
        var list = [L10n.tr("Základ") + " " + Fmt.int(parts.base)]
        if parts.workouts <= 0 && parts.planned <= 0 { list.append(L10n.tr("Den volna, žádný trénink navíc")) }
        if parts.workouts > 0 { list.append(([L10n.tr("Tréninky") + " +" + Fmt.int(parts.workouts), burned(parts)].compactMap { $0 }).joined(separator: " ")) }
        if parts.planned > 0 { list.append(L10n.tr("Naplánováno") + " +" + Fmt.int(parts.planned)) }
        return list.joined(separator: ", ")
    }
}

/// A plan is not done yet: its part of the bar is striped.
struct Stripes: View {
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
