import SwiftUI

// The parts of a gym day in order (Rozcvička, Kardio, Cviky, Kardio, Protažení):
// each but the exercises turned on or off for the day, the cardio's machine and
// minutes, and the order changed with Upravit pořadí. Nastavení → Posilovna holds the
// defaults (a warm-up or stretching turned off there is offered switched off);
// the day's choices are kept on the phone for that day.

/// The cardio machines (ids of src/stretching.js CARDIO_MACHINES).
enum GymCardio {
    static let all = ["exercise_bike", "treadmill", "rowing_ergometer", "elliptical", "stairmaster", "air_bike", "ski_erg", "jump_rope"]

    static func name(_ id: String) -> String {
        switch id {
        case "treadmill": return L10n.tr("Běžecký pás")
        case "rowing_ergometer": return L10n.tr("Veslo")
        case "elliptical": return L10n.tr("Eliptický trenažér")
        case "stairmaster": return L10n.tr("Schody")
        case "air_bike": return "Air bike"
        case "ski_erg": return "SkiErg"
        case "jump_rope": return L10n.tr("Švihadlo")
        default: return L10n.tr("Rotoped")
        }
    }

    static func symbol(_ id: String) -> String {
        switch id {
        case "treadmill": return "figure.run"
        case "rowing_ergometer": return "figure.rower"
        case "elliptical": return "figure.elliptical"
        case "stairmaster": return "figure.stair.stepper"
        case "jump_rope": return "figure.jumprope"
        default: return "figure.indoor.cycle"
        }
    }
}

enum GymDayPart: String, Codable, CaseIterable, Identifiable {
    case warmup, cardioStart, exercises, cardioEnd, stretching

    var id: String { rawValue }
    var isCardio: Bool { self == .cardioStart || self == .cardioEnd }
    var kind: GymRoutineKind {
        switch self {
        case .warmup, .exercises: return .warmup
        case .cardioStart, .cardioEnd: return .cardio
        case .stretching: return .stretching
        }
    }
}

/// One day's parts: their order, those turned off, each cardio's machine and minutes,
/// and a warm-up or stretching chosen for the day (another length or an own one).
struct GymDayParts: Codable, Equatable {
    var order: [GymDayPart]
    var off: [GymDayPart]
    var cardio: [String: Choice]
    var routines: [String: Routine]? = nil

    struct Choice: Codable, Equatable {
        var type: String
        var minutes: Int
    }

    /// The choice (an own routine's id, else automatic with a length; nil = auto) and what it made.
    struct Routine: Codable, Equatable {
        var routine: String?
        var length: Int?
        var moves: GymStretching
    }

    static let storageKey = "gym.day.parts"

    /// The plan's parts: the cardio the setup chose is on, the other one off, and
    /// the warm-up and the stretching off when Posilovna turned them off.
    static func defaults(_ day: GymDay) -> GymDayParts {
        let plan = day.cardio
        let type = plan?.type ?? "exercise_bike"
        var off: [GymDayPart] = day.routinesOff.compactMap { $0 == "warmup" ? .warmup : $0 == "stretching" ? .stretching : nil }
        if plan?.start == nil { off.append(.cardioStart) }
        if plan?.end == nil { off.append(.cardioEnd) }
        return GymDayParts(order: GymDayPart.allCases, off: off,
                           cardio: [GymDayPart.cardioStart.rawValue: Choice(type: type, minutes: plan?.start ?? 10),
                                    GymDayPart.cardioEnd.rawValue: Choice(type: type, minutes: plan?.end ?? 10)])
    }

    /// The day's saved choices, else the plan's.
    static func resolved(_ day: GymDay, stored: String, date: String) -> GymDayParts {
        var parts = all(stored)[date] ?? defaults(day)
        for part in GymDayPart.allCases where !parts.order.contains(part) { parts.order.append(part) }
        return parts
    }

    /// Saves the day's choices; only the last week's days are kept.
    static func saving(_ parts: GymDayParts, date: String, into stored: String) -> String {
        var days = all(stored)
        days[date] = parts
        let oldest = Calendar.current.date(byAdding: .day, value: -7, to: Date()).map { isoDay.string(from: $0) } ?? ""
        days = days.filter { $0.key >= oldest }
        guard let data = try? JSONEncoder().encode(days) else { return stored }
        return String(decoding: data, as: UTF8.self)
    }

