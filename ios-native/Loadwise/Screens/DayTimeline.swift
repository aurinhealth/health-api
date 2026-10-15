import SwiftUI

/// Dnes → Den (Petr's design of 2026-10-15): the day on one line, in place of
/// Plán dne. What already happened sits above "teď": the night, the readiness,
/// done workouts and the strain they added, the steps so far. Below it, with
/// dashed dots, what is still planned: a workout with Začít, stretching, the
/// pill and bedtime, which moves later as the day's strain raises tonight's
/// sleep need (src/app-today.js). The line starts at the first dot.
struct DayTimeline: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot
    /// A pill or "vrátit" being saved.
    @State private var busy = false

    var body: some View {
        Card {
            Text("Den").font(Typo.tiny.weight(.semibold)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                .accessibilityAddTraits(.isHeader)
            TimelineView(.periodic(from: .now, by: 60)) { context in
                let rows = DayTimelineRows.make(today, now: nowMinutes(context.date), stepsTime: stepsTime(context.date))
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, entry in
                        row(entry, first: index == 0, last: index == rows.count - 1)
                    }
                }
            }
        }
    }

    /// Minutes after midnight now, only while the shown day is today (the
    /// sample day keeps the hour it was made at).
    private func nowMinutes(_ date: Date) -> Int? {
        if model.demo { return today.steps.hour.map { $0 * 60 } }
        guard today.date == AppModel.localDate(date) else { return nil }
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }

    /// The steps are as of the last Apple Health sync, when that was today.
    private func stepsTime(_ date: Date) -> String? {
        let health = AppleHealth.shared
        guard !model.demo, health.enabled, let last = health.lastSync, today.date == AppModel.localDate(date),
              Calendar.current.isDate(last, inSameDayAs: date) else { return nil }
        return ClockText.format(last)
    }

    private var day: String { today.date.isEmpty ? AppModel.localDate(Date()) : today.date }

    // MARK: Rows

    @ViewBuilder
    private func row(_ entry: DayTimelineRows.Entry, first: Bool, last: Bool) -> some View {
        switch entry {
        case .sleep(let sleep):
            RouteLink(route: .sleep) {
                DaySpanRow(color: Palette.indigo, start: sleep.start.map { ClockText.format($0) }, end: sleep.end.map { ClockText.format($0) }, first: first, last: last) {
                    sleepContent(sleep)
                }
            }
        case .readiness(let score, let zone):
            RouteLink(route: .readiness) {
                DayPointRow(color: ReadinessText.pill(zone)?.1 ?? Palette.green, time: nil, first: first, last: last) {
                    HStack(alignment: .center, spacing: 9) {
                        Text("Připravenost").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(String(score)).font(Typo.number(22)).foregroundStyle(ReadinessText.pill(zone)?.1 ?? Palette.green)
                        if let pill = ReadinessText.pill(zone) {
                            Pill(text: L10n.tr(pill.0), foreground: pill.1, background: pill.2)
                        }
                    }
                }
            }
        case .workout(let item):
            workoutRow(item, first: first, last: last).modifier(PlanRowMenu(item: item))
        case .strain(let time, let score, let added):
            RouteLink(route: .strain) {
                DayPointRow(color: Palette.rust, time: time.map { ClockText.format(minutes: $0) }, first: first, last: last) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("Námaha").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(Fmt.decimal(score)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                        if let added {
                            Text(L10n.f("+%@ tréninkem", Fmt.decimal(added))).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                        }
                    }
                }
            }
        case .steps(let steps, let time):
            RouteLink(route: .steps) {
                DayPointRow(color: Palette.blue, time: time, first: first, last: last) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(Fmt.int(steps)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                        Text("kroků").font(Typo.small.weight(.medium)).foregroundStyle(Palette.secondary)
                    }
                }
            }
        case .now(let minutes):
            DayNowRow(time: ClockText.format(minutes: minutes), first: first, last: last)
        case .item(let item):
            itemRow(item, first: first, last: last).modifier(PlanRowMenu(item: item))
        }
    }

    private func sleepContent(_ sleep: TodaySnapshot.Sleep) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Spánek").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Text(Fmt.hoursMinutes(sleep.minutes)).font(Typo.number(26)).foregroundStyle(Palette.ink)
            HStack(spacing: 6) {
                if let hrv = today.hrv?.value { DayChip(label: "HRV", value: Fmt.int(hrv), unit: "ms") }
                if let rhr = today.restingHR?.value { DayChip(label: L10n.tr("Tep"), value: Fmt.int(rhr), unit: "bpm") }
            }
            .padding(.top, 4)
        }
    }

    /// A ride, run or gym session: done above "teď" with what it measured,
    /// planned below it with Začít. It opens as Plán dne opened it.
    @ViewBuilder
    private func workoutRow(_ item: TodaySnapshot.PlanItem, first: Bool, last: Bool) -> some View {
        let start = DayTimelineRows.minutes(item.time ?? item.session?.time)
        let length = item.session?.minutes
        let future = !item.done
        let color = item.status == "missed" ? Palette.rust : Palette.amberBar
        let content = workoutContent(item)
        Group {
            if let start, let length, length > 0 {
                DaySpanRow(color: color, start: ClockText.format(minutes: start), end: ClockText.format(minutes: start + length),
                           future: future, first: first, last: last) { content }
            } else {
                DayPointRow(color: color, time: start.map { ClockText.format(minutes: $0) }, future: future, first: first, last: last) { content }
            }
        }
        .modifier(WorkoutLink(item: item, day: day))
    }

    @ViewBuilder
    private func workoutContent(_ item: TodaySnapshot.PlanItem) -> some View {
        if item.done {
            VStack(alignment: .leading, spacing: 6) {
                Text(item.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                let stats = DayTimelineRows.stats(item.session)
                if !stats.isEmpty {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(stats, id: \.label) { stat in
                            VStack(alignment: .leading, spacing: 1) {
                                Text(L10n.tr(stat.label)).font(Typo.tiny).foregroundStyle(Palette.muted)
                                HStack(alignment: .firstTextBaseline, spacing: 2) {
                                    Text(stat.value).font(Typo.number(19)).foregroundStyle(Palette.ink)
                                    Text(stat.unit).font(Typo.tiny).foregroundStyle(Palette.muted)
                                }
                            }
                        }
                    }
                } else if let detail = item.detail {
                    Text(detail).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                if item.session?.kcalNeedsCheck == true {
                    Label("k ověření", systemImage: "exclamationmark.triangle")
                        .font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.amber)
                }
            }
        } else {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(Typo.bodyStrong).foregroundStyle(item.status == "missed" ? Palette.muted : Palette.ink).lineLimit(2)
                    if let eased = item.eased {
                        Text(eased.title).font(Typo.caption).foregroundStyle(Palette.muted).strikethrough()
                    } else if let detail = item.detail {
                        Text(detail).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                Spacer(minLength: 8)
                workoutTrailing(item)
            }
        }
    }

    @ViewBuilder
    private func workoutTrailing(_ item: TodaySnapshot.PlanItem) -> some View {
        if item.eased != nil {
            Button { act { try await model.logCycleDay(day, ["keepPlan": .bool(true)]) } } label: {
                Label("vrátit", systemImage: "arrow.uturn.backward")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.pink)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Palette.pinkSoft, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        } else if item.status == "missed" {
            Text("Nesplněno").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.rust)
        } else {
            Text("Začít").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                .padding(.horizontal, 14).frame(height: 30)
                .background(Palette.button, in: Capsule())
        }
    }

    /// Stretching, sauna, a swim or walk (Aktivita dne), the pill and bedtime.
    @ViewBuilder
    private func itemRow(_ item: TodaySnapshot.PlanItem, first: Bool, last: Bool) -> some View {
        let color: Color = switch item.kind {
        case "recovery": item.recovery == "sauna" ? Palette.amber : item.recovery == "swim" ? Palette.blue : Palette.green
        case "pill": Palette.pink
        default: Palette.indigo
        }
        let line = DayPointRow(color: color, time: item.time.map { ClockText.format($0) }, future: !item.done, first: first, last: last) {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(Typo.bodyStrong).foregroundStyle(item.done ? Palette.ink : Palette.secondary).lineLimit(2)
                    if let detail = item.detail {
                        Text(detail).font(Typo.caption).foregroundStyle(Palette.faint)
                    }
                }
                Spacer(minLength: 8)
                if item.kind == "pill" {
                    PillButton(taken: item.done ? (item.time ?? "taken") : nil, saving: busy) { act { try await model.takePill(on: day) } }
                } else if item.kind == "bedtime" {
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                        .accessibilityHidden(true)
                } else if item.done {
                    Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green)
                        .accessibilityLabel("Hotovo")
                }
            }
        }
        if item.kind == "bedtime" {
            NavigationLink(value: AppRoute.sleepSettings) { line }.buttonStyle(.plain)
        } else {
            line
        }
    }

    private func act(_ work: @escaping () async throws -> Void) {
        busy = true
        Task {
            try? await work()
            busy = false
        }
    }
}

