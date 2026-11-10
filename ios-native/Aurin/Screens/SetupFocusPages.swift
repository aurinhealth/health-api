import SwiftUI

// The first-run setup's training pages after "O tobě" (SetupFlowView): the
// sports (several may be main), the goal and the time on each weekday. They ask what "Zaměření"
// (FocusSheet) asks and save it the same way (the profile and the usual week),
// so the first Aktivita dne and the first proposals already know them. Each
// page can be skipped; the card on Training stays for whoever does.

/// What the three pages chose, against what the server had, so only a change is saved.
struct SetupFocus: Equatable {
    var sports = SportsChoice()
    var goal = ""
    var swims100: Bool?
    var eventName = ""
    var eventDate: Date?
    var distance = RaceDistance()
    /// "Kolik hodin týdně teď trénuješ?": nil while not answered, 0 for "not now".
    var weeklyHours: Double?

    /// From the saved profile (an earlier start on the web, or Zaměření).
    init(profile: JSONObject = [:]) {
        sports = SportsChoice(profile: profile)
        let text = profile["sportGoal"]?.string ?? ""
        goal = FocusChoice.goalTexts.first { $0.value == text }?.key ?? ""
        if case .bool(let can)? = profile["swims100"] { swims100 = can }
        eventName = profile["eventName"]?.string ?? ""
        eventDate = profile["eventDate"]?.string.flatMap(Self.date)
        distance = RaceDistance(profile: profile)
        weeklyHours = profile["weeklyHours"]?.number
    }

    /// The profile with these answers (FocusChoice.applying, plus the race for "Závod").
    func applied(to profile: JSONObject) -> JSONObject {
        var next = FocusChoice.applying(profile, sports: sports, goal: goal, swims100: swims100)
        if goal == "race" {
            next["eventName"] = .string(eventName.trimmingCharacters(in: .whitespaces))
            if let eventDate { next["eventDate"] = .string(Self.day(eventDate)) }
            next = distance.applied(to: next)
        }
        // The first week without a history follows it (src/adaptive-week.js startWeek).
        if let weeklyHours { next["weeklyHours"] = weeklyHours >= 1 ? .number(weeklyHours) : .null }
        return next
    }

    /// "2027-06-13": the race's day in the phone's own calendar, as Nastavení → Cíle saves it.
    static func day(_ date: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The saved day back at noon in the phone's time zone; nil when it is not one.
    static func date(_ iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}

/// "Jaké sporty děláš?": the sports in one step, ticked, with "Hlavní" on
/// one or more (SportsPicker); swimming asks whether 100 m go without a stop.
struct SetupSportPage: View {
    @Binding var focus: SetupFocus

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupPageTitle(title: "Jaké sporty děláš?",
                           subtitle: "Zaškrtni všechny, které děláš, a u těch, na které trénuješ nejvíc, klepni na Hlavní. Kouč navrhuje jen tyhle.")
            SportsPicker(choice: $focus.sports, raceNext: true)
            if focus.sports.swims {
                SwimLevelGroup(swims100: $focus.swims100).padding(.top, 6)
            }
        }
    }
}

/// "Uplaveš 100 m bez zastavení?" under the sports, when swimming is one of them.
struct SwimLevelGroup: View {
    @Binding var swims100: Bool?

