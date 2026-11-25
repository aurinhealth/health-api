import SwiftUI

// The athlete's other sports (football, boxing, horse riding…): Settings →
// Sports → Your other sports keeps them in the profile (`otherSports`, Log
// workout types, at most five), and Plan settings puts their practice or match
// on a weekday of the week plan (`events`, src/week-planner.js sanitizeEvents),
// so the plan works around them.

/// One practice or match on a weekday of the week plan.
struct OtherSportEvent: Equatable, Hashable {
    /// The Log workout type ("Soccer").
    var type: String
    /// "training" or "match".
    var kind: String
    var minutes: Int

    init(type: String, kind: String = "training", minutes: Int? = nil) {
        self.type = type
        self.kind = kind == "match" ? "match" : "training"
        self.minutes = minutes ?? OtherSports.usualMinutes(self.kind)
    }

    init?(_ value: JSONValue) {
        guard case .object(let o) = value, let type = o["type"]?.string else { return nil }
        self.init(type: type, kind: o["kind"]?.string ?? "training", minutes: o["minutes"]?.number.map { Int($0) })
    }

    var json: JSONValue {
        .object(["type": .string(type), "kind": .string(kind), "minutes": .number(Double(minutes))])
    }
}

enum OtherSports {
    /// The most on one day (src/week-planner.js MAX_EVENTS_PER_DAY).
    static let maxPerDay = 2
    /// The most other sports in the profile (src/energy-profile.js MAX_OTHER_SPORTS).
    static let maxSports = 5
    static let minMinutes = 15
    static let maxMinutes = 300

    /// The server's length when none is set (src/week-planner.js EVENT_MINUTES).
    static func usualMinutes(_ kind: String) -> Int { kind == "match" ? 90 : 75 }

    /// The types in the profile, in the order they were added.
    static func list(_ profile: JSONObject) -> [String] {
        guard case .array(let list)? = profile["otherSports"] else { return [] }
        return list.compactMap { $0.string }
    }

    static func value(_ types: [String]) -> JSONValue { .array(types.map { .string($0) }) }

    /// The names of the types, filled from GET /app/api/activity/types; the type itself until then.
    @MainActor static var names: [String: String] = [:]
    @MainActor static func name(_ type: String) -> String { names[type] ?? type }

    /// Reads the names once (Settings → Sports, Plan settings, Week plan).
    @MainActor static func loadNames(_ api: APIClient) async {
        guard names.isEmpty, let types = try? await api.activityTypes() else { return }
        for t in types { names[t.type] = t.name }
    }

    /// "Football match", "Football training".
    @MainActor static func title(_ event: OtherSportEvent) -> String {
        L10n.f(event.kind == "match" ? "%@: zápas" : "%@: trénink", name(event.type))
    }

    @MainActor static func disc(_ type: String, size: CGFloat) -> some View {
        SportDisc(sport: "other", type: type, state: .done, size: size)
    }

    /// The events per weekday of a week plan, Monday first.
    static func events(_ prefs: JSONValue?) -> [[OtherSportEvent]] {
        var out = Array(repeating: [OtherSportEvent](), count: 7)
        guard case .array(let days)? = WeekPlanPrefs.object(prefs)["events"] else { return out }
        for (i, day) in days.prefix(7).enumerated() {
            if case .array(let list) = day { out[i] = Array(list.compactMap { OtherSportEvent($0) }.prefix(maxPerDay)) }
        }
        return out
    }

    /// A week read with the iPhone calendar, ready to send back as it was: each
    /// day's own time (not the calendar's cap), without the read-only keys.
    static func uncapped(_ prefs: JSONValue) -> JSONValue {
        guard case .object(var o) = prefs else { return prefs }
        if case .array(let days)? = o["availability"] {
            o["availability"] = .array(days.map { day in
                guard case .object(var d) = day else { return day }
                if let own = d["ownMinutes"] { d["minutes"] = own }
                d["ownMinutes"] = nil
                d["calendarMinutes"] = nil
                return .object(d)
            })
        }
        o["source"] = nil
        o["calendar"] = nil
        return .object(o)
    }

    /// The plan with these events.
    static func edited(_ prefs: JSONValue, events: [[OtherSportEvent]]) -> JSONValue {
        guard case .object(var o) = prefs else { return prefs }
        o["events"] = .array(events.map { .array($0.map(\.json)) })
        return .object(o)
    }
}

