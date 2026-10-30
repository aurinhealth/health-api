import SwiftUI

// The plan's free time and days: the time by weekday (the same every week or
// two weeks in turn for shift work), the time of this week only, the plan's
// days from this week or the next, and the running plan's "Upravit" tiles.
// The server (src/training-plans.js, planPreview) treats the time as a
// ceiling: the plan uses what fitness allows and works up to it.

// MARK: - The time of a day

enum FreeTime {
    /// Off, a length, or no limit (nil).
    static let choices: [Int?] = [0, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, nil]

    static func label(_ minutes: Int?) -> String {
        guard let minutes else { return L10n.tr("bez omezení") }
        return minutes == 0 ? L10n.tr("volno") : planDuration(minutes)
    }

    /// "6 h 30" for the days with a time, "+" when a day has no limit.
    static func total(_ list: [Int?], days: [Int]? = nil) -> String {
        let picked: [Int?] = (days ?? Array(list.indices)).filter { list.indices.contains($0) }.map { list[$0] }
        let sum = picked.reduce(0) { $0 + ($1 ?? 0) }
        let open = picked.contains { $0 == nil }
        return sum == 0 && open ? L10n.tr("bez omezení") : planDuration(sum) + (open ? "+" : "")
    }

    /// The full weekday names, Monday first ("pondělí", "Monday").
    static var weekdayNames: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Fmt.locale
        let names = calendar.standaloneWeekdaySymbols
        let monday = Array(names.dropFirst()) + names.prefix(1)
        return monday.map { $0.prefix(1).uppercased(with: Fmt.locale) + $0.dropFirst() }
    }

    /// The Monday of a day's week (2026-10-12 is a Monday).
    static func monday(_ iso: String) -> String {
        guard let a = ISODay.date("2026-10-12"), let b = ISODay.date(iso) else { return iso }
        let days = Int((b.timeIntervalSince(a) / 86400).rounded())
        return ISODay.shift(iso, -(((days % 7) + 7) % 7))
    }

    /// With two weeks in turn: true when the week of `iso` is a week B
    /// (`alternate` is a Monday of a week A), as the server counts it.
    static func isWeekB(_ iso: String, alternate: String?) -> Bool {
        guard let alternate, let a = ISODay.date(alternate), let b = ISODay.date(monday(iso)) else { return false }
        let weeks = Int((b.timeIntervalSince(a) / (7 * 86400)).rounded())
        return ((weeks % 2) + 2) % 2 == 1
    }

    /// The minutes as the server takes them: a number or null for each weekday.
    static func json(_ list: [Int?]) -> JSONValue {
        .array(list.map { $0.map { .number(Double($0)) } ?? .null })
    }
}

/// Seven rows, each weekday with its free time to pick from a menu.
struct FreeTimeEditor: View {
    @Binding var minutes: [Int?]
    /// The plan's days stand out; the rest are greyer.
    var highlight: [Int] = []

    var body: some View {
        SettingsGroup {
            ForEach(0..<7, id: \.self) { i in
                if i > 0 { SettingsDivider() }
                HStack(spacing: 12) {
                    Text(verbatim: FreeTime.weekdayNames[i]).font(.body)
                        .foregroundStyle(highlight.isEmpty || highlight.contains(i) ? Palette.ink : Palette.muted)
                        .lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 8)
                    Menu {
                        Picker(FreeTime.weekdayNames[i], selection: binding(i)) {
                            ForEach(Array(FreeTime.choices.enumerated()), id: \.offset) { _, m in
                                Text(verbatim: FreeTime.label(m)).tag(m)
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(verbatim: FreeTime.label(minutes[i])).font(.body)
                                .foregroundStyle(minutes[i] == 0 ? Palette.muted : Palette.ink).lineLimit(1)
                            Image(systemName: "chevron.up.chevron.down").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                        }
                    }
                    .accessibilityLabel(FreeTime.weekdayNames[i] + ", " + FreeTime.label(minutes[i]))
                }
                .padding(.horizontal, 16).frame(minHeight: 48)
            }
        }
    }

    private func binding(_ i: Int) -> Binding<Int?> {
        Binding(get: { minutes[i] }, set: { minutes[i] = $0 })
    }
}

// MARK: - The usual week

