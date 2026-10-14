import SwiftUI
import UIKit
import UserNotifications

// Settings → Oznámení: a day overview on top (the reminders on a 6:00–23:00
// line), then one row per reminder like the Clock app's alarms. A row opens a
// sheet with its time and days. Everything is stored in UserDefaults under the
// Reminders keys, and the reminders are planned again after every change.

/// One reminder of the list.
enum ReminderKind: String, CaseIterable, Identifiable {
    case bedtime, water, meals, workout, food, weight, week

    var id: String { rawValue }

    var name: String {
        switch self {
        case .bedtime: return "Do postele"
        case .water: return "Pití"
        case .meals: return "Jídlo"
        case .workout: return "Trénink"
        case .food: return "Zapsat den"
        case .weight: return "Vážení"
        case .week: return "Plán na příští týden"
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

/// A row of the list: the big time and "Name · detail".
private struct ReminderLine: Identifiable {
    let kind: ReminderKind
    let time: String
    let detail: String
    /// For sorting by the time of day.
    let order: Int

    var id: String { kind.rawValue }
}

/// A circle on the day overview.
private struct ReminderMark: Identifiable {
    let id: String
    let minute: Int
    let kind: ReminderKind
    let on: Bool
}

private struct MealState {
    let id: String
    let time: Int
    let on: Bool
}

struct NotificationsSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(Reminders.bedtimeKey) private var bedtime = true
    @AppStorage(Reminders.bedtimeModeKey) private var bedtimeMode = "sleep"
    @AppStorage(Reminders.bedtimeOffsetKey) private var bedtimeOffset = 30
    @AppStorage(Reminders.bedtimeTimeKey) private var bedtimeTime = 22 * 60
    @AppStorage(Reminders.workoutKey) private var workout = true
    @AppStorage(Reminders.workoutTimeKey) private var workoutTime = 16 * 60
    @AppStorage(Reminders.waterKey) private var water = true
    @AppStorage(Reminders.waterFromKey) private var waterFrom = 10 * 60
    @AppStorage(Reminders.waterToKey) private var waterTo = 16 * 60
    @AppStorage(Reminders.waterEveryKey) private var waterEvery = 3 * 60
    @AppStorage(Reminders.waterModeKey) private var waterMode = "every"
    @AppStorage(Reminders.waterCountKey) private var waterCount = 4
    @AppStorage(Reminders.mealsKey) private var meals = true
    @AppStorage(Reminders.foodKey) private var food = true
    @AppStorage(Reminders.foodTimeKey) private var foodTime = 20 * 60 + 30
    @AppStorage(Reminders.weightKey) private var weight = false
    @AppStorage(Reminders.weightTimeKey) private var weightTime = 7 * 60
    @AppStorage(Reminders.weekKey) private var week = false
    @AppStorage(Reminders.weekTimeKey) private var weekTime = 19 * 60
    /// The morning readiness push from the server (PushRegistration.swift).
    @AppStorage(PushRegistration.morningKey) private var morning = true
    /// The coach's own message from the server (src/coach-push.js).
    @AppStorage(PushRegistration.coachKey) private var coach = true
    @State private var allowed: Bool?
    /// Bumped by every change, so the reminders are planned again once (and
    /// the meals and days, read straight from UserDefaults, are shown anew).
    @State private var revision = 0
    @State private var editing: ReminderKind?

    var body: some View {
        SettingsPage(title: "Oznámení") {
            if allowed == false {
                SettingsGroup(footer: "Oznámení pro Aurin jsou v iPhonu vypnutá.") {
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    } label: { SettingsRow(title: "Otevřít nastavení iPhonu", titleColor: Palette.blue) }
                    .buttonStyle(.plain)
                }
            }
            ReminderDayOverview(marks: marks)
            SettingsGroup {
                ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                    if index > 0 { SettingsDivider() }
                    ReminderListRow(line: line, isOn: isOn(line.kind)) { editing = line.kind }
                }
            }
            SettingsGroup {
                SettingsToggle(title: "Ranní připravenost", isOn: $morning)
                SettingsDivider()
                SettingsToggle(title: "Kouč", subtitle: "Ozve se sám, nejvýš 1× denně", isOn: $coach)
            }
            // The pill: only with cycle tracking on and the pill chosen.
            if let cycle = model.cycle, cycle.enabled, let settings = cycle.settings, settings.contraception == "pill" {
                SettingsGroup {
                    NavigationLink { PillReminderView() } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "pills.fill", color: Palette.indigo), title: "Antikoncepce",
                                    value: settings.pillReminder ? ClockText.format(settings.pillReminderTime) : L10n.tr("vypnuto"))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(item: $editing) { kind in
            ReminderEditSheet(kind: kind)
        }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in revision += 1 }
        .task(id: revision) {
            if revision > 0 {
                try? await Task.sleep(for: .milliseconds(400))
                if Task.isCancelled { return }
            }
            await check()
            if revision > 0, let today = model.today { await Reminders.reschedule(from: today) }
        }
    }

