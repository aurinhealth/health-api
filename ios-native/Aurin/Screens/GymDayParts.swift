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

/// One day's parts: their order, those turned off and each cardio's machine and minutes.
struct GymDayParts: Codable, Equatable {
    var order: [GymDayPart]
    var off: [GymDayPart]
    var cardio: [String: Choice]

    struct Choice: Codable, Equatable {
        var type: String
        var minutes: Int
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
        case .warmup: return day.warmup
        case .stretching: return day.stretching
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

/// Dnešní trénink: the parts in order, each with its switch and the cardio's Změnit;
/// Upravit pořadí shows arrows that move a part up or down.
struct GymPartsCard: View {
    let day: GymDay
    let date: String
    @Environment(AppModel.self) private var model
    @AppStorage(GymDayParts.storageKey) private var stored = ""
    @State private var editing: GymDayPart?
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
            Image(systemName: symbol(part)).font(.system(size: 15, weight: .medium)).foregroundStyle(color(part))
                .frame(width: 34, height: 34)
                .background(color(part).opacity(0.14), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title(part)).font(.body).foregroundStyle(Palette.ink).lineLimit(1)
                Text(verbatim: subtitle(part)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 6)
            if reordering {
                HStack(spacing: 8) {
                    arrow(part, up: true).disabled(first).opacity(first ? 0.3 : 1)
                    arrow(part, up: false).disabled(last).opacity(last ? 0.3 : 1)
                }
            } else {
                if part.isCardio {
                    Button { editing = part } label: {
                        Text("Změnit").font(.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 10).frame(height: 28)
                            .background(Palette.track, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(!on)
                }
                if part != .exercises {
                    Toggle(isOn: Binding(get: { on }, set: { value in
                        update { p in p.off.removeAll { $0 == part }; if !value { p.off.append(part) } }
                    })) { EmptyView() }
                        .toggleStyle(AurinToggleStyle())
                        .fixedSize()
                        .accessibilityLabel(Text(title(part)))
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
        .opacity(on || reordering ? 1 : 0.45)
        .accessibilityElement(children: .contain)
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
        case .cardioStart, .cardioEnd:
            let c = parts.choice(part)
            return GymCardio.name(c.type) + " · \(c.minutes) min"
        default:
            return "\(parts.minutes(part, day: day)) min"
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
