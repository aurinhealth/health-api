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

/// Profil: who you are. The photo (on this phone only), the name, sex, birth
/// date and height, the e-mail of the account, signing out. What the
/// calculations need beyond that (heart rate, activity, the weight goal) is
/// on its own page, Tep a aktivita.
struct ProfileSettingsView: View {
    let store: SettingsStore
    var signOut: () -> Void = {}
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var sex = ""
    @State private var hasBirth = false
    @State private var birth = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
    @State private var age = ""
    @State private var height = ""
    @State private var original: JSONObject = [:]
    @State private var copied = false
    @AppStorage(AvatarStore.nameKey) private var accountName = ""
    @AppStorage(AvatarStore.emailKey) private var email = ""

    var body: some View {
        SettingsPage(title: "Profil") {
            AvatarEditor().padding(.top, 8)
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }

            SettingsGroup(title: "Osobní údaje", footer: "Z pohlaví, věku a výšky (a váhy) se počítá klidový výdej a denní cíl kalorií.") {
                SettingsField(title: "Jméno", text: $name, keyboard: .default, placeholder: accountName.isEmpty ? "tvé jméno" : accountName)
                    .textInputAutocapitalization(.words)
                SettingsDivider()
                SettingsPicker(title: "Pohlaví", selection: $sex, options: [("male", "muž"), ("female", "žena")])
                SettingsDivider()
                HStack(spacing: 8) {
                    Text("Datum narození").font(.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    if hasBirth {
                        DatePicker("", selection: $birth, in: Self.birthRange, displayedComponents: .date)
                            .labelsHidden()
                            .environment(\.locale, L10n.locale)
                    } else {
                        Button("Zadat") { hasBirth = true }.font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 8).frame(minHeight: 50)
                SettingsDivider()
                if hasBirth {
                    SettingsRow(title: "Věk", value: L10n.f("%@ let", String(Self.years(from: birth))), chevron: false)
                } else {
                    SettingsField(title: "Věk", text: $age, unit: "let", keyboard: .numberPad)
                }
                SettingsDivider()
                SettingsField(title: "Výška", text: $height, unit: Units.lengthUnit, keyboard: Units.imperial ? .decimalPad : .numberPad)
            }

            if !email.isEmpty {
                SettingsGroup(title: "Účet", footer: "Přihlašuješ se přes tento účet. Fotka zůstává jen v tomhle telefonu.") {
                    Button {
                        UIPasteboard.general.string = email
                        copied = true
                    } label: {
                        HStack(spacing: 8) {
                            Text("E-mail").font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: email).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1).truncationMode(.middle)
                            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 13)).foregroundStyle(Palette.faint)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("E-mail %@, zkopírovat", email))
                }
            }

            SettingsGroup {
                Button(action: signOut) { SettingsRow(title: model.demo ? "Ukončit ukázku" : "Odhlásit se", chevron: false, titleColor: Palette.ink) }
                    .buttonStyle(.plain)
                if !model.demo {
                    SettingsDivider()
                    NavigationLink { PrivacySettingsView() } label: { SettingsRow(title: "Smazat účet", titleColor: Palette.rust) }
                        .buttonStyle(.plain)
                }
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
    }

    static var birthRange: ClosedRange<Date> {
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        return calendar.date(byAdding: .year, value: -100, to: now)!...calendar.date(byAdding: .year, value: -14, to: now)!
    }

    static func years(from birth: Date) -> Int {
        Calendar(identifier: .gregorian).dateComponents([.year], from: birth, to: Date()).year ?? 0
    }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func fill() {
        let p = store.profile
        name = p["displayName"]?.string ?? UserDefaults.standard.string(forKey: AppModel.displayNameKey) ?? ""
        sex = p["sex"]?.string ?? ""
        if let text = p["birthDate"]?.string, let date = Self.dayFormat.date(from: text) {
            hasBirth = true
            birth = date
        } else {
            hasBirth = false
        }
        age = p["age"]?.string ?? ""
        height = Units.imperial
            ? (p["height"]?.number).map { Fmt.decimal(Units.length($0), digits: 1) } ?? ""
            : p["height"]?.string ?? ""
        original = changes
    }

    private var changes: JSONObject {
        var c: JSONObject = [
            "displayName": .string(name.trimmingCharacters(in: .whitespaces)), "sex": .string(sex),
            "height": HeartActivitySettingsView.metric(height, Units.cm, scale: 1),
            "birthDate": .string(hasBirth ? Self.dayFormat.string(from: birth) : "")
        ]
        if !hasBirth { c["age"] = .field(age) }
        return c
    }

