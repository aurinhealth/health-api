import SwiftUI

/// One row of "Trend analysis": the 7-day average back then next to the one
/// now, the change in words and a sparkline from then to now.
struct TrendRow: Identifiable, Equatable {
    /// How far back, in days (7, 14, 30, 91, 182, 365).
    let lag: Int
    let then: Double
    let now: Double
    /// The 7-day averages from then to now, oldest first.
    let spark: [Double]
    /// The usual band at the same moments, when the points have one.
    var lows: [Double] = []
    var highs: [Double] = []
    var id: Int { lag }

    /// "7 days ago", "3 months ago", "1 year ago".
    var label: String {
        switch lag {
        case 7: return L10n.tr("Před 7 dny")
        case 14: return L10n.tr("Před 14 dny")
        case 30: return L10n.tr("Před 30 dny")
        case 91: return L10n.tr("Před 3 měsíci")
        case 182: return L10n.tr("Před 6 měsíci")
        case 365: return L10n.tr("Před rokem")
        default: return L10n.f("Před %@ dny", String(lag))
        }
    }
}

/// The rows of a 30-day page and of a year page.
enum TrendLags {
    static let month = [7, 14, 30, 91]
    static let year = [30, 91, 182, 365]
    /// Weight, body fat and muscle: single measurements (concepts 39 to 41).
    static let measurements = [14, 30, 91]
}

enum TrendMath {
    /// The mean of the values in the 7 days ending on `day`, nil without one.
    static func average7(_ points: [ChartPoint], endingOn day: String) -> Double? {
        let from = ISODay.shift(day, -6)
        return ChartBuckets.mean(points.filter { $0.date >= from && $0.date <= day }.map(\.value))
    }

    /// The rows for `lags` from daily points, the newest day as now. A row
    /// needs at least one value in the 7 days at each end (the average of
    /// the days that have one, as the server's 90-day change).
    static func rows(_ points: [ChartPoint], today: String, lags: [Int] = TrendLags.month) -> [TrendRow] {
        guard let now = average7(points, endingOn: today) else { return [] }
        return lags.compactMap { lag in
            let thenDay = ISODay.shift(today, -lag)
            guard let then = average7(points, endingOn: thenDay) else { return nil }
            // Up to 9 moments from then to now, each the 7-day average there.
            let count = min(lag, 8)
            let moments = (0...count).map { ISODay.shift(thenDay, Int((Double(lag) * Double($0) / Double(count)).rounded())) }
            let spark = moments.compactMap { average7(points, endingOn: $0) }
            let bands = moments.compactMap { day -> (Double, Double)? in
                let week = points.filter { $0.date >= ISODay.shift(day, -6) && $0.date <= day }
                guard let low = ChartBuckets.mean(week.compactMap(\.low)), let high = ChartBuckets.mean(week.compactMap(\.high)) else { return nil }
                return (low, high)
            }
            return TrendRow(lag: lag, then: then, now: now, spark: spark,
                            lows: bands.count == moments.count ? bands.map(\.0) : [],
                            highs: bands.count == moments.count ? bands.map(\.1) : [])
        }
    }

    /// The rows from each day's own value (Form, a 7-day load, which is
    /// already a week): then is the value on the day `lag` days back, the
    /// sparkline the values from then to now.
    static func dailyRows(_ points: [ChartPoint], lags: [Int] = TrendLags.month) -> [TrendRow] {
        guard let last = points.last else { return [] }
        let byDay = Dictionary(points.map { ($0.date, $0.value) }, uniquingKeysWith: { _, b in b })
        return lags.compactMap { lag in
            let thenDay = ISODay.shift(last.date, -lag)
            guard let then = byDay[thenDay] else { return nil }
            let count = min(lag, 8)
            let spark = (0...count).compactMap { byDay[ISODay.shift(thenDay, Int((Double(lag) * Double($0) / Double(count)).rounded()))] }
            return TrendRow(lag: lag, then: then, now: last.value, spark: spark)
        }
    }

