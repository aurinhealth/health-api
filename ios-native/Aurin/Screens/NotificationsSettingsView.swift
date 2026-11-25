import LocalAuthentication
import SwiftUI
import UIKit
import UserNotifications

// Settings → Oznámení in the Settings concept's look (widgets and
// notifications concept v3, 2026-11-19): a bell and one sentence on how it is
// set, then From Coach, Reminders and Privacy. A reminder's row opens a sheet
// with its time and days. Everything is stored in UserDefaults under the
// Reminders keys, and the reminders are planned again after every change.

/// One reminder of the list.
enum ReminderKind: String, CaseIterable, Identifiable {
    case bedtime, water, meals, workout, food, weight, week

    var id: String { rawValue }

    var name: String {
        switch self {
        case .bedtime: return "Do postele"
        case .water: return "Voda"
        case .meals: return "Jídla"
        case .workout: return "Trénink v plánu"
        case .food: return "Zapsat den"
        case .weight: return "Vážení"
        case .week: return "Plán týdne"
        }
    }

    var symbol: String {
        switch self {
        case .bedtime: return "moon.fill"
        case .water: return "drop.fill"
        case .meals: return "fork.knife"
        case .workout: return "dumbbell.fill"
        case .food: return "pencil"
        case .weight: return "scalemass.fill"
        case .week: return "calendar"
        }
    }

    var color: Color {
        switch self {
        case .bedtime: return Palette.fat
        case .water: return Palette.blue
        case .meals: return Palette.carbs
        case .workout: return Palette.amberBar
        case .food: return Palette.green
        case .weight: return Palette.coffee
        case .week: return Palette.indigo
        }
    }

    /// Its on/off key in Reminders (also the base of its days key).
    var key: String {
        switch self {
        case .bedtime: return Reminders.bedtimeKey
        case .water: return Reminders.waterKey
        case .meals: return Reminders.mealsKey
        case .workout: return Reminders.workoutKey
        case .food: return Reminders.foodKey
        case .weight: return Reminders.weightKey
        case .week: return Reminders.weekKey
        }
    }
}

/// The days of the week as text: "každý den", "každé pondělí", "Po–Čt, Ne".
enum ReminderDays {
    /// Calendar weekdays, Monday first.
    static let order = [2, 3, 4, 5, 6, 7, 1]

    /// "Po", "Út" … in the app's language.
    static func short(_ weekday: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Fmt.locale
        let symbols = calendar.shortStandaloneWeekdaySymbols
        guard weekday >= 1, weekday <= symbols.count else { return "" }
        return Fmt.capitalized(symbols[weekday - 1].replacingOccurrences(of: ".", with: ""))
    }

    private static let single = ["každou neděli", "každé pondělí", "každé úterý", "každou středu", "každý čtvrtek", "každý pátek", "každou sobotu"]

    static func summary(_ days: Int) -> String {
        if days & Reminders.everyDay == Reminders.everyDay { return L10n.tr("každý den") }
        let chosen = order.filter { Reminders.has(days, $0) }
        if chosen.count == 1 { return L10n.tr(single[chosen[0] - 1]) }
        var parts: [String] = []
        var i = 0
        while i < order.count {
            if !Reminders.has(days, order[i]) {
                i += 1
                continue
            }
            var j = i
            while j + 1 < order.count && Reminders.has(days, order[j + 1]) { j += 1 }
            if j - i >= 2 {
                parts.append(short(order[i]) + "–" + short(order[j]))
            } else {
                for k in i...j { parts.append(short(order[k])) }
            }
            i = j + 1
        }
        return parts.joined(separator: ", ")
    }
}

