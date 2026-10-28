import SwiftUI

// Co na tebe působí: what the journal's items do to the next morning, hurts on
// the left, helps on the right, and the detail of one item with the mornings
// after ✓ days next to the rest. Shown only with 5+ days of ✓ and of ✕.

struct JournalImpactView: View {
    @Environment(AppModel.self) private var model
    @State private var metric = "readiness"
    @State private var impact: JournalImpact?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: "Co na tebe působí") {
            Text("Co na tebe působí").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                .padding(.top, 8)
            Picker(L10n.tr("Ukazatel"), selection: $metric) {
                ForEach(JournalText.metrics, id: \.key) { m in Text(L10n.tr(m.title)).tag(m.key) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 16)
            if let impact {
                if impact.items.isEmpty {
                    Text("Zatím nic nemá dost dní s ✓ i s ✕. Zapisuj a vliv se tu objeví.")
                        .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 22)
                    if !impact.waiting.isEmpty { fewDays(impact.waiting).padding(.top, 12) }
                } else {
                    chart(impact).padding(.top, 16)
                }
                Text("Srovnávám rána po dnech s ✓ a s ✕ za posledních 90 dní, bez dnů nemoci.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 18)
            } else if let error {
                Text(error).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 30)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task(id: metric) { await load() }
    }

    private func load() async {
        if model.demo {
            impact = DemoJournal.impact(metric: metric)
            return
        }
        do {
            impact = try await model.api.journalImpact(metric: metric)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Hurts left, helps right, from a centre line; the value at the bar's
    /// end, the item on the other side of the line. Items without enough days
    /// are named in one line underneath.
    private func chart(_ impact: JournalImpact) -> some View {
        let scale = Double(Swift.max(20, impact.items.map { abs($0.effect) }.max() ?? 20)) * 1.3
        let items = impact.items.sorted { $0.effect < $1.effect }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Škodí").foregroundStyle(Palette.rust)
                Spacer()
                Text("Pomáhá").foregroundStyle(Palette.green)
            }
            .font(.caption.weight(.medium))
            .padding(.bottom, 6)
            VStack(spacing: 0) {
                ForEach(items) { item in
                    Button { model.push(.journalItem(item.key, impact.metric)) } label: {
                        ImpactBarRow(item: item, scale: scale)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.name + ", " + JournalText.percent(item.effect))
                    .accessibilityHint(L10n.f("%@ dní s ✓, %@ s ✕", String(item.yes), String(item.no)))
                }
            }
            .background(alignment: .center) {
                Rectangle().fill(Palette.ink.opacity(0.22)).frame(width: 1)
            }
            if !impact.waiting.isEmpty {
                Rectangle().fill(Palette.hairline).frame(height: 1).padding(.top, 14)
                fewDays(impact.waiting).padding(.top, 12)
            }
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 16)
        .cardSurface(cornerRadius: 22)
    }

    private func fewDays(_ list: [JournalImpact.Waiting]) -> some View {
        Text(verbatim: L10n.f("Málo dní: %@", list.map(\.name).joined(separator: ", ")))
            .font(.footnote).foregroundStyle(Palette.faint)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// One row of the chart: the bar from the centre line with its value at the
/// end, the item's icon and name across the line.
struct ImpactBarRow: View {
    let item: JournalImpact.Ranked
    let scale: Double

    var body: some View {
        let hurts = item.effect < 0
        let color = hurts ? Palette.rust : Palette.green
        GeometryReader { geo in
            let half = geo.size.width / 2
            let length = Swift.max(4, half * CGFloat(Swift.min(1, Double(abs(item.effect)) / scale)))
            ZStack(alignment: .topLeading) {
                UnevenRoundedRectangle(
                    topLeadingRadius: hurts ? 6 : 0, bottomLeadingRadius: hurts ? 6 : 0,
                    bottomTrailingRadius: hurts ? 0 : 6, topTrailingRadius: hurts ? 0 : 6, style: .continuous
                )
                .fill(LinearGradient(colors: [color.opacity(0.35), color], startPoint: hurts ? .trailing : .leading, endPoint: hurts ? .leading : .trailing))
                .frame(width: length, height: 16)
                .offset(x: hurts ? half - length : half, y: 12)
                let value = Text(verbatim: JournalText.percent(item.effect)).font(Typo.number(19)).foregroundStyle(color).lineLimit(1)
                if hurts {
                    value.frame(width: Swift.max(0, half - length - 8), alignment: .trailing).offset(y: 8)
                } else {
                    value.fixedSize().offset(x: half + length + 8, y: 8)
                }
                HStack(spacing: 6) {
                    Image(systemName: item.icon).font(.system(size: 13)).foregroundStyle(Palette.muted)
                    Text(verbatim: item.name).font(.footnote.weight(.medium)).foregroundStyle(Palette.secondary).lineLimit(1)
                }
                .frame(width: half - 10, alignment: hurts ? .leading : .trailing)
                .offset(x: hurts ? half + 10 : 0, y: 11)
            }
        }
        .frame(height: 40)
        .contentShape(Rectangle())
    }
}

/// A bar from the middle: left in rust when the item hurts, right in green
/// when it helps, its length the share of the largest effect.
struct DivergingBar: View {
    let effect: Int
    let scale: Double

    var body: some View {
        GeometryReader { geo in
            let half = geo.size.width / 2
            let length = half * CGFloat(Swift.min(1, Double(abs(effect)) / scale))
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Capsule().fill(effect < 0 ? Palette.rust : Palette.green)
                    .frame(width: Swift.max(length, 4))
                    .offset(x: effect < 0 ? half - Swift.max(length, 4) : half)
                Rectangle().fill(Palette.ink.opacity(0.5)).frame(width: 2, height: 10).offset(x: half - 1)
            }
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }
}

// MARK: - One item

struct JournalItemView: View {
    @Environment(AppModel.self) private var model
    let key: String
    let metric: String
    @State private var detail: JournalDetail?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: detail?.name) {
            if let detail {
                HStack(spacing: 12) {
                    JournalIcon(symbol: detail.icon, color: tone(detail), size: 44)
                    Text(verbatim: detail.name).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                }
                .padding(.top, 8)
                nextMorning(detail).padding(.top, 18)
                if !detail.chart.isEmpty { chart(detail).padding(.top, 14) }
                if let threshold = detail.threshold {
                    Card {
                        Text(verbatim: threshold).font(Typo.sentence(18)).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 14)
                }
            } else if let error {
                Text(error).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 30)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task { await load() }
    }

    private func load() async {
        if model.demo {
            detail = DemoJournal.detail(key: key, metric: metric)
            return
        }
        do {
            detail = try await model.api.journalItem(key: key, metric: metric)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func tone(_ d: JournalDetail) -> Color {
        guard let effect = d.effect else { return JournalStyle.color(nil) }
        return effect < 0 ? Palette.rust : Palette.green
    }

    private func nextMorning(_ d: JournalDetail) -> some View {
        Card {
            SectionLabel(text: "Další ráno")
            if let effect = d.effect {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(verbatim: JournalText.percent(effect)).font(Typo.number(52)).foregroundStyle(tone(d))
                    Text(verbatim: d.metricTitle.lowercased(with: Fmt.locale)).font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
                }
            } else {
                Text(verbatim: L10n.f("Na srovnání potřebuju aspoň 5 dní s ✓ i s ✕. Teď je %@ s ✓ a %@ s ✕.", String(d.yes), String(d.no)))
                    .font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Spacer()
                Text("s ✓").frame(width: 76, alignment: .trailing)
                Text("bez").frame(width: 64, alignment: .trailing)
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
            ForEach(d.compare) { c in
                HStack {
                    Text(verbatim: c.title).font(.subheadline).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Text(verbatim: JournalText.value(c.metric, c.yes)).font(.subheadline.weight(.semibold))
                        .foregroundStyle(compareColor(c))
                        .frame(width: 76, alignment: .trailing)
                    Text(verbatim: JournalText.value(c.metric, c.no)).font(.subheadline).foregroundStyle(Palette.muted)
                        .frame(width: 64, alignment: .trailing)
                }
                .padding(.vertical, 3)
            }
        }
    }

    private func compareColor(_ c: JournalDetail.Compare) -> Color {
        guard let yes = c.yes, let no = c.no, yes != no else { return Palette.ink }
        return JournalText.better(c.metric, yes: yes, no: no) ? Palette.green : Palette.rust
    }

    /// The last 30 mornings: ✓ days in colour, the others faint, the dashed
    /// line the average after ✕ days.
    private func chart(_ d: JournalDetail) -> some View {
        let values = d.chart.map(\.value)
        let low = values.min() ?? 0
        let high = values.max() ?? 1
        let span = Swift.max(high - low, 1)
        var noSum = 0.0
        var noCount = 0.0
        for p in d.chart where p.yes != true { noSum += p.value; noCount += 1 }
        let baseline: Double? = noCount > 0 ? noSum / noCount : nil
        let color = tone(d)
        return Card {
            HStack(spacing: 7) {
                Circle().fill(Palette.secondary).frame(width: 8, height: 8)
                Text(verbatim: d.metricTitle + " · " + L10n.tr("30 rán")).font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                Spacer(minLength: 4)
                Circle().fill(color).frame(width: 7, height: 7)
                Text("dny s ✓").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                let stepX = d.chart.count > 1 ? w / CGFloat(d.chart.count - 1) : 0
                ZStack(alignment: .topLeading) {
                    if let baseline {
                        Path { p in
                            let y = h - CGFloat((baseline - low) / span) * (h - 10) - 5
                            p.move(to: CGPoint(x: 0, y: y))
                            p.addLine(to: CGPoint(x: w, y: y))
                        }
                        .stroke(Palette.faint, style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                    }
                    ForEach(Array(d.chart.enumerated()), id: \.element.id) { index, point in
                        let marked = point.yes == true
                        Circle()
                            .fill(marked ? color : Palette.faint.opacity(0.6))
                            .frame(width: marked ? 9 : 5, height: marked ? 9 : 5)
                            .position(x: CGFloat(index) * stepX, y: h - CGFloat((point.value - low) / span) * (h - 10) - 5)
                    }
                }
            }
            .frame(height: 120)
            .accessibilityHidden(true)
        }
    }
}
