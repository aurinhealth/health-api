import SwiftUI

// The details behind the first page (watch concept 03, approved 2026-11-23):
// each is one big dial in the Health style, the number, the usual range or
// the target as the green band, today's dot, a pill and one sentence. Back at
// the top left, the coach at the top right; the history is one turn of the
// crown down.

/// One detail: what it is, the big dial, the pill, a sentence in the serif
/// and a short line under it.
struct DialDetail: View {
    let label: String
    let dial: WatchDial
    /// The pill: green within the usual range or on target, grey otherwise.
    var pill: (text: String, good: Bool)?
    let sentence: String
    var note: String?

    var body: some View {
        VStack(spacing: 0) {
            Text(label)
                .watchFont(13, .medium)
                .foregroundStyle(W.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            dial.padding(.top, 4)
            if let pill {
                Text(pill.text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(pill.good ? W.green : W.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(pill.good ? W.green.opacity(0.14) : Color.white.opacity(0.09), in: Capsule())
                    .padding(.top, 4)
            }
            Text(sentence)
                .font(W.serif(W.small ? 16 : 17))
                .foregroundStyle(W.num)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 5)
            if let note {
                Text(note)
                    .watchFont(13)
                    .foregroundStyle(W.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        // VoiceOver reads the page as one (watch audit G1).
        .accessibilityElement(children: .combine)
    }

    static var dialSize: CGFloat { W.small ? 84 : 100 }
}

/// The coach at the top right of every detail (concept 03).
struct CoachCorner: ViewModifier {
    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ReadinessHome.Page.coach) { WatchCoachLights() }
                    .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
    }
}

extension View {
    func coachCorner() -> some View { modifier(CoachCorner()) }
}

extension W {
    /// The Health tint of the sleep, HRV and resting HR details (concept 03).
    static let healthGlow = Glow.sleep

    /// "6 h 54 min" (Petr 2026-11-23: durations as "4 h 23 min"); "1 h 18"
    /// without "min" in the narrow stage columns.
    static func hours(_ minutes: Double, min: Bool = true) -> String {
        let m = Int(minutes.rounded())
        if m < 60 { return "\(m) min" }
        if m % 60 == 0 { return "\(m / 60) h" }
        return "\(m / 60) h " + (min ? "\(m % 60) min" : String(format: "%02d", m % 60))
    }

    /// "60 to 74" / "60 až 74".
    static func range(_ low: Double, _ high: Double) -> String {
        number(low) + tr(" až ", " to ") + number(high)
    }
}

/// Where a value sits against its usual range, and the dial's scale around it.
private struct Usual {
    let value: Double?
    let low: Double?
    let high: Double?

    var band: ClosedRange<Double>? {
        guard let low, let high, high > low else { return nil }
        return low...high
    }

    /// -1 under the usual range, 1 above it, 0 within; nil without one.
    var side: Int? {
        guard let value, let band else { return nil }
        return value > band.upperBound ? 1 : value < band.lowerBound ? -1 : 0
    }

    /// The range in the middle with room either side (TodayDials.hrv).
    var scale: ClosedRange<Double> {
        guard let band else { return 0...max(100, (value ?? 0) * 1.5) }
        let pad = (band.upperBound - band.lowerBound) * 1.2
        let v = value ?? band.lowerBound
        return max(0, min(band.lowerBound - pad, v - 5))...max(band.upperBound + pad, v + 5)
    }

    @MainActor var pill: (text: String, good: Bool)? {
        switch side {
        case 0: (W.tr("v obvyklém rozmezí", "in your usual range"), true)
        case 1: (W.tr("nad obvyklým rozmezím", "above your usual range"), false)
        case -1: (W.tr("pod obvyklým rozmezím", "below your usual range"), false)
        default: nil
        }
    }

    /// The words the app already has for it (concept 03 point 5): no red, no cause.
    @MainActor var sentence: String {
        switch side {
        case 1: W.tr("Vyšší než obvykle.", "Higher than usual.")
        case -1: W.tr("Nižší než obvykle.", "Lower than usual.")
        case 0: W.tr("Drží se.", "Holding steady.")
        default: W.tr("Obvyklé rozmezí se ještě počítá.", "Still learning your usual range.")
        }
    }
}

/// Resting HR or HRV: last night against the usual range, and its history on the next page.
struct MetricDetail: View {
    let s: WatchSnapshot
    let metric: WatchMetric

    private var m: WatchSnapshot.Metric? { metric == .restingHR ? s.restingHR : s.hrv }

    var body: some View {
        let usual = Usual(value: m?.value, low: m?.low, high: m?.high)
        TabView {
            DialDetail(label: metric == .hrv ? W.tr("HRV z poslední noci", "HRV last night") : W.tr("Klidový tep", "Resting heart rate"),
                       dial: WatchDial(value: m?.value, scale: usual.scale, band: usual.band, dot: usual.side == 0 ? W.green : W.ink,
                                       number: m?.value.map { W.number($0) } ?? "–", unit: metric.unit, size: DialDetail.dialSize),
                       pill: usual.pill, sentence: usual.sentence,
                       note: usual.band.map { W.tr("Obvyklé rozmezí ", "Usual range ") + W.range($0.lowerBound, $0.upperBound) + " " + metric.unit })
                .containerBackground(W.glow(W.healthGlow), for: .tabView)
            if let m, m.series.count > 1 {
                HistoryPage(metric: metric, series: m.series, today: s.date, normal: usual.band, need: nil)
                    .containerBackground(W.glow(W.healthGlow), for: .tabView)
            }
        }
        .tabViewStyle(.verticalPage)
        .coachCorner()
    }
}

/// Last night as the Health sleep card: the night's arc from bedtime to
/// waking, the length against the need, the stages under it; the last nights
/// on the next page.
struct SleepDetail: View {
    let s: WatchSnapshot

    var body: some View {
        TabView {
            VStack(spacing: 0) {
                NightArc(start: s.sleep?.start, end: s.sleep?.end, minutes: s.sleep?.minutes)
                if let gap {
                    Text(gap.text)
                        .watchFont(13, .medium)
                        .foregroundStyle(gap.short ? W.amber : W.green)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.top, 2)
                }
                Spacer(minLength: 6)
                if let stages { stagesCard(stages) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .combine)
            .containerBackground(W.glow(W.healthGlow), for: .tabView)
            if let sleep = s.sleep, sleep.nights.count > 1 {
                HistoryPage(metric: .sleep, series: sleep.nights, today: s.date,
                            normal: sleep.need.map { $0...($0 + 60) }, need: sleep.need)
                    .containerBackground(W.glow(W.healthGlow), for: .tabView)
            }
        }
        .tabViewStyle(.verticalPage)
        .coachCorner()
    }

    /// "6 min short of 7 h", or how far over the need.
    private var gap: (text: String, short: Bool)? {
        guard let minutes = s.sleep?.minutes, let need = s.sleep?.need, need > 0 else { return nil }
        let diff = Int((need - minutes).rounded())
        let needText = W.hours(need)
        if diff > 0 { return (W.tr("o \(W.hours(Double(diff))) méně než \(needText)", "\(W.hours(Double(diff))) short of \(needText)"), true) }
        if diff < 0 { return (W.tr("o \(W.hours(Double(-diff))) víc než \(needText)", "\(W.hours(Double(-diff))) over \(needText)"), false) }
        return (W.tr("přesně \(needText)", "exactly \(needText)"), false)
    }

    private var stages: [(String, Double)]? {
        guard let deep = s.sleep?.deep, let rem = s.sleep?.rem, let light = s.sleep?.light else { return nil }
        return [(W.tr("Hluboký", "Deep"), deep), ("REM", rem), (W.tr("Lehký", "Light"), light)]
    }

    private func stagesCard(_ stages: [(String, Double)]) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                if index > 0 { Rectangle().fill(W.hair).frame(width: 1) }
                VStack(spacing: 3) {
                    Text(W.hours(stage.1, min: false))
                        .font(W.serif(W.small ? 16 : 19))
                        .foregroundStyle(W.num)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(stage.0)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(W.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(W.card, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.06), lineWidth: 1) }
    }
}

/// The night's arc of the Health sleep card: a wide arc from the bedtime at
/// its left end to the waking at its right, amber into green, the length in
/// the middle.
private struct NightArc: View {
    let start: String?
    let end: String?
    let minutes: Double?

    var body: some View {
        let width: CGFloat = W.small ? 150 : 172
        let line: CGFloat = 6
        ZStack(alignment: .top) {
            Path { path in
                path.addArc(center: CGPoint(x: width / 2, y: width / 2), radius: width / 2 - line,
                            startAngle: .degrees(200), endAngle: .degrees(340), clockwise: false)
            }
            .stroke(LinearGradient(colors: [W.lightAmber, W.lightMint], startPoint: .leading, endPoint: .trailing),
                    style: StrokeStyle(lineWidth: line, lineCap: .round))
            .frame(width: width, height: width / 2)
            HStack {
                Text(start ?? "").foregroundStyle(W.muted)
                Spacer()
                Text(end ?? "").foregroundStyle(W.muted)
            }
            .font(.system(size: 12, weight: .medium).monospacedDigit())
            .frame(width: width + 12)
            .offset(y: -4)
            VStack(spacing: 2) {
                Text(W.tr("Poslední noc", "Last night"))
                    .watchFont(12, .medium)
                    .foregroundStyle(W.secondary)
                Text(minutes.map { W.hours($0) } ?? "–")
                    .font(W.serif(W.small ? 24 : 28))
                    .foregroundStyle(W.num)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.top, width * 0.17)
        }
        .frame(width: width + 12, height: width * 0.47)
        .padding(.top, 6)
    }
}

/// Today's strain on 0 to 21 against the target, and what the next workout adds.
struct StrainDetail: View {
    let s: WatchSnapshot
    private var strain: WatchSnapshot.Strain { s.strain }

    var body: some View {
        let band = strain.low.flatMap { low in strain.high.map { low...max(low, $0) } }
        DialDetail(label: W.tr("Námaha dnes", "Strain today"),
                   dial: WatchDial(value: strain.score, scale: 0...21, band: band, dot: dot,
                                   number: strain.score.map { W.number($0, digits: 1) } ?? "–", unit: W.tr("z 21", "of 21"), size: DialDetail.dialSize),
                   pill: band.map { (W.tr("cíl ", "target ") + W.range($0.lowerBound, $0.upperBound), false) },
                   sentence: sentence, note: note)
            .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
            .coachCorner()
    }

    /// Green on target, amber over it, light under it (the morning is always under it).
    private var dot: Color {
        guard let score = strain.score, let low = strain.low, let high = strain.high else { return W.ink }
        return score > high ? W.amber : score >= low ? W.green : W.ink
    }

    private var sentence: String {
        guard let score = strain.score, let low = strain.low, let high = strain.high else { return W.tr("Námaha", "Strain") }
        if score > high { return W.tr("Nad cílem", "Above target") }
        if score >= low { return W.tr("V cíli", "On target") }
        return strain.nextTitle != nil ? W.tr("Prostor na trénink", "Room for the workout") : W.tr("Prostor na víc", "Room for more")
    }

    /// "Strength at 17:30 adds 4.2 (estimate)": the estimate said once (concept 03 point 6).
    private var note: String? {
        guard let title = strain.nextTitle, let planned = strain.planned, planned > 0 else { return nil }
        let at = strain.nextTime.map { W.tr(" v ", " at ") + W.clockText($0) } ?? ""
        // A yellow morning: how to do it, as under the workout on the iPhone (wave 4, 28.2).
        return title + at + W.tr(" přidá ", " adds ") + W.number(planned, digits: 1) + W.tr(" (odhad)", " (estimate)")
            + (strain.nextNote.map { "\n" + $0 } ?? "")
    }
}

/// Why readiness is what it is: the big dial with its pill and a sentence,
/// then the three values that make it, one turn of the crown down.
struct WhyDetail: View {
    let s: WatchSnapshot

    var body: some View {
        TabView {
            DialDetail(label: W.tr("Připravenost dnes", "Readiness today"),
                       dial: WatchDial(value: s.readiness.map(Double.init), scale: 0...100, band: nil,
                                       dot: s.zone == "green" ? W.green : W.ink,
                                       number: s.readiness.map { String($0) } ?? "–", size: DialDetail.dialSize),
                       pill: pill, sentence: sentence)
                .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
            shapedIt
                .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
        }
        .tabViewStyle(.verticalPage)
        .coachCorner()
    }

    private var pill: (text: String, good: Bool)? {
        switch s.zone {
        case "green": (W.tr("v obvyklém rozmezí", "in your usual range"), true)
        case "yellow", "red": (W.tr("pod obvyklým rozmezím", "below your usual range"), false)
        default: nil
        }
    }

    /// "Sleep short, HRV steady.": what the night's numbers say, never what to do.
    private var sentence: String {
        var parts: [String] = []
        if let minutes = s.sleep?.minutes, let need = s.sleep?.need {
            parts.append(minutes >= need ? W.tr("Spánek stačil", "Sleep enough") : W.tr("Spánek krátký", "Sleep short"))
        }
        switch Usual(value: s.hrv?.value, low: s.hrv?.low, high: s.hrv?.high).side {
        case 0: parts.append(W.tr("HRV stabilní", "HRV steady"))
        case 1: parts.append(W.tr("HRV vyšší", "HRV higher"))
        case -1: parts.append(W.tr("HRV nižší", "HRV lower"))
        default: break
        }
        guard !parts.isEmpty else { return s.headline ?? "" }
        return parts.joined(separator: ", ") + "."
    }

    private struct Row {
        let title: String
        let value: String
        let unit: String
        let note: String?
        let amber: Bool
    }

    private var rows: [Row] {
        var rows: [Row] = []
        if let minutes = s.sleep?.minutes {
            let need = s.sleep?.need
            let short = need.map { Int(($0 - minutes).rounded()) } ?? 0
            let m = Int(minutes.rounded())
            rows.append(Row(title: W.tr("Spánek", "Sleep"), value: "\(m / 60) h " + String(format: "%02d", m % 60), unit: "min",
                            note: need == nil ? nil : short > 0 ? W.tr("o \(W.hours(Double(short))) méně", "\(W.hours(Double(short))) short") : W.tr("dost", "enough"),
                            amber: short > 0))
        }
        for (metric, m) in [(WatchMetric.hrv, s.hrv), (WatchMetric.restingHR, s.restingHR)] {
            guard let value = m?.value else { continue }
            let usual = Usual(value: value, low: m?.low, high: m?.high).band
            rows.append(Row(title: metric == .hrv ? "HRV" : W.tr("Klidový tep", "Resting HR"), value: W.number(value), unit: metric.unit,
                            note: usual.map { W.tr("obvykle ", "usual ") + W.range($0.lowerBound, $0.upperBound) }, amber: false))
        }
        return rows
    }

    private var shapedIt: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(W.tr("Co ji ovlivnilo", "What shaped it"))
                .watchFont(13, .medium)
                .foregroundStyle(W.muted)
                .padding(.horizontal, 3)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    if index > 0 { Rectangle().fill(W.hair).frame(height: 1) }
                    HStack(alignment: .center, spacing: 6) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title).watchFont(15, .medium).foregroundStyle(W.ink)
                            if let note = row.note {
                                Text(note).watchFont(13, .medium).foregroundStyle(row.amber ? W.amber : W.green)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                            }
                        }
                        Spacer(minLength: 2)
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text(row.value).font(W.serif(19)).foregroundStyle(W.num)
                            Text(row.unit).font(.system(size: 12, weight: .medium)).foregroundStyle(W.muted)
                        }
                        .lineLimit(1)
                        .fixedSize()
                    }
                    .padding(.vertical, 7)
                    .padding(.horizontal, 10)
                    .accessibilityElement(children: .combine)
                }
            }
            .background(W.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay { RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.06), lineWidth: 1) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}