struct NotificationsSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(Reminders.bedtimeKey) private var bedtime = true
    @AppStorage(Reminders.bedtimeModeKey) private var bedtimeMode = "sleep"
    @AppStorage(Reminders.bedtimeOffsetKey) private var bedtimeOffset = 30
    @AppStorage(Reminders.bedtimeTimeKey) private var bedtimeTime = 22 * 60
    @AppStorage(Reminders.workoutKey) private var workout = true
    @AppStorage(Reminders.waterKey) private var water = Reminders.isOn(Reminders.waterKey)
    @AppStorage(Reminders.mealsKey) private var meals = true
    @AppStorage(Reminders.weightKey) private var weight = false
    @AppStorage(Reminders.weightTimeKey) private var weightTime = 7 * 60
    @AppStorage(Reminders.weekKey) private var week = true
    @AppStorage(Reminders.weekTimeKey) private var weekTime = 19 * 60
    /// The morning readiness push from the server (PushRegistration.swift).
    @AppStorage(PushRegistration.morningKey) private var morning = true
    /// The coach's own message from the server (src/coach-push.js).
    @AppStorage(PushRegistration.coachKey) private var coach = true
    /// The two above say only what came, the app's reminders leave their numbers out; opened they show it all.
    @AppStorage(PushRegistration.hideValuesKey) private var hideValues = true
    @State private var allowed: Bool?
    /// Product news by e-mail as the server holds it; the row shows once it is known.
    @State private var newsEmails: Bool?
    /// Bumped by every change, so the reminders are planned again once (and
    /// the days, read straight from UserDefaults, are shown anew).
    @State private var revision = 0
    @State private var editing: ReminderKind?
    @Environment(\.scenePhase) private var scenePhase

    /// The concept's order (Settings → Notifications, 2026-11-19): the week
    /// plan's evening reminder of the day ("Zapsat den") lives in the meals' sheet.
    private static let rows: [ReminderKind] = [.workout, .meals, .water, .bedtime, .weight, .week]

    var body: some View {
        SettingsPage(title: "Oznámení", hero: allowed == true ? SettingsHero(systemImage: "bell", color: Palette.rust, text: heroText) : nil) {
            if allowed == false { NotificationsOffCard() }
            SettingsGroup(title: "Od kouče") {
                SettingsToggle(title: "Ranní připravenost", subtitle: "Po probuzení, až se data synchronizují", isOn: $morning)
                SettingsDivider()
                if coachLocked {
                    // Without Pro the coach's own messages are not for this account (the server stops them too).
                    SettingsToggle(title: "Zprávy kouče", subtitle: "Součást Aurin Pro", isOn: .constant(false), disabled: true)
                } else {
                    SettingsToggle(title: "Zprávy kouče", subtitle: "Tipy od kouče, nejvýš jednou denně. Odpovědi přijdou vždy.", isOn: $coach)
                }
            }
            .opacity(allowed == false ? 0.5 : 1)
            SettingsGroup(title: "Připomínky") {
                ForEach(Array(Self.rows.enumerated()), id: \.element.id) { index, kind in
                    if index > 0 { SettingsDivider() }
                    ReminderListRow(title: kind.name, detail: detail(kind), isOn: isOn(kind)) { editing = kind }
                }
                // The pill: only with cycle tracking on and the pill chosen.
                if let cycle = model.cycle, cycle.enabled, let settings = cycle.settings, settings.contraception == "pill" {
                    SettingsDivider()
                    NavigationLink { PillReminderView() } label: {
                        SettingsRow(title: L10n.tr("Připomínka prášku"), subtitle: L10n.tr("Na zamčené obrazovce jako Denní připomínka"),
                                    value: settings.pillReminder ? ClockText.format(settings.pillReminderTime) : (settings.pillMissed ?? true) ? L10n.tr("jen vynechaný") : L10n.tr("vypnuto"))
                    }
                    .buttonStyle(.plain)
                }
            }
            .opacity(allowed == false ? 0.5 : 1)
            SettingsGroup(title: "Soukromí") {
                SettingsToggle(title: "Skrýt zdravotní údaje v oznámeních", subtitle: privacyCaption, isOn: $hideValues)
            }
            if !model.demo {
                // Always there (the alert and the setup point here); off and disabled until the server answers.
                SettingsGroup(title: "E-mail") {
                    SettingsToggle(title: "Novinky e-mailem", subtitle: "O nových funkcích Aurinu. Odhlásit se dá i odkazem v každém e-mailu.",
                                   isOn: Binding(get: { newsEmails ?? false }, set: { wanted in
                                       self.newsEmails = wanted
                                       Task {
                                           do { try await model.api.setProductEmails(wanted) } catch { self.newsEmails = !wanted }
                                       }
                                   }), disabled: newsEmails == nil)
                }
            }
        }
        .sheet(item: $editing) { kind in
            ReminderEditSheet(kind: kind)
        }
        // Skrýt zdravotní údaje as another iPhone of the account set it.
        .task { await PushRegistration.adoptAccountChoice(api: model.api) }
        // Never asked counts as off here; turning it on is the yes.
        .task { if !model.demo, let chosen = try? await model.api.productEmailsChoice() { newsEmails = chosen ?? false } }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in revision += 1 }
        // Back from iPhone Settings: the off card goes once notifications are on.
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await check() } } }
        .task(id: revision) {
            if revision > 0 {
                try? await Task.sleep(for: .milliseconds(400))
                if Task.isCancelled { return }
            }
            await check()
            if revision > 0, let today = model.today { await Reminders.reschedule(from: today) }
        }
    }

    /// The lock screen widgets ask for the phone's own unlock (the concept names Face ID).
    private var privacyCaption: String {
        switch LAContext().biometryType {
        case .faceID: return L10n.tr("Widgety na zamčené obrazovce ukážou čísla po odemknutí Face ID.")
        case .touchID: return L10n.tr("Widgety na zamčené obrazovce ukážou čísla po odemknutí Touch ID.")
        default: return L10n.tr("Widgety na zamčené obrazovce ukážou čísla po odemknutí.")
        }
    }

    /// Without Pro (the paywall on), the coach's messages are not sent.
    private var coachLocked: Bool { model.coachLocked && !ProStore.shared.entitled }

    // MARK: The values shown

    /// "Coach and reminders are on. Notifications show no numbers.": how the page is set now.
    private var heroText: String {
        let fromCoach = morning || (coach && !coachLocked)
        let reminders = Self.rows.contains { isOn($0).wrappedValue }
        let first = fromCoach && reminders ? L10n.tr("Kouč i připomínky jsou zapnuté.")
            : fromCoach ? L10n.tr("Kouč je zapnutý, připomínky vypnuté.")
            : reminders ? L10n.tr("Připomínky jsou zapnuté, kouč vypnutý.")
            : L10n.tr("Kouč i připomínky jsou vypnuté.")
        return first + "\n" + (hideValues ? L10n.tr("Oznámení neukazují čísla.") : L10n.tr("Oznámení ukazují tvoje čísla."))
    }

    private func days(_ kind: ReminderKind) -> Int {
        _ = revision
        return Reminders.days(kind.key)
    }

    /// The line under a reminder's name: what it does, in the concept's words.
    private func detail(_ kind: ReminderKind) -> String? {
        let chosen = days(kind)
        let summary = Fmt.capitalized(ReminderDays.summary(chosen))
        let limited = chosen & Reminders.everyDay != Reminders.everyDay
        switch kind {
        case .workout:
            return limited ? L10n.tr("1 h předem") + ", " + ReminderDays.summary(chosen) : L10n.tr("1 h předem")
        case .meals:
            return L10n.tr("Nejvýš 2 připomenutí, když jídlo chybí")
        case .water:
            return limited ? summary : nil
        case .bedtime:
            if bedtimeMode == "custom" { return (limited ? summary + ", " : "") + L10n.f("V %@", Reminders.clock(bedtimeTime)) }
            return (limited ? summary + ", " : "") + L10n.f("%@ před spaním", Fmt.duration(bedtimeOffset))
        case .weight:
            return dayPart(chosen, at: weightTime) ?? summary + ", " + Reminders.clock(weightTime)
        case .week:
            return dayPart(chosen, at: weekTime) ?? summary + ", " + Reminders.clock(weekTime)
        case .food:
            return nil
        }
    }

    /// One day: "Monday morning", "Sunday evening" (the concept's words); the time is in the sheet.
    private func dayPart(_ days: Int, at minute: Int) -> String? {
        let chosen = ReminderDays.order.filter { Reminders.has(days, $0) }
        guard chosen.count == 1 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = L10n.locale
        let name = Fmt.capitalized(calendar.standaloneWeekdaySymbols[chosen[0] - 1])
        let part = minute < 12 * 60 ? L10n.tr("ráno") : minute < 17 * 60 ? L10n.tr("odpoledne") : L10n.tr("večer")
        return name + " " + part
    }

    private func isOn(_ kind: ReminderKind) -> Binding<Bool> {
        switch kind {
        case .bedtime: return $bedtime
        case .water: return $water
        case .meals: return $meals
        case .workout: return $workout
        case .weight: return $weight
        case .week: return $week
        case .food: return .constant(Reminders.isOn(Reminders.foodKey))
        }
    }

    private func check() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .notDetermined, bedtime || workout || water || meals || weight || week || morning || coach {
            allowed = await Reminders.requestPermission()
        } else {
            allowed = status == .authorized || status == .provisional
        }
        // The permission or the Ranní připravenost or Kouč switch may have changed:
        // the push token is sent or taken off the server.
        await PushRegistration.refresh(api: model.api)
    }
}