/// Where a workout row goes, as Plán dne did: a gym session not yet done
/// opens its workout mode, a session its detail, anything else Trénink.
private struct WorkoutLink: ViewModifier {
    @Environment(AppModel.self) private var model
    let item: TodaySnapshot.PlanItem
    let day: String

    func body(content: Content) -> some View {
        if item.eased != nil {
            // "vrátit" acts in the row.
            content
        } else if item.sport == "strength", !item.done, item.status != "missed" {
            NavigationLink(value: AppRoute.trainingMode(day)) { content }.buttonStyle(.plain)
        } else if let session = item.session, let route = WeekSessionsList.destination(session) {
            NavigationLink(value: route) { content }.buttonStyle(.plain)
        } else if item.sport == "strength", !item.done {
            NavigationLink(value: AppRoute.trainingMode(day)) { content }.buttonStyle(.plain)
        } else {
            Button { model.tab = .training } label: { content }.buttonStyle(.plain)
        }
    }
}

/// The long-press menu of a row: "Smazat aktivitu" with the same questions as
/// the activity's detail, or "Smazat" for a stretching or sauna.
struct PlanRowMenu: ViewModifier {
    @Environment(AppModel.self) private var model
    let item: TodaySnapshot.PlanItem
    @State private var deleting = false
    @State private var editingKcal = false

