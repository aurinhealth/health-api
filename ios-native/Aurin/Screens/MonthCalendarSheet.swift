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
    /// Always opens on Readiness, as in the concept (TestFlight 606).
    @State private var metric = Metric.readiness.rawValue

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
        MonthSheet(month: $month, first: firstMonth, last: ISODay.monthStart(today),
                   options: Metric.allCases.map { ($0.rawValue, $0.label) }, selection: $metric) {
            Text(summary)
                .font(Typo.heading(22, relativeTo: .title3)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 6) {
                weekdays
                grid
            }
            .monthSheetCard()
            Text(legend).font(Typo.small).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task(id: month) { await model.loadDays(from: month, to: ISODay.monthEnd(month), force: month == ISODay.monthStart(today)) }
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
        VStack(spacing: 8) {
            ForEach(Array(ISODay.monthGrid(month).enumerated()), id: \.offset) { _, week in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { i in
                        if let day = week[i] {
                            cell(day)
                        } else {
                            Color.clear.frame(maxWidth: .infinity, minHeight: 44)
                        }
                    }
                }
            }
        }
    }

    /// The day's number inside its ring, as the week strip on Today; today a
    /// filled ink disc inside the ring, a day without data a dashed ring,
    /// days to come only a faint number.
    @ViewBuilder private func cell(_ day: String) -> some View {
        let future = day > today
        let isToday = day == today
        let mark = DayMark(metric: chosen, values: model.dayValues[day])
        Button {
            dismiss()
            Task { await model.showDate(day) }
        } label: {
            ZStack {
                if !future { DayRing(mark: mark) }
                if isToday { Circle().fill(Palette.ink).padding(5) }
                Text(ISODay.day(day))
                    .scaledFont(14, weight: isToday ? .bold : .medium, cap: .denseCap)
                    .monospacedDigit()
                    .foregroundStyle(isToday ? Palette.background : future ? Palette.faint : Palette.ink)
            }
            .frame(width: 40, height: 40)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(day == date && !isToday ? Palette.ink.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(future || model.demo || model.dayLocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.dayMonth(day) + (isToday ? ", " + L10n.tr("dnes") : "") + (future ? "" : ", " + mark.spoken))
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
        let dashed = " " + L10n.tr("Čárkovaný kroužek je den bez dat.")
        switch chosen {
        case .readiness: return L10n.tr("Kroužek je připravenost 0 až 100. Oranžová je pod tvým obvyklým rozmezím.") + dashed
        case .sleep: return L10n.tr("Kroužek je spánek proti tvé potřebě, plný při 100 %. Oranžový pod 85 %.") + dashed
        case .strain: return L10n.tr("Kroužek je námaha dne 0 až 21.") + dashed
        case .hrv: return L10n.tr("Kroužek je HRV proti obvyklému rozmezí. Oranžový pod ním.") + dashed
        }
    }

    private static func mean(_ list: [Double]) -> Int {
        Int((list.reduce(0, +) / Double(max(list.count, 1))).rounded())
    }
}

/// The month sheet of every section (Today, Health, Training, Food; "Month
/// calendar identical everywhere", 606): the month in serif with back,
/// forward and close on the right (concept b-podstranky-04), the switch of
/// what the days show, then the section's own summary, month and legend, and
/// "Today" back from another month.
struct MonthSheet<Content: View>: View {
    @Binding var month: String
    /// The first and the last month that can be shown.
    let first: String
    let last: String
    /// (id, Czech label) for the switch.
    let options: [(String, String)]
    @Binding var selection: String
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    private var thisMonth: String { ISODay.monthStart(AppModel.localDate(Date())) }

    var body: some View {
        VStack(spacing: 0) {
            // The month and its buttons stay put while the days scroll.
            HStack(spacing: 8) {
                Text(verbatim: ISODay.monthTitle(month)).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                ChromeButton(systemImage: "chevron.left", label: "Předchozí měsíc", enabled: month > first) { move(-1) }
                ChromeButton(systemImage: "chevron.right", label: "Další měsíc", enabled: month < last) { move(1) }
                ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
            }
            .padding(.horizontal, 20).padding(.top, 24).padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    switcher
                    content
                    if month != thisMonth {
                        ChromeButton(systemImage: "calendar", label: "Dnes", text: "Dnes") { withAnimation(.snappy(duration: 0.25)) { month = thisMonth } }
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 32)
            }
        }
        .background { Palette.background.ignoresSafeArea() }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    /// A soft track with the chosen one lifted, as under the charts.
    private var switcher: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.0) { id, label in
                let on = id == selection
                Button { selection = id } label: {
                    Text(L10n.tr(label))
                        .scaledFont(14, weight: on ? .semibold : .regular, cap: .denseCap)
                        .foregroundStyle(on ? Palette.ink : Palette.muted)
                        .lineLimit(1).minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(on ? Palette.card : .clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.track, in: Capsule())
    }

    private func move(_ by: Int) {
        let next = ISODay.addMonths(month, by)
        guard next >= first, next <= last else { return }
        withAnimation(.snappy(duration: 0.25)) { month = next }
    }
}

extension View {
    /// The month's card in the month sheet.
    func monthSheetCard() -> some View {
        padding(.horizontal, 10).padding(.vertical, 14)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// What a day's ring shows for one metric: how full, in which of the shared
/// status colours (green in or above the usual range, orange below it), and
/// the same for VoiceOver. Strain is an amount, not good or bad: ink.
struct DayMark: Equatable {
    var fill: Double = 0
    var color: Color = Palette.ink
    /// No value that day: a dashed ring.
    var empty = true
    var spoken: String = L10n.tr("bez dat")

    init(metric: MonthCalendarSheet.Metric, values: DayValues?) {
        switch metric {
        case .readiness:
            guard let r = values?.readiness else { return }
            fill = Double(r.score) / 100
            color = r.zone == "green" ? Palette.green : r.zone == "yellow" || r.zone == "red" ? Palette.amber : Palette.muted
            spoken = L10n.f("připravenost %@", String(r.score)) + (ReadinessText.pill(r.zone).map { ", " + $0.0 } ?? "")
        case .sleep:
            guard let s = values?.sleep else { return }
            fill = min(Double(s.percent) / 100, 1)
            // 85 % of the need as WHOOP's sleep performance band, only a guide.
            color = s.percent >= 85 ? Palette.green : Palette.amber
            spoken = Fmt.hoursMinutesLong(Double(s.minutes)) + ", " + L10n.f("%@ %% potřeby", String(s.percent))
        case .strain:
            guard let v = values?.strain else { return }
            fill = min(v / 21, 1)
            color = Palette.ink
            spoken = L10n.f("námaha %@", Fmt.decimal(v, digits: 1))
        case .hrv:
            guard let h = values?.hrv else { return }
            fill = 1
            switch h.band {
            case "above": color = Palette.green; spoken = L10n.f("HRV %@ ms, nad obvyklým rozmezím", String(h.value))
            case "below": color = Palette.amber; spoken = L10n.f("HRV %@ ms, pod obvyklým rozmezím", String(h.value))
            default: color = Palette.green; spoken = L10n.f("HRV %@ ms, v obvyklém rozmezí", String(h.value))
            }
        }
        empty = false
    }
}

/// A day's ring around its number: a dashed ring without data.
struct DayRing: View {
    let mark: DayMark
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if mark.empty {
                Circle().stroke(Palette.faint, style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
            } else {
                Circle().stroke(Palette.track, lineWidth: 3.5)
                Circle().trim(from: 0, to: mark.fill)
                    .stroke(mark.color, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
        }
        .padding(2)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: mark.fill)
    }
}