    // MARK: The values shown

    private var mealStates: [MealState] {
        _ = revision
        return Reminders.meals.map { meal in
            MealState(id: meal.id, time: Reminders.minute(Reminders.mealTimeKey(meal.id), meal.time), on: Reminders.isOn(Reminders.mealKey(meal.id)))
        }
    }

    private func days(_ kind: ReminderKind) -> Int {
        _ = revision
        return Reminders.days(kind.key)
    }

    private var waterTimes: [Int] {
        Reminders.waterTimes(from: waterFrom, to: waterTo, mode: waterMode, every: waterEvery, count: waterCount)
    }

    /// The bedtime reminder's time: the chosen one, or tonight's bedtime minus
    /// the chosen minutes (nil while the night is not known).
    private var bedtimeMinute: Int? {
        if bedtimeMode == "custom" { return bedtimeTime }
        guard let bed = model.today?.tonight?.bedtime, let at = Reminders.minutes(bed) else { return nil }
        return (at - bedtimeOffset + 1440) % 1440
    }

    private var lines: [ReminderLine] {
        ReminderKind.allCases.map { line($0) }.sorted { $0.order < $1.order }
    }

    private func line(_ kind: ReminderKind) -> ReminderLine {
        let chosen = days(kind)
        let limited = chosen & Reminders.everyDay != Reminders.everyDay
        let summary = ReminderDays.summary(chosen)
        switch kind {
        case .bedtime:
            let detail = limited ? summary : L10n.tr(bedtimeMode == "custom" ? "každý den" : "podle spánku")
            if let at = bedtimeMinute {
                return ReminderLine(kind: kind, time: Reminders.clock(at), detail: detail, order: at < 4 * 60 ? at + 1440 : at)
            }
            return ReminderLine(kind: kind, time: Fmt.duration(bedtimeOffset), detail: detail, order: 1440)
        case .water:
            let detail = limited ? summary : L10n.f("%@× denně", String(waterTimes.count))
            return ReminderLine(kind: kind, time: hourText(waterFrom) + "–" + hourText(max(waterFrom, waterTo)), detail: detail, order: waterFrom)
        case .meals:
            let on = mealStates.filter { $0.on }.sorted { $0.time < $1.time }
            guard let first = on.first else {
                return ReminderLine(kind: kind, time: "–", detail: limited ? summary : "", order: 1441)
            }
            var parts: [String] = []
            if on.count > 1 {
                parts.append(L10n.f("a %@", on.dropFirst().map { Reminders.clock($0.time) }.joined(separator: ", ")))
            }
            if limited || on.count == 1 { parts.append(summary) }
            return ReminderLine(kind: kind, time: Reminders.clock(first.time), detail: parts.joined(separator: " · "), order: first.time)
        case .workout:
            return ReminderLine(kind: kind, time: Reminders.clock(workoutTime), detail: limited ? summary : L10n.tr("hodinu předem"), order: workoutTime)
        case .food:
            return ReminderLine(kind: kind, time: Reminders.clock(foodTime), detail: limited ? summary : L10n.tr("jen když chybí"), order: foodTime)
        case .weight:
            return ReminderLine(kind: kind, time: Reminders.clock(weightTime), detail: summary, order: weightTime)
        case .week:
            return ReminderLine(kind: kind, time: Reminders.clock(weekTime), detail: summary, order: weekTime)
        }
    }

    /// 600 → "10", 630 → "10:30".
    private func hourText(_ minute: Int) -> String {
        minute % 60 == 0 && !ClockText.isTwelveHour ? String(minute / 60) : Reminders.clock(minute)
    }