/// "Volný čas": the time by weekday, the same every week or two weeks in turn
/// (shift work), which week is this one. Saved for every plan and the week planner.
struct FreeTimeForm: View {
    @Environment(AppModel.self) private var model
    let time: PlanPreview.Time?
    var planDays: [Int] = []
    var saved: () -> Void = {}
    @State private var a: [Int?] = Array(repeating: nil, count: 7)
    @State private var b: [Int?] = Array(repeating: nil, count: 7)
    @State private var twoWeeks = false
    @State private var editingB = false
    @State private var thisWeekB = false
    @State private var busy = false
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Týdny", selection: $twoWeeks) {
                Text("Každý týden stejně").tag(false)
                Text("Dva týdny po sobě").tag(true)
            }
            .pickerStyle(.segmented)
            if twoWeeks {
                Picker("Týden", selection: $editingB) {
                    Text("Týden A").tag(false)
                    Text("Týden B").tag(true)
                }
                .pickerStyle(.segmented)
            }
            FreeTimeEditor(minutes: editingB && twoWeeks ? $b : $a, highlight: planDays)
            HStack {
                Text("Celkem").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: FreeTime.total(editingB && twoWeeks ? b : a, days: planDays.isEmpty ? nil : planDays))
                    .font(Typo.number(20)).foregroundStyle(Palette.ink)
            }
            .padding(.horizontal, 4)
            if twoWeeks {
                SettingsGroup {
                    Toggle(isOn: $thisWeekB) { Text("Tento týden je týden B").font(.body).foregroundStyle(Palette.ink) }
                        .tint(Palette.green)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                }
            }
            Text("Čas je strop. Plán využije tolik, kolik dovolí tvoje kondice, a k víc času se dopracuje postupně.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            PrimaryButton(title: L10n.tr("Uložit"), busy: busy) { Task { await save() } }
                .disabled(busy || model.demo)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if let time {
                a = Array(time.days.prefix(7)) + Array(repeating: nil, count: max(0, 7 - time.days.count))
                if let daysB = time.daysB {
                    b = Array(daysB.prefix(7)) + Array(repeating: nil, count: max(0, 7 - daysB.count))
                    twoWeeks = true
                    thisWeekB = FreeTime.isWeekB(APIClient.localToday(), alternate: time.alternate)
                } else {
                    b = a
                }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        var body: JSONObject = ["action": .string("freeTime"), "availability": FreeTime.json(a)]
        if twoWeeks {
            body["availabilityB"] = FreeTime.json(b)
            body["thisWeekB"] = .bool(thisWeekB)
        }
        do {
            _ = try await model.api.trainingPlanAction(body)
            await model.refreshTraining()
            error = nil
            saved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct FreeTimeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let time: PlanPreview.Time?
    var planDays: [Int] = []
    var saved: () -> Void = {}

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Volný čas") {
                FreeTimeForm(time: time, planDays: planDays) { saved(); dismiss() }
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } } }
        }
    }
}

// MARK: - This week only

/// "Čas tento týden": the time of this week's days only (a trip, a busy
/// week); back to the usual week any time. Fewer days this week below.
struct TimeThisWeekSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let week: PlanWeekDetail
    var planDays: [Int] = []
    var usual: Int = 0
    @State private var minutes: [Int?] = Array(repeating: nil, count: 7)
    @State private var fewer = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Čas tento týden") {
                Text(verbatim: Fmt.dayMonth(week.monday) + "–" + Fmt.dayMonth(ISODay.shift(week.monday, 6)) + (week.time?.weekB == true ? " · " + L10n.tr("Týden B") : ""))
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                FreeTimeEditor(minutes: $minutes, highlight: planDays)
                HStack {
                    Text("Celkem").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Text(verbatim: FreeTime.total(minutes, days: planDays.isEmpty ? nil : planDays)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                }
                .padding(.horizontal, 4)
                Text("Platí jen pro tento týden. Klíčové tréninky zůstanou, lehké se zkrátí nebo vypadnou.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr("Upravit týden"), busy: busy) { Task { await save(FreeTime.json(minutes)) } }
                    .disabled(busy || model.demo)
                HStack(spacing: 20) {
                    if week.time?.own == true {
                        Button { Task { await save(.null) } } label: { Text("Zpět na obvyklý týden").font(Typo.bodyStrong).foregroundStyle(Palette.amber) }
                            .buttonStyle(.plain)
                    }
                    Button { fewer = true } label: { Text("Méně dní tento týden").font(Typo.bodyStrong).foregroundStyle(Palette.amber) }
                        .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } } }
            .sheet(isPresented: $fewer, onDismiss: { dismiss() }) { WeekDaysSheet(week: week, usual: usual) }
        }
        .onAppear { if let days = week.time?.days, days.count == 7 { minutes = days } }
    }

    private func save(_ value: JSONValue) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.api.trainingPlanAction(["action": .string("weekTime"), "minutes": value])
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - The plan's days

