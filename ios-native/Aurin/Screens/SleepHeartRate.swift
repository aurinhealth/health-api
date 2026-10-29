import SwiftUI

/// Tep ve spánku: the night's heart rate from Spánek → Tělo během noci. It
/// shows the night already loaded there, so it needs no request of its own.
struct SleepHeartRateView: View {
    let health: HealthSnapshot
    let night: NightDetail.Night

    var body: some View {
        DetailScreen(glow: Palette.Glow.health, title: "Tep ve spánku") {
            SleepHeartRateContent(health: health, night: night)
        }
    }
}

struct SleepHeartRateContent: View {
    let health: HealthSnapshot
    let night: NightDetail.Night

    var body: some View {
        let hr = night.hr ?? []
        let stats = night.stats
        let norm = SleepHeartRate.norm(night.hrNights ?? [])
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Tep ve spánku").padding(.top, 24)
            MetricHeadline(caption: "Průměrný tep ve spánku", value: Fmt.int(stats?.avgHr), unit: "bpm",
                           status: stats?.avgHr.flatMap { v in norm.map { MetricStatus.compare(v, low: $0.lowerBound, high: $0.upperBound, worseAbove: true) } })
            if let avg = stats?.avgHr, let norm {
                DetailRange(value: avg, low: norm.lowerBound, high: norm.upperBound,
                            label: L10n.f("tvůj normál %@–%@ bpm", Fmt.int(norm.lowerBound), Fmt.int(norm.upperBound)), worseAbove: true)
                    .padding(.top, 14)
            }

            Card {
                WidgetHeader(title: "Během noci", color: Palette.rust)
                NightHeartChart(hr: hr, low: SleepHeartRate.low(night), spikes: stats?.spikes ?? [], bedClock: night.bedClock, end: SleepHeartRate.end(night), height: 170, detailed: true)
                    .padding(.top, 8)
                NightStageStrip(segments: night.segments ?? [], end: SleepHeartRate.end(night), height: 8)
                    .padding(.trailing, NightHeartChart.axisWidth)
                NightClockRow(night: night).padding(.trailing, NightHeartChart.axisWidth)
            }
            .padding(.top, 20)

            ThreeCells(cells: [("Nejníž", Fmt.int(stats?.lowHr)), ("Nejvýš", Fmt.int(hr.compactMap { $0.max ?? $0.avg }.max())),
                               ("Výkyvy", String(stats?.spikes?.count ?? 0))])
                .padding(.top, 20)

            let byStage = SleepHeartRate.byStage(hr: hr, segments: night.segments ?? [])
            if !byStage.isEmpty {
                SectionLabel(text: "Podle fáze spánku").padding(.top, 32)
                VStack(spacing: 0) {
                    ForEach(byStage, id: \.type) { row in
                        HStack(alignment: .firstTextBaseline) {
                            Circle().fill(StageStyle.color(row.type)).frame(width: 8, height: 8).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                            Text(StageStyle.labels[row.type] ?? row.type).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: Fmt.int(row.avg)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                            Text("bpm").font(Typo.small).foregroundStyle(Palette.faint)
                        }
                        .padding(.vertical, 13)
                        .overlay(alignment: .top) { if row.type != byStage.first?.type { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 8)
            }

            let nights = (night.hrNights ?? []).map { Point(date: $0.date, value: $0.avgHr) }
            if nights.count > 1 {
                MetricChart(title: "Tep po nocích", color: Palette.rust) {
                    TrendChart(points: nights, color: Palette.rust, unit: "bpm", band: norm, bandLabel: L10n.tr("tvoje norma"), worse: .above)
                }
                .padding(.top, 4)
            }

            if let rhr = health.restingHR, let value = rhr.value ?? rhr.series.last?.value {
                MetricRow(metric: .restingHR, title: "Klidový tep", value: Fmt.int(value), unit: "bpm")
                    .padding(.top, 18)
            }
        }
    }
}

enum SleepHeartRate {
    /// The usual night: the mean of the nights before this one ± 2 bpm, from 3 nights on.
    static func norm(_ nights: [NightDetail.NightHR]) -> ClosedRange<Double>? {
        let before = nights.dropLast().map(\.avgHr)
        guard before.count >= 3 else { return nil }
        let mean = (before.reduce(0, +) / Double(before.count)).rounded()
        return (mean - 2)...(mean + 2)
    }

    static func low(_ night: NightDetail.Night) -> NightDetail.HeartRate? {
        guard let at = night.stats?.lowHrAt else { return night.hr?.filter { $0.avg != nil }.min { $0.avg! < $1.avg! } }
        return night.hr?.first { $0.m == at }
    }

    /// The night's length in minutes, for the stage strip under the chart.
    static func end(_ night: NightDetail.Night) -> Double {
        max(night.segments?.map(\.e).max() ?? 0, (night.hr?.last?.m ?? 0) + 5, 1)
    }

    struct StageHR { let type: String; let avg: Double }

    /// The mean of the 5-minute buckets that fall in each stage, deep sleep first.
    static func byStage(hr: [NightDetail.HeartRate], segments: [NightDetail.Segment]) -> [StageHR] {
        var sums: [String: (Double, Int)] = [:]
        for bucket in hr {
            guard let avg = bucket.avg, let seg = segments.first(where: { $0.s <= bucket.m + 2.5 && bucket.m + 2.5 < $0.e }) else { continue }
            let old = sums[seg.type] ?? (0, 0)
            sums[seg.type] = (old.0 + avg, old.1 + 1)
        }
        return ["DEEP", "LIGHT", "REM", "AWAKE"].compactMap { type in sums[type].map { StageHR(type: type, avg: $0.0 / Double($0.1)) } }
    }
}

/// The night's heart rate: the 5-minute range as a band, the average as a
/// line and the lowest point marked. The detailed one adds the scale and the
/// spikes with their peaks.
struct NightHeartChart: View {
    let hr: [NightDetail.HeartRate]
    let low: NightDetail.HeartRate?
    var spikes: [NightDetail.Spike] = []
    var bedClock: Double? = nil
    var end: Double? = nil
    var height: CGFloat = 78
    var detailed = false

    static let axisWidth: CGFloat = 30

    var body: some View {
        let values = hr.flatMap { [$0.min ?? $0.avg, $0.max ?? $0.avg, $0.avg].compactMap { $0 } }
        let lo = ((values.min() ?? 45) - 3).rounded(.down), hi = ((values.max() ?? 70) + (detailed ? 6 : 3)).rounded(.up)
        let length = end ?? max((hr.last?.m ?? 0) + 5, 1)
        GeometryReader { geo in
            let width = geo.size.width - (detailed ? Self.axisWidth : 0)
            let x = { (m: Double) in 3 + (width - 6) * CGFloat(m / length) }
            let y = { (v: Double) in 6 + (geo.size.height - 12) * (1 - CGFloat((v - lo) / max(hi - lo, 1))) }
            ZStack(alignment: .topLeading) {
                if detailed {
                    ForEach(Self.ticks(lo, hi), id: \.self) { v in
                        Path { p in p.move(to: CGPoint(x: 0, y: y(v))); p.addLine(to: CGPoint(x: width, y: y(v))) }
                            .stroke(Palette.hairline, lineWidth: 1)
                        Text(verbatim: Fmt.int(v)).font(Typo.tiny).foregroundStyle(Palette.faint)
                            .position(x: geo.size.width - Self.axisWidth / 2 + 6, y: y(v))
                    }
                }
                Path { p in
                    let ranged = hr.filter { $0.avg != nil }
                    guard let first = ranged.first else { return }
                    p.move(to: CGPoint(x: x(first.m), y: y(first.max ?? first.avg!)))
                    ranged.dropFirst().forEach { p.addLine(to: CGPoint(x: x($0.m), y: y($0.max ?? $0.avg!))) }
                    ranged.reversed().forEach { p.addLine(to: CGPoint(x: x($0.m), y: y($0.min ?? $0.avg!))) }
                    p.closeSubpath()
                }
                .fill(Palette.rust.opacity(0.16))
                Path { p in
                    let points = hr.compactMap { b in b.avg.map { CGPoint(x: x(b.m), y: y($0)) } }
                    guard let first = points.first else { return }
                    p.move(to: first); points.dropFirst().forEach { p.addLine(to: $0) }
                }
                .stroke(Palette.rust, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                if detailed {
                    ForEach(spikes, id: \.m) { spike in
                        Circle().fill(Palette.card).overlay { Circle().stroke(Palette.rust, lineWidth: 1.6) }.frame(width: 7, height: 7)
                            .position(x: x(spike.m), y: y(spike.max))
                        Text(verbatim: Fmt.int(spike.max)).font(Typo.tiny).foregroundStyle(Palette.muted)
                            .position(x: x(spike.m), y: y(spike.max) - 12)
                    }
                }
                if let low, let avg = low.avg {
                    Circle().fill(Palette.rust).overlay { Circle().stroke(Palette.background, lineWidth: 2) }.frame(width: 10, height: 10)
                        .position(x: x(low.m), y: y(avg))
                    // Beside the dot, on the side with more room.
                    let right = x(low.m) < width - 80
                    Text(verbatim: detailed ? Fmt.int(avg) + " · " + clock(low.m) : Fmt.int(avg))
                        .font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.ink).fixedSize()
                        .padding(.horizontal, 10)
                        .frame(width: 120, alignment: right ? .leading : .trailing)
                        .position(x: x(low.m) + (right ? 60 : -60), y: y(avg))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }

    private func clock(_ m: Double) -> String {
        guard let bedClock else { return "" }
        return ClockText.format(minutes: Int(bedClock + m))
    }

    /// Every 10 bpm within the chart.
    static func ticks(_ lo: Double, _ hi: Double) -> [Double] {
        stride(from: (lo / 10).rounded(.up) * 10, through: hi, by: 10).map { $0 }
    }
}

/// The sleep stages as one thin strip, on the same time scale as the chart above it.
struct NightStageStrip: View {
    let segments: [NightDetail.Segment]
    let end: Double
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            let x = { (m: Double) in 3 + (geo.size.width - 6) * CGFloat(m / end) }
            ForEach(segments.indices, id: \.self) { i in
                let s = segments[i]
                RoundedRectangle(cornerRadius: 1.5).fill(StageStyle.color(s.type))
                    .frame(width: max(x(s.e) - x(s.s) - 0.6, 1), height: height)
                    .offset(x: x(s.s))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Bedtime and wake-up under the night's charts.
struct NightClockRow: View {
    let night: NightDetail.Night

    var body: some View {
        HStack {
            if let bed = night.bedClock { Text(verbatim: ClockText.format(minutes: Int(bed))) }
            Spacer()
            if let wake = night.wakeClock { Text(verbatim: ClockText.format(minutes: Int(wake))) }
        }
        .font(Typo.tiny).foregroundStyle(Palette.faint)
    }
}
