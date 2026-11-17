import SwiftUI

// MARK: - Training → today's workout card (redesign T, card A)
//
// One card for every sport (Petr 2026-11-16, "takto ok"): the sport's wash, the
// serif title and when, a centred number row (Time, the sport's middle numbers,
// Strain est.), the parts as a row of lines with their names and minutes, and
// Start workout as an ink pill. No icons. Endurance parts take their zone's
// colour and the type word (Endurance, Tempo, Threshold…), never "Zone N"; the
// target (W, pace, heart rate) only above the work part (level 2). Gym lines
// stay neutral.

/// One part of the workout in the card's row.
struct WorkoutCardPart: Equatable {
    let name: String
    let minutes: Int
    /// The zone (0 = Z1) of an endurance part; nil for the gym's neutral lines.
    var zone: Int? = nil
    /// "210–230 W" above a work part only.
    var target: String? = nil
}

enum WorkoutCardParts {
    /// The type word of a zone, worked out from the step's target (never from
    /// the name the AI wrote, which can say "Z2").
    static func word(zone: Int) -> String {
        let words = ["Regenerace", "Vytrvalost", "Tempo", "Práh", "VO2max", "Anaerobní", "Sprint"]
        return L10n.tr(words[max(0, min(zone, words.count - 1))])
    }

    /// Coggan's zones on % of threshold (WorkoutProfile.color uses the same edges).
    static func zone(percent: Double) -> Int {
        switch percent {
        case ..<56: return 0
        case ..<76: return 1
        case ..<91: return 2
        case ..<106: return 3
        case ..<121: return 4
        case ..<151: return 5
        default: return 6
        }
    }

    /// Warm-up, the main part named by its hardest work, cool-down: at most
    /// three lines, so the card stays calm (the detail has every step).
    static func endurance(_ blocks: [PlannedWorkout.Block], sport: String) -> [WorkoutCardPart] {
        let segments = WorkoutProfile.segments(blocks)
        guard !segments.isEmpty else { return [] }
        let warm = segments.prefix { $0.step.intensity == "warmup" }
        let rest = segments.dropFirst(warm.count)
        let cool = Array(rest.reversed().prefix { $0.step.intensity == "cooldown" }.reversed())
        let main = Array(rest.dropLast(cool.count))
        func minutes(_ list: some Collection<WorkoutProfile.Segment>) -> Int { Int(list.reduce(0) { $0 + ($1.end - $1.start) }.rounded()) }
        var parts: [WorkoutCardPart] = []
        if !warm.isEmpty { parts.append(.init(name: L10n.tr("Rozcvička"), minutes: minutes(warm), zone: 0)) }
        if !main.isEmpty {
            let hardest = main.max { WorkoutProfile.shown($0.percent, sport: sport) < WorkoutProfile.shown($1.percent, sport: sport) }
            let zone = hardest.map { Self.zone(percent: WorkoutProfile.shown($0.percent, sport: sport)) } ?? 1
            parts.append(.init(name: word(zone: zone), minutes: minutes(main), zone: zone, target: hardest.flatMap { target($0.step, sport: sport) }))
        }
        if !cool.isEmpty { parts.append(.init(name: L10n.tr("Zklidnění"), minutes: minutes(cool), zone: 0)) }
        return parts.filter { $0.minutes > 0 }
    }

    /// Minutes at Tempo or harder: the card's "Work" for a short workout.
    static func workMinutes(_ blocks: [PlannedWorkout.Block], sport: String) -> Int {
        Int(WorkoutProfile.segments(blocks).filter { WorkoutProfile.shown($0.percent, sport: sport) >= 76 && $0.step.rest != true }
            .reduce(0) { $0 + ($1.end - $1.start) }.rounded())
    }

    /// A swim's metres, nil without lengths.
    static func meters(_ blocks: [PlannedWorkout.Block]) -> Double? {
        var total = 0.0
        for block in blocks {
            for _ in 0..<max(1, block.repeats ?? 1) {
                for step in block.steps ?? [] where step.rest != true { total += step.meters ?? 0 }
            }
        }
        return total > 0 ? total : nil
    }

    /// "210–230 W", "4:35–4:50 /km", "1:45 /100 m", "142–152 bpm".
    static func target(_ s: PlannedWorkout.Step, sport: String) -> String? {
        func range(_ a: Double?, _ b: Double?, _ text: (Double) -> String) -> String? {
            switch (a, b) {
            case let (a?, b?) where text(a) != text(b): return text(min(a, b)) + "–" + text(max(a, b))
            case let (a?, _): return text(a)
            case let (nil, b?): return text(b)
            default: return nil
            }
        }
        if let w = range(s.wattsLow, s.wattsHigh, { String(Int($0.rounded())) }) { return w + " W" }
        // Faster first: the lower number of seconds.
        if let p = range(s.paceFast, s.paceSlow, { ZoneMath.clock($0) }) { return p + (sport == "swim" ? " /100 m" : " /km") }
        if let h = range(s.hrLow, s.hrHigh, { String(Int($0.rounded())) }) { return h + " bpm" }
        return nil
    }
}

/// The parts as lines side by side, as wide as their minutes, the name and
/// minutes centred under each; a work part's target in text size above it.
struct WorkoutPartsRow: View {
    let parts: [WorkoutCardPart]

    var body: some View {
        let total = max(1, parts.reduce(0) { $0 + $1.minutes })
        // Short parts keep room for their words.
        let weights = parts.map { max(Double($0.minutes) / Double(total), 0.22) }
        GeometryReader { geo in
            let gap: CGFloat = 6, width = geo.size.width - gap * CGFloat(max(0, parts.count - 1))
            let sum = weights.reduce(0, +)
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                    VStack(spacing: 4) {
                        Text(verbatim: part.target ?? " ").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .opacity(part.target == nil ? 0 : 1)
                        Capsule().fill(color(part)).frame(height: 4)
                            .overlay { if part.zone == 0 { Capsule().strokeBorder(Palette.ink.opacity(0.18), lineWidth: 0.5) } }
                        Text(verbatim: part.name).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.75)
                        Text(verbatim: Fmt.duration(part.minutes)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                    .frame(width: max(0, width * weights[i] / sum))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel([part.name, Fmt.duration(part.minutes), part.target].compactMap { $0 }.joined(separator: ", "))
                }
            }
        }
        .frame(height: 74)
    }

    private func color(_ part: WorkoutCardPart) -> Color {
        guard let zone = part.zone else { return Palette.track }
        return Palette.Zone.color(zone)
    }
}

/// The number row: label above, serif number with its unit, thin lines between.
struct WorkoutNumberRow: View {
    struct Cell: Equatable {
        let label: String
        let value: String
        var unit: String? = nil
    }

    let cells: [Cell]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { i, cell in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(width: 1, height: 34) }
                VStack(spacing: 2) {
                    Text(verbatim: cell.label).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(verbatim: cell.value).font(Typo.number(24)).foregroundStyle(Palette.ink)
                        if let unit = cell.unit { Text(verbatim: unit).font(Typo.caption).foregroundStyle(Palette.muted) }
                    }
                    .lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
    }
}
