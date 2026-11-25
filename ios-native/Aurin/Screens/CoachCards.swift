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
        let line = [L10n.f("%@ z %@ hotovo", String(s.done), String(s.planned)), s.km.map { Units.distanceText($0) }].compactMap { $0 }.joined(separator: ", ")
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
