import SwiftUI

/// The first page, in the detail pages' style: readiness in the ring, a word
/// on the day, and sleep, HRV and strain in the three tiles. The ring opens
/// why readiness is what it is, each tile its detail.
struct ReadinessHome: View {
    let s: WatchSnapshot

    enum Page: Hashable {
        case why, sleep, restingHR, hrv, strain
    }

    var body: some View {
        let color = W.zoneColor(s.zone)
        VStack(spacing: 0) {
            NavigationLink(value: Page.why) {
                Ring(fraction: Double(s.readiness ?? 0) / 100, color: color) {
                    RingValue(value: s.readiness.map { String($0) } ?? "–", label: W.tr("Připravenost", "Ready"), color: color)
                }
            }
            .buttonStyle(.plain)
            Text(title)
                .font(W.serif(21))
                .foregroundStyle(W.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 4)
            if let note = s.headline ?? s.summary {
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(W.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 8)
            Tiles(items: tiles, color: W.indigo)
                .overlay {
                    // Each tile opens its detail.
                    HStack(spacing: 5) {
                        ForEach([Page.sleep, .hrv, .strain], id: \.self) { page in
                            NavigationLink(value: page) { Color.clear.contentShape(Rectangle()) }
                                .buttonStyle(.plain)
                        }
                    }
                }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    private var title: String {
        guard s.readiness != nil else { return W.tr("Bez připravenosti", "No readiness yet") }
        switch s.zone {
        case "yellow": return W.tr("Dnes lehčeji", "Take it easier")
        case "red": return W.tr("Dnes regenerace", "Recover today")
        default: return W.tr("Můžeš trénovat", "Ready to train")
        }
    }

    private var tiles: [Tiles.Item] {
        [Tiles.Item(label: W.tr("Spánek", "Sleep"), value: s.sleep?.minutes.map { W.clock(minutes: $0) } ?? "–"),
         Tiles.Item(label: "HRV", value: s.hrv?.value.map { W.number($0) } ?? "–"),
         Tiles.Item(label: W.tr("Námaha", "Strain"), value: s.strain.score.map { W.number($0, digits: 1) } ?? "–")]
    }
}
