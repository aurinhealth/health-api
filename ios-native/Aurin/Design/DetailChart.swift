import Charts
import SwiftUI

/// The one detail chart of the new design (redesign Z2, the Strain chart of
/// the Training concept): the period's dates with arrows to go back, a thin
/// line with a hollow dot per day (per week from 3 months on), the usual
/// band as a soft wavy area, dotted gridlines with their values on the
/// right, the period's average as a dashed line with an "Avg" pill, a finger
/// to read one day, the period control, a sentence on what the chart shows
/// and the "From Apple Watch" line. VoiceOver plays it as an audio graph.
struct DetailChart: View {
    let points: [ChartPoint]
    /// The last day the chart can show, usually today.
    let today: String
    @Binding var period: ChartPeriod
    var unit: String = ""
    var digits = 0
    var color: Color = Palette.green
    /// What a point and the band are ("Each point is one night…").
    var note: String? = nil
    /// Where the data comes from ("Apple Watch"), shown as "From Apple Watch".
    var source: String? = nil
    var height: CGFloat = 196
    /// Periods offered; one period hides the control.
    var periods: [ChartPeriod] = ChartPeriod.allCases
    /// The headline's day and value: by week, the bubble over the newest week
    /// shows it until a finger picks a point, so it reads the same as the
    /// number on top (Aurin age, 604.1 critic 6).
    var latest: ChartPoint? = nil
    /// Single measurements (weight, body fat, muscle): one line through all
    /// of them however far apart, and no average line, as they have no usual
    /// range (concepts 39 to 41).
    var measurements = false

    /// How many periods back the arrows went, 0 = the one ending today.
    @State private var page = 0
    @State private var picked: Date?
    /// The bubble's measured size: the room kept over the chart grows with the text size.
    @State private var bubbleWidth: CGFloat = 120
    @State private var bubbleHeight: CGFloat = 52

    private var end: String { ISODay.shift(today, -page * period.days) }
    private var start: String { ISODay.shift(end, 1 - period.days) }
    private var shown: [ChartPoint] {
        // Measurements stay single points on every period, never weekly averages.
        measurements ? points.filter { $0.date >= start && $0.date <= end }.sorted { $0.date < $1.date }
            : ChartBuckets.shown(points, period: period, end: end)
    }
    /// A point is a week's average (from 91 days on, never for measurements).
    private var weekly: Bool { period.weekly && !measurements }
    private var hasOlder: Bool { points.contains { $0.date < start } }

    var body: some View {
        let list = shown
        VStack(alignment: .leading, spacing: 14) {
            header
            if list.isEmpty {
                Text(verbatim: L10n.tr("Za toto období nejsou data."))
                    .font(Typo.small).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, minHeight: height)
                    .multilineTextAlignment(.center)
            } else {
                plot(list)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel([TrendChart.summary(list.map { Point(date: $0.date, value: $0.value) }, unit: unit, digits: digits),
                                         list.last.flatMap { MetricState(state: $0.state, side: $0.side)?.words }].compactMap { $0 }.joined(separator: ", "))
                    .accessibilityChartDescriptor(TrendAudioGraph(points: list.map { Point(date: $0.date, value: $0.value) }, unit: unit, digits: digits, days: period.days))
            }
            if periods.count > 1 { PeriodControl(periods: periods, period: $period) }
            if let note {
                Text(verbatim: L10n.tr(note)).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let source {
                VStack(alignment: .leading, spacing: 12) {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    ChartSourceLine(source: source)
                }
            }
        }
        .onChange(of: period) {
            page = 0
            picked = nil
        }
    }

    /// "Oct 14 to Nov 12" between the arrows; the right one only after going back.
    private var header: some View {
        HStack {
            Button { page += 1; picked = nil } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .disabled(!hasOlder)
            .foregroundStyle(hasOlder ? Palette.ink : Palette.faint.opacity(0.5))
            .accessibilityLabel(L10n.tr("Předchozí období"))
            Spacer(minLength: 0)
            Text(verbatim: Self.periodTitle(start: start, end: end, year: period == .year))
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            Button { page = max(page - 1, 0); picked = nil } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .disabled(page == 0)
            .foregroundStyle(page > 0 ? Palette.ink : Palette.faint.opacity(0.5))
            .accessibilityLabel(L10n.tr("Další období"))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -12)
    }

