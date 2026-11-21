import SwiftUI

/// Training → a tap on the month (redesign T, concept kalendar-strain /
/// kalendar-workouts): the Z2 month in the same sheet as Food's, with Strain
/// (a ring of the day's strain, Today's colours) or Workouts (the day's
/// sports in their colours, grey still ahead, faded grey missed, a dot at
/// rest). A tap on a day closes the sheet and shows that day on Training.
struct TrainingMonthSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let today: String
    /// The day Training shows.
    let selected: String
    let pick: (String) -> Void
    @State private var month: String
    @AppStorage("trainingMonthValue") private var valueRaw = Value.workouts.rawValue

    enum Value: String, CaseIterable {
        case strain, workouts
        var title: String { self == .strain ? "Námaha" : "Tréninky" }
    }

    init(today: String, selected: String, pick: @escaping (String) -> Void) {
        self.today = today
        self.selected = selected
        self.pick = pick
        _month = State(initialValue: ISODay.monthStart(selected))
    }

    private var value: Value { Value(rawValue: valueRaw) ?? .workouts }
    /// Strain reaches 90 days back (the days endpoint), the plan a month ahead.
    private var firstMonth: String { ISODay.monthStart(ISODay.shift(today, -89)) }
    private var lastMonth: String { ISODay.monthStart(ISODay.shift(today, TrainingCalendarCard.daysAhead)) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Zobrazit", selection: $valueRaw) {
                        ForEach(Value.allCases, id: \.rawValue) { Text(L10n.tr($0.title)).tag($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    Text(verbatim: summary).font(Typo.heading(22, relativeTo: .title3)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Card {
                        MonthCalendar(month: month, today: today, selected: selected,
                                      futurePickable: value == .workouts,
                                      pick: { day in
                                          guard day <= ISODay.shift(today, TrainingCalendarCard.daysAhead) else { return }
                                          dismiss()
                                          pick(day)
                                      },
                                      move: move,
                                      spoken: { spoken($0) }) { day in
                            switch value {
                            case .strain: StrainDayRing(strain: day > today ? nil : model.dayValues[day]?.strain, future: day > today)
                            case .workouts: WorkoutDayMark(day: model.calendar[day], future: day > today)
                            }
                        }
                    }
                    Text(verbatim: legend).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 32)
            }
            .background { Palette.background.ignoresSafeArea() }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.large])
        .task(id: month + valueRaw) { await load() }
    }

    private func move(_ by: Int) {
        let next = ISODay.addMonths(month, by)
        guard next >= firstMonth, next <= lastMonth else { return }
        withAnimation(.snappy(duration: 0.25)) { month = next }
    }

    private func load() async {
        let end = ISODay.monthEnd(month)
        switch value {
        case .strain:
            guard month <= today else { return }
            await model.loadDays(from: month, to: min(end, today), force: month == ISODay.monthStart(today))
        case .workouts:
            await model.loadCalendar(from: month, to: end)
        }
    }

    private var daysSoFar: [String] { ISODay.range(month, min(ISODay.monthEnd(month), today)) }

    /// The month in one sentence (concept: "Ten workouts so far in November, 10 h 24 min in total.").
    private var summary: String {
        switch value {
        case .strain:
            let strains = daysSoFar.compactMap { model.dayValues[$0]?.strain }
            guard !strains.isEmpty else { return L10n.tr("Tento měsíc zatím bez námahy.") }
            return L10n.f("Průměrná námaha %@ z 21.", Fmt.decimal(strains.reduce(0, +) / Double(strains.count), digits: 1))
        case .workouts:
            let done = daysSoFar.compactMap { model.calendar[$0] }.flatMap(\.activities).filter { $0.status == "done" && $0.sport != "walk" }
            guard !done.isEmpty else { return L10n.tr("Tento měsíc zatím bez tréninku.") }
            let minutes = done.reduce(0.0) { $0 + ($1.minutes ?? 0) }
            return L10n.plural("%lld tréninků", done.count) + ", " + L10n.f("celkem %@.", Fmt.hoursMinutesLong(minutes))
        }
    }

    private var legend: String {
        switch value {
        case .strain: return L10n.tr("Kroužek je námaha dne 0 až 21. Žlutý do 10, oranžový do 14, výš červený.")
        case .workouts: return L10n.tr("Barva je sport. Bledá je teprve v plánu, šedá nesplněná, tečka je den volna.")
        }
    }

    private func spoken(_ day: String) -> String? {
        switch value {
        case .strain:
            guard day <= today else { return nil }
            return model.dayValues[day]?.strain.map { L10n.f("námaha %@", Fmt.decimal($0, digits: 1)) } ?? L10n.tr("bez dat")
        case .workouts:
            let list = model.calendar[day]?.activities ?? []
            guard !list.isEmpty else { return L10n.tr("volno") }
            return list.map { L10n.tr(SportStyle.name($0.sport)) + ", " + L10n.tr($0.status == "done" ? "hotovo" : $0.status == "missed" ? "nesplněno" : "v plánu") }
                .joined(separator: "; ")
        }
    }
}

/// A day's strain under its number: a ring 0–21 in Today's colours (light
/// under 10, moderate under 14, high above), dashed without data.
struct StrainDayRing: View {
    let strain: Double?
    var future = false

    var body: some View {
        ZStack {
            if future {
                Color.clear
            } else if let strain {
                Circle().stroke(Palette.track, lineWidth: 3)
                Circle().trim(from: 0, to: min(max(strain / 21, 0.02), 1))
                    .stroke(strain >= 14 ? Palette.rust : strain >= 10 ? Palette.amberBar : Palette.gold, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            } else {
                Circle().stroke(Palette.faint, style: StrokeStyle(lineWidth: 1.2, dash: [2, 3]))
            }
        }
        .frame(width: 16, height: 16)
    }
}

/// A day's sessions under its number: up to two sport figures in their
/// colour when done, grey ahead, faded grey missed; a dot at rest.
struct WorkoutDayMark: View {
    let day: CalendarDay?
    var future = false

    var body: some View {
        let all = (day?.activities ?? []).filter { $0.status == "done" || $0.status == "planned" || $0.status == "missed" }
        let list = Array((all.filter { $0.sport != "walk" }.isEmpty ? all : all.filter { $0.sport != "walk" }).prefix(2))
        HStack(spacing: 1) {
            if list.isEmpty {
                if day != nil, !future { Circle().fill(Palette.faint.opacity(0.6)).frame(width: 4, height: 4) }
            } else {
                ForEach(list) { a in
                    Image(systemName: SportDisc.symbol(a.sport, type: a.type))
                        .scaledFont(14, weight: .medium, cap: .denseCap)
                        .foregroundStyle(a.status == "missed" ? Palette.muted : Palette.Sport.color(a.sport))
                        .opacity(a.status == "planned" ? 0.62 : a.status == "missed" ? 0.55 : 1)
                }
            }
        }
        .frame(height: 16)
    }
}
