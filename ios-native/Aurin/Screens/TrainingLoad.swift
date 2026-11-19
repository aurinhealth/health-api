import Charts
import SwiftUI

// MARK: - Training → Load (redesign T)
//
// Two dials, Load balance (every workout) and Muscle load (the gym's work sets
// only), each the last 7 days against the usual 4 weeks. In words only: no
// ratio number anywhere, no "optimal", never a risk of injury (Petr's decision
// B, 2026-11-16; the server's words from src/workload-ratio.js).

enum LoadKind: String, CaseIterable {
    case balance, muscle

    var title: String {
        switch self {
        case .balance: return L10n.tr("Vyváženost zátěže")
        case .muscle: return L10n.tr("Zátěž svalů")
        }
    }

    func view(_ training: TrainingSnapshot) -> TrainingSnapshot.LoadView? {
        switch self {
        case .balance: return training.loadBalance
        case .muscle: return training.muscleLoad
        }
    }

    /// Without any load on record (nil from the server).
    var missing: String {
        switch self {
        case .balance: return L10n.tr("Ukáže se po prvních trénincích.")
        case .muscle: return L10n.tr("Počítá jen posilovnu. Ukáže se po prvním tréninku v posilovně.")
        }
    }

    /// What the value is, under the learning bar and in "How it's measured".
    var about: String {
        switch self {
        case .balance: return L10n.tr("Vyváženost zátěže porovnává tvých posledních 7 dní s obvyklými 4 týdny.")
        case .muscle: return L10n.tr("Zátěž svalů porovnává tvých posledních 7 dní v posilovně s obvyklými 4 týdny.")
        }
    }

    var measured: String {
        switch self {
        case .balance:
            return L10n.tr("Aurin spočítá zátěž každého tréninku z jeho délky a intenzity a porovná posledních 7 dní s průměrem posledních 4 týdnů. Je to odhad, ne měření tvého těla.")
        case .muscle:
            return L10n.tr("Počítají se jen pracovní série v posilovně, z délky tréninku a úsilí. Kardio a vytrvalostní tréninky se nepočítají. Je to odhad, ne měření tvého těla.")
        }
    }
}

/// The dial's scale and words for a LoadView, shared by the tile and the detail.
enum LoadWords {
    static let scale: ClosedRange<Double> = 0.5...1.8

    /// The dial's centre: "As usual", "Harder"…
    static func level(_ level: String?) -> String? {
        switch level {
        case "wellBelow": return L10n.tr("Mnohem lehčí")
        case "below": return L10n.tr("Lehčí")
        case "usual": return L10n.tr("Jako obvykle")
        case "above": return L10n.tr("Těžší")
        case "wellAbove": return L10n.tr("Mnohem těžší")
        default: return nil
        }
    }

    /// In, above or below the usual range, coloured as every detail's state.
    static func state(_ level: String?) -> MetricState? {
        switch level {
        case "usual": return .within
        case "below": return .off(above: false)
        case "above": return .off(above: true)
        case "wellBelow": return .far(above: false)
        case "wellAbove": return .far(above: true)
        default: return nil
        }
    }

    /// "In your usual range": the state's words with a capital first letter.
    static func sentence(_ state: MetricState) -> String {
        let words = state.words
        return words.prefix(1).uppercased(with: Fmt.locale) + words.dropFirst()
    }

    static func band(_ view: TrainingSnapshot.LoadView) -> ClosedRange<Double> {
        min(view.band.low, view.band.high)...max(view.band.low, view.band.high)
    }

    /// Days still to learn, "Learning, 9 more days".
    static func learning(_ view: TrainingSnapshot.LoadView) -> String {
        let need = view.needsDays ?? 21, have = min(view.historyDays ?? 0, need)
        return need > have ? L10n.f("Učí se, ještě %@", L10n.plural("%lld dní", need - have)) : L10n.tr("Učí se")
    }
}

