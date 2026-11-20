import SwiftUI

/// After the first sign-in: the consent to health data with the separate one to
/// the AI features ("Tvoje data o zdraví"), where the data comes from ("Připoj
/// svoje data": Apple Health first, then WHOOP, the Ultrahuman Ring, Google
/// Health and Intervals.icu; Wahoo in Settings), who you are ("O tobě": sex,
/// year of birth, height and weight, filled in from Apple Health or the
/// server's suggestions) and the sports. The goal, the training days, where
/// one lifts and the notifications wait on Today in "Dokonči nastavení"
/// (FinishSetupCard, onboarding concept v38, part O). Everything else (the day,
/// sleep, food) lives in Settings. An account set up earlier that still owes
/// the consent sees only the consent page.
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
    /// The free week shown at the end (SetupProOffer).
    @State private var proOffer = false
    /// The account left the AI features off: the free week allows them with its button.
    @State private var proNeedsAI = false
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
    // The sports on "O tobě" (SportsPicker): what was chosen against what the
    // server had, and the saved profile they go into.
    @State private var focus = SetupFocus()
    @State private var focusSaved = SetupFocus()
    @State private var focusProfile: JSONObject?
    @State private var focusLoaded = false
    /// A page is turning: a second tap on "Pokračovat" meanwhile goes nowhere
    /// (a double tap skipped "Připoj svoje data", Tapwright 2026-11-19).
    @State private var turning = false

    private enum Page: Equatable { case consent, sources, about }

    private var pages: [Page] {
        if consentOnly { return [.consent] }
        return (consentFirst ? [.consent] : []) + [.sources, .about]
    }

    private var page: Page { pages[min(index, pages.count - 1)] }
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 0) {
                    // Both sides keep their width (the hidden button and label), so the
                    // steps between them stay put from page to page.
                    ZStack {
                        CircleButton(systemImage: "chevron.left", label: "Zpět").hidden()
                        // No way back to a consent already given.
                        if index > 0 && pages[index - 1] != .consent {
                            CircleButton(systemImage: "chevron.left", label: "Zpět") { turn(by: -1) }
                                .disabled(turning || saving)
                        }
                    }
                    // How far along: shown once the page count is known (whether the
                    // consent is owed), so it never jumps; not for the consent alone.
                    if ready && pages.count > 1 {
                        SetupSteps(done: index + 1, total: pages.count)
                    } else {
                        Spacer()
                    }
                    ZStack(alignment: .trailing) {
                        ForEach(["Odhlásit", "Zrušit"], id: \.self) { Text(L10n.tr($0)).font(Typo.bodyStrong).hidden() }
                        // Without the consent the app cannot be used: the way out is signing out,
                        // or back to the paused screen when health data was paused (HealthPausedView).
                        if page == .consent && model.resumingHealth {
                            Button("Zrušit") { model.resumingHealth = false; model.needsSetup = false }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        } else if page == .consent {
                            Button("Odhlásit") { Task { await model.logout() } }.font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        }
                    }
                }
                .frame(height: 40)

                // A plain ScrollView: PageScroll sizes its page to the screen
                // (containerRelativeFrame), 48 pt wider than this padded column,
                // which pushed the whole setup left and cut off "Odhlásit".
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                        .padding(.bottom, 20)
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
                if page == .consent && ready && !agree {
                    // Why "Pokračovat" is grey, right above it.
                    Label("Zaškrtni první políčko, ať můžeš pokračovat.", systemImage: "info.circle")
                        .font(Typo.small.weight(.medium)).foregroundStyle(Palette.amber)
                        .padding(.bottom, 10)
                }
                if appleOffered {
                    // Skips connecting, not "O tobě": without age, height and
                    // weight nothing (calories, strain, recovery) can be worked out.
                    Button("Pokračovat") { Task { await next() } }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .disabled(!ready || appleWorking || turning)
                } else {
                    PrimaryButton(title: buttonTitle, busy: saving || appleWorking || proOffer) { Task { await next() } }
                        .disabled(saving || appleWorking || proOffer || turning || !ready || (page == .about && !aboutComplete) || (page == .consent && !agree))
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .task { await load() }
        .task(id: syncRun) { if syncRun > 0 { await followSync() } }
        .task(id: index) {
            if page == .about {
                // The saved sports first (one quick request), so a tick is never made over them unseen.
                await loadFocus()
                await readAppleProfile()
            }
        }
        .sheet(item: $connecting) { target in ServiceConnectSheet(target: target) { await loadProviders(); syncRun += 1 } }
        // The free week, once, after the last page (SetupProOffer); Today when it closes.
        .fullScreenCover(isPresented: $proOffer, onDismiss: { Task { await model.finishSetup() } }) {
            PaywallView(close: { proOffer = false }, step: 2, notNow: true,
                        allowAI: proNeedsAI ? { [model] in try await model.api.allowAI(); model.setAIOff(false) } : nil)
        }
        .interactiveDismissDisabled()
    }

    private var buttonTitle: String {
        if saving { return "Ukládám…" }
        if appleWorking { return "Moment…" }
        return "Pokračovat"
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

    // What the health consent covers (CONSENT_VERSION in src/consent.js). The AI
    // has its own card below (AI_CONSENT_VERSION), so the optional consent names
    // OpenAI right at its box (release 1.0.1 point 1, App Review 5.1.2(i)).
    private static let consentPoints: [(String, String)] = [
        ("Co", "Tep, variabilita tepu (HRV), spánek, dech, okysličení krve, teplota ve spánku, kroky, váha a tělesný tuk, jídlo a pití, tréninky a jak ti šly a co si zapíšeš do deníku."),
        ("Odkud", "Ze služeb, které připojíš (třeba Apple Health, Google Health, WHOOP, prsten Ultrahuman, Intervals.icu nebo Wahoo), a z toho, co zadáš sám."),
        ("K čemu", "Jen k přehledům, výpočtům a plánům v Aurinu. Data neprodáváme a nepoužíváme k reklamě."),
        ("Odvolání", "Souhlas kdykoli odvoláš v Nastavení → Soukromí a data, nebo smažeš účet. Předtím si tam můžeš stáhnout všechna svoje data.")
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
        Card {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(AIConsentText.title).foregroundStyle(Palette.ink)
                    Text("(nepovinné)").foregroundStyle(Palette.muted)
                }
                .font(Typo.bodyStrong)
                Text(AIConsentText.body)
                    .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            checkbox("Posílat data, která AI funkce potřebují, společnosti OpenAI (USA)",
                     note: LocalizedStringKey(AIConsentText.note),
                     isOn: $agreeAI)
        }
        Link("Zásady ochrany soukromí", destination: L10n.legalURL("privacy")).font(Typo.small)
    }

    // MARK: - Připoj svoje data

    @ViewBuilder
    private var sourcesPage: some View {
        title("Připoj svoje data")
        if ready { sourceGroups } else { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
    }

    /// Apple Health on top as the one main step (release 1.0.1 point 3), the
    /// other sources under it, so WHOOP and Ultrahuman stay in view.
    @ViewBuilder
    private var sourceGroups: some View {
        if health.isAvailable { appleCard }
        SectionLabel(text: health.isAvailable ? "Další zdroje" : "Zdroje").padding(.top, 6)
        SettingsGroup {
            ForEach(Array(otherSources.enumerated()), id: \.element.id) { i, p in
                if i > 0 { SettingsDivider() }
                sourceRow(p)
            }
        }
        if !listed(["wahoo"]).isEmpty {
            Text("Wahoo připojíš v Nastavení → Zdroje dat.")
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
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

    /// The other sources in the mockup's order; WHOOP and Ultrahuman only when
    /// the server offers them, Wahoo only in Settings.
    private var otherSources: [ConnectionsResponse.Provider] {
        ["whoop", "ultrahuman", "google", "intervals"].compactMap(provider)
    }

    /// Apple Health with what it reads and its own button; the tap asks iOS
    /// for the permissions (the health categories plus the profile,
    /// AppleHealthProfile).
    private var appleCard: some View {
        Card {
            HStack(spacing: 12) {
                IntegrationIcon(id: "apple", size: 30)
                Text("Apple Health").font(.headline).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                if health.enabled {
                    Label("připojeno", systemImage: "checkmark").font(Typo.small).foregroundStyle(Palette.green)
                }
            }
            Text("Hodinky už posílají spánek, tep a tréninky do Apple Health. Aurin je čte, aby ti naplánoval den. Bez zeptání nic nezapisuje.")
                .font(Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                ForEach(["Spánek", "Tep a HRV", "Tréninky"], id: \.self) {
                    Pill(text: $0, foreground: Palette.secondary, background: Palette.background)
                }
            }
            if !health.enabled {
                PrimaryButton(title: "Připojit Apple Health", busy: appleWorking) { Task { await connectApple() } }
                    .disabled(appleWorking)
                    .padding(.top, 2)
            }
        }
    }

    /// Apple Health still waits for its button on its card: that is the main
    /// step, so "Pokračovat" under the page is a quiet text button.
    private var appleOffered: Bool { page == .sources && health.isAvailable && !health.enabled }

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

    /// Outlined: the one filled button on the page is Apple Health's.
    private var connectLabel: some View {
        Text("Připojit").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            .padding(.horizontal, 14).frame(height: 34)
            .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
            .contentShape(Capsule())
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
        // The sports, on the same page (concept v38): ticked or not, Hlavní
        // on the ones trained for most. None ticked is general fitness.
        Text("Tvoje sporty").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, 10).padding(.horizontal, 4)
        Text("Kouč skládá týden kolem tvých hlavních sportů.")
            .font(Typo.small).foregroundStyle(Palette.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
        SportsPicker(choice: $focus.sports)
        if focus.sports.swims {
            SwimLevelGroup(swims100: $focus.swims100)
        }
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

    /// The plausible years of birth: from 100 years ago to 16 years ago (the Terms: at least 16).
    private static var birthYears: ClosedRange<Int> { (currentYear - 100)...(currentYear - 16) }
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
        Text(text).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Flow

    private func next() async {
        // One tap at a time: the second of a double tap lands here while the first
        // still saves or the page still turns, and is dropped.
        guard !turning else { return }
        turning = true
        defer { settle() }
        error = nil
        switch page {
        case .consent:
            if await giveConsent(), !consentOnly { step() }
        case .sources:
            step()
        case .about:
            guard await saveProfile() else { return }
            // The sports go into the profile "O tobě" just saved.
            focusProfile = nil
            guard await saveFocus() else { return }
            await done()
        }
    }

    /// The next page, never past the last one.
    private func step() {
        withAnimation { index = min(index + 1, pages.count - 1) }
    }

    /// "Zpět": one page back, with the same pause as forward.
    private func turn(by delta: Int) {
        guard !turning else { return }
        turning = true
        withAnimation { index = max(0, index + delta) }
        settle()
    }

    /// Taps count again once the page has turned (the animation's length).
    private func settle() {
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            turning = false
        }
    }

    /// The sports saved earlier (a start on the web), once, when "O tobě" opens.
    private func loadFocus() async {
        guard !focusLoaded else { return }
        defer { focusLoaded = true }
        guard !model.demo, let p = try? await model.api.profile() else { return }
        // Only what was not chosen already is filled in.
        let saved = SetupFocus(profile: p)
        if focus == SetupFocus() { focus = saved }
        focusSaved = saved
    }

    /// The sports into the profile, as Zaměření saves them;
    /// nothing when they are as the server has them.
    private func saveFocus() async -> Bool {
        guard !model.demo, focus != focusSaved else { return true }
        saving = true
        defer { saving = false }
        do {
            let base: JSONObject
            if let focusProfile { base = focusProfile } else { base = try await model.api.profile() }
            var next = focus.applied(to: base)
            // None ticked is general fitness: the sports saved before go too.
            if focus.sports.kinds.isEmpty { next = focus.sports.applied(to: next) }
            try await model.api.saveProfile(next)
            try await FocusSheet.saveSwimLevel(model.api, sports: focus.sports, swims100: focus.swims100)
            focusProfile = next
            focusSaved = focus
            return true
        } catch {
            self.error = error.localizedDescription
            return false
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
        // Unknown (the server did not answer): the consent page first, as the server
        // takes no health data from an account without it (health_consent_required).
        let consentNeeded = await consent ?? true
        consentFirst = consentNeeded
        // The server said the consent is given: Apple Health may send (AppleHealth.run).
        if await consent == false { AppModel.healthConsentGiven = true }
        if let s {
            consentOnly = consentNeeded && s.completed == true
            let p = s.savedProfile ?? [:]
            if let v = p["sex"]?.string { sex = v }
            if let v = p["age"]?.number { birthYear = String(Self.currentYear - Int(v)) }
            if let v = p["height"]?.number { heightText = Self.lengthText(v) }
            apply(s)
        }
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
            // Apple Health may send from now on (AppleHealth.run).
            AppModel.healthConsentGiven = true
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

    /// "Pokračovat" on "O tobě": the profile goes to the server. False when it could not (the error is shown).
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

    /// The end of the setup. iOS asks about notifications only from their row
    /// on Today's "Dokonči nastavení" (FinishSetupCard), which then follows
    /// with "První dny" (FirstDaysCard), after the free week once when the
    /// account can still have it (SetupProOffer).
    private func done() async {
        saving = true
        defer { saving = false }
        // A phone where notifications were allowed before sends its token now.
        await PushRegistration.refresh(api: model.api)
        FinishSetup.start()
        FirstDays.start()
        if let needsAI = await SetupProOffer.due(model) {
            proNeedsAI = needsAI
            proOffer = true
        } else {
            await model.finishSetup()
        }
    }
}

/// How far the setup is: a thin bar of one piece a page, the ones done and
/// the one open in ink (point 6 of the competitor comparison, 4 Nov 2026).
struct SetupSteps: View {
    let done: Int
    let total: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<total, id: \.self) { i in
                Capsule().fill(i < done ? Palette.ink : Palette.track).frame(height: 4)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: done)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
        .accessibilityElement()
        .accessibilityLabel(L10n.f("Krok %lld z %lld", done, total))
    }
}

/// Point 7 of the competitor comparison (Petr, 4 Nov 2026): at the end of the
/// first setup the free week of Aurin Pro (PaywallView's own page) shows once,
/// only when Pro is on sale (not in the pilot, where everyone has it), the
/// account has no Pro and this Apple ID can still have the free week. With the
/// AI features left off it shows too, and its button allows them (release
/// 1.0.1 point 2, Petr 10 Nov 2026). "Teď ne" or the cross go to Today.
@MainActor
enum SetupProOffer {
    static let shownKey = "aurin.setupProOfferShown"

    /// When it was shown on this phone, for the Today coach card's Pro line
    /// (point 40, still to come) to keep away that day: never two offers at once.
    static var shownAt: Date? { UserDefaults.standard.object(forKey: shownKey) as? Date }

    /// One GET /app/api/subscription after the last page, waited for at most
    /// 3 s so a weak signal never holds the way to Today. Nil when it is not
    /// shown, else whether the AI features are still off; a value marks it shown.
    static func due(_ model: AppModel) async -> Bool? {
        guard !model.demo, shownAt == nil else { return nil }
        let api = model.api
        let due = await withTaskGroup(of: Bool?.self) { group in
            group.addTask { await check(api) }
            group.addTask { try? await Task.sleep(for: .seconds(3)); return nil }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
        if due != nil { UserDefaults.standard.set(Date(), forKey: shownKey) }
        return due
    }

    private static func check(_ api: APIClient) async -> Bool? {
        guard let status = try? await api.subscription(), !status.pilot, !status.purchased else { return nil }
        let store = ProStore.shared
        await store.load()
        return store.trialEligible && !store.entitled ? status.aiConsent != true : nil
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