/// Settings → Sports → "Your other sports": the sports the athlete plays
/// besides Ride, Run, Swim and Gym, each with what it counts as; added from
/// the Log workout types, removed with Remove. Saved at once.
struct OtherSportsGroup: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var types: [ActivityTypeOption] = []
    @State private var adding = false

    private var chosen: [String] { OtherSports.list(store.profile) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SettingsGroup(title: "Tvoje další sporty") {
                ForEach(Array(chosen.enumerated()), id: \.element) { index, type in
                    if index > 0 { SettingsDivider() }
                    HStack(spacing: 12) {
                        OtherSports.disc(type, size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(verbatim: OtherSports.name(type)).font(.body).foregroundStyle(Palette.ink)
                            if let category = category(type) {
                                Text(verbatim: category).font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        Button(L10n.tr("Odebrat")) { Task { await save(chosen.filter { $0 != type }) } }
                            .font(.subheadline.weight(.medium)).foregroundStyle(Palette.rust)
                            .frame(minHeight: 44)
                            .disabled(store.saving)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 56)
                }
                if chosen.count < OtherSports.maxSports {
                    if !chosen.isEmpty { SettingsDivider() }
                    Button { adding = true } label: {
                        HStack {
                            Text(verbatim: L10n.tr("Přidat sport")).font(.body.weight(.medium)).foregroundStyle(Palette.green)
                            Spacer()
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.saving || model.demo)
                }
            }
            Text(verbatim: L10n.tr("Fotbal, box, jízda na koni… Jejich trénink nebo zápas si dáš na den v Nastavení plánu a plán se mu přizpůsobí."))
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
        .sheet(isPresented: $adding) {
            ActivityTypeSheet(otherOnly: true, pick: { option in
                adding = false
                guard !chosen.contains(option.type) else { return }
                Task { await save(chosen + [option.type]) }
            })
        }
        .task {
            guard !model.demo, types.isEmpty else { return }
            types = (try? await model.api.activityTypes()) ?? []
            for t in types { OtherSports.names[t.type] = t.name }
        }
    }

    /// "Team sport", "Combat sport": what the sport counts as in the plan and the muscles.
    private func category(_ type: String) -> String? {
        types.first { $0.type == type }?.category?.name
    }

    private func save(_ list: [String]) async {
        guard await store.saveProfile(["otherSports": OtherSports.value(list)]) else { return }
        await model.refreshTraining()
    }
}

/// Today: "Did you play the match?" the morning after a practice or match of
/// the week plan that no watch recorded. How hard (1–10) and the length save
/// it as a done workout (Log workout), so its load and the tired muscles count;
/// Didn't play takes it out of that week's plan.
struct PlayedCard: View {
    @Environment(AppModel.self) private var model
    let played: TodaySnapshot.Played
    @State private var rpe: Int?
    @State private var minutes: Double
    @State private var saving = false
    @State private var done = false
    @State private var error: String?

    init(played: TodaySnapshot.Played) {
        self.played = played
        _minutes = State(initialValue: Double(played.minutes))
    }

    var body: some View {
        if !done {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    OtherSports.disc(played.type, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: L10n.tr(played.kind == "match" ? "Včerejší zápas" : "Včerejší trénink"))
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: played.name + ". " + L10n.tr("Z hodinek nic nepřišlo, jak to šlo?"))
                            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
                SectionLabel(text: "Jak náročné to bylo")
                // The same scale as a workout's "How hard was it" (WorkoutDetailViews effortGrid).
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                    ForEach(1...10, id: \.self) { value in
                        let on = rpe == value
                        Button { rpe = value } label: {
                            Text(verbatim: String(value)).font(Typo.bodyStrong).monospacedDigit()
                                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                                .frame(maxWidth: .infinity).frame(height: 44)
                                .background(on ? Palette.button : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(verbatim: "\(value), " + FeedbackSheet.effortWord(value).lowercased(with: L10n.locale)))
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                HStack {
                    Text("1 Velmi lehké")
                    Spacer()
                    Text("10 Maximum")
                }
                .font(Typo.caption).foregroundStyle(Palette.muted)
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: "Délka")
                    Spacer()
                    Text(verbatim: planDuration(Int(minutes))).font(Typo.number(20)).foregroundStyle(Palette.ink)
                }
                Slider(value: $minutes, in: Double(OtherSports.minMinutes)...Double(OtherSports.maxMinutes), step: 5)
                    .tint(Palette.ink)
                    .accessibilityLabel(Text(verbatim: L10n.tr("Délka")))
                    .accessibilityValue(Text(verbatim: planDuration(Int(minutes))))
                HStack(spacing: 10) {
                    Button { Task { await save() } } label: {
                        Text(verbatim: L10n.tr("Uložit")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity, minHeight: 48).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(rpe == nil || saving)
                    Button { Task { await notPlayed() } } label: {
                        Text(verbatim: L10n.tr("Neproběhl")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 48).background(Palette.track, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
                if let error {
                    Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 22)
        }
    }

    private func save() async {
        guard let rpe else { return }
        saving = true
        defer { saving = false }
        do {
            // The server's name of the type, in the app's language (the names may not be read yet on Today).
            let name = L10n.f(played.kind == "match" ? "%@: zápas" : "%@: trénink", played.name)
            try await model.api.manualWorkout(name: name, date: played.date, sport: "other", type: played.type,
                                              minutes: Int(minutes), completed: true, rpe: rpe, notes: "")
            error = nil
            withAnimation(.snappy) { done = true }
            await model.reloadToday()
        } catch { self.error = error.localizedDescription }
    }

    /// Takes the practice or match out of that week (the usual week keeps it).
    private func notPlayed() async {
        saving = true
        defer { saving = false }
        let weekday = ISODay.weekdayIndex(played.date), monday = ISODay.shift(played.date, -weekday)
        do {
            let plan = try await model.api.weekPlan(start: monday)
            guard let prefs = plan.prefs else { throw URLError(.cannotParseResponse) }
            var events = OtherSports.events(prefs)
            events[weekday].removeAll { $0.type == played.type }
            try await model.api.saveWeekPlan(start: monday, prefs: OtherSports.edited(OtherSports.uncapped(prefs), events: events))
            error = nil
            withAnimation(.snappy) { done = true }
            await model.reloadToday()
        } catch { self.error = error.localizedDescription }
    }
}
