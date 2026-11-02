import SwiftUI

// MARK: - Records

/// Rekordy a zaměření, one sport at a time. Posilovna: every exercise with its
/// best weight, a search, up to five pinned on top, and a tap opens the
/// exercise's history (ExerciseHistorySheet). Kolo, Běh and Plavání: the records of a
/// period with the change against the best before it, and where the cardio
/// went in the last weeks.
struct InsightsView: View {
    @Environment(AppModel.self) private var model
    @State private var insights: FitnessInsights?
    @State private var sides: [GymSideBalance.Item] = []
    @State private var history = GymHistory.empty
    @State private var pinned: [String] = []
    @State private var sport: Sport = .gym
    @State private var period = ""
    @State private var query = ""
    @State private var showAll = false
    @State private var opened: FitnessInsights.Strength?
    @State private var pinNote: String?
    @State private var error: String?

    private static let maxPinned = 5
    private static let shown = 20
    private let today = APIClient.localToday()
    private var year: String { String(today.prefix(4)) }

    enum Sport: String, CaseIterable {
        // The app's order of sports: Ride, Run, Swim, Gym.
        case ride, run, swim, gym

        var title: String {
            switch self {
            case .gym: return "Posilovna"
            case .ride: return "Kolo"
            case .run: return "Běh"
            case .swim: return "Plavání"
            }
        }
    }

