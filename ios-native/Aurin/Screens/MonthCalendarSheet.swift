import SwiftUI

/// Today → a tap on the month (Petr, 2026-11-11, as Bevel): the whole month
/// with a ring a day for one of Readiness, Sleep, Strain and HRV, and a line
/// on the month. The ring's length carries the value, the colour only adds to
/// it. A tap on a day closes the sheet and opens that day on Today.
struct MonthCalendarSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The day Today shows.
    let date: String
    @State private var month: String
    @AppStorage("monthCalendarMetric") private var metric = Metric.readiness.rawValue

    init(date: String) {
        self.date = date
        _month = State(initialValue: ISODay.monthStart(date))
    }

    enum Metric: String, CaseIterable, Identifiable {
        case readiness, sleep, strain, hrv
        var id: String { rawValue }
        var label: String {
            switch self {
            case .readiness: return "Připravenost"
            case .sleep: return "Spánek"
            case .strain: return "Námaha"
            case .hrv: return "HRV"
            }
        }
    }

    private var today: String { AppModel.localDate(Date()) }
    private var chosen: Metric { Metric(rawValue: metric) ?? .readiness }
    /// Back to the third month before this one: the server reads 90 days back.
    private var firstMonth: String { ISODay.monthStart(ISODay.shift(today, -90)) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Picker("Zobrazit", selection: $metric) {
                        ForEach(Metric.allCases) { Text(L10n.tr($0.label)).tag($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    weekdays
                    grid
                    Text(summary)
                        .font(Typo.small).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text(legend).font(Typo.caption).foregroundStyle(Palette.faint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 32)
            }
            .background { Palette.background.ignoresSafeArea() }
            .navigationTitle(ISODay.monthTitle(month))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { move(-1) } label: { Image(systemName: "chevron.left") }
                        .accessibilityLabel("Předchozí měsíc")
                        .disabled(month <= firstMonth)
                    Button { move(1) } label: { Image(systemName: "chevron.right") }
                        .accessibilityLabel("Další měsíc")
                        .disabled(month >= ISODay.monthStart(today))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Zavřít")
                }
                ToolbarItem(placement: .bottomBar) {
                    if month != ISODay.monthStart(today) {
                        Button("Dnes") { month = ISODay.monthStart(today) }
                    }
                }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.large])
        .task(id: month) { await model.loadDays(from: month, to: ISODay.monthEnd(month), force: month == ISODay.monthStart(today)) }
    }

    private func move(_ by: Int) {
        let next = ISODay.addMonths(month, by)
        guard next >= firstMonth, next <= ISODay.monthStart(today) else { return }
        withAnimation(.snappy(duration: 0.25)) { month = next }
    }

    private var weekdays: some View {
        HStack(spacing: 0) {
            ForEach(Fmt.weekdaysFromMonday, id: \.self) {
                Text(verbatim: $0).font(.caption2.weight(.semibold)).foregroundStyle(Palette.faint).frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    private var grid: some View {
        VStack(spacing: 6) {
            ForEach(Array(ISODay.monthGrid(month).enumerated()), id: \.offset) { _, week in
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        if let day = week[i] {
                            cell(day)
                        } else {
                            Color.clear.frame(maxWidth: .infinity, minHeight: 58)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func cell(_ day: String) -> some View {
        let future = day > today
        let mark = DayMark(metric: chosen, values: model.dayValues[day])
        Button {
            dismiss()
            Task { await model.showDate(day) }
        } label: {
            VStack(spacing: 4) {
                if future {
                    Spacer(minLength: 0)
                } else {
                    DayRing(mark: mark)
                }
                Text(ISODay.day(day))
                    .scaledFont(13, weight: day == today ? .bold : .semibold, cap: .denseCap)
                    .foregroundStyle(future ? Palette.faint : day == today ? Palette.amber : Palette.ink)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .padding(.vertical, 4)
            .background(future ? Color.clear : Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(day == date ? Palette.ink : .clear, lineWidth: 2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(future || model.demo || model.dayLocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.dayMonth(day) + (future ? "" : ", " + mark.spoken))
        .accessibilityAddTraits(day == date ? .isSelected : [])
    }

    /// The month in one line, without colour names (they say nothing to
    /// someone who cannot tell them apart).
    private var summary: String {
        let values = ISODay.range(month, min(ISODay.monthEnd(month), today)).compactMap { model.dayValues[$0] }
        switch chosen {
        case .readiness:
            let scores = values.compactMap(\.readiness)
            guard !scores.isEmpty else { return L10n.tr("Připravenost se ukáže po první noci s hodinkami.") }
            let usual = scores.filter { $0.zone == "green" }.count
            return L10n.f("Průměr %@.", String(Self.mean(scores.map { Double($0.score) }))) + " "
                + L10n.plural("%lld dní v obvyklém rozmezí", usual) + ", "
                + L10n.plural("%lld pod ním", scores.count - usual) + "."
        case .sleep:
            let nights = values.compactMap(\.sleep)
            guard !nights.isEmpty else { return L10n.tr("Tento měsíc zatím bez zaznamenaných nocí.") }
            return L10n.f("Průměrně %@ %% potřeby spánku.", String(Self.mean(nights.map { Double($0.percent) })))
        case .strain:
            let strains = values.compactMap(\.strain)
            guard !strains.isEmpty else { return L10n.tr("Tento měsíc zatím bez námahy.") }
            return L10n.f("Průměrná námaha %@ z 21.", Fmt.decimal(strains.reduce(0, +) / Double(strains.count), digits: 1))
        case .hrv:
            let hrv = values.compactMap(\.hrv)
            guard !hrv.isEmpty else { return L10n.tr("Tento měsíc zatím bez HRV.") }
            return L10n.plural("%lld dní nad obvyklým rozmezím", hrv.filter { $0.band == "above" }.count) + ", "
                + L10n.plural("%lld pod ním", hrv.filter { $0.band == "below" }.count) + "."
        }
    }

    private var legend: String {
        switch chosen {
        case .readiness: return L10n.tr("Kroužek je připravenost 0 až 100.")
        case .sleep: return L10n.tr("Kroužek je spánek proti potřebě, plný při 100 %.")
        case .strain: return L10n.tr("Kroužek je námaha dne 0 až 21.")
        case .hrv: return L10n.tr("Šipka je HRV proti obvyklému rozmezí.")
        }
    }

    private static func mean(_ list: [Double]) -> Int {
        Int((list.reduce(0, +) / Double(max(list.count, 1))).rounded())
    }
}

/// What a day's ring shows for one metric: how full, in what colour, an
/// arrow inside for HRV, and the same for VoiceOver.
struct DayMark: Equatable {
    var fill: Double = 0
    var color: Color = Palette.ink
    var symbol: String? = nil
    var spoken: String = L10n.tr("bez dat")

    init(metric: MonthCalendarSheet.Metric, values: DayValues?) {
        switch metric {
        case .readiness:
            guard let r = values?.readiness else { return }
            fill = Double(r.score) / 100
            color = ReadinessText.pill(r.zone)?.1 ?? Palette.muted
            spoken = L10n.f("připravenost %@", String(r.score)) + (ReadinessText.pill(r.zone).map { ", " + $0.0 } ?? "")
        case .sleep:
            guard let s = values?.sleep else { return }
            fill = min(Double(s.percent) / 100, 1)
            color = Palette.indigo
            spoken = Fmt.hoursMinutesLong(Double(s.minutes)) + ", " + L10n.f("%@ %% potřeby", String(s.percent))
        case .strain:
            guard let v = values?.strain else { return }
            fill = min(v / 21, 1)
            color = Palette.amberBar
            spoken = L10n.f("námaha %@", Fmt.decimal(v, digits: 1))
        case .hrv:
            guard let h = values?.hrv else { return }
            fill = 1
            switch h.band {
            case "above": color = Palette.green; symbol = "arrow.up"; spoken = L10n.f("HRV %@ ms, nad obvyklým rozmezím", String(h.value))
            case "below": color = Palette.amber; symbol = "arrow.down"; spoken = L10n.f("HRV %@ ms, pod obvyklým rozmezím", String(h.value))
            default: color = Palette.muted; symbol = "minus"; spoken = L10n.f("HRV %@ ms, v obvyklém rozmezí", String(h.value))
            }
        }
    }
}

/// A day's ring: an empty track without data.
struct DayRing: View {
    let mark: DayMark
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().stroke(Palette.track, lineWidth: 4)
            Circle().trim(from: 0, to: mark.fill)
                .stroke(mark.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if let symbol = mark.symbol {
                Image(systemName: symbol).scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(mark.color)
            }
        }
        .frame(width: 28, height: 28)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: mark.fill)
    }
}
