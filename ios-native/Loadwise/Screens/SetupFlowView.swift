import SwiftUI

/// After the first sign-in, the web's account setup (src/dashboard-client.js
/// showAccountSetup): the consent to health data, the data sources, who you
/// are, your day and goal, how you train and sleep. Every value can be changed
/// later in Settings. An account set up earlier that still owes the consent
/// sees only that page.
struct SetupFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var index = 0
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
    @State private var limitations = ""
    @State private var sleepGoal = 0
    @State private var wake = SleepSettingsForm.clock("07:00")
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false
    @State private var ready = false
    // Consent
    @State private var consentNeeded = false
    @State private var consentOnly = false
    @State private var agree = false
    // Data sources
    @State private var providers: [ConnectionsResponse.Provider] = []
    @State private var working: String?
    @State private var sourceMessage: String?
    @State private var googleDisclosure = false
    @State private var intervalsKey = false
    @State private var syncRun = 0
    @State private var syncState: String?
    // Values the user set here; the services' suggestions never overwrite them.
    @State private var touched: Set<String> = []
    // Values filled in from the services' suggestions, sent back empty when left
    // alone so they keep following the services.
    @State private var suggested: [String: String] = [:]
    @State private var loadedWeight: Double?

    private enum Page: Equatable { case welcome, consent, sources, about, day, training, sleep }

    private var pages: [Page] {
        if consentOnly { return [.consent] }
        return [.welcome] + (consentNeeded ? [.consent] : []) + [.sources, .about, .day, .training, .sleep]
    }
    private var page: Page { pages[min(index, pages.count - 1)] }
    private var counted: [Page] { pages.filter { $0 != .welcome } }

    private func name(_ page: Page) -> String {
        switch page {
        case .welcome: return ""
        case .consent: return "Souhlas"
        case .sources: return "Zdroje dat"
        case .about: return "O tobě"
        case .day: return "Den a cíl"
        case .training: return "Trénink"
        case .sleep: return "Spánek"
        }
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    if index > 0 {
                        CircleButton(systemImage: "chevron.left", label: "Zpět") { withAnimation { index -= 1 } }
                    }
                    Spacer()
                    // Without the consent the app cannot be used: the way out is signing out.
                    if page == .consent {
                        Button("Odhlásit") { Task { await model.logout() } }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    } else if ready && !consentNeeded {
                        Button("Teď ne") { model.needsSetup = false }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    }
                }
                .frame(height: 40)

                if page != .welcome && !consentOnly, let position = counted.firstIndex(of: page) {
                    HStack(spacing: 6) {
                        ForEach(counted.indices, id: \.self) { i in
                            Capsule().fill(i <= position ? Palette.green : Palette.ink.opacity(0.12)).frame(height: 5)
                        }
                    }
                    .padding(.top, 12)
                    SectionLabel(text: L10n.f("Krok %@ z %@", String(position + 1), String(counted.count)) + " · " + L10n.tr(name(page))).padding(.top, 16)
                }

                PageScroll {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .padding(.top, 14)
                        .padding(.bottom, 20)
                }
                .scrollDismissesKeyboard(.interactively)

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
                PrimaryButton(title: buttonTitle, busy: saving) { Task { await next() } }
                    .disabled(saving || !ready || (page == .about && sex.isEmpty) || (page == .consent && !agree))
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .task { await load() }
        .task(id: syncRun) { if syncRun > 0 { await followSync() } }
        .sheet(isPresented: $googleDisclosure) { GoogleDisclosureSheet {
            googleDisclosure = false
            // The browser sheet opens once this one has closed.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { connect("google") }
        } }
        .sheet(isPresented: $intervalsKey) { IntervalsKeySheet { await loadProviders(); syncRun += 1 } }
        .interactiveDismissDisabled()
    }

    private var buttonTitle: String {
        if page == .welcome { return "Začít" }
        if saving { return "Ukládám…" }
        if page == .consent { return "Pokračovat" }
        return index < pages.count - 1 ? "Pokračovat" : "Hotovo"
    }

    @ViewBuilder
    private var content: some View {
        switch page {
        case .welcome: welcomePage
        case .consent: consentPage
        case .sources: sourcesPage
        case .about: aboutPage
        case .day: dayPage
        case .training: trainingPage
        case .sleep: sleepPage
        }
    }

    @ViewBuilder
    private var welcomePage: some View {
        Spacer(minLength: 40)
        Image(systemName: "hand.wave.fill").font(.system(size: 40)).foregroundStyle(Palette.amberBar)
        Text("Vítej v Loadwise").font(Typo.sentence(40, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
        Text("Pár otázek a připravím ti cíl kalorií a živin, potřebu spánku s večerkou a tréninky, které sedí k tvému vybavení. Zabere to asi minutu.")
            .font(Typo.sentence(20)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
    }

    // The same points as the web's consent (consentDataList in dashboard-client.js).
    private static let consentPoints: [(String, String)] = [
        ("Co", "Tep, variabilita tepu (HRV), spánek, váha a tělesný tuk, jídlo a pití, tréninky a jak ti šly."),
        ("Odkud", "Ze služeb, které připojíš (Google Health, Intervals.icu), a z toho, co zadáš sám."),
        ("K čemu", "Jen k přehledům, výpočtům a plánům v Loadwise. Data neprodáváme a nepoužíváme k reklamě."),
        ("AI", "Když použiješ AI funkci (asistent, rozpoznání jídla z fotky, hodnocení tréninku a týdne), pošle Loadwise potřebné údaje, včetně údajů o zdraví a fotek jídla, společnosti OpenAI v USA."),
        ("Odvolání", "Smazáním účtu v Nastavení → Účet, kde si předtím můžeš stáhnout všechna svoje data.")
    ]

    @ViewBuilder
    private var consentPage: some View {
        title("Tvoje data o zdraví", "Loadwise pracuje s údaji o tvém zdraví. Podle GDPR k tomu potřebujeme tvůj výslovný souhlas.")
        Card {
            ForEach(Self.consentPoints, id: \.0) { point in
                VStack(alignment: .leading, spacing: 3) {
                    Text(point.0).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(point.1).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        Toggle("Souhlasím, aby Loadwise zpracovával moje údaje o zdraví, jak je popsáno výše, včetně AI funkcí.", isOn: $agree)
            .font(Typo.small).tint(Palette.green)
        Link("Zásady ochrany soukromí", destination: URL(string: "https://petrfitnessdata.eu/privacy")!).font(Typo.small)
    }

    @ViewBuilder
    private var sourcesPage: some View {
        title("Propoj své služby", nil)
        SettingsGroup {
            ForEach(Array(shownProviders.enumerated()), id: \.element.id) { i, provider in
                if i > 0 { SettingsDivider() }
                sourceRow(provider)
            }
        }
        if let line = syncLine {
            HStack(spacing: 8) {
                if syncState == "running" { ProgressView() } else {
                    Image(systemName: syncState == "done" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(syncState == "done" ? Palette.green : Palette.amber)
                }
                Text(line).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        if let sourceMessage {
            Text(sourceMessage).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func sourceRow(_ provider: ConnectionsResponse.Provider) -> some View {
        HStack(spacing: 12) {
            SettingsIcon(systemImage: provider.id == "google" ? "g.circle.fill" : "waveform.path.ecg", color: provider.id == "google" ? Palette.blue : Palette.rust)
            Text(provider.name ?? provider.id).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            if working == provider.id {
                ProgressView()
            } else if provider.connected == true {
                Label("připojeno", systemImage: "checkmark").font(Typo.small).foregroundStyle(Palette.green)
            } else if provider.id == "intervals" {
                Menu {
                    Button { connect("intervals") } label: { Label("Připojit", systemImage: "link") }
                    Button { intervalsKey = true } label: { Label("Vložit API klíč", systemImage: "key") }
                } label: { connectLabel }
                .disabled(working != nil)
            } else {
                Button { googleDisclosure = true } label: { connectLabel }
                    .buttonStyle(.plain)
                    .disabled(working != nil)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }

    private var connectLabel: some View {
        Text("Připojit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
            .padding(.horizontal, 14).frame(height: 34)
            .background(Palette.button, in: Capsule())
    }

    /// Google and Intervals.icu, also before /app/api/connections answers.
    private var shownProviders: [ConnectionsResponse.Provider] {
        let known = providers.filter { $0.id == "google" || $0.id == "intervals" }
        if !known.isEmpty { return known }
        return [("google", "Google Health"), ("intervals", "Intervals.icu")].map {
            ConnectionsResponse.Provider(id: $0.0, name: $0.1, connected: false, configured: nil, missingPermissions: nil, metrics: nil, note: nil)
        }
    }

    private var syncLine: String? {
        switch syncState {
        case "running": return L10n.tr("Načítám historii. Můžeš pokračovat.")
        case "done": return L10n.tr("Historie je načtená.")
        case "partial", "error": return L10n.tr("Část historie se nepodařilo načíst. Import zopakuješ v Nastavení → Zdroje dat.")
        default: return nil
        }
    }

    @ViewBuilder
    private var aboutPage: some View {
        title("Řekni mi něco o sobě", "Z toho se počítá klidový výdej a denní cíl kalorií.")
        HStack(spacing: 10) {
            ChoiceCard(title: "Muž", systemImage: "figure.stand", selected: sex == "male") { sex = "male" }
            ChoiceCard(title: "Žena", systemImage: "figure.stand.dress", selected: sex == "female") { sex = "female" }
        }
        NumberStepper(title: "Věk", value: Binding(get: { Double(age) }, set: { age = Int($0); touched.insert("age") }), range: 18...100, step: 1, unit: "let")
        // Shown in the chosen units, kept in cm and kg.
        NumberStepper(title: "Výška", value: Binding(get: { Units.length(height) }, set: { height = Units.cm(Units.imperial ? $0.rounded() : $0); touched.insert("height") }),
                      range: Units.length(120)...Units.length(230), step: 1, unit: Units.lengthUnit)
        NumberStepper(title: "Váha", value: Binding(get: { Units.weight(weight) }, set: { weight = Units.kg(Units.imperial ? $0.rounded() : $0); touched.insert("weight") }),
                      range: Units.weight(35)...Units.weight(250), step: Units.imperial ? 1 : 0.5, unit: Units.weightUnit, digits: Units.imperial ? 0 : 1)
    }

    @ViewBuilder
    private var dayPage: some View {
        title("Jak vypadá tvůj den?", "Bez sportu. Sport se přičte podle tréninků.")
        ForEach(Self.activities.indices, id: \.self) { i in
            let a = Self.activities[i]
            ChoiceCard(title: a.1, subtitle: a.2, selected: activity == a.0) { activity = a.0; touched.insert("activity") }
        }
        title("Cíl", nil).padding(.top, 10)
        ForEach(HeartActivitySettingsView.goals.indices, id: \.self) { i in
            let g = HeartActivitySettingsView.goals[i]
            ChoiceCard(title: Fmt.capitalized(g.1), selected: goal == g.0) { goal = g.0 }
        }
    }

    @ViewBuilder
    private var trainingPage: some View {
        title("Jak trénuješ?", "Trenér podle toho volí tréninky a posilovnu sestaví jen z toho, co máš.")
        Text("Hlavní sport").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
        ChipFlow(items: GoalsSettingsView.sports.map { $0.0 }, label: { id in GoalsSettingsView.sports.first { $0.0 == id }?.1 ?? id },
                 isOn: { $0 == mainSport }, toggle: { mainSport = $0 })
        Text("Sportu týdně").font(Typo.bodyStrong).foregroundStyle(Palette.secondary).padding(.top, 6)
        ChipFlow(items: HeartActivitySettingsView.sportHourOptions.map { $0.0 }.filter { $0 != "auto" },
                 label: { id in HeartActivitySettingsView.sportHourOptions.first { $0.0 == id }?.1 ?? id },
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
        Text("Omezení nebo poznámka pro trenéra").font(Typo.bodyStrong).foregroundStyle(Palette.secondary).padding(.top, 6)
        TextField("Např. bolavé koleno", text: $limitations, axis: .vertical)
            .lineLimit(2...5)
            .padding(14)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onChange(of: limitations) { _, value in if value.count > 500 { limitations = String(value.prefix(500)) } }
    }

    @ViewBuilder
    private var sleepPage: some View {
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

    private func next() async {
        error = nil
        switch page {
        case .consent: await giveConsent()
        case _ where index < pages.count - 1: withAnimation { index += 1 }
        default: await finish()
        }
    }

    /// What the server already knows (an earlier start on the web, the
    /// connected services), and whether the consent is still missing.
    private func load() async {
        guard !loaded else { return }
        loaded = true
        let api = model.api
        async let status = try? api.setupStatus()
        async let consent = try? api.healthConsentNeeded()
        let s = await status
        consentNeeded = await consent ?? false
        if let s {
            consentOnly = consentNeeded && s.completed == true
            let p = s.savedProfile ?? [:]
            if let v = p["sex"]?.string { sex = v }
            if let v = p["goal"]?.string { goal = v }
            if let v = p["sportHours"]?.string, v != "auto" { sportHours = v }
            if let v = p["mainSport"]?.string { mainSport = v }
            if let v = p["age"]?.number { age = Int(v) }
            if let v = p["height"]?.number { height = v.rounded() }
            if let v = p["activity"]?.string { activity = v }
            if let t = s.training {
                if let v = t.equipment { equipment = v == "custom" ? "gym" : v == "home" ? "dumbbells" : v }
                if t.experienceMode == "manual", let v = t.experience { experience = v }
                if let v = t.limitations { limitations = v }
            }
            apply(s)
        }
        ready = true
        guard !consentOnly else { return }
        await loadProviders()
        if providers.contains(where: { $0.connected == true }) { syncRun += 1 }
    }

    /// Fills in what the services suggest (height, everyday activity, age from
    /// the birth date, the latest weight) where the user has not set it.
    private func apply(_ s: SetupStatus) {
        let saved = s.savedProfile ?? [:], profile = s.profile ?? [:], suggestions = s.suggestions ?? [:]
        if saved["height"]?.number == nil, !touched.contains("height"), let v = profile["height"]?.number {
            height = v.rounded()
            suggested["height"] = String(Int(height))
        }
        if saved["activity"]?.string == nil, !touched.contains("activity"), let v = profile["activity"]?.string {
            activity = v
            suggested["activity"] = v
        }
        if saved["age"]?.number == nil, suggestions["birthDate"]?.string != nil, !touched.contains("age"), let v = profile["age"]?.number {
            age = Int(v)
            suggested["age"] = String(age)
        }
        if !touched.contains("weight"), let v = s.weightKg {
            weight = (v * 2).rounded() / 2
            loadedWeight = weight
        }
    }

    private func giveConsent() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.giveHealthConsent()
            if consentOnly {
                await model.finishSetup()
            } else {
                // The consent page drops out; the same index is now the next page.
                withAnimation { consentNeeded = false }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadProviders() async {
        if let list = try? await model.api.connections() { providers = list.providers }
    }

    private func connect(_ provider: String) {
        Task {
            working = provider
            sourceMessage = nil
            defer { working = nil }
            do {
                guard let event = try await model.connect(provider: provider) else { return }
                switch event {
                case "google", "intervals": syncRun += 1
                case "intervals-failed":
                    sourceMessage = L10n.tr("Připojení Intervals.icu se nepovedlo. Zkus vložit API klíč.")
                    intervalsKey = true
                case "expired": sourceMessage = L10n.tr("Odkaz vypršel, zkus to znovu.")
                default: sourceMessage = L10n.tr("Připojení se nedokončilo.")
                }
                await loadProviders()
            } catch {
                sourceMessage = error.localizedDescription
            }
        }
    }

    /// The import after connecting (GET /app/api/sync): started unless it already
    /// runs, followed until it ends, and the suggestions it brings filled in.
    private func followSync() async {
        if (try? await model.api.syncStatus())?.status != "running" { try? await model.api.startSync() }
        syncState = "running"
        for _ in 0..<60 {
            try? await Task.sleep(for: .seconds(5))
            if Task.isCancelled { return }
            guard let status = try? await model.api.syncStatus() else { continue }
            if let s = try? await model.api.setupStatus() { apply(s) }
            if status.status != "running" {
                syncState = status.status
                return
            }
        }
    }

    private func finish() async {
        saving = true
        defer { saving = false }
        // Suggested values left alone stay automatic, as on the web.
        let keep = { (key: String, value: String, json: JSONValue) -> JSONValue in
            !touched.contains(key) && suggested[key] == value ? .string("") : json
        }
        let profile: JSONObject = [
            "sex": .string(sex), "age": keep("age", String(age), .number(Double(age))),
            "height": keep("height", String(Int(height.rounded())), .number(height.rounded())),
            "activity": keep("activity", activity, .string(activity)), "goal": .string(goal), "sportHours": .string(sportHours), "mainSport": .string(mainSport),
            "sleepGoal": sleepGoal == 0 ? .null : .number(Double(sleepGoal)), "wakeTime": .string(SleepSettingsForm.text(wake))
        ]
        let training: JSONObject = [
            "equipment": .string(equipment), "experience": .string(experience),
            "limitations": .string(limitations.trimmingCharacters(in: .whitespacesAndNewlines))
        ]
        // The weight already known is not saved again as today's.
        let newWeight = loadedWeight != nil && loadedWeight == weight && !touched.contains("weight") ? nil : (weight * 10).rounded() / 10
        do {
            try await model.api.completeOnboarding(profile: profile, weightKg: newWeight, training: training)
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
