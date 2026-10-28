import SwiftUI

/// Training's calendar: a strip of days to swipe through (five in full, the
/// next ones blurred at the edges), each with its weekday, date and the main
/// sport. Pulled down it opens the whole month with the day's count of
/// activities, their time or calories. The chosen day's activities are below.
struct TrainingCalendarCard: View {
    @Environment(AppModel.self) private var model
    let today: String
    /// The chosen day, for the pinned bar of Trénink.
    var onPick: (String) -> Void = { _ in }
    /// A day chosen in the pinned bar (its arrows and "Dnes").
    var jump: DayJump? = nil
    @State private var selected: String?
    @State private var centered: String?
    @State private var expanded = false
    @State private var month: String?
    @AppStorage("calendarMode") private var mode = CalendarMode.count.rawValue

    enum CalendarMode: String, CaseIterable, Identifiable {
        case count, time, kcal, compliance
        var id: String { rawValue }
        var label: String {
            switch self {
            case .count: return "Počet"
            case .time: return "Čas"
            case .kcal: return "Kalorie"
            case .compliance: return "Splnění"
            }
        }
    }

    private var day: String { selected ?? today }
    /// How far the strip (and the pinned bar's arrow) goes ahead.
    static let daysAhead = 30
    private var stripDays: [String] { ISODay.range(ISODay.shift(today, -60), ISODay.shift(today, Self.daysAhead)) }

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
            // An empty day shows no row at all, only the strip.
            if model.calendar[day].map({ !$0.activities.isEmpty }) ?? true {
                CalendarDayList(date: day, today: today, day: model.calendar[day])
                    .daySlide(date: day)
                    .padding(.top, 6)
            }
        }
        .padding(.vertical, 14)
        .cardSurface(cornerRadius: 24)
        .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                guard abs(value.translation.height) > abs(value.translation.width) * 1.5 else { return }
                if value.translation.height > 40 && !expanded { toggle() }
                if value.translation.height < -40 && expanded { toggle() }
            }
        )
        .onChange(of: day) { _, date in onPick(date) }
        .onChange(of: jump) { _, jump in
            guard let date = jump?.date, date != day else { return }
            selected = date
            centered = date
            if expanded {
                month = ISODay.monthStart(date)
                Task { await model.loadCalendar(from: ISODay.monthStart(date), to: ISODay.monthEnd(ISODay.monthStart(date))) }
            }
        }
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
            // Room for the letter, the selected ring and the date; the percent
            // of the plan shows in the ring's colour and in the day's list.
            .frame(height: 108)
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

/// A day set from Trénink's pinned bar; each tap is new, even to the same day.
struct DayJump: Equatable {
    let date: String
    let id = UUID()
}

/// One day of the strip: "P", the main sport in a circle in the plan's colour
/// (as Tréninky týdne; a done day in the colour of its percent) and "9".
struct DayCircle: View {
    let date: String
    let today: String
    let selected: Bool
    let day: CalendarDay?

