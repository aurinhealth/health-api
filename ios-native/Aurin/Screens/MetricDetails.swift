import SwiftUI

/// A value of Zdraví with its own detail. Its widget opens it, and so does
/// every row that shows it elsewhere (Spánek, Váha).
enum HealthMetric: String, Hashable, CaseIterable {
    case hrv, restingHR, respiration, temperature, oxygen, bodyFat, muscle

    var title: String {
        switch self {
        case .hrv: return "HRV"
        case .restingHR: return "Klidový tep"
        case .respiration: return "Dech ve spánku"
        case .temperature: return "Teplota zápěstí"
        case .oxygen: return "Kyslík v krvi"
        case .bodyFat: return "Tělesný tuk"
        case .muscle: return "Svalová hmota"
        }
    }
}

/// What the value is, the big number, its unit and its state.
struct MetricHeadline: View {
    let caption: String
    let value: String
    let unit: String
    var status: MetricStatus? = nil

    var body: some View {
        Text(caption).font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 24)
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            Text(verbatim: value).font(Typo.number(116)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
            Text(verbatim: unit).font(Typo.small).foregroundStyle(Palette.faint)
            if let status { Pill(text: status.text, foreground: status.color, background: status.color.opacity(0.14)) }
        }
    }
}

struct MetricStatus {
    let text: String
    let color: Color

    static func compare(_ value: Double, low: Double, high: Double, worseAbove: Bool) -> MetricStatus {
        if value > high { return MetricStatus(text: "↑ " + L10n.tr("nad obvyklým rozmezím"), color: worseAbove ? Palette.rust : Palette.green) }
        if value < low { return MetricStatus(text: "↓ " + L10n.tr("pod obvyklým rozmezím"), color: worseAbove ? Palette.green : Palette.rust) }
        return MetricStatus(text: L10n.tr("v obvyklém rozmezí"), color: Palette.green)
    }
}

struct MetricChart<Chart: View>: View {
    let title: String
    let color: Color
    @ViewBuilder var chart: Chart

    var body: some View {
        Card {
            WidgetHeader(title: title, color: color)
            chart
        }
        .padding(.top, 20)
    }
}

/// A row with a value that opens the value's own detail.
struct MetricRow: View {
    let metric: HealthMetric
    let title: String
    let value: String
    var unit: String? = nil

    var body: some View {
        RouteLink(route: .metric(metric)) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink)
                if let unit { Text(unit).font(Typo.small).foregroundStyle(Palette.faint) }
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
            }
            .padding(.vertical, 13)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
    }
}
