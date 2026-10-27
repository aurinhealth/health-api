import SwiftUI

/// The first page, as Today on the iPhone: readiness as a big number with its
/// word, and sleep, strain and HRV in one card with their range bars, all on
/// one screen. The number opens why readiness is what it is, each column its
/// detail (the pages are in WatchRoot's navigationDestination); the alarm
/// sits at the top left.
struct ReadinessHome: View {
    let s: WatchSnapshot

    enum Page: Hashable {
        case why, sleep, restingHR, hrv, strain, alarm
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavigationLink(value: Page.why) { hero }
                .buttonStyle(.plain)
            gauges.padding(.top, 6)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(value: Page.alarm) {
                    Image(systemName: "alarm.fill").foregroundStyle(W.indigo)
                }
                .accessibilityLabel(W.tr("Budík", "Alarm"))
            }
        }
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
        .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
    }

    // MARK: Readiness

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(W.tr("Připravenost", "Readiness"))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(W.secondary)
            HStack(alignment: .lastTextBaseline, spacing: 7) {
                Text(s.readiness.map { String($0) } ?? "–")
                    .font(W.serif(64))
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                if let pill {
                    Text(pill.text)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(pill.color)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(pill.color.opacity(0.16), in: Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// The iPhone's words for the zone (TodayView's pill).
    private var pill: (text: String, color: Color)? {
        guard s.readiness != nil else { return nil }
        switch s.zone {
        case "green": return (W.tr("vysoká", "high"), W.green)
        case "yellow": return (W.tr("střední", "moderate"), W.amber)
        case "red": return (W.tr("nízká", "low"), W.red)
        default: return nil
        }
    }

    // MARK: Sleep, strain, HRV

    private struct Gauge {
        var page: Page
        var title: String
        var value: String
        var unit: String? = nil
        var bar: (value: Double, low: Double, high: Double)? = nil
        var note: String? = nil
        var color: Color
    }

    private var gauges: some View {
        HStack(spacing: 0) {
            ForEach(Array([sleep, strain, hrv].enumerated()), id: \.offset) { index, gauge in
                if index > 0 { Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1) }
                NavigationLink(value: gauge.page) { cell(gauge) }
                    .buttonStyle(.plain)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }

    private func cell(_ g: Gauge) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(g.title).font(.system(size: 10)).foregroundStyle(W.muted).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(g.value).font(W.serif(21)).foregroundStyle(W.ink)
                if let unit = g.unit, g.value != "–" { Text(unit).font(.system(size: 8)).foregroundStyle(W.muted) }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            if let bar = g.bar {
                WatchRangeBar(value: bar.value, low: bar.low, high: bar.high, color: g.color).padding(.vertical, 2)
            }
            Text(g.note ?? " ")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(g.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// The night against its need: the band is half an hour either side (TodayView).
    private var sleep: Gauge {
        var g = Gauge(page: .sleep, title: W.tr("Spánek", "Sleep"), value: s.sleep?.minutes.map { W.clock(minutes: $0) } ?? "–", color: W.indigo)
        guard let minutes = s.sleep?.minutes, let need = s.sleep?.need, need > 0 else { return g }
        let low = need - 30, high = need + 30
        g.bar = (minutes, low, high)
        g.note = W.tr("\(W.number(minutes / need * 100)) % potřeby", "\(W.number(minutes / need * 100))% of need")
        g.color = minutes >= low ? W.green : W.amber
        return g
    }

    private var strain: Gauge {
        var g = Gauge(page: .strain, title: W.tr("Námaha", "Strain"), value: s.strain.score.map { W.number($0, digits: 1) } ?? "–", color: W.amber)
        guard let low = s.strain.low, let high = s.strain.high else {
            g.note = s.strain.planned.map { W.tr("plán ~", "plan ~") + W.number($0, digits: 1) }
            return g
        }
        g.note = W.tr("cíl ", "target ") + W.number(low) + "–" + W.number(high)
        g.color = W.green
        if let score = s.strain.score {
            g.bar = (score, low, high)
            g.color = WatchRangeBar.side(score, low, high) == 0 ? W.green : W.amber
        }
        return g
    }

    private var hrv: Gauge {
        var g = Gauge(page: .hrv, title: "HRV", value: s.hrv?.value.map { W.number($0) } ?? "–", unit: "ms", color: W.green)
        guard let value = s.hrv?.value, let low = s.hrv?.low, let high = s.hrv?.high, high > low else { return g }
        g.bar = (value, low, high)
        switch WatchRangeBar.side(value, low, high) {
        case 1: g.note = W.tr("nad normálem", "above normal")
        case -1: g.note = W.tr("pod normálem", "below normal"); g.color = W.amber
        default: g.note = W.tr("v normálu", "normal")
        }
        return g
    }
}

/// The iPhone's range bar (Aurin/Design/Components.swift RangeBar) in the
/// watch's colours: the usual range or the goal takes the middle third.
struct WatchRangeBar: View {
    let value: Double
    let low: Double
    let high: Double
    var color: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(W.track)
                Capsule().fill(W.dim).frame(width: w / 3, height: 4).offset(x: w / 3)
                Circle().fill(color)
                    .overlay(Circle().stroke(W.track, lineWidth: 1.5))
                    .frame(width: 9, height: 9)
                    .offset(x: position * w - 4.5)
            }
            .frame(height: 6)
            .frame(maxHeight: .infinity)
        }
        .frame(height: 9)
        .accessibilityHidden(true)
    }

    private var position: Double {
        guard high > low else { return 0.5 }
        let span = high - low
        return min(max((value - low + span) / (3 * span), 0.03), 0.97)
    }

    /// -1 under the range, 1 above it, 0 within.
    static func side(_ value: Double, _ low: Double, _ high: Double) -> Int {
        value > high ? 1 : value < low ? -1 : 0
    }
}