    var body: some View {
        let style = SportStyle(day: day, date: date, today: today)
        VStack(spacing: 6) {
            Text(Fmt.weekdayShort(date))
                .font(.system(size: 12, weight: date == today ? .bold : .medium))
                .foregroundStyle(date == today ? Palette.amber : Palette.faint)
            ZStack {
                if let state = style.state {
                    PlanStateIcon(symbol: style.symbol, state: state, size: 44, percent: style.percent)
                } else {
                    Circle().fill(style.fill)
                    Image(systemName: style.symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.faint)
                }
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

/// How a day looks: the main sport in the colour of the plan (PlanState, the
/// same as Tréninky týdne and the week widget): green kept to it, amber done
/// differently, rust missed, blue outside the plan, a dashed grey ring still
/// ahead. A day at rest stays quiet.
struct SportStyle {
    let symbol: String
    /// nil at rest.
    let state: PlanState?
    /// The quiet circle of a day at rest.
    let fill: Color
    let label: String
    /// The day's percent of the plan (CalendarDay.compliance) when it is done.
    let percent: Int?

    init(day: CalendarDay?, date: String, today: String) {
        let sport = day?.primary ?? "rest"
        let planState: PlanState? = sport == "rest" ? nil : PlanState(day: day)
        state = planState
        percent = planState == .good || planState == .off ? day?.compliance : nil
        fill = date <= today ? Palette.track : .clear
        if let planState {
            symbol = SportIcon.symbol(sport)
            label = L10n.tr(Self.name(sport)) + ", " + L10n.tr(planState.title) + (percent.map { ", " + L10n.f("%@ %% plánu", String($0)) } ?? "")
        } else {
            symbol = "moon.zzz"
            label = L10n.tr(day == nil ? "bez dat" : "volno")
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
        Fmt.weekdaysFromMonday
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
                if let state = style.state {
                    PlanStateIcon(symbol: style.symbol, state: state, size: 26, percent: style.percent)
                } else {
                    Circle().fill(style.fill)
                    Image(systemName: style.symbol).font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
            .frame(width: 26, height: 26)
            Text(Self.value(day, mode)).font(.system(size: 10, weight: .semibold).monospacedDigit())
                .foregroundStyle(mode == .compliance ? style.percent.map(ComplianceScale.color) ?? Palette.faint : (day?.count ?? 0) > 0 ? Palette.ink : Palette.faint)
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
        case .compliance:
            guard PlanState(day: day) == .good || PlanState(day: day) == .off, let percent = day.compliance else { return " " }
            return "\(percent)" + Fmt.percentSign
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
        // Splnění: the month's sessions done to a plan, their mean percent.
        if mode == .compliance {
            let values = list.flatMap(\.activities).filter { $0.status == "done" }.compactMap(\.compliance)
            guard !values.isEmpty else { return head }
            return head + " · " + L10n.f("%@ %% plánu", String(Int((Double(values.reduce(0, +)) / Double(values.count)).rounded())))
        }
        return head + " · " + Fmt.hoursMinutesLong(minutes) + " · " + Fmt.int(kcal) + " kcal"
    }
}

// MARK: - The chosen day

struct CalendarDayList: View {
    @Environment(AppModel.self) private var model
    let date: String
    let today: String
    let day: CalendarDay?
    /// A watch session (no Intervals.icu detail) opened in its summary.
    @State private var watch: CalendarActivity?
    /// Two records of one workout: the merge sheet, and the answer being sent.
    @State private var merging: MergeProposal?
    @State private var keepingApart = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(heading).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                if let day, day.count > 0 {
                    Text(Fmt.hoursMinutesLong(day.minutes) + " · " + Fmt.int(dayKcal(day)) + " kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(.bottom, 4)
            if let list = day?.activities, !list.isEmpty {
                ForEach(Array(list.enumerated()), id: \.element.id) { index, activity in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    if let route = Self.route(activity) {
                        NavigationLink(value: route) { CalendarActivityRow(activity: activity, chevron: true) }.buttonStyle(.plain)
                    } else if activity.status == "done" {
                        Button { watch = activity } label: { CalendarActivityRow(activity: activity, chevron: true) }.buttonStyle(.plain)
                    } else {
                        CalendarActivityRow(activity: activity, chevron: false)
                    }
                }
            } else {
                Text(day == nil ? "Načítám…" : date > today ? "Nic v plánu." : "Volno, žádná aktivita.")
                    .font(Typo.small).foregroundStyle(Palette.muted).padding(.vertical, 8)
            }
            if let proposal = day?.merge, !model.demo {
                MergeProposalCard(proposal: proposal, busy: keepingApart, merge: { merging = proposal }) {
                    Task { await keepApart(proposal) }
                }
                .padding(.top, 6).padding(.bottom, 10)
            }
        }
        .padding(.horizontal, 16)
        .sheet(item: $watch) { WatchActivityDetail(activity: $0) }
        .sheet(item: Binding(get: { merging.map { Proposed(proposal: $0) } }, set: { merging = $0?.proposal })) {
            MergeWorkoutsSheet(proposal: $0.proposal)
        }
    }

    private struct Proposed: Identifiable {
        let proposal: MergeProposal
        var id: String { proposal.ids.joined(separator: "|") }
    }

    private func keepApart(_ proposal: MergeProposal) async {
        keepingApart = true
        defer { keepingApart = false }
        do {
            try await model.api.keepWorkoutsApart(ids: proposal.ids)
            await model.refreshTraining()
        } catch {}
    }

    /// The day's calories with the user's choices for flagged sessions.
    private func dayKcal(_ day: CalendarDay) -> Double {
        day.activities.filter { $0.status == "done" }.reduce(0) { $0 + (model.countedKcal($1) ?? 0) }
    }

    private var heading: String {
        if date == today { return L10n.tr("Dnes") }
        if date == ISODay.shift(today, -1) { return L10n.tr("Včera") }
        if date == ISODay.shift(today, 1) { return L10n.tr("Zítra") }
        return Fmt.weekdayShort(date) + " " + Fmt.dayMonth(date)
    }

    static func route(_ a: CalendarActivity) -> AppRoute? {
        // A gym session typed in by hand opens its plan, where it can be deleted (as in Trénink).
        if a.status != "done", let id = a.eventId, id.hasPrefix("planned:local-"), a.sport == "strength" { return .planned(a.session) }
        if a.sport == "strength" && a.status == "done" { return .gymSession(a.session) }
        if a.sport == "strength" && a.status != "missed" { return .gym(a.date) }
        if a.status == "done" { return a.activityId != nil || a.session.watch != nil ? .activity(a.session) : nil }
        return a.eventId != nil ? .planned(a.session) : nil
    }
}

struct CalendarActivityRow: View {
    @Environment(AppModel.self) private var model
    let activity: CalendarActivity
    let chevron: Bool

    /// The device's calories still wait for a check (Kalorie k ověření).
    private var kcalToCheck: Bool {
        guard let session = model.doneSession(for: activity), session.kcalEstimate?.value != nil, session.kcal != nil else { return false }
        return KcalChoiceStore.shared.choice(for: session) == nil
    }

    var body: some View {
        let state = PlanState(activity.session)
        HStack(spacing: 12) {
            // The plan's colours, as a row of Tréninky týdne.
            PlanStateIcon(symbol: SportIcon.symbol(activity.sport, type: activity.type), state: state, percent: activity.compliance)
                .accessibilityLabel(L10n.tr(state.title))
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                // Who recorded it: Aurin, the watch, Intervals.icu (both after a merge).
                if activity.status == "done", let sources = activity.sources, !sources.isEmpty {
                    SourceLine(sources: sources)
                }
                Text(Self.detail(activity)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                // A session done to a plan: only its percent, the why is in its detail.
                if activity.status == "done", let percent = activity.compliance {
                    Text(verbatim: "\(percent)" + Fmt.percentSign).font(Typo.caption.weight(.semibold)).foregroundStyle(ComplianceScale.color(percent))
                        .accessibilityLabel(L10n.f("%@ %% plánu", String(percent)))
                } else if state == .off, let reason = activity.adherenceReason, !reason.isEmpty {
                    Text(reason).font(Typo.caption).foregroundStyle(Palette.amber).lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if let kcal = model.countedKcal(activity), kcal > 0 {
                let check = kcalToCheck
                VStack(alignment: .trailing, spacing: 0) {
                    HStack(spacing: 4) {
                        if check {
                            Image(systemName: "exclamationmark.triangle").font(.system(size: 11, weight: .semibold))
                        }
                        Text(Fmt.int(kcal)).font(Typo.number(17))
                    }
                    .foregroundStyle(check ? Palette.amber : Palette.ink)
                    Text("kcal").font(.system(size: 10)).foregroundStyle(Palette.faint)
                }
                .accessibilityLabel(check ? L10n.f("%@ kcal, k ověření", Fmt.int(kcal)) : Fmt.int(kcal) + " kcal")
            }
            if chevron { Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint) }
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "Kolo · 1 h 30 min · 42,3 km", "V plánu · 45 min" or "Neodjeto · 1 h".
    static func detail(_ a: CalendarActivity) -> String {
        let head: String
        switch a.status {
        case "done": head = Fmt.capitalized(L10n.tr(SportStyle.name(a.sport)))
        case "missed": head = L10n.tr(PlanState.missed.title)
        default: head = L10n.tr("V plánu")
        }
        var parts: [String] = [head]
        if let t = a.time { parts.append(ClockText.format(t)) }
        if let m = a.minutes, m > 0 { parts.append(Fmt.duration(Int(m.rounded()))) }
        if let km = a.km, km > 0 { parts.append(Units.distanceText(km)) }
        return parts.joined(separator: " · ")
    }
}

/// A watch session from Google Health. Google sends only a summary (no laps,
/// no heart-rate curve, no track), so this is what there is to show.
struct WatchActivityDetail: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    let activity: CalendarActivity
    @State private var changingType = false
    @State private var deleting = false
    @State private var editingKcal = false

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 14) {
                        Image(systemName: SportIcon.symbol(activity.sport, type: activity.type))
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(Palette.onAccent)
                            .frame(width: 48, height: 48)
                            .background(SportStyle.color(activity.sport), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: activity.title).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                            Text(verbatim: when).font(Typo.small).foregroundStyle(Palette.muted)
                        }
                    }
                    .padding(.bottom, 18)
                    if let origin = activity.sources?.first ?? ActivityDetail.Origin.of(family: activity.source) {
                        ActivityOriginLine(origin: origin).padding(.top, -8).padding(.bottom, 18)
                    }
                    ForEach(rows, id: \.0) { row in StatRow(title: row.0, value: row.1, unit: row.2) }
                }
                .padding(24)
            }
            .background(Palette.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
                if !model.demo, ["intervals", "google-wearables", "apple-health", "local", "gym"].contains(activity.source ?? "") {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { changingType = true } label: { Label("Změnit typ aktivity", systemImage: "arrow.triangle.2.circlepath") }
                            if activity.status == "done" && activity.source != "gym" {
                                Button { editingKcal = true } label: { Label("Upravit kalorie", systemImage: "flame") }
                            }
                            if activity.status == "done" {
                                Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                            }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold))
                        }
                        .accessibilityLabel("Další volby")
                    }
                }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.medium, .large])
        .sheet(isPresented: $changingType) {
            ActivityTypeSheet(activityId: activity.id, current: activity.type, source: activity.source == "gym" ? "app" : activity.source) { dismiss() }
        }
        .activityEditing(id: activity.id, title: activity.title, kcal: model.countedKcal(activity),
                         edited: model.doneSession(for: activity)?.kcalEdited == true,
                         deleting: $deleting, editingKcal: $editingKcal) { dismiss() }
    }

    /// "Chůze · st 8. 10. · 10:00–11:10".
    private var when: String {
        let s = activity.summary
        let time = [s?.start ?? activity.time, s?.end].compactMap { $0 }.map { ClockText.format($0) }.joined(separator: "–")
        return [Fmt.capitalized(L10n.tr(SportStyle.name(activity.sport))), Fmt.weekdayShort(activity.date) + " " + Fmt.dayMonth(activity.date), time.isEmpty ? nil : time]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private var rows: [(String, String, String?)] {
        let s = activity.summary
        var out: [(String, String, String?)] = []
        if let m = activity.minutes, m > 0 { out.append((L10n.tr("Doba pohybu"), Fmt.duration(Int(m.rounded())), nil)) }
        if let km = activity.km, km > 0 {
            out.append((L10n.tr("Vzdálenost"), Units.distanceText(km), nil))
            // Pace for what is walked or run, per km (per mile in imperial units).
            if ["run", "walk"].contains(activity.sport), let m = activity.minutes, m > 0 {
                let perUnit = m / (Units.imperial ? km / 1.609344 : km)
                let total = Int((perUnit * 60).rounded())
                out.append((L10n.tr("Tempo"), "\(total / 60):" + String(format: "%02d", total % 60), Units.imperial ? "/ mi" : "/ km"))
            }
        }
        if let kcal = activity.kcal, kcal > 0 { out.append((L10n.tr("Energie"), Fmt.int(kcal), "kcal")) }
        if let hr = s?.avgHr { out.append((L10n.tr("Průměrný tep"), Fmt.int(hr), "bpm")) }
        if let hr = s?.maxHr { out.append((L10n.tr("Maximální tep"), Fmt.int(hr), "bpm")) }
        if let steps = s?.steps { out.append((L10n.tr("Kroky"), Fmt.int(steps), nil)) }
        if let up = s?.elevationM, up > 0 { out.append((L10n.tr("Převýšení"), Fmt.int(up), "m")) }
        return out
    }
}
