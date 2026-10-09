import SwiftUI

/// "Forma a kondice": the drill-down from the Form widget on Training.
struct FormDetailView: View {
    let training: TrainingSnapshot
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            ScrollView {
                FormDetailContent(training: training, back: { dismiss() })
                    .padding(.bottom, 100)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct FormDetailContent: View {
    let training: TrainingSnapshot
    var back: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CircleButton(systemImage: "chevron.left", label: L10n.tr("Zpět"), action: back)
                Spacer()
                SectionLabel(text: "Forma a kondice")
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }

            if let form = training.form {
                Text("Forma").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 36)
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(Fmt.signed(form.form)).font(Typo.number(116)).foregroundStyle(Palette.ink)
                    Pill(text: form.label, foreground: zoneColor(form.zone), background: form.zone == "risk" ? Palette.rust.opacity(0.14) : form.zone == "optimal" || form.zone == "fresh" ? Palette.greenSoft : Palette.amberSoft)
                }
                Text(form.text)
                    .font(Typo.sentence(20))
                    .foregroundStyle(Palette.secondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)

                Card {
                    HStack(spacing: 18) {
                        legend("Kondice", form.fitness, Palette.green)
                        legend("Únava", form.fatigue, Palette.amberBar)
                    }
                    FormLines(series: form.series, height: 170)
                    HStack {
                        Text(Fmt.dayMonth(form.series.first?.date ?? training.date)).font(Typo.tiny).foregroundStyle(Palette.faint)
                        Spacer()
                        Text("dnes").font(Typo.tiny.weight(.semibold)).foregroundStyle(Palette.ink)
                    }
                    Text("Kondice je průměr zátěže za 6 týdnů, únava za poslední týden. Forma je jejich rozdíl.")
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 24)
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
                    let values = vo2.series.map(\.value)
                    LineChart(values: values, color: Palette.green, lo: (values.min() ?? 40) - 1, hi: (values.max() ?? 50) + 1, fill: true, height: 56)
                }
                .padding(.top, 10)
            }

            if let intensity = training.load.intensity {
                header("Intenzita · 4 týdny", trailing: nil)
                ZoneBar(parts: [("Lehká", intensity.low, Palette.sand), ("Vysoká", intensity.high, Palette.amberBar), ("Anaerobní", intensity.anaerobic, Palette.rust)])
                    .padding(.top, 14)
                Text(intensityText(intensity))
                    .font(Typo.sentence(17))
                    .foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
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

    private func intensityText(_ i: TrainingSnapshot.Intensity) -> String {
        if i.low >= 70 { return "Většina tréninku je lehká, jak má být. Kvalitu dodávají kratší tvrdé úseky." }
        if i.low >= 55 { return "Dobře rozložené: víc než polovina lehce, zbytek ve vyšší intenzitě." }
        return "Hodně tréninku ve vysoké intenzitě. Přidej lehké objemové jednotky, ať se stihneš zotavit."
    }
}

/// Weekly load bars: done weeks solid, this week with its plan dashed around it.
struct WeeklyLoadChart: View {
    let weeks: [TrainingSnapshot.WeekLoad]

    var body: some View {
        let values = weeks.map { max($0.load, $0.planned ?? 0) }
        VStack(alignment: .leading, spacing: 10) {
            BarChart(values: values,
                     styles: weeks.indices.map { i in
                         i == weeks.count - 1 && (weeks[i].planned ?? 0) > weeks[i].load ? BarStyle(fill: Palette.amberBar, dashed: true) : BarStyle(fill: i == weeks.count - 1 ? Palette.amberBar : Palette.amberBar.opacity(0.55))
                     },
                     hi: max(values.max() ?? 1, 1),
                     labels: weeks.map { String($0.week) },
                     highlighted: weeks.count - 1,
                     spacing: 8,
                     height: 96)
            HStack(spacing: 14) {
                Text("TSS za týden").font(Typo.caption).foregroundStyle(Palette.muted)
                if let current = weeks.last {
                    Text(L10n.f("tento týden %@", Fmt.int(current.load)) + (current.planned.map { $0 > current.load ? " " + L10n.f("z %@", Fmt.int($0)) : "" } ?? ""))
                        .font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
        }
    }
}