    /// The rows of single measurements (weight, body fat, muscle): now is the
    /// latest measurement, then the last one taken by the day `lag` days
    /// back, at most a third of the lag (and a week) before it, so "3 months
    /// ago" never reads a measurement from half a year back.
    static func measurementRows(_ points: [ChartPoint], lags: [Int] = TrendLags.measurements) -> [TrendRow] {
        guard let last = points.last else { return [] }
        return lags.compactMap { lag in
            let thenDay = ISODay.shift(last.date, -lag)
            let oldest = ISODay.shift(thenDay, -max(7, lag / 3))
            guard let then = points.last(where: { $0.date <= thenDay && $0.date >= oldest }) else { return nil }
            let between = points.filter { $0.date >= then.date }
            let count = min(between.count - 1, 8)
            let spark = count < 1 ? between.map(\.value)
                : (0...count).map { between[Int((Double(between.count - 1) * Double($0) / Double(count)).rounded())].value }
            return TrendRow(lag: lag, then: then.value, now: last.value, spark: spark)
        }
    }

    /// The change in words, as the table shows it: "no change" when it
    /// rounds to nothing, else "0.3 higher" or "1 lower", with its arrow.
    static func change(now: Double, then: Double, digits: Int) -> (symbol: String?, text: String) {
        let scale = pow(10, Double(digits))
        // From the values as the table shows them, so 49.2 against 48.4 reads 0.8.
        let diff = ((now * scale).rounded() - (then * scale).rounded()) / scale
        if diff == 0 { return (nil, L10n.tr("beze změny")) }
        let size = Fmt.decimal(abs(diff), digits: digits)
        return diff > 0 ? ("arrow.up", L10n.f("o %@ výš", size)) : ("arrow.down", L10n.f("o %@ níž", size))
    }
}

/// "Trend analysis": the server's sentence on top, the 7-day average now, then
/// THEN / CHANGE / TREND per row and a line on what the rows compare.
struct TrendTable: View {
    /// The sentence over the table, from the server (never made up here).
    var sentence: String? = nil
    let rows: [TrendRow]
    var unit: String = ""
    var digits = 0
    var color: Color = Palette.green
    /// Wider sparklines (84 pt) in All metrics.
    var wide = false
    /// What the number under the sentence is, and the line under the rows,
    /// when the rows are not 7-day averages (Form, Load).
    var nowCaption = "průměr posledních 7 dní"
    /// Values around zero with their sign ("−11", "+3"): Form.
    var signed = false
    var footnote = "Každý řádek porovnává tvých posledních 7 dní se 7 dny, které tehdy skončily."
    /// At the accessibility sizes the sparklines step aside, so the words fit.
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let sentence {
                Text(verbatim: sentence).font(Typo.heading(23, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let now = rows.first?.now {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(verbatim: signed ? Fmt.signed(now) : Fmt.decimal(now, digits: digits)).font(Typo.number(34)).foregroundStyle(Palette.ink)
                    Text(verbatim: L10n.tr(nowCaption)).font(Typo.small).foregroundStyle(Palette.muted)
                }
                .padding(.top, sentence == nil ? 0 : 14)
                .padding(.bottom, 16)
                .accessibilityElement(children: .combine)
            }
            Grid(alignment: .trailing, horizontalSpacing: 10, verticalSpacing: 0) {
                GridRow {
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    header("Tehdy")
                    header("Změna")
                    if !typeSize.isAccessibilitySize { header("Trend") }
                }
                ForEach(rows) { row in
                    Divider().overlay(Palette.hairline).gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        // The row's height and, for VoiceOver, the whole row in one sentence.
                        Text(verbatim: row.label).font(Typo.body).foregroundStyle(Palette.muted)
                            .gridColumnAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 7)
                            .accessibilityLabel(spoken(row))
                        Text(verbatim: signed ? Fmt.signed(row.then) : Fmt.decimal(row.then, digits: digits)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                            .accessibilityHidden(true)
                        changeText(row).accessibilityHidden(true)
                        if !typeSize.isAccessibilitySize {
                            Sparkline(values: row.spark, lows: row.lows, highs: row.highs, color: color, width: wide ? 84 : 64)
                        }
                    }
                }
            }
            Divider().overlay(Palette.hairline)
            Text(verbatim: L10n.tr(footnote))
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
        }
    }

    private func header(_ text: String) -> some View {
        Text(verbatim: L10n.tr(text).uppercased(with: Fmt.locale))
            .font(.caption2).tracking(0.6).foregroundStyle(Palette.faint)
            .padding(.bottom, 8)
            .accessibilityHidden(true)
    }

    private func changeText(_ row: TrendRow) -> some View {
        let change = TrendMath.change(now: row.now, then: row.then, digits: digits)
        return HStack(spacing: 4) {
            if let symbol = change.symbol {
                Image(systemName: symbol).scaledFont(11, weight: .semibold, cap: .denseCap)
            }
            Text(verbatim: change.text).font(Typo.small)
        }
        .foregroundStyle(Palette.ink)
        .lineLimit(1).minimumScaleFactor(0.8)
    }

    /// "7 days ago 53 bpm, now 53, no change".
    private func spoken(_ row: TrendRow) -> String {
        let unitText = unit.isEmpty ? "" : " " + L10n.tr(unit)
        return [row.label + " " + Fmt.decimal(row.then, digits: digits) + unitText,
                L10n.f("teď %@", Fmt.decimal(row.now, digits: digits) + unitText),
                TrendMath.change(now: row.now, then: row.then, digits: digits).text].joined(separator: ", ")
    }
}

