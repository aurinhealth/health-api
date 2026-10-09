import SwiftUI
import UserNotifications

// The pages behind the Settings menu. Each edits a copy and saves with the
// "Uložit" button in the bar; the server checks the values again.

/// "Uložit" in the navigation bar, greyed out until something changed.
struct SaveButton: ToolbarContent {
    let enabled: Bool
    let saving: Bool
    let action: () -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if saving {
                ProgressView()
            } else {
                Button("Uložit", action: action)
                    .font(.subheadline.weight(.semibold))
                    .disabled(!enabled)
            }
        }
    }
}

/// A picker row: title on the left, the chosen option on the right (menu).
struct SettingsPicker: View {
    let title: String
    @Binding var selection: String
    let options: [(String, String)]

    /// A menu with its own one-line label: the system menu picker wraps long
    /// names over the title.
    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(.body).foregroundStyle(Palette.ink).layoutPriority(1)
            Spacer(minLength: 8)
            Menu {
                Picker(title, selection: $selection) {
                    if !options.contains(where: { $0.0 == selection }) { Text("nevybráno").tag(selection) }
                    ForEach(options.indices, id: \.self) { i in Text(options[i].1).tag(options[i].0) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(options.first { $0.0 == selection }?.1 ?? "nevybráno")
                        .font(.subheadline).foregroundStyle(Palette.muted)
                        .lineLimit(1).truncationMode(.tail)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 50)
    }
}

// MARK: - Profile

struct ProfileSettingsView: View {
    let store: SettingsStore
    @State private var sex = ""
    @State private var age = ""
    @State private var height = ""
    @State private var hrmax = ""
    @State private var rhr = ""
    @State private var activity = ""
    @State private var sportHours = ""
    @State private var goal = ""
    @State private var targetWeight = ""
    @State private var original: JSONObject = [:]

    static let activities = [("sedentary", "Sedavá práce"), ("light", "Lehce aktivní"), ("active", "Aktivní"), ("heavy", "Fyzicky náročná práce")]
    static let sportHourOptions = [("auto", "podle záznamů"), ("0", "žádný"), ("1-3", "1–3 h"), ("3-6", "3–6 h"), ("6-10", "6–10 h"), ("10+", "víc než 10 h")]
    /// "hubnout 0,5 kg týdně", in pounds when the units are imperial.
    static var goals: [(String, String)] {
        func lose(_ kg: Double, _ digits: Int) -> String {
            L10n.f("hubnout %@ týdně", Units.weightText(kg, digits: Units.imperial ? 1 : digits))
        }
        return [("lose_0.25", lose(0.25, 2)), ("lose_0.5", lose(0.5, 1)), ("lose_0.75", lose(0.75, 2)), ("lose_1", lose(1, 0)),
                ("maintain", L10n.tr("udržovat váhu"))]
    }