    private static func all(_ stored: String) -> [String: GymDayParts] {
        guard let data = stored.data(using: .utf8) else { return [:] }
        return (try? JSONDecoder().decode([String: GymDayParts].self, from: data)) ?? [:]
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    func isOn(_ part: GymDayPart) -> Bool { part == .exercises || !off.contains(part) }

    func choice(_ part: GymDayPart) -> Choice {
        cardio[part.rawValue] ?? Choice(type: "exercise_bike", minutes: 10)
    }

    /// The parts the day has (the warm-up and the stretching only when the plan made them).
    func visible(_ day: GymDay) -> [GymDayPart] {
        order.filter { part in
            switch part {
            case .warmup: return day.warmup != nil
            case .stretching: return day.stretching != nil
            default: return true
            }
        }
    }

    /// The parts turned on before and after the exercises, in order.
    func before(_ day: GymDay) -> [GymDayPart] {
        let parts = visible(day)
        guard let i = parts.firstIndex(of: .exercises) else { return [] }
        return parts[..<i].filter(isOn)
    }

    func after(_ day: GymDay) -> [GymDayPart] {
        let parts = visible(day)
        guard let i = parts.firstIndex(of: .exercises) else { return [] }
        return parts[(i + 1)...].filter(isOn)
    }

    /// The moves of a part (a cardio part is one timed item).
    func routine(_ part: GymDayPart, day: GymDay) -> GymStretching? {
        switch part {
        case .warmup: return routines?[part.rawValue]?.moves ?? day.warmup
        case .stretching: return routines?[part.rawValue]?.moves ?? day.stretching
        case .exercises: return nil
        case .cardioStart, .cardioEnd:
            let c = choice(part)
            let item = GymStretching.Item(id: part == .cardioStart ? "cardio-start" : "cardio-end", name: GymCardio.name(c.type),
                                          seconds: c.minutes * 60, sides: false,
                                          steps: [L10n.tr("Tempo, při kterém ještě zvládneš mluvit.")])
            return GymStretching(minutes: c.minutes, items: [item])
        }
    }

    func minutes(_ part: GymDayPart, day: GymDay) -> Int { routine(part, day: day)?.minutes ?? 0 }

    /// "Automaticky · 6 min", "Legs · 7 min", "Rotoped · 10 min".
    func subtitle(_ part: GymDayPart, day: GymDay) -> String {
        if part.isCardio {
            let c = choice(part)
            return GymCardio.name(c.type) + " · \(c.minutes) min"
        }
        let name = routine(part, day: day)?.name?.nilIfBlank ?? L10n.tr("Automaticky")
        return name + " · \(minutes(part, day: day)) min"
    }

    /// Moves `part` to where `target` is.
    mutating func move(_ part: GymDayPart, to target: GymDayPart) {
        guard part != target, let from = order.firstIndex(of: part), let to = order.firstIndex(of: target) else { return }
        order.remove(at: from)
        order.insert(part, at: to)
    }

    /// Moves `part` one place up (-1) or down (+1) among the day's parts.
    mutating func step(_ part: GymDayPart, by offset: Int, day: GymDay) {
        let shown = visible(day)
        guard let i = shown.firstIndex(of: part), shown.indices.contains(i + offset) else { return }
        move(part, to: shown[i + offset])
    }
}

/// Dnešní trénink: the parts in order, each with its switch; a tap on a part
/// changes it for the day (the cardio's machine and minutes, the warm-up's or
/// stretching's kind and length). Upravit pořadí shows arrows that move a part up or down.
struct GymPartsCard: View {
    let day: GymDay
    let date: String
    @Environment(AppModel.self) private var model
    @AppStorage(GymDayParts.storageKey) private var stored = ""
    @State private var editing: GymDayPart?
    @State private var choosing: GymDayPart?
    @State private var reordering = false
    @State private var options: [GymPreferences.CardioOption] = []