/// "Dny a čas": the weekdays of the plan's sport, from this week or from the
/// next one (this week keeps its days), and the free time by weekday.
struct DaysAndTimeSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let sport: String
    /// The fewest and most days a week the plan takes.
    let range: ClosedRange<Int>
    let initial: [Int]
    let time: PlanPreview.Time?
    /// The long ride's or run's day: own or picked from the free time.
    var long: PlanPreview.Long? = nil
    @State private var days: [Int] = []
    @State private var nextWeek = true
    /// The own long day; nil: automatic (the day with the most free time).
    @State private var longDay: Int?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Dny a čas") {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: sport == "run" ? "Dny běhu" : sport == "gym" ? "Dny v posilovně" : "Dny na kole")
                    PlanDayChips(days: days, toggle: toggle)
                    Text(verbatim: L10n.f("Tento plán má %@ dní týdně.", range.lowerBound == range.upperBound ? String(range.lowerBound) : "\(range.lowerBound)–\(range.upperBound)"))
                        .font(Typo.caption).foregroundStyle(days.count < range.lowerBound || days.count > range.upperBound ? Palette.rust : Palette.muted)
                }
                Picker("Od", selection: $nextWeek) {
                    Text("Od tohoto týdne").tag(false)
                    Text("Od příštího týdne").tag(true)
                }
                .pickerStyle(.segmented)
                NavigationLink {
                    SettingsPage(title: "Volný čas") { FreeTimeForm(time: time, planDays: days) }
                } label: {
                    HStack(spacing: 12) {
                        Text("Volný čas").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        Text(verbatim: time.map { FreeTime.total($0.days, days: days) } ?? "–").font(.body).foregroundStyle(Palette.muted)
                        Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 52)
                    .cardSurface(cornerRadius: 22)
                }
                .buttonStyle(.plain)
                // Ride and run plans only: a swim or triathlon plan picks its own long days.
                if ["ride", "run"].contains(sport) {
                    NavigationLink {
                        LongDayPicker(sport: sport, days: days, time: time, auto: long?.auto.flatMap { days.contains($0) ? $0 : nil }, selection: $longDay)
                    } label: { longRow }
                    .buttonStyle(.plain)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr("Uložit"), busy: busy) { Task { await save() } }
                    .disabled(busy || model.demo || !range.contains(days.count))
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } } }
        }
        .onAppear {
            if days.isEmpty { days = initial }
            if long?.own == true { longDay = long?.day }
        }
    }

    /// "Long run · Automatic, now Saturday" or the chosen day.
    private var longRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(sport == "run" ? "Dlouhý běh" : "Dlouhá jízda")).font(.body).foregroundStyle(Palette.ink)
                if longDay == nil, let auto = long?.auto, days.contains(auto) {
                    Text(verbatim: L10n.f("teď %@, nejvíc volného času", FreeTime.weekdayNames[auto])).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Text(verbatim: longDay.map { FreeTime.weekdayNames[$0] } ?? L10n.tr("Automaticky")).font(.body).foregroundStyle(Palette.muted).lineLimit(1)
            Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(.horizontal, 16).frame(minHeight: 56)
        .cardSurface(cornerRadius: 22)
    }

    private func toggle(_ i: Int) {
        if days.contains(i) { if days.count > 1 { days.removeAll { $0 == i } } } else { days = (days + [i]).sorted() }
        // A long day that is no longer a training day goes back to automatic.
        if let d = longDay, !days.contains(d) { longDay = nil }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            var body: JSONObject = ["action": .string("days"), "sport": .string(sport), "days": .array(days.map { .number(Double($0)) }), "from": .string(nextWeek ? "next" : "now")]
            if ["ride", "run"].contains(sport) { body["longDay"] = longDay.map { .number(Double($0)) } ?? .null }
            _ = try await model.api.trainingPlanAction(body)
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Dlouhý běh": automatic (the day with the most free time) or one of the plan's days.
struct LongDayPicker: View {
    let sport: String
    let days: [Int]
    let time: PlanPreview.Time?
    let auto: Int?
    @Binding var selection: Int?

    var body: some View {
        SettingsPage(title: sport == "run" ? "Dlouhý běh" : "Dlouhá jízda") {
            Text(sport == "run" ? "Nabízím jen tvoje dny běhu. Den před dlouhým během plán nedá klíčový trénink." : "Nabízím jen tvoje dny na kole. Den před dlouhou jízdou plán nedá klíčový trénink.")
                .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            SettingsGroup {
                row(nil, title: L10n.tr("Automaticky"), subtitle: auto.map { L10n.f("teď %@, nejvíc volného času", FreeTime.weekdayNames[$0]) }, value: nil)
                ForEach(days, id: \.self) { d in
                    SettingsDivider()
                    row(d, title: FreeTime.weekdayNames[d], subtitle: nil, value: time.map { FreeTime.label($0.days.indices.contains(d) ? $0.days[d] : nil) })
                }
            }
            if let d = selection, let minutes = time?.days.indices.contains(d) == true ? time?.days[d] : nil, minutes > 0 {
                Text(verbatim: L10n.f("%@ má %@: dlouhý trénink se do toho vejde, dokud dni nepřidáš víc času.", FreeTime.weekdayNames[d], planDuration(minutes)))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
            }
        }
    }

    private func row(_ day: Int?, title: String, subtitle: String?, value: String?) -> some View {
        Button { selection = day } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: title).font(.body).foregroundStyle(Palette.ink)
                    if let subtitle { Text(verbatim: subtitle).font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                Spacer(minLength: 8)
                if let value { Text(verbatim: value).font(.body).foregroundStyle(Palette.muted) }
                Image(systemName: "checkmark").scaledFont(14, weight: .semibold).foregroundStyle(Palette.amber)
                    .opacity(selection == day ? 1 : 0)
            }
            .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selection == day ? .isSelected : [])
    }
}