    var body: some View {
        SettingsPage(title: "Profil") {
            SettingsGroup(title: "Tělo", footer: "Z pohlaví, věku, výšky a váhy se počítá klidový výdej a denní cíl kalorií.") {
                SettingsPicker(title: "Pohlaví", selection: $sex, options: [("male", "muž"), ("female", "žena")])
                SettingsDivider()
                if hasBirthDate {
                    SettingsRow(title: "Věk", value: age.isEmpty ? "–" : L10n.f("%@ let", age), chevron: false)
                } else {
                    SettingsField(title: "Věk", text: $age, unit: "let", keyboard: .numberPad)
                }
                SettingsDivider()
                SettingsField(title: "Výška", text: $height, unit: Units.lengthUnit, keyboard: Units.imperial ? .decimalPad : .numberPad)
            }
            SettingsGroup(title: "Tep", footer: "Prázdné hodnoty dopočítá Loadwise z tvých tréninků a nocí.") {
                SettingsField(title: "Maximální tep", text: $hrmax, unit: "bpm", keyboard: .numberPad)
                SettingsDivider()
                SettingsField(title: "Klidový tep", text: $rhr, unit: "bpm", keyboard: .numberPad)
            }
            SettingsGroup(title: "Aktivita a cíl") {
                SettingsPicker(title: "Běžný den", selection: $activity, options: Self.activities)
                SettingsDivider()
                SettingsPicker(title: "Sport týdně", selection: $sportHours, options: Self.sportHourOptions)
                SettingsDivider()
                SettingsPicker(title: "Cíl", selection: $goal, options: Self.goals)
                SettingsDivider()
                SettingsField(title: "Cílová váha", text: $targetWeight, unit: Units.weightUnit)
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
    }

    private var hasBirthDate: Bool { store.profile["birthDate"]?.string != nil }

    private func fill() {
        let p = store.profile
        sex = p["sex"]?.string ?? ""
        age = p["age"]?.string ?? ""
        height = Units.imperial
            ? (p["height"]?.number).map { Fmt.decimal(Units.length($0), digits: 1) } ?? ""
            : p["height"]?.string ?? ""
        hrmax = p["hrmax"]?.string ?? ""
        rhr = p["rhr"]?.string ?? ""
        activity = p["activity"]?.string ?? ""
        sportHours = p["sportHours"]?.string ?? ""
        goal = p["goal"]?.string ?? ""
        targetWeight = (p["targetWeight"]?.number).map { (kg: Double) -> String in
            let shown = Units.weight(kg)
            return Fmt.decimal(shown, digits: shown.rounded() == shown ? 0 : 1)
        } ?? ""
        original = changes
    }

    private var changes: JSONObject {
        var c: JSONObject = [
            "sex": .string(sex), "height": Self.metric(height, Units.cm, scale: 1), "hrmax": .field(hrmax), "rhr": .field(rhr),
            "activity": .string(activity), "sportHours": .string(sportHours), "goal": .string(goal), "targetWeight": Self.metric(targetWeight, Units.kg, scale: 10)
        ]
        if !hasBirthDate { c["age"] = .field(age) }
        return c
    }

    /// A value typed in the chosen unit, sent in metric (rounded to 1/scale).
    private static func metric(_ text: String, _ toMetric: (Double) -> Double, scale: Double) -> JSONValue {
        let value = JSONValue.field(text)
        guard Units.imperial, case .number(let shown) = value else { return value }
        return .number((toMetric(shown) * scale).rounded() / scale)
    }

    private func save() async {
        if await store.saveProfile(changes) { fill() }
    }
}

// MARK: - Goals

struct GoalsSettingsView: View {
    let store: SettingsStore
    @State private var mainSport = "general"
    @State private var sportGoal = ""
    @State private var eventName = ""
    @State private var hasEvent = false
    @State private var eventDate = Date()
    @State private var weeklyHours = ""
    @State private var original: JSONObject = [:]

    static let sports = [("cycling", "cyklistika"), ("running", "běh"), ("triathlon", "triatlon"), ("strength", "silový trénink"), ("general", "všeobecná kondice")]

    var body: some View {
        SettingsPage(title: "Cíle") {
            SettingsGroup(title: "Sport", footer: "Trenér podle hlavního sportu volí tréninky a ostatní sporty bere jako doplněk.") {
                SettingsPicker(title: "Hlavní sport", selection: $mainSport, options: Self.sports)
                SettingsDivider()
                SettingsField(title: "Hodin týdně", text: $weeklyHours, unit: "h")
                SettingsDivider()
                TextField("Cíl vlastními slovy, třeba „zaběhnout půlmaraton pod 1:40“", text: $sportGoal, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
            SettingsGroup(title: "Hlavní závod", footer: "Podle data závodu se plánují fáze přípravy: základ, rozvoj v posledních 12 týdnech a ladění v posledním týdnu.") {
                SettingsToggle(title: "Mám hlavní závod", isOn: $hasEvent)
                if hasEvent {
                    SettingsDivider()
                    SettingsField(title: "Název", text: $eventName, keyboard: .default, placeholder: L10n.tr("Pražský půlmaraton"))
                    SettingsDivider()
                    DatePicker("Datum", selection: $eventDate, in: Date()..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                }
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func fill() {
        let p = store.profile
        mainSport = p["mainSport"]?.string ?? "general"
        sportGoal = p["sportGoal"]?.string ?? ""
        eventName = p["eventName"]?.string ?? ""
        let date = p["eventDate"]?.string.flatMap { Self.isoDay.date(from: $0) }
        hasEvent = date != nil || !eventName.isEmpty
        eventDate = date ?? Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
        weeklyHours = (p["weeklyHours"]?.number).map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) } ?? ""
        original = changes
    }

    private var changes: JSONObject {
        [
            "mainSport": .string(mainSport),
            "sportGoal": .string(sportGoal),
            "eventName": .string(hasEvent ? eventName : ""),
            "eventDate": .string(hasEvent ? Self.isoDay.string(from: eventDate) : ""),
            "weeklyHours": .field(weeklyHours)
        ]
    }

    private func save() async {
        if await store.saveProfile(changes) { fill() }
    }
}

// MARK: - Data sources

struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var syncing = false
    @State private var working: String?
    @State private var message: String?
    @State private var googleDisclosure = false
    @State private var intervalsKey = false
    @State private var disconnecting: ConnectionsResponse.Provider?

    var body: some View {
        SettingsPage(title: "Zdroje dat") {
            // Access refused at the last sync, or Google permissions missing.
            if !store.problems.isEmpty {
                SettingsGroup(title: "Připojit znovu") {
                    ForEach(Array(store.problems.enumerated()), id: \.element.id) { index, provider in
                        if index > 0 { SettingsDivider() }
                        Button { start(provider.id) } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.triangle.fill", color: Palette.rust), title: provider.name ?? provider.id,
                                        subtitle: provider.problemText, value: working == provider.id ? L10n.tr("připojuji…") : nil)
                        }
                        .buttonStyle(.plain)
                        .disabled(working != nil || store.demo)
                    }
                }
            }

            SettingsGroup(title: "Připojené", footer: "Přihlášení proběhne na stránce Googlu nebo Intervals.icu a pak se vrátíš sem.") {
                ForEach(Array(store.connections.enumerated()), id: \.element.id) { index, provider in
                    if index > 0 { SettingsDivider() }
                    Menu {
                        Button { start(provider.id) } label: {
                            Label(L10n.tr(provider.connected == true ? "Připojit znovu" : "Připojit"), systemImage: "link")
                        }
                        if provider.id == "intervals" {
                            Button { intervalsKey = true } label: { Label("Vložit API klíč", systemImage: "key") }
                        }
                        if provider.connected == true {
                            Button(role: .destructive) { disconnecting = provider } label: { Label("Odpojit", systemImage: "link.badge.minus") }
                        }
                    } label: {
                        SettingsRow(icon: icon(provider.id), title: provider.name ?? provider.id, subtitle: subtitle(provider),
                                    value: working == provider.id ? "připojuji…" : provider.needsAttention ? "připojit znovu" : provider.connected == true ? "připojeno" : "připojit")
                    }
                    .disabled(working != nil || store.demo)
                }
                if !store.connections.isEmpty { SettingsDivider() }
                SettingsRow(icon: SettingsIcon(systemImage: "heart.fill", color: Color(light: 0xE5484D, dark: 0xF2777A)), title: "Apple Health",
                            subtitle: "přímé čtení z iPhonu přijde v dalším kroku; data z hodinek zatím chodí přes Intervals.icu", value: nil, chevron: false)
            }

            SettingsGroup {
                Button {
                    Task { syncing = true; await store.syncNow(); syncing = false }
                } label: {
                    HStack {
                        Text(syncing ? "Synchronizuji…" : "Synchronizovat teď").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if syncing { ProgressView() } else if let at = lastSync { Text(at).font(.subheadline).foregroundStyle(Palette.muted) }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                }
                .buttonStyle(.plain)
                .disabled(syncing || store.demo)
                // The last sync left a source out (src/dashboard-sync.js results, googleStatus).
                if !syncing, let failed = store.sync?.failedSources, !failed.isEmpty {
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust), title: "Poslední synchronizace s chybou",
                                subtitle: failed.joined(separator: ", "), chevron: false)
                }
            }

            if let message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(isPresented: $googleDisclosure) { GoogleDisclosureSheet {
            googleDisclosure = false
            // The browser sheet opens once this one has closed.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { connect("google") }
        } }
        .sheet(isPresented: $intervalsKey) { IntervalsKeySheet { await store.load() ; message = "Intervals.icu je připojené." } }
        .confirmationDialog(L10n.f("Odpojit %@?", disconnecting?.name ?? ""), isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } }), titleVisibility: .visible) {
            Button("Odpojit", role: .destructive) { if let p = disconnecting { Task { await disconnect(p.id) } } }
        } message: {
            Text("Data, která už Loadwise má, zůstanou. Nová přestanou chodit.")
        }
    }