    private static let rideMetrics: [(String, String)] = [
        ("longestRide", "Nejdelší jízda"), ("longestRideTime", "Nejdelší jízda časem"), ("mostElevation", "Nejvíc nastoupáno"),
        ("bestRidePower", "Nejlepší výkon (20+ min)"), ("ftp", "FTP")
    ]
    private static let runMetrics: [(String, String)] = [("longestRun", "Nejdelší běh"), ("runPace", "Nejrychlejší tempo na 5+ km")]
    /// Pool swims only for the pace: open water is measured by GPS.
    private static let swimMetrics: [(String, String)] = [("swimPace", "Nejrychlejší tempo na 400+ m v bazénu"), ("longestSwim", "Nejdelší plavání")]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Rekordy a zaměření") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · rekordy").padding(.top, 24)
                Text("Rekordy a zaměření").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let insights {
                    content(insights)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task {
            guard insights == nil else { return }
            guard !model.demo else { error = "V ukázce se rekordy nenačítají."; return }
            do { insights = try await model.api.fitnessInsights() } catch { self.error = error.localizedDescription }
            let api = model.api
            async let sideList = try? await api.gymSides()
            async let pins = try? await api.pinnedExercises()
            async let lifts = try? await api.gymHistory(days: 730)
            sides = await sideList?.sides ?? []
            pinned = await pins ?? []
            history = await lifts ?? GymHistory.empty
        }
        .sheet(item: $opened) { lift in
            ExerciseHistorySheet(name: Fmt.capitalized(lift.exercise), exercise: history.exercise(lift.exercise), today: today,
                                 pinned: Binding(get: { pinned.contains(lift.exercise) }, set: { _ in togglePin(lift.exercise) }))
        }
    }

    // MARK: Sports

    private func lifts(_ insights: FitnessInsights) -> [FitnessInsights.Strength] {
        (insights.records?.strength ?? [])
            .filter { $0.heaviest != nil || $0.e1rm != nil || $0.setReps != nil }
            .sorted { ($0.last ?? "") > ($1.last ?? "") }
    }

    private func metrics(_ insights: FitnessInsights, _ sport: Sport) -> [(String, String)] {
        let list = sport == .ride ? Self.rideMetrics : sport == .swim ? Self.swimMetrics : Self.runMetrics
        let cardio = insights.records?.trends?.cardio ?? [:]
        return list.filter { key, _ in (cardio[key] ?? nil)?.change?.values.contains { $0?.value != nil } == true }
    }

    /// The sports with records. Plavání stays once there is any record, even
    /// before the first pool swim, so a swimmer sees where it will be (Petr 2026-10-30).
    private func sports(_ insights: FitnessInsights) -> [Sport] {
        let found = Sport.allCases.filter { $0 == .gym ? !lifts(insights).isEmpty : $0 == .swim ? hasSwim(insights) : !metrics(insights, $0).isEmpty }
        return found.isEmpty || found.contains(.swim) ? found : Sport.allCases.filter { $0 == .swim || found.contains($0) }
    }

    private func hasSwim(_ insights: FitnessInsights) -> Bool {
        !metrics(insights, .swim).isEmpty || !(insights.estimates?.swim?.best ?? []).isEmpty
    }

    @ViewBuilder
    private func content(_ insights: FitnessInsights) -> some View {
        let available = sports(insights)
        let current = available.contains(sport) ? sport : (available.first ?? .gym)
        if available.count > 1 {
            Picker("Sport", selection: Binding(get: { current }, set: { sport = $0 })) {
                ForEach(available, id: \.self) { Text(L10n.tr($0.title)).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 20)
        }
        if available.isEmpty {
            focusCard(insights)
            Text("Rekordy tu uvidíš po prvních trénincích.").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 20)
        } else if current == .gym {
            gym(insights)
        } else if current == .swim && !hasSwim(insights) {
            swimEmpty
        } else {
            focusCard(insights)
            if current == .run { runEstimates(insights) } else if current == .ride { rideEstimates(insights) } else { swimBests(insights) }
            cardio(insights, current)
        }
    }

    // MARK: Posilovna

    @ViewBuilder
    private func gym(_ insights: FitnessInsights) -> some View {
        let all = lifts(insights)
        if !sides.isEmpty { sidesLink.padding(.top, 20) }
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
            TextField(L10n.tr("Hledat cvik"), text: $query)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                    .buttonStyle(.plain).accessibilityLabel(L10n.tr("Smazat"))
            }
        }
        .font(.body)
        .padding(.horizontal, 12).frame(height: 42)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.top, sides.isEmpty ? 20 : 12)

        let search = Self.folded(query.trimmingCharacters(in: .whitespaces))
        if !search.isEmpty {
            let found = all.filter { Self.folded($0.exercise).contains(search) }
            if found.isEmpty {
                Text("Žádný cvik tomu neodpovídá.").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 20)
            } else {
                SectionLabel(text: L10n.plural("%lld cviků", found.count)).padding(.top, 24)
                liftCard(found)
            }
        } else {
            let top = pinned.compactMap { name in all.first { $0.exercise == name } }
            if !top.isEmpty {
                SectionLabel(text: L10n.f("Připnuté · %@ z %@", String(top.count), String(Self.maxPinned))).padding(.top, 24)
                liftCard(top)
            }
            if let pinNote {
                Text(pinNote).font(Typo.caption).foregroundStyle(Palette.amber).padding(.top, 8)
            }
            let rest = all.filter { !pinned.contains($0.exercise) }
            if !rest.isEmpty {
                SectionLabel(text: (top.isEmpty ? L10n.tr("Cviky") : L10n.tr("Všechny cviky")) + " · \(rest.count)").padding(.top, 24)
                liftCard(showAll ? rest : Array(rest.prefix(Self.shown)))
                if rest.count > Self.shown && !showAll {
                    SecondaryButton(title: L10n.f("Zobrazit všechny (%@)", String(rest.count)), systemImage: "chevron.down") { showAll = true }
                        .padding(.top, 12)
                }
            }
        }
    }

    private func liftCard(_ list: [FitnessInsights.Strength]) -> some View {
        Card {
            ForEach(Array(list.enumerated()), id: \.element.id) { index, lift in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                liftRow(lift)
            }
        }
        .padding(.top, 8)
    }

    private func liftRow(_ lift: FitnessInsights.Strength) -> some View {
        let isPinned = pinned.contains(lift.exercise)
        let weight = lift.heaviest?.value.flatMap { $0 > 0 ? $0 : nil }
        let value = weight.map { Units.weightText($0) } ?? lift.setReps?.value.map { L10n.f("%@ opak.", Fmt.int($0)) } ?? "–"
        let detail = lift.e1rm?.value.map { L10n.f("odhad 1RM %@", Units.weightText($0, digits: 0)) } ?? (weight == nil ? L10n.tr("vlastní váha") : nil)
        return HStack(spacing: 10) {
            Button { opened = lift } label: {
                recordRow(Fmt.capitalized(lift.exercise), value: value, detail: detail, fresh: !(lift.recent ?? []).isEmpty)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { togglePin(lift.exercise) } label: {
                Image(systemName: isPinned ? "star.fill" : "star")
                    .scaledFont(17, cap: .denseCap).foregroundStyle(isPinned ? Palette.amber : Palette.faint)
                    .frame(width: 32, height: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr(isPinned ? "Odepnout" : "Připnout nahoru"))
        }
    }

    /// A star pins the exercise to the top or takes it off; at most five.
    private func togglePin(_ name: String) {
        let before = pinned
        if let i = pinned.firstIndex(of: name) {
            pinned.remove(at: i)
        } else if pinned.count >= Self.maxPinned {
            pinNote = L10n.f("Připnout jde nejvíc %@ cviků. Nejdřív některý odepni.", String(Self.maxPinned))
            return
        } else {
            pinned.append(name)
        }
        pinNote = nil
        let list = pinned
        Task {
            do { try await model.api.savePinnedExercises(list) } catch {
                pinned = before
                pinNote = error.localizedDescription
            }
        }
    }

    private static func folded(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Fmt.locale)
    }

    /// One-sided exercises: Levá a pravá strana (GymSides.swift).
    private var sidesLink: some View {
        NavigationLink { GymSidesView(items: sides) } label: {
            HStack(spacing: 12) {
                Image(systemName: "figure.strengthtraining.functional").scaledFont(16, weight: .semibold, cap: .denseCap)
                    .foregroundStyle(Palette.onAccent).frame(width: 34, height: 34)
                    .background(Palette.blue, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("Levá a pravá strana").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 4)
                if let weak = sides.first(where: { $0.weaker != nil }) {
                    Text(verbatim: weak.exercise).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .cardSurface(cornerRadius: 20)
        }
        .buttonStyle(.plain)
    }

    // MARK: Kolo a běh

    @ViewBuilder
    private func focusCard(_ insights: FitnessInsights) -> some View {
        if let focus = insights.cardioFocus, let p = focus.percent, (focus.activities ?? 0) > 0 {
            SectionLabel(text: L10n.f("Intenzita za %@ dní", String(focus.days ?? 28))).padding(.top, 24)
            Card {
                GeometryReader { geo in
                    let total = max(1, (p.low ?? 0) + (p.high ?? 0) + (p.anaerobic ?? 0))
                    HStack(spacing: 2) {
                        Rectangle().fill(Palette.green).frame(width: geo.size.width * (p.low ?? 0) / total)
                        Rectangle().fill(Palette.amberBar).frame(width: geo.size.width * (p.high ?? 0) / total)
                        Rectangle().fill(Palette.rust).frame(width: geo.size.width * (p.anaerobic ?? 0) / total)
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 10)
                HStack {
                    legend("Nízká", p.low, Palette.green)
                    Spacer()
                    legend("Vysoká", p.high, Palette.amberBar)
                    Spacer()
                    legend("Anaerobní", p.anaerobic, Palette.rust)
                }
                if let minutes = focus.minutes, let count = focus.activities {
                    Text(L10n.plural("%lld aktivit", count) + " · " + Fmt.duration(minutes))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(.top, 8)
        }
    }

    /// Běh: the race times the threshold pace gives (5 km to the marathon).
    @ViewBuilder
    private func runEstimates(_ insights: FitnessInsights) -> some View {
        if let run = insights.estimates?.run, !run.races.isEmpty {
            SectionLabel(text: "Odhad času na závod").padding(.top, 24)
            Card {
                ForEach(Array(run.races.enumerated()), id: \.offset) { index, race in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow(Self.raceName(race.km), value: raceTime(race.seconds), detail: Units.paceText(race.pace))
                }
            }
            .padding(.top, 8)
            Text(verbatim: L10n.f("Z tvého prahového tempa %@. Maraton platí jen s dlouhými běhy kolem dvou hodin.", Units.paceText(run.thresholdPace)))
                .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Plavání: the fastest 100, 200 and 400 m of the last 12 months.
    @ViewBuilder
    private func swimBests(_ insights: FitnessInsights) -> some View {
        if let best = insights.estimates?.swim?.best, !best.isEmpty {
            SectionLabel(text: "Nejlepší časy za 12 měsíců").padding(.top, 24)
            Card {
                ForEach(Array(best.enumerated()), id: \.offset) { index, b in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow("\(b.meters) m", value: raceTime(b.seconds), detail: Units.swimPaceText(b.per100))
                }
            }
            .padding(.top, 8)
        }
    }

    /// Plavání before the first pool swim: the rows it will fill, empty.
    private var swimEmpty: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Nejlepší časy").padding(.top, 24)
            Card {
                ForEach(Array(["100 m", "200 m", "400 m", "Nejdelší plavání"].enumerated()), id: \.offset) { index, title in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    HStack {
                        Text(L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Text(verbatim: "–").font(Typo.number(20)).foregroundStyle(Palette.faint)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(.top, 8)
            Text("Zatím žádné plavání v bazénu. První plavání z Apple Watch nebo Garminu sem doplní časy.")
                .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Kolo: what FTP gives for 5, 20 and 60 minutes, and two races.
    @ViewBuilder
    private func rideEstimates(_ insights: FitnessInsights) -> some View {
        if let ride = insights.estimates?.ride, !ride.efforts.isEmpty {
            SectionLabel(text: "Odhad výkonu").padding(.top, 24)
            Card {
                ForEach(Array(ride.efforts.enumerated()), id: \.offset) { index, effort in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow("\(effort.minutes) min", value: "\(effort.watts) W",
                              detail: [effort.wkg.map { Fmt.decimal($0, digits: 1) + " W/kg" }, effort.minutes == 60 ? "FTP" : nil].compactMap { $0 }.joined(separator: " · "))
                }
            }
            .padding(.top, 8)
            Text(verbatim: L10n.f("Z tvého FTP %@ W.", Fmt.int(ride.ftp))).font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8)
            let races = (ride.races ?? []).compactMap { $0 }.filter { $0.minutes != nil && $0.low != nil && $0.high != nil }
            if !races.isEmpty {
                SectionLabel(text: "Na závod").padding(.top, 24)
                Card {
                    ForEach(Array(races.enumerated()), id: \.offset) { index, race in
                        if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                        recordRow(L10n.tr(race.kind == "tt" ? "Časovka" : "Gran fondo") + " " + raceDistance(race.km), value: "~" + planDuration(race.minutes ?? 0),
                                  detail: "\(race.low ?? 0)–\(race.high ?? 0) W")
                    }
                }
                .padding(.top, 8)
                Text("Čas na rovině bez větru, s tvou váhou a silničním kolem. Kopce a terén ho prodlouží.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private static func raceName(_ km: Double) -> String {
        km == 21.1 ? L10n.tr("Půlmaraton") : km == 42.2 ? L10n.tr("Maraton") : raceDistance(km)
    }

    /// 1, 3 and 6 months, this year and all; this year until another is picked.
    private var periods: [(String, String)] {
        [("1m", L10n.tr("1 měs.")), ("3m", L10n.tr("3 měs.")), ("6m", L10n.tr("6 měs.")), ("y" + year, year), ("all", L10n.tr("Vše"))]
    }

    @ViewBuilder
    private func cardio(_ insights: FitnessInsights, _ sport: Sport) -> some View {
        let key: String = period.isEmpty ? "y" + year : period
        let cardio = insights.records?.trends?.cardio ?? [:]
        SectionLabel(text: "Rekordy").padding(.top, 24)
        Picker("Období", selection: Binding(get: { key }, set: { period = $0 })) {
            ForEach(periods, id: \.0) { Text(verbatim: $0.1).tag($0.0) }
        }
        .pickerStyle(.segmented)
        .padding(.top, 8)
        let rows: [(String, String, FitnessInsights.Change)] = metrics(insights, sport).compactMap { metric, title in
            guard let m = cardio[metric] ?? nil, let change = m.change?[key] ?? nil, change.value != nil else { return nil }
            return (title, m.unit ?? "", change)
        }
        if rows.isEmpty {
            Text("Za tohle období tu nic není.").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 16)
        } else {
            Card {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow(row.0, value: Self.format(row.2.value, row.1), detail: row.2.date.map { day($0) },
                              change: key == "all" || row.2.basis != "before" ? nil : Self.delta(row.2.delta, row.1))
                }
            }
            .padding(.top, 10)
            if key != "all" {
                Text("Změna proti nejlepšímu výkonu před tímto obdobím.").font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 8)
            }
        }
    }

    /// The day, with its year when it is not this year's.
    private func day(_ iso: String) -> String {
        let heading = Fmt.dayHeading(iso)
        return iso.hasPrefix(year) ? heading : heading + (L10n.isEnglish ? ", " : " ") + String(iso.prefix(4))
    }

    private static func format(_ value: Double?, _ unit: String) -> String {
        guard let value else { return "–" }
        switch unit {
        case "s/km": return Units.paceText(value)
        case "s/100m": return Units.swimPaceText(value)
        case "km": return Units.distanceText(value)
        case "min": return Fmt.duration(Int(value))
        default: return Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1) + (unit.isEmpty ? "" : " " + unit)
        }
    }

    /// "+22,4 km" in green when better, "o 0:07 /km pomaleji" for a pace.
    private static func delta(_ delta: Double?, _ unit: String) -> (String, Bool)? {
        guard let delta, delta != 0 else { return nil }
        if unit == "s/km" || unit == "s/100m" {
            let text = unit == "s/100m" ? Units.swimPaceText(abs(delta)) : Units.paceText(abs(delta))
            return delta < 0 ? (L10n.f("o %@ rychleji", text), true) : (L10n.f("o %@ pomaleji", text), false)
        }
        return ((delta > 0 ? "+" : "−") + format(abs(delta), unit), delta > 0)
    }

    private func legend(_ title: String, _ value: Double?, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(verbatim: L10n.tr(title) + " " + Fmt.int(value) + Fmt.percentSign).font(Typo.caption).foregroundStyle(Palette.secondary)
        }
    }

    private func recordRow(_ title: String, value: String, detail: String?, fresh: Bool = false, change: (String, Bool)? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(L10n.tr(title)).font(Typo.body).foregroundStyle(Palette.ink)
                    if fresh { Pill(text: "nový", foreground: Palette.green, background: Palette.greenSoft) }
                }
                if let detail { Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(verbatim: value).font(Typo.number(20)).foregroundStyle(Palette.ink)
                if let change {
                    Text(verbatim: change.0).font(Typo.caption).foregroundStyle(change.1 ? Palette.green : Palette.muted)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
