import SwiftUI

/// Training's week strip (redesign T, concept trenink-koncept): Monday to
/// Sunday of the chosen day's week, each day its weekday, the day's sport in
/// its disc and the date; the chosen day sits in the soft grey pill. A swipe
/// moves a week; the month opens from the title ("November ⌄").
struct TrainingCalendarCard: View {
    @Environment(AppModel.self) private var model
    let today: String
    /// The chosen day, for the list under the strip and the header.
    var onPick: (String) -> Void = { _ in }
    /// A day chosen elsewhere (the header's "Dnes", the month sheet).
    var jump: DayJump? = nil
    @State private var selected: String?
    /// The strip's slide while a week changes.
    @State private var direction = 1

    private var day: String { selected ?? today }
    /// How far the strip goes ahead.
    static let daysAhead = 30
    private var week: [String] {
        let monday = ISODay.shift(day, -ISODay.weekdayIndex(day))
        return (0..<7).map { ISODay.shift(monday, $0) }
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(week, id: \.self) { date in
                Button { pick(date) } label: {
                    DayCircle(date: date, today: today, selected: date == day, day: model.calendar[date])
                }
                .buttonStyle(.plain)
            }
        }
        .id(week.first)
        .transition(.asymmetric(insertion: .move(edge: direction > 0 ? .trailing : .leading).combined(with: .opacity),
                                removal: .move(edge: direction > 0 ? .leading : .trailing).combined(with: .opacity)))
        .clipped()
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 24).onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.5, abs(value.translation.width) > 40 else { return }
                moveWeek(value.translation.width < 0 ? 1 : -1)
            }
        )
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: Text(verbatim: L10n.tr("Další týden"))) { moveWeek(1) }
        .accessibilityAction(named: Text(verbatim: L10n.tr("Předchozí týden"))) { moveWeek(-1) }
        .onChange(of: day) { _, date in onPick(date) }
        .onChange(of: jump) { _, jump in
            guard let date = jump?.date, date != day else { return }
            direction = date > day ? 1 : -1
            withAnimation(.snappy(duration: 0.3)) { selected = date }
        }
        .task(id: week.first) { await model.loadCalendar(from: week.first ?? today, to: week.last ?? today) }
    }

    private func pick(_ date: String) { selected = date }

    /// The same weekday a week on or back, never past the strip's end.
    private func moveWeek(_ by: Int) {
        let next = ISODay.shift(day, 7 * by)
        guard next <= ISODay.shift(today, Self.daysAhead) || by < 0 else { return }
        direction = by
        withAnimation(.snappy(duration: 0.3)) { selected = next }
    }
}

/// A day set from Trénink's header ("Dnes") or the month; each tap is new, even to the same day.
struct DayJump: Equatable {
    let date: String
    let id = UUID()
}

/// One day of the strip: "Mo", "9" and the day's sport in its disc under it. A second
/// session still ahead that day sits as a small disc on the first one's edge.
struct DayCircle: View {
    let date: String
    let today: String
    let selected: Bool
    let day: CalendarDay?