    /// Google first shows what Loadwise does with the data (Google's policy).
    private func start(_ provider: String) {
        if provider == "google" { googleDisclosure = true } else { connect(provider) }
    }

    private func connect(_ provider: String) {
        Task {
            working = provider
            defer { working = nil }
            do {
                guard let event = try await model.connect(provider: provider) else { return }
                switch event {
                case "google", "intervals":
                    message = L10n.f("%@ je připojené, data se začínají stahovat.", provider == "google" ? "Google" : "Intervals.icu")
                case "intervals-failed":
                    message = "Připojení Intervals.icu se nepovedlo. Zkus vložit API klíč."
                    intervalsKey = true
                case "expired": message = "Odkaz vypršel, zkus to znovu."
                default: message = "Připojení se nedokončilo."
                }
                await store.load()
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func disconnect(_ provider: String) async {
        do {
            try await model.api.disconnect(provider: provider)
            message = "Odpojeno."
            await store.load()
        } catch {
            message = error.localizedDescription
        }
    }

    private func icon(_ id: String) -> SettingsIcon {
        id == "google" ? SettingsIcon(systemImage: "g.circle.fill", color: Palette.blue) : SettingsIcon(systemImage: "waveform.path.ecg", color: Palette.rust)
    }

    private func subtitle(_ provider: ConnectionsResponse.Provider) -> String? {
        if provider.needsReconnect == true, provider.connected == true { return provider.problemText }
        let missing = provider.missingPermissions?.count ?? 0
        if missing > 0 { return missing == 1 ? L10n.tr("chybí 1 oprávnění") : L10n.f("chybí %@ oprávnění", String(missing)) }
        return provider.metrics.map { $0.joined(separator: ", ").lowercased() }
    }

    private var lastSync: String? {
        guard let at = store.sync?.updatedAt else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: at) ?? ISO8601DateFormatter().date(from: at) ?? Self.sqlite.date(from: at)
        guard let date else { return nil }
        let out = DateFormatter()
        out.locale = Fmt.locale
        if L10n.isEnglish {
            out.dateFormat = Calendar.current.isDateInToday(date) ? "'today' h:mm a" : "MMM d, h:mm a"
        } else {
            out.dateFormat = Calendar.current.isDateInToday(date) ? "'dnes' H:mm" : "d. M. H:mm"
        }
        return out.string(from: date)
    }

    /// "2026-10-08 12:02:00" (SQLite CURRENT_TIMESTAMP, UTC).
    private static let sqlite: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()
}

/// What Loadwise reads and writes in Google Health, before Google's own consent.
struct GoogleDisclosureSheet: View {
    @Environment(\.dismiss) private var dismiss
    var proceed: () -> Void
    @State private var agree = false

    private let items: [(String, String)] = [
        ("Co čteme", "Z Google Health aktivitu a kondici (kroky, vzdálenost, aktivní energii, tréninky), zdravotní měření (tep, HRV, okysličení krve, dech, VO₂max, váhu, výšku, tělesný tuk), spánek a záznamy jídla."),
        ("Co zapisujeme", "Do Google Health jen jídlo a pití, které si tady zapíšeš."),
        ("K čemu", "Jen pro funkce aplikace: přehled dne, regenerace, kalorický cíl, plán tréninků a osobní asistent."),
        ("Kdo data dostane", "Tvůj účet Intervals.icu, když ho připojíš. OpenAI, když použiješ AI funkce, a to jen data potřebná pro odpověď. Nikomu dalšímu je nedáváme, neprodáváme je a nepoužíváme k reklamě."),
        ("Kdykoli", "Google Health odpojíš v Nastavení → Zdroje dat, v Soukromí smažeš účet i se všemi daty.")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Připojení Google Health").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    ForEach(items, id: \.0) { item in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.0).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(item.1).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Toggle("Souhlasím, aby Loadwise takto používal moje data z Google Health.", isOn: $agree)
                        .font(Typo.small).tint(Palette.green).padding(.top, 6)
                    Link("Zásady ochrany soukromí", destination: URL(string: "https://petrfitnessdata.eu/privacy")!).font(Typo.small)
                    PrimaryButton(title: "Pokračovat na Google", systemImage: "arrow.up.forward") { proceed() }
                        .disabled(!agree).opacity(agree ? 1 : 0.5).padding(.top, 6)
                }
                .padding(24)
            }
            .background(Palette.settingsBackground)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
    }
}

/// Intervals.icu by its personal API key (Settings → Developer Settings there),
/// when its sign-in is not set up for the app.
struct IntervalsKeySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var saved: () async -> Void
    @State private var key = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("API klíč Intervals.icu").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Najdeš ho v Intervals.icu v Settings → Developer Settings.").font(Typo.small).foregroundStyle(Palette.muted)
                SecureField("API klíč", text: $key)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: saving ? "Ověřuji…" : "Připojit", systemImage: "link", busy: saving) { Task { await save() } }
                    .disabled(saving || key.trimmingCharacters(in: .whitespaces).count < 8)
                Spacer()
            }
            .padding(24)
            .background(Palette.settingsBackground)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.connectIntervalsKey(key.trimmingCharacters(in: .whitespacesAndNewlines))
            await saved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Appearance and units

