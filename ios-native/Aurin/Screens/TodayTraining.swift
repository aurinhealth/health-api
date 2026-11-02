import SwiftUI

/// Today under the key numbers (Petr, 2026-11-02, Today C2): the workouts
/// planned for today, the gym one with Start, and under them the activity of
/// the day when it suggests something else (CoachPickCard, Swap / Keep plan).
/// Without a plan for today the activity of the day stands here in full.
struct TodayTrainingCard: View {
    let items: [TodaySnapshot.PlanItem]
    /// A red morning: the activity of the day speaks even when it is the planned sport.
    var red = false

    /// Today's workouts still ahead.
    static func planned(_ today: TodaySnapshot) -> [TodaySnapshot.PlanItem] {
        today.plan.filter { $0.kind == "workout" && !$0.done && ($0.status ?? "planned") == "planned" }
    }

    var body: some View {
        Card(padding: 14) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.vertical, 10) }
                    TodayTrainingRow(item: item)
                }
                CoachPickCard(planned: items, red: red)
            }
        }
    }
}

/// One planned workout: "Today · 5:30 PM · 45 min", its name, and Start for
/// the gym (Training mode). A tap elsewhere opens it as the day's timeline does.
struct TodayTrainingRow: View {
    let item: TodaySnapshot.PlanItem

    var body: some View {
        HStack(spacing: 12) {
            if let route = item.session.flatMap(WeekSessionsList.destination) {
                NavigationLink(value: route) { info }.buttonStyle(.plain)
            } else {
                info
            }
            if item.sport == "strength" {
                NavigationLink(value: AppRoute.trainingMode(AppModel.localDate(Date()))) {
                    Label(L10n.tr("Začít"), systemImage: "play.fill")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                        .padding(.horizontal, 14).frame(height: 36)
                        .background(Palette.green, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("today-training.start")
            } else if item.session.flatMap(WeekSessionsList.destination) != nil {
                Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
            }
        }
    }

    private var info: some View {
        HStack(spacing: 12) {
            PlanStateIcon(symbol: SportIcon.symbol(item.sport ?? "other"), state: .upcoming, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: meta).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                // An eased session's title is already the easy one (the original is eased.title).
                Text(verbatim: item.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    /// "Today · 5:30 PM · 45 min": the time and length only when known.
    private var meta: String {
        let time = (item.session?.time ?? item.time).map { ClockText.format($0) }
        let length = (item.session?.minutes).map { Fmt.duration($0) }
        return [L10n.tr("Dnes"), time, length].compactMap { $0 }.joined(separator: " · ")
    }
}
