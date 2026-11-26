import SwiftUI

// The cards under the coach's own messages from the rules (concept 09, pages
// 7 and 8): the week's summary on Sunday evening. Numbers from the server,
// no AI; the "From …" line stands under the card.

/// "Your week" under the Sunday message: workouts and time against the week
/// before, each sport, the load and the sleep in words, and "Plan next week".
struct WeekSummaryCard: View {
    let summary: WeekSummary
    @State private var planning = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tvůj týden").font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Text(verbatim: L10n.f("%@ až %@", Fmt.dayMonthShort(summary.start), Fmt.dayMonthShort(summary.end)))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(alignment: .top, spacing: 16) {
                    let w = summary.workouts
                    stat(L10n.tr("Tréninky"), Self.count(w.done, of: w.planned),
                         was: w.was.map { L10n.f("Minulý týden %@", Self.count($0.done, of: $0.planned)) })
                    stat(L10n.tr("Čas"), Fmt.duration(summary.minutes.total),
                         was: summary.minutes.was.map { L10n.f("Minulý týden %@", Fmt.duration($0)) })
                }
                ForEach(summary.sports ?? [], id: \.sport) { sport in
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    sportRow(sport)
                }
                let lines = [summary.load?.text, summary.sleep?.text].compactMap { $0 }
                if !lines.isEmpty {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    ForEach(lines, id: \.self) { line in
                        Text(verbatim: line).font(Typo.small).foregroundStyle(Palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Button { planning = true } label: {
                    Text("Naplánovat příští týden").font(.body.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(minHeight: 50)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 26)
            if let from = summary.from, !from.isEmpty {
                Text(verbatim: from).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // The week after the summary's: next week on Sunday, this week on Monday.
        .sheet(isPresented: $planning) { WeekPlanSheet(week: ISODay.shift(summary.start, 7)) }
    }

    /// "5 of 6", or "5" for a week without a plan.
    static func count(_ done: Int, of planned: Int) -> String {
        planned > 0 ? L10n.f("%@ z %@", String(done), String(planned)) : String(done)
    }

    /// "2 of 2 done", or "2 done" for a sport nothing was planned in.
    static func done(_ done: Int, of planned: Int) -> String {
        planned > 0 ? L10n.f("%@ z %@ hotovo", String(done), String(planned)) : L10n.f("%@ hotovo", String(done))
    }

    private func stat(_ name: String, _ value: String, was: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: name).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(verbatim: value).font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
            if let was { Text(verbatim: was).font(Typo.caption).foregroundStyle(Palette.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// "Ride, 2 of 2 done, 96 km" and its time.
    private func sportRow(_ s: WeekSummary.Sport) -> some View {
        let line = [Self.done(s.done, of: s.planned), s.km.map { Units.distanceText($0) }].compactMap { $0 }.joined(separator: ", ")
        return HStack(spacing: 12) {
            Image(systemName: SportIcon.symbol(s.sport == "gym" ? "strength" : s.sport))
                .scaledFont(15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(Palette.Sport.color(s.sport))
                .frame(width: 36, height: 36)
                .background(Palette.Sport.color(s.sport).opacity(0.14), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: L10n.tr(PlanAroundBlock.names[s.sport] ?? s.sport)).font(Typo.body).foregroundStyle(Palette.ink)
                Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            if s.minutes > 0 {
                Text(verbatim: Fmt.duration(s.minutes)).font(Typo.body).foregroundStyle(Palette.ink)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Behind a chip of the race-week message (concept 09, 8): "Fuel and drinks"
/// (chip 0) or "Pacing plan" (chip 1), shown on the phone, no message sent.
struct RaceWeekCard: View {
    let week: RaceWeek
    /// Which of week.chips the athlete tapped.
    let chip: Int

    var body: some View {
        if chip == 0, let fuel = week.fuel {
            card(from: fuel.from) {
                ForEach(Array(fuel.rows.enumerated()), id: \.offset) { _, row in
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: row.title).font(Typo.body).foregroundStyle(Palette.ink)
                        if let text = row.text, !text.isEmpty { Text(verbatim: text).font(Typo.caption).foregroundStyle(Palette.muted) }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
                }
                if let note = fuel.note, !note.isEmpty { footnote(note) }
            }
        } else if chip == 1, let pacing = week.pacing {
            card(from: pacing.from) {
                if let line = pacing.line, !line.isEmpty {
                    Text(verbatim: line).font(Typo.small).foregroundStyle(Palette.secondary)
                }
                ForEach(Array(pacing.segments.enumerated()), id: \.offset) { _, segment in
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: Self.range(segment)).font(Typo.body).foregroundStyle(Palette.ink)
                            if let cue = segment.cue, !cue.isEmpty { Text(verbatim: cue).font(Typo.caption).foregroundStyle(Palette.muted) }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        if let value = segment.paceText ?? segment.wattsText {
                            Text(verbatim: value).font(Typo.heading(20)).foregroundStyle(Palette.ink)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                ForEach([pacing.climb, pacing.sight].compactMap { $0 }, id: \.self) { footnote($0) }
            }
        }
    }

    /// The chip's words as the title, the race under it, the rows, then "From …" under the card.
    private func card<Rows: View>(from: String?, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: week.chips?[safe: chip] ?? "").font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    let race = [week.race.name, week.race.date.map { Fmt.weekdayDayMonth($0) }].compactMap { $0 }.joined(separator: ", ")
                    if !race.isEmpty { Text(verbatim: race).font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                rows()
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 26)
            if let from, !from.isEmpty {
                Text(verbatim: from).font(Typo.caption).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func footnote(_ text: String) -> some View {
        Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)
    }

    /// "km 1 to 5", "km 17 to 21.1" or "0 to 100 m".
    static func range(_ s: RaceWeek.Pacing.Segment) -> String {
        let number = { (v: Double) in v.rounded() == v ? String(Int(v)) : Fmt.decimal(v) }
        if let from = s.fromKm, let to = s.toKm { return L10n.f("km %@ až %@", number(from), number(to)) }
        if let from = s.fromM, let to = s.toM { return L10n.f("%@ až %@ m", number(from), number(to)) }
        return ""
    }
}
