import Charts
import SwiftUI

// The new Health tab (redesign H2): Aurin age on top with its last 12 weeks,
// what shapes it and the coach, then the cards the athlete can reorder:
// Health monitor, Sleep, Body and Journal. Free accounts see Aurin age
// locked (Pro concept), a new account "Collecting your data." with one next
// step, no watch a card with "Connect a device" (D-ZDRAVI-1, -6).

// MARK: - Aurin age words

extension AurinAgeText {
    /// "2.4 years younger" under the number: against the real age.
    static func versusAge(_ age: HealthAurinAge) -> String? {
        guard let real = age.age else { return nil }
        let diff = age.value - real
        if abs(diff) < 0.05 { return L10n.tr("stejně jako tvůj věk") }
        return effect(diff)
    }

    /// "−1.3 years since Aug 17" (D-ZDRAVI-2): the change, with its unit and start.
    static func change(_ age: HealthAurinAge) -> String? {
        let weeks = twelveWeeks(age)
        guard let first = weeks.first, let last = weeks.last, first.date != last.date else { return nil }
        let diff = last.value - first.value
        let size = Fmt.decimal(abs(diff), digits: 1)
        if abs(diff) < 0.05 { return L10n.f("beze změny od %@", Fmt.dayMonth(first.date)) }
        return L10n.f(diff < 0 ? "−%@ roku od %@" : "+%@ roku od %@", size, Fmt.dayMonth(first.date))
    }

    /// The estimates of the last 12 weeks (84 days up to the newest).
    static func twelveWeeks(_ age: HealthAurinAge) -> [Point] {
        guard let last = age.series.last, let from = AppModel.shift(last.date, by: -84) else { return age.series }
        return age.series.filter { $0.date >= from }
    }

    /// The three groups of "What shapes it", years + older / − younger, as the
    /// server adds them up (own-vo2max.js compositeYears): fitness is VO2max with
    /// a quarter of resting heart rate, activity and steps, capped at ±5; sleep
    /// is length and regularity, capped at ±1.5.
    static func groups(_ parts: [String: Double]) -> [(key: String, years: Double)] {
        var out: [(key: String, years: Double)] = []
        if let vo2 = parts["vo2max"] {
            let rest = (parts["restingHeartRate"] ?? 0) + (parts["activity"] ?? 0) + (parts["steps"] ?? 0)
            out.append(("fitness", max(-5, min(5, vo2 + 0.25 * rest))))
        }
        if let strength = parts["strength"] { out.append(("strength", strength)) }
        if parts["sleep"] != nil || parts["sleepRegularity"] != nil {
            out.append(("sleep", max(-1.5, min(1.5, (parts["sleep"] ?? 0) + (parts["sleepRegularity"] ?? 0)))))
        }
        if let waist = parts["waist"] { out.append(("waist", waist)) }
        return out
    }

    static func groupTitle(_ key: String) -> String {
        switch key {
        case "fitness": return "Kondice"
        case "strength": return "Síla"
        case "sleep": return "Spánek"
        default: return "Pas"
        }
    }

    /// The coach card's sentence, from rules, no AI (plan): the biggest chance
    /// to win years back, or what does most of the work.
    static func coachSentence(_ age: HealthAurinAge) -> (String, String?) {
        if let best = age.gains.max(by: { $0.value < $1.value }), best.value >= 0.3 {
            let what: String
            switch best.key {
            case "sleep", "sleepRegularity": what = "Spánek je tvoje největší šance."
            case "strength": what = "Posilovna je tvoje největší šance."
            case "steps", "activity": what = "Pohyb přes den je tvoje největší šance."
            default: what = "Kondice je tvoje největší šance."
            }
            return (L10n.tr(what), L10n.f("Mohl by ti ubrat asi %@ roku z Aurin age.", Fmt.decimal(best.value, digits: 1)))
        }
        if let top = groups(age.parts).min(by: { $0.years < $1.years }), top.years < -0.05 {
            return (L10n.f("Nejvíc pro tebe dělá %@.", L10n.isEnglish ? L10n.tr(groupTitle(top.key)) : L10n.tr(groupTitle(top.key)).lowercased(with: Fmt.locale)), L10n.tr("Drž to tak dál."))
        }
        return (L10n.tr("Aurin age se počítá z kondice, síly a spánku."), nil)
    }
}

// MARK: - Orb

/// The Aurin age orb (concept 1 and 25): a dark, slowly moving shape with a
/// glowing gold rim, specks of light along it and a glow from below, green
/// when the estimate is younger, warm orange when older. The orb is dark in
/// light mode too (the light concept draws it the same), with a soft shadow
/// in place of the halo. While it collects data it is a quiet grey pearl.
/// Drawn in Canvas; it stands still with Reduce Motion or Low Power Mode.
struct AurinOrb: View {
    enum Mood { case younger, older, collecting }
    var mood: Mood
    var size: CGFloat = 250
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme

    /// The glow from below: the dark-mode status colours, since the orb is dark in both modes.
    static let youngerGlow = Color(hex: 0x8FE6C4)
    static let olderGlow = Color(hex: 0xFF9238)
    static let rim = Color(hex: 0xE9B970)

    /// The words on the orb, light on its dark body in both modes.
    static func wordsColor(older: Bool) -> Color { older ? olderGlow : youngerGlow }

    private var glow: Color { mood == .older ? Self.olderGlow : Self.youngerGlow }

