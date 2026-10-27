import SwiftUI

/// A detail page: the ring, a title and a sentence, and the three tiles at the bottom.
struct DetailPage<RingContent: View>: View {
    let title: String
    let note: String
    let tiles: [Tiles.Item]
    let color: Color
    @ViewBuilder var ring: RingContent

    var body: some View {
        VStack(spacing: 0) {
            ring
            Text(title)
                .font(W.serif(19))
                .foregroundStyle(W.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 4)
            Text(note)
                .font(W.news(12.5))
                .foregroundStyle(W.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            if !tiles.isEmpty { Tiles(items: tiles, color: color) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Resting HR or HRV: today against the athlete's normal, and its history on the next page.
struct MetricDetail: View {
    let s: WatchSnapshot
    let metric: WatchMetric

    private var m: WatchSnapshot.Metric? { metric == .restingHR ? s.restingHR : s.hrv }

    var body: some View {
        TabView {
            DetailPage(title: title, note: note, tiles: tiles, color: metric.color) {
                Ring(fraction: fraction, color: metric.color) {
                    RingValue(value: m?.value.map { W.number($0) } ?? "–", label: metric.unit, color: metric.color)
                }
            }
            .containerBackground(W.glow(metric.glow), for: .tabView)
            if let m, m.series.count > 1 {
                HistoryPage(metric: metric, series: m.series, today: s.date,
                            normal: m.low.flatMap { low in m.high.flatMap { $0 >= low ? low...$0 : nil } }, need: nil)
                    .containerBackground(W.glow(metric.glow), for: .tabView)
            }
        }
        .tabViewStyle(.verticalPage)
    }

    /// Where today sits between the lowest and the highest of the last 90 days,
    /// full when it is the best of them.
    private var fraction: Double {
        guard let m, let value = m.value else { return 0 }
        let values = m.series.map(\.value) + [value]
        guard let lo = values.min(), let hi = values.max(), hi > lo else { return 0.5 }
        let f = (value - lo) / (hi - lo)
        return Swift.max(0.1, metric.higherIsBetter ? f : 1 - f)
    }

    private var title: String {
        guard let value = m?.value, let low = m?.low, let high = m?.high else { return metric.name }
        if value > high { return metric == .restingHR ? W.tr("Vyšší než obvykle", "Higher than usual") : W.tr("Nad normálem", "Above normal") }
        if value < low { return metric == .restingHR ? W.tr("Nižší než obvykle", "Lower than usual") : W.tr("Pod normálem", "Below normal") }
        return W.tr("Normální", "Normal")
    }

    private var note: String {
        guard let low = m?.low, let high = m?.high else { return W.tr("Normál se ještě počítá.", "Your normal is still being worked out.") }
        let normal = W.tr("tvůj normál", "your normal") + " " + W.number(low) + "–" + W.number(high)
        if metric == .hrv, let value = m?.value {
            return W.change((value - (low + high) / 2).rounded()) + " ms · " + normal
        }
        return normal.prefix(1).uppercased() + normal.dropFirst()
    }

    private var tiles: [Tiles.Item] {
        guard let m else { return [] }
        let text = { (v: Double?) in v.map { W.number($0) } ?? "–" }
        return [Tiles.Item(label: W.tr("Dnes", "Today"), value: text(m.value)),
                Tiles.Item(label: W.tr("Včera", "Yesterday"), value: text(m.series.before(s.date))),
                Tiles.Item(label: W.tr("Průměr týdne", "Week avg"), value: text(m.series.span(7, upTo: s.date).average))]
    }
}

/// Last night against the need, its stages, and the last nights on the next page.
struct SleepDetail: View {
    let s: WatchSnapshot

    var body: some View {
        TabView {
            DetailPage(title: title, note: note, tiles: tiles, color: W.indigo) {
                Ring(fraction: fraction, color: W.indigo) {
                    RingValue(value: s.sleep?.minutes.map { W.clock(minutes: $0) } ?? "–", label: W.tr("Spánek", "Sleep"), color: W.indigo, size: 28)
                }
            }
            .containerBackground(W.glow(W.Glow.sleep), for: .tabView)
            if let sleep = s.sleep, sleep.nights.count > 1 {
                HistoryPage(metric: .sleep, series: sleep.nights, today: s.date,
                            normal: sleep.need.map { ($0 - 15)...($0 + 15) }, need: sleep.need)
                    .containerBackground(W.glow(W.Glow.sleep), for: .tabView)
            }
        }
        .tabViewStyle(.verticalPage)
    }

    private var fraction: Double {
        guard let minutes = s.sleep?.minutes, let need = s.sleep?.need, need > 0 else { return 0 }
        return Swift.min(minutes / need, 1)
    }

    private var title: String {
        guard let minutes = s.sleep?.minutes else { return W.tr("Bez spánku", "No sleep yet") }
        guard let need = s.sleep?.need else { return W.tr("Spánek", "Sleep") }
        if minutes >= need - 15 { return W.tr("Dobře vyspáno", "Slept well") }
        if minutes >= need - 60 { return W.tr("Trochu málo", "A bit short") }
        return W.tr("Krátká noc", "Short night")
    }

    private var note: String {
        var parts: [String] = []
        if let start = s.sleep?.start, let end = s.sleep?.end { parts.append(start + " → " + end) }
        if let minutes = s.sleep?.minutes, let need = s.sleep?.need {
            let diff = Int((minutes - need).rounded())
            let amount = W.minutesChange(Double(abs(diff))).replacingOccurrences(of: "+", with: "")
            if diff >= 0 { parts.append(W.tr("o \(amount) nad potřebou", "\(amount) over your need")) }
            else { parts.append(W.tr("o \(amount) pod potřebou", "\(amount) under your need")) }
        }
        return parts.joined(separator: " · ")
    }

    private var tiles: [Tiles.Item] {
        guard let sleep = s.sleep else { return [] }
        if let deep = sleep.deep, let rem = sleep.rem, let light = sleep.light {
            return [Tiles.Item(label: W.tr("Hluboký", "Deep"), value: W.clock(minutes: deep)),
                    Tiles.Item(label: "REM", value: W.clock(minutes: rem)),
                    Tiles.Item(label: W.tr("Lehký", "Light"), value: W.clock(minutes: light))]
        }
        let text = { (v: Double?) in v.map { W.clock(minutes: $0) } ?? "–" }
        return [Tiles.Item(label: W.tr("Dnes", "Today"), value: text(sleep.minutes)),
                Tiles.Item(label: W.tr("Včera", "Yesterday"), value: text(sleep.nights.before(s.date))),
                Tiles.Item(label: W.tr("Průměr týdne", "Week avg"), value: text(sleep.nights.span(7, upTo: s.date).average))]
    }
}

/// Today's strain against the target, and what the next workout adds.
struct StrainDetail: View {
    let s: WatchSnapshot
    private var strain: WatchSnapshot.Strain { s.strain }

    var body: some View {
        DetailPage(title: title, note: note, tiles: tiles, color: W.amber) {
            Ring(fraction: fraction, color: W.amber) {
                RingValue(value: strain.score.map { W.number($0, digits: 1) } ?? "–", label: range, color: W.amber)
            }
        }
        .containerBackground(W.glow(W.Glow.strain), for: .navigation)
    }

    private var range: String {
        guard let low = strain.low, let high = strain.high else { return W.tr("Námaha", "Strain") }
        return W.tr("z", "of") + " " + W.number(low) + "–" + W.number(high)
    }

    private var fraction: Double {
        guard let score = strain.score, let high = strain.high, high > 0 else { return 0 }
        return Swift.min(score / high, 1)
    }

    private var title: String {
        guard let score = strain.score, let low = strain.low, let high = strain.high else { return W.tr("Námaha", "Strain") }
        if score > high { return W.tr("Nad cílem", "Above target") }
        if score >= low { return W.tr("V cíli", "On target") }
        return strain.nextTitle != nil ? W.tr("Prostor na trénink", "Room for the workout") : W.tr("Prostor na víc", "Room for more")
    }

    private var note: String {
        if let title = strain.nextTitle, let planned = strain.planned, planned > 0 {
            let at = strain.nextTime.map { " " + $0 } ?? ""
            return title + at + W.tr(" přidá asi ", " adds about ") + W.number(planned, digits: 1)
        }
        guard let low = strain.low, let high = strain.high else { return "" }
        return W.tr("Dnešní cíl", "Today's target") + " " + W.number(low) + "–" + W.number(high)
    }

    private var tiles: [Tiles.Item] {
        var items = [Tiles.Item(label: W.tr("Kroky", "Steps"), value: s.steps.map { W.number($0) } ?? "–"),
                     Tiles.Item(label: W.tr("Pohyb", "Movement"), value: strain.movement.map { "+" + W.number($0, digits: 1) } ?? "–")]
        if let planned = strain.planned, planned > 0, strain.nextTitle != nil {
            items.append(Tiles.Item(label: W.tr("Plán", "Planned"), value: "+" + W.number(planned, digits: 1)))
        } else {
            items.append(Tiles.Item(label: W.tr("Trénink", "Training"), value: strain.training.map { "+" + W.number($0, digits: 1) } ?? "–"))
        }
        return items
    }
}

/// Why readiness is what it is: the summary and the three parts in a word each.
struct WhyDetail: View {
    let s: WatchSnapshot

    var body: some View {
        let color = W.zoneColor(s.zone)
        DetailPage(title: W.tr("Proč ", "Why ") + (s.readiness.map { String($0) } ?? "–"), note: note, tiles: tiles, color: W.indigo) {
            Ring(fraction: Double(s.readiness ?? 0) / 100, color: color) {
                RingValue(value: s.readiness.map { String($0) } ?? "–", label: W.tr("Připravenost", "Ready"), color: color)
            }
        }
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
    }

    private var note: String {
        s.headline ?? s.summary ?? ""
    }

    private var tiles: [Tiles.Item] {
        var items: [Tiles.Item] = []
        if let minutes = s.sleep?.minutes, let need = s.sleep?.need {
            items.append(Tiles.Item(label: W.tr("Spánek", "Sleep"), value: minutes >= need - 15 ? W.tr("dobrý", "good") : W.tr("krátký", "short")))
        }
        if let word = word(s.hrv, high: "vysoká", low: "nízká") { items.append(Tiles.Item(label: "HRV", value: word)) }
        if let word = word(s.restingHR, high: "vysoký", low: "nízký") { items.append(Tiles.Item(label: W.tr("Klid. tep", "Rest HR"), value: word)) }
        return items
    }

    /// The Czech words follow the part's gender: "HRV vysoká", "tep vysoký".
    private func word(_ m: WatchSnapshot.Metric?, high czechHigh: String, low czechLow: String) -> String? {
        guard let value = m?.value, let low = m?.low, let high = m?.high else { return nil }
        if value > high { return W.tr(czechHigh, "high") }
        if value < low { return W.tr(czechLow, "low") }
        return W.tr("normál", "normal")
    }
}
