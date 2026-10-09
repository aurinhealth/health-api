import SwiftUI

/// Nastavení spánku: the own sleep goal and the alarm on work days and at the
/// weekend. The bedtime in "Plán dne" is the alarm minus tonight's need (the
/// goal plus the day's strain, low HRV and debt) minus the time to fall asleep.
struct SleepSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var store: SettingsStore?
    var given: SettingsStore? = nil

    var body: some View {
        Group {
            if let store = given ?? store {
                SleepSettingsForm(store: store)
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

    static let goals: [Int] = Array(stride(from: 360, through: 600, by: 15))

    var body: some View {
        SettingsPage(title: "Spánek") {
            if let tonight = model.today?.tonight, let bed = tonight.bedtime {
                Card {
                    WidgetHeader(title: "Dnešní večerka", color: Palette.indigo)
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(bed).font(Typo.number(46)).foregroundStyle(Palette.ink)
                        Text("do postele").font(Typo.small).foregroundStyle(Palette.muted)
                        Spacer()
                        if let wake = tonight.wake {
                            Label(wake, systemImage: "alarm").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                        }
                    }
                    if let need = tonight.need {
                        Text("Potřeba na dnešní noc " + Fmt.duration(need) + ". Počítá se z cíle, dnešní zátěže, HRV a spánkového dluhu.")
                            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            SettingsGroup(title: "Cíl spánku", footer: "Automaticky podle věku (dospělí 7 h 30 min až 8 h). Vlastní cíl nahradí základ, dnešní zátěž a dluh se k němu dál přičítají.") {
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

            SettingsGroup(title: "Budík", footer: "Podle budíku se počítá, kdy jít spát. Bez budíku se bere obvyklé vstávání z posledních nocí, a když ještě žádné nejsou, večerka se nespočítá.") {
                alarmRow("Pracovní dny", subtitle: "pondělí až pátek", isOn: $workAlarm, time: $workTime)
                SettingsDivider()
                alarmRow("Víkend", subtitle: "sobota a neděle", isOn: $weekendAlarm, time: $weekendTime)
            }

            if SystemAlarm.supported {
                SettingsGroup(footer: "iPhone pak v tyto časy zazvoní jako budík v Hodinách, i v tichém režimu. Když časy změníš a uložíš, budík se posune.") {
                    SettingsToggle(title: "Budit mě v iPhonu", subtitle: "budík od Loadwise, pracovní dny i víkend", isOn: $systemAlarm)
                }
                if let alarmNote {
                    Text(alarmNote).font(Typo.small).foregroundStyle(alarmNote.hasPrefix("Budík zvoní") ? Palette.green : Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Text("Budík tady počítá večerku. Aby iPhone podle něj i zvonil, potřebuje iOS 26; do té doby si stejný čas nastav v Hodinách.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }

            if saved {
                Label("Uloženo. Večerka se přepočítala.", systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            }
            if let error = store.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
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

    /// The iPhone alarm at the times on screen, or none.
    private func syncAlarm(_ on: Bool) async {
        guard on else { SystemAlarm.cancel(); return }
        let work = workAlarm ? Self.text(workTime) : nil, weekend = weekendAlarm ? Self.text(weekendTime) : nil
        guard work != nil || weekend != nil else { alarmNote = "Nejdřív zapni budík na pracovní dny nebo víkend."; return }
        if let problem = await SystemAlarm.sync(work: work, weekend: weekend) {
            alarmNote = problem
            systemAlarm = false
        } else {
            alarmNote = "Budík zvoní " + [work.map { "v pracovní dny v " + $0 }, weekend.map { "o víkendu v " + $0 }].compactMap { $0 }.joined(separator: " a ") + "."
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

/// Health → Spánek: tonight's bedtime and alarm, opens Nastavení spánku.
struct SleepSettingsCard: View {
    let tonight: HealthSnapshot.Tonight

    var body: some View {
        Card {
            WidgetHeader(title: "Večerka a cíl spánku", color: Palette.indigo)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    if let bed = tonight.bedtime {
                        Text("Do postele v " + bed).font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                        Text([tonight.wake.map { "budík " + $0 + (tonight.wakeSet == true ? "" : " (obvyklé vstávání)") },
                              "cíl " + Fmt.duration(tonight.base) + (tonight.goalSet == true ? "" : " podle věku")]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                    } else {
                        Text("Nastav si budík").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                        Text("Podle budíku a cíle spánku spočítám, kdy jít spát.").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "alarm").font(.system(size: 20)).foregroundStyle(Palette.indigo)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Otevře nastavení spánku")
    }
}
