import SwiftUI

// "Kdy mám čas": the time for training on each weekday, one bar per day set by
// a tap or a drag (0–4 h), for the usual week or just one week
// (GET/POST/DELETE /app/api/week-plan, src/week-planner.js). The week's plan
// and the generator keep to it. The sports per day and the number of workouts
// go back as they came. "Kalendář v iPhonu" (App/CalendarTime.swift) caps each
// day of this week by the calendar's free time: the bar is hatched where the
// calendar takes the time away.

/// The week plan's object as the server sends it: the editor reads a few keys
/// and changes them, every other key goes back as it came.
enum WeekPlanPrefs {
    static let sports = ["ride", "run", "gym"]
    /// The most sessions on one day (src/week-planner.js MAX_PER_DAY).
    static let maxPerDay = 4

    static func object(_ prefs: JSONValue?) -> JSONObject {
        if case .object(let o)? = prefs { return o }
        return [:]
    }

    /// The sports on each weekday, Monday first.
    static func days(_ prefs: JSONValue?) -> [[String]] {
        var out = Array(repeating: [String](), count: 7)
        guard case .array(let days)? = object(prefs)["days"] else { return out }
        for (i, day) in days.prefix(7).enumerated() {
            if case .array(let list) = day { out[i] = list.compactMap { $0.string }.filter { sports.contains($0) } }
        }
        return out
    }

    /// The athlete's own minutes for training on each weekday, Monday first;
    /// -1 when not set. A week read with the calendar keeps them in "ownMinutes".
    static func minutes(_ prefs: JSONValue?) -> [Int] {
        days(prefs) { o in
            if let own = o["ownMinutes"] { return own.number }
            return o["minutes"]?.number
        }.map { $0 ?? -1 }
    }

    /// The minutes the week's plan keeps to, the calendar counted; -1 when not set.
    static func available(_ prefs: JSONValue?) -> [Int] {
        days(prefs) { $0["minutes"]?.number }.map { $0 ?? -1 }
    }

    /// The calendar's free minutes on each day of the week; nil where it was not read.
    static func calendar(_ prefs: JSONValue?) -> [Int?] {
        days(prefs) { $0["calendarMinutes"]?.number }
    }

    /// True when the week's time follows the iPhone calendar.
    static func followsCalendar(_ prefs: JSONValue?) -> Bool {
        object(prefs)["calendar"] == .bool(true)
    }

    private static func days(_ prefs: JSONValue?, _ value: (JSONObject) -> Double?) -> [Int?] {
        var out = Array(repeating: Int?.none, count: 7)
        guard case .array(let days)? = object(prefs)["availability"] else { return out }
        for (i, day) in days.prefix(7).enumerated() {
            if case .object(let o) = day, let m = value(o) { out[i] = Int(m.rounded()) }
        }
        return out
    }

    static func weeklyActivities(_ prefs: JSONValue?) -> Int? {
        object(prefs)["weeklyActivities"]?.number.map { Int($0) }
    }

    /// "week" when the week has its own plan, else "default".
    static func source(_ prefs: JSONValue?) -> String? {
        object(prefs)["source"]?.string
    }

    static func daysValue(_ days: [[String]]) -> JSONValue {
        .array(days.map { .array($0.map { .string($0) }) })
    }

    /// The plan with the athlete's own time, sports per day and count.
    static func edited(_ prefs: JSONValue?, minutes: [Int], days: [[String]], weeklyActivities: Int?) -> JSONValue {
        var o = object(prefs)
        o["source"] = nil
        o["automatic"] = nil
        o["availabilityMode"] = .string("manual")
        o["availability"] = .array(minutes.map { m in
            .object(["window": .string(""), "minutes": m < 0 ? .null : .number(Double(m)), "preferredSports": .array([])])
        })
        o["days"] = daysValue(days)
        o["weeklyActivities"] = weeklyActivities.map { .number(Double($0)) } ?? .null
        return .object(o)
    }
}

