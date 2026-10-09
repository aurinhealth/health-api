import SwiftUI

// "Kdy mám čas": the time for training on each weekday and the sports for the
// day, for the usual week or just one week (GET/POST/DELETE /app/api/week-plan,
// src/week-planner.js). The week's plan and the generator keep to it.

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

    /// Minutes for training on each weekday, Monday first; -1 when not set.
    static func minutes(_ prefs: JSONValue?) -> [Int] {
        var out = Array(repeating: -1, count: 7)
        guard case .array(let days)? = object(prefs)["availability"] else { return out }
        for (i, day) in days.prefix(7).enumerated() {
            if case .object(let o) = day, let m = o["minutes"]?.number { out[i] = Int(m.rounded()) }
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

    private enum Scope: Hashable { case usual, week }

    @State private var scope: Scope = .usual
    @State private var prefs: JSONValue?
    @State private var minutes = Array(repeating: -1, count: 7)
    @State private var days = Array(repeating: [String](), count: 7)
    @State private var weeklyActivities: Int?
    @State private var loading = false
    @State private var saving = false
    @State private var error: String?
    @State private var started = false
    @State private var skipScopeLoad = false

    private static let minuteOptions = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · týden").padding(.top, 24)
                Text("Kdy mám čas").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                Picker("Platnost", selection: $scope) {
                    Text("Běžný týden").tag(Scope.usual)
                    Text("Jen tento týden").tag(Scope.week)
                }
                .pickerStyle(.segmented)
                .disabled(loading || saving)
                .padding(.top, 18)

                if scope == .week {
                    Text(verbatim: Fmt.dayMonth(weekStart) + " – " + Fmt.dayMonth(ISODay.shift(weekStart, 6)))
                        .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8)
                }

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
        .onChange(of: scope) { _, _ in
            if skipScopeLoad { skipScopeLoad = false; return }
            Task { await load(initial: false) }
        }
    }

    @ViewBuilder
    private var editor: some View {
        let total = minutes.filter { $0 > 0 }.reduce(0, +)
        SettingsGroup(footer: total > 0 ? L10n.f("Celkem %@ týdně", Fmt.duration(total)) : nil) {
            ForEach(0..<7, id: \.self) { i in
                if i > 0 { SettingsDivider() }
                dayRow(i)
            }
        }
        .padding(.top, 18)

        SettingsGroup {
            HStack(spacing: 12) {
                Text("Tréninků týdně").font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Menu {
                    Picker("Tréninků týdně", selection: $weeklyActivities) {
                        Text("Podle historie").tag(Int?.none)
                        ForEach(1...14, id: \.self) { n in Text(verbatim: String(n)).tag(Int?.some(n)) }
                    }
                } label: {
                    menuLabel(weeklyActivities.map { String($0) } ?? L10n.tr("Podle historie"))
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
        }
        .padding(.top, 14)

        PrimaryButton(title: saving ? "Ukládám…" : "Uložit", systemImage: "checkmark", busy: saving) {
            Task { await save() }
        }
        .disabled(saving || loading || model.demo)
        .padding(.top, 22)

        if scope == .week && WeekPlanPrefs.source(prefs) == "week" {
            SecondaryButton(title: "Vrátit běžný týden", systemImage: "arrow.uturn.backward") {
                Task { await reset() }
            }
            .disabled(saving || loading || model.demo)
            .padding(.top, 10)
        }
    }

    private func dayRow(_ i: Int) -> some View {
        let date = ISODay.shift(weekStart, i)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: Self.weekdayName(date)).font(.body).foregroundStyle(Palette.ink)
                    if scope == .week {
                        Text(verbatim: Fmt.dayMonth(date)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                Spacer(minLength: 8)
                Menu {
                    Picker("Čas", selection: $minutes[i]) {
                        Text("Neurčeno").tag(-1)
                        ForEach(Self.options(including: minutes[i]), id: \.self) { m in
                            Text(verbatim: Self.minutesText(m)).tag(m)
                        }
                    }
                } label: {
                    menuLabel(Self.minutesText(minutes[i]))
                }
            }
            if minutes[i] != 0 {
                HStack(spacing: 8) {
                    ForEach(WeekPlanPrefs.sports, id: \.self) { sport in sportChip(sport, day: i) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func sportChip(_ sport: String, day i: Int) -> some View {
        let on = days[i].contains(sport)
        return Button {
            if on { days[i].removeAll { $0 == sport } }
            else if days[i].count < WeekPlanPrefs.maxPerDay { days[i].append(sport) }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: Self.symbol(sport)).font(.system(size: 12, weight: .semibold))
                Text(verbatim: Self.sportName(sport)).font(Typo.caption.weight(.medium))
            }
            .foregroundStyle(on ? Palette.amber : Palette.muted)
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(on ? Palette.amberSoft : Palette.track, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func menuLabel(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(verbatim: text).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
        }
    }

    // MARK: Data

    private func load(initial: Bool) async {
        guard !model.demo else { error = L10n.tr("V ukázce se čas na trénink nenastavuje."); return }
        loading = true
        defer { loading = false }
        do {
            // A week without its own plan answers with the usual week.
            let r = try await model.api.weekPlan(start: initial || scope == .week ? weekStart : nil)
            if initial && WeekPlanPrefs.source(r.prefs) == "week" {
                // The page opens on the week when it has its own plan.
                skipScopeLoad = true
                scope = .week
            }
            apply(r.prefs)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func apply(_ value: JSONValue?) {
        prefs = value
        minutes = WeekPlanPrefs.minutes(value)
        days = WeekPlanPrefs.days(value)
        weeklyActivities = WeekPlanPrefs.weeklyActivities(value)
        error = nil
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            let body = WeekPlanPrefs.edited(prefs, minutes: minutes, days: days.map { Array($0.prefix(WeekPlanPrefs.maxPerDay)) }, weeklyActivities: weeklyActivities)
            try await model.api.saveWeekPlan(start: scope == .week ? weekStart : nil, prefs: body)
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

    // MARK: Text

    private static func options(including current: Int) -> [Int] {
        current > 0 && !minuteOptions.contains(current) ? (minuteOptions + [current]).sorted() : minuteOptions
    }

    private static func minutesText(_ m: Int) -> String {
        m < 0 ? L10n.tr("Neurčeno") : m == 0 ? L10n.tr("Volno") : Fmt.duration(m)
    }

    static func sportName(_ sport: String) -> String {
        L10n.tr(["ride": "Kolo", "run": "Běh", "gym": "Posilovna"][sport] ?? sport)
    }

    static func symbol(_ sport: String) -> String {
        ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill"][sport] ?? "figure.mixed.cardio"
    }

    /// "Pondělí" for a Monday.
    private static func weekdayName(_ iso: String) -> String {
        guard let date = ISODay.date(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Fmt.locale
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEEE"
        return Fmt.capitalized(f.string(from: date))
    }
}
