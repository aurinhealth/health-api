import SwiftUI

/// Training's calendar: a strip of days to swipe through (five in full, the
/// next ones blurred at the edges), each with its weekday, date and the main
/// sport. Pulled down it opens the whole month with the day's count of
/// activities, their time or calories. The chosen day's activities are below.
struct TrainingCalendarCard: View {
    @Environment(AppModel.self) private var model
    let today: String
    @State private var selected: String?
    @State private var centered: String?
    @State private var expanded = false
    @State private var month: String?
    @AppStorage("calendarMode") private var mode = CalendarMode.count.rawValue

    enum CalendarMode: String, CaseIterable, Identifiable {
        case count, time, kcal
        var id: String { rawValue }
        var label: String {
            switch self {
            case .count: return "Počet"
            case .time: return "Čas"
            case .kcal: return "Kalorie"
            }
        }
    }

    private var day: String { selected ?? today }
    private var stripDays: [String] { ISODay.range(ISODay.shift(today, -60), ISODay.shift(today, 30)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if expanded {
                MonthGrid(month: month ?? ISODay.monthStart(day), today: today, selected: day,
                          mode: CalendarMode(rawValue: mode) ?? .count, days: model.calendar,
                          pick: { pick($0, scroll: false) }, move: { moveMonth($0) })
                Picker("Zobrazit", selection: $mode) {
                    ForEach(CalendarMode.allCases) { Text($0.label).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .padding(.top, 14)
            } else {
                strip
            }
            handle
            CalendarDayList(date: day, today: today, day: model.calendar[day])
                .padding(.top, 6)
        }
        .padding(.vertical, 14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) * 1.5 else { return }
                if value.translation.height > 40 && !expanded { toggle() }
                if value.translation.height < -40 && expanded { toggle() }
            }
        )
        .task { await model.loadCalendar(from: stripDays.first ?? today, to: stripDays.last ?? today) }
    }

    // MARK: Strip

    private var strip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(stripDays, id: \.self) { date in
                        Button { pick(date, scroll: true, proxy: proxy) } label: {
                            DayCircle(date: date, today: today, selected: date == day, day: model.calendar[date])
                        }
                        .buttonStyle(.plain)
                        .containerRelativeFrame(.horizontal, count: 6, spacing: 0)
                        .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                            content
                                .blur(radius: phase.isIdentity ? 0 : 2.5)
                                .opacity(phase.isIdentity ? 1 : 0.45)
                                .scaleEffect(phase.isIdentity ? 1 : 0.88)
                        }
                        .id(date)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $centered, anchor: .center)
            .frame(height: 96)
            .onAppear { proxy.scrollTo(day, anchor: .center) }
            .onChange(of: centered) { _, date in
                // The day in the middle is the chosen one, as in a picker.
                if let date, date != day { selected = date }
            }
        }
    }

    private var handle: some View {
        Button(action: toggle) {
            VStack(spacing: 3) {
                Capsule().fill(Palette.faint.opacity(0.5)).frame(width: 36, height: 4)
                Text(expanded ? "Méně" : "Celý měsíc").font(.caption2.weight(.medium)).foregroundStyle(Palette.faint)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(expanded ? "Zavřít měsíc" : "Ukázat celý měsíc"))
    }

    private func toggle() {
        if !expanded { month = ISODay.monthStart(day) }
        withAnimation(.spring(duration: 0.35)) { expanded.toggle() }
        if expanded, let month { Task { await model.loadCalendar(from: month, to: ISODay.monthEnd(month)) } }
    }

    private func pick(_ date: String, scroll: Bool, proxy: ScrollViewProxy? = nil) {
        selected = date
        if scroll, let proxy { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(date, anchor: .center) } }
        else { centered = date }
    }

    private func moveMonth(_ by: Int) {
        let next = ISODay.addMonths(month ?? ISODay.monthStart(day), by)
        month = next
        Task { await model.loadCalendar(from: next, to: ISODay.monthEnd(next)) }
    }
}

/// One day of the strip: "P", the main sport in a circle and "9".
struct DayCircle: View {
    let date: String
    let today: String
    let selected: Bool
    let day: CalendarDay?