    private func save() async {
        let shown = name.trimmingCharacters(in: .whitespaces)
        if await store.saveProfile(changes) {
            UserDefaults.standard.set(shown.nilIfBlank, forKey: AppModel.displayNameKey)
            if let first = (shown.nilIfBlank ?? accountName.nilIfBlank ?? email).first {
                UserDefaults.standard.set(String(first).uppercased(), forKey: AppModel.accountInitialKey)
            }
            fill()
        }
    }
}

/// Tep a aktivita: the values behind heart-rate zones and the calorie target,
/// apart from Profil's personal details.
struct HeartActivitySettingsView: View {
    let store: SettingsStore
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
        SettingsPage(title: "Tep a aktivita") {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Tep", footer: "Prázdné hodnoty dopočítá Loadwise z tvých tréninků a nocí.") {
                SettingsField(title: "Maximální tep", text: $hrmax, unit: "bpm", keyboard: .numberPad)
                SettingsDivider()
                SettingsField(title: "Klidový tep", text: $rhr, unit: "bpm", keyboard: .numberPad)
            }
            SettingsGroup(title: "Aktivita a cíl", footer: "Z běžného dne, sportu a cíle se počítá denní cíl kalorií.") {
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

    /// "max 186 · klid 48" for the row in Settings.
    static func summary(_ profile: JSONObject) -> String? {
        let parts = [profile["hrmax"]?.string.map { L10n.f("max %@", $0) }, profile["rhr"]?.string.map { L10n.f("klid %@", $0) }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func fill() {
        let p = store.profile
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
        ["hrmax": .field(hrmax), "rhr": .field(rhr), "activity": .string(activity), "sportHours": .string(sportHours),
         "goal": .string(goal), "targetWeight": Self.metric(targetWeight, Units.kg, scale: 10)]
    }

    /// A value typed in the chosen unit, sent in metric (rounded to 1/scale).
    static func metric(_ text: String, _ toMetric: (Double) -> Double, scale: Double) -> JSONValue {
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

/// Zdroje dat, laid out like Bevel's: the connected services as cards, each
/// with "Spravovat" (permissions, sync, disconnect), "+" for the rest in
/// sections, and syncing everything at the bottom.
struct SourcesSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var actions = SourceActions()
    @State private var syncing = false
    @State private var adding = false
    @State private var flow = ConnectFlowState()

    private var connected: [ConnectionsResponse.Provider] { store.connections.filter { $0.connected == true } }
    private var available: [ConnectionsResponse.Provider] { store.connections.filter { $0.connected != true && $0.configured != false } }

    var body: some View {
        SettingsPage(title: "Zdroje dat") {
            HStack {
                Text("Propojení").font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                Button { adding = true } label: {
                    Image(systemName: "plus").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Přidat propojení")
            }

            if connected.isEmpty && store.loaded {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Zatím není nic propojené.").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text("Bez propojení běží Loadwise z toho, co zapíšeš ručně.").font(Typo.small).foregroundStyle(Palette.muted)
                    PrimaryButton(title: "Přidat propojení", systemImage: "plus") { adding = true }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            VStack(spacing: 10) {
                ForEach(connected) { provider in
                    NavigationLink {
                        IntegrationDetailView(provider: provider, store: store, actions: actions)
                    } label: {
                        IntegrationCard(provider: provider, lastSync: lastSync, working: actions.working == provider.id)
                    }
                    .buttonStyle(.plain)
                }
            }

            SettingsGroup(title: "Data") {
                Button {
                    Task { syncing = true; await store.syncNow(); syncing = false }
                } label: {
                    HStack {
                        Text(syncing ? "Synchronizuji…" : "Synchronizovat vše").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if syncing { ProgressView() } else if let at = lastSync { Text(at).font(.subheadline).foregroundStyle(Palette.muted) }
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(syncing || store.demo || connected.isEmpty)
                // The last sync left a source out (src/dashboard-sync.js results, googleStatus).
                if !syncing, let failed = store.sync?.failedSources, !failed.isEmpty {
                    SettingsDivider()
                    SettingsRow(icon: SettingsIcon(systemImage: "exclamationmark.circle.fill", color: Palette.rust), title: "Poslední synchronizace s chybou",
                                subtitle: failed.joined(separator: ", "), chevron: false)
                }
                SettingsDivider()
                SettingsToggle(title: "Sloučit stejné záznamy", subtitle: "Když stejnou noc nebo trénink pošle víc zdrojů, započítá se jednou.", isOn: .constant(true), disabled: true)
            }

            if let message = actions.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(isPresented: $adding) {
            AddIntegrationSheet(available: available) { provider in
                adding = false
                // The next sheet (Google's disclosure, the browser) once this one has closed.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    flow.start(provider, actions: actions, model: model, store: store, askKey: { flow.intervalsKey = true })
                }
            }
        }
        .connectFlow($flow, actions: actions, store: store)
    }

    private var lastSync: String? { store.sync?.updatedAt.flatMap(SourceActions.when) }
}

/// One connected service: its icon, name, the state in a few words and "Spravovat".
struct IntegrationCard: View {
    let provider: ConnectionsResponse.Provider
    let lastSync: String?
    var working = false

    var body: some View {
        HStack(spacing: 14) {
            IntegrationIcon(id: provider.id, size: 46)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: provider.name ?? provider.id).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                if let problem = provider.problemText {
                    Text(problem).font(Typo.caption).foregroundStyle(Palette.rust)
                } else if let at = provider.lastSuccessAt.flatMap(SourceActions.when) ?? lastSync {
                    Text(L10n.f("synchronizováno %@", at)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            Text(working ? L10n.tr("připojuji…") : provider.needsAttention ? L10n.tr("Opravit") : L10n.tr("Spravovat"))
                .font(Typo.caption.weight(.semibold))
                .foregroundStyle(provider.needsAttention ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(provider.needsAttention ? Palette.rust : Palette.ink.opacity(0.07), in: Capsule())
        }
        .padding(14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .contentShape(Rectangle())
    }
}

struct IntegrationIcon: View {
    let id: String
    var size: CGFloat = 40

    private var style: (symbol: String, color: Color) {
        switch id {
        case "google": return ("heart.text.square.fill", Palette.blue)
        case "intervals": return ("waveform.path.ecg", Palette.rust)
        case "apple": return ("heart.fill", Color(light: 0xE5484D, dark: 0xF2777A))
        default: return ("watch.analog", Palette.indigo)
        }
    }

    var body: some View {
        let (symbol, color) = style
        Image(systemName: symbol)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color, in: RoundedRectangle(cornerRadius: size * 0.26, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// "Spravovat": the state of one connection, its permissions, sync and disconnect.
struct IntegrationDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let provider: ConnectionsResponse.Provider
    let store: SettingsStore
    let actions: SourceActions
    @State private var flow = ConnectFlowState()
    @State private var syncing = false

    /// The live state after a reconnect or a sync.
    private var current: ConnectionsResponse.Provider { store.connections.first { $0.id == provider.id } ?? provider }

    /// Google Health's permissions (src/google-scopes.js HEALTH_PERMISSIONS).
    static let googlePermissions: [(id: String, title: String)] = [
        ("activity", "Aktivita a tréninky"), ("metrics", "Zdravotní měření"), ("sleep", "Spánek"),
        ("nutritionRead", "Čtení jídla"), ("nutritionWrite", "Zápis jídla")
    ]

    var body: some View {
        SettingsPage(title: current.name ?? current.id) {
            HStack(spacing: 14) {
                IntegrationIcon(id: current.id, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: current.name ?? current.id).font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                    Text(current.connected == true ? (current.problemText ?? L10n.tr("připojeno")) : L10n.tr("nepřipojeno"))
                        .font(Typo.small).foregroundStyle(current.needsAttention ? Palette.rust : Palette.green)
                }
            }

            SettingsGroup(title: "Synchronizace") {
                if let at = current.lastSuccessAt.flatMap(SourceActions.when) {
                    SettingsRow(title: "Naposledy v pořádku", value: at, chevron: false)
                    SettingsDivider()
                }
                if let error = current.lastError, current.needsReconnect == true {
                    SettingsRow(title: "Poslední chyba", subtitle: error, chevron: false)
                    SettingsDivider()
                }
                Button {
                    Task { syncing = true; await store.syncNow(); await store.load(); syncing = false }
                } label: {
                    HStack {
                        Text(syncing ? "Synchronizuji…" : "Synchronizovat znovu").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        if syncing { ProgressView() } else { Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Palette.faint) }
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(syncing || store.demo)
            }

            if let metrics = current.metrics, !metrics.isEmpty {
                SettingsGroup(title: "Co odsud bereme") {
                    ForEach(Array(metrics.enumerated()), id: \.offset) { index, metric in
                        if index > 0 { SettingsDivider() }
                        SettingsRow(title: metric, chevron: false)
                    }
                }
            }

            if current.id == "google" {
                let missing = Set((current.missingPermissions ?? []).compactMap(\.string))
                SettingsGroup(title: "Oprávnění", footer: "Oprávnění se mění na stránce Googlu: zaškrtni, co má Loadwise číst a zapisovat.") {
                    ForEach(Array(Self.googlePermissions.enumerated()), id: \.offset) { index, permission in
                        if index > 0 { SettingsDivider() }
                        HStack {
                            Text(permission.title).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Image(systemName: missing.contains(permission.id) ? "xmark.circle" : "checkmark.circle.fill")
                                .foregroundStyle(missing.contains(permission.id) ? Palette.rust : Palette.green)
                                .accessibilityLabel(missing.contains(permission.id) ? L10n.tr("nepovoleno") : L10n.tr("povoleno"))
                        }
                        .padding(.horizontal, 16).frame(minHeight: 46)
                    }
                    SettingsDivider()
                    Button { flow.start("google", actions: actions, model: model, store: store, askKey: {}) } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "checklist", color: Palette.blue),
                                    title: missing.isEmpty ? "Upravit oprávnění" : "Povolit chybějící", chevron: false)
                    }
                    .buttonStyle(.plain)
                    .disabled(actions.working != nil || store.demo)
                }
            } else if current.id == "intervals" {
                SettingsGroup(title: "Přístup", footer: "Klíč najdeš v Intervals.icu v Settings → Developer Settings.") {
                    Button { flow.start("intervals", actions: actions, model: model, store: store, askKey: { flow.intervalsKey = true }) } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "link", color: Palette.rust), title: "Připojit znovu", chevron: false)
                    }
                    .buttonStyle(.plain)
                    SettingsDivider()
                    Button { flow.intervalsKey = true } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "key.fill", color: Palette.amberBar), title: "Vložit nový API klíč", chevron: false)
                    }
                    .buttonStyle(.plain)
                }
                .disabled(actions.working != nil || store.demo)
            }

            SettingsGroup {
                Button { flow.disconnecting = current } label: {
                    SettingsRow(title: "Odpojit", chevron: false, titleColor: Palette.rust)
                }
                .buttonStyle(.plain)
                .disabled(store.demo)
            }

            if let message = actions.message {
                Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .connectFlow($flow, actions: actions, store: store, disconnected: { dismiss() })
    }
}

/// "+": the services that can still be connected, in sections.
struct AddIntegrationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let available: [ConnectionsResponse.Provider]
    let connect: (String) -> Void

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Přidat propojení") {
                let health = available.filter { $0.id == "google" }
                let training = available.filter { $0.id == "intervals" }
                SettingsGroup(title: "Zdraví a spánek") {
                    ForEach(health) { provider in
                        row(provider, subtitle: L10n.tr("spánek, tep, HRV, kroky, váha a jídlo"))
                        SettingsDivider()
                    }
                    SettingsRow(icon: SettingsIcon(systemImage: "heart.fill", color: Color(light: 0xE5484D, dark: 0xF2777A)), title: "Apple Health",
                                subtitle: L10n.tr("přijde s placeným Apple Developer Programem"), value: L10n.tr("brzy"), chevron: false)
                        .opacity(0.6)
                }
                SettingsGroup(title: "Tréninky") {
                    ForEach(Array(training.enumerated()), id: \.element.id) { index, provider in
                        if index > 0 { SettingsDivider() }
                        row(provider, subtitle: L10n.tr("aktivity, plán tréninků, forma a wellness"))
                    }
                    if training.isEmpty {
                        SettingsRow(title: "Intervals.icu je už připojené.", chevron: false)
                    }
                }
                SettingsGroup(title: "Hodinky a další aplikace", footer: "Garmin, Polar, Suunto, Coros, Wahoo, Oura nebo Strava připoj v Intervals.icu. Loadwise jejich data dostane odtamtud.") {
                    Link(destination: URL(string: "https://intervals.icu/settings")!) {
                        SettingsRow(icon: SettingsIcon(systemImage: "applewatch", color: Palette.indigo), title: "Přes Intervals.icu",
                                    subtitle: "Garmin, Polar, Suunto, Coros, Wahoo, Oura, Strava")
                    }
                    .buttonStyle(.plain)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
    }

    private func row(_ provider: ConnectionsResponse.Provider, subtitle: String) -> some View {
        HStack(spacing: 12) {
            IntegrationIcon(id: provider.id, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: provider.name ?? provider.id).font(.body).foregroundStyle(Palette.ink)
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button(L10n.tr("Připojit")) { connect(provider.id) }
                .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(Palette.ink.opacity(0.07), in: Capsule())
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 50)
    }
}

/// Connecting and disconnecting, shared by Zdroje dat and a service's page.
@MainActor
@Observable
final class SourceActions {
    /// The service being connected right now.
    var working: String?
    var message: String?

    /// true when Intervals.icu's sign-in failed and the API key should be asked for.
    func connect(_ provider: String, model: AppModel, store: SettingsStore) async -> Bool {
        working = provider
        defer { working = nil }
        do {
            guard let event = try await model.connect(provider: provider) else { return false }
            var askKey = false
            switch event {
            case "google", "intervals":
                message = L10n.f("%@ je připojené, data se začínají stahovat.", provider == "google" ? "Google" : "Intervals.icu")
            case "intervals-failed":
                message = L10n.tr("Připojení Intervals.icu se nepovedlo. Zkus vložit API klíč.")
                askKey = true
            case "expired": message = L10n.tr("Odkaz vypršel, zkus to znovu.")
            default: message = L10n.tr("Připojení se nedokončilo.")
            }
            await store.load()
            return askKey
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func disconnect(_ provider: String, model: AppModel, store: SettingsStore) async -> Bool {
        do {
            try await model.api.disconnect(provider: provider)
            message = L10n.tr("Odpojeno.")
            await store.load()
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    /// "dnes 13:29" or "8. 10. 13:29" from the server's ISO or SQLite time.
    static func when(_ text: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: text) ?? ISO8601DateFormatter().date(from: text) ?? sqlite.date(from: text)
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

/// The sheets of connecting (Google's disclosure, the Intervals.icu key) and
/// the disconnect question, each view with its own.
struct ConnectFlowState {
    var googleDisclosure = false
    var intervalsKey = false
    var disconnecting: ConnectionsResponse.Provider?

    /// Google first shows what Loadwise does with the data (Google's policy).
    /// askKey: Intervals.icu's sign-in failed, show the API key sheet.
    @MainActor
    mutating func start(_ provider: String, actions: SourceActions, model: AppModel, store: SettingsStore, askKey: @escaping @MainActor () -> Void) {
        if provider == "google" {
            googleDisclosure = true
        } else {
            Task { @MainActor in if await actions.connect(provider, model: model, store: store) { askKey() } }
        }
    }
}

extension View {
    func connectFlow(_ flow: Binding<ConnectFlowState>, actions: SourceActions, store: SettingsStore, disconnected: @escaping () -> Void = {}) -> some View {
        modifier(ConnectFlowSheets(flow: flow, actions: actions, store: store, disconnected: disconnected))
    }
}

struct ConnectFlowSheets: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var flow: ConnectFlowState
    let actions: SourceActions
    let store: SettingsStore
    let disconnected: () -> Void

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $flow.googleDisclosure) {
                GoogleDisclosureSheet {
                    flow.googleDisclosure = false
                    // The browser sheet opens once this one has closed.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        Task { _ = await actions.connect("google", model: model, store: store) }
                    }
                }
            }
            .sheet(isPresented: $flow.intervalsKey) {
                IntervalsKeySheet { await store.load(); actions.message = L10n.tr("Intervals.icu je připojené.") }
            }
            .confirmationDialog(L10n.f("Odpojit %@?", flow.disconnecting?.name ?? ""),
                                isPresented: Binding(get: { flow.disconnecting != nil }, set: { if !$0 { flow.disconnecting = nil } }),
                                titleVisibility: .visible) {
                Button("Odpojit", role: .destructive) {
                    if let p = flow.disconnecting {
                        Task { if await actions.disconnect(p.id, model: model, store: store) { disconnected() } }
                    }
                }
            } message: {
                Text("Data, která už Loadwise má, zůstanou. Nová přestanou chodit.")
            }
    }
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
            PageScroll {
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
                    // Every tab: the server writes its texts in the new language.
                    Task { await model.refreshAll() }
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
