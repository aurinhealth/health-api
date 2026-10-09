import Charts
import SwiftUI

/// VO2max: the drill-down from the VO2max widget on Training, the values over
/// time with their dates, the change and what the number means.
struct VO2maxDetailView: View {
    let training: TrainingSnapshot
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            ScrollView {
                if let vo2 = training.vo2max {
                    VO2maxContent(vo2: vo2, back: { dismiss() }).padding(.bottom, 100)
                } else {
                    Text("VO2max zatím není k dispozici. Hodinky ho odhadují z běhu nebo jízdy s tepovou frekvencí.")
                        .font(Typo.body).foregroundStyle(Palette.muted).padding(24).padding(.top, 60)
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct VO2maxContent: View {
    let vo2: TrainingSnapshot.VO2max
    var back: () -> Void = {}
    @State private var span: Span = .half
    @State private var picked: Date?

    enum Span: Int, CaseIterable, Identifiable {
        case month = 1, quarter = 3, half = 6, all = 0
        var id: Int { rawValue }
        var label: String { [1: "Měsíc", 3: "3 měsíce", 6: "6 měsíců", 0: "Vše"][rawValue]! }
    }

    private struct Sample: Identifiable {
        let date: Date
        let iso: String
        let value: Double
        var id: String { iso }
    }

    private var all: [Sample] {
        vo2.series.compactMap { p in Self.day.date(from: p.date).map { Sample(date: $0, iso: p.date, value: p.value) } }
            .sorted { $0.date < $1.date }
    }

    private var shown: [Sample] {
        guard span != .all, let last = all.last?.date,
              let from = Calendar.current.date(byAdding: .month, value: -span.rawValue, to: last) else { return all }
        let inside = all.filter { $0.date >= from }
        return inside.count >= 2 ? inside : Array(all.suffix(2))
    }

    var body: some View {
        let samples = shown
        let values = samples.map(\.value)
        let lo = (values.min() ?? vo2.value) - 1, hi = (values.max() ?? vo2.value) + 1
        let selected = picked.flatMap { date in samples.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) } }

        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CircleButton(systemImage: "chevron.left", label: "Zpět", action: back)
                Spacer()
                SectionLabel(text: "VO2max")
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }

            Text(selected.map { Fmt.dayMonth($0.iso) } ?? "Teď").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 36)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(Self.text(selected?.value ?? vo2.value)).font(Typo.number(96)).foregroundStyle(Palette.ink)
                Text("ml/kg/min").font(Typo.small).foregroundStyle(Palette.muted)
            }
            if let change = vo2.change, change != 0 {
                Pill(text: (change > 0 ? "↑ " : "↓ ") + Fmt.decimal(abs(change)) + " za 4 týdny",
                     foreground: change > 0 ? Palette.green : Palette.rust,
                     background: change > 0 ? Palette.greenSoft : Palette.rust.opacity(0.14))
            }
            Text(Self.sentence(vo2: vo2, samples: all.map(\.value)))
                .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 14)

            Picker("Období", selection: $span) {
                ForEach(Span.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 24)

            Card {
                Chart {
                    ForEach(samples) { s in
                        AreaMark(x: .value("Den", s.date), yStart: .value("Min", lo), yEnd: .value("VO2max", s.value))
                            .foregroundStyle(LinearGradient(colors: [Palette.green.opacity(0.22), Palette.green.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("Den", s.date), y: .value("VO2max", s.value))
                            .foregroundStyle(Palette.green)
                            .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                            .interpolationMethod(.monotone)
                    }
                    if let selected {
                        RuleMark(x: .value("Den", selected.date)).foregroundStyle(Palette.hairline)
                        PointMark(x: .value("Den", selected.date), y: .value("VO2max", selected.value))
                            .foregroundStyle(Palette.green).symbolSize(70)
                    } else if let last = samples.last {
                        PointMark(x: .value("Den", last.date), y: .value("VO2max", last.value))
                            .foregroundStyle(Palette.green).symbolSize(60)
                    }
                }
                .chartYScale(domain: lo...hi)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Palette.hairline)
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated).locale(Fmt.locale))
                            .foregroundStyle(Palette.faint)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Palette.hairline)
                        AxisValueLabel().foregroundStyle(Palette.faint)
                    }
                }
                .chartXSelection(value: $picked)
                .frame(height: 220)
                Text("Podrž a táhni prstem pro hodnotu v daný den.").font(Typo.caption).foregroundStyle(Palette.faint)
            }
            .padding(.top, 14)

            if let first = samples.first, let last = samples.last {
                HStack(spacing: 10) {
                    stat("Změna", Fmt.signed(last.value - first.value, digits: 1), "od " + Fmt.dayMonth(first.iso))
                    stat("Nejvýš", Self.text(values.max() ?? last.value), Fmt.dayMonth(samples.max { $0.value < $1.value }?.iso ?? last.iso))
                    stat("Nejníž", Self.text(values.min() ?? last.value), Fmt.dayMonth(samples.min { $0.value < $1.value }?.iso ?? first.iso))
                }
                .padding(.top, 14)
            }

            SectionLabel(text: "Hodnoty").padding(.top, 30)
            VStack(spacing: 0) {
                ForEach(Array(samples.reversed().prefix(12).enumerated()), id: \.element.id) { i, s in
                    let older = samples.reversed().dropFirst(i + 1).first
                    HStack {
                        Text(Fmt.dayHeading(s.iso)).font(Typo.small).foregroundStyle(Palette.ink)
                        Spacer()
                        if let older {
                            let d = s.value - older.value
                            Text(d == 0 ? "beze změny" : Fmt.signed(d, digits: 1))
                                .font(Typo.caption).foregroundStyle(d > 0 ? Palette.green : d < 0 ? Palette.rust : Palette.faint)
                        }
                        Text(Self.text(s.value)).font(Typo.number(18)).foregroundStyle(Palette.ink).frame(width: 52, alignment: .trailing)
                    }
                    .padding(.vertical, 10)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                }
            }
            .padding(.top, 6)

            SectionLabel(text: "Co to je").padding(.top, 30)
            VStack(alignment: .leading, spacing: 10) {
                Text("VO2max je nejvíc kyslíku, které tělo při maximální zátěži zpracuje, na kilogram váhy za minutu. Je to strop vytrvalosti: čím vyšší, tím rychleji zvládneš jet nebo běžet aerobně.")
                Text("Hodinky ho odhadují z tepu a tempa nebo výkonu při bězích a jízdách venku. Jednotlivé hodnoty kolísají, důležitý je trend za týdny.")
                Text("Nejvíc ho zvedají intervaly kolem 3 až 5 minut v pásmu VO2max a dost lehkého objemu okolo. Klesá s nemocí, pauzou v tréninku a vyšší váhou.")
            }
            .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            .padding(.top, 10)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    private func stat(_ title: String, _ value: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
            Text(note).font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    static func text(_ value: Double) -> String {
        Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1)
    }

    static func sentence(vo2: TrainingSnapshot.VO2max, samples: [Double]) -> String {
        let first = samples.first ?? vo2.value
        let whole = vo2.value - first
        if let change = vo2.change, change >= 0.5 { return "Za poslední měsíc roste, trénink zabírá." }
        if let change = vo2.change, change <= -0.5 { return "Za poslední měsíc mírně klesá. Častá příčina je únava, nemoc nebo méně intenzity." }
        if whole >= 1 { return "Za celé období je výš o " + Fmt.decimal(whole) + ", poslední týdny se drží." }
        return "Drží se stabilně. Na posun nahoru pomohou intervaly v pásmu VO2max."
    }

    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