/// A small line from then to now with the usual band behind it, the end as
/// a dot with a soft halo (64 × 50 pt, 84 × 50 pt in All metrics).
struct Sparkline: View {
    let values: [Double]
    var lows: [Double] = []
    var highs: [Double] = []
    var color: Color = Palette.green
    var width: CGFloat = 64
    var height: CGFloat = 50

    var body: some View {
        Canvas { context, size in
            guard values.count > 1 else { return }
            let all = values + lows + highs
            let lo = all.min() ?? 0, hi = all.max() ?? 1
            let span = hi - lo > 0 ? hi - lo : 1
            // The line keeps to the middle 30 pt, as in the concept.
            let top: CGFloat = 10, bottom = size.height - 10
            let x = { (i: Int, n: Int) in 3 + (size.width - 8) * CGFloat(i) / CGFloat(max(n - 1, 1)) }
            let y = { (v: Double) in bottom - (bottom - top) * CGFloat((v - lo) / span) }
            if lows.count == highs.count, lows.count > 1 {
                var band = Path()
                for (i, v) in highs.enumerated() {
                    let p = CGPoint(x: x(i, highs.count), y: y(v))
                    if i == 0 { band.move(to: p) } else { band.addLine(to: p) }
                }
                for (i, v) in lows.enumerated().reversed() { band.addLine(to: CGPoint(x: x(i, lows.count), y: y(v))) }
                band.closeSubpath()
                context.fill(band, with: .color(Palette.ink.opacity(0.1)))
            }
            var line = Path()
            for (i, v) in values.enumerated() {
                let p = CGPoint(x: x(i, values.count), y: y(v))
                if i == 0 { line.move(to: p) } else { line.addLine(to: p) }
            }
            context.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
            if let last = values.last {
                let end = CGPoint(x: x(values.count - 1, values.count), y: y(last))
                context.fill(Path(ellipseIn: CGRect(x: end.x - 5.5, y: end.y - 5.5, width: 11, height: 11)), with: .color(color.opacity(0.2)))
                context.fill(Path(ellipseIn: CGRect(x: end.x - 2.8, y: end.y - 2.8, width: 5.6, height: 5.6)), with: .color(color))
            }
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }
}
