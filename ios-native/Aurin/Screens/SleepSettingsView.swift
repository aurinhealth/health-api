import SwiftUI

/// Spánek: tonight on a 24-hour dial (bedtime and wake time, both draggable),
/// how long to sleep tonight, why the need is what it is, then the own sleep
/// goal and the alarm on work days and at the weekend. The bedtime is the wake
/// time minus the time in bed for tonight's sleep (the need: the goal plus the
/// day's strain, low HRV and debt, minus naps; or the user's own length).
struct SleepSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var store: SettingsStore?
    var given: SettingsStore? = nil
    /// Opened from Zdraví or Dnes (AppRoute): the app's round back button and
    /// Uložit in glass, as the other pages there; from Settings the system bar.
    var route = false

    var body: some View {
        Group {
            if let store = given ?? store {
                SleepSettingsForm(store: store, route: route)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Palette.settingsBackground.ignoresSafeArea())
            }
        }
        .task {
            guard given == nil, store == nil else { return }
            let s = SettingsStore(api: model.api, demo: model.demo)
            await s.load()
            store = s
        }
    }
}

struct SleepSettingsForm: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    var route = false
    /// 0 = by age and the day (automatic); else minutes.
    @State private var goal = 0
    @State private var workAlarm = false
    @State private var workTime = SleepSettingsForm.clock("07:00")
    @State private var weekendAlarm = false
    @State private var weekendTime = SleepSettingsForm.clock("08:30")
    @State private var original: JSONObject = [:]
    @State private var saved = false
    @AppStorage("systemAlarm") private var systemAlarm = false
    @State private var alarmNote: String?
    @State private var alarmOK = false
    @State private var plannerSaving = false

    static let goals: [Int] = Array(stride(from: 360, through: 600, by: 15))

    var body: some View {
        SettingsPage(title: L10n.tr("Spánek")) {
            // Room under the pinned back button.
            if route { Color.clear.frame(height: 46) }
            if let tonight = model.health?.sleep.tonight, tonight.bedtime != nil, tonight.wake != nil {
                SleepPlanner(tonight: tonight, usual: model.health?.sleep.regularity?.bedtime, saving: plannerSaving,
                             weekendMorning: Self.weekendMorning(after: tonight.date),
                             onChoose: { minutes, wake in Task { await saveTonight(minutes: minutes, wake: wake) } },
                             onEveryDay: { wake, weekend in Task { await saveEveryDay(wake, weekend: weekend) } })
            }

            SettingsGroup(title: "Cíl spánku") {
                HStack {
                    Text("Chci spát").font(.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Picker("Chci spát", selection: $goal) {
                        Text("automaticky").tag(0)
                        ForEach(Self.goals, id: \.self) { Text(Fmt.hoursMinutes(Double($0)) + " h").tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(Palette.muted)
                    .labelsHidden()
                }
                .padding(.leading, 16).padding(.trailing, 8).frame(minHeight: 50)
            }

            SettingsGroup(title: "Budík") {
                alarmRow("Pracovní dny", subtitle: "pondělí až pátek", isOn: $workAlarm, time: $workTime)
                SettingsDivider()
                alarmRow("Víkend", subtitle: "sobota a neděle", isOn: $weekendAlarm, time: $weekendTime)
            }

            if SystemAlarm.supported {
                SettingsGroup {
                    SettingsToggle(title: "Budit mě v iPhonu", isOn: $systemAlarm)
                }
                if let alarmNote {
                    Text(alarmNote).font(Typo.small).foregroundStyle(alarmOK ? Palette.green : Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if saved {
                Label("Uloženo. Večerka se přepočítala.", systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            }
            if let error = store.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }
        }
        .modifier(SleepSaveChrome(route: route, enabled: changes != original, saving: store.saving) { Task { await save() } })
        .onAppear(perform: fill)
        .task { if model.health == nil { await model.refreshHealth() } }
        .onChange(of: systemAlarm) { _, on in Task { await syncAlarm(on) } }
    }

    private func alarmRow(_ title: String, subtitle: String, isOn: Binding<Bool>, time: Binding<Date>) -> some View {
        VStack(spacing: 0) {
            SettingsToggle(title: title, subtitle: subtitle, isOn: isOn.animation(.easeOut(duration: 0.2)))
            if isOn.wrappedValue {
                DatePicker("Vstávám v", selection: time, displayedComponents: .hourAndMinute)
                    .environment(\.locale, Fmt.locale)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
            }
        }
    }

    private func fill() {
        let p = store.profile
        goal = p["sleepGoal"]?.number.map { Int($0) } ?? 0
        if let w = p["wakeTime"]?.string { workAlarm = true; workTime = Self.clock(w) }
        if let w = p["wakeTimeWeekend"]?.string { weekendAlarm = true; weekendTime = Self.clock(w) }
        original = changes
    }

    private var changes: JSONObject {
        [
            "sleepGoal": goal == 0 ? .null : .number(Double(goal)),
            "wakeTime": .string(workAlarm ? Self.text(workTime) : ""),
            "wakeTimeWeekend": .string(weekendAlarm ? Self.text(weekendTime) : "")
        ]
    }

    private func save() async {
        guard await store.saveProfile(changes) else { return }
        fill()
        saved = true
        if systemAlarm { await syncAlarm(true) }
        await model.refresh()
        await model.refreshHealth()
    }

    /// Tonight's own length (nil = the whole need) and a wake time for tomorrow
    /// only (nil = the alarm). Saved at once: Dnes plans its bedtime from it too.
    private func saveTonight(minutes: Int?, wake: Int?) async {
        guard let date = model.health?.sleep.tonight.date else { return }
        plannerSaving = true
        defer { plannerSaving = false }
        let value: JSONValue = minutes == nil && wake == nil ? .null : JSONValue.object([
            "date": .string(date),
            "minutes": minutes.map { JSONValue.number(Double($0)) } ?? JSONValue.null,
            "wake": .string(wake.map { Self.text(minutes: $0) } ?? "")
        ])
        guard await store.saveProfile(["sleepTonight": value]) else { return }
        await model.refreshHealth()
        await model.refresh()
    }

    /// A new wake time for every work day (or weekend day): the alarm itself,
    /// with tonight's own wake time dropped.
    private func saveEveryDay(_ wake: Int, weekend: Bool) async {
        if weekend { weekendAlarm = true; weekendTime = Self.clock(Self.text(minutes: wake)) } else { workAlarm = true; workTime = Self.clock(Self.text(minutes: wake)) }
        let chosen = model.health?.sleep.tonight.chosen
        var next = changes
        next["sleepTonight"] = chosen.map { JSONValue.object(["date": .string(model.health?.sleep.tonight.date ?? ""), "minutes": .number(Double($0)), "wake": .string("")]) } ?? .null
        plannerSaving = true
        defer { plannerSaving = false }
        guard await store.saveProfile(next) else { return }
        fill()
        if systemAlarm { await syncAlarm(true) }
        await model.refreshHealth()
        await model.refresh()
    }

    /// The morning after the evening `date` ("2026-10-15") is a Saturday or Sunday.
    static func weekendMorning(after date: String?) -> Bool {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let date, let day = f.date(from: date) else { return false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let weekday = cal.component(.weekday, from: day.addingTimeInterval(86400))
        return weekday == 1 || weekday == 7
    }

    static func text(minutes: Int) -> String {
        let m = ((minutes % 1440) + 1440) % 1440
        return String(format: "%02d:%02d", m / 60, m % 60)
    }

    /// The iPhone alarm at the times on screen, or none.
    private func syncAlarm(_ on: Bool) async {
        guard on else { SystemAlarm.cancel(); return }
        let work = workAlarm ? Self.text(workTime) : nil, weekend = weekendAlarm ? Self.text(weekendTime) : nil
        guard work != nil || weekend != nil else { alarmOK = false; alarmNote = L10n.tr("Nejdřív zapni budík na pracovní dny nebo víkend."); return }
        if let problem = await SystemAlarm.sync(work: work, weekend: weekend) {
            alarmOK = false
            alarmNote = problem
            systemAlarm = false
        } else {
            var when: [String] = []
            if let work { when.append(L10n.f("v pracovní dny v %@", ClockText.format(work))) }
            if let weekend { when.append(L10n.f("o víkendu v %@", ClockText.format(weekend))) }
            let joined = when.count > 1 ? L10n.f("%@ a %@", when[0], when[1]) : when.joined()
            alarmOK = true
            alarmNote = L10n.f("Budík zvoní %@.", joined)
        }
    }

    static func clock(_ text: String) -> Date {
        let parts = text.split(separator: ":").compactMap { Int($0) }
        let start = Calendar.current.startOfDay(for: Date())
        guard parts.count == 2 else { return start }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: start) ?? start
    }

    static func text(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

/// Health → Spánek: tonight from bedtime to the wake time and the sleep it
/// plans; opens Spánek with the dial.
struct SleepSettingsCard: View {
    let tonight: HealthSnapshot.Tonight

    var body: some View {
        Card {
            HStack {
                WidgetHeader(title: "Dnešní noc", color: Palette.indigo)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            if let bed = tonight.bedtime, let wake = tonight.wake {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(ClockText.format(bed)).font(Typo.number(38)).foregroundStyle(Palette.ink)
                    Image(systemName: "arrow.right").font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.faint)
                    Text(ClockText.format(wake)).font(Typo.number(38)).foregroundStyle(Palette.ink)
                }
                Text(L10n.f("spánek %@", SleepPlanner.short(tonight.sleep ?? tonight.need)))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            } else {
                Text("Nastav si budík").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otevře plán spánku")
    }
}

/// Uložit: in the system bar in Settings, in glass beside the round back
/// button when the page is opened from a card.
private struct SleepSaveChrome: ViewModifier {
    let route: Bool
    let enabled: Bool
    let saving: Bool
    let save: () -> Void
    @Environment(\.dismiss) private var dismiss

    @ViewBuilder
    func body(content: Content) -> some View {
        if route {
            content
                .floatingBack(title: "Spánek",
                              trailing: ChromeAction(systemImage: "checkmark", label: "Uložit", text: "Uložit", enabled: enabled && !saving, action: save),
                              pinTitle: true) { dismiss() }
                .toolbar(.hidden, for: .navigationBar)
        } else {
            content.toolbar { SaveButton(enabled: enabled, saving: saving, action: save) }
        }
    }
}
