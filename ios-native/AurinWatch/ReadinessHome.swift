import SwiftUI

/// The first page: readiness and the four parts of the day behind it. Each
/// row opens its detail, the number opens why it is what it is.
struct ReadinessHome: View {
    let s: WatchSnapshot

    enum Page: Hashable {
        case why, sleep, restingHR, hrv, strain
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                NavigationLink(value: Page.why) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(W.tr("Připravenost", "Readiness"))
                            .font(.system(size: 13))
                            .foregroundStyle(W.muted)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(s.readiness.map { String($0) } ?? "–")
                                .font(W.serif(52))
                                .foregroundStyle(W.ink)
                            if s.readiness != nil {
                                Text(zoneWord)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(W.zoneColor(s.zone))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(W.zoneColor(s.zone).opacity(0.18), in: Capsule())
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(.bottom, 4)

                row(.sleep, icon: "moon", color: W.indigo, name: W.tr("Spánek", "Sleep"),
                    value: s.sleep?.minutes.map(W.duration) ?? "–", change: sleepChange)
                row(.restingHR, icon: "heart", color: W.pink, name: W.tr("Klidový tep", "Resting HR"),
                    value: s.restingHR?.value.map { W.number($0) } ?? "–", change: change(s.restingHR, metric: .restingHR))
                row(.hrv, icon: "waveform.path.ecg", color: W.green, name: "HRV",
                    value: s.hrv?.value.map { W.number($0) + " ms" } ?? "–", change: change(s.hrv, metric: .hrv))

                NavigationLink(value: Page.strain) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(W.tr("Námaha", "Strain"))
                                .foregroundStyle(W.secondary)
                            Spacer()
                            Text(strainLine)
                                .foregroundStyle(W.ink)
                        }
                        .font(.system(size: 13))
                        StrainBar(strain: s.strain)
                    }
                    .padding(.top, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationDestination(for: Page.self) { page in
            switch page {
            case .why: WhyDetail(s: s)
            case .sleep: SleepDetail(s: s)
            case .restingHR: MetricDetail(s: s, metric: .restingHR)
            case .hrv: MetricDetail(s: s, metric: .hrv)
            case .strain: StrainDetail(s: s)
            }
        }
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
    }

    private var zoneWord: String {
        switch s.zone {
        case "yellow": W.tr("střední", "medium")
        case "red": W.tr("nízká", "low")
        default: W.tr("vysoká", "high")
        }
    }

    private var sleepChange: (String, Color)? {
        guard let minutes = s.sleep?.minutes, let need = s.sleep?.need else { return nil }
        let diff = minutes - need
        return (W.minutesChange(diff), diff >= 0 ? W.green : W.amber)
    }

    /// Today against the middle of the athlete's normal.
    private func change(_ m: WatchSnapshot.Metric?, metric: WatchMetric) -> (String, Color)? {
        guard let m, let value = m.value, let low = m.low, let high = m.high else { return nil }
        let diff = (value - (low + high) / 2).rounded()
        let good = metric.higherIsBetter ? diff >= 0 : diff <= 0
        return (W.change(diff), diff == 0 ? W.muted : good ? W.green : W.amber)
    }

    private var strainLine: String {
        let score = s.strain.score.map { W.number($0, digits: 1) } ?? "–"
        guard let low = s.strain.low, let high = s.strain.high else { return score }
        return score + " · " + W.tr("cíl", "target") + " " + W.number(low) + "–" + W.number(high)
    }

    private func row(_ page: Page, icon: String, color: Color, name: String, value: String, change: (String, Color)?) -> some View {
        NavigationLink(value: page) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundStyle(color)
                    .frame(width: 16)
                Text(name)
                    .foregroundStyle(W.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Text(value)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(W.ink)
                    .lineLimit(1)
                if let change {
                    Text(change.0)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(change.1)
                        .lineLimit(1)
                }
            }
            .font(.system(size: 13))
            .padding(.vertical, 8)
            .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 0.5) }
        }
        .buttonStyle(.plain)
    }
}

/// Today's strain on a bar, with the target range a shade darker.
struct StrainBar: View {
    let strain: WatchSnapshot.Strain

    var body: some View {
        GeometryReader { geo in
            let top = Swift.max((strain.high ?? 14) * 1.25, strain.score ?? 0, 1)
            let x = { (v: Double) in geo.size.width * Swift.min(v / top, 1) }
            ZStack(alignment: .leading) {
                Capsule().fill(W.track)
                if let low = strain.low, let high = strain.high {
                    Rectangle()
                        .fill(W.amber.opacity(0.35))
                        .frame(width: Swift.max(x(high) - x(low), 2))
                        .offset(x: x(low))
                }
                Capsule()
                    .fill(W.amber)
                    .frame(width: Swift.max(x(strain.score ?? 0), 6))
            }
            .clipShape(Capsule())
        }
        .frame(height: 6)
    }
}
