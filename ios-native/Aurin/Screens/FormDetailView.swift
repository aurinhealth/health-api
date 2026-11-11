import SwiftUI

/// "Forma a kondice": the drill-down from the Form widget on Training.
struct FormDetailView: View {
    let training: TrainingSnapshot
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            PageScroll {
                FormDetailContent(training: training, back: { dismiss() })
                    .padding(.bottom, 100)
            }
        }
        .floatingBack(title: "Forma a kondice") { dismiss() }
        .navBarVisibility(.hidden)
    }
}

struct FormDetailContent: View {
    let training: TrainingSnapshot
    var back: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                BackSlot(action: back)
                Spacer()
                SectionLabel(text: "Forma a kondice")
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }

            if let form = training.form {
                Text("Forma").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 36)
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(Fmt.signed(form.form)).font(Typo.number(116)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                    Pill(text: form.label, foreground: zoneColor(form.zone), background: form.zone == "risk" ? Palette.rust.opacity(0.14) : form.zone == "optimal" || form.zone == "fresh" ? Palette.greenSoft : Palette.amberSoft)
                }
                // What the zone means (the server's text, audit 16.4).
                Text(verbatim: form.text).font(Typo.small).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                Card {
                    // How the number above comes out: Form +5 = Fitness 42 − Fatigue 37;
                    // the two lines alone where the sum does not fit on one line.
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            Text(verbatim: L10n.tr("Forma") + " " + Fmt.signed(form.form) + " =").font(Typo.small).foregroundStyle(Palette.muted)
                            legend("Kondice", form.fitness, Palette.green)
                            Text(verbatim: "−").font(Typo.small).foregroundStyle(Palette.muted)
                            legend("Únava", form.fatigue, Palette.amberBar)
                        }
                        .lineLimit(1).fixedSize()
                        HStack(spacing: 18) {
                            legend("Kondice", form.fitness, Palette.green)
                            legend("Únava", form.fatigue, Palette.amberBar)
                        }
                    }
                    FormLines(series: form.series, height: 170, scale: true)
                }
                .padding(.top, 24)
            }

            // The last 7 days against the usual 28 on a scale in ink, no
            // ratio, bands or colours (Today audit D4).
            if let level = training.acwr?.level, TrainingSnapshot.ACWR.levels.contains(level) {
                header("Posledních 7 dní vs. obvyklých 28", trailing: nil)
                LoadLevelScale(level: level).padding(.top, 14)
            }

            if training.load.weeks.count > 1 {
                header("Zátěž po týdnech", trailing: L10n.f("týden %@", "\(training.week)"))
                WeeklyLoadChart(weeks: training.load.weeks)
                    .padding(.top, 14)
            }

            if let vo2 = training.vo2max {
                header("VO2max", trailing: vo2.change.map { L10n.f("%@ %@ za 4 týdny", $0 >= 0 ? "↑" : "↓", Fmt.decimal(abs($0))) })
                HStack(alignment: .bottom, spacing: 16) {
                    Text(Fmt.decimal(vo2.value, digits: vo2.value.rounded() == vo2.value ? 0 : 1)).font(Typo.number(56)).foregroundStyle(Palette.ink)
                    VO2maxLine(values: vo2.series.map(\.value), last: vo2.series.last?.date, today: training.date, height: 56)
                }
                .padding(.top, 10)
                Text(verbatim: vo2.caption).font(Typo.small).foregroundStyle(Palette.muted)
            }

            if let intensity = training.load.intensity {
                header("Intenzita za 4 týdny", trailing: nil)
                ZoneBar(parts: [("Lehká", intensity.low, Palette.sand), ("Vysoká", intensity.high, Palette.amberBar), ("Anaerobní", intensity.anaerobic, Palette.rust)])
                    .padding(.top, 14)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    private func legend(_ title: String, _ value: Double, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Capsule().fill(color).frame(width: 14, height: 3)
            Text(title).font(Typo.small).foregroundStyle(Palette.muted)
            Text(Fmt.int(value)).font(Typo.number(18)).foregroundStyle(Palette.ink)
        }
    }

    private func header(_ title: String, trailing: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            SectionLabel(text: title)
            Spacer()
            if let trailing { Text(trailing).font(Typo.caption).foregroundStyle(Palette.faint) }
        }
        .padding(.top, 34)
    }
}

/// Well below, Below, Usual, Above, Well above, the current step filled.
struct LoadLevelScale: View {
    let level: String
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let levels = TrainingSnapshot.ACWR.levels
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                ForEach(levels, id: \.self) { step in
                    Capsule().fill(step == level ? Palette.ink : Palette.track).frame(height: 6)
                }
            }
            // At the largest text sizes five words do not fit side by side: only the current one.
            if typeSize.isAccessibilitySize {
                Text(verbatim: TrainingSnapshot.ACWR.word(level) ?? "")
                    .font(Typo.caption.weight(.semibold))
                    .foregroundStyle(Palette.ink)
            } else {
                HStack(alignment: .top, spacing: 4) {
                    ForEach(levels, id: \.self) { step in
                        Text(verbatim: TrainingSnapshot.ACWR.word(step) ?? "")
                            .font(step == level ? Typo.caption.weight(.semibold) : Typo.caption)
                            .foregroundStyle(step == level ? Palette.ink : Palette.faint)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: L10n.f("Posledních 7 dní vs. obvyklých 28: %@", TrainingSnapshot.ACWR.word(level) ?? "")))
    }
}

/// Weekly load bars: done weeks solid, this week's load solid inside its plan
/// dashed around it.
struct WeeklyLoadChart: View {
    let weeks: [TrainingSnapshot.WeekLoad]

    var body: some View {
        let values = weeks.map { max($0.load, $0.planned ?? 0) }
        let top = max(values.max() ?? 1, 1)
        let planAhead = weeks.last.map { ($0.planned ?? 0) > $0.load } ?? false
        VStack(alignment: .leading, spacing: 10) {
            Text("TSS za týden").font(Typo.caption).foregroundStyle(Palette.muted)
            BarChart(values: values,
                     styles: weeks.indices.map { i in
                         i == weeks.count - 1 && planAhead ? BarStyle(fill: Palette.amberBar, dashed: true, done: weeks[i].load) : BarStyle(fill: i == weeks.count - 1 ? Palette.amberBar : Palette.amberBar.opacity(0.55))
                     },
                     hi: top,
                     labels: weeks.map { String($0.week) },
                     highlighted: weeks.count - 1,
                     spacing: 8,
                     height: 96,
                     scale: scaleTicks(0, top, count: 3))
            if planAhead {
                ChartLegend(items: [.init(color: Palette.amberBar, text: L10n.tr("hotovo"), mark: .bar),
                                    .init(color: Palette.amberBar.opacity(0.55), text: L10n.tr("naplánováno"), mark: .dashedBar)])
            }
            if let current = weeks.last {
                Text(current.planned.flatMap { $0 > current.load ? L10n.f("tento týden %@ z %@", Fmt.int(current.load), Fmt.int($0)) : nil } ?? L10n.f("tento týden %@", Fmt.int(current.load)))
                    .font(Typo.caption).foregroundStyle(Palette.faint)
            }
        }
    }
}
