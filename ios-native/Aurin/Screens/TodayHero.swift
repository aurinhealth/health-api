import SwiftUI

// The top of Today in the redesign (part D, concept 01-dnes a-hlavni): the
// line under the readiness, the weather capsule at the right edge of the
// readiness row, the morning question and the three dials.

extension ReadinessText {
    /// The line under the readiness number (D-DNES-2, Petr's step 3 decision 1):
    /// what the numbers say, never what to do; that stays in the coach's card.
    /// One key from the server (src/day-verdict.js NUMBERS_LINE_KEYS).
    static func numbersLine(_ key: String?, off: [String]? = nil) -> String? {
        if key == "steady" || key == "easy", let named = offLine(off ?? []) { return named }
        switch key {
        // Descriptive only (improvement pass 2026-11-20): "support a hard
        // workout" read as advice and said the opposite of the coach's card
        // after a finished workout.
        case "hard": return L10n.tr("Tvoje čísla jsou v obvyklém rozmezí nebo lepší")
        case "steady": return L10n.tr("Některá tvoje čísla jsou pod obvyklým rozmezím")
        case "easy": return L10n.tr("Tvoje čísla jsou pod obvyklým rozmezím")
        case "signs": return L10n.tr("Teplota nebo dech jsou nad tvým obvyklým rozmezím")
        case "usual": return L10n.tr("Tvoje čísla jsou v obvyklém rozmezí")
        case "paused": return L10n.tr("Trénink je dnes pozastavený")
        default: return nil
        }
    }

    /// A yellow or red line names what is off (p7, Petr 2026-11-23): "Short
    /// sleep and a high resting heart rate". Nil when nothing is named.
    static func offLine(_ off: [String]) -> String? {
        let parts = off.compactMap { key -> String? in
            switch key {
            case "sleep": return L10n.tr("krátký spánek")
            case "hrv": return L10n.tr("nízká HRV")
            case "restingHR": return L10n.tr("vysoký klidový tep")
            default: return nil
            }
        }
        guard let first = parts.first else { return nil }
        let joined = parts.count == 1 ? first
            : parts.dropLast().joined(separator: ", ") + " " + L10n.tr("a") + " " + parts[parts.count - 1]
        return Fmt.capitalized(joined)
    }
}