    var body: some View {
        let mark = Look(day: day, date: date, today: today)
        // The shared cell of every week strip (WeekDayCell, Petr 2026-11-22 variant B):
        // the sport's disc under the date, as tall as the strip on Dnes and Jídlo.
        WeekDayCell(day: date, today: today, selected: selected) {
            SportDisc(sport: mark.sport, type: mark.type, state: mark.state, size: 30)
                .overlay(alignment: .bottomTrailing) {
                    if let second = mark.second {
                        SportDisc(sport: second, state: .ahead, size: 13)
                            .background(Circle().fill(Palette.background).padding(-2))
                            .offset(x: 4, y: 3)
                    }
                }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.weekdayShort(date) + " " + Fmt.dayMonth(date) + ", " + mark.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

extension DayCircle {
    /// What a day's disc shows: its first session's sport, done (full), still
    /// ahead (pale) or missed (grey); a rest dot without any session.
    struct Look: Equatable {
        var sport = "other"
        var type: String? = nil
        var state: SportDisc.State = .rest
        var second: String? = nil
        var label: String

        init(day: CalendarDay?, date: String, today: String) {
            let list = (day?.activities ?? []).filter { $0.status == "done" || $0.status == "planned" || $0.status == "missed" }
            guard let first = Self.lead(list) else {
                label = L10n.tr(day == nil ? "bez dat" : "volno")
                return
            }
            sport = first.sport
            type = first.type
            state = SportDisc.State(status: first.status)
            second = list.first { $0.id != first.id && $0.sport != "walk" && $0.status != "missed" }?.sport
            label = L10n.tr(SportStyle.name(first.sport)) + ", " + L10n.tr(state == .done ? "hotovo" : state == .missed ? "nesplněno" : "v plánu")
        }

        /// The day's disc: a workout done, else a workout planned or missed (602/606:
        /// a walk never stands in for today's Legs still ahead), a walk only on a
        /// day with nothing else.
        static func lead(_ list: [CalendarActivity]) -> CalendarActivity? {
            let workouts = list.filter { $0.sport != "walk" }
            return workouts.first { $0.status == "done" } ?? workouts.first ?? list.first { $0.status == "done" } ?? list.first
        }
    }
}

/// Sport names for the lines that say a session in words.
enum SportStyle {
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

// MARK: - The chosen day

struct CalendarDayList: View {
    @Environment(AppModel.self) private var model
    let date: String
    let today: String
    let day: CalendarDay?
    /// Today's planned workouts in the card below (by event, title, or the gym
    /// day's strength plan): the concept has a row only for what is done.
    var hidePlanned: [TrainingSnapshot.Session] = []
    /// A watch session (no Intervals.icu detail) opened in its summary.
    @State private var watch: CalendarActivity?
    /// Two records of one workout: the merge sheet, and the answer being sent.
    @State private var merging: MergeProposal?
    @State private var keepingApart = false

    var body: some View {
        // The day's sessions in one card, a row each (concept trenink-koncept
        // srow, finished-activity row A); the section title above names the day.
        VStack(alignment: .leading, spacing: 0) {
            if let list = day.map({ Self.shown($0.activities, hidePlanned: hidePlanned) }), !list.isEmpty {
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
                    .font(Typo.small).foregroundStyle(Palette.muted).padding(.vertical, 14)
            }
            if let proposal = day?.merge, !model.demo {
                MergeProposalCard(proposal: proposal, busy: keepingApart, merge: { merging = proposal }) {
                    Task { await keepApart(proposal) }
                }
                .padding(.top, 6).padding(.bottom, 10)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        .sheet(item: $watch) { WatchActivityDetail(activity: $0) }
        .sheet(item: Binding(get: { merging.map { Proposed(proposal: $0) } }, set: { merging = $0?.proposal })) {
            MergeWorkoutsSheet(proposal: $0.proposal)
        }
    }

    static func shown(_ list: [CalendarActivity], hidePlanned: [TrainingSnapshot.Session]) -> [CalendarActivity] {
        list.filter { a in
            a.status != "planned" || !hidePlanned.contains { s in
                (s.eventId != nil && s.eventId == a.eventId) || s.title == a.title
                    || (s.sport == "strength" && ["strength", "gym"].contains(a.sport) && s.date == a.date)
            }
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

    static func route(_ a: CalendarActivity) -> AppRoute? {
        // A gym session typed in by hand opens its plan, where it can be deleted (as in Trénink).
        if a.status != "done", let id = a.eventId, id.hasPrefix("planned:local-"), a.sport == "strength" { return .planned(a.session) }
        if a.sport == "strength" && a.status == "done" { return .gymSession(a.session) }
        // A missed gym plan opens the day's gym sheet too, as in Trénink (WeekSessionsList.destination).
        if a.sport == "strength" && (a.status != "missed" || a.eventId == nil) { return .gym(a.date) }
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
        let done = activity.status == "done"
        // Concept row A (trenink-koncept srow): the sport's disc with who
        // recorded it, the name, distance and calories, the time big on the
        // right with the plan's percent under it.
        HStack(spacing: 12) {
            SportDisc(sport: activity.sport, type: activity.type, state: SportDisc.State(status: activity.status), size: 44)
                .overlay(alignment: .bottomTrailing) {
                    if done, let logo = activity.sources?.first?.logo {
                        IntegrationIcon(id: logo, size: 13)
                            .padding(2)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                            .offset(x: 3, y: 3)
                    }
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(activity.title).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                subtitle(state: state).font(Typo.caption).lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                if let m = activity.minutes, m > 0 { Self.duration(Int(m.rounded())) }
                if done, let percent = activity.compliance {
                    Text(verbatim: L10n.f("%@ %% plánu", String(percent)))
                        .font(Typo.caption.weight(.semibold)).foregroundStyle(ComplianceScale.color(percent))
                } else if done, state == .offPlan {
                    Text(verbatim: L10n.tr("mimo plán")).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                }
            }
            if chevron { Image(systemName: "chevron.right").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint) }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "8,2 km, 820 kcal k ověření" (the calories amber while they wait for a
    /// check), "V plánu, 17:30" ahead, "Nesplněno" missed, the reason when done differently.
    private func subtitle(state: PlanState) -> Text {
        switch activity.status {
        case "missed": return Text(verbatim: L10n.tr(PlanState.missed.title)).foregroundStyle(Palette.muted)
        case "done": break
        default:
            let time = activity.time.map { ClockText.format($0) }
            return Text(verbatim: ([L10n.tr("V plánu")] + [time].compactMap { $0 }).joined(separator: ", ")).foregroundStyle(Palette.muted)
        }
        var parts: [String] = []
        if let km = activity.km, km > 0 { parts.append(Units.distanceText(km)) }
        if parts.isEmpty { parts.append(Fmt.capitalized(L10n.tr(SportStyle.name(activity.sport)))) }
        var line = Text(verbatim: parts.joined(separator: ", ")).foregroundStyle(Palette.muted)
        if let kcal = model.countedKcal(activity), kcal > 0 {
            line = line + Text(verbatim: ", ").foregroundStyle(Palette.muted)
            line = line + (kcalToCheck
                ? Text(verbatim: L10n.f("%@ kcal k ověření", Fmt.int(kcal))).foregroundStyle(Palette.amber)
                : Text(verbatim: Fmt.int(kcal) + " kcal").foregroundStyle(Palette.muted))
        }
        if state == .off, activity.compliance == nil, let reason = activity.adherenceReason, !reason.isEmpty {
            line = line + Text(verbatim: ", " + reason).foregroundStyle(Palette.amber)
        }
        return line
    }

    /// "42 min", "1 h 5 min" with the numbers in the serif (Fmt.duration).
    static func duration(_ minutes: Int) -> Text {
        let unit = { (s: String) in Text(verbatim: s).font(Typo.caption).foregroundStyle(Palette.muted) }
        let number = { (n: String) in Text(verbatim: n).font(Typo.number(24)).foregroundStyle(Palette.ink) }
        if minutes < 60 { return number(String(minutes)) + unit("\u{00A0}min") }
        let rest = minutes % 60
        return rest == 0 ? number(String(minutes / 60)) + unit("\u{00A0}h")
            : number(String(minutes / 60)) + unit("\u{00A0}h\u{00A0}") + number(String(rest)) + unit("\u{00A0}min")
    }

    /// "Kolo, 1 h 30, 42,3 km", "V plánu, 45 min" or "Nesplněno, 1 h".
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
        return parts.joined(separator: ", ")
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
    @State private var unpairing = false
    @State private var editingKcal = false

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 14) {
                        Image(systemName: SportIcon.symbol(activity.sport, type: activity.type))
                            .scaledFont(20, weight: .semibold, cap: .denseCap)
                            .foregroundStyle(Palette.onAccent)
                            .frame(width: 48, height: 48)
                            .background(SportDisc.color(activity.sport), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: activity.title).font(Typo.heading(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
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
            .background { Palette.background.ignoresSafeArea() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").scaledFont(14, weight: .semibold, cap: .denseCap) }
                        .accessibilityLabel("Zavřít")
                }
                if !model.demo, ["intervals", "google-wearables", "apple-health", "local", "gym"].contains(activity.source ?? "") {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { changingType = true } label: { Label("Změnit typ aktivity", systemImage: "arrow.triangle.2.circlepath") }
                            if activity.status == "done" && activity.source != "gym" {
                                Button { editingKcal = true } label: { Label("Upravit kalorie", systemImage: "flame") }
                            }
                            if activity.session.unpairTarget != nil {
                                Button { unpairing = true } label: { Label("Odpárovat od plánu", systemImage: "minus.circle") }
                            }
                            if activity.status == "done" {
                                Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                            }
                        } label: {
                            Image(systemName: "ellipsis").scaledFont(15, weight: .semibold, cap: .denseCap)
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
        .activityUnpairing(session: activity.session, asking: $unpairing) { dismiss() }
    }

    /// "Chůze, st 8. 10., 10:00–11:10".
    private var when: String {
        let s = activity.summary
        let time = [s?.start ?? activity.time, s?.end].compactMap { $0 }.map { ClockText.format($0) }.joined(separator: "–")
        return [Fmt.capitalized(L10n.tr(SportStyle.name(activity.sport))), Fmt.weekdayShort(activity.date) + " " + Fmt.dayMonth(activity.date), time.isEmpty ? nil : time]
            .compactMap { $0 }.joined(separator: ", ")
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
