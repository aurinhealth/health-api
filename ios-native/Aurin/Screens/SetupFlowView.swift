import SwiftUI
import UserNotifications

/// After the first sign-in: the consent to health data with the separate one
/// to the AI features ("Tvoje data o zdraví"), where the data comes from
/// ("Odkud brát data": Apple Health, Google Health, the Ultrahuman Ring, WHOOP,
/// Intervals.icu, Wahoo), who you are ("O tobě": sex, year of birth, height and
/// weight, filled in from Apple Health or the server's suggestions) and what
/// the notifications bring, before iOS asks once. Everything else (the day,
/// goals, training, sleep) lives in Settings. An account set up earlier that
/// still owes the consent sees only the consent page.
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
    /// The year of birth on its wheel, open under "Narození".
    @State private var yearWheel = false
    // Consent
    @State private var consentFirst = false
    @State private var consentOnly = false
    @State private var agree = false
    // Sending what an AI feature needs to OpenAI: its own choice, never ticked
    // in advance (GDPR, App Review 5.1.2(i), WHOOP API terms 4.2.1).
    @State private var agreeAI = false
    /// iOS has not asked about notifications yet: the page about them comes last.
    @State private var askNotifications = false
    // Data sources
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

    private enum Page: Equatable { case consent, sources, about, notifications }

    private var pages: [Page] {
        if consentOnly { return [.consent] }
        return (consentFirst ? [.consent] : []) + [.sources, .about] + (askNotifications ? [.notifications] : [])
    }
    private var page: Page { pages[min(index, pages.count - 1)] }
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    // No way back to a consent already given, or from the notifications
                    // to a profile already saved.
                    if index > 0 && pages[index - 1] != .consent && page != .notifications {
                        CircleButton(systemImage: "chevron.left", label: "Zpět") { withAnimation { index -= 1 } }
                    }
                    Spacer()
                    // Without the consent the app cannot be used: the way out is signing out,
                    // or back to the paused screen when health data was paused (HealthPausedView).
                    if page == .consent && model.resumingHealth {
                        Button("Zrušit") { model.resumingHealth = false; model.needsSetup = false }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    } else if page == .consent {
                        Button("Odhlásit") { Task { await model.logout() } }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
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
                if page == .consent && ready && !agree {
                    // Why "Pokračovat" is grey, right above it.
                    Label("Zaškrtni první políčko, ať můžeš pokračovat.", systemImage: "info.circle")
                        .font(Typo.small.weight(.medium)).foregroundStyle(Palette.amber)
                        .padding(.bottom, 10)
                }
                PrimaryButton(title: buttonTitle, busy: saving || appleWorking) { Task { await next() } }
                    .disabled(saving || appleWorking || !ready || (page == .about && !aboutComplete) || (page == .consent && !agree))
                if page == .sources {
                    // "Teď ne" skips connecting, not "O tobě": without age, height and
                    // weight nothing (calories, strain, recovery) can be worked out.
                    Button("Teď ne") { withAnimation { index += 1 } }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .disabled(!ready)
                }
                if page == .notifications {
                    Button("Později") { Task { await done(notifications: false) } }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .disabled(saving)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .task { await load() }
        .task(id: syncRun) { if syncRun > 0 { await followSync() } }
        .task(id: index) { if page == .about { await readAppleProfile() } }
        .sheet(item: $connecting) { target in ServiceConnectSheet(target: target) { await loadProviders(); syncRun += 1 } }
        .interactiveDismissDisabled()
    }

    private var buttonTitle: String {
        if saving { return "Ukládám…" }
        if appleWorking { return "Moment…" }
        switch page {
        case .about: return "Hotovo"
        case .notifications: return "Zapnout"
        default: return "Pokračovat"
        }
    }

    @ViewBuilder
    private var content: some View {
        switch page {
        case .consent: consentPage
        case .sources: sourcesPage
        case .about: aboutPage
        case .notifications: notificationsPage
        }
    }

    // MARK: - Consent (accounts set up before the consent, after a version bump)

    // The same points as the web's consent (consentDataList in dashboard-client.js).
    private static let consentPoints: [(String, String)] = [
        ("Co", "Tep, variabilita tepu (HRV), spánek, váha a tělesný tuk, jídlo a pití, tréninky a jak ti šly."),
        ("Odkud", "Ze služeb, které připojíš (Apple Health, Google Health, Intervals.icu), a z toho, co zadáš sám."),
        ("K čemu", "Jen k přehledům, výpočtům a plánům v Aurinu. Data neprodáváme a nepoužíváme k reklamě."),
        ("AI", "Když použiješ AI funkci (asistent, rozpoznání jídla z fotky, hodnocení tréninku a týdne), pošle Aurin potřebné údaje, včetně údajů o zdraví a fotek, které pošleš, společnosti OpenAI v USA."),
        ("Odvolání", "Pozastavením zdravotních dat, nebo smazáním účtu v Nastavení → Soukromí a data, kde si předtím můžeš stáhnout všechna svoje data.")
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
        checkbox("Souhlasím, aby Aurin zpracovával moje údaje o zdraví, jak je popsáno výše.", note: nil, isOn: $agree)
            .padding(.top, 4)
        checkbox("Posílat data do AI funkcí",
                 note: "Nepovinné. Potřebuje je kouč a rozpoznání jídla. Jde to vypnout v Nastavení.",
                 isOn: $agreeAI)
        Link("Zásady ochrany soukromí", destination: Self.privacyURL).font(Typo.small)
    }

    private static let privacyURL = URL(string: "https://aurin.health/privacy")!

    // MARK: - Odkud brát data

    @ViewBuilder
    private var sourcesPage: some View {
        title("Odkud brát data")
        if ready { sourceGroups } else { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
    }

    @ViewBuilder
    private var sourceGroups: some View {
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
                if syncShown == "running" { ProgressView() } else {
                    Image(systemName: syncShown == "done" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(syncShown == "done" ? Palette.green : Palette.amber)
                }
                Text(line).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        if let message = health.message {
            Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Apple Health: "Připojit" like the other rows, with a line on what it
    /// reads; the tap asks iOS for the permissions (the health categories plus
    /// the profile, AppleHealthProfile).
    private var appleRow: some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: "apple", size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Health").font(.body).foregroundStyle(Palette.ink)
                if !health.enabled {
                    Text("Čte spánek, tep, HRV, tréninky, váhu a jídlo. Bez zeptání nic nezapisuje.")
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if appleWorking {
                ProgressView()
            } else if health.enabled {
                Label("připojeno", systemImage: "checkmark").font(Typo.small).foregroundStyle(Palette.green)
            } else {
                Button { Task { await connectApple() } } label: { connectLabel }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
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

    private func checkbox(_ title: LocalizedStringKey, note: LocalizedStringKey?, isOn: Binding<Bool>) -> some View {
        Button { isOn.wrappedValue.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isOn.wrappedValue ? "checkmark.square.fill" : "square")
                    .scaledFont(24, weight: .regular)
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

    /// The import of a connected service, or Apple Health's first sync.
    private var syncShown: String? { syncState ?? (health.syncing ? "running" : nil) }

    private var syncLine: String? {
        switch syncShown {
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
            HStack(spacing: 12) {
                Text("Pohlaví").font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Picker("Pohlaví", selection: $sex) {
                    Text("Muž").tag("male")
                    Text("Žena").tag("female")
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 170)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            SettingsDivider()
            yearRow
            SettingsDivider()
            SettingsField(title: "Výška", text: $heightText, unit: Units.lengthUnit, keyboard: Units.imperial ? .decimalPad : .numberPad)
            if let hint = heightHint { fieldHint(hint) }
            SettingsDivider()
            SettingsField(title: "Váha", text: $weightText, unit: Units.weightUnit, keyboard: .decimalPad)
            if let hint = weightHint { fieldHint(hint) }
        }
        Text("Aurin potřebuje věk, výšku a váhu, aby spočítal kalorie, námahu a zotavení. Pohlaví mění výpočet kalorií a tepových zón.")
            .font(Typo.small).foregroundStyle(Palette.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
    }

    /// "Narození": the year on a wheel (no keyboard, so no year that cannot be),
    /// open under the row after a tap.
    @ViewBuilder
    private var yearRow: some View {
        Button {
            if birthYear.isEmpty { birthYear = String(Self.currentYear - 30) }
            withAnimation(.easeInOut(duration: 0.25)) { yearWheel.toggle() }
        } label: {
            HStack(spacing: 6) {
                Text("Narození").font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(birthYear.isEmpty ? L10n.tr("Rok") : birthYear).font(.body)
                    .foregroundStyle(birthYear.isEmpty ? Palette.faint : Palette.ink)
                Image(systemName: yearWheel ? "chevron.up" : "chevron.down")
                    .scaledFont(12, weight: .semibold).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if yearWheel {
            Picker("Narození", selection: Binding(get: { Int(birthYear) ?? Self.currentYear - 30 }, set: { birthYear = String($0) })) {
                ForEach(Array(Self.birthYears.reversed()), id: \.self) { year in
                    Text(verbatim: String(year)).tag(year)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 150)
            .clipped()
        }
    }

    private func fieldHint(_ text: String) -> some View {
        Label(text, systemImage: "info.circle")
            .font(Typo.small.weight(.medium)).foregroundStyle(Palette.rust)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16).padding(.bottom, 12)
    }

    /// The plausible years of birth: from 100 years ago to 10 years ago.
    private static var birthYears: ClosedRange<Int> { (currentYear - 100)...(currentYear - 10) }
    /// Plausible heights and weights, in centimetres and kilograms.
    private static let heights: ClosedRange<Double> = 120...230
    private static let weights: ClosedRange<Double> = 30...250

    /// Said under the field when what was typed is not a plausible height.
    private var heightHint: String? {
        guard !heightText.isEmpty else { return nil }
        if let shown = Self.number(heightText), Self.heights.contains(Units.cm(shown)) { return nil }
        return L10n.f("Zadej výšku mezi %@ a %@.", Units.lengthText(Self.heights.lowerBound), Units.lengthText(Self.heights.upperBound))
    }

    private var weightHint: String? {
        guard !weightText.isEmpty else { return nil }
        if let shown = Self.number(weightText), Self.weights.contains(Units.kg(shown)) { return nil }
        return L10n.f("Zadej váhu mezi %@ a %@.", Units.weightText(Self.weights.lowerBound, digits: 0), Units.weightText(Self.weights.upperBound, digits: 0))
    }

    /// Sex, a plausible year of birth, height and weight: "Hotovo" waits for all four.
    private var aboutComplete: Bool {
        guard !sex.isEmpty, let year = Int(birthYear), Self.birthYears.contains(year) else { return false }
        guard !heightText.isEmpty, heightHint == nil, !weightText.isEmpty, weightHint == nil else { return false }
        return true
    }

    private func title(_ text: String) -> some View {
        Text(text).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Flow

    private func next() async {
        error = nil
        switch page {
        case .consent:
            if await giveConsent(), !consentOnly { withAnimation { index += 1 } }
        case .sources:
            withAnimation { index += 1 }
        case .about:
            guard await saveProfile() else { return }
            if askNotifications { withAnimation { index += 1 } } else { await done(notifications: false) }
        case .notifications:
            await done(notifications: true)
        }
    }

    /// What the server already knows (an earlier start on the web, the
    /// connected services), and whether the consent is still missing.
    private func load() async {
        guard !loaded else { return }
        loaded = true
        // Health data paused: only the consent again; the profile and the services stay as they were.
        if model.resumingHealth {
            consentFirst = true
            consentOnly = true
            ready = true
            return
        }
        let api = model.api
        // All three at once, and the page shows when all have answered, so the
        // services do not pop in one after another.
        async let status = try? api.setupStatus()
        async let consent = try? api.healthConsentNeeded()
        async let connections = try? api.connections()
        let s = await status
        let consentNeeded = await consent ?? false
        consentFirst = consentNeeded
        if let s {
            consentOnly = consentNeeded && s.completed == true
            let p = s.savedProfile ?? [:]
            if let v = p["sex"]?.string { sex = v }
            if let v = p["age"]?.number { birthYear = String(Self.currentYear - Int(v)) }
            if let v = p["height"]?.number { heightText = Self.lengthText(v) }
            apply(s)
        }
        askNotifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .notDetermined
        if let list = await connections { providers = list.providers }
        ready = true
        guard !consentOnly else { return }
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

    /// "Připojit" at Apple Health: one iOS sheet for the health categories and
    /// the profile, then the history loads in the background (AppleHealth).
    private func connectApple() async {
        guard health.isAvailable, !health.enabled, !appleWorking else { return }
        appleWorking = true
        do {
            try await AppleHealthProfile.requestAccess(HealthCategory.defaults)
        } catch {
            appleWorking = false
            health.message = error.localizedDescription
            return
        }
        appleWorking = false
        appleRead = false
        let api = model.api
        Task { _ = await health.connect(HealthCategory.defaults, api: api) }
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
            if consentOnly { await model.finishSetup() }
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

    /// "Hotovo" on "O tobě": the profile goes to the server. False when it could not (the error is shown).
    private func saveProfile() async -> Bool {
        saving = true
        defer { saving = false }
        // A suggestion left alone goes back empty and stays automatic, as on the web.
        let keep = { (key: String, text: String, json: JSONValue) -> JSONValue in
            suggested[key] == text ? .string("") : json
        }
        var profile: JSONObject = ["sex": .string(sex)]
        let year = Int(birthYear.trimmingCharacters(in: .whitespaces)) ?? 0
        if Self.birthYears.contains(year) {
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
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    /// The end of the setup. The morning readiness, the coach's messages and the
    /// reminders are on by default, but iOS delivers none of them until it is
    /// allowed, and it asks only once: so only after "Zapnout" on the page that
    /// shows what they bring ("Později" leaves the question for Nastavení →
    /// Oznámení). The push token follows the answer. Today then starts with
    /// the "První dny" card (FirstDaysCard).
    private func done(notifications: Bool) async {
        saving = true
        defer { saving = false }
        if notifications { _ = await Reminders.requestPermission() }
        await PushRegistration.refresh(api: model.api)
        FirstDays.start()
        await model.finishSetup()
    }

    // MARK: - Oznámení

    @ViewBuilder
    private var notificationsPage: some View {
        Text("Ozveme se, když na tom záleží")
            .font(Typo.sentence(34, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 24)
        Text("Každé ráno tvoje připravenost a kouč, když je potřeba změnit plán.")
            .font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
            .fixedSize(horizontal: false, vertical: true)
        VStack(spacing: 10) {
            NotificationPreview(title: L10n.tr("Připravenost 78 · vysoká"), text: L10n.tr("Dobrá noc, třetí den v řadě. Dnes naplno do posilovny."), time: "7:02")
            NotificationPreview(title: L10n.tr("Kouč"), text: L10n.tr("HRV je dva dny dole. Dnešní intervaly jsem posunul na čtvrtek."), time: "12:40")
            NotificationPreview(title: L10n.tr("Za 30 minut do postele"),
                                text: L10n.f("Na budík v %@ potřebuješ jít spát do %@.", ClockText.format("7:15"), ClockText.format("22:40")), time: "22:10")
        }
        .padding(.top, 14)
        .accessibilityElement(children: .combine)
    }
}

/// One of the sample notifications on the setup's last page, drawn like the
/// banner iOS shows: the app's mark, the title, the time and the text.
private struct NotificationPreview: View {
    let title: String
    let text: String
    /// "7:02", shown in the phone's 12/24-hour format.
    let time: String

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            AurinMark(size: 26)
                .frame(width: 38, height: 38)
                .background(Palette.cardLift, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Text(verbatim: ClockText.format(time)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Palette.card.opacity(0.92), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
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
        .scaledFont(15, weight: .semibold)
        .foregroundStyle(Palette.ink)
        .buttonStyle(.plain)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .cardSurface(cornerRadius: 18)
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
