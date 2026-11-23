import SwiftUI

// The home-screen widgets' faces in the new design (widgets concept v3,
// Petr's "Dobrý" 2026-11-19): every small widget is a part of Today or Health
// on a card, never a card type of its own. The dial is Today's (RangeDial,
// concept D): the usual range or the target as a green band, the value as a
// filled dot, a running total (strain, water, steps) as a filled arc. Caps
// label on top, the number in Instrument Serif in the dial, one line with a
// concrete number under it. In Shared, so the app's tests render the same
// faces the widget extension shows (WidgetFaceTests).

enum WidgetStyle {
    static func serif(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Regular", fixedSize: size) }
    static func italic(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Italic", fixedSize: size) }
    /// Small spaced capitals over a widget ("READINESS"), 11 pt like the app's smallest text.
    static let label = Font.system(size: 11, weight: .semibold)
    static let caption = Font.system(size: 11, weight: .medium)

    static func int(_ v: Double?) -> String {
        guard let v else { return "–" }
        return Int(v.rounded()).formatted(.number.locale(L10n.locale))
    }

    static func decimal(_ v: Double?) -> String {
        guard let v else { return "–" }
        return v.formatted(.number.precision(.fractionLength(1)).locale(L10n.locale))
    }

    /// "6 h 54", "7 h", "42 min": the app's one way to write a length (D-ZDRAVI-12).
    static func length(_ minutes: Double?) -> String {
        guard let minutes else { return "–" }
        let m = Int(minutes.rounded())
        if m < 60 { return "\(m)\u{00A0}min" }
        return m % 60 == 0 ? "\(m / 60)\u{00A0}h" : "\(m / 60)\u{00A0}h\u{00A0}" + String(format: "%02d", m % 60)
    }

    /// Water as the app writes it: "0,8 l" or "27 fl oz".
    static func water(_ ml: Double?) -> String {
        if Units.imperial { return int(Units.volume(ml ?? 0)) + "\u{00A0}" + Units.volumeUnit }
        return decimal((ml ?? 0) / 1000) + "\u{00A0}l"
    }

    /// The sport's figure, as Training's discs draw it (SportDisc): gym is the lifting figure.
    static func symbol(_ sport: String?) -> String {
        switch sport?.lowercased() {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "strength", "gym", "weighttraining": return "figure.strengthtraining.traditional"
        case "swim": return "figure.pool.swim"
        case "walk": return "figure.walk"
        case "yoga": return "figure.yoga"
        default: return "figure.mixed.cardio"
        }
    }
}

/// Today's dial (RangeDial) at widget size: a three-quarter arc open at the
/// bottom, the band, a running total as a filled arc and the value as a dot.
struct WidgetDial<Center: View>: View {
    var value: Double?
    var scale: ClosedRange<Double> = 0...1
    var band: ClosedRange<Double>? = nil
    /// A running total (strain, water, steps): the arc filled up to the value.
    var fill: Color? = nil
    /// The value's dot; nil draws none.
    var dot: Color? = nil
    var size: CGFloat = 86
    var lineWidth: CGFloat = 7
    @ViewBuilder var center: Center

    private static var sweep: Double { 0.75 }

    private func part(_ v: Double) -> Double {
        let span = scale.upperBound - scale.lowerBound
        guard span > 0 else { return 0 }
        return min(max((v - scale.lowerBound) / span, 0), 1) * Self.sweep
    }

    var body: some View {
        ZStack {
            arc(0, Self.sweep).stroke(Palette.track, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            if let band {
                arc(part(band.lowerBound), part(band.upperBound))
                    .stroke(Palette.green.opacity(0.85), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .widgetAccentable()
            }
            if let fill, let value, part(value) > 0 {
                arc(0, part(value))
                    .stroke(fill, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .widgetAccentable()
            }
            if let value, let dot {
                let angle = Angle.degrees(135 + 360 * part(value))
                let radius = (size - lineWidth) / 2
                Circle().fill(dot)
                    .overlay(Circle().strokeBorder(Palette.card, lineWidth: 2))
                    .frame(width: lineWidth + 5, height: lineWidth + 5)
                    .offset(x: radius * cos(angle.radians), y: radius * sin(angle.radians))
                    .widgetAccentable()
            }
            center
                .multilineTextAlignment(.center)
                .frame(maxWidth: (size - 2 * lineWidth) * 0.86)
        }
        .frame(width: size, height: size)
    }

    private func arc(_ a: Double, _ b: Double) -> some Shape {
        Circle()
            .inset(by: lineWidth / 2)
            .trim(from: a, to: max(a, b))
            .rotation(.degrees(135))
    }
}

/// A small widget with one dial: Readiness, Strain, HRV, Water, Resting HR, Steps.
struct SmallDialFace: View {
    var title: String
    var value: Double?
    var scale: ClosedRange<Double> = 0...1
    var band: ClosedRange<Double>? = nil
    var fill: Color? = nil
    var dot: Color? = nil
    /// The number in the dial; nil shows `empty` instead (no data yet).
    var number: String?
    var unit: String? = nil
    var empty: String? = nil
    var caption: String?
    var captionColor: Color = Palette.muted
    /// Green inside the usual range, as the concept's 78, 68 and 53.
    var numberColor: Color = Palette.ink

    var body: some View {
        VStack(spacing: 4) {
            WidgetLabel(text: title)
            // As big as the widget allows, up to 86 pt (smaller iPhones have smaller widgets).
            GeometryReader { geo in
                let side = max(56, min(86, geo.size.width, geo.size.height))
                dial(side).frame(width: geo.size.width, height: geo.size.height)
            }
            Text(verbatim: caption ?? " ").font(WidgetStyle.caption).foregroundStyle(captionColor)
                .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: [title, number.map { [$0, unit].compactMap { $0 }.joined(separator: " ") } ?? empty, caption]
            .compactMap { $0 }.joined(separator: ", ")))
    }

    private func dial(_ side: CGFloat) -> some View {
            WidgetDial(value: number == nil ? nil : value, scale: scale, band: band, fill: fill, dot: dot, size: side) {
                if let number {
                    VStack(spacing: 0) {
                        Text(verbatim: number).font(WidgetStyle.serif(side * 0.35)).foregroundStyle(numberColor)
                            .lineLimit(1).minimumScaleFactor(0.6)
                            .widgetAccentable()
                        if let unit {
                            Text(verbatim: unit).font(WidgetStyle.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                    }
                } else {
                    Text(verbatim: empty ?? L10n.tr("Bez dat")).font(WidgetStyle.caption).foregroundStyle(Palette.muted)
                        .lineLimit(2).minimumScaleFactor(0.8)
                }
            }
    }
}

/// "READINESS": the widget's name in small spaced capitals, as the app's SectionLabel.
struct WidgetLabel: View {
    let text: String
    var alignment: Alignment = .center

    var body: some View {
        Text(verbatim: text.uppercased(with: L10n.locale))
            .font(WidgetStyle.label).tracking(1.2)
            .foregroundStyle(Palette.muted)
            .lineLimit(1).minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, alignment: alignment)
    }
}

/// Sleep (small): Today's night arc from falling asleep to waking, the length
/// inside under "LAST NIGHT" and the night against its need under it.
struct SleepArcFace: View {
    var minutes: Double?
    var start: String?
    var end: String?
    var need: Int?
    /// No watch or ring: the empty state says what it needs.
    var noWearable = false

    private let lineWidth: CGFloat = 7

    var body: some View {
        VStack(spacing: 4) {
            WidgetLabel(text: L10n.tr("Spánek"))
            // Today's night arc: a half circle from falling asleep (left) to waking (right).
            GeometryReader { geo in
                let width = min(geo.size.width - 8, geo.size.height * 2 - 8)
                ZStack(alignment: .bottom) {
                    Circle().inset(by: lineWidth / 2).trim(from: 0.5, to: 1)
                        .stroke(minutes == nil ? AnyShapeStyle(Palette.track)
                                : AnyShapeStyle(LinearGradient(colors: [Palette.amberBar, Palette.indigo], startPoint: .leading, endPoint: .trailing)),
                                style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                        .frame(width: width, height: width)
                        .offset(y: width / 2)
                        .frame(width: width, height: width / 2, alignment: .top)
                        .clipped()
                        .widgetAccentable()
                    if let minutes {
                        VStack(spacing: 0) {
                            Text(verbatim: L10n.tr("Minulá noc").uppercased(with: L10n.locale))
                                .font(WidgetStyle.label).tracking(0.6).foregroundStyle(Palette.muted)
                                .lineLimit(1).fixedSize()
                            Text(verbatim: WidgetStyle.length(minutes)).font(WidgetStyle.serif(24)).foregroundStyle(Palette.ink)
                                .lineLimit(1).minimumScaleFactor(0.6)
                                .widgetAccentable()
                        }
                        .frame(maxWidth: width - 2 * lineWidth - 8)
                    } else {
                        Text(verbatim: L10n.tr("Bez spánku")).font(WidgetStyle.caption).foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.center).frame(maxWidth: width * 0.7)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
            }
            if let minutes, minutes > 0, let start, let end {
                // The night's ends under the arc's two ends.
                HStack {
                    Text(verbatim: ClockText.format(start))
                    Spacer(minLength: 4)
                    Text(verbatim: ClockText.format(end))
                }
                .font(WidgetStyle.caption).foregroundStyle(Palette.muted)
                .lineLimit(1)
            }
            Text(verbatim: caption ?? " ").font(WidgetStyle.caption).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: [L10n.tr("Spánek"), minutes.map { WidgetStyle.length($0) } ?? L10n.tr("Bez spánku"), caption]
            .compactMap { $0 }.joined(separator: ", ")))
    }

    /// "6 min short of 7 h", as under Today's sleep dial.
    private var caption: String? {
        guard let minutes else {
            return noWearable ? L10n.tr("Potřebuje hodinky nebo prsten") : L10n.tr("Otevři Aurin a načti minulou noc")
        }
        guard let need, need > 0 else { return nil }
        let gap = Int((Double(need) - minutes).rounded())
        let needText = WidgetStyle.length(Double(need))
        if gap > 0 { return L10n.f("o %@ méně než %@", WidgetStyle.length(Double(gap)), needText) }
        if gap < 0 { return L10n.f("o %@ víc než %@", WidgetStyle.length(Double(-gap)), needText) }
        return L10n.f("přesně %@", needText)
    }
}

/// The sport's disc from Training (SportDisc): its colour as a soft fill, the figure in full colour.
struct WidgetSportDisc: View {
    let sport: String?
    var size: CGFloat = 30
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let color = Palette.Sport.color(sport ?? "")
        ZStack {
            Circle().fill(color.opacity(scheme == .dark ? 0.24 : 0.15))
            Image(systemName: WidgetStyle.symbol(sport))
                .font(.system(size: size * 0.5, weight: .medium))
                .foregroundStyle(color)
                .widgetAccentable()
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Next workout (small): the sport's disc, the name, when, and how long, as Training's rows.
struct NextWorkoutSmallFace: View {
    var title: String?
    var sport: String?
    var time: String?
    var minutes: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            WidgetSportDisc(sport: title == nil ? nil : sport)
            Spacer(minLength: 4)
            if let title {
                Text(verbatim: title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                    .lineLimit(2).minimumScaleFactor(0.8)
                Text(verbatim: L10n.tr("Dnes") + (time.map { " " + ClockText.format($0) } ?? ""))
                    .font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
                if let minutes {
                    Text(verbatim: WidgetStyle.length(Double(minutes))).font(WidgetStyle.serif(24)).foregroundStyle(Palette.ink)
                        .lineLimit(1).widgetAccentable()
                }
            } else {
                Text(verbatim: L10n.tr("Dnes už nic")).font(WidgetStyle.serif(24)).foregroundStyle(Palette.ink)
                    .lineLimit(2).minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Food (small): Food's hero, the calories eaten against the day's target and its bar.
struct FoodSmallFace: View {
    var kcal: Double?
    var target: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            WidgetLabel(text: L10n.tr("Jídlo"), alignment: .leading)
            Spacer(minLength: 0)
            Text(verbatim: WidgetStyle.int(kcal ?? 0)).font(WidgetStyle.serif(44)).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                .widgetAccentable()
            if let target, target > 0 {
                Text(verbatim: (kcal ?? 0) > 0 ? L10n.f("z %@ kcal", WidgetStyle.int(target)) : L10n.tr("Zatím nic nezapsáno"))
                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
                    .lineLimit(1)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.track)
                        Capsule().fill(Palette.ink)
                            .frame(width: geo.size.width * min(1, max(0, (kcal ?? 0) / target)))
                            .widgetAccentable()
                    }
                }
                .frame(height: 4)
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The small faces from the snapshot the app saved (WidgetBridge).
@MainActor
enum WidgetFaces {
    /// Readiness as the readiness detail's dial (0 to 100, the zone's dot). In
    /// the usual range in green, below it in neutral ink (MDR: no warning colour).
    static func readiness(_ s: WidgetSnapshot) -> SmallDialFace {
        let title = L10n.tr("Připravenost")
        guard let score = s.readiness else {
            if s.learningDays != nil {
                return SmallDialFace(title: title, number: nil, empty: L10n.tr("Bez dat"), caption: L10n.tr("Učím se tvoje obvyklé hodnoty"))
            }
            if s.noWearable == true {
                return SmallDialFace(title: title, number: nil, empty: L10n.tr("Bez zařízení"), caption: L10n.tr("Potřebuje hodinky nebo prsten v noci"))
            }
            return SmallDialFace(title: title, number: nil, empty: L10n.tr("Bez dat"), caption: L10n.tr("Otevři Aurin a načti minulou noc"))
        }
        let usual = s.zone == "green"
        return SmallDialFace(title: title, value: Double(score), scale: 0...100,
                             dot: usual ? Palette.green : Palette.ink.opacity(0.45), number: String(score),
                             caption: s.zone == nil ? nil : L10n.tr(usual ? "v obvyklém rozmezí" : "pod obvyklým rozmezím"),
                             captionColor: usual ? Palette.green : Palette.muted, numberColor: usual ? Palette.green : Palette.ink)
    }

    /// The day's strain adding up against today's target: "target 11 to 14".
    static func strain(_ s: WidgetSnapshot) -> SmallDialFace {
        let band = s.strainLow.flatMap { low in s.strainHigh.map { low...max(low, $0) } }
        return SmallDialFace(title: L10n.tr("Námaha"), value: s.strain, scale: 0...21, band: band, dot: Palette.ink,
                             number: s.strain.map { WidgetStyle.decimal($0) } ?? (band == nil ? nil : WidgetStyle.decimal(0)),
                             unit: L10n.tr("z 21"), empty: L10n.tr("Bez dat"),
                             caption: band.map { L10n.f("cíl %@ až %@", WidgetStyle.int($0.lowerBound), WidgetStyle.int($0.upperBound)) }
                                ?? L10n.tr("Učím se tvůj cíl"))
    }

    static func hrv(_ s: WidgetSnapshot) -> SmallDialFace {
        usual(L10n.tr("HRV"), s.hrv, s.hrvLow, s.hrvHigh, unit: "ms", empty: L10n.tr("Bez HRV"), noWearable: s.noWearable == true)
    }

    static func restingHR(_ s: WidgetSnapshot) -> SmallDialFace {
        usual(L10n.tr("Klidový tep"), s.restingHR, s.restingLow, s.restingHigh, unit: "bpm", empty: L10n.tr("Bez dat"), noWearable: s.noWearable == true)
    }

    /// A value against the usual range: "usual 60 to 74" in green inside it, neutral outside.
    private static func usual(_ title: String, _ value: Double?, _ low: Double?, _ high: Double?, unit: String, empty: String, noWearable: Bool) -> SmallDialFace {
        guard let value else {
            return SmallDialFace(title: title, number: nil, empty: empty,
                                 caption: noWearable ? L10n.tr("Potřebuje hodinky nebo prsten") : L10n.tr("Otevři Aurin a načti minulou noc"))
        }
        guard let low, let high, high > low else {
            return SmallDialFace(title: title, value: nil, scale: 0...1, number: WidgetStyle.int(value), unit: unit,
                                 caption: L10n.tr("Učím se tvoje obvyklé hodnoty"))
        }
        let pad = (high - low) * 1.2
        let inside = value >= low && value <= high
        return SmallDialFace(title: title, value: value, scale: max(0, min(low - pad, value - 5))...max(high + pad, value + 5), band: low...high,
                             dot: inside ? Palette.green : Palette.ink.opacity(0.45), number: WidgetStyle.int(value), unit: unit,
                             caption: L10n.f("obvykle %@ až %@", WidgetStyle.int(low), WidgetStyle.int(high)),
                             captionColor: inside ? Palette.green : Palette.muted, numberColor: inside ? Palette.green : Palette.ink)
    }

    /// Water drunk today against the target: "0,8 l", "of 2,5 l".
    static func water(_ s: WidgetSnapshot) -> SmallDialFace {
        let target = s.waterTarget ?? 0
        let shown = WidgetStyle.water(s.waterMl)
        // Without a goal a full arc would read as "goal reached".
        return SmallDialFace(title: L10n.tr("Voda"), value: target > 0 ? (s.waterMl ?? 0) : nil, scale: 0...max(1, target),
                             fill: Palette.green, number: shown,
                             caption: target > 0 ? L10n.f("z %@", WidgetStyle.water(target)) : L10n.tr("bez cíle"))
    }

    /// Steps against the goal, the usual day under it: "your average 9,212 a day".
    static func steps(_ s: WidgetSnapshot) -> SmallDialFace {
        let goal = s.stepsGoal ?? 0
        // No steps yet after midnight are "–", not a real count of 0 (WidgetSnapshot.current).
        return SmallDialFace(title: L10n.tr("Kroky"), value: goal > 0 ? s.steps : nil, scale: 0...max(1, goal),
                             fill: Palette.green, number: WidgetStyle.int(s.steps),
                             unit: goal > 0 ? L10n.f("z %@", WidgetStyle.int(goal)) : nil,
                             caption: s.stepsAverage.map { L10n.f("průměr %@ denně", WidgetStyle.int($0)) })
    }

    /// Calories still to eat today against the target.
    static func kcalLeft(_ s: WidgetSnapshot) -> SmallDialFace {
        guard let target = s.kcalTarget, target > 0 else {
            return SmallDialFace(title: L10n.tr("Zbývá kalorií"), number: nil, caption: nil)
        }
        let eaten = s.kcal ?? 0
        return SmallDialFace(title: L10n.tr("Zbývá kalorií"), value: eaten, scale: 0...target, fill: Palette.ink.opacity(0.85),
                             number: WidgetStyle.int(max(0, target - eaten)), unit: "kcal",
                             caption: L10n.f("z %@ kcal", WidgetStyle.int(target)))
    }

    static func sleep(_ s: WidgetSnapshot) -> SleepArcFace {
        SleepArcFace(minutes: s.sleepMinutes, start: s.sleepStart, end: s.sleepEnd, need: s.sleepNeed, noWearable: s.noWearable == true)
    }

    static func next(_ s: WidgetSnapshot) -> NextWorkoutSmallFace {
        NextWorkoutSmallFace(title: s.nextTitle, sport: s.nextSport, time: s.nextTime, minutes: s.nextMinutes)
    }

    static func food(_ s: WidgetSnapshot) -> FoodSmallFace {
        FoodSmallFace(kcal: s.kcal, target: s.kcalTarget)
    }
}