/// "LOAD" on Training: the two dials side by side, each opening its detail.
struct LoadSection: View {
    let training: TrainingSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Zátěž")
            HStack(alignment: .top, spacing: 12) {
                ForEach(LoadKind.allCases, id: \.self) { kind in
                    RouteLink(route: .load(kind.rawValue)) { LoadTile(kind: kind, view: kind.view(training)) }
                }
            }
            // Both tiles as tall as the taller one.
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct LoadTile: View {
    let kind: LoadKind
    let view: TrainingSnapshot.LoadView?

    var body: some View {
        VStack(spacing: 8) {
            // The title names the tile, centred, whole (never "Load balan…").
            Text(verbatim: kind.title)
                .font(Typo.small.weight(.medium)).foregroundStyle(Palette.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
            RangeDial(value: view?.plot, scale: LoadWords.scale, band: view.map(LoadWords.band), size: 112, lineWidth: 9, spoken: spoken) {
                Text(verbatim: centre).font(Typo.heading(19)).foregroundStyle(view?.plot == nil ? Palette.muted : Palette.ink)
            }
            .frame(maxWidth: .infinity)
            Text(verbatim: caption)
                .font(Typo.small.weight(.medium))
                .foregroundStyle(state?.color ?? Palette.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(kind.title)
        .accessibilityValue(spoken)
        .accessibilityAddTraits(.isButton)
    }

    private var state: MetricState? { LoadWords.state(view?.level) }

    private var centre: String {
        guard let view else { return "–" }
        switch view.state {
        case "ready": return LoadWords.level(view.level) ?? "–"
        case "learning": return L10n.tr("Učí se")
        default: return "–"
        }
    }

    private var caption: String {
        guard let view else { return kind == .muscle ? L10n.tr("Zatím bez posilovny") : L10n.tr("Zatím bez tréninků") }
        switch view.state {
        case "ready": return state.map(LoadWords.sentence) ?? ""
        case "learning": return LoadWords.learning(view)
        default: return L10n.tr("Žádný trénink za 4 týdny")
        }
    }

    private var spoken: String { [centre == "–" ? nil : centre, caption].compactMap { $0 }.joined(separator: ", ") }
}

// MARK: - Detail

/// Load balance or Muscle load: the dial, the server's sentence, the last 14
/// days against the usual band and how it is measured. The coach top right.
struct LoadDetailView: View {
    @State var kind: LoadKind
    let training: TrainingSnapshot

    var body: some View {
        DetailTemplate(title: kind.title, glow: Palette.Glow.training) {
            if kind == .balance {
                CoachEntry(subject: .load(title: kind.title, date: training.date), view: "training")
            } else {
                CoachEntry(view: "training")
            }
        } content: {
            LoadDetailContent(kind: $kind, training: training)
        }
    }
}

struct LoadDetailContent: View {
    @Binding var kind: LoadKind
    let training: TrainingSnapshot

    var body: some View {
        let view = kind.view(training)
        VStack(alignment: .leading, spacing: 20) {
            SiblingCells(cells: LoadKind.allCases.map { k in
                let v = k.view(training)
                return SiblingCell(id: k.rawValue, title: k.title,
                                   value: v?.state == "ready" ? (LoadWords.level(v?.level) ?? "–") : "–",
                                   spokenState: LoadWords.state(v?.level)?.words)
            }, selected: kind.rawValue) { id in kind = LoadKind(rawValue: id) ?? .balance }
            .padding(.top, 16)

            if let view, view.state == "ready" {
                VStack(spacing: 10) {
                    RangeDial(value: view.plot, scale: LoadWords.scale, band: LoadWords.band(view), ends: ("Lehčí", "Těžší"), size: 220,
                              spoken: [kind.title, LoadWords.level(view.level), LoadWords.state(view.level)?.words].compactMap { $0 }.joined(separator: ", ")) {
                        Text(verbatim: LoadWords.level(view.level) ?? "–").font(Typo.heading(30)).foregroundStyle(Palette.ink)
                    }
                    if let state = LoadWords.state(view.level) {
                        Text(verbatim: LoadWords.sentence(state)).font(Typo.bodyStrong).foregroundStyle(state.color)
                    }
                    if let text = view.text {
                        Text(verbatim: text).font(Typo.body).foregroundStyle(Palette.secondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity)
                Card {
                    Text(verbatim: L10n.tr("Posledních 14 dní")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    LoadChart(view: view)
                    Text(verbatim: L10n.tr("Šedé pásmo je tvoje obvyklá zátěž. Nad ním byly dny těžší, pod ním lehčí."))
                        .font(Typo.small).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if let view, view.state == "learning" {
                Card { LearningState(kind: LearningState.kind(have: view.historyDays, need: view.needsDays), text: kind.about) }
            } else if let view {
                Card { LearningState(kind: .missing, text: view.state == "quiet" ? L10n.tr("Za poslední 4 týdny tu není žádný trénink.") : kind.about) }
            } else {
                Card { LearningState(kind: .missing, text: kind.missing) }
            }

            HowMeasuredCard(text: kind.measured)
        }
    }
}

/// The 14 days as a line against the usual band. No values on the axis: the
/// place against the band is the meaning, the ratio itself is never shown.
struct LoadChart: View {
    let view: TrainingSnapshot.LoadView

    private struct Day: Identifiable {
        let date: Date
        let plot: Double
        var id: Date { date }
    }

    private var days: [Day] {
        view.series.compactMap { p in
            guard let plot = p.plot, let date = ISODay.date(p.date) else { return nil }
            return Day(date: date, plot: min(max(plot, LoadWords.scale.lowerBound), LoadWords.scale.upperBound))
        }
    }

    var body: some View {
        let list = days, band = LoadWords.band(view)
        Chart {
            if let first = list.first?.date, let last = list.last?.date {
                RectangleMark(xStart: .value("Od", first), xEnd: .value("Do", last),
                              yStart: .value("Obvyklé od", band.lowerBound), yEnd: .value("Obvyklé do", band.upperBound))
                    .foregroundStyle(Palette.ink.opacity(0.1))
            }
            ForEach(list) { day in
                LineMark(x: .value("Den", day.date), y: .value("Zátěž", day.plot))
                    .foregroundStyle(Palette.ink)
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Den", day.date), y: .value("Zátěž", day.plot))
                    .foregroundStyle(Palette.ink)
                    .symbolSize(18)
            }
        }
        .chartYScale(domain: LoadWords.scale)
        .chartYAxis(.hidden)
        .chartXAxis {
            // The days are UTC midnights (ISODay): named from their ISO date, never the phone's zone.
            AxisMarks(values: list.enumerated().filter { $0.offset % 3 == (list.count - 1) % 3 }.map(\.element.date)) { value in
                if let date = value.as(Date.self) {
                    AxisValueLabel { Text(verbatim: Fmt.weekdayShort(ISODay.iso(date))) }
                }
            }
        }
        .frame(height: 150)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Posledních 14 dní"))
        .accessibilityValue(view.text ?? "")
    }
}

extension CoachSubject {
    /// Training → Load balance (P1: the server adds its words, src/entrypoint.js metric "load").
    static func load(title: String, date: String?) -> CoachSubject {
        CoachSubject(kind: .metric, title: title, metric: "load", date: date, view: "training",
                     symbol: "gauge.with.dots.needle.50percent", color: Palette.amber,
                     questions: ["Co mi tohle říká?", "Mám tento týden přidat, nebo ubrat?", "Jak rozložit zbytek týdne?"])
    }
}
