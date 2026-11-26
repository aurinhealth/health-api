import SwiftUI

/// The day a food goes into, beside the meal (617, Petr 2026-11-23): always
/// shown, a grey "Today" or another day's date in amber, with a chevron. A tap
/// offers Today, Yesterday and a calendar; the food then goes straight to that
/// day (AppModel.addDay), whatever day the screens show.
struct DayPill: View {
    @Environment(AppModel.self) private var model
    @State private var calendar = false

    private var today: String { AppModel.localDate(Date()) }

    var body: some View {
        let day = model.writeDay
        Menu {
            Button { model.addDay = today } label: { Text("Dnes") }
            Button { model.addDay = AppModel.shift(today, by: -1) } label: { Text("Včera") }
            Button { calendar = true } label: { Label("Vybrat den", systemImage: "calendar") }
        } label: {
            HStack(spacing: 4) {
                Text(verbatim: Self.text(day, today: today)).lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .font(Typo.small.weight(.semibold))
            .foregroundStyle(day == today ? Palette.muted : Palette.amber)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background { Capsule().fill((day == today ? Palette.ink : Palette.amber).opacity(day == today ? 0.06 : 0.14)) }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr("Den"))
        .accessibilityValue(Self.text(day, today: today))
        .sheet(isPresented: $calendar) {
            DayPillCalendar(day: day, today: today) { model.addDay = $0 }
                .presentationDetents([.medium])
        }
    }

    /// "Today" or "Sun, Nov 22" ("Ne 22. 11."): one short form that never cuts.
    static func text(_ day: String, today: String) -> String {
        day == today ? L10n.tr("Dnes") : Fmt.weekdayDayMonthShort(day)
    }
}

/// The calendar behind "Choose a day": a day gone by or up to two weeks ahead,
/// as far as Food plans meals.
private struct DayPillCalendar: View {
    @Environment(\.dismiss) private var dismiss
    let day: String
    let today: String
    let chosen: (String) -> Void
    @State private var date: Date

    init(day: String, today: String, chosen: @escaping (String) -> Void) {
        self.day = day
        self.today = today
        self.chosen = chosen
        _date = State(initialValue: DateFormatters.iso().date(from: day) ?? Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Vybrat den").font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").scaledFont(14, weight: .semibold).foregroundStyle(Palette.muted)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(L10n.tr("Zavřít"))
            }
            DatePicker("Den", selection: $date, in: range, displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()
                .tint(Palette.amber)
        }
        .padding(.horizontal, 20).padding(.top, 16)
        .onChange(of: date) { _, new in
            chosen(AppModel.localDate(new))
            dismiss()
        }
    }

    private var range: ClosedRange<Date> {
        let now = DateFormatters.iso().date(from: today) ?? Date()
        let end = Calendar.current.date(byAdding: .day, value: 14, to: now) ?? now
        return Date.distantPast...end
    }
}

/// The meal and the day of a food, in one row above "Add to …".
struct MealDayRow: View {
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 8) {
            MealMenu(selection: $selection)
            DayPill()
        }
    }
}
