import SwiftUI

/// Form (concept K04/022): Fitness, Fatigue and Form on top as a switch, the
/// form on a dial against the athlete's usual range, the chart with the band
/// and its periods, What the range means, Trend analysis and How it's
/// measured. All three are estimates from the workouts.
struct FormDetailView: View {
    let training: TrainingSnapshot
    @State private var metric = "form"
    @State private var period: ChartPeriod = .days30
    @State private var info = false

    var body: some View {
        DetailTemplate(title: "Forma", glow: Palette.Glow.training) {
            CoachEntry(view: "training", companion: ChromeAction(systemImage: "info", label: "Jak se to měří") { info = true })
        } content: {
            FormDetailContent(training: training, metric: $metric, period: $period)
        }
        .sheet(isPresented: $info) {
            ScrollView { FormDetailContent.howMeasured(training.form).padding(24) }
                .presentationDetents([.medium, .large])
                .presentationBackground(Palette.background)
        }
    }
}

struct FormDetailContent: View {
    let training: TrainingSnapshot
    /// "fitness", "fatigue" or "form".
    @Binding var metric: String
    @Binding var period: ChartPeriod

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let form = training.form {
                let usual = Self.usual(form)
                SiblingCells(cells: [
                    SiblingCell(id: "fitness", title: "Kondice", value: Fmt.int(form.fitness)),
                    SiblingCell(id: "fatigue", title: "Únava", value: Fmt.int(form.fatigue)),
                    SiblingCell(id: "form", title: "Forma", value: Fmt.signed(form.form), spokenState: Self.state(form.form, usual).words)
                ], selected: metric) { metric = $0 }
                .padding(.top, 16)
                if metric == "form" {
                    dial(form, usual: usual)
                } else {
                    DetailHeadline(label: metric == "fitness" ? "Kondice dnes, odhad" : "Únava dnes, odhad",
                                   value: Fmt.int(metric == "fitness" ? form.fitness : form.fatigue))
                }
                let points = Self.points(form, metric: metric, usual: usual)
                Card {
                    DetailChart(points: points, today: training.date, period: $period,
                                note: metric == "form" ? L10n.f("Forma je kondice minus únava. Pásmo je tvoje obvyklé rozmezí, %@ až %@. Pod ním jsi unavenější než obvykle, nad ním čerstvější.", Fmt.signed(usual.lowerBound), Fmt.signed(usual.upperBound))
                                    : metric == "fitness" ? "Kondice je průměr zátěže posledních 42 dní. Čárkovaně průměr období."
                                    : "Únava je průměr zátěže posledních 7 dní. Čárkovaně průměr období.",
                                periods: [.days30, .months3, .months6])
                }
                if metric == "form" {
                    SectionLabel(text: "Co znamená rozmezí").padding(.top, 28)
                    Card {
                        rangeRow("Čerstvý", L10n.f("nad %@", Fmt.signed(usual.upperBound)))
                        Rectangle().fill(Palette.hairline).frame(height: 1)
                        rangeRow("Obvyklé rozmezí", L10n.f("%@ až %@", Fmt.signed(usual.lowerBound), Fmt.signed(usual.upperBound)))
                        Rectangle().fill(Palette.hairline).frame(height: 1)
                        rangeRow("Unavený", L10n.f("pod %@", Fmt.signed(usual.lowerBound)))
                    }
                    .padding(.top, 10)
                    Text(verbatim: L10n.tr("Čerstvý chceš být v den závodu. Když jsi unavený mnoho dní po sobě, zátěž obvykle roste rychleji, než se stíháš zotavit."))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8).padding(.horizontal, 4)
                }
                let rows = TrendMath.dailyRows(points)
                if !rows.isEmpty {
                    SectionLabel(text: "Analýza trendu").padding(.top, 28)
                    Card {
                        TrendTable(rows: rows, nowCaption: metric == "form" ? "forma dnes" : metric == "fitness" ? "kondice dnes" : "únava dnes",
                                   signed: metric == "form", footnote: "Každý řádek je tvoje hodnota toho dne vedle dneška.")
                    }
                    .padding(.top, 10)
                }
            } else {
                Card { LearningState(kind: .missing, text: "Forma se ukáže po prvních trénincích s tepem nebo výkonem.") }
                    .padding(.top, 20)
            }
            Self.howMeasured(training.form).padding(.top, 28)
        }
    }

    private func dial(_ form: TrainingSnapshot.Form, usual: ClosedRange<Double>) -> some View {
        let state = Self.state(form.form, usual), color = Self.color(state)
        return VStack(spacing: 8) {
            Text(verbatim: L10n.tr("Forma dnes, odhad")).font(Typo.body).foregroundStyle(Palette.muted)
            RangeDial(value: form.form, scale: -30...30, band: usual, size: 190, lineWidth: 12, tint: color, bandTint: Palette.ink.opacity(0.3),
                      spoken: L10n.tr("Forma") + " " + Fmt.signed(form.form) + ", " + form.label) {
                Text(verbatim: Fmt.signed(form.form)).font(Typo.number(56)).foregroundStyle(state == .within ? Palette.green : Palette.ink)
            }
            // The server's word of the five form zones (606: "far above your usual range" is none of them).
            Text(verbatim: Fmt.capitalized(form.label)).font(Typo.bodyStrong).foregroundStyle(color)
            if let week = Self.weekSentence(form) {
                Text(verbatim: week).font(Typo.small).foregroundStyle(Palette.ink)
            }
            Text(verbatim: L10n.f("Obvyklé rozmezí %@ až %@", Fmt.signed(usual.lowerBound), Fmt.signed(usual.upperBound)))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private func rangeRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(verbatim: L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.muted)
            Spacer()
            Text(verbatim: value).font(Typo.body).foregroundStyle(Palette.ink)
        }
        .accessibilityElement(children: .combine)
    }

    /// The athlete's own usual form (the tile's: the middle 80 % of 90 days),
    /// else the range where fitness holds, −10 to +5 (src/app-training.js formZone).
    static func usual(_ form: TrainingSnapshot.Form) -> ClosedRange<Double> {
        FormWidget.usual(form.series) ?? -10...5
    }

    /// In the usual range, above it (fresher) or below it (more tired); far
    /// beyond the server's deep-fatigue and transition lines.
    static func state(_ value: Double, _ usual: ClosedRange<Double>) -> MetricState {
        let v = value.rounded()
        if usual.contains(v) { return .within }
        if v > 25 || v < -30 { return .far(above: v > 0) }
        return .off(above: v > usual.upperBound)
    }

    /// Fresher than usual is no warning: green like the range; more tired
    /// amber, far below red (critic, the colour must match the words).
    static func color(_ state: MetricState) -> Color {
        switch state {
        case .within, .off(above: true), .far(above: true): return Palette.Status.good
        case .off: return Palette.Status.warn
        case .far: return Palette.Status.bad
        }
    }

    /// "Fresher than a week ago" from the form 7 days back (concept K04/022).
    static func weekSentence(_ form: TrainingSnapshot.Form) -> String? {
        guard let last = form.series.last, let then = form.series.last(where: { $0.date <= ISODay.shift(last.date, -7) }) else { return nil }
        let diff = (form.form - (then.fitness - then.fatigue)).rounded()
        return L10n.tr(diff >= 2 ? "Čerstvější než před týdnem" : diff <= -2 ? "Unavenější než před týdnem" : "Zhruba jako před týdnem")
    }

    static func points(_ form: TrainingSnapshot.Form, metric: String, usual: ClosedRange<Double>) -> [ChartPoint] {
        form.series.map { p in
            switch metric {
            case "fitness": return ChartPoint(date: p.date, value: p.fitness.rounded())
            case "fatigue": return ChartPoint(date: p.date, value: p.fatigue.rounded())
            default:
                let v = (p.fitness - p.fatigue).rounded(), s = state(v, usual)
                // Only below the range is a warning dot; fresher keeps the line's colour.
                let key: String? = switch s { case .within, .off(above: true), .far(above: true): "within"; case .off: "slightly"; case .far: "far" }
                return ChartPoint(date: p.date, value: v, low: usual.lowerBound, high: usual.upperBound, state: key, side: v > usual.upperBound ? "above" : "below")
            }
        }
    }

    static func howMeasured(_ form: TrainingSnapshot.Form?) -> some View {
        var rows: [(String, String)] = []
        if let form, let last = form.series.last?.date {
            let from = ISODay.shift(last, -89)
            rows.append(("Dny s daty za posledních 90", String(form.series.filter { $0.date >= from }.count)))
        }
        rows.append(("Aktualizace", "po každém tréninku"))
        return HowMeasuredCard(text: "Kondice je průměr zátěže posledních 42 dní, únava posledních 7 dní, obojí s větší vahou posledních dní. Forma je jejich rozdíl. Všechny tři jsou odhady z tvých tréninků, ne měření tvého těla.",
                               rows: rows)
    }
}