/// Notifications turned off for Aurin in iPhone Settings: a plain card with a
/// dark button that opens them (the concept's S2, no warning colour).
private struct NotificationsOffCard: View {
    var body: some View {
        // Side by side as drawn; text over the button at large text sizes.
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 14) {
                text
                Spacer(minLength: 8)
                button
            }
            VStack(alignment: .leading, spacing: 12) {
                text
                button
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Oznámení jsou vypnutá").font(.headline).foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Zapni je v Nastavení iPhonu, ať ti chodí připomínky a zprávy kouče.").font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var button: some View {
        Button {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        } label: {
            Text("Otevřít Nastavení").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                .lineLimit(1).fixedSize()
                .padding(.horizontal, 16).frame(minHeight: 44)
                .background(Palette.button, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// A reminder: its name and what it does; a tap opens its time and days, the switch turns it on or off.
private struct ReminderListRow: View {
    let title: String
    let detail: String?
    @Binding var isOn: Bool
    let open: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.tr(title)).font(.body).foregroundStyle(Palette.ink)
                    if let detail {
                        Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(Text("Otevře čas a dny."))
            Toggle(isOn: $isOn) { EmptyView() }
                .toggleStyle(AurinToggleStyle())
                .fixedSize()
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityLabel(Text(L10n.tr(title)))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 50)
    }
}

/// The sheet of one reminder: its time (or times) and days.
private struct ReminderEditSheet: View {
    let kind: ReminderKind
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Reminders.bedtimeModeKey) private var bedtimeMode = "sleep"
    @AppStorage(Reminders.bedtimeOffsetKey) private var bedtimeOffset = 30
    @AppStorage(Reminders.bedtimeTimeKey) private var bedtimeTime = 22 * 60
    @AppStorage(Reminders.workoutTimeKey) private var workoutTime = 16 * 60
    @AppStorage(Reminders.waterFromKey) private var waterFrom = 10 * 60
    @AppStorage(Reminders.waterToKey) private var waterTo = 16 * 60
    @AppStorage(Reminders.waterEveryKey) private var waterEvery = 3 * 60
    @AppStorage(Reminders.waterModeKey) private var waterMode = "every"
    @AppStorage(Reminders.waterCountKey) private var waterCount = 4
    @AppStorage(Reminders.foodTimeKey) private var foodTime = 20 * 60 + 30
    @AppStorage(Reminders.foodKey) private var food = true
    @AppStorage(Reminders.weightTimeKey) private var weightTime = 7 * 60
    @AppStorage(Reminders.weekTimeKey) private var weekTime = 19 * 60
    @AppStorage private var days: Int

    init(kind: ReminderKind) {
        self.kind = kind
        _days = AppStorage(wrappedValue: Reminders.defaultDays(kind.key), Reminders.daysKey(kind.key))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                content
                ReminderWeekdayChips(days: $days)
            }
            .padding(20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .glassSheetBackground(Palette.card)
        .tint(Palette.ink)
    }

    private var detents: Set<PresentationDetent> {
        kind == .meals || kind == .water ? [.large] : [.fraction(0.62), .large]
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: kind.symbol)
                .scaledFont(17, weight: .semibold, cap: .denseCap)
                .foregroundStyle(kind.color)
                .frame(width: 40, height: 40)
                .background(kind.color.opacity(0.18), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .accessibilityHidden(true)
            Text(kind.name)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Button("Hotovo") { dismiss() }
                .font(.body.weight(.semibold))
                .foregroundStyle(Palette.amber)
        }
    }