struct AppearanceSettingsView: View {
    @AppStorage("appearance") private var appearance = "system"

    static func label(_ value: String) -> String {
        switch value {
        case "light": return "světlý"
        case "dark": return "tmavý"
        default: return "automaticky"
        }
    }

    var body: some View {
        SettingsPage(title: "Vzhled") {
            SettingsGroup(footer: "Automaticky se vzhled řídí nastavením iPhonu.") {
                ForEach(Array(["system", "light", "dark"].enumerated()), id: \.element) { index, value in
                    if index > 0 { SettingsDivider() }
                    Button { appearance = value } label: {
                        HStack {
                            Text(verbatim: Fmt.capitalized(L10n.tr(Self.label(value)))).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            if appearance == value { Image(systemName: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green) }
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(appearance == value ? .isSelected : [])
                }
            }
        }
    }
}

/// One choice of a short list, ticked.
struct SettingsChoiceList: View {
    let options: [(value: String, label: String)]
    let selected: String
    let choose: (String) -> Void

    var body: some View {
        ForEach(Array(options.enumerated()), id: \.element.value) { index, option in
            if index > 0 { SettingsDivider() }
            Button { choose(option.value) } label: {
                HStack {
                    Text(option.label).font(.body).foregroundStyle(Palette.ink)
                    Spacer()
                    if selected == option.value { Image(systemName: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green) }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected == option.value ? .isSelected : [])
        }
    }
}

struct UnitsSettingsView: View {
    @AppStorage(Units.key) private var units = "metric"

    static func label(_ value: String) -> String {
        value == "imperial" ? "imperiální" : "metrické"
    }

    var body: some View {
        SettingsPage(title: "Jednotky") {
            SettingsGroup {
                SettingsChoiceList(options: [("metric", "Metrické"), ("imperial", "Imperiální")], selected: units) { value in
                    Units.setSystem(value)
                    units = value
                    WidgetBridge.reload()
                }
            }
            SettingsGroup(footer: "Server ukládá hodnoty metricky, převádí se jen to, co vidíš a zadáváš.") {
                let imperial = units == "imperial"
                let rows = [("Vzdálenost", imperial ? "mi" : "km"), ("Výška", imperial ? "in" : "cm"), ("Váha", imperial ? "lb" : "kg"),
                            ("Teplota", imperial ? "°F" : "°C"), ("Energie", "kcal"), ("Pití", imperial ? "fl oz" : "ml")]
                ForEach(Array(rows.enumerated()), id: \.offset) { index, unit in
                    if index > 0 { SettingsDivider() }
                    SettingsRow(title: unit.0, value: unit.1, chevron: false)
                }
            }
        }
    }
}

struct LanguageSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(L10n.key) private var language = "cs"

    static func label(_ value: String) -> String {
        value == "en" ? "English" : "čeština"
    }

    var body: some View {
        SettingsPage(title: "Jazyk") {
            SettingsGroup(footer: "Texty od kouče a ze serveru přijdou v novém jazyce s dalším načtením.") {
                SettingsChoiceList(options: [("cs", "Čeština"), ("en", "English")], selected: language) { value in
                    guard value != language else { return }
                    L10n.setLanguage(value)
                    language = value
                    WidgetBridge.reload()
                    Task { await model.refresh() }
                }
            }
        }
    }
}

// MARK: - Reminders

struct NotificationsSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(Reminders.bedtimeKey) private var bedtime = true
    @AppStorage(Reminders.workoutKey) private var workout = true
    @AppStorage(Reminders.waterKey) private var water = true
    @AppStorage(Reminders.foodKey) private var food = true
    @State private var allowed: Bool?

    var body: some View {
        SettingsPage(title: "Oznámení") {
            if allowed == false {
                SettingsGroup(footer: "Oznámení pro Loadwise jsou v iPhonu vypnutá.") {
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    } label: { SettingsRow(title: "Otevřít nastavení iPhonu", titleColor: Palette.blue) }
                    .buttonStyle(.plain)
                }
            }
            SettingsGroup(footer: "Připomínky se plánují v telefonu podle dnešních dat.") {
                SettingsToggle(title: "Čas do postele", subtitle: "půl hodiny před doporučeným časem", isOn: $bedtime)
                SettingsDivider()
                SettingsToggle(title: "Trénink", subtitle: "hodinu před naplánovaným tréninkem", isOn: $workout)
                SettingsDivider()
                SettingsToggle(title: "Pití", subtitle: "v 10, 13 a 16 h, dokud nemáš splněno", isOn: $water)
                SettingsDivider()
                SettingsToggle(title: "Zapsat jídlo", subtitle: "ve 20:30", isOn: $food)
            }
        }
        .task { await check() }
        .onChange(of: [bedtime, workout, water, food]) { Task { await check(); if let today = model.today { await Reminders.reschedule(from: today) } } }
    }