    var body: some View {
        let still = reduceMotion || LowPower.shared.on
        TimelineView(.animation(minimumInterval: 1 / 30, paused: still)) { timeline in
            let t = still ? 0.8 : timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1000)
            // Drawn on a canvas larger than the orb's frame, so the halo
            // fades out instead of ending in a square (critic 2026-11-21).
            Canvas { context, canvas in
                let center = CGPoint(x: canvas.width / 2, y: canvas.height / 2)
                let radius = size * (mood == .collecting ? 0.36 : 0.41)
                if mood == .collecting {
                    drawPearl(&context, center: center, radius: radius, t: t)
                } else {
                    drawLit(&context, center: center, radius: radius, t: t)
                }
            }
            .frame(width: size * 1.6, height: size * 1.6)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// The estimate: dark body, gold rim with its glow, the glow from below, specks.
    private func drawLit(_ context: inout GraphicsContext, center: CGPoint, radius: CGFloat, t: Double) {
        let dark = scheme == .dark
        let shape = Self.blob(center: center, radius: radius, t: t * 0.35)
        // Around it: a warm halo at night, a soft shadow on paper.
        var halo = context
        halo.addFilter(.blur(radius: radius * 0.3))
        halo.fill(Self.blob(center: center, radius: radius * 1.15, t: t * 0.35),
                  with: .color(dark ? Self.rim.opacity(0.22) : Color.black.opacity(0.16)))
        var warm = context
        warm.addFilter(.blur(radius: radius * 0.12))
        warm.stroke(Self.blob(center: center, radius: radius * 1.02, t: t * 0.35), with: .color(Self.rim.opacity(dark ? 0.35 : 0.45)), lineWidth: radius * 0.08)
        // The body, near black, a touch lighter towards the top.
        context.fill(shape, with: .radialGradient(
            Gradient(colors: [Color(white: 0.03), Color(white: 0.05), Color(white: 0.09)]),
            center: CGPoint(x: center.x, y: center.y - radius * 0.2), startRadius: 0, endRadius: radius * 1.15))
        // The glow from below, inside the shape only, under the words.
        var inside = context
        inside.clip(to: shape)
        inside.addFilter(.blur(radius: radius * 0.12))
        inside.fill(Path(ellipseIn: CGRect(x: center.x - radius * 0.8, y: center.y + radius * 0.78, width: radius * 1.6, height: radius * 0.7)),
                    with: .color(glow.opacity(0.8)))
        // The rim: a blurred gold glow and a thin bright line on it.
        var rimGlow = context
        rimGlow.addFilter(.blur(radius: 5))
        rimGlow.stroke(shape, with: .color(Self.rim.opacity(0.75)), lineWidth: 5)
        context.stroke(shape, with: .linearGradient(
            Gradient(colors: [Self.rim.opacity(0.95), Self.rim.opacity(0.7), glow.opacity(0.9)]),
            startPoint: CGPoint(x: center.x, y: center.y - radius), endPoint: CGPoint(x: center.x, y: center.y + radius)), lineWidth: 1.4)
        // Specks of light just inside the rim, denser at the bottom.
        for i in 0..<150 {
            let seed = Double(i) * 12.9898
            let turn: Double = i % 2 == 0 ? 1 : -1
            let place = abs((sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1))
            let angle = place * 2 * Double.pi + t * 0.05 * turn
            let depth = 0.78 + 0.2 * abs((sin(seed * 1.7) * 9631.3).truncatingRemainder(dividingBy: 1))
            let reach = Double(radius) * depth * (1 + 0.05 * sin(3 * angle + t * 0.35))
            let point = CGPoint(x: Double(center.x) + cos(angle) * reach, y: Double(center.y) + sin(angle) * reach)
            let twinkle = 0.5 + 0.5 * sin(t * 1.3 + seed)
            let bright = 0.25 + 0.6 * twinkle * (0.55 + 0.45 * max(0, sin(angle)))
            let side = i % 7 == 0 ? 2.2 : 1.4
            let colour = sin(angle) > 0.45 ? glow : (i % 3 == 0 ? Self.rim : Color.white)
            context.fill(Path(ellipseIn: CGRect(x: point.x - side / 2, y: point.y - side / 2, width: side, height: side)),
                         with: .color(colour.opacity(bright)))
        }
    }

    /// Collecting (concept 24): a dim pearl, dark at night and light on paper, no glow.
    private func drawPearl(_ context: inout GraphicsContext, center: CGPoint, radius: CGFloat, t: Double) {
        let dark = scheme == .dark
        let circle = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        var shadow = context
        shadow.addFilter(.blur(radius: radius * 0.18))
        shadow.fill(circle.offsetBy(dx: 0, dy: radius * 0.06), with: .color(Color.black.opacity(dark ? 0.5 : 0.2)))
        context.fill(circle, with: .radialGradient(
            Gradient(colors: dark ? [Color(white: 0.10), Color(white: 0.06)] : [Color(white: 0.99), Color(white: 0.90)]),
            center: CGPoint(x: center.x - radius * 0.3, y: center.y - radius * 0.35), startRadius: 0, endRadius: radius * 1.5))
        context.stroke(circle, with: .color(dark ? Color.white.opacity(0.14) : Color.black.opacity(0.08)), lineWidth: 1)
    }

    /// A rounded shape that breathes: slow waves around its edge.
    static func blob(center: CGPoint, radius: CGFloat, t: Double) -> Path {
        var path = Path()
        let steps = 120
        for i in 0...steps {
            let a = Double(i) / Double(steps) * 2 * .pi
            let r = radius * (1 + 0.07 * sin(3 * a + t) + 0.035 * sin(5 * a - 1.3 * t) + 0.025 * sin(2 * a + 0.7 * t))
            let p = CGPoint(x: center.x + cos(a) * r, y: center.y + sin(a) * r)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}

// MARK: - Hero

/// Aurin age on top of Health: the orb with the estimate, the words against
/// the real age, the change since 12 weeks ago and when it was updated.
struct AurinAgeHero: View {
    let health: HealthSnapshot
    var pro: Bool
    var noWearable = false

    var body: some View {
        VStack(spacing: 10) {
            if let age = health.aurinAge {
                RouteLink(route: .aurinAge) { estimate(age) }
            } else if !pro {
                locked
            } else {
                collecting
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func estimate(_ age: HealthAurinAge) -> some View {
        let words = AurinAgeText.versusAge(age)
        let older = (age.age.map { age.value - $0 } ?? 0) > 0.05
        return VStack(spacing: 8) {
            ZStack {
                AurinOrb(mood: older ? .older : .younger)
                VStack(spacing: 4) {
                    // Light on the orb's dark body in both modes (concept 1, light concept 1).
                    Text(verbatim: Fmt.decimal(age.value, digits: 1)).font(Typo.number(76)).foregroundStyle(Color(white: 0.96))
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(verbatim: L10n.tr("Odhad Aurin age").uppercased(with: Fmt.locale))
                        .font(.caption2.weight(.medium)).tracking(1.4).foregroundStyle(Color(white: 0.72))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    if let words {
                        Text(verbatim: words).font(Typo.body).foregroundStyle(AurinOrb.wordsColor(older: older))
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                .padding(.horizontal, 74)
                .offset(y: -12)
            }
            Text(verbatim: updated(age)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([L10n.f("Aurin age, odhad %@", Fmt.decimal(age.value, digits: 1)), words, AurinAgeText.change(age), updated(age)].compactMap { $0 }.joined(separator: ", "))
    }

    private func updated(_ age: HealthAurinAge) -> String {
        let real = age.age.map { L10n.f("Tvůj věk %@.", Fmt.int($0)) + " " } ?? ""
        return real + L10n.f("Aktualizováno %@.", Fmt.dayMonth(age.date))
    }

    /// Pro concept state 5: the orb with loose dots and one next step.
    private var collecting: some View {
        VStack(spacing: 8) {
            ZStack {
                AurinOrb(mood: .collecting)
                Text("Sbírám tvoje data.").font(Typo.heading(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).padding(.horizontal, 50)
            }
            Text(verbatim: nextStep).font(Typo.body).foregroundStyle(Palette.secondary)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
        }
        .accessibilityElement(children: .combine)
    }

    /// The one thing the estimate misses now (VO2max first: it needs one).
    private var nextStep: String {
        if health.vo2max == nil {
            return L10n.tr(noWearable ? "Další krok k odhadu Aurin age: připoj hodinky nebo prsten a dej si 20 minut běhu venku."
                                      : "Další krok k odhadu Aurin age: jeden odhad VO2max. Dej si 20 minut běhu venku s hodinkami.")
        }
        return L10n.tr("Další krok k odhadu Aurin age: týden spánku s hodinkami nebo pravidelná posilovna.")
    }

    /// Without Pro (Pro concept): the orb locked with its dots and the way to unlock.
    private var locked: some View {
        VStack(spacing: 12) {
            AurinOrb(mood: .collecting)
            Text("Aurin age").font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
            // The lock in the button, styled like Add entry (Pro concept).
            NavigationLink { SubscriptionView() } label: {
                Label { Text("Odemknout s Aurin Pro") } icon: { Image(systemName: "lock.fill") }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 22).frame(minHeight: 48)
                    .background(Palette.track, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Last 12 weeks

struct AurinAgeTrendCard: View {
    let age: HealthAurinAge

    private var points: [Point] { AurinAgeText.twelveWeeks(age) }

    /// Days between the first and the newest estimate shown.
    private var span: Int {
        guard let first = points.first?.date, let last = points.last?.date,
              let a = ISODay.date(first), let b = ISODay.date(last) else { return 0 }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: a, to: b).day ?? 0
    }

    /// A line needs a few estimates over two weeks at least; before that the
    /// card says so in a sentence, not as a flat line over two days (device
    /// test of build 602, point 43).
    private var short: Bool { points.count < 3 || span < 14 }

    var body: some View {
        RouteLink(route: .aurinAge) {
            Card {
                HStack {
                    SectionLabel(text: "Posledních 12 týdnů")
                    Spacer()
                    if !short {
                        let diff = (points.last?.value ?? 0) - (points.first?.value ?? 0)
                        let size = Fmt.decimal(abs(diff), digits: 1)
                        // "1.3 years lower" as in the concept; the start date is on the axis.
                        let change = abs(diff) < 0.05 ? L10n.tr("beze změny") : L10n.f(diff < 0 ? "o %@ roku níž" : "o %@ roku výš", size)
                        // Grey when nothing changed; orange only for older (point 44).
                        let colour = abs(diff) < 0.05 ? Palette.muted : diff < 0 ? Palette.Status.good : Palette.amber
                        Pill(text: change, foreground: colour, background: colour.opacity(0.14))
                    }
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                if short {
                    Text(verbatim: shortText).font(Typo.body).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    chart
                }
            }
        }
    }

    /// "The line starts once there are two weeks of estimates. First one Nov 17."
    private var shortText: String {
        let first = points.first.map { " " + L10n.f("První odhad je z %@.", Fmt.dayMonth($0.date)) } ?? ""
        return L10n.tr("Čára se začne kreslit po dvou týdnech odhadů.") + first
    }

    private var chart: some View {
        let values = points.map(\.value)
        let lo = (values.min() ?? 0) - 0.3, hi = (values.max() ?? 1) + 0.3
        let older = (points.last?.value ?? 0) - (points.first?.value ?? 0) > 0.05
        // The line in the estimate's colour, as in the concept: green younger, orange older.
        let colour = older ? Palette.amber : Palette.Status.good
        return Chart {
            ForEach(points, id: \.date) { p in
                LineMark(x: .value("Den", ISODay.date(p.date) ?? Date()), y: .value("Věk", p.value))
                    .foregroundStyle(colour)
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Den", ISODay.date(p.date) ?? Date()), y: .value("Věk", p.value))
                    .foregroundStyle(colour).symbolSize(points.count > 20 ? 0 : 14)
            }
            if let last = points.last {
                PointMark(x: .value("Den", ISODay.date(last.date) ?? Date()), y: .value("Věk", last.value))
                    .foregroundStyle(colour).symbolSize(70)
            }
        }
        .chartYScale(domain: lo...hi)
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: max(7, span / 3))) { _ in
                AxisValueLabel(format: .dateTime.day().month(.abbreviated).locale(Fmt.locale)).foregroundStyle(Palette.faint)
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in
                AxisGridLine().foregroundStyle(Palette.hairline)
                AxisValueLabel().foregroundStyle(Palette.faint)
            }
        }
        .frame(height: 130)
        .accessibilityLabel(AurinAgeText.change(age) ?? L10n.tr("Posledních 12 týdnů"))
    }
}

// MARK: - What shapes it

/// "What shapes it": Fitness, Strength and Sleep in years, a bar from the
/// middle mark (no effect), no icons (D-ZDRAVI-9).
struct AurinAgeShapes: View {
    let age: HealthAurinAge
    var health: HealthSnapshot? = nil

    var body: some View {
        let groups = AurinAgeText.groups(age.parts).sorted { abs($0.years) > abs($1.years) }
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Co ho tvoří")
            Card {
                ForEach(Array(groups.enumerated()), id: \.element.key) { i, g in
                    if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    row(g.key, g.years)
                }
            }
        }
    }

    private func row(_ key: String, _ years: Double) -> some View {
        let colour = years < -0.05 ? Palette.Status.good : years > 0.05 ? Palette.amber : Palette.muted
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(AurinAgeText.groupTitle(key))).font(Typo.body).foregroundStyle(Palette.ink)
                if let note = note(key) { Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            EffectBar(years: years).frame(width: 56, height: 8).accessibilityHidden(true)
            // The years as a big serif number with the words under it (concept 1).
            VStack(alignment: .trailing, spacing: 0) {
                if abs(years) >= 0.05 {
                    Text(verbatim: Fmt.decimal(abs(years), digits: 1)).font(Typo.number(24)).foregroundStyle(colour)
                }
                Text(verbatim: L10n.tr(years < -0.05 ? "roku mladší" : years > 0.05 ? "roku starší" : "bez vlivu"))
                    .font(.caption2).foregroundStyle(colour).lineLimit(1)
            }
            .frame(minWidth: 72, alignment: .trailing)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([L10n.tr(AurinAgeText.groupTitle(key)), note(key), AurinAgeText.effect(years)].compactMap { $0 }.joined(separator: ", "))
    }

    private func note(_ key: String) -> String? {
        switch key {
        case "fitness": return health?.vo2max.map { "VO2max " + Fmt.decimal($0.value, digits: 1) }
        case "strength": return L10n.tr((age.parts["strength"] ?? 0) < 0 ? "posilovna každý týden" : "zatím bez pravidelné posilovny")
        case "sleep":
            // "avg 5 h 42 min": the week's nights, as the sleep row of the concept.
            guard let nights = health?.sleep.week.map(\.value), !nights.isEmpty else { return nil }
            return L10n.f("průměr %@ za týden", Fmt.duration(Int(nights.reduce(0, +) / Double(nights.count))))
        default: return nil
        }
    }
}

/// A short bar from the middle mark: right is younger (better), left older (concept 2).
struct EffectBar: View {
    let years: Double
    var scale = 3.0

    var body: some View {
        GeometryReader { geo in
            let mid = geo.size.width / 2
            let len = min(1, abs(years) / scale) * mid
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Rectangle().fill(Palette.ink.opacity(0.5)).frame(width: 1.5).offset(x: mid - 0.75)
                Capsule().fill(years < 0 ? Palette.Status.good : Palette.amber)
                    .frame(width: max(2, len))
                    .offset(x: years < 0 ? mid : mid - len)
            }
        }
    }
}

/// The coach under Aurin age: a rule-based sentence (no AI) and Ask Coach.
struct AurinAgeCoachCard: View {
    let age: HealthAurinAge

    var body: some View {
        let sentence = AurinAgeText.coachSentence(age)
        CoachSentenceCard(lead: sentence.0, key: sentence.1)
    }
}

/// A coach card without AI: Two lights with "Coach", the sentence in the
/// coach's serif with the key sentence in green italic, and Ask Coach
/// (consistency point 4; max 2 sentences).
struct CoachSentenceCard: View {
    let lead: String
    var key: String? = nil
    var view = "health"
    @State private var open = false

    var body: some View {
        Card {
            HStack(spacing: 8) {
                TwoLights(size: 20)
                Text("Kouč").font(.caption.weight(.medium)).tracking(1.2).foregroundStyle(Palette.muted)
            }
            (Text(verbatim: lead + (key == nil || lead.isEmpty ? "" : " "))
                + Text(verbatim: key ?? "").italic().foregroundColor(Palette.Status.good))
                .font(Typo.coach(21)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            CoachActionRow { open = true }
        }
        .sheet(isPresented: $open) { CoachEntry.chat(subject: nil, view: view, date: nil) }
    }
}

// MARK: - Health monitor

/// Five values against the athlete's usual range as small dials, one sentence
/// on top in the words of the details, readiness as a row (D-ZDRAVI-3).
struct HealthMonitorCard: View {
    let health: HealthSnapshot
    @Environment(\.dynamicTypeSize) private var typeSize

    struct Dial: Identifiable {
        let id: HealthValue
        let label: String
        let value: Double
        let text: String
        let unit: String
        let low: Double?
        let high: Double?
        let state: MetricState?
    }

    static func dials(_ h: HealthSnapshot) -> [Dial] {
        var out: [Dial] = []
        let st = { (k: String) in h.states?[k]?.metricState }
        if let r = h.restingHR, let v = r.value {
            out.append(Dial(id: .restingHR, label: "Tep v klidu", value: v, text: Fmt.int(v), unit: L10n.tr("bpm"), low: r.usual?.lowerBound, high: r.usual?.upperBound, state: st("restingHR")))
        }
        if let x = h.hrv, let v = x.value {
            out.append(Dial(id: .hrv, label: "HRV", value: v, text: Fmt.int(v), unit: L10n.tr("ms"), low: x.low, high: x.high, state: st("hrv")))
        }
        if let o = h.oxygen {
            // Oxygen tops out at 100 %: a night above the usual range is not
            // news, and a band of a point or two made 98 % "far above" (device
            // test of build 602, point 51). The band is at least 3 points wide
            // and only below it counts.
            let band = Self.oxygenBand(low: o.low, high: o.high)
            out.append(Dial(id: .oxygen, label: "Kyslík", value: o.value, text: Fmt.int(o.value), unit: "%", low: band?.lowerBound, high: band?.upperBound,
                            state: Self.oxygenState(st("oxygen"), value: o.value, band: band)))
        }
        if let r = h.respiration {
            out.append(Dial(id: .respiration, label: "Dech", value: r.value, text: Fmt.decimal(r.value, digits: 1), unit: L10n.tr("za min"),
                            low: r.baseline.map { $0 - 0.5 }, high: r.baseline.map { $0 + 0.5 }, state: st("respiration") ?? (r.elevated ? .off(above: true) : nil)))
        }
        if let d = h.wristTemp?.deviation ?? h.skinTemp?.deviation {
            let elevated = h.skinTemp?.elevated == true
            // "0.1 °C warmer" in words, no sign (concept 1, point 52).
            let change = Units.temperatureChange(d)
            // The direction under the dial, the dial keeps the unit (Czech did not fit).
            let label = abs(change) < 0.05 ? "Teplota kůže" : change > 0 ? "Kůže tepleji" : "Kůže chladněji"
            out.append(Dial(id: .temperature, label: label, value: d, text: Fmt.decimal(abs(change), digits: 1), unit: Units.temperatureUnit,
                            low: -0.5, high: 0.5, state: elevated ? .off(above: true) : abs(d) <= 0.5 ? .within : .off(above: d > 0)))
        }
        return out
    }

    /// Where the dot is drawn: on the side the state names, so the dial and
    /// the card's sentence never disagree (critic 2026-11-21).
    static func drawn(_ d: Dial) -> Double {
        guard let low = d.low, let high = d.high, high > low, let state = d.state else { return d.value }
        let step = (high - low) * 0.25
        switch state {
        case .within: return min(high, max(low, d.value))
        case .off(let above), .far(let above): return above ? max(d.value, high + step) : min(d.value, low - step)
        }
    }

    /// Oxygen's state for the card and its detail alike: never above, and
    /// within anywhere inside the widened band.
    static func oxygenState(_ state: MetricState?, value: Double, band: ClosedRange<Double>?) -> MetricState? {
        guard let state else { return nil }
        switch state {
        case .off(above: true), .far(above: true): return .within
        default: break
        }
        if let band, value >= band.lowerBound { return .within }
        return state
    }

    /// The usual oxygen range drawn at least 3 points wide, never above 100 %.
    static func oxygenBand(low: Double, high: Double) -> ClosedRange<Double>? {
        guard high > low else { return nil }
        guard high - low < 3 else { return low...min(100, high) }
        let top = min(100, max(high, (low + high) / 2 + 1.5))
        return (top - 3)...top
    }

    /// The card's sentence: the first value off its range in the detail's own
    /// words, else all within; no threshold of its own (tester's D-ZDRAVI-3).
    static func title(_ dials: [Dial]) -> String {
        if let off = dials.first(where: { $0.state != nil && $0.state != .within }), let state = off.state {
            return L10n.tr(off.label) + " " + state.words
        }
        if !dials.isEmpty, dials.allSatisfy({ $0.state == .within }) {
            return dials.count == 5 ? L10n.tr("Všech pět v tvém obvyklém rozmezí.") : L10n.tr("Vše v tvém obvyklém rozmezí.")
        }
        return L10n.tr("Minulá noc")
    }

    var body: some View {
        let dials = Self.dials(health)
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Health monitor")
            Card {
                Text(verbatim: Self.title(dials)).font(Typo.heading(22, relativeTo: .title3)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                // All five in one row (concept 1, point 49); a grid only at the
                // accessibility text sizes, where five no longer fit.
                if typeSize >= .xxxLarge {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 12) { ForEach(dials) { dialLink($0) } }
                } else {
                    HStack(alignment: .top, spacing: 2) { ForEach(dials) { dialLink($0) } }
                }
                Text("Tečka je minulá noc. Zelený oblouk je tvoje obvyklé rozmezí za 30 dní.").font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let shown = readinessText {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    RouteLink(route: .readiness) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Připravenost").font(Typo.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: shown).font(health.readiness.score == nil ? Typo.caption : Typo.number(24))
                                .foregroundStyle(health.readiness.score == nil ? Palette.muted : ReadinessText.pill(health.readiness.zone)?.1 ?? Palette.ink)
                            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                }
            }
        }
    }

    /// The score, or how far a new athlete's baseline is.
    private var readinessText: String? {
        if let score = health.readiness.score { return String(score) }
        if let days = health.readiness.learningDays { return L10n.f("učí se, %@ ze 14 dní", String(days)) }
        return nil
    }

    private func dialLink(_ d: Dial) -> some View {
        NavigationLink(value: d.id == .temperature ? AppRoute.metric(.temperature) : AppRoute.metric(HealthMetric(rawValue: d.id.rawValue) ?? .hrv)) {
            VStack(spacing: 4) {
                MiniDial(value: Self.drawn(d), low: d.low, high: d.high, off: d.state != nil && d.state != .within) {
                    VStack(spacing: 0) {
                        Text(verbatim: d.text).font(Typo.number(16))
                            .foregroundStyle(d.state == nil ? Palette.ink : d.state == .within ? Palette.Status.good : Palette.amber).lineLimit(1).minimumScaleFactor(0.6)
                        Text(verbatim: d.unit).font(.caption2).foregroundStyle(Palette.faint).lineLimit(1).minimumScaleFactor(0.6)
                    }
                }
                .frame(width: 54, height: 54)
                Text(verbatim: L10n.tr(d.label)).font(.caption2).foregroundStyle(Palette.muted).lineLimit(2).multilineTextAlignment(.center)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([L10n.tr(d.label), d.text + " " + d.unit, d.state?.words].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
    }
}

/// A 240° dial: the track, the usual range as a green arc, last night as a dot.
struct MiniDial<Center: View>: View {
    let value: Double
    let low: Double?
    let high: Double?
    var off = false
    @ViewBuilder var center: Center

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let lineWidth: CGFloat = 4
            let r = side / 2 - lineWidth
            let c = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let start = 150.0, sweep = 240.0
            let span = (low != nil && high != nil && high! > low!) ? high! - low! : max(abs(value) * 0.2, 1)
            let lo = (low ?? value - span) - span, hi = (high ?? value + span) + span
            let at = { (v: Double) in start + sweep * min(1, max(0, (v - lo) / (hi - lo))) }
            ZStack {
                arc(c, r, start, start + sweep).stroke(Palette.track, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                if let low, let high, high > low {
                    arc(c, r, at(low), at(high)).stroke(Palette.Status.good.opacity(0.75), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                }
                let a = at(value) * .pi / 180
                Circle().fill(off ? Palette.Status.warn : Palette.ink)
                    .overlay { Circle().stroke(Palette.card, lineWidth: 1.5) }
                    .frame(width: 8, height: 8)
                    .position(x: c.x + cos(a) * r, y: c.y + sin(a) * r)
                center.position(c)
            }
        }
    }

    private func arc(_ c: CGPoint, _ r: CGFloat, _ from: Double, _ to: Double) -> Path {
        var p = Path()
        p.addArc(center: c, radius: r, startAngle: .degrees(from), endAngle: .degrees(to), clockwise: false)
        return p
    }
}

// MARK: - Sleep

/// Last night as an arc from falling asleep to waking on an evening-to-morning
/// scale (the shared drawing with Today, evening to morning colours), the
/// week's nights as dots against the need and tonight's plan in one row.
struct SleepNightCard: View {
    let sleep: HealthSnapshot.Sleep
    /// The day Health shows: its week is drawn, with this night circled.
    var date: String? = nil

    private static func minutes(_ clock: String?) -> Double? {
        guard let clock, clock.count >= 4 else { return nil }
        let parts = clock.split(separator: ":").compactMap { Double($0) }
        guard parts.count >= 2 else { return nil }
        return parts[0] * 60 + parts[1]
    }

    /// Minutes after 20:00 on the 20:00 to 10:00 scale.
    private static func onScale(_ m: Double) -> Double { (m - 20 * 60 + 24 * 60).truncatingRemainder(dividingBy: 24 * 60) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Spánek")
            Card {
                RouteLink(route: .sleep) {
                    VStack(spacing: 6) {
                        arcView.frame(height: 150)
                        week
                    }
                    .contentShape(Rectangle())
                }
                Rectangle().fill(Palette.hairline).frame(height: 1)
                RouteLink(route: .sleepSettings) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Dnes v noci").font(Typo.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Text(verbatim: tonight).font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
                        Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
            }
        }
    }

    private var tonight: String {
        let t = sleep.tonight
        switch (t.bedtime, t.wake) {
        case let (bed?, wake?): return L10n.f("v posteli do %@, budík %@", ClockText.format(bed), ClockText.format(wake))
        case let (bed?, nil): return L10n.f("v posteli do %@", ClockText.format(bed))
        default: return L10n.f("potřeba %@", Fmt.duration(t.need))
        }
    }

    private var arcView: some View {
        let night = sleep.night
        let span = 14.0 * 60
        let from = Self.minutes(night?.start).map(Self.onScale)
        let to = Self.minutes(night?.end).map(Self.onScale)
        return GeometryReader { geo in
            let w = geo.size.width
            let r = min(w / 2 - 20, geo.size.height - 16)
            let c = CGPoint(x: w / 2, y: geo.size.height - 4)
            let angle = { (m: Double) in Angle.degrees(180 + 180 * min(1, max(0, m / span))) }
            ZStack {
                Path { p in p.addArc(center: c, radius: r, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false) }
                    .stroke(Palette.track, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                if let from, let to, to > from {
                    Path { p in p.addArc(center: c, radius: r, startAngle: angle(from), endAngle: angle(to), clockwise: false) }
                        .stroke(LinearGradient(colors: [Palette.amber, Palette.Status.good], startPoint: .leading, endPoint: .trailing),
                                style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .shadow(color: Palette.Status.good.opacity(0.35), radius: 6)
                }
                VStack(spacing: 2) {
                    Text(verbatim: L10n.tr("Minulá noc").uppercased(with: Fmt.locale)).font(.caption2.weight(.medium)).tracking(1.6).foregroundStyle(Palette.muted)
                    Text(verbatim: night?.minutes.map { Fmt.duration(Int($0)) } ?? "–").font(Typo.number(34)).foregroundStyle(Palette.ink)
                    if let short = shortText { Text(verbatim: short).font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                .position(x: c.x, y: c.y - r * 0.42)
                // Falling asleep and waking at the ends of the night's arc (concept 1, point 54).
                if let from, let to, to > from, let start = night?.start, let end = night?.end {
                    let a = angle(from).radians, b = angle(to).radians
                    let out = r + 18
                    Text(verbatim: ClockText.format(start)).font(.caption2.weight(.medium)).foregroundStyle(Palette.muted)
                        .position(x: c.x + cos(a) * out - 6, y: max(8, c.y + sin(a) * out))
                    Text(verbatim: ClockText.format(end)).font(.caption2.weight(.medium)).foregroundStyle(Palette.muted)
                        .position(x: c.x + cos(b) * out + 6, y: max(8, c.y + sin(b) * out))
                }
                Text(verbatim: ClockText.format(minutes: 20 * 60)).font(.caption2).foregroundStyle(Palette.faint).position(x: c.x - r, y: c.y + 2)
                Text(verbatim: ClockText.format(minutes: 10 * 60)).font(.caption2).foregroundStyle(Palette.faint).position(x: c.x + r, y: c.y + 2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([L10n.tr("Minulá noc"), night?.minutes.map { Fmt.hoursMinutesSpoken($0) }, shortText].compactMap { $0 }.joined(separator: ", "))
    }

    /// "6 min short of 7 h 30 min", or "reached your need".
    private var shortText: String? {
        guard let m = sleep.night?.minutes else { return nil }
        let need = Double(sleep.need)
        if m >= need { return L10n.tr("potřeba splněna") }
        return L10n.f("%@ méně než %@", Fmt.duration(Int(need - m)), Fmt.duration(sleep.need))
    }

    private var week: some View {
        let need = Double(sleep.need)
        let last = date ?? sleep.week.last?.date ?? AppModel.localDate(Date())
        // This week Monday to Sunday (concept 1, point 54): the last night is
        // circled, nights still to come stay empty.
        let monday = ISODay.shift(last, -ISODay.weekdayIndex(last))
        let days = (0..<7).map { ISODay.shift(monday, $0) }
        let byDay = Dictionary(sleep.week.map { ($0.date, $0.value) }, uniquingKeysWith: { _, b in b })
        let slept = days.compactMap { byDay[$0] }
        let reached = slept.filter { $0 >= need }.count
        return WeekDots(days: days, nights: byDay, last: last, need: need, reached: reached, count: slept.count)
    }

    private struct WeekDots: View {
        let days: [String]
        let nights: [String: Double]
        let last: String
        let need: Double
        let reached: Int
        let count: Int

        var body: some View {
            VStack(spacing: 6) {
                HStack(spacing: 14) {
                    ForEach(Array(days.enumerated()), id: \.element) { i, day in
                        VStack(spacing: 4) {
                            dot(day)
                            Text(verbatim: String(Fmt.weekdaysFromMonday[i].prefix(1)).uppercased(with: Fmt.locale)).font(.caption2)
                                .foregroundStyle(day == last ? Palette.ink : Palette.faint)
                        }
                    }
                }
                if count > 0 {
                    Text(verbatim: L10n.f("%@ ze %@ nocí s plnou potřebou", String(reached), String(count))).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .accessibilityElement(children: .combine)
        }

        private func dot(_ day: String) -> some View {
            // Full need green, a shorter night grey, no night an empty ring.
            let colour = nights[day].map { $0 >= need ? Palette.Status.good : Palette.muted } ?? .clear
            return Circle().fill(colour).frame(width: 8, height: 8)
                .overlay { if nights[day] == nil { Circle().stroke(Palette.faint, lineWidth: 1) } }
                .overlay { if day == last { Circle().stroke(Palette.ink, lineWidth: 1.2).frame(width: 14, height: 14) } }
                .frame(width: 14, height: 14)
        }
    }
}

// MARK: - Body

/// Weight, body fat and muscle as one card with a switch (concept 1, the
/// tiles rule): the chosen one's line in ink (D-ZDRAVI-5), what changed,
/// "Not part of your Aurin age." and Add entry.
struct BodyCard: View {
    let health: HealthSnapshot
    @State private var picked: HealthValue = .weight
    @State private var adding = false

    private var options: [HealthValue] {
        [HealthValue.weight, .bodyFat, .muscle].filter { v in
            switch v {
            case .weight: return health.weight != nil
            case .bodyFat: return health.weight?.bodyFat != nil
            default: return health.weight?.muscle != nil
            }
        }
    }

    private func series(_ v: HealthValue) -> [Point] {
        switch v {
        case .bodyFat: return health.weight?.bodyFat?.series ?? []
        case .muscle: return (health.weight?.muscle?.series ?? []).map { Point(date: $0.date, value: Units.weight($0.value)) }
        default: return (health.weight?.series ?? []).map { Point(date: $0.date, value: Units.weight($0.value)) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Tělo")
            Card {
                if options.isEmpty {
                    Text("Zapiš si váhu a začne se kreslit graf.").font(Typo.body).foregroundStyle(Palette.secondary)
                } else {
                    let shown = options.contains(picked) ? picked : options[0]
                    HStack(spacing: 8) {
                        ForEach(options) { v in
                            let list = series(v)
                            Button { picked = v } label: {
                                VStack(spacing: 2) {
                                    Text(verbatim: L10n.tr(v.title)).font(.caption).foregroundStyle(v == shown ? Palette.ink : Palette.muted).lineLimit(1)
                                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                                        Text(verbatim: list.last.map { Fmt.decimal($0.value, digits: 1) } ?? "–").font(Typo.number(20)).foregroundStyle(Palette.ink)
                                        Text(verbatim: L10n.tr(v.unit)).font(.caption2).foregroundStyle(Palette.faint)
                                    }
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                }
                                .frame(maxWidth: .infinity).padding(.vertical, 8)
                                .background(Palette.track.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(v == shown ? Palette.ink : .clear, lineWidth: 1.5) }
                                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(v == shown ? .isSelected : [])
                        }
                    }
                    RouteLink(route: shown == .weight ? .weight : .metric(shown == .bodyFat ? .bodyFat : .muscle)) {
                        VStack(alignment: .leading, spacing: 8) {
                            line(series(shown)).frame(height: 110)
                            Text(verbatim: summary(shown)).font(Typo.caption).foregroundStyle(Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .contentShape(Rectangle())
                    }
                }
                Button { adding = true } label: {
                    Label { Text("Přidat záznam") } icon: { Image(systemName: "plus") }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Palette.track, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Zapsat váhu"))
            }
        }
        .sheet(isPresented: $adding) { WeightEntrySheet() }
    }

    private func line(_ list: [Point]) -> some View {
        let values = list.map(\.value)
        let lo = (values.min() ?? 0) - 0.3, hi = (values.max() ?? 1) + 0.3
        return Chart {
            ForEach(list, id: \.date) { p in
                LineMark(x: .value("Den", ISODay.date(p.date) ?? Date()), y: .value("Hodnota", p.value))
                    .foregroundStyle(Palette.ink.opacity(0.85))
                PointMark(x: .value("Den", ISODay.date(p.date) ?? Date()), y: .value("Hodnota", p.value))
                    .foregroundStyle(Palette.ink.opacity(0.85)).symbolSize(14)
            }
        }
        .chartYScale(domain: lo...hi)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel(format: .dateTime.day().month(.abbreviated).locale(Fmt.locale)).foregroundStyle(Palette.faint)
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in
                AxisGridLine().foregroundStyle(Palette.hairline)
                AxisValueLabel().foregroundStyle(Palette.faint)
            }
        }
        .accessibilityHidden(true)
    }

    /// "Down 1.2 kg since Aug 17. Not part of your Aurin age."
    private func summary(_ v: HealthValue) -> String {
        let list = series(v)
        var text = ""
        if let first = list.first, let last = list.last, first.date != last.date {
            let diff = last.value - first.value
            let size = Fmt.decimal(abs(diff), digits: 1) + " " + L10n.tr(v.unit)
            text = abs(diff) < 0.05 ? L10n.f("Beze změny od %@", Fmt.dayMonth(first.date))
                : L10n.f(diff < 0 ? "O %@ níž od %@" : "O %@ výš od %@", size, Fmt.dayMonth(first.date))
            text += ". "
        }
        return text + L10n.tr("Není součástí Aurin age.")
    }
}

// MARK: - No watch

/// No watch or ring (D-ZDRAVI-6): what is missing and one action.
struct NoDeviceCard: View {
    var connect: () -> Void

    var body: some View {
        Card {
            Text("Bez hodinek nebo prstenu").font(Typo.heading(22, relativeTo: .title3)).foregroundStyle(Palette.ink)
            Text("Připravenost potřebuje spánek, HRV a klidový tep z hodinek nebo prstenu. Do té doby se plán řídí tvým tréninkem.")
                .font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            Button(action: connect) {
                Text("Připojit zařízení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Palette.track, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Aurin age page

/// Aurin age on the detail template: the estimate, its chart, what shapes it
/// and how it is estimated ("Not a medical assessment", no "biological age").
struct AurinAgePage: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var period: ChartPeriod = .months3
    @State private var loaded: [ChartPeriod: HealthSeries] = [:]

    var body: some View {
        DetailTemplate(title: "Aurin age") {
            CoachEntry(subject: coach, view: "health")
        } content: {
            AurinAgeDetailContent(health: health, period: $period, loaded: loaded[period])
        }
        .task(id: period) {
            guard loaded[period] == nil, !model.demo else { return }
            if let series = try? await model.api.healthSeries(metric: "aurinAge", period: period) { loaded[period] = series }
        }
    }

    private var coach: CoachSubject {
        CoachSubject(kind: .metric, title: "Aurin age", line: health.aurinAge.map { L10n.f("Odhad Aurin age %@", Fmt.decimal($0.value, digits: 1)) },
                     metric: "aurinAge", date: health.date, view: "health", symbol: "heart.circle", color: Palette.green,
                     questions: ["Jak snížit Aurin age?", "Co mi nejvíc pomáhá?"])
    }
}

/// The Aurin age page without the scroll view, so tests can render it whole.
struct AurinAgeDetailContent: View {
    let health: HealthSnapshot
    @Binding var period: ChartPeriod
    var loaded: HealthSeries? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let age = health.aurinAge {
                DetailHeadline(value: Fmt.decimal(age.value, digits: 1), unit: L10n.tr("let"), usual: AurinAgeText.versusAge(age))
                let points = loaded?.shown ?? age.series.map { ChartPoint(date: $0.date, value: $0.value) }
                Card {
                    DetailChart(points: points, today: health.date, period: $period, digits: 1,
                                note: "Každý bod je odhad Aurinu z toho dne.")
                }
                .padding(.top, 12)
                AurinAgeShapes(age: age, health: health).padding(.top, 28)
                Text("Prostřední čárka je bez vlivu na tvůj věk. Vpravo je lépe.").font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
            } else {
                Card { LearningState(kind: .missing, text: "Aurin age potřebuje jeden odhad VO2max a pár týdnů tréninku a spánku.") }
                    .padding(.top, 20)
            }
            HowMeasuredCard(text: "Aurin age je odhad podle tvé kondice, síly a spánku ve srovnání s lidmi různého věku. Nejde o lékařské hodnocení.",
                            rows: [])
                .padding(.top, 28)
        }
    }
}