    func body(content: Content) -> some View {
        if model.demo {
            content
        } else if item.kind == "workout", item.done, let session = item.session, session.kind == "activity" {
            content
                .contextMenu {
                    Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                }
                .activityEditing(id: session.id, title: session.title, kcal: session.kcal,
                                 edited: session.kcalEdited == true, deleting: $deleting, editingKcal: $editingKcal)
        } else if item.kind == "recovery", let id = item.recoveryId {
            content.contextMenu {
                Button(role: .destructive) {
                    Task {
                        try? await model.api.deleteRecovery(id: id)
                        await model.refresh()
                    }
                } label: { Label("Smazat", systemImage: "trash") }
            }
        } else {
            content
        }
    }
}

// MARK: - The rows in order

enum DayTimelineRows {
    enum Entry: Identifiable {
        case sleep(TodaySnapshot.Sleep)
        case readiness(Int, String?)
        case workout(TodaySnapshot.PlanItem)
        /// The day's strain after the last done workout: its end, the score
        /// and what the workouts added.
        case strain(Int?, Double, Double?)
        case steps(Double, String?)
        case now(Int)
        case item(TodaySnapshot.PlanItem)

        var id: String {
            switch self {
            case .sleep: return "sleep"
            case .readiness: return "readiness"
            case .workout(let item), .item(let item): return item.id
            case .strain: return "strain"
            case .steps: return "steps"
            case .now: return "now"
            }
        }
    }