struct AvailabilityView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// Monday of the week "Jen tento týden" changes.
    var weekStart: String = WeekPlanView.monday()
    var onSave: () -> Void = {}

    @State private var weekOnly = false
    @State private var prefs: JSONValue?
    @State private var minutes = Array(repeating: -1, count: 7)
    @State private var loading = false
    @State private var saving = false
    @State private var error: String?
    @State private var started = false
    @State private var skipScopeLoad = false
    /// The calendar's free minutes on this week's days (nil: not read).
    @State private var calendarFree = Array(repeating: Int?.none, count: 7)
    @State private var readCalendar = CalendarTime.shared.reads
    @State private var writeCalendar = CalendarTime.shared.writes
    @State private var target = CalendarTime.shared.target
    @State private var calendarBusy = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Kdy mám čas") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · týden").padding(.top, 24)
                Text("Kdy mám čas").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                if loading && prefs == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if prefs != nil {
                    editor
                }
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
                }
            }
        }
        .task {
            guard !started else { return }
            started = true
            await load(initial: true)
        }
        .onChange(of: weekOnly) { _, _ in
            if skipScopeLoad { skipScopeLoad = false; return }
            Task { await load(initial: false) }
        }
    }

    @ViewBuilder
    private var editor: some View {
        VStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { i in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                AvailabilityBarRow(
                    day: Fmt.weekdayShort(ISODay.shift(weekStart, i)),
                    date: weekOnly ? Fmt.dayMonth(ISODay.shift(weekStart, i)) : nil,
                    minutes: $minutes[i],
                    free: readCalendar ? calendarFree[i] : nil
                )
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 4)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .disabled(saving || loading)
        .sensoryFeedback(.selection, trigger: minutes)
        .padding(.top, 22)

        HStack(alignment: .firstTextBaseline) {
            Text("Týdně").font(Typo.body).foregroundStyle(Palette.muted)
            Spacer(minLength: 8)
            Text(verbatim: Fmt.duration(total)).font(Typo.number(36)).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
        .padding(.top, 22)

        SettingsGroup {
            SettingsToggle(
                title: "Jen tento týden",
                subtitle: Fmt.dayMonth(weekStart) + " – " + Fmt.dayMonth(ISODay.shift(weekStart, 6)),
                isOn: $weekOnly,
                disabled: loading || saving
            )
        }
        .padding(.top, 16)

        calendarGroup.padding(.top, 22)

        PrimaryButton(title: saving ? "Ukládám…" : "Uložit", systemImage: "checkmark", busy: saving) {
            Task { await save() }
        }
        .disabled(saving || loading || model.demo)
        .padding(.top, 22)

        if weekOnly && WeekPlanPrefs.source(prefs) == "week" {
            SecondaryButton(title: "Vrátit běžný týden", systemImage: "arrow.uturn.backward") {
                Task { await reset() }
            }
            .disabled(saving || loading || model.demo)
            .padding(.top, 10)
        }
    }

    private var total: Int {
        minutes.indices.map { CalendarTime.capped(minutes[$0], free: readCalendar ? calendarFree[$0] : nil) }.filter { $0 > 0 }.reduce(0, +)
    }

    // MARK: Kalendář v iPhonu

    private var calendarGroup: some View {
        SettingsGroup(title: L10n.tr("Kalendář v iPhonu")) {
            SettingsToggle(title: L10n.tr("Číst kalendář"), isOn: Binding(get: { readCalendar }, set: { on in Task { await setRead(on) } }),
                           disabled: calendarBusy || saving || model.demo)
            if readCalendar {
                SettingsDivider()
                SettingsToggle(title: L10n.tr("Zapisovat tréninky"), isOn: Binding(get: { writeCalendar }, set: { on in
                    if !on { CalendarTime.shared.removeMirrored() }
                    UserDefaults.standard.set(on, forKey: CalendarTime.writeKey)
                    writeCalendar = CalendarTime.shared.writes
                    if on { Task { await CalendarTime.shared.mirror(api: model.api, force: true) } }
                }), disabled: calendarBusy || saving)
                if writeCalendar {
                    SettingsDivider()
                    SettingsPicker(title: L10n.tr("Kalendář"), selection: Binding(get: { target }, set: { id in
                        CalendarTime.shared.target = id
                        target = id
                    }), options: CalendarTime.shared.calendars().map { ($0.id, $0.title) })
                }
            }
        }
    }

    private func setRead(_ on: Bool) async {
        calendarBusy = true
        defer { calendarBusy = false }
        error = nil
        if on {
            guard await CalendarTime.shared.requestAccess() else {
                readCalendar = false
                error = L10n.tr("Aurin nemá přístup ke kalendáři. Povol ho v Nastavení iPhonu → Aplikace → Aurin → Kalendáře.")
                return
            }
            UserDefaults.standard.set(true, forKey: CalendarTime.readKey)
            readCalendar = true
            await CalendarTime.shared.send(api: model.api, force: true)
        } else {
            readCalendar = false
            if CalendarTime.shared.writes { CalendarTime.shared.removeMirrored() }
            do { try await CalendarTime.shared.stopReading(api: model.api) } catch { self.error = error.localizedDescription }
        }
        writeCalendar = CalendarTime.shared.writes
        await loadCalendar()
        onSave()
    }

    /// This week's calendar, also while the usual week is being edited.
    private func loadCalendar() async {
        guard readCalendar, !model.demo else { calendarFree = Array(repeating: nil, count: 7); return }
        if weekOnly, let prefs { calendarFree = WeekPlanPrefs.calendar(prefs); return }
        if let r = try? await model.api.weekPlan(start: weekStart) { calendarFree = WeekPlanPrefs.calendar(r.prefs) }
    }

    // MARK: Data

    private func load(initial: Bool) async {
        guard !model.demo else { error = L10n.tr("V ukázce se čas na trénink nenastavuje."); return }
        loading = true
        defer { loading = false }
        if initial { await CalendarTime.shared.send(api: model.api) }
        do {
            // A week without its own plan answers with the usual week.
            let r = try await model.api.weekPlan(start: initial || weekOnly ? weekStart : nil)
            if initial && WeekPlanPrefs.source(r.prefs) == "week" {
                // The page opens on the week when it has its own plan.
                skipScopeLoad = true
                weekOnly = true
            }
            apply(r.prefs)
            await loadCalendar()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func apply(_ value: JSONValue?) {
        prefs = value
        minutes = WeekPlanPrefs.minutes(value)
        error = nil
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            let days = WeekPlanPrefs.days(prefs).map { Array($0.prefix(WeekPlanPrefs.maxPerDay)) }
            let body = WeekPlanPrefs.edited(prefs, minutes: minutes, days: days, weeklyActivities: WeekPlanPrefs.weeklyActivities(prefs))
            try await model.api.saveWeekPlan(start: weekOnly ? weekStart : nil, prefs: body)
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reset() async {
        saving = true
        defer { saving = false }
        do {
            let r = try await model.api.resetWeekPlan(start: weekStart)
            apply(r.prefs)
            onSave()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One weekday: "Po", a bar to tap or drag (0–4 h in quarter hours) and the
/// time on the right ("1 h 30", "volno", "–" while not set). With the
/// calendar's `free` minutes the bar fills to what is left; the rest of the
/// athlete's own time is hatched, and the own time stands under the day.
struct AvailabilityBarRow: View {
    let day: String
    var date: String? = nil
    @Binding var minutes: Int
    var free: Int? = nil

    /// The time the plan keeps to.
    private var shown: Int { CalendarTime.capped(minutes, free: free) }
    private var cut: Bool { free != nil && minutes > 0 && shown < minutes }

    static let maxMinutes = 240
    static let step = 15

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: day).font(Typo.bodyStrong).foregroundStyle(minutes == 0 ? Palette.faint : Palette.ink)
                if cut {
                    HStack(spacing: 3) {
                        Image(systemName: "calendar").font(.system(size: 9, weight: .semibold))
                        Text(verbatim: Self.text(minutes)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .font(Typo.tiny).foregroundStyle(Palette.amber)
                } else if let date {
                    Text(verbatim: date).font(Typo.tiny).foregroundStyle(Palette.faint).lineLimit(1)
                }
            }
            .frame(width: free == nil ? 44 : 50, alignment: .leading)

            GeometryReader { geo in
                let width = max(geo.size.width, 1)
                let fraction = { (m: Int) in m > 0 ? min(Double(m) / Double(Self.maxMinutes), 1) : 0 }
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Palette.track)
                    if cut {
                        Hatch().stroke(Palette.ink.opacity(0.16), lineWidth: 2.5)
                            .frame(width: width * fraction(minutes))
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    }
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Palette.amberBar)
                        .frame(width: width * fraction(shown))
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in set(x: value.location.x, width: width) }
                )
            }
            .frame(height: 30)

            valueText
                .frame(minWidth: 64, alignment: .trailing)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: day))
        .accessibilityValue(Text(verbatim: cut ? L10n.f("%@ podle kalendáře, nastaveno %@", Self.text(shown), Self.text(minutes)) : Self.text(minutes)))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: minutes = min(Self.maxMinutes, max(minutes, 0) + Self.step)
            case .decrement: minutes = max(0, minutes - Self.step)
            @unknown default: break
            }
        }
    }

    @ViewBuilder
    private var valueText: some View {
        if shown == 0 {
            Text(verbatim: L10n.tr("volno")).font(Typo.sentenceItalic(20)).foregroundStyle(Palette.faint)
        } else {
            Text(verbatim: Self.text(shown)).font(Typo.number(24)).foregroundStyle(shown < 0 ? Palette.faint : Palette.ink)
                .lineLimit(1)
        }
    }

    private func set(x: CGFloat, width: CGFloat) {
        let raw = Double(min(max(x, 0), width) / width) * Double(Self.maxMinutes)
        let snapped = Int((raw / Double(Self.step)).rounded()) * Self.step
        if snapped != minutes { minutes = snapped }
    }

    /// 90 → "1 h 30", 45 → "45 min", 0 → "volno", not set → "–".
    static func text(_ m: Int) -> String {
        if m < 0 { return "–" }
        if m == 0 { return L10n.tr("volno") }
        if m < 60 { return "\(m) min" }
        return "\(m / 60) h" + (m % 60 > 0 ? " \(m % 60)" : "")
    }
}

/// Diagonal lines: the part of a day's time the calendar takes away.
private struct Hatch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: CGPoint(x: x, y: rect.maxY))
            p.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
            x += 9
        }
        return p
    }
}
