import SwiftUI

/// The coach's one action on Today, at the bottom of the coach's card under
/// the three numbers (Today audit 10, mockup approved 2026-11-07): the workouts
/// planned for today, the gym one with Start, and under them the activity of
/// the day when it suggests something else (CoachPickCard, Swap / Keep plan);
/// without a plan for today the activity of the day in full. The code picks
/// it from the day's plan and verdict, never the AI. Under it the plan's line
/// with its sessions left this week (competitor point 9) and Regenerace when
/// hard training must still wait. The weather is in the readiness row (part D).
struct TodayCoachAction: View {
    let today: TodaySnapshot

    /// Today's workouts still ahead.
    static func planned(_ today: TodaySnapshot) -> [TodaySnapshot.PlanItem] {
        today.plan.filter { $0.kind == "workout" && !$0.done && ($0.status ?? "planned") == "planned" }
    }

    var body: some View {
        let planned = Self.planned(today)
        VStack(alignment: .leading, spacing: 0) {
            if planned.isEmpty && today.unavailable?.contains("training") == true {
                // The day's plan could not be read: not "nothing planned".
                PartUnavailableNote(text: "Trénink se teď nepodařilo načíst")
            } else if planned.isEmpty {
                CoachPickCard(inCard: true)
            } else {
                ForEach(Array(planned.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.vertical, 10) }
                    TodayTrainingRow(item: item)
                }
                CoachPickCard(planned: planned, red: today.readiness.zone == "red")
            }

            if let plan = today.trainingPlan {
                Label(Self.planLine(plan), systemImage: "flag")
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                    .lineLimit(2)
                    .padding(.top, 12)
            }

            if RecoveryTipRows.hasTip(today, selectedDate: nil) {
                Divider().overlay(Palette.hairline).padding(.top, 12)
                RecoveryTipRows(today: today)
            }
        }
    }

    /// "Half marathon, week 3/12, Build, 2 sessions left", or "paused".
    static func planLine(_ plan: TodaySnapshot.PlanLine) -> String {
        if plan.paused == true { return [plan.name, L10n.tr("pozastaveno")].joined(separator: ", ") }
        let left = plan.sessionsLeft.flatMap { $0 > 0 ? L10n.plural("zbývá %lld tréninků", $0) : nil }
        return ([plan.name, L10n.f("týden %@/%@", String(plan.week), String(plan.weeksCount))] + [plan.phaseLabel, left].compactMap { $0 }).joined(separator: ", ")
    }
}

/// One planned workout: "Today, 5:30 PM, 45 min", its name, and Start for
/// the gym (Training mode). A tap elsewhere opens it as the day's timeline does.
struct TodayTrainingRow: View {
    let item: TodaySnapshot.PlanItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            row
            // A yellow morning: how to do a hard session, under its name (wave 4, 28.2).
            if let steady = item.steady {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "gauge.with.dots.needle.33percent").scaledFont(11, weight: .semibold).foregroundStyle(Palette.amber)
                    Text(verbatim: steady).font(Typo.small).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 48)
                .accessibilityElement(children: .combine)
            }
            // Muscles not rested yet (src/day-decision.js): with Aurin Pro a tap
            // asks the coach for a lighter version; without it the session's
            // detail opens, where it can be changed (the path outside the coach).
            if let lighter = item.lighter {
                Group {
                    if !ProStore.shared.entitled, let route = item.session.flatMap(WeekSessionsList.destination) {
                        NavigationLink(value: route) { lighterLine(lighter) }.buttonStyle(.plain)
                    } else {
                        Button { askLighter = true } label: { lighterLine(lighter) }.buttonStyle(.plain)
                    }
                }
                .padding(.leading, 48)
                .accessibilityIdentifier("today-training.lighter")
                .sheet(isPresented: $askLighter) {
                    CoachEntry.chat(subject: item.session.map(CoachSubject.planned), view: "today", date: nil)
                }
            }
        }
    }

    private func lighterLine(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "figure.cooldown").scaledFont(11, weight: .semibold).foregroundStyle(Palette.amber)
            Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.right").scaledFont(10, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .frame(minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    @State private var askLighter = false

    private var row: some View {
        HStack(spacing: 12) {
            if let route = item.session.flatMap(WeekSessionsList.destination) {
                NavigationLink(value: route) { info }.buttonStyle(.plain)
            } else {
                info
            }
            if item.sport == "strength" {
                NavigationLink(value: AppRoute.trainingMode(AppModel.localDate(Date()))) {
                    // One Start on Today: ink, no icon, as in the Day card (TestFlight 604.1).
                    Text("Začít").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).frame(height: 30)
                        .background(Palette.button, in: Capsule())
                        .tapTarget(width: 44, height: 30)
                }
                .buttonStyle(.plain)
                // Start workout: it opens with 3, 2, 1 and starts (concept 08).
                .simultaneousGesture(TapGesture().onEnded { TrainingModeView.startOnOpen = AppModel.localDate(Date()) })
                .accessibilityIdentifier("today-training.start")
            } else if item.session.flatMap(WeekSessionsList.destination) != nil {
                Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
            }
        }
    }

    private var info: some View {
        HStack(spacing: 12) {
            // The concept's sport disc, pale while ahead, as Week plan (never a dashed ring).
            SportDisc(sport: item.sport ?? "other", type: item.session?.type, state: .ahead, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: meta).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                // An eased session's title is already the easy one (the original is eased.title).
                Text(verbatim: item.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    /// "Today, 5:30 PM, 45 min": the time and length only when known.
    private var meta: String {
        let time = (item.session?.time ?? item.time).map { ClockText.format($0) }
        let length = (item.session?.minutes).map { Fmt.duration($0) }
        return [L10n.tr("Dnes"), time, length].compactMap { $0 }.joined(separator: ", ")
    }
}