    /// The night and the readiness first, then what was done in the order of
    /// the day, the strain after the last workout and the steps so far; "teď"
    /// on today; then what is still planned, bedtime last (src/app-today.js
    /// orders the plan the same way).
    static func make(_ today: TodaySnapshot, now: Int?, stepsTime: String? = nil) -> [Entry] {
        var rows: [Entry] = []
        if let sleep = today.sleep, sleep.minutes != nil { rows.append(.sleep(sleep)) }
        if let score = today.readiness.score { rows.append(.readiness(score, today.readiness.zone)) }

        let done = today.plan.filter(\.done)
        let open = today.plan.filter { !$0.done }
        for item in done { rows.append(item.kind == "workout" ? .workout(item) : .item(item)) }

        // The strain right after the last done workout, with what they added.
        let workouts = done.filter { $0.kind == "workout" }
        if let lastWorkout = workouts.last, let score = today.strain.score, score > 0,
           let index = rows.lastIndex(where: { $0.id == lastWorkout.id }) {
            let added = workouts.compactMap(\.strain).reduce(0, +)
            let end = minutes(lastWorkout.time).map { $0 + (lastWorkout.session?.minutes ?? 0) }
            rows.insert(.strain(end, score, added > 0 ? min(added, score) : nil), at: index + 1)
        }

        if let steps = today.steps.today, steps > 0 { rows.append(.steps(steps, stepsTime)) }
        if let now { rows.append(.now(now)) }

        // Planned with a time in the order of the clock; bedtime stays last.
        let timed = open.filter { $0.kind != "bedtime" }
        let ordered = timed.enumerated().sorted { a, b in
            let ta = minutes(a.element.time ?? a.element.session?.time), tb = minutes(b.element.time ?? b.element.session?.time)
            if let ta, let tb, ta != tb { return ta < tb }
            return a.offset < b.offset
        }.map(\.element)
        for item in ordered + open.filter({ $0.kind == "bedtime" }) {
            rows.append(item.kind == "workout" ? .workout(item) : .item(item))
        }
        return rows
    }

    /// "17:30" → 1050.
    static func minutes(_ clock: String?) -> Int? {
        guard let clock else { return nil }
        let parts = clock.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        return h * 60 + m
    }

    struct Stat {
        let label: String
        let value: String
        let unit: String
    }

    /// Vzdálenost, Výkon and Délka of a done workout, as many as it has; the
    /// calories make up the third when one is missing.
    static func stats(_ session: WeekSession?) -> [Stat] {
        guard let session else { return [] }
        var out: [Stat] = []
        if let km = session.distanceKm, km > 0 {
            out.append(Stat(label: "Vzdálenost", value: Fmt.decimal(Units.distance(km)), unit: Units.distanceUnit))
        }
        if let watts = session.watts, watts > 0 { out.append(Stat(label: "Výkon", value: Fmt.int(watts), unit: "W")) }
        if let minutes = session.minutes, minutes > 0 { out.append(Stat(label: "Délka", value: Fmt.hoursMinutes(Double(minutes)), unit: "h")) }
        if out.count < 3, let kcal = session.countedKcal, kcal > 0 { out.append(Stat(label: "Energie", value: Fmt.int(kcal), unit: "kcal")) }
        return out
    }
}

// MARK: - The line

private enum Rail {
    static let timeWidth: CGFloat = 46
    static let width: CGFloat = 22
    static let dot: CGFloat = 13
    /// Space above and below a span's dots.
    static let inset: CGFloat = 7
    static var track: Color { Palette.ink.opacity(0.12) }
}

/// A dot on the line: solid for what happened, dashed for what is planned.
private struct DayDot: View {
    let color: Color
    var future = false

    var body: some View {
        Circle()
            .strokeBorder(color, style: future ? StrokeStyle(lineWidth: 2, dash: [2.6, 2.4]) : StrokeStyle(lineWidth: 3))
            .background(Circle().fill(Palette.card))
            .frame(width: Rail.dot, height: Rail.dot)
            .shadow(color: future ? .clear : color.opacity(0.45), radius: 4)
    }
}

/// The grey line through a row, from its top to its bottom; the first row's
/// starts at its dot and the last row's ends at its dot.
private struct TrackLine: View {
    let first: Bool
    let last: Bool
    /// Where the dot's centre is from the top (nil: the middle of the row).
    var dotFromTop: CGFloat? = nil
    var dotFromBottom: CGFloat? = nil