    private func check() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .notDetermined, bedtime || workout || water || food {
            allowed = await Reminders.requestPermission()
        } else {
            allowed = status == .authorized || status == .provisional
        }
    }
}

// MARK: - Privacy and the account

struct PrivacySettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var ai = false
    @State private var aiLoaded = false
    @State private var exportURL: URL?
    @State private var exporting = false
    @State private var confirmDelete = false
    @State private var deleteText = ""
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Soukromí a data") {
            SettingsGroup(footer: "Kouč, čtení fotek jídla a dohledání potravin posílají potřebná data k AI. Bez souhlasu fungují ostatní části aplikace dál.") {
                SettingsToggle(title: "AI funkce", isOn: Binding(get: { ai }, set: { setAI($0) }), disabled: !aiLoaded || model.demo)
            }
            SettingsGroup(footer: "Soubor JSON se vším, co o tobě Loadwise ukládá.") {
                if let exportURL {
                    ShareLink(item: exportURL) { SettingsRow(title: "Sdílet soubor s daty", chevron: false, titleColor: Palette.blue) }
                } else {
                    Button { Task { await export() } } label: {
                        SettingsRow(title: exporting ? "Připravuji…" : "Stáhnout moje data", chevron: false, titleColor: Palette.blue)
                    }
                    .buttonStyle(.plain)
                    .disabled(exporting || model.demo)
                }
            }
            SettingsGroup(footer: "Smaže účet i všechna data na serveru. Nejde vrátit. Data v Intervals.icu a Google zůstanou, kde jsou.") {
                Button { confirmDelete = true } label: { SettingsRow(title: "Smazat účet", chevron: false, titleColor: Palette.rust) }
                    .buttonStyle(.plain)
                    .disabled(model.demo)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task {
            guard !model.demo else { return }
            ai = (try? await model.api.aiAllowed()) ?? false
            aiLoaded = true
        }
        .alert("Smazat účet?", isPresented: $confirmDelete) {
            TextField("SMAZAT", text: $deleteText).textInputAutocapitalization(.characters)
            Button("Smazat", role: .destructive) { Task { await delete() } }
            Button("Zrušit", role: .cancel) { deleteText = "" }
        } message: {
            Text("Pro potvrzení napiš SMAZAT.")
        }
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do { exportURL = try await model.api.exportData() } catch { self.error = error.localizedDescription }
    }

    /// Only a change by the user is saved (not the value loaded from the server).
    private func setAI(_ value: Bool) {
        let before = ai
        ai = value
        Task {
            do { try await model.api.setAI(value); error = nil } catch { ai = before; self.error = L10n.f("Změna se neuložila: %@", error.localizedDescription) }
        }
    }

    private func delete() async {
        guard ["SMAZAT", "DELETE"].contains(deleteText.trimmingCharacters(in: .whitespaces).uppercased()) else {
            error = "Účet zůstal: pro smazání je potřeba napsat SMAZAT."
            return
        }
        do {
            try await model.api.deleteAccount()
            model.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