/// Seven weekday chips; days the plan adds on its own are dashed until chosen.
struct PlanDayChips: View {
    let days: [Int]
    var added: [Int] = []
    let toggle: (Int) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                let on = days.contains(i), auto = on && added.contains(i)
                Button { toggle(i) } label: {
                    Text(Fmt.weekdaysFromMonday[i]).font(.footnote.weight(.semibold))
                        .foregroundStyle(auto ? Palette.amber : on ? Palette.onAccent : Palette.muted)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(auto ? Palette.amberSoft : on ? Palette.amberBar : Palette.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay {
                            if auto {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder(Palette.amberBar, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(FreeTime.weekdayNames[i] + (auto ? ", " + L10n.tr("navrženo") : ""))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// Time is short for the plan: what it keeps and what gets shorter, once.
struct PlanTimeNote: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "clock.badge.exclamationmark").scaledFont(16, weight: .medium, cap: .denseCap).foregroundStyle(Palette.amber)
                .frame(width: 30, height: 30).background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .cardSurface(cornerRadius: 18)
    }
}

// MARK: - The running plan's tiles

/// One "Upravit" tile: a symbol, a one-line title and up to two lines under it.
struct PlanAdjustTile: View {
    let symbol: String
    let title: String
    let subtitle: String
    var color: Color = Palette.amber
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol).scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(color)
                    .frame(width: 28, height: 28).background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: title).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.75)
                    Text(verbatim: subtitle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .cardSurface(cornerRadius: 18)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityElement(children: .combine)
    }
}

/// The tiles two in a row, one in a row at the largest text sizes.
struct PlanAdjustGrid<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder var content: Content

    var body: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: typeSize.isAccessibilitySize ? 1 : 2)
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) { content }
    }
}

// MARK: - The gym plan's week

/// A gym plan: sessions a week (2–7) and each day with its part of the body and its time.
struct GymWeekCard: View {
    let gym: PlanPreview.Gym
    let choose: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Tréninků týdně")
            HStack(spacing: 6) {
                ForEach(2...7, id: \.self) { n in
                    let on = n == gym.perWeek
                    Button { choose(n) } label: {
                        Text(verbatim: "\(n)×").font(Typo.number(17))
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("%@× týdně", String(n)))
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            SettingsGroup(title: gym.split) {
                ForEach(Array(gym.days.enumerated()), id: \.element.id) { index, d in
                    if index > 0 { SettingsDivider() }
                    HStack(spacing: 12) {
                        Text(verbatim: Fmt.weekdaysFromMonday[d.day]).font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(width: 30, alignment: .leading)
                        Text(verbatim: d.label.prefix(1).uppercased(with: Fmt.locale) + d.label.dropFirst()).font(.body).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.85)
                        Spacer(minLength: 8)
                        Text(verbatim: planDuration(d.minutes)).font(.body).foregroundStyle(d.minutes < 30 ? Palette.rust : Palette.muted)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 46)
                }
            }
            Text("Délka tréninku podle volného času toho dne, nejvýš 90 minut.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
            if let note = gym.note { PlanTimeNote(text: note) }
        }
    }
}
