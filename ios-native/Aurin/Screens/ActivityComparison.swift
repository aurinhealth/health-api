import SwiftUI

// MARK: - Minule vs dnes (GET /app/api/activity-compare, src/activity-compare.js)

struct ActivityComparisonResponse: Decodable {
    let comparison: ActivityComparison?
}

/// The same ride or run done before: the efforts' average then and now
/// (watts or seconds per km, with heart rate) and each effort beside its pair.
struct ActivityComparison: Decodable, Equatable {
    /// "watts" on a ride, "pace" (seconds per km) on a run.
    let metric: String
    let before: Pair
    let after: Pair
    let sentence: String?
    let rows: [Row]
    /// The earlier activity, to open its detail.
    let session: WeekSession?

    struct Pair: Decodable, Equatable {
        let value: Double?
        let hr: Double?
    }

    struct Row: Decodable, Equatable {
        let label: String
        let before: Pair
        let after: Pair
    }

    var pace: Bool { metric == "pace" }
}

/// Under a done ride's or run's numbers: "Minule vs dnes" when the same
/// workout was done before, nothing otherwise. Better numbers are green, worse
/// ones stay grey: never red.
struct ActivityComparisonSection: View {
    @Environment(AppModel.self) private var model
    let activityId: String
    @State private var comparison: ActivityComparison?
    @State private var failed = false

    var body: some View {
        Group {
            if failed && comparison == nil {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel(text: "Minule vs dnes")
                    RetryRow(message: "Porovnání s minulým tréninkem se nepodařilo načíst.") { await load() }
                }
                .padding(.top, 26)
            } else if let c = comparison {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        SectionLabel(text: "Minule vs dnes")
                        Spacer()
                        if let earlier = c.session {
                            NavigationLink(value: AppRoute.activity(earlier)) {
                                HStack(spacing: 3) {
                                    Text(verbatim: Fmt.dayMonth(earlier.date))
                                    Image(systemName: "chevron.right").font(.caption2.weight(.semibold))
                                }
                                .font(Typo.small.weight(.medium)).foregroundStyle(Palette.muted)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Card {
                        HStack(alignment: .top, spacing: 14) {
                            big(c.pace ? "Tempo v úsecích" : "Výkon v intervalech", before: value(c.before.value, c), after: value(c.after.value, c),
                                unit: c.pace ? Units.paceUnit : "W", delta: valueDelta(c))
                            big(c.pace ? "Tep v úsecích" : "Tep v intervalech", before: c.before.hr.map { Fmt.int($0) } ?? "–", after: c.after.hr.map { Fmt.int($0) } ?? "–",
                                unit: "bpm", delta: hrDelta(c.before.hr, c.after.hr))
                        }
                        if let sentence = c.sentence {
                            Text(verbatim: sentence).font(Typo.sentence(18)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        table(c)
                    }
                }
                .padding(.top, 26)
            }
        }
        .task(id: activityId) {
            guard !model.demo, comparison == nil else { return }
            await load()
        }
    }

    /// No earlier workout is no comparison and no error; only a failed load says so.
    private func load() async {
        do { comparison = try await model.api.activityComparison(id: activityId); failed = false } catch { failed = true }
    }

    private func big(_ title: String, before: String, after: String, unit: String, delta: (text: String, better: Bool)?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(verbatim: before).font(Typo.number(18)).foregroundStyle(Palette.muted)
                Image(systemName: "arrow.right").font(.caption2).foregroundStyle(Palette.muted)
                Text(verbatim: after).font(Typo.number(24)).foregroundStyle(Palette.ink)
                Text(verbatim: unit).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            if let delta {
                Text(verbatim: delta.text).font(Typo.caption.weight(.semibold)).foregroundStyle(delta.better ? Palette.green : Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func table(_ c: ActivityComparison) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text("Úsek").frame(maxWidth: .infinity, alignment: .leading)
                Text("Minule").frame(width: 100, alignment: .trailing)
                Text("Dnes").frame(width: 100, alignment: .trailing)
            }
            .font(.caption.weight(.medium)).tracking(1.1).textCase(.uppercase).foregroundStyle(Palette.muted)
            .padding(.bottom, 6)
            ForEach(Array(c.rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 0) {
                    Text(verbatim: row.label).font(.subheadline).foregroundStyle(Palette.ink).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(verbatim: cell(row.before, c)).font(.subheadline).foregroundStyle(Palette.muted).frame(width: 100, alignment: .trailing)
                    Text(verbatim: cell(row.after, c)).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).frame(width: 100, alignment: .trailing)
                }
                .padding(.vertical, 8)
                .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
        }
    }

    /// "262" or "4:26" (per km or mile as the device shows pace).
    private func value(_ v: Double?, _ c: ActivityComparison) -> String {
        guard let v else { return "–" }
        guard c.pace else { return Fmt.int(v) }
        let s = Int(Units.pace(v).rounded())
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }

    /// "262 W · 158" or "4:26 · 171".
    private func cell(_ p: ActivityComparison.Pair, _ c: ActivityComparison) -> String {
        [p.value.map { value($0, c) + (c.pace ? "" : " W") }, p.hr.map { Fmt.int($0) }].compactMap { $0 }.joined(separator: " · ")
    }

    /// "+7 W" or "o 6 s rychleji"; better is more watts or a faster pace.
    private func valueDelta(_ c: ActivityComparison) -> (text: String, better: Bool)? {
        guard let b = c.before.value, let a = c.after.value else { return nil }
        if c.pace {
            let d = Int(Units.pace(abs(a - b)).rounded())
            guard d > 0 else { return nil }
            return (L10n.f(a < b ? "o %@ rychleji" : "o %@ pomaleji", "\(d) s"), a < b)
        }
        let d = Int((a - b).rounded())
        guard d != 0 else { return nil }
        return ((d > 0 ? "+" : "−") + "\(abs(d)) W", d > 0)
    }

    /// "−8 bpm": a lower heart rate is the better one.
    private func hrDelta(_ b: Double?, _ a: Double?) -> (text: String, better: Bool)? {
        guard let b, let a else { return nil }
        let d = Int((a - b).rounded())
        guard d != 0 else { return nil }
        return ((d > 0 ? "+" : "−") + "\(abs(d)) bpm", d < 0)
    }
}

// MARK: - Horko (src/heat-advice.js)

/// A ride or run outdoors on a hot day: the server's advice in an amber row
/// (Aktivita dne, Plán dne, the planned workout's detail).
struct HeatLine: View {
    let text: String
    var compact = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            Image(systemName: "thermometer.sun.fill").font(compact ? .footnote : .subheadline).foregroundStyle(Palette.amber)
            Text(verbatim: text).font(compact ? Typo.caption : Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, compact ? 10 : 13).padding(.vertical, compact ? 7 : 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: compact ? 12 : 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