    private var parts: GymDayParts { GymDayParts.resolved(day, stored: stored, date: date) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Dnešní trénink")
                Spacer()
                Button(reordering ? LocalizedStringKey("Hotovo") : LocalizedStringKey("Upravit pořadí")) { withAnimation(.snappy) { reordering.toggle() } }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
                    .buttonStyle(.plain)
            }
            Card(padding: 8) {
                VStack(spacing: 0) {
                    let shown = parts.visible(day)
                    ForEach(Array(shown.enumerated()), id: \.element) { index, part in
                        if index > 0 { Divider().overlay(Palette.hairline).padding(.leading, 48) }
                        row(part, first: index == 0, last: index == shown.count - 1)
                    }
                }
            }
        }
        .sheet(item: $editing) { part in
            GymCardioSheet(choice: parts.choice(part), options: options) { choice in update { $0.cardio[part.rawValue] = choice } }
        }
        .sheet(item: $choosing) { part in
            GymRoutineSheet(part: part, day: day, date: date)
        }
        .task {
            guard !model.demo, options.isEmpty else { return }
            if let loaded = try? await model.api.gymPreferences().cardioOptions { options = loaded }
        }
    }

    private func update(_ change: (inout GymDayParts) -> Void) {
        var next = parts
        change(&next)
        stored = GymDayParts.saving(next, date: date, into: stored)
    }

    private func row(_ part: GymDayPart, first: Bool, last: Bool) -> some View {
        let on = parts.isOn(part)
        return HStack(spacing: 10) {
            Button { open(part) } label: {
                HStack(spacing: 10) {
                    Image(systemName: symbol(part)).font(.system(size: 15, weight: .medium)).foregroundStyle(color(part))
                        .frame(width: 34, height: 34)
                        .background(color(part).opacity(0.14), in: Circle())
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title(part)).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                        HStack(spacing: 3) {
                            Text(verbatim: subtitle(part)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                            if part != .exercises && !reordering {
                                Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)).foregroundStyle(Palette.faint)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    Spacer(minLength: 6)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(part == .exercises || reordering || !on)
            if reordering {
                HStack(spacing: 8) {
                    arrow(part, up: true).disabled(first).opacity(first ? 0.3 : 1)
                    arrow(part, up: false).disabled(last).opacity(last ? 0.3 : 1)
                }
            } else if part != .exercises {
                Toggle(isOn: Binding(get: { on }, set: { value in
                    update { p in p.off.removeAll { $0 == part }; if !value { p.off.append(part) } }
                })) { EmptyView() }
                    .toggleStyle(AurinToggleStyle())
                    .fixedSize()
                    .accessibilityLabel(Text(title(part)))
            }
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 56)
        .opacity(on || reordering ? 1 : 0.45)
        .accessibilityElement(children: .contain)
    }

    /// A tap on a part: the cardio's machine and minutes, the warm-up's or stretching's kind and length.
    private func open(_ part: GymDayPart) {
        if part.isCardio { editing = part } else if part != .exercises { choosing = part }
    }

    private func arrow(_ part: GymDayPart, up: Bool) -> some View {
        Button {
            withAnimation(.snappy) { update { $0.step(part, by: up ? -1 : 1, day: day) } }
        } label: {
            Image(systemName: up ? "chevron.up" : "chevron.down").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.ink)
                .frame(width: 34, height: 34)
                .background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(up ? LocalizedStringKey("Posunout výš") : LocalizedStringKey("Posunout níž")))
    }

    private func title(_ part: GymDayPart) -> LocalizedStringKey {
        switch part {
        case .warmup: return "Rozcvička"
        case .stretching: return "Protažení"
        case .exercises: return "Cviky"
        case .cardioStart, .cardioEnd: return "Kardio"
        }
    }

    private func subtitle(_ part: GymDayPart) -> String {
        switch part {
        case .exercises:
            let count = day.exercises.count
            let word = count == 1 ? L10n.f("%@ cvik", String(count)) : (2...4).contains(count) ? L10n.f("%@ cviky", String(count)) : L10n.f("%@ cviků", String(count))
            return day.plannedMinutes.map { word + " · \($0) min" } ?? word
        default:
            return parts.subtitle(part, day: day)
        }
    }

    private func symbol(_ part: GymDayPart) -> String {
        part == .exercises ? "dumbbell.fill" : part.isCardio ? GymCardio.symbol(parts.choice(part).type) : part.kind.symbol
    }

    private func color(_ part: GymDayPart) -> Color { part == .exercises ? Palette.amberBar : part.kind.color }
}

/// Kardio: the machine (the active place's, and the jump rope) and the minutes.
struct GymCardioSheet: View {
    let choice: GymDayParts.Choice
    let options: [GymPreferences.CardioOption]
    var onDone: (GymDayParts.Choice) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var type = "exercise_bike"
    @State private var minutes = 10

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, option in
                            if index > 0 { SettingsDivider() }
                            Button { type = option.id } label: {
                                HStack {
                                    Text(verbatim: GymCardio.name(option.id)).font(.body).foregroundStyle(Palette.ink)
                                    Spacer()
                                    if option.id == type {
                                        Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.amber)
                                    }
                                }
                                .padding(.horizontal, 16).frame(minHeight: 48)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(option.id == type ? .isSelected : [])
                        }
                    }
                    .cardSurface(cornerRadius: 22)
                    Stepper(value: $minutes, in: 5...60, step: 5) {
                        HStack {
                            Text("Délka").font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: "\(minutes) min").font(Typo.bodyStrong).foregroundStyle(Palette.ink).monospacedDigit()
                        }
                    }
                    .padding(.horizontal, 16).frame(minHeight: 52)
                    .cardSurface(cornerRadius: 22)
                }
                .padding(20)
            }
            .background(Palette.background)
            .navigationTitle("Kardio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { onDone(GymDayParts.Choice(type: type, minutes: minutes)); dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { type = choice.type; minutes = choice.minutes }
    }

    /// The place's machines (all of them in the sample day or until they load), the chosen one kept.
    private var shown: [GymPreferences.CardioOption] {
        var list = options.isEmpty ? GymCardio.all.map { GymPreferences.CardioOption(id: $0, name: GymCardio.name($0)) } : options
        if !list.contains(where: { $0.id == type }) { list.insert(GymPreferences.CardioOption(id: type, name: GymCardio.name(type)), at: 0) }
        return list
    }
}