    var body: some View {
        let style = SportStyle(day: day, date: date, today: today)
        VStack(spacing: 6) {
            Text(Fmt.weekdayInitial(date))
                .font(.system(size: 12, weight: date == today ? .bold : .medium))
                .foregroundStyle(date == today ? Palette.amber : Palette.faint)
            ZStack {
                Circle().fill(style.fill)
                if style.dashed {
                    Circle().strokeBorder(style.tint.opacity(0.7), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                }
                Image(systemName: style.symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(style.tint)
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().stroke(selected ? Palette.ink : .clear, lineWidth: 2).padding(-4))
            Text(ISODay.day(date))
                .font(Typo.number(15))
                .foregroundStyle(selected ? Palette.ink : Palette.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.weekdayShort(date) + " " + Fmt.dayMonth(date) + ", " + style.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// How a day's sport looks: done filled, planned dashed, rest quiet.
struct SportStyle {
    let symbol: String
    let tint: Color
    let fill: Color
    let dashed: Bool
    let label: String

    init(day: CalendarDay?, date: String, today: String) {
        let sport = day?.primary ?? "rest"
        let done = (day?.count ?? 0) > 0
        if sport == "rest" {
            symbol = "moon.zzz"
            tint = Palette.faint
            fill = date <= today ? Palette.track : .clear
            dashed = false
            label = L10n.tr(day == nil ? "bez dat" : "volno")
        } else {
            symbol = SportIcon.symbol(sport)
            tint = done ? .white : Self.color(sport)
            fill = done ? Self.color(sport) : Self.color(sport).opacity(0.1)
            dashed = !done
            label = done ? L10n.tr(Self.name(sport)) : L10n.f("v plánu %@", L10n.tr(Self.name(sport)))
        }
    }

    static func color(_ sport: String) -> Color {
        switch sport {
        case "ride": return Palette.amberBar
        case "run": return Palette.rust
        case "strength": return Palette.indigo
        case "swim": return Palette.blue
        case "walk": return Palette.green
        default: return Palette.brown
        }
    }

    static func name(_ sport: String) -> String {
        switch sport {
        case "ride": return "kolo"
        case "run": return "běh"
        case "strength": return "posilovna"
        case "swim": return "plavání"
        case "walk": return "chůze"
        default: return "aktivita"
        }
    }
}

// MARK: - Month

struct MonthGrid: View {
    let month: String
    let today: String
    let selected: String
    let mode: TrainingCalendarCard.CalendarMode
    let days: [String: CalendarDay]
    let pick: (String) -> Void
    let move: (Int) -> Void

    private var names: [String] {
        L10n.isEnglish ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
                    .accessibilityLabel("Předchozí měsíc")
                Spacer()
                VStack(spacing: 1) {
                    Text(ISODay.monthTitle(month)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(total).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer()
                Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                    .accessibilityLabel("Další měsíc")
            }
            .foregroundStyle(Palette.ink)
            .buttonStyle(.plain)
            HStack(spacing: 0) {
                ForEach(names, id: \.self) { Text(verbatim: $0).font(.caption2.weight(.semibold)).foregroundStyle(Palette.faint).frame(maxWidth: .infinity) }
            }
            let grid = ISODay.monthGrid(month)
            ForEach(grid.indices, id: \.self) { row in
                let week = grid[row]
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { i in
                        if let date = week[i] {
                            Button { pick(date) } label: { cell(date) }.buttonStyle(.plain)
                        } else {
                            Color.clear.frame(maxWidth: .infinity, minHeight: 62)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 10)
    }

    private func cell(_ date: String) -> some View {
        let day = days[date]
        let style = SportStyle(day: day, date: date, today: today)
        let isSelected = date == selected
        return VStack(spacing: 3) {
            Text(ISODay.day(date))
                .font(.system(size: 12, weight: date == today ? .bold : .regular))
                .foregroundStyle(date == today ? Palette.amber : Palette.muted)
            ZStack {
                Circle().fill(style.fill)
                if style.dashed { Circle().strokeBorder(style.tint.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [2, 2])) }
                Image(systemName: style.symbol).font(.system(size: 11, weight: .semibold)).foregroundStyle(style.tint)
            }
            .frame(width: 26, height: 26)
            Text(Self.value(day, mode)).font(.system(size: 10, weight: .semibold).monospacedDigit())
                .foregroundStyle((day?.count ?? 0) > 0 ? Palette.ink : Palette.faint)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 62)
        .background(isSelected ? Palette.track : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.dayMonth(date) + ", " + style.label + ", " + Self.value(day, mode))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// The cell's number: activities, their time or kcal ("2", "1:35", "1 250").
    static func value(_ day: CalendarDay?, _ mode: TrainingCalendarCard.CalendarMode) -> String {
        guard let day, day.count > 0 else { return " " }
        switch mode {
        case .count: return String(day.count)
        case .time: return Fmt.hoursMinutes(day.minutes)
        case .kcal: return Fmt.int(day.kcal)
        }
    }

    /// "12 aktivit · 14 h 20 min · 9 800 kcal" for the month.
    private var total: String {
        let list = ISODay.range(month, ISODay.monthEnd(month)).compactMap { days[$0] }
        let count = list.reduce(0) { $0 + $1.count }
        let minutes = list.reduce(0.0) { $0 + $1.minutes }
        let kcal = list.reduce(0.0) { $0 + $1.kcal }
        guard count > 0 else { return L10n.tr("zatím bez aktivit") }
        let head = L10n.f("%@ %@", String(count), Fmt.plural(count, "aktivita", "aktivity", "aktivit"))
        return head + " · " + Fmt.hoursMinutesLong(minutes) + " · " + Fmt.int(kcal) + " kcal"
    }
}

// MARK: - The chosen day

struct CalendarDayList: View {
    let date: String
    let today: String
    let day: CalendarDay?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(heading).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                if let day, day.count > 0 {
                    Text(Fmt.hoursMinutesLong(day.minutes) + " · " + Fmt.int(day.kcal) + " kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(.bottom, 4)
            if let list = day?.activities, !list.isEmpty {
                ForEach(Array(list.enumerated()), id: \.element.id) { index, activity in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    if let route = Self.route(activity) {
                        NavigationLink(value: route) { CalendarActivityRow(activity: activity, chevron: true) }.buttonStyle(.plain)
                    } else {
                        CalendarActivityRow(activity: activity, chevron: false)
                    }
                }
            } else {
                Text(day == nil ? "Načítám…" : date > today ? "Nic v plánu." : "Volno, žádná aktivita.")
                    .font(Typo.small).foregroundStyle(Palette.muted).padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 16)
    }

    private var heading: String {
        if date == today { return L10n.tr("Dnes") }
        if date == ISODay.shift(today, -1) { return L10n.tr("Včera") }
        if date == ISODay.shift(today, 1) { return L10n.tr("Zítra") }
        return Fmt.weekdayShort(date) + " " + Fmt.dayMonth(date)
    }

    static func route(_ a: CalendarActivity) -> AppRoute? {
        if a.sport == "strength" && a.status == "planned" { return .gym(a.date) }
        if a.status == "done" { return a.activityId != nil ? .activity(a.session) : nil }
        return a.eventId != nil ? .planned(a.session) : nil
    }
}

struct CalendarActivityRow: View {
    let activity: CalendarActivity
    let chevron: Bool

    var body: some View {
        let done = activity.status == "done"
        let color = SportStyle.color(activity.sport)
        HStack(spacing: 12) {
            Image(systemName: SportIcon.symbol(activity.sport))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(done ? .white : color)
                .frame(width: 36, height: 36)
                .background(done ? color : color.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                Text(Self.detail(activity)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 6)
            if let kcal = activity.kcal, kcal > 0 {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(Fmt.int(kcal)).font(Typo.number(17)).foregroundStyle(Palette.ink)
                    Text("kcal").font(.system(size: 10)).foregroundStyle(Palette.faint)
                }
            }
            if chevron { Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint) }
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "Kolo · 1 h 30 min · 42,3 km" or "v plánu · 45 min".
    static func detail(_ a: CalendarActivity) -> String {
        var parts: [String] = [a.status == "done" ? Fmt.capitalized(L10n.tr(SportStyle.name(a.sport))) : L10n.tr("V plánu")]
        if let t = a.time { parts.append(t) }
        if let m = a.minutes, m > 0 { parts.append(Fmt.duration(Int(m.rounded()))) }
        if let km = a.km, km > 0 { parts.append(Units.distanceText(km)) }
        return parts.joined(separator: " · ")
    }
}