/// The weather at the right edge of the readiness row (Petr 2026-11-13, weather
/// concept round 2): today's symbol in Apple's colours and the temperature. A
/// tap opens the forecast; without a place only a location symbol, which opens
/// the choice of it. The status stands left of it.
struct WeatherCapsule: View {
    let weather: TodaySnapshot.Weather?
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 5) {
                if let weather {
                    Image(systemName: WeatherText.symbol(weather.now?.code ?? weather.code, night: WeatherText.isNight))
                        .symbolRenderingMode(.multicolor)
                        .scaledFont(14, weight: .semibold, cap: .denseCap)
                    Text(verbatim: WeatherText.degrees(weather.now?.temp ?? weather.max))
                        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        .monospacedDigit()
                        .fixedSize()
                } else {
                    Image(systemName: "location.fill")
                        .scaledFont(11, weight: .semibold, cap: .denseCap)
                        .foregroundStyle(Palette.secondary)
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background(Palette.track, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .tapTarget(width: 30, height: 30)
        .accessibilityLabel(Text(verbatim: spoken))
        .accessibilityHint(Text(verbatim: L10n.tr(weather == nil ? "Vybere místo pro počasí" : "Otevře předpověď")))
        .accessibilityIdentifier("today-weather.capsule")
        .sheet(isPresented: $open) { WeatherSheet(weather: weather) }
    }

    /// "Weather, 9°, rain", or "Add weather" without a place.
    private var spoken: String {
        guard let weather else { return L10n.tr("Přidat počasí") }
        return [L10n.tr("Počasí"), WeatherText.degrees(weather.now?.temp ?? weather.max), WeatherText.description(weather.now?.code ?? weather.code)]
            .compactMap { $0 }.joined(separator: ", ")
    }
}

/// "How do you feel today?" under the readiness, for today only (concept
/// g-ranni-otazka; S3 QA-2): the answer never changes the readiness, the coach
/// keeps it for the day. It goes after an answer or the ✕ (for that day), and
/// works with the Journal off. The readiness detail keeps its own question,
/// where the answer can be changed (MorningCheckinCard).
struct TodayMorningQuestion: View {
    @Environment(AppModel.self) private var model
    let date: String
    let feeling: String?
    /// The day the ✕ was tapped: the question stays away for that day.
    @AppStorage("today.morning-question.closed") private var closedOn = ""
    @State private var chosen: String?
    @State private var saving = false
    @State private var answers = 0

    struct Option: Identifiable {
        let id: String
        let label: String
    }

    static let options = [Option(id: "fresh", label: "Svěží"), Option(id: "normal", label: "Normál"), Option(id: "tired", label: "Unavený")]

    /// Shown while unanswered and not closed for the day.
    static func shows(feeling: String?, closedOn: String, date: String) -> Bool {
        feeling == nil && closedOn != date
    }

    var body: some View {
        if Self.shows(feeling: chosen ?? feeling, closedOn: closedOn, date: date) || saving {
            card
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                Text("Jak se dnes cítíš?").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button { withAnimation(.snappy) { closedOn = date } } label: {
                    Image(systemName: "xmark").scaledFont(12, weight: .semibold).foregroundStyle(Palette.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -12).padding(.trailing, -12)
                .accessibilityLabel("Zavřít")
                .accessibilityIdentifier("today.morning-question.close")
            }
            HStack(spacing: 8) {
                ForEach(Self.options) { option in
                    let on = chosen == option.id
                    Button { Task { await choose(option.id) } } label: {
                        Text(L10n.tr(option.label))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                            .lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity).frame(minHeight: 44)
                            .background(on ? Palette.button : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .sensoryFeedback(.impact(weight: .light), trigger: answers)
        .accessibilityIdentifier("today.morning-question")
    }

    private func choose(_ id: String) async {
        chosen = id
        saving = true
        answers += 1
        defer { saving = false }
        do {
            try await model.setMorningCheckin(id)
        } catch {
            chosen = nil
            model.notice = error.localizedDescription
        }
    }
}

/// Sleep, Strain and HRV under the readiness as the Health dials (concept
/// a-hlavni point 4): the usual range or the target as the band, the dot is
/// today, and one short line with numbers under each. Without a watch or ring
/// the steps take HRV's place (audit 14.2).
struct TodayDials: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot
    @ScaledMetric(relativeTo: .body) private var dial: CGFloat = 76

    struct Cell {
        var value: Double?
        var scale: ClosedRange<Double>
        var band: ClosedRange<Double>?
        var number: String
        var unit: String?
        var note: String?
        var color: Color = Palette.muted
        var spokenValue: String? = nil
        /// What VoiceOver reads instead of the note (the gap the colour shows).
        var spokenNote: String? = nil
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                RouteLink(route: .sleep) { cell("Spánek", sleep) }
                Divider().overlay(Palette.hairline)
                RouteLink(route: .strain) { cell("Námaha", strain) }
                Divider().overlay(Palette.hairline)
                if model.noWearable {
                    RouteLink(route: .steps) { cell("Kroky", steps) }
                } else {
                    RouteLink(route: .metric(.hrv)) { cell("HRV", hrv) }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            if today.unavailable?.contains("health") == true {
                Divider().overlay(Palette.hairline)
                PartUnavailableNote(text: "Data ze zdraví se teď nepodařilo načíst")
            } else if sleepFailed {
                Divider().overlay(Palette.hairline)
                PartUnavailableNote(text: "Spánek se teď nepodařilo načíst")
            }
        }
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .accessibilityIdentifier("today.dials")
    }

    private var sleepFailed: Bool { today.unavailable?.contains("sleep") == true && today.sleep?.minutes == nil }

    /// "6 h 54 min" (Fmt.duration); a whole hour is "7 h", as in the
    /// concept's "6 min short of 7 h".
    nonisolated static func length(_ minutes: Double?) -> String {
        guard let minutes else { return "–" }
        return Fmt.duration(Int(minutes.rounded()))
    }

    /// The night against its need: "of 7 h needed", amber below the need,
    /// red under three quarters of it (as on the watch).
    var sleep: Cell {
        let minutes = sleepFailed ? nil : today.sleep?.minutes
        guard let minutes else { return Cell(value: nil, scale: 0...480, number: "–") }
        let spoken = Fmt.hoursMinutesSpoken(minutes)
        // In the dial "4 h 23" with a small "min" below, as "ms" under the HRV (Petr 2026-11-23).
        let dial = Fmt.durationParts(Int(minutes.rounded()))
        guard let need = today.sleep?.need, need > 0 else {
            return Cell(value: minutes, scale: 0...max(540, minutes), number: dial.number, unit: dial.unit, spokenValue: spoken)
        }
        let n = Double(need), gap = Int((n - minutes).rounded())
        // A line under the dial, so the whole length (Petr 2026-11-23: "of 8 h 58 min needed").
        let needText = Fmt.duration(Int(n.rounded()))
        // Under the need "of 8 h 58 min needed", read with the dial as "4 h 23 of 8 h 58 min"
        // like Strain's "1.6 of 21" (Petr 2026-11-23: a gap and a need in one line
        // read as two lengths); over it the gap stays. VoiceOver says the gap.
        let gapText = gap > 0 ? L10n.f("o %@ méně než %@", Fmt.duration(gap), needText)
            : gap < 0 ? L10n.f("o %@ víc než %@", Fmt.duration(-gap), needText)
            : L10n.f("přesně %@", needText)
        return Cell(value: minutes, scale: 0...max(n * 1.3, minutes), band: n...(n + 60), number: dial.number, unit: dial.unit,
                    note: gap > 0 ? L10n.f("z potřebných %@", needText) : gapText, color: minutes >= n ? Palette.green : minutes >= n * 0.75 ? Palette.amber : Palette.red,
                    spokenValue: spoken, spokenNote: gapText)
    }

    /// The day's strain adding up against today's target: "target 11 to 14".
    var strain: Cell {
        let score = today.strain.score
        guard let t = today.strain.target else {
            return Cell(value: score, scale: 0...21, number: Fmt.decimal(score), unit: L10n.tr("z 21"),
                        note: today.strain.planned.map { L10n.f("plán ~%@", Fmt.decimal($0)) })
        }
        let color: Color = score.map { RangeBar.side($0, t.low, t.high) == 0 ? Palette.green : $0 > t.high ? Palette.amber : Palette.muted } ?? Palette.muted
        return Cell(value: score, scale: 0...21, band: t.low...max(t.low, t.high), number: Fmt.decimal(score), unit: L10n.tr("z 21"),
                    note: (score ?? 0) > t.high
                        // Against the shown "11", not 11.1: 13.5 is 2.5 over it (617 C11).
                        ? L10n.f("%@ nad cílem %@ až %@", Fmt.decimal(max(0, (score ?? 0) - t.high.rounded())), Fmt.int(t.low), Fmt.int(t.high))
                        : L10n.f("cíl %@ až %@", Fmt.int(t.low), Fmt.int(t.high)), color: color)
    }

    /// HRV against the usual range: "usual 60 to 74"; before the range, the change from the baseline.
    var hrv: Cell {
        guard let value = today.hrv?.value else { return Cell(value: nil, scale: 0...100, number: "–", unit: "ms") }
        if let low = today.hrv?.low, let high = today.hrv?.high, high > low {
            let pad = (high - low) * 1.2
            return Cell(value: value, scale: max(0, min(low - pad, value - 5))...max(high + pad, value + 5), band: low...high, number: Fmt.int(value), unit: "ms",
                        note: L10n.f("obvykle %@ až %@", Fmt.int(low), Fmt.int(high)), color: RangeBar.color(value, low, high, worseAbove: false))
        }
        guard let base = today.hrv?.baseline else { return Cell(value: nil, scale: 0...100, number: Fmt.int(value), unit: "ms", note: L10n.tr("Zatím bez obvyklého rozmezí")) }
        let d = (value - base).rounded()
        return Cell(value: nil, scale: 0...100, number: Fmt.int(value), unit: "ms",
                    note: (d >= 0 ? "↑ " : "↓ ") + Fmt.int(abs(d)) + " ms", color: d >= 0 ? Palette.green : Palette.rust)
    }

    /// Without a watch or ring: the day's steps against their goal.
    var steps: Cell {
        let value = today.steps.today
        guard today.steps.goal > 0 else { return Cell(value: nil, scale: 0...10000, number: Fmt.int(value)) }
        let goal = Double(today.steps.goal)
        return Cell(value: value, scale: 0...max(goal * 1.2, value ?? 0), band: goal...max(goal, goal * 1.2), number: Fmt.int(value),
                    note: L10n.f("cíl %@", Fmt.int(goal)), color: (value ?? 0) >= goal ? Palette.green : Palette.muted)
    }

    private func cell(_ title: String, _ c: Cell) -> some View {
        VStack(spacing: 6) {
            // Concept D (Petr 2026-11-20, "no colours"): the usual range or the
            // target in green, the dot in the value's state, no ink fill.
            RangeDial(value: c.value, scale: c.scale, band: c.band, bandColor: Palette.green.opacity(0.85),
                      dotColor: c.color == Palette.muted ? Palette.ink.opacity(0.45) : c.color, size: min(dial, 96), lineWidth: 6) {
                VStack(spacing: 0) {
                    Text(verbatim: c.number).font(Typo.number(22)).foregroundStyle(Palette.ink)
                        .lineLimit(1)
                    if let unit = c.unit, c.number != "–" {
                        Text(verbatim: unit).font(Typo.tiny).foregroundStyle(Palette.muted)
                    }
                }
            }
            .accessibilityHidden(true)
            Text(L10n.tr(title)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
            Text(verbatim: c.note ?? " ").font(Typo.tiny.weight(.medium)).foregroundStyle(c.color)
                .multilineTextAlignment(.center)
                .lineLimit(2).minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 6).padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: [L10n.tr(title), c.spokenValue ?? [c.number, c.unit].compactMap { $0 }.joined(separator: " "), c.spokenNote ?? c.note].compactMap { $0 }.joined(separator: ", ")))
    }
}