    @ViewBuilder private var content: some View {
        switch kind {
        case .bedtime:
            Picker("", selection: $bedtimeMode) {
                Text("Podle spánku").tag("sleep")
                Text("Vlastní čas").tag("custom")
            }
            .pickerStyle(.segmented)
            if bedtimeMode == "custom" {
                ReminderWheel(minutes: $bedtimeTime)
            } else {
                Picker("Předem", selection: $bedtimeOffset) {
                    Text(verbatim: "15 min").tag(15)
                    Text(verbatim: "30 min").tag(30)
                    Text(verbatim: "45 min").tag(45)
                    Text(verbatim: "1 h").tag(60)
                }
                .pickerStyle(.segmented)
            }
        case .water:
            VStack(spacing: 0) {
                ReminderTimeRow(title: "Od", minutes: $waterFrom)
                SettingsDivider()
                ReminderTimeRow(title: "Do", minutes: $waterTo)
            }
            .background(Palette.settingsBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            Picker("", selection: $waterMode) {
                Text("Počet").tag("count")
                Text("Interval").tag("every")
            }
            .pickerStyle(.segmented)
            if waterMode == "count" {
                Picker("", selection: $waterCount) {
                    ForEach([2, 3, 4, 5, 6, 8], id: \.self) { n in
                        Text(verbatim: "\(n)×").tag(n)
                    }
                }
                .pickerStyle(.segmented)
            } else {
                Picker("", selection: $waterEvery) {
                    ForEach([60, 120, 180, 240], id: \.self) { m in
                        Text(verbatim: "\(m / 60) h").tag(m)
                    }
                }
                .pickerStyle(.segmented)
            }
        case .meals:
            VStack(spacing: 0) {
                ForEach(Array(Reminders.meals.enumerated()), id: \.offset) { index, meal in
                    if index > 0 { SettingsDivider() }
                    MealReminderRow(meal: meal)
                }
            }
            .background(Palette.settingsBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            // The evening's "log what you ate", only while the day is still empty.
            VStack(spacing: 0) {
                SettingsToggle(title: "Večer zapsat den", subtitle: "Jen když ještě nic není zapsané", isOn: $food)
                if food {
                    SettingsDivider()
                    ReminderTimeRow(title: "Připomenout v", minutes: $foodTime)
                }
            }
            .background(Palette.settingsBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        case .workout:
            ReminderWheel(minutes: $workoutTime)
        case .food:
            ReminderWheel(minutes: $foodTime)
        case .weight:
            ReminderWheel(minutes: $weightTime)
        case .week:
            ReminderWheel(minutes: $weekTime)
        }
    }
}

/// Po–Ne chips; at least one day stays chosen. Also the alarm's days (Spánek).
struct ReminderWeekdayChips: View {
    @Binding var days: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(ReminderDays.order, id: \.self) { weekday in
                let on = Reminders.has(days, weekday)
                Button { toggle(weekday) } label: {
                    Text(verbatim: ReminderDays.short(weekday))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(on ? Palette.onButton : Palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background { Capsule().fill(on ? Palette.button : Palette.track) }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    private func toggle(_ weekday: Int) {
        let bit = 1 << (weekday - 1)
        let next = (days & Reminders.everyDay) ^ bit
        if next != 0 { days = next }
    }
}

/// One meal's reminder: on or off, and its time when on.
private struct MealReminderRow: View {
    let meal: (id: String, title: String, time: Int, on: Bool)
    @AppStorage private var on: Bool
    @AppStorage private var time: Int

    init(meal: (id: String, title: String, time: Int, on: Bool)) {
        self.meal = meal
        _on = AppStorage(wrappedValue: meal.on, Reminders.mealKey(meal.id))
        _time = AppStorage(wrappedValue: meal.time, Reminders.mealTimeKey(meal.id))
    }

    var body: some View {
        SettingsToggle(title: meal.title, isOn: $on)
        if on {
            SettingsDivider()
            ReminderTimeRow(title: "Obvykle v", minutes: $time)
        }
    }
}

/// "Od 10:00" with a compact time picker.
private struct ReminderTimeRow: View {
    let title: String
    @Binding var minutes: Int

    var body: some View {
        HStack {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            DatePicker("", selection: reminderDate($minutes), displayedComponents: .hourAndMinute)
                .labelsHidden()
                .environment(\.locale, Fmt.locale)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 50)
    }
}

/// The big time wheel of the sheet.
private struct ReminderWheel: View {
    @Binding var minutes: Int

    var body: some View {
        DatePicker("", selection: reminderDate($minutes), displayedComponents: .hourAndMinute)
            .datePickerStyle(.wheel)
            .labelsHidden()
            .frame(maxWidth: .infinity)
            .environment(\.locale, Fmt.locale)
    }
}

/// A clock time stored as minutes after midnight, as a Date for DatePicker.
private func reminderDate(_ minutes: Binding<Int>) -> Binding<Date> {
    Binding(
        get: { Calendar.current.date(bySettingHour: minutes.wrappedValue / 60, minute: minutes.wrappedValue % 60, second: 0, of: Date()) ?? Date() },
        set: { date in
            let c = Calendar.current.dateComponents([.hour, .minute], from: date)
            minutes.wrappedValue = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        }
    )
}