    private func plot(_ list: [ChartPoint]) -> some View {
        let segments = measurements ? list.map { _ in 0 } : ChartBuckets.segments(list, weekly: weekly)
        let dated = list.enumerated().compactMap { i, p in ISODay.date(p.date).map { Dated(point: p, date: $0, segment: segments[i]) } }
        // One point has no average: the Avg pill would hide the only dot (review 2026-11-25).
        let average = measurements || list.count < 2 ? nil : ChartBuckets.mean(list.map(\.value))
        let values = list.map(\.value) + list.compactMap(\.low) + list.compactMap(\.high)
        let lo = values.min() ?? 0, hi = values.max() ?? 1
        let pad = max((hi - lo) * 0.18, hi == lo ? max(abs(hi) * 0.1, 1) : 0)
        let domainStart = ISODay.date(weekly ? ChartBuckets.monday(start) : start) ?? Date()
        // A little room after the last day for the Avg pill, so it never covers today's dot.
        let domainEnd = (ISODay.date(end) ?? Date()).addingTimeInterval(Double(period.days) * 86400 * 0.12)
        let selected = picked.flatMap { date in dated.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) } }
        let shownPoint = selected ?? dated.last
        // Every point gets its dot while they stay apart; a long period dots
        // only the points off the band, so the line does not blur.
        let dotsAll = list.count <= 45

        return Chart {
            ForEach(dated) { d in
                if let low = d.point.low, let high = d.point.high {
                    AreaMark(x: .value("Den", d.date), yStart: .value("Spodek", low), yEnd: .value("Vršek", high))
                        .foregroundStyle(Palette.ink.opacity(0.09))
                        .interpolationMethod(.catmullRom)
                }
            }
            if let average {
                RuleMark(y: .value("Průměr", average))
                    .foregroundStyle(Palette.faint)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 4]))
            }
            ForEach(dated) { d in
                LineMark(x: .value("Den", d.date), y: .value("Hodnota", d.point.value), series: .value("Úsek", d.segment))
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
            ForEach(dated) { d in
                if dotsAll || d.point.isOff {
                    PointMark(x: .value("Den", d.date), y: .value("Hodnota", d.point.value))
                        .symbol { HollowDot(color: dotColor(d.point), size: 6) }
                }
            }
            if let shownPoint {
                if selected != nil {
                    RuleMark(x: .value("Den", shownPoint.date))
                        .foregroundStyle(Palette.faint)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 4]))
                }
                PointMark(x: .value("Den", shownPoint.date), y: .value("Hodnota", shownPoint.point.value))
                    .symbol { LatestDot(color: dotColor(shownPoint.point)) }
            }
        }
        .chartXScale(domain: domainStart...max(domainEnd, domainStart))
        .chartYScale(domain: (lo - pad)...(hi + pad))
        .chartXAxis {
            AxisMarks(values: Self.ticks(start: weekly ? ChartBuckets.monday(start) : start, end: end)) { value in
                AxisValueLabel {
                    Text(verbatim: tickLabel(value.as(Date.self)))
                        .font(.caption2).foregroundStyle(Palette.faint)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1, lineCap: .round, dash: [1, 5]))
                    .foregroundStyle(Palette.faint.opacity(0.6))
                AxisValueLabel().font(.caption2).foregroundStyle(Palette.faint)
            }
        }
        .chartXSelection(value: $picked)
        .chartOverlay { proxy in
            GeometryReader { geo in
                if let frame = proxy.plotFrame {
                    let rect = geo[frame]
                    if let average, let y = proxy.position(forY: average) {
                        // Its right edge on the plot's right edge, in the room after the last day.
                        AveragePill(text: L10n.f("Prům. %@", Fmt.decimal(average, digits: digits)))
                            .frame(width: rect.maxX, alignment: .trailing)
                            .position(x: rect.maxX / 2, y: rect.minY + y)
                    }
                    if let shownPoint, let x = proxy.position(forX: shownPoint.date) {
                        let half = bubbleWidth / 2
                        let day = selected == nil && page == 0 && weekly ? latest.flatMap { ChartBuckets.monday($0.date) == shownPoint.point.date ? $0 : nil } : nil
                        let bubble = day ?? shownPoint.point
                        DayBubble(date: weekly && day == nil ? L10n.f("%@, týdenní průměr", weekLabel(bubble.date)) : Fmt.weekdayShort(bubble.date) + " " + Fmt.dayMonthShort(bubble.date),
                                  value: Fmt.decimal(bubble.value, digits: digits), unit: unit,
                                  state: MetricState(state: bubble.state, side: bubble.side))
                            .fixedSize()
                            .onGeometryChange(for: CGSize.self) { $0.size } action: { bubbleWidth = $0.width; bubbleHeight = $0.height }
                            .position(x: min(max(rect.minX + x, half), max(geo.size.width - half, half)), y: rect.minY - bubbleHeight / 2 - 8)
                    }
                }
            }
        }
        .frame(height: height)
        .padding(.top, bubbleHeight + 12)
    }

    /// A shown point with its date and the run of the line it belongs to.
    private struct Dated: Identifiable {
        let point: ChartPoint
        let date: Date
        let segment: Int
        var id: String { point.date }
    }

    private func dotColor(_ p: ChartPoint) -> Color {
        switch p.state {
        case "far": return Palette.Status.bad
        case "slightly": return Palette.Status.warn
        default: return color
        }
    }

    /// The period's first day, two whole days in between and its last ("Today").
    static func ticks(start: String, end: String) -> [Date] {
        let days = ISODay.range(start, end).count - 1
        guard days > 0 else { return ISODay.date(end).map { [$0] } ?? [] }
        return [0, 1.0 / 3, 2.0 / 3, 1].compactMap { ISODay.date(ISODay.shift(start, Int((Double(days) * $0).rounded()))) }
    }

    private func tickLabel(_ date: Date?) -> String {
        guard let date else { return "" }
        let iso = ISODay.iso(date)
        if iso == today { return L10n.tr("Dnes") }
        return period == .year ? Fmt.monthShort(iso) : Fmt.dayMonthShort(iso)
    }

    /// "Oct 14 to Nov 12"; with the year when the period crosses one, and
    /// "Nov 2025 to Nov 2026" for a year.
    static func periodTitle(start: String, end: String, year: Bool) -> String {
        if year { return L10n.f("%@ až %@", Fmt.monthYearShort(start), Fmt.monthYearShort(end)) }
        if start.prefix(4) != end.prefix(4) { return L10n.f("%@ až %@", Fmt.dayMonthYearShort(start), Fmt.dayMonthYearShort(end)) }
        return L10n.f("%@ až %@", Fmt.dayMonthShort(start), Fmt.dayMonthShort(end))
    }

    /// "Nov 9 to 15" for a week's point; the running week ends today, not on its Sunday.
    private func weekLabel(_ monday: String) -> String {
        L10n.f("%@ až %@", Fmt.dayMonthShort(monday), Fmt.dayMonthShort(min(ISODay.shift(monday, 6), today)))
    }
}

