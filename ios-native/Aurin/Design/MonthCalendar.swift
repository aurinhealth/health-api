import SwiftUI

/// The one month calendar of the new design (redesign Z2), for Today, Food,
/// Training and the cycle: the month between arrows, the weekdays from
/// Monday, and each day's number with the section's own mark under it.
/// Today is a filled ink disc with a bold number and no outline; the chosen
/// day sits in the soft grey pill of the week strip; days after today are
/// faint and cannot be picked.
struct MonthCalendar<Mark: View>: View {
    /// Any day of the month shown.
    let month: String
    let today: String
    var selected: String? = nil
    /// A line under the month ("12 workouts, 14 h 20 min").
    var subtitle: String? = nil
    /// Future days can be picked (a plan) or not (data).
    var futurePickable = false
    let pick: (String) -> Void
    /// -1 back a month, +1 forward.
    let move: (Int) -> Void
    @ViewBuilder var mark: (String) -> Mark

    private var first: String { ISODay.monthStart(month) }
    private var canGoForward: Bool { futurePickable || ISODay.monthEnd(month) < today }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    .accessibilityLabel(L10n.tr("Předchozí měsíc"))
                Spacer(minLength: 0)
                VStack(spacing: 1) {
                    Text(verbatim: ISODay.monthTitle(first)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    if let subtitle { Text(verbatim: subtitle).font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                    .disabled(!canGoForward)
                    .opacity(canGoForward ? 1 : 0.35)
                    .accessibilityLabel(L10n.tr("Další měsíc"))
            }
            .foregroundStyle(Palette.ink)
            .buttonStyle(.plain)
            HStack(spacing: 0) {
                ForEach(Array(Fmt.weekdaysFromMonday.enumerated()), id: \.offset) { _, name in
                    Text(verbatim: name).font(.caption2.weight(.semibold)).foregroundStyle(Palette.faint).frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
            ForEach(Array(ISODay.monthGrid(first).enumerated()), id: \.offset) { _, week in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { i in
                        if let day = week[i] {
                            cell(day)
                        } else {
                            Color.clear.frame(maxWidth: .infinity, minHeight: 52)
                        }
                    }
                }
            }
        }
    }

    private func cell(_ day: String) -> some View {
        let future = day > today
        let isToday = day == today
        let isSelected = day == selected
        return Button { pick(day) } label: {
            VStack(spacing: 4) {
                DayNumber(day: day, isToday: isToday, faint: future)
                mark(day)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.vertical, 4)
            .background(isSelected && !isToday ? Palette.ink.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(future && !futurePickable)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Fmt.dayMonth(day) + (isToday ? ", " + L10n.tr("dnes") : ""))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// A day's number in the month calendar; today a filled ink disc, bold, no outline.
struct DayNumber: View {
    let day: String
    var isToday = false
    var faint = false

    var body: some View {
        Text(verbatim: ISODay.day(day))
            .scaledFont(14, weight: isToday ? .bold : .regular, cap: .denseCap)
            .monospacedDigit()
            .foregroundStyle(isToday ? Palette.background : faint ? Palette.faint : Palette.ink)
            .frame(width: 30, height: 30)
            .background {
                if isToday { Circle().fill(Palette.ink) }
            }
    }
}
