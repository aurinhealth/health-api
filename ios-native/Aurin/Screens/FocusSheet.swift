import SwiftUI

/// "Nastav si zaměření a cíle" on Training, shown while the server says the
/// profile has no main sport and goal yet (/app/api/training profileIncomplete).
struct FocusPromptCard: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "scope")
                    .scaledFont(16, weight: .semibold, cap: .denseCap)
                    .foregroundStyle(Palette.amber)
                    .frame(width: 34, height: 34)
                    .background(Palette.amberSoft, in: Circle())
                Text("Nastav si zaměření a cíle").font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .cardSurface(cornerRadius: 18)
            .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.amber.opacity(0.35), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// "Zaměření": the main sport, the time for training on each weekday (the
/// same bars as "Kdy mám čas", AvailabilityView) and the goal. "Uložit" saves
/// the profile (mainSport, sportGoal and, for losing weight, the weight goal)
/// through POST /app/api/profile and the usual week through /app/api/week-plan.
struct FocusSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var onSave: () -> Void = {}

    @State private var profile: JSONObject = [:]
    @State private var sport = ""
    @State private var goal = ""
    @State private var prefs: JSONValue?
    @State private var minutes = Array(repeating: -1, count: 7)
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    /// "Uplaveš 100 m bez zastavení?" for swimming and triathlon: nil until answered.
    @State private var swims100: Bool?
    private let monday = WeekPlanView.monday()

    /// The chips, mapped to the profile's mainSport (src/athlete-focus.js).
    static let sports = [("cycling", "Kolo"), ("running", "Běh"), ("swimming", "Plavání"), ("triathlon", "Triatlon"), ("strength", "Posilovna"), ("general", "Obecná kondice")]
    /// The goal rows, kept as the profile's sportGoal in the athlete's words.
    static let goals = [("fitness", "Zlepšit kondici"), ("race", "Závod"), ("lose", "Zhubnout")]
    static let goalTexts = ["fitness": "zlepšit kondici", "race": "závod", "lose": "zhubnout"]

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Zaměření").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    ChipFlow(items: Self.sports.map { $0.0 }, label: { id in Self.sports.first { $0.0 == id }?.1 ?? id },
                             isOn: { $0 == sport }, toggle: { sport = $0 })
                    if sport == "swimming" || sport == "triathlon" {
                        SettingsGroup(footer: "Když ne, začneme krátkými délkami a technikou.") {
                            HStack(spacing: 12) {
                                Text("Uplaveš 100 m bez zastavení?").font(.body).foregroundStyle(Palette.ink)
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

                    SectionLabel(text: "Kdy máš čas").padding(.top, 10)
                    VStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { i in
                            if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            AvailabilityBarRow(day: Fmt.weekdayShort(ISODay.shift(monday, i)), minutes: $minutes[i])
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 4)
                    .cardSurface(cornerRadius: 22)
                    .disabled(loading || saving)
                    .sensoryFeedback(.selection, trigger: minutes)

                    SectionLabel(text: "Cíl").padding(.top, 10)
                    SettingsGroup {
                        ForEach(Self.goals.indices, id: \.self) { i in
                            if i > 0 { SettingsDivider() }
                            Button { goal = Self.goals[i].0 } label: {
                                HStack(spacing: 12) {
                                    Text(Self.goals[i].1).font(.body).foregroundStyle(Palette.ink)
                                    Spacer(minLength: 8)
                                    if goal == Self.goals[i].0 {
                                        Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                                    }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 13)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(goal == Self.goals[i].0 ? .isSelected : [])
                        }
                    }

                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                    PrimaryButton(title: saving ? "Ukládám…" : "Uložit", systemImage: "checkmark", busy: saving) { Task { await save() } }
                        .disabled(saving || loading || model.demo || sport.isEmpty || goal.isEmpty)
                        .padding(.top, 10)
                }
                .padding(24)
            }
            .background { ScreenBackground(glow: Palette.Glow.training) }
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
        .tint(Palette.ink)
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        guard !model.demo else { return }
        if let p = try? await model.api.profile() {
            profile = p
            sport = p["mainSport"]?.string ?? ""
            let text = p["sportGoal"]?.string ?? ""
            goal = Self.goalTexts.first { $0.value == text }?.key ?? ""
        }
        if let r = try? await model.api.weekPlan(start: nil) {
            prefs = r.prefs
            minutes = WeekPlanPrefs.minutes(r.prefs)
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var next = profile
        next["mainSport"] = .string(sport)
        if let text = Self.goalTexts[goal] { next["sportGoal"] = .string(text) }
        // Losing weight is also the weight goal of the calorie target, unless one is set already.
        if goal == "lose", !(next["goal"]?.string ?? "").hasPrefix("lose") { next["goal"] = .string("lose_0.5") }
        do {
            try await model.api.saveProfile(next)
            // Can't swim 100 m yet: the swims start from first lengths (src/swimming-workouts.js).
            if swims100 != nil, sport == "swimming" || sport == "triathlon" {
                _ = try await model.api.saveGymPreferences(["experienceBySport": .object(["swim": .string(swims100 == false ? "beginner" : "auto")])])
            }
            if prefs != nil {
                let days = WeekPlanPrefs.days(prefs).map { Array($0.prefix(WeekPlanPrefs.maxPerDay)) }
                let body = WeekPlanPrefs.edited(prefs, minutes: minutes, days: days, weeklyActivities: WeekPlanPrefs.weeklyActivities(prefs))
                try await model.api.saveWeekPlan(start: nil, prefs: body)
            }
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