    var body: some View {
        SettingsGroup(footer: swims100 == false ? "Začneme krátkými délkami a technikou v bazénu. Pár lekcí s trenérem plavání ti pomůže nejvíc." : "Když ne, začneme krátkými délkami a technikou.") {
            HStack(spacing: 12) {
                Text("Uplaveš 100 m bez zastavení?").font(.body).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Picker("Uplaveš 100 m bez zastavení?", selection: $swims100) {
                    Text("Ano").tag(Bool?.some(true))
                    Text("Ne").tag(Bool?.some(false))
                }
                .pickerStyle(.segmented).fixedSize()
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
    }
}

/// "Jaký je tvůj cíl?": FocusSheet's three goals; a race also takes its name and day.
struct SetupGoalPage: View {
    @Binding var focus: SetupFocus

    private static let subtitles = ["fitness": "Víc energie, postupné zlepšení", "race": "Datum a vzdálenost", "lose": "Jídlo i trénink k tomu"]
    private static let hours: [Double] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]
    private static var hourOptions: [(String, String)] {
        [("0", L10n.tr("teď netrénuju"))] + hours.map { (String(Int($0)), "\(Int($0)) h") }
    }
    /// A saved number on the nearest choice (7 h on 6 h, 20 h on 15 h).
    private static func hoursChoice(_ value: Double) -> String {
        guard value >= 1 else { return "0" }
        return String(Int(hours.min { abs($0 - value) < abs($1 - value) } ?? value))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupPageTitle(title: "Jaký je tvůj cíl?", subtitle: "Podle cíle Aurin nastaví trénink i jídlo. Změníš ho kdykoli.")
            ForEach(FocusChoice.goals, id: \.0) { item in
                ChoiceCard(title: item.1, subtitle: Self.subtitles[item.0], selected: focus.goal == item.0) {
                    withAnimation(.snappy) {
                        focus.goal = item.0
                        if item.0 == "race", focus.eventDate == nil {
                            focus.eventDate = Calendar.current.date(byAdding: .month, value: 3, to: Date())
                        }
                    }
                }
            }
            if focus.goal == "race" {
                SettingsGroup(title: "Hlavní závod") {
                    SettingsField(title: "Název", text: $focus.eventName, keyboard: .default, placeholder: L10n.tr("Pražský půlmaraton"))
                    SettingsDivider()
                    DatePicker("Datum", selection: Binding(get: { focus.eventDate ?? Date() }, set: { focus.eventDate = $0 }),
                               in: Date()..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                    SettingsDivider()
                    RaceDistanceRows(distance: $focus.distance)
                }
                .padding(.top, 6)
            }
            if !focus.goal.isEmpty {
                SettingsGroup(footer: "Běžný týden za poslední měsíc. První týden podle toho naplánujeme s rezervou.") {
                    SettingsPicker(title: "Kolik hodin týdně teď trénuješ?", selection: Binding(
                        get: { focus.weeklyHours.map { Self.hoursChoice($0) } ?? "" },
                        set: { focus.weeklyHours = Double($0) }), options: Self.hourOptions)
                }
                .padding(.top, 6)
            }
        }
        .sensoryFeedback(.selection, trigger: focus.goal)
    }
}

/// "Kdy můžeš trénovat?": the bars of "Kdy mám čas" (AvailabilityBarRow, up
/// to 8 h), prefilled with what the server would plan with. "Kde posiluješ?"
/// opens the gym places for whoever chose the gym.
struct SetupTimePage: View {
    @Binding var minutes: [Int]
    let loading: Bool
    let lifts: Bool
    let onEquipment: () -> Void
    private let monday = WeekPlanView.monday()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupPageTitle(title: "Kdy můžeš trénovat?",
                           subtitle: "Potáhni pruh u každého dne. Aurin plánuje v tomhle čase a když potřebuješ odpočinek, vezme si méně.")
            VStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    AvailabilityBarRow(day: Fmt.weekdayShort(ISODay.shift(monday, i)), minutes: $minutes[i])
                }
                AvailabilityAxis().padding(.bottom, 10)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 4)
            .cardSurface(cornerRadius: 22)
            .disabled(loading)
            .opacity(loading ? 0.5 : 1)
            .overlay { if loading { ProgressView() } }
            .sensoryFeedback(.selection, trigger: minutes)
            if lifts {
                Button(action: onEquipment) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Kde posiluješ?").font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                            Text("Vybavení: posilovna, doma nebo obojí").font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 13)
                    .cardSurface(cornerRadius: 18)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
    }
}

/// A setup page's title with the line under it.
private struct SetupPageTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle).font(Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 8)
    }
}