    var body: some View {
        GeometryReader { geo in
            let top = first ? (dotFromTop ?? geo.size.height / 2) : 0
            let bottom = last ? geo.size.height - (dotFromBottom ?? geo.size.height / 2) : geo.size.height
            if bottom > top {
                Rectangle().fill(Rail.track)
                    .frame(width: 2, height: bottom - top)
                    .position(x: geo.size.width / 2, y: (top + bottom) / 2)
            }
        }
    }
}

/// One moment: its time, a dot and what happened or is planned.
private struct DayPointRow<Content: View>: View {
    let color: Color
    let time: String?
    var future = false
    let first: Bool
    let last: Bool
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(time ?? "").font(Typo.tiny.weight(.medium)).foregroundStyle(future ? Palette.faint : Palette.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: Rail.timeWidth, alignment: .trailing)
            ZStack {
                TrackLine(first: first, last: last)
                DayDot(color: color, future: future)
            }
            .frame(width: Rail.width)
            .frame(maxHeight: .infinity)
            content
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 44)
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
    }
}

/// Something with a length (the night, a workout): a bar from its start to
/// its end, the times at its dots.
private struct DaySpanRow<Content: View>: View {
    let color: Color
    let start: String?
    let end: String?
    var future = false
    let first: Bool
    let last: Bool
    @ViewBuilder var content: Content

    private var dotCentre: CGFloat { Rail.inset + Rail.dot / 2 }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .trailing) {
                Text(start ?? "")
                Spacer(minLength: 8)
                Text(end ?? "")
            }
            .font(Typo.tiny.weight(.medium)).foregroundStyle(future ? Palette.faint : Palette.muted)
            .lineLimit(1).minimumScaleFactor(0.7)
            .padding(.vertical, Rail.inset - 1)
            .frame(width: Rail.timeWidth, alignment: .trailing)
            .frame(maxHeight: .infinity)
            ZStack {
                TrackLine(first: first, last: last, dotFromTop: dotCentre, dotFromBottom: dotCentre)
                bar.padding(.vertical, dotCentre)
                VStack(spacing: 0) {
                    DayDot(color: color, future: future)
                    Spacer(minLength: 0)
                    DayDot(color: color, future: future)
                }
                .padding(.vertical, Rail.inset)
            }
            .frame(width: Rail.width)
            .frame(maxHeight: .infinity)
            content
                .padding(.top, Rail.inset - 3)
                .padding(.bottom, Rail.inset)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 72)
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var bar: some View {
        if future {
            GeometryReader { geo in
                Path { p in
                    p.move(to: CGPoint(x: geo.size.width / 2, y: 0))
                    p.addLine(to: CGPoint(x: geo.size.width / 2, y: geo.size.height))
                }
                .stroke(color.opacity(0.7), style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [5, 4]))
            }
        } else {
            Capsule().fill(LinearGradient(colors: [color, color.opacity(0.67)], startPoint: .top, endPoint: .bottom))
                .frame(width: 4)
                .shadow(color: color.opacity(0.4), radius: 5)
        }
    }
}

/// "teď": the time in amber, a glowing dot and a line fading to the right.
private struct DayNowRow: View {
    let time: String
    let first: Bool
    let last: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(time).font(Typo.tiny.weight(.bold)).foregroundStyle(Palette.amber)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: Rail.timeWidth, alignment: .trailing)
            ZStack {
                TrackLine(first: first, last: last)
                Circle().fill(Palette.amber).frame(width: 9, height: 9)
                    .background(Circle().fill(Palette.amber.opacity(0.2)).frame(width: 17, height: 17))
            }
            .frame(width: Rail.width)
            .frame(maxHeight: .infinity)
            LinearGradient(colors: [Palette.amber, Palette.amber.opacity(0)], startPoint: .leading, endPoint: .trailing)
                .frame(height: 1.5)
        }
        .frame(minHeight: 30)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Teď %@", time))
    }
}

/// "HRV 62 ms" under the night.
private struct DayChip: View {
    let label: String
    let value: String
    let unit: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(16)).foregroundStyle(Palette.ink)
            Text(unit).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 9).padding(.vertical, 3)
        .background(Palette.ink.opacity(0.07), in: Capsule())
    }
}
