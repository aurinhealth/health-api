import SwiftUI

// Trénink na míru (the gym goal, the experience, the warm-up and stretching)
// and the warm-up and stretching of a gym session (src/stretching.js): a card
// to tick, each move's photos and steps behind "i", and a timer that leads
// through every hold.

/// The warm-up or the stretching: its moves in order, and the name of an own one
/// ("Legs"; nil for the automatic one).
struct GymStretching: Codable, Equatable {
    let minutes: Int
    let items: [Item]
    var name: String? = nil

    struct Item: Codable, Equatable, Identifiable {
        let id: String
        let name: String
        let seconds: Int
        let sides: Bool
        var rounds: Int = 1
        var steps: [String] = []
        var photos: [String] = []
        /// The YouTube id of a demonstration.
        var video: String? = nil

        enum CodingKeys: String, CodingKey { case id, name, seconds, sides, rounds, steps, photos, video }

        init(id: String, name: String, seconds: Int, sides: Bool, rounds: Int = 1, steps: [String] = [], photos: [String] = []) {
            self.id = id; self.name = name; self.seconds = seconds; self.sides = sides
            self.rounds = rounds; self.steps = steps; self.photos = photos
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = try c.decode(String.self, forKey: .name)
            seconds = try c.decode(Int.self, forKey: .seconds)
            sides = try c.decodeIfPresent(Bool.self, forKey: .sides) ?? false
            rounds = max(1, try c.decodeIfPresent(Int.self, forKey: .rounds) ?? 1)
            steps = try c.decodeIfPresent([String].self, forKey: .steps) ?? []
            photos = try c.decodeIfPresent([String].self, forKey: .photos) ?? []
            video = try c.decodeIfPresent(String.self, forKey: .video).flatMap { $0.isEmpty ? nil : $0 }
        }

        /// "2 × 30 s na stranu", "45 s", "3 min".
        var duration: String {
            let time = seconds >= 120 && seconds % 60 == 0 ? "\(seconds / 60) min" : "\(seconds) s"
            return (rounds > 1 ? "\(rounds) × " : "") + time + (sides ? " " + L10n.tr("na stranu") : "")
        }

        var photoURLs: [URL] { photos.compactMap(URL.init(string:)) }
    }

    /// The plan's sixth row: ["Rozcvička a protažení", "{warmup, stretching}"].
    static let row = 5

    struct Routines: Decodable {
        let warmup: GymStretching?
        let stretching: GymStretching?
        var cardio: Cardio? = nil
        /// The parts turned off in Nastavení → Posilovna, offered switched off.
        var off: [String]? = nil
    }

    /// The day's cardio: the machine and the minutes at the start and at the end (nil when off).
    struct Cardio: Decodable, Equatable {
        let type: String
        let start: Int?
        let end: Int?
    }

    static func routines(_ values: [[JSONValue]]) -> Routines? {
        guard values.count > row, values[row].count > 1, values[row][0].string == "Rozcvička a protažení",
              let data = values[row][1].string?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Routines.self, from: data)
    }

    init(minutes: Int, items: [Item], name: String? = nil) {
        self.minutes = minutes
        self.items = items
        self.name = name
    }

    /// Every hold in order: each round, on each side.
    var holds: [Hold] {
        items.flatMap { item in
            (1...item.rounds).flatMap { round in
                (item.sides ? [L10n.tr("levá"), L10n.tr("pravá")] : [nil]).map { Hold(item: item, round: round, side: $0) }
            }
        }
    }

    struct Hold: Equatable {
        let item: Item
        let round: Int
        let side: String?
        /// The item's last hold: it is done after this one.
        var closesItem: Bool { round == item.rounds && (side == nil || side == L10n.tr("pravá")) }
    }
}

enum GymRoutineKind {
    case warmup, stretching, cardio