    /// Drinking on the upper lane, the rest below; the ones off first, so the
    /// coloured ones lie on top.
    private var marks: [ReminderMark] {
        var list: [ReminderMark] = []
        for (index, at) in waterTimes.enumerated() {
            list.append(ReminderMark(id: "water.\(index)", minute: at, kind: .water, on: water))
        }
        for meal in mealStates where meal.on {
            list.append(ReminderMark(id: "meal." + meal.id, minute: meal.time, kind: .meals, on: meals))
        }
        list.append(ReminderMark(id: "workout", minute: workoutTime, kind: .workout, on: workout))
        list.append(ReminderMark(id: "food", minute: foodTime, kind: .food, on: food))
        list.append(ReminderMark(id: "weight", minute: weightTime, kind: .weight, on: weight))
        list.append(ReminderMark(id: "week", minute: weekTime, kind: .week, on: week))
        if let at = bedtimeMinute {
            list.append(ReminderMark(id: "bedtime", minute: at, kind: .bedtime, on: bedtime))
        }
        return list.filter { !$0.on } + list.filter { $0.on }
    }

    private func isOn(_ kind: ReminderKind) -> Binding<Bool> {
        switch kind {
        case .bedtime: return $bedtime
        case .water: return $water
        case .meals: return $meals
        case .workout: return $workout
        case .food: return $food
        case .weight: return $weight
        case .week: return $week
        }
    }

    private func check() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .notDetermined, bedtime || workout || water || meals || food || weight || week || morning || coach {
            allowed = await Reminders.requestPermission()
        } else {
            allowed = status == .authorized || status == .provisional
        }
        // The permission or the Ranní připravenost or Kouč switch may have changed:
        // the push token is sent or taken off the server.
        await PushRegistration.refresh(api: model.api)
    }
}

/// The 6:00–23:00 line with the day's reminders.
private struct ReminderDayOverview: View {
    let marks: [ReminderMark]
    let start = 6 * 60
    let end = 23 * 60
    let size: CGFloat = 28

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .topLeading) {
                label("6:00", alignment: .leading).position(x: 30, y: 8)
                label("12:00", alignment: .center).position(x: xPosition(12 * 60, width), y: 8)
                label("18:00", alignment: .center).position(x: xPosition(18 * 60, width), y: 8)
                label("23:00", alignment: .trailing).position(x: width - 30, y: 8)
                Rectangle()
                    .fill(Palette.hairline)
                    .frame(width: width, height: 1)
                    .position(x: width / 2, y: 70)
                ForEach(marks) { mark in
                    dot(mark).position(x: xPosition(mark.minute, width), y: mark.kind == .water ? 44 : 96)
                }
            }
        }
        .frame(height: 112)
        .padding(16)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .accessibilityHidden(true)
    }

    private func label(_ text: String, alignment: Alignment) -> some View {
        Text(verbatim: text)
            .font(Typo.caption)
            .foregroundStyle(Palette.muted)
            .frame(width: 60, alignment: alignment)
    }

    /// A time after midnight (the bedtime reminder) sits at the end.
    private func xPosition(_ minute: Int, _ width: CGFloat) -> CGFloat {
        let clamped = minute < 3 * 60 ? end : min(max(minute, start), end)
        let fraction = CGFloat(clamped - start) / CGFloat(end - start)
        return size / 2 + fraction * max(0, width - size)
    }

    private func dot(_ mark: ReminderMark) -> some View {
        Image(systemName: mark.kind.symbol)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(mark.on ? Palette.onAccent : Palette.faint)
            .frame(width: size, height: size)
            .background(Circle().fill(mark.on ? mark.kind.color : Palette.track))
    }
}

/// "22:10 / Do postele · podle spánku" and the switch; dimmed when off.
private struct ReminderListRow: View {
    let line: ReminderLine
    @Binding var isOn: Bool
    let open: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: line.time)
                        .font(Typo.number(40))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(verbatim: subtitle)
                        .font(Typo.small)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(isOn ? 1 : 0.45)
            Toggle(isOn: $isOn) { EmptyView() }
                .toggleStyle(LoadwiseToggleStyle())
                .fixedSize()
                .accessibilityLabel(Text(line.kind.name))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var subtitle: String {
        let name = L10n.tr(line.kind.name)
        return line.detail.isEmpty ? name : name + " · " + line.detail
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
        .presentationBackground(Palette.card)
        .tint(Palette.ink)
    }

    private var detents: Set<PresentationDetent> {
        kind == .meals || kind == .water ? [.large] : [.fraction(0.62), .large]
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: kind.symbol)
                .font(.system(size: 17, weight: .semibold))
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

/// Po–Ne chips; at least one day stays chosen.
private struct ReminderWeekdayChips: View {
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
                        .background(Capsule().fill(on ? Palette.button : Palette.track))
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
            ReminderTimeRow(title: "Připomenout v", minutes: $time)
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
