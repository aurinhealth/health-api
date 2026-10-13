import SwiftUI

/// Time in the heart-rate zones: the drill-down from the zones widget on
/// Training. This week's active minutes against WHO's recommendation, the
/// last 4 weeks side by side and what the zones mean (docs/methodology.md).
struct ZonesDetailView: View {
    let training: TrainingSnapshot

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            if let zones = training.zones {
                ZonesDetailContent(zones: zones)
            } else {
                Text("Čas v zónách zatím není k dispozici. Počítá ho Google Health z tepu během dne.")
                    .font(Typo.body).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 60)
            }
        }
    }
}

struct ZonesDetailContent: View {
    let zones: TrainingSnapshot.Zones

    var body: some View {
        let weeks = zones.weeks ?? []
        VStack(alignment: .leading, spacing: 0) {
            Text("Aktivní minuty v zónách · tento týden").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 36)
            if let week = weeks.last {
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    Text(verbatim: Fmt.int(week.counted)).font(Typo.number(96)).lineLimit(1).minimumScaleFactor(0.5).foregroundStyle(Palette.ink)
                    Text(verbatim: L10n.f("z %@", "150 min")).font(Typo.small).foregroundStyle(Palette.muted)
                }
                Pill(text: ZoneStyle.status(week), foreground: ZoneStyle.statusColor(week),
                     background: week.counted >= TrainingSnapshot.ZoneWeek.whoTarget ? Palette.greenSoft : Palette.amberSoft)

                Card {
                    WidgetHeader(title: "Poslední 4 týdny", color: Palette.rust, trailing: L10n.tr("čísla týdnů"))
                    ZoneWeekBars(weeks: weeks, height: 150, spacing: 14)
                    ZoneLegend(week: week)
                }
                .padding(.top, 20)

                SectionLabel(text: "Po týdnech").padding(.top, 30)
                ZoneWeekTable(weeks: weeks).padding(.top, 10)
            } else {
                Card {
                    WidgetHeader(title: "Čas v tepových zónách", color: Palette.rust, trailing: L10n.tr("4 týdny") + " · " + Fmt.hoursMinutesLong(zones.minutes))
                    ZoneBar(parts: [("Lehká", zones.light, ZoneStyle.light), ("Střední", zones.moderate, ZoneStyle.moderate),
                                    ("Intenzivní", zones.vigorous, ZoneStyle.vigorous), ("Maximální", zones.peak, ZoneStyle.peak)])
                }
                .padding(.top, 14)
            }

            SectionLabel(text: "Co znamenají zóny").padding(.top, 30)
            VStack(alignment: .leading, spacing: 12) {
                zoneRow(ZoneStyle.light, "Lehká", "pod 40 %")
                zoneRow(ZoneStyle.moderate, "Střední", "40–59 %")
                zoneRow(ZoneStyle.vigorous, "Intenzivní", "60–84 %")
                zoneRow(ZoneStyle.peak, "Maximální", "85 % a víc")
            }
            .padding(.top, 12)
        }
    }

    private func zoneRow(_ color: Color, _ name: String, _ range: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 6, height: 22)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(L10n.f("%@ tepové rezervy", L10n.tr(range))).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The last 4 weeks in a table, the newest first: minutes in each active
/// zone and the minutes WHO counts.
struct ZoneWeekTable: View {
    let weeks: [TrainingSnapshot.ZoneWeek]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Text("Týden").frame(maxWidth: .infinity, alignment: .leading)
                header("Stř.")
                header("Int.")
                header("Max.")
                header("WHO")
            }
            .font(Typo.tiny).foregroundStyle(Palette.faint)
            .padding(.bottom, 6)
            ForEach(Array(weeks.reversed().enumerated()), id: \.element.id) { index, week in
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: index == 0 ? L10n.tr("Tento týden") : L10n.f("Týden %@", ZoneWeekBars.label(week)))
                            .font(Typo.small).foregroundStyle(Palette.ink)
                        Text(verbatim: L10n.f("od %@ · lehká %@", Fmt.dayMonth(week.start), Fmt.hoursMinutesLong(week.light)))
                            .font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    cell(week.moderate)
                    cell(week.vigorous)
                    cell(week.peak)
                    Text(verbatim: Fmt.int(week.counted))
                        .font(Typo.number(18)).foregroundStyle(ZoneStyle.statusColor(week))
                        .frame(width: 44, alignment: .trailing)
                }
                .padding(.vertical, 10)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L10n.f("Týden %@: střední %@ min, intenzivní %@ min, maximální %@ min, podle WHO %@ min",
                                           ZoneWeekBars.label(week), Fmt.int(week.moderate), Fmt.int(week.vigorous), Fmt.int(week.peak), Fmt.int(week.counted)))
            }
        }
    }

    private func header(_ text: String) -> some View {
        Text(text).frame(width: 44, alignment: .trailing)
    }

    private func cell(_ minutes: Double) -> some View {
        Text(verbatim: Fmt.int(minutes)).font(Typo.number(18)).foregroundStyle(Palette.secondary)
            .frame(width: 44, alignment: .trailing)
    }
}