    var title: String {
        switch self {
        case .warmup: return "Rozcvička"
        case .stretching: return "Protažení"
        case .cardio: return "Kardio"
        }
    }
    var symbol: String {
        switch self {
        case .warmup: return "figure.run"
        case .stretching: return "figure.flexibility"
        case .cardio: return "figure.indoor.cycle"
        }
    }
    var color: Color {
        switch self {
        case .warmup: return Palette.amber
        case .stretching: return Palette.indigo
        case .cardio: return Palette.rust
        }
    }
    var doneTitle: String {
        switch self {
        case .warmup: return "Rozcvička hotová"
        case .stretching: return "Protažení hotovo"
        case .cardio: return "Kardio hotové"
        }
    }
    /// The server's name of the part (warmup, stretching).
    var id: String {
        switch self {
        case .warmup: return "warmup"
        case .stretching: return "stretching"
        case .cardio: return "cardio"
        }
    }
    /// Ticks kept apart: the warm-up and the stretching can share a move.
    var key: String {
        switch self {
        case .warmup: return "w-"
        case .stretching: return ""
        case .cardio: return "c-"
        }
    }
}

/// Rozcvička or Protažení: the moves in order, each ticked when done, with
/// Spustit. `compact` shows only the title row (the top of Režim tréninku).
struct StretchingCard: View {
    let stretching: GymStretching
    let date: String
    var kind: GymRoutineKind = .stretching
    var compact = false
    @AppStorage("gym.stretching.done") private var stored = ""
    @State private var info: GymStretching.Item?
    @State private var timer = false

    private var done: Set<String> { Self.done(stored, date: date) }
    private func isDone(_ item: GymStretching.Item) -> Bool { done.contains(kind.key + item.id) }

    var body: some View {
        Card {
            HStack(spacing: 10) {
                Image(systemName: kind.symbol).font(.system(size: 17, weight: .medium)).foregroundStyle(kind.color)
                    .frame(width: 36, height: 36)
                    .background(kind.color.opacity(0.14), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(kind.title).font(.headline).foregroundStyle(Palette.ink)
                    ExtraMinutesPill(text: L10n.f("+%@ min navíc", String(stretching.minutes)), color: kind.color)
                }
                Spacer()
                Button { timer = true } label: {
                    Label("Spustit", systemImage: "play.fill").font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).frame(height: 36)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            if !compact {
            VStack(spacing: 0) {
                ForEach(Array(stretching.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider().overlay(Palette.hairline) }
                    HStack(spacing: 12) {
                        Button { stored = Self.toggled(stored, date: date, id: kind.key + item.id) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: isDone(item) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 21)).foregroundStyle(isDone(item) ? Palette.green : Palette.faint)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink)
                                        .strikethrough(isDone(item), color: Palette.muted)
                                    Text(verbatim: item.duration).font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer(minLength: 8)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(isDone(item) ? .isSelected : [])
                        if !item.steps.isEmpty || !item.photos.isEmpty || item.video != nil {
                            ExerciseInfoButton(name: item.name) { info = item }
                        }
                    }
                    .frame(minHeight: 52)
                }
            }
            }
        }
        // Dashed: on top of the chosen time, not part of the lifting.
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
            .strokeBorder(kind.color.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        .sheet(item: $info) { item in StretchInfoSheet(item: item) }
        .fullScreenCover(isPresented: $timer) {
            StretchTimerView(stretching: stretching, kind: kind) { id in
                let key = kind.key + id
                if !Self.done(stored, date: date).contains(key) { stored = Self.toggled(stored, date: date, id: key) }
            }
        }
    }