extension Fmt {
    /// "Nov", "lis": a year chart's months.
    static func monthShort(_ isoDate: String) -> String {
        guard let date = ISODay.date(isoDate) else { return isoDate }
        return DateFormatters.make("LLL", locale: locale, timeZone: TimeZone(identifier: "UTC")!).string(from: date)
    }

    /// "Nov 2026", "lis 2026".
    static func monthYearShort(_ isoDate: String) -> String {
        guard let date = ISODay.date(isoDate) else { return isoDate }
        return DateFormatters.make("LLL yyyy", locale: locale, timeZone: TimeZone(identifier: "UTC")!).string(from: date)
    }

    /// "Dec 28, 2025", "28. 12. 2025".
    static func dayMonthYearShort(_ isoDate: String) -> String {
        guard let date = ISODay.date(isoDate) else { return isoDate }
        return DateFormatters.make(L10n.isEnglish ? "MMM d yyyy" : "d. M. yyyy", locale: locale, timeZone: TimeZone(identifier: "UTC")!, template: L10n.isEnglish).string(from: date)
    }
}

/// A day's dot: hollow, the card showing through.
struct HollowDot: View {
    var color: Color
    var size: CGFloat = 6

    var body: some View {
        Circle().fill(Palette.card)
            .overlay(Circle().strokeBorder(color, lineWidth: 1.4))
            .frame(width: size, height: size)
    }
}

/// The newest (or the picked) point: a soft halo, an ink ring and the colour inside.
struct LatestDot: View {
    var color: Color

    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.2)).frame(width: 22, height: 22)
            Circle().fill(Palette.background).overlay(Circle().strokeBorder(Palette.ink, lineWidth: 2)).frame(width: 12, height: 12)
            Circle().fill(color).frame(width: 5, height: 5)
        }
    }
}

/// "Avg 10.7" at the end of the dashed average line.
struct AveragePill: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .scaledFont(11, weight: .semibold, cap: .denseCap)
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Palette.background, in: Capsule())
            .overlay(Capsule().strokeBorder(Palette.faint, lineWidth: 1))
            .fixedSize()
            .accessibilityHidden(true)
    }
}

/// The picked day over the chart: the date, then the value in serif.
struct DayBubble: View {
    let date: String
    let value: String
    var unit: String = ""
    /// Off the usual range: said in words too, never by the dot's colour alone.
    var state: MetricState? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: date).font(.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink)
                if !unit.isEmpty { Text(verbatim: L10n.tr(unit)).font(.caption).foregroundStyle(Palette.faint) }
            }
            if let state, state != .within {
                Text(verbatim: state.words).font(.caption).foregroundStyle(state.color)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.faint.opacity(0.5), lineWidth: 1))
        .accessibilityHidden(true)
    }
}

/// "From Apple Watch" under a chart, with a small dot.
struct ChartSourceLine: View {
    let source: String

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(Palette.green).frame(width: 5, height: 5)
            Text(verbatim: L10n.f("Odkud: %@", source)).font(.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

/// "30 days, 3 months, 6 months, 1 year" under a chart: a soft track with
/// the chosen one lifted.
struct PeriodControl: View {
    let periods: [ChartPeriod]
    @Binding var period: ChartPeriod

    var body: some View {
        HStack(spacing: 2) {
            ForEach(periods) { p in
                let on = p == period
                Button { period = p } label: {
                    Text(verbatim: p.title)
                        .scaledFont(13, weight: on ? .semibold : .regular, cap: .denseCap)
                        .foregroundStyle(on ? Palette.ink : Palette.muted)
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(on ? Palette.card : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.track, in: Capsule())
    }
}