/// Rozcvička or Protažení for the day: automatic with a length (Auto is sized to
/// the workout) or one of the athlete's own; the moves it makes below. Hotovo
/// keeps the choice for the day, Nastavení → Posilovna stays as it was.
struct GymRoutineSheet: View {
    let part: GymDayPart
    let day: GymDay
    let date: String
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage(GymDayParts.storageKey) private var stored = ""
    @State private var mine: [GymPreferences.MyRoutine] = []
    /// The own routine's id; nil for the automatic one.
    @State private var routine: String?
    /// The automatic one's minutes; nil for Auto.
    @State private var length: Int?
    @State private var moves: GymStretching?
    @State private var loading = false
    @State private var changed = false
    @State private var error: String?

    static let lengths = [0, 5, 10, 15]

    private var kind: GymRoutineKind { part.kind }
    private var parts: GymDayParts { GymDayParts.resolved(day, stored: stored, date: date) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(spacing: 0) {
                        option(nil, title: L10n.tr("Automaticky"), minutes: nil)
                        ForEach(mine) { own in
                            SettingsDivider()
                            option(own.id, title: own.name, minutes: own.minutes)
                        }
                    }
                    .cardSurface(cornerRadius: 22)
                    if routine == nil {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Délka").font(.body).foregroundStyle(Palette.ink)
                            Picker("Délka", selection: Binding(get: { length ?? 0 }, set: { value in choose(nil, length: value == 0 ? nil : value) })) {
                                ForEach(Self.lengths, id: \.self) { m in
                                    Text(verbatim: m == 0 ? L10n.tr("Auto") : "\(m) min").tag(m)
                                }
                            }
                            .pickerStyle(.segmented)
                        }
                        .padding(16)
                        .cardSurface(cornerRadius: 22)
                    }
                    if let moves, !moves.items.isEmpty {
                        SectionLabel(text: "Dnes").padding(.top, 4)
                        VStack(spacing: 0) {
                            ForEach(Array(moves.items.enumerated()), id: \.offset) { index, item in
                                if index > 0 { SettingsDivider() }
                                HStack(spacing: 8) {
                                    Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                                    Spacer(minLength: 6)
                                    Text(verbatim: item.duration).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
                                }
                                .padding(.horizontal, 16).frame(minHeight: 46)
                            }
                        }
                        .cardSurface(cornerRadius: 22)
                        .opacity(loading ? 0.5 : 1)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
                .padding(20)
            }
            .background(Palette.background)
            .navigationTitle(Text(kind.title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { save(); dismiss() }.disabled(loading)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private func option(_ id: String?, title: String, minutes: Int?) -> some View {
        Button { choose(id, length: id == nil ? length : nil) } label: {
            HStack(spacing: 8) {
                Text(verbatim: title).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 6)
                if let minutes { Text(verbatim: "\(minutes) min").font(.subheadline).foregroundStyle(Palette.muted) }
                if routine == id {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.amber)
                }
            }
            .padding(.horizontal, 16).frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(routine == id ? .isSelected : [])
    }

    /// The day's choice so far, and the athlete's own routines to pick from.
    private func load() async {
        let current = parts.routines?[part.rawValue]
        routine = current?.routine
        length = current?.length
        moves = parts.routine(part, day: day)
        guard !model.demo, let prefs = try? await model.api.gymPreferences() else { return }
        mine = prefs.routines(kind)
        // A plan made with an own routine: that one is ticked.
        if current == nil, let name = moves?.name, let own = mine.first(where: { $0.name == name }) { routine = own.id }
    }

    /// Another kind or length: the server builds it for the day's exercises.
    private func choose(_ id: String?, length minutes: Int?) {
        guard id != routine || minutes != length else { return }
        routine = id
        length = minutes
        changed = true
        guard !model.demo else { return }
        loading = true
        Task {
            do {
                moves = try await model.api.gymRoutine(date: date, kind: kind, length: minutes, routine: id)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
            loading = false
        }
    }

    private func save() {
        guard changed, let moves else { return }
        var next = parts
        var routines = next.routines ?? [:]
        routines[part.rawValue] = GymDayParts.Routine(routine: routine, length: length, moves: moves)
        next.routines = routines
        stored = GymDayParts.saving(next, date: date, into: stored)
    }
}