    static func done(_ stored: String, date: String) -> Set<String> {
        let prefix = date + ":"
        return Set(stored.split(separator: ",").map(String.init).filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) })
    }

    /// Ticks or unticks a stretch; only the last week's days are kept.
    static func toggled(_ stored: String, date: String, id: String) -> String {
        var all = stored.split(separator: ",").map(String.init)
        let key = date + ":" + id
        if let i = all.firstIndex(of: key) { all.remove(at: i) } else { all.append(key) }
        let oldest = Calendar.current.date(byAdding: .day, value: -7, to: Date()).map { isoDay.string(from: $0) } ?? ""
        return all.filter { String($0.prefix(10)) >= oldest }.joined(separator: ",")
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

/// "i" of a stretch: its photos, how long and how to do it.
struct StretchInfoSheet: View {
    let item: GymStretching.Item
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !item.photoURLs.isEmpty { ExercisePhotos(urls: item.photoURLs, labeled: false) }
                    Text(verbatim: item.duration).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(item.steps.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(verbatim: "\(index + 1).").font(Typo.bodyStrong).foregroundStyle(Palette.indigo)
                                Text(verbatim: step).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    if let video = item.video {
                        YouTubePlayer(id: video)
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    if !item.id.hasPrefix("cardio") {
                        Text("Pohyb dělej v klidu a bez bolesti, má táhnout, ne bolet.")
                            .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(20)
            }
            .background(Palette.background)
            .navigationTitle(item.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

/// Spustit: every hold in turn with a countdown, 5 s to move between them.
struct StretchTimerView: View {
    let stretching: GymStretching
    var kind: GymRoutineKind = .stretching
    var onItemDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var left = Self.moveSeconds
    @State private var moving = true
    @State private var paused = false
    @State private var finished = false

    static let moveSeconds = 5

    private var holds: [GymStretching.Hold] { stretching.holds }
    private var hold: GymStretching.Hold? { holds.indices.contains(index) ? holds[index] : nil }

    var body: some View {
        VStack(spacing: 18) {
            HStack(spacing: 10) {
                Text(verbatim: "\(min(index + 1, holds.count))/\(holds.count)").font(Typo.caption).foregroundStyle(Palette.muted)
                Spacer()
                if !finished { GymSignalsMenu() }
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 16, weight: .semibold)).frame(width: 36, height: 36)
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel(L10n.tr("Zavřít"))
            }
            if finished {
                Spacer()
                Image(systemName: "checkmark.circle.fill").font(.system(size: 64)).foregroundStyle(Palette.green)
                Text(kind.doneTitle).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Spacer()
                PrimaryButton(title: L10n.tr("Hotovo")) { dismiss() }
            } else if let hold {
                Text(verbatim: hold.item.name).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                Text(verbatim: subtitle(hold)).font(.subheadline).foregroundStyle(Palette.muted)
                if !hold.item.photoURLs.isEmpty { ExercisePhotos(urls: hold.item.photoURLs, labeled: false) }
                ZStack {
                    Circle().stroke(Palette.track, lineWidth: 10)
                    Circle().trim(from: 0, to: progress(hold))
                        .stroke(moving ? Palette.faint : kind.color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 1), value: left)
                    VStack(spacing: 2) {
                        Text(verbatim: "\(left)").font(Typo.number(54)).monospacedDigit()
                            .foregroundStyle(!moving && GymSignals.counts(left) ? Palette.amber : Palette.ink)
                        Text(moving ? "Připrav se" : kind == .stretching ? "Drž" : "Cvič").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                .frame(width: 170, height: 170)
                Spacer(minLength: 0)
                HStack(spacing: 14) {
                    Button { paused.toggle() } label: {
                        Label(paused ? "Pokračovat" : "Pauza", systemImage: paused ? "play.fill" : "pause.fill")
                            .font(Typo.bodyStrong).frame(maxWidth: .infinity).frame(height: 50)
                            .foregroundStyle(Palette.ink)
                            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
                    }
                    Button { next() } label: {
                        Label("Další", systemImage: "forward.fill")
                            .font(Typo.bodyStrong).frame(maxWidth: .infinity).frame(height: 50)
                            .foregroundStyle(Palette.onButton).background(Palette.button, in: Capsule())
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(20)
        .background(Palette.background.ignoresSafeArea())
        .task { await run() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    /// "Série 1/2 · levá".
    private func subtitle(_ hold: GymStretching.Hold) -> String {
        var parts: [String] = []
        if hold.item.rounds > 1 { parts.append(L10n.f("Série %@", "\(hold.round)/\(hold.item.rounds)")) }
        if let side = hold.side { parts.append(side) }
        return parts.isEmpty ? hold.item.duration : parts.joined(separator: " · ")
    }

    private func progress(_ hold: GymStretching.Hold) -> CGFloat {
        let total = moving ? Self.moveSeconds : hold.item.seconds
        return CGFloat(total - left) / CGFloat(max(total, 1))
    }

    private func run() async {
        while !finished, !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            guard !paused, !finished else { continue }
            if left > 1 {
                left -= 1
                // The last seconds of a move tick; getting ready stays quiet.
                if !moving, GymSignals.counts(left) { GymSignals.play(.tick) }
                continue
            }
            if moving, let hold { moving = false; left = hold.item.seconds; GymSignals.play(.start) } else { next() }
        }
    }

    /// The hold is over (or skipped): its stretch is ticked after its last hold.
    private func next() {
        if let hold, hold.closesItem { onItemDone(hold.item.id) }
        GymSignals.play(.end)
        if index + 1 >= holds.count { finished = true; return }
        index += 1
        moving = true
        left = Self.moveSeconds
    }
}

// MARK: - Trénink na míru (GET/POST /app/api/gym/preferences, src/routes-gym.js)

struct GymPreferences: Decodable, Equatable {
    var goal: String
    /// What "auto" follows: the goal for the main sport ("auto" without one).
    var recommendedGoal: String?
    /// "auto" or the chosen beginner / regular / experienced (the gym's).
    var experience: String
    /// What the training history says while the experience is "auto".
    var autoExperience: String?
    /// strength, ride and run: auto or chosen, the level in use and the automatic one.
    var experienceBySport: [String: SportExperience]?
    var warmup: Bool?
    var warmupCardio: Bool?
    /// none / start / end / both, and the machine (an id of cardioOptions).
    var cardio: String?
    var cardioType: String?
    /// The cardio machines of the active place, and the jump rope.
    var cardioOptions: [CardioOption]?
    var stretching: Bool
    /// Typical minutes the routines add to each session length ("60" → warm-up and stretching).
    var extraMinutes: [String: Extra]?
    /// The automatic routines' length: "auto" or minutes.
    var warmupLength: JSONValue?
    var stretchingLength: JSONValue?
    /// The own routine used by default ("auto": the automatic one).
    var warmupRoutine: String?
    var stretchingRoutine: String?
    /// The athlete's own warm-ups and stretchings.
    var myRoutines: MyRoutines?

    struct MyRoutines: Decodable, Equatable {
        var warmup: [MyRoutine] = []
        var stretching: [MyRoutine] = []
    }

    /// An own warm-up or stretching: moves from the catalog (`move`) or own ones.
    struct MyRoutine: Decodable, Equatable, Identifiable, Hashable {
        var id: String
        var name: String
        var minutes: Int?
        var items: [MyItem]
    }

    struct MyItem: Decodable, Equatable, Hashable {
        var move: String?
        var name: String
        var seconds: Int
        var sides: Bool?

        /// As the server saves it: a catalog move by its id, an own one whole.
        var json: JSONValue {
            if let move { return .object(["move": .string(move)]) }
            return .object(["name": .string(name), "seconds": .number(Double(seconds)), "sides": .bool(sides == true)])
        }

        /// "30 s", "20 s na stranu", "5 min".
        var duration: String {
            let time = seconds >= 120 && seconds % 60 == 0 ? "\(seconds / 60) min" : "\(seconds) s"
            return time + (sides == true ? " " + L10n.tr("na stranu") : "")
        }
    }

    func routines(_ kind: GymRoutineKind) -> [MyRoutine] {
        kind == .warmup ? myRoutines?.warmup ?? [] : myRoutines?.stretching ?? []
    }

    /// The minutes of the automatic one, nil for auto.
    func length(_ kind: GymRoutineKind) -> Int? {
        if case .number(let n) = kind == .warmup ? warmupLength : stretchingLength { return Int(n) }
        return nil
    }

    /// The own routine used by default, nil for the automatic one.
    func routine(_ kind: GymRoutineKind) -> String? {
        let id = kind == .warmup ? warmupRoutine : stretchingRoutine
        return id == "auto" ? nil : id
    }

    func isOn(_ kind: GymRoutineKind) -> Bool { kind == .warmup ? warmup != false : stretching }

    struct Extra: Decodable, Equatable {
        let warmup: Int
        var cardio: Int? = nil
        let stretching: Int
    }

    struct CardioOption: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
    }

    /// The cardio mode, also from an older server that only knows warmupCardio.
    var cardioMode: String { cardio ?? (warmupCardio == false ? "none" : "start") }
}

extension APIClient {
    func gymPreferences() async throws -> GymPreferences {
        try await get("/app/api/gym/preferences")
    }

    func saveGymPreferences(_ changes: JSONObject) async throws -> GymPreferences {
        try await send("/app/api/gym/preferences", method: "POST", body: changes)
    }

    /// One day's warm-up or stretching: automatic with a length (nil: sized to
    /// the workout) or an own one (GET /app/api/gym/routine).
    func gymRoutine(date: String, kind: GymRoutineKind, length: Int?, routine: String?) async throws -> GymStretching {
        struct Reply: Decodable { let routine: GymStretching }
        let r: Reply = try await get("/app/api/gym/routine?date=" + date + "&kind=" + kind.id + "&length=" + (length.map(String.init) ?? "auto")
                                     + "&routine=" + Self.query(routine ?? "auto"))
        return r.routine
    }

    /// The moves an own warm-up or stretching is put together from.
    func gymRoutineMoves() async throws -> GymRoutineMoves {
        try await get("/app/api/gym/routine-moves")
    }
}

struct GymRoutineMoves: Decodable, Equatable {
    var warmup: [Move] = []
    var stretching: [Move] = []

    struct Move: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let seconds: Int
        let sides: Bool
        var needs: [String]? = nil
        var photos: [String]? = nil
    }

    func moves(_ kind: GymRoutineKind) -> [Move] { kind == .warmup ? warmup : stretching }
}

/// Cíl, Zkušenost, Kardio and Druh kardia: each saved as soon as it changes;
/// Rozcvička and Protažení open their own page (GymRoutineSettingsView).
struct GymPreferencesGroup: View {
    @Environment(AppModel.self) private var model
    @State private var prefs: GymPreferences?
    @State private var goal = "auto"
    @State private var cardio = "start"
    @State private var cardioType = "exercise_bike"
    @State private var choosingGoal = false
    @State private var error: String?

    static let goals = [("strength", "Síla"), ("strength_muscle", "Síla a svaly"), ("muscle", "Svaly"), ("muscle_fitness", "Svaly a kondice"), ("fitness", "Kondice")]
    static let cardioModes = [("none", "Ne"), ("start", "Začátek"), ("end", "Konec"), ("both", "Obojí")]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            group
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
        .onChange(of: goal) { _, value in goalChanged(value) }
        .onChange(of: cardio) { _, value in cardioChanged(value) }
        .onChange(of: cardioType) { _, value in cardioTypeChanged(value) }
    }

    private var group: some View {
        SettingsGroup(title: "Trénink na míru") {
            Button { choosingGoal = true } label: { goalRow }
                .buttonStyle(.plain)
                .sheet(isPresented: $choosingGoal) { GymGoalSheet(goal: $goal, recommended: prefs?.recommendedGoal) }
            SettingsDivider()
            NavigationLink { ExperienceSettingsView() } label: { SettingsRow(title: "Zkušenost", value: experienceValue) }
                .buttonStyle(.plain)
            SettingsDivider()
            routineLink(.warmup)
            SettingsDivider()
            VStack(alignment: .leading, spacing: 10) {
                Text("Kardio").font(.body).foregroundStyle(Palette.ink)
                Picker("Kardio", selection: $cardio) {
                    ForEach(Self.cardioModes, id: \.0) { mode in Text(LocalizedStringKey(mode.1)).tag(mode.0) }
                }
                .pickerStyle(.segmented)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            SettingsDivider()
            SettingsPicker(title: "Druh kardia", selection: $cardioType, options: cardioOptions)
                .disabled(cardio == "none")
            SettingsDivider()
            routineLink(.stretching)
        }
        .disabled(prefs == nil && !model.demo)
    }

    private func goalChanged(_ value: String) {
        save(["goal": .string(value)], unchanged: prefs?.goal == value)
    }

    /// The active place's cardio machines (the sample day: all of them).
    private var cardioOptions: [(String, String)] {
        let options = prefs?.cardioOptions ?? GymCardio.all.map { GymPreferences.CardioOption(id: $0, name: GymCardio.name($0)) }
        return options.map { ($0.id, $0.name) }
    }

    private func routineLink(_ kind: GymRoutineKind) -> some View {
        NavigationLink { GymRoutineSettingsView(kind: kind) } label: {
            SettingsRow(title: kind.title, value: routineValue(kind))
        }
        .buttonStyle(.plain)
    }

    /// "Automaticky", an own routine's name or "Vypnuto".
    private func routineValue(_ kind: GymRoutineKind) -> String {
        guard let prefs else { return L10n.tr("Automaticky") }
        if !prefs.isOn(kind) { return L10n.tr("Vypnuto") }
        return prefs.routine(kind).flatMap { id in prefs.routines(kind).first { $0.id == id }?.name } ?? L10n.tr("Automaticky")
    }

    private func cardioChanged(_ value: String) {
        let saved: String? = prefs?.cardioMode
        save(["cardio": .string(value)], unchanged: saved == value)
    }

    private func cardioTypeChanged(_ value: String) {
        let saved: String? = prefs?.cardioType
        save(["cardioType": .string(value)], unchanged: saved == value)
    }

    /// "Cíl  Auto · Síla a svaly ⌃⌄": opens the sheet with the goals.
    private var goalRow: some View {
        HStack(spacing: 12) {
            Text(L10n.tr("Cíl")).font(.body).foregroundStyle(Palette.ink).layoutPriority(1)
            Spacer(minLength: 8)
            Text(goalValue).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1).truncationMode(.tail)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }

    /// "Auto · Síla a svaly" (what the main sport recommends) or the chosen goal.
    private var goalValue: String {
        guard goal == "auto" else { return Self.goals.first { $0.0 == goal }.map { L10n.tr($0.1) } ?? L10n.tr("automaticky") }
        let guess = prefs?.recommendedGoal.flatMap { id in Self.goals.first { $0.0 == id }?.1 }
        return guess.map { L10n.f("Auto · %@", L10n.tr($0)) } ?? L10n.tr("Automaticky")
    }

    /// "Auto · Mírně pokročilý" or the chosen level: the gym's experience (set in Profil).
    private var experienceValue: String? {
        guard let gym = prefs?.experienceBySport?["strength"] else { return nil }
        return gym.mode == "auto" ? L10n.f("Auto · %@", ExperienceGroup.name(gym.autoLevel)) : ExperienceGroup.name(gym.level)
    }

    private func load() async {
        guard !model.demo else { return }
        // Again on every return: the experience may have changed in Profil.
        do { apply(try await model.api.gymPreferences()) } catch { self.error = error.localizedDescription }
    }

    private func apply(_ value: GymPreferences) {
        prefs = value
        goal = value.goal
        cardio = value.cardioMode
        cardioType = value.cardioType ?? value.cardioOptions?.first?.id ?? "exercise_bike"
    }

    private func save(_ change: JSONObject, unchanged: Bool) {
        guard !model.demo, prefs != nil, !unchanged else { return }
        Task {
            do { apply(try await model.api.saveGymPreferences(change)); error = nil } catch { self.error = error.localizedDescription }
        }
    }
}

/// Cíl: Auto (what the main sport recommends) on top, then each goal with the
/// reps and rest of its main lifts (src/strength-generator.js goalReps for a
/// regular lifter, src/strength-timing.js GOAL_RESTS for the heavy sets).
struct GymGoalSheet: View {
    @Binding var goal: String
    let recommended: String?
    @Environment(\.dismiss) private var dismiss

    static let numbers: [String: (reps: String, rest: String)] = [
        "strength": ("3–6", "3 min"), "strength_muscle": ("5–8", "2½ min"), "muscle": ("6–10", "2 min"),
        "muscle_fitness": ("8–12", "1½ min"), "fitness": ("12–15", "1¼ min")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(L10n.tr("Cíl")).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                }
                .padding(.bottom, 6)
                Button { pick("auto") } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "Auto").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(autoHint).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        check("auto")
                    }
                    .padding(.horizontal, 16).padding(.vertical, 13)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(goal == "auto" ? Palette.ink.opacity(0.7) : .clear, lineWidth: 1.5))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(goal == "auto" ? .isSelected : [])
                Text(L10n.tr("Nebo vyber")).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4).padding(.top, 8)
                VStack(spacing: 0) {
                    ForEach(Array(GymPreferencesGroup.goals.enumerated()), id: \.element.0) { index, item in
                        if index > 0 { SettingsDivider() }
                        Button { pick(item.0) } label: {
                            HStack(spacing: 12) {
                                Text(L10n.tr(item.1)).font(.body).foregroundStyle(Palette.ink)
                                Spacer(minLength: 8)
                                if let numbers = Self.numbers[item.0] {
                                    Text(L10n.f("%@ opakování · %@", numbers.reps, numbers.rest)).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
                                }
                                check(item.0)
                            }
                            .padding(.horizontal, 16).frame(minHeight: 50)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(goal == item.0 ? .isSelected : [])
                    }
                }
                .cardSurface(cornerRadius: 22)
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    /// "Podle tvého sportu: síla a svaly".
    private var autoHint: String {
        guard let name = recommended.flatMap({ id in GymPreferencesGroup.goals.first { $0.0 == id }?.1 }) else { return L10n.tr("Podle tvého sportu") }
        return L10n.f("Podle tvého sportu: %@", L10n.tr(name).lowercased())
    }

    private func check(_ id: String) -> some View {
        Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
            .frame(width: 18).opacity(goal == id ? 1 : 0)
    }

    private func pick(_ id: String) {
        goal = id
        dismiss()
    }
}

/// "+6 min navíc": time that comes on top of the chosen length.
struct ExtraMinutesPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(verbatim: text).font(.caption.weight(.semibold)).foregroundStyle(color)
            .padding(.horizontal, 10).frame(height: 24)
            .background(color.opacity(0.15), in: Capsule())
    }
}

/// Celkem 72 min: the warm-up, the lifting and the stretching as one bar.
struct GymTimeCard: View {
    let minutes: Int
    let warmup: Int
    let stretching: Int

    var body: some View {
        let extra = warmup + stretching
        Card {
            HStack(alignment: .firstTextBaseline) {
                Text(L10n.f("Celkem %@ min", String(minutes + extra))).font(.headline).foregroundStyle(Palette.ink)
                Spacer()
                Text(L10n.f("%@ + %@ navíc", String(minutes), String(extra))).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            GeometryReader { geo in
                let parts = [(warmup, Palette.amber), (minutes, Palette.ink.opacity(0.85)), (stretching, Palette.indigo)].filter { $0.0 > 0 }
                let total = CGFloat(parts.reduce(0) { $0 + $1.0 }), gap: CGFloat = 4
                let width = max(0, geo.size.width - gap * CGFloat(parts.count - 1))
                HStack(spacing: gap) {
                    ForEach(parts.indices, id: \.self) { i in
                        Capsule().fill(parts[i].1).frame(width: width * CGFloat(parts[i].0) / max(total, 1))
                    }
                }
            }
            .frame(height: 8)
            HStack(alignment: .top) {
                if warmup > 0 { label("Rozcvička", "+\(warmup) min", Palette.amber, .leading) }
                Spacer()
                label("Posilování", "\(minutes) min", Palette.ink, warmup > 0 ? .center : .leading)
                Spacer()
                if stretching > 0 { label("Protažení", "+\(stretching) min", Palette.indigo, .trailing) }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func label(_ title: String, _ value: String, _ color: Color, _ alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(title).font(.caption.weight(.medium)).foregroundStyle(color)
            Text(verbatim: value).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}
