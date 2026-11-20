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

    /// From the saved profile (an earlier start on the web, or Zaměření).
    init(profile: JSONObject = [:]) {
        sports = SportsChoice(profile: profile)
        let text = profile["sportGoal"]?.string ?? ""
        goal = FocusChoice.goalTexts.first { $0.value == text }?.key ?? ""
        if case .bool(let can)? = profile["swims100"] { swims100 = can }
        eventName = profile["eventName"]?.string ?? ""
        eventDate = profile["eventDate"]?.string.flatMap(Self.date)
    }

    /// The profile with these answers (FocusChoice.applying, plus the race for "Závod").
    func applied(to profile: JSONObject) -> JSONObject {
        var next = FocusChoice.applying(profile, sports: sports, goal: goal, swims100: swims100)
        if goal == "race" {
            next["eventName"] = .string(eventName.trimmingCharacters(in: .whitespaces))
            if let eventDate { next["eventDate"] = .string(Self.day(eventDate)) }
        }
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

    static let subtitles = ["fitness": "Víc energie, postupné zlepšení", "race": "Datum a vzdálenost", "lose": "Jídlo i trénink k tomu"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SetupPageTitle(title: "Jaký je tvůj cíl?", subtitle: "Kouč podle něj skládá tvůj týden. Změníš ho kdykoli.")
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
                }
                .padding(.top, 6)
            }
        }
        .sensoryFeedback(.selection, trigger: focus.goal)
    }
}

/// A setup page's title with the line under it.
private struct SetupPageTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle).font(Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 8)
    }
}
