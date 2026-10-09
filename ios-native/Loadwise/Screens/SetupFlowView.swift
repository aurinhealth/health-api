import SwiftUI

/// After the first sign-in: who you are, your day and goal, how you train and
/// sleep. It is the web's onboarding (POST /app/api/onboarding) in five short
/// steps; every value can be changed later in Settings.
struct SetupFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var step = 0
    @State private var sex = ""
    @State private var age = 35
    @State private var height = 175.0
    @State private var weight = 75.0
    @State private var activity = "light"
    @State private var goal = "maintain"
    @State private var sportHours = "3-6"
    @State private var mainSport = "general"
    @State private var equipment = "gym"
    @State private var experience = "auto"
    @State private var sleepGoal = 0
    @State private var wake = SleepSettingsForm.clock("07:00")
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false

    private let steps = ["O tobě", "Den a cíl", "Trénink", "Spánek"]

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    if step > 0 {
                        CircleButton(systemImage: "chevron.left", label: "Zpět") { withAnimation { step -= 1 } }
                    }
                    Spacer()
                    Button("Teď ne") { model.needsSetup = false }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                }
                .frame(height: 40)

                if step > 0 {
                    HStack(spacing: 6) {
                        ForEach(1...steps.count, id: \.self) { i in
                            Capsule().fill(i <= step ? Palette.green : Palette.ink.opacity(0.12)).frame(height: 5)
                        }
                    }
                    .padding(.top, 12)
                    SectionLabel(text: L10n.f("Krok %@ z %@", String(step), String(steps.count)) + " · " + L10n.tr(steps[step - 1])).padding(.top, 16)
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .padding(.top, 14)
                        .padding(.bottom, 20)
                }
                .scrollDismissesKeyboard(.interactively)

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
                PrimaryButton(title: step == 0 ? "Začít" : step < steps.count ? "Pokračovat" : saving ? "Ukládám…" : "Hotovo", busy: saving) {
                    if step < steps.count { withAnimation { step += 1 } } else { Task { await finish() } }
                }
                .disabled(saving || (step == 1 && sex.isEmpty))
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .task { await load() }
        .interactiveDismissDisabled()
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case 0:
            Spacer(minLength: 40)
            Image(systemName: "hand.wave.fill").font(.system(size: 40)).foregroundStyle(Palette.amberBar)
            Text("Vítej v Loadwise").font(Typo.sentence(40, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            Text("Pár otázek a připravím ti cíl kalorií a živin, potřebu spánku s večerkou a tréninky, které sedí k tvému vybavení. Zabere to asi minutu.")
                .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
        case 1:
            title("Řekni mi něco o sobě", "Z toho se počítá klidový výdej a denní cíl kalorií.")
            HStack(spacing: 10) {
                ChoiceCard(title: "Muž", systemImage: "figure.stand", selected: sex == "male") { sex = "male" }
                ChoiceCard(title: "Žena", systemImage: "figure.stand.dress", selected: sex == "female") { sex = "female" }
            }
            NumberStepper(title: "Věk", value: Binding(get: { Double(age) }, set: { age = Int($0) }), range: 18...100, step: 1, unit: "let")
            // Shown in the chosen units, kept in cm and kg.
            NumberStepper(title: "Výška", value: Binding(get: { Units.length(height) }, set: { height = Units.cm(Units.imperial ? $0.rounded() : $0) }),
                          range: Units.length(120)...Units.length(230), step: 1, unit: Units.lengthUnit)
            NumberStepper(title: "Váha", value: Binding(get: { Units.weight(weight) }, set: { weight = Units.kg(Units.imperial ? $0.rounded() : $0) }),
                          range: Units.weight(35)...Units.weight(250), step: Units.imperial ? 1 : 0.5, unit: Units.weightUnit, digits: Units.imperial ? 0 : 1)
        case 2:
            title("Jak vypadá tvůj den?", "Bez sportu. Sport se přičte podle tréninků.")
            ForEach(Self.activities.indices, id: \.self) { i in
                let a = Self.activities[i]
                ChoiceCard(title: a.1, subtitle: a.2, selected: activity == a.0) { activity = a.0 }
            }
            title("Cíl", nil).padding(.top, 10)
            ForEach(ProfileSettingsView.goals.indices, id: \.self) { i in
                let g = ProfileSettingsView.goals[i]
                ChoiceCard(title: Fmt.capitalized(g.1), selected: goal == g.0) { goal = g.0 }
            }
        case 3:
            title("Jak trénuješ?", "Trenér podle toho volí tréninky a posilovnu sestaví jen z toho, co máš.")
            Text("Hlavní sport").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
            ChipFlow(items: GoalsSettingsView.sports.map { $0.0 }, label: { id in GoalsSettingsView.sports.first { $0.0 == id }?.1 ?? id },
                     isOn: { $0 == mainSport }, toggle: { mainSport = $0 })
            Text("Sportu týdně").font(Typo.bodyStrong).foregroundStyle(Palette.secondary).padding(.top, 6)
            ChipFlow(items: ProfileSettingsView.sportHourOptions.map { $0.0 }.filter { $0 != "auto" },
                     label: { id in ProfileSettingsView.sportHourOptions.first { $0.0 == id }?.1 ?? id },
                     isOn: { $0 == sportHours }, toggle: { sportHours = $0 })
            Text("Posilování").font(Typo.bodyStrong).foregroundStyle(Palette.secondary).padding(.top, 6)
            ForEach(EquipmentView.setupKinds.indices, id: \.self) { i in
                let k = EquipmentView.setupKinds[i]
                ChoiceCard(title: k.1, subtitle: k.2, selected: equipment == k.0) { equipment = k.0 }
            }
            Text("Které stroje v posilovně jsou a jaké máš doma jednoručky, nastavíš v Trénink → Vybavení, i z fotky.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Text("Zkušenosti s posilováním").font(Typo.bodyStrong).foregroundStyle(Palette.secondary).padding(.top, 6)
            ChipFlow(items: ["auto", "beginner", "regular", "experienced"],
                     label: { ["auto": "podle záznamů", "beginner": "začínám", "regular": "cvičím pravidelně", "experienced": "pokročilý"][$0] ?? $0 },
                     isOn: { $0 == experience }, toggle: { experience = $0 })
        default:
            title("A spánek", "Podle budíku a potřeby spánku ti každý den řeknu, kdy jít spát.")
            Card {
                DatePicker("Ve všední dny vstávám v", selection: $wake, displayedComponents: .hourAndMinute)
                    .environment(\.locale, Fmt.locale)
                HStack {
                    Text("Chci spát").font(.body)
                    Spacer()
                    Picker("Chci spát", selection: $sleepGoal) {
                        Text("podle věku").tag(0)
                        ForEach(SleepSettingsForm.goals, id: \.self) { Text(Fmt.hoursMinutes(Double($0)) + " h").tag($0) }
                    }
                    .pickerStyle(.menu).tint(Palette.muted)
                }
            }
            Text("Budík na víkend a další nastavení najdeš v Nastavení → Spánek a budík.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func title(_ text: String, _ subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            if let subtitle { Text(subtitle).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
        }
    }

    static let activities = [
        ("sedentary", "Sedavá práce", "Kancelář, málo chůze"),
        ("light", "Lehce aktivní", "Hodně chůze, práce vestoje"),
        ("active", "Aktivní", "Většinu dne v pohybu"),
        ("heavy", "Fyzicky náročná práce", "Stavba, sklad, manuální práce")
    ]

    /// What the server already knows (an earlier start on the web).
    private func load() async {
        guard !loaded else { return }
        loaded = true
        guard let s = try? await model.api.onboarding() else { return }
        let p = s.savedProfile ?? [:]
        if let v = p["sex"]?.string { sex = v }
        if let v = p["age"]?.number { age = Int(v) }
        if let v = p["height"]?.number { height = v.rounded() }
        if let v = s.weightKg { weight = (v * 2).rounded() / 2 }
        if let v = p["activity"]?.string { activity = v }
        if let v = p["goal"]?.string { goal = v }
        if let v = p["sportHours"]?.string, v != "auto" { sportHours = v }
        if let v = p["mainSport"]?.string { mainSport = v }
        if let v = s.training?.equipment { equipment = v == "custom" ? "gym" : v == "home" ? "dumbbells" : v }
    }

    private func finish() async {
        saving = true
        defer { saving = false }
        let profile: JSONObject = [
            "sex": .string(sex), "age": .number(Double(age)), "height": .number(height.rounded()),
            "activity": .string(activity), "goal": .string(goal), "sportHours": .string(sportHours), "mainSport": .string(mainSport),
            "sleepGoal": sleepGoal == 0 ? .null : .number(Double(sleepGoal)), "wakeTime": .string(SleepSettingsForm.text(wake))
        ]
        do {
            try await model.api.completeOnboarding(profile: profile, weightKg: (weight * 10).rounded() / 10, training: ["equipment": .string(equipment), "experience": .string(experience)])
            await model.finishSetup()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Věk  − 35 let +": a number with big buttons, no keyboard.
struct NumberStepper: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let unit: String
    var digits = 0

    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            Button { value = max(range.lowerBound, value - step) } label: { Image(systemName: "minus").frame(width: 38, height: 38).background(Palette.track, in: Circle()) }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(Fmt.decimal(value, digits: digits)).font(Typo.number(28)).foregroundStyle(Palette.ink).monospacedDigit()
                Text(unit).font(Typo.small).foregroundStyle(Palette.muted)
            }
            .frame(minWidth: 86)
            Button { value = min(range.upperBound, value + step) } label: { Image(systemName: "plus").frame(width: 38, height: 38).background(Palette.track, in: Circle()) }
        }
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(Palette.ink)
        .buttonStyle(.plain)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: value = min(range.upperBound, value + step)
            case .decrement: value = max(range.lowerBound, value - step)
            @unknown default: break
            }
        }
    }
}
