import SwiftUI
import UserNotifications

/// After the first sign-in, two pages: where the data comes from ("Odkud brát
/// data": Apple Health, Google Health, the Ultrahuman Ring, WHOOP, Intervals.icu,
/// Wahoo, the consent to health data and the separate one to the AI features)
/// and who you are ("O tobě": sex, year of birth, height and weight,
/// filled in from Apple Health or the server's suggestions). Everything else
/// (the day, goals, training, sleep) lives in Settings. An account set up
/// earlier that still owes the consent sees only the consent page.
struct SetupFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var index = 0
    // O tobě: the fields as typed, in the chosen units (Units).
    @State private var sex = ""
    @State private var birthYear = ""
    @State private var heightText = ""
    @State private var weightText = ""
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false
    @State private var ready = false
    // Consent
    @State private var consentNeeded = false
    @State private var consentOnly = false
    @State private var agree = false
    // Sending what an AI feature needs to OpenAI: its own choice, never ticked
    // in advance (GDPR, App Review 5.1.2(i), WHOOP API terms 4.2.1).
    @State private var agreeAI = false
    // Data sources
    @State private var appleOn = true
    @State private var appleWorking = false
    @State private var appleRead = false
    @State private var appleFilled = false
    @State private var providers: [ConnectionsResponse.Provider] = []
    @State private var connecting: ConnectTarget?
    @State private var syncRun = 0
    @State private var syncState: String?
    // What the server's suggestions (Google Health) filled in, as shown in the
    // field; left alone it goes back empty so it keeps following the service.
    @State private var suggested: [String: String] = [:]
    /// The weight as prefilled; unchanged it is not saved again as today's.
    @State private var prefilledWeight: String?

    private enum Page: Equatable { case consent, sources, about }

    private var pages: [Page] { consentOnly ? [.consent] : [.sources, .about] }
    private var page: Page { pages[min(index, pages.count - 1)] }
    private var health: AppleHealth { AppleHealth.shared }

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
                    } else if page == .about && ready {
                        Button("Teď ne") { model.needsSetup = false }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    }
                }
                .frame(height: 40)

                PageScroll {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .padding(.top, 8)
                        .padding(.bottom, 20)
                }
                .scrollDismissesKeyboard(.interactively)

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
                PrimaryButton(title: buttonTitle, busy: saving || appleWorking) { Task { await next() } }
                    .disabled(saving || appleWorking || !ready || (page == .about && sex.isEmpty) || (page != .about && consentNeeded && !agree))
                if page == .sources {
                    Button(L10n.tr(consentNeeded ? "Odhlásit se" : "Teď ne")) {
                        if consentNeeded { Task { await model.logout() } } else { model.needsSetup = false }
                    }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .disabled(!ready)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .task { await load() }
        .task(id: syncRun) { if syncRun > 0 { await followSync() } }
        .task(id: index) { if page == .about { await readAppleProfile() } }
        .onChange(of: appleOn) { _, on in
            if on {
                Task { await connectApple() }
            } else if health.enabled {
                health.disconnect()
            }
        }
        .sheet(item: $connecting) { target in ServiceConnectSheet(target: target) { await loadProviders(); syncRun += 1 } }
        .interactiveDismissDisabled()
    }

    private var buttonTitle: String {
        if saving { return "Ukládám…" }
        if appleWorking { return "Moment…" }
        return page == .about ? "Hotovo" : "Pokračovat"
    }

    @ViewBuilder
    private var content: some View {
        switch page {
        case .consent: consentPage
        case .sources: sourcesPage
        case .about: aboutPage
        }
    }

    // MARK: - Consent (accounts set up before the consent, after a version bump)

    // The same points as the web's consent (consentDataList in dashboard-client.js).
    private static let consentPoints: [(String, String)] = [
        ("Co", "Tep, variabilita tepu (HRV), spánek, váha a tělesný tuk, jídlo a pití, tréninky a jak ti šly."),
        ("Odkud", "Ze služeb, které připojíš (Apple Health, Google Health, Intervals.icu), a z toho, co zadáš sám."),
        ("K čemu", "Jen k přehledům, výpočtům a plánům v Aurinu. Data neprodáváme a nepoužíváme k reklamě."),
        ("AI", "Když použiješ AI funkci (asistent, rozpoznání jídla z fotky, hodnocení tréninku a týdne), pošle Aurin potřebné údaje, včetně údajů o zdraví a fotek, které pošleš, společnosti OpenAI v USA."),
        ("Odvolání", "Smazáním účtu v Nastavení → Účet, kde si předtím můžeš stáhnout všechna svoje data.")
    ]

    @ViewBuilder
    private var consentPage: some View {
        title("Tvoje data o zdraví")
        Card {
            ForEach(Self.consentPoints, id: \.0) { point in
                VStack(alignment: .leading, spacing: 3) {
                    Text(point.0).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(point.1).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        Toggle("Souhlasím, aby Aurin zpracovával moje údaje o zdraví, jak je popsáno výše.", isOn: $agree)
            .font(Typo.small).tint(Palette.green)
        Toggle("Posílat data do AI funkcí", isOn: $agreeAI)
            .font(Typo.small).tint(Palette.green)
        Link("Zásady ochrany soukromí", destination: Self.privacyURL).font(Typo.small)
    }

    private static let privacyURL = URL(string: "https://aurin.health/privacy")!

    // MARK: - Odkud brát data

    @ViewBuilder
    private var sourcesPage: some View {
        title("Odkud brát data")
        SectionLabel(text: "Zdravotní data").padding(.top, 6)
        SettingsGroup {
            if health.isAvailable {
                appleRow
                SettingsDivider()
            }
            if let google = provider("google") { sourceRow(google) }
            ForEach(listed(["ultrahuman", "whoop"]), id: \.id) { p in
                SettingsDivider()
                sourceRow(p)
            }
        }
        SectionLabel(text: "Tréninkové aplikace").padding(.top, 10)
        SettingsGroup {
            if let intervals = provider("intervals") { sourceRow(intervals) }
            ForEach(listed(["wahoo"]), id: \.id) { p in
                SettingsDivider()
                sourceRow(p)
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
        if let message = health.message {
            Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
        }
        if consentNeeded { consentRow.padding(.top, 10) }
    }

    /// Apple Health: a switch, on by default; turning it on asks iOS for the
    /// permissions (the health categories plus the profile, AppleHealthProfile).
    private var appleRow: some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: "apple", size: 30)
            if appleWorking {
                Text("Apple Health").font(.body).foregroundStyle(Palette.ink)
                Spacer()
                ProgressView().padding(.trailing, 16)
            } else {
                SettingsToggle(title: "Apple Health", isOn: $appleOn).padding(.leading, -16)
            }
        }
        .padding(.leading, 16)
        .frame(minHeight: 56)
    }

    private func sourceRow(_ provider: ConnectionsResponse.Provider) -> some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: provider.id, size: 30)
            Text(provider.name ?? provider.id).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            if provider.connected == true {
                Label("připojeno", systemImage: "checkmark").font(Typo.small).foregroundStyle(Palette.green)
            } else {
                Button { connecting = ConnectTarget(id: provider.id) } label: { connectLabel }
                    .buttonStyle(.plain)
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

    /// Two checkboxes (the same POST /app/api/consent as the consent page):
    /// the health-data consent, needed to go on, with the policy next to it,
    /// and the optional one for the AI features.
    private var consentRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                checkbox("Souhlasím se zpracováním zdravotních dat", note: nil, isOn: $agree)
                Spacer(minLength: 8)
                Link("Zásady", destination: Self.privacyURL).font(Typo.bodyStrong).foregroundStyle(Palette.blue)
            }
            checkbox("Posílat data do AI funkcí",
                     note: "Kouč a rozpoznání jídla pošlou potřebné údaje o zdraví a fotky, které jim pošleš, společnosti OpenAI v USA. Jde to vypnout v Nastavení.",
                     isOn: $agreeAI)
        }
    }

    private func checkbox(_ title: LocalizedStringKey, note: LocalizedStringKey?, isOn: Binding<Bool>) -> some View {
        Button { isOn.wrappedValue.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isOn.wrappedValue ? "checkmark.square.fill" : "square")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundStyle(isOn.wrappedValue ? Palette.green : Palette.faint)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(Typo.small).foregroundStyle(Palette.ink)
                    if let note { Text(note).font(Typo.caption).foregroundStyle(Palette.secondary) }
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(L10n.tr(isOn.wrappedValue ? "zapnuto" : "vypnuto"))
    }

    /// The listed services the server offers (configured or connected), in this order.
    private func listed(_ ids: [String]) -> [ConnectionsResponse.Provider] {
        ids.compactMap { id in providers.first { $0.id == id } }
    }

    /// Google and Intervals.icu, also before /app/api/connections answers.
    private func provider(_ id: String) -> ConnectionsResponse.Provider? {
        if let known = providers.first(where: { $0.id == id }) { return known }
        let names = ["google": "Google Health", "intervals": "Intervals.icu"]
        guard let name = names[id] else { return nil }
        return ConnectionsResponse.Provider(id: id, name: name, connected: false, configured: nil, missingPermissions: nil, metrics: nil, note: nil)
    }

    private var syncLine: String? {
        switch syncState {
        case "running": return L10n.tr("Načítám historii. Můžeš pokračovat.")
        case "done": return L10n.tr("Historie je načtená.")
        case "partial", "error": return L10n.tr("Část historie se nepodařilo načíst. Import zopakuješ v Nastavení → Zdroje dat.")
        default: return nil
        }
    }

    // MARK: - O tobě

    /// Where the prefilled values came from, for the line above the fields.
    private var prefillSource: String? {
        if appleFilled { return "apple" }
        if !suggested.isEmpty || prefilledWeight != nil { return "google" }
        return nil
    }

    @ViewBuilder
    private var aboutPage: some View {
        title("O tobě")
        SettingsGroup {
            if let source = prefillSource {
                HStack(spacing: 10) {
                    IntegrationIcon(id: source, size: 24)
                    Text(source == "apple" ? "Z Apple Health jsme vzali:" : "Z Google Health jsme vzali:")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                SettingsDivider()
            }
            SettingsPicker(title: "Pohlaví", selection: $sex, options: [("male", "Muž"), ("female", "Žena")])
            SettingsDivider()
            SettingsField(title: "Narození", text: $birthYear, keyboard: .numberPad, placeholder: "Rok")
            SettingsDivider()
            SettingsField(title: "Výška", text: $heightText, unit: Units.lengthUnit, keyboard: Units.imperial ? .decimalPad : .numberPad)
            SettingsDivider()
            SettingsField(title: "Váha", text: $weightText, unit: Units.weightUnit, keyboard: .decimalPad)
        }
        .onChange(of: birthYear) { _, value in birthYear = String(value.filter(\.isNumber).prefix(4)) }
    }

    private func title(_ text: String) -> some View {
        Text(text).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Flow

    private func next() async {
        error = nil
        switch page {
        case .consent:
            _ = await giveConsent()
        case .sources:
            if consentNeeded {
                let given = await giveConsent()
                if !given { return }
            }
            if appleOn && !health.enabled { await connectApple() }
            withAnimation { index += 1 }
        case .about:
            await finish()
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
            if let v = p["age"]?.number { birthYear = String(Self.currentYear - Int(v)) }
            if let v = p["height"]?.number { heightText = Self.lengthText(v) }
            apply(s)
        }
        appleOn = health.isAvailable
        ready = true
        guard !consentOnly else { return }
        await loadProviders()
        if providers.contains(where: { $0.connected == true }) { syncRun += 1 }
    }

    private static var currentYear: Int { Calendar.current.component(.year, from: Date()) }

    /// Height in the chosen units as the field shows it, from centimetres.
    private static func lengthText(_ cm: Double) -> String {
        Fmt.decimal(Units.length(cm), digits: Units.imperial ? 1 : 0)
    }

    /// Weight in the chosen units as the field shows it, from kilograms.
    private static func weightTextOf(_ kg: Double) -> String {
        Fmt.decimal(Units.weight(kg), digits: 1)
    }

    /// A field's number, with a comma or a dot; nil when empty or not a number.
    private static func number(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        return t.isEmpty ? nil : Double(t)
    }

    /// Fills in what the services suggest (height, the age from the birth
    /// date, the latest weight) where the field is empty or still shows the
    /// earlier suggestion; what the user typed, or Apple Health gave, stays.
    private func apply(_ s: SetupStatus) {
        guard !appleFilled else { return }
        let saved = s.savedProfile ?? [:], profile = s.profile ?? [:], suggestions = s.suggestions ?? [:]
        if saved["height"]?.number == nil, heightText.isEmpty || heightText == suggested["height"], let v = profile["height"]?.number {
            heightText = Self.lengthText(v.rounded())
            suggested["height"] = heightText
        }
        if saved["age"]?.number == nil, suggestions["birthDate"]?.string != nil, birthYear.isEmpty || birthYear == suggested["age"], let v = profile["age"]?.number {
            birthYear = String(Self.currentYear - Int(v))
            suggested["age"] = birthYear
        }
        if weightText.isEmpty || weightText == prefilledWeight, let v = s.weightKg {
            weightText = Self.weightTextOf((v * 2).rounded() / 2)
            prefilledWeight = weightText
        }
    }

    /// The "Apple Health" switch: one iOS sheet for the health categories and
    /// the profile, then the history loads in the background (AppleHealth).
    private func connectApple() async {
        guard health.isAvailable, !health.enabled, !appleWorking else { return }
        appleWorking = true
        do {
            try await AppleHealthProfile.requestAccess(Set(HealthCategory.allCases))
        } catch {
            appleWorking = false
            health.message = error.localizedDescription
            appleOn = false
            return
        }
        appleWorking = false
        appleRead = false
        let api = model.api
        Task { _ = await health.connect(Set(HealthCategory.allCases), api: api) }
    }

    /// "O tobě" opens: sex, year of birth, height and weight from Apple Health
    /// when it is allowed; they go over the server's suggestions.
    private func readAppleProfile() async {
        guard health.enabled, !appleRead else { return }
        appleRead = true
        let p = await AppleHealthProfile.read()
        guard !p.isEmpty else { return }
        if let v = p.sex, sex.isEmpty { sex = v; appleFilled = true }
        if let v = p.birthYear, birthYear.isEmpty || birthYear == suggested["age"] {
            birthYear = String(v)
            suggested["age"] = nil
            appleFilled = true
        }
        if let v = p.heightCm, heightText.isEmpty || heightText == suggested["height"] {
            heightText = Self.lengthText(v)
            suggested["height"] = nil
            appleFilled = true
        }
        if let v = p.weightKg, weightText.isEmpty || weightText == prefilledWeight {
            weightText = Self.weightTextOf(v)
            prefilledWeight = weightText
            appleFilled = true
        }
    }

    /// Returns false when the consent could not be saved (the error is shown).
    private func giveConsent() async -> Bool {
        saving = true
        defer { saving = false }
        do {
            try await model.api.giveHealthConsent(ai: agreeAI)
            if consentOnly {
                await model.finishSetup()
            } else {
                consentNeeded = false
            }
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    private func loadProviders() async {
        if let list = try? await model.api.connections() { providers = list.providers }
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
        // A suggestion left alone goes back empty and stays automatic, as on the web.
        let keep = { (key: String, text: String, json: JSONValue) -> JSONValue in
            suggested[key] == text ? .string("") : json
        }
        var profile: JSONObject = ["sex": .string(sex)]
        let year = Int(birthYear.trimmingCharacters(in: .whitespaces)) ?? 0
        if year > 1900, year <= Self.currentYear - 10 {
            let age = Self.currentYear - year
            profile["age"] = keep("age", birthYear, .number(Double(age)))
        } else {
            profile["age"] = .null
        }
        if let shown = Self.number(heightText) {
            profile["height"] = keep("height", heightText, .number(Units.cm(shown).rounded()))
        } else {
            profile["height"] = .null
        }
        // The weight already known is not saved again as today's.
        var newWeight: Double?
        if weightText != prefilledWeight, let shown = Self.number(weightText) {
            newWeight = (Units.kg(shown) * 10).rounded() / 10
        }
        do {
            try await model.api.completeOnboarding(profile: profile, weightKg: newWeight, training: JSONObject())
            await askForNotifications()
            await model.finishSetup()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The morning readiness, the coach's messages and the reminders are on by
    /// default, but iOS delivers none of them until it is allowed: the system
    /// asks once here, before Today, unless it was answered already (as in
    /// Nastavení → Oznámení). The push token follows the answer.
    private func askForNotifications() async {
        if await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .notDetermined {
            _ = await Reminders.requestPermission()
        }
        await PushRegistration.refresh(api: model.api)
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
