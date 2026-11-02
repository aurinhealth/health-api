import SwiftUI

/// GET /app/api/threshold-check (src/threshold-check.js): what the data say
/// about FTP or the threshold run pace, the test offered to confirm it, the
/// planned test and its result waiting for confirmation.
struct ThresholdCheck: Decodable, Equatable {
    struct Estimate: Decodable, Equatable {
        let value: Double
        let confidence: String?
        let basis: String?
    }

    struct Option: Decodable, Equatable, Hashable {
        let date: String
        let fits: Bool
        let planned: Bool
    }

    struct Offer: Decodable, Equatable, Identifiable {
        var id: String { sport }
        let sport: String
        /// "ftp", "lthr" or "runThresholdPace".
        let metric: String
        /// "missing", "higher" or "lower".
        let reason: String
        let current: Double?
        let estimate: Estimate?
        let testId: String
        let testName: String
        let testMinutes: Int?
        let testDescription: String?
        let recommended: String?
        let options: [Option]
    }

    struct Planned: Decodable, Equatable {
        let sport: String
        let testId: String
        let testDate: String
        let name: String?
    }

    struct Values: Decodable, Equatable {
        let ftp: Double?
        let lthr: Double?
        let runThresholdPace: Double?
        let runLthr: Double?
        /// A swim plan's CSS test: seconds per 100 m.
        var swimCss: Double? = nil
        /// Read from the ride's best 20 minutes, not from a lap (src/threshold-check.js curveTestResult).
        var fromCurve: Bool? = nil
    }

    struct Current: Decodable, Equatable {
        let ftp: Double?
        let lthr: Double?
        let runThresholdPace: Double?
        var swimCss: Double? = nil
    }

    struct Measured: Decodable, Equatable {
        let sport: String
        let testId: String
        let testDate: String
        let result: Values?
    }

    struct Manual: Decodable, Equatable {
        let sport: String
        let testId: String
        let testDate: String
    }

    let offers: [Offer]
    let scheduled: [Planned]
    let results: [Measured]
    let manual: [Manual]
    let current: Current?
    /// The services a confirmed result goes to besides Aurin (connected; the switches are the phone's).
    struct Connected: Decodable, Equatable {
        let intervals: Bool?
        let wahoo: Bool?
    }
    let connected: Connected?
}

extension APIClient {
    func thresholdCheck() async throws -> ThresholdCheck {
        try await get("/app/api/threshold-check")
    }

    func thresholdAction(_ body: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/threshold-check", method: "POST", body: body)
    }
}

/// The last answer, so returning to today or switching tabs does not ask again
/// for a while; an action on the card asks at once.
@MainActor
enum ThresholdCheckMemory {
    static var kept: (check: ThresholdCheck?, at: Date)?
}

/// One thing of the check in the coach's card on Today (CoachThingsCard): a
/// test result to save, a result to type in, the planned test or the offer of
/// one. The athlete picks the test's day (the recommended one is chosen), or
/// declines; after the test the new value is saved only with Uložit.
struct ThresholdCheckCard: View {
    @Environment(AppModel.self) private var model
    let entry: ThresholdEntry
    let things: CoachThings
    @State private var day: [String: String] = [:]
    @State private var typed: [String: String] = [:]
    @State private var busy = false
    @State private var error: String?
    /// The switches of Nastavení → Zóny: where a saved result also goes.
    @AppStorage("writeIntervals") private var writeIntervals = true
    @AppStorage("writeWahoo") private var writeWahoo = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let check = things.threshold {
                switch entry {
                case .result(let sport):
                    if let r = check.results.first(where: { $0.sport == sport }) { result(r, current: check.current, connected: check.connected) }
                case .manual(let sport):
                    if let m = check.manual.first(where: { $0.sport == sport }) { manual(m) }
                case .planned(let sport):
                    if let p = check.scheduled.first(where: { $0.sport == sport }) { planned(p) }
                case .offer(let sport):
                    if let o = check.offers.first(where: { $0.sport == sport }) { offer(o) }
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func load() async {
        let fresh = try? await model.api.thresholdCheck()
        things.threshold = fresh
        if fresh != nil { ThresholdCheckMemory.kept = (fresh, Date()) }
    }

    private func sportTitle(_ sport: String) -> String { L10n.tr(sport == "run" ? "Běh" : sport == "swim" ? "Plavání" : "Kolo") }

    private func valueText(_ metric: String, _ value: Double) -> String {
        switch metric {
        case "runThresholdPace", "pace": return ZonesSettingsView.pace(Units.pace(value)) + " " + Units.paceUnit
        case "lthr", "runLthr": return "\(Int(value.rounded())) bpm"
        case "swimCss": return raceTime(Int(value.rounded())) + " /100 m"
        default: return "\(Int(value.rounded())) W"
        }
    }

    private func metricName(_ metric: String) -> String {
        metric == "swimCss" ? "CSS" : L10n.tr(metric == "runThresholdPace" ? "Prahové tempo" : metric == "lthr" ? "Prahový tep" : "FTP")
    }

    // MARK: - offer

    @ViewBuilder private func offer(_ o: ThresholdCheck.Offer) -> some View {
        let chosen = day[o.sport] ?? o.recommended
        VStack(alignment: .leading, spacing: 12) {
            WidgetHeader(title: sportTitle(o.sport) + " · " + metricName(o.metric), color: Palette.amberBar)
            Text(headline(o)).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            Text(L10n.f("Ověř to testem: %@ (%@).", o.testName, Fmt.duration(o.testMinutes ?? 60)))
                .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(o.options.filter(\.fits), id: \.date) { (option: ThresholdCheck.Option) in
                        let on = chosen == option.date
                        Button { day[o.sport] = option.date } label: {
                            VStack(spacing: 2) {
                                Text(Fmt.weekdayShort(option.date)).font(.footnote.weight(.semibold))
                                Text(Fmt.dayMonth(option.date)).font(.caption)
                                Image(systemName: "star.fill").scaledFont(8)
                                    .opacity(option.date == o.recommended ? 1 : 0)
                            }
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                            .frame(width: 58, height: 58)
                            .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Fmt.dayHeading(option.date) + (option.date == o.recommended ? ", " + L10n.tr("doporučený den") : ""))
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            .scrollIndicators(.hidden)
            HStack(spacing: 10) {
                PrimaryButton(title: L10n.tr("Naplánovat test"), systemImage: "calendar.badge.plus", busy: busy) {
                    guard let chosen else { return }
                    Task { await act(["action": .string("schedule"), "sport": .string(o.sport), "testId": .string(o.testId), "date": .string(chosen)], estimate: o.estimate) }
                }
                .disabled(busy || chosen == nil)
                SecondaryButton(title: "Teď ne") {
                    Task { await act(["action": .string("dismiss"), "sport": .string(o.sport)], estimate: o.estimate) }
                }
            }
        }
    }

    private func headline(_ o: ThresholdCheck.Offer) -> String {
        guard o.reason != "missing", let current = o.current, let estimate = o.estimate?.value else {
            return L10n.f("%@ zatím chybí.", metricName(o.metric))
        }
        let format = o.reason == "higher" ? "Podle tréninků se ti %@ zlepšilo na %@ (nastaveno %@)." : "Podle tréninků je %@ nižší, %@ (nastaveno %@)."
        return L10n.f(format, metricName(o.metric), valueText(o.metric, estimate), valueText(o.metric, current))
    }

    // MARK: - planned test

    private func planned(_ p: ThresholdCheck.Planned) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            WidgetHeader(title: sportTitle(p.sport) + " · " + L10n.tr("Test"), color: Palette.amberBar)
            Text(L10n.f("%@ · %@", p.name ?? L10n.tr("Test"), Fmt.dayHeading(p.testDate)))
                .font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            SecondaryButton(title: "Zrušit test") {
                Task { await act(["action": .string("cancel"), "sport": .string(p.sport)], estimate: nil) }
            }
        }
    }

    // MARK: - result

    @ViewBuilder private func result(_ r: ThresholdCheck.Measured, current: ThresholdCheck.Current?, connected: ThresholdCheck.Connected?) -> some View {
        let lines = resultLines(r, current: current)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                WidgetHeader(title: sportTitle(r.sport) + " · " + L10n.tr("Výsledek testu"), color: Palette.green)
                ForEach(lines, id: \.self) { line in
                    Text(line).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                Text(sentTo(r, connected: connected))
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    PrimaryButton(title: L10n.tr("Uložit"), systemImage: "checkmark", busy: busy) {
                        Task { await act(["action": .string("apply"), "sport": .string(r.sport), "values": .object(values(r.result)), "writeIntervals": .bool(writeIntervals), "writeWahoo": .bool(writeWahoo)], estimate: nil) }
                    }
                    .disabled(busy)
                    SecondaryButton(title: "Neukládat") {
                        Task { await act(["action": .string("dismiss"), "sport": .string(r.sport)], estimate: nil) }
                    }
                }
            }
        }
    }

    /// What Save does besides storing the value: the zones follow it, and go to
    /// Intervals.icu and (a new FTP) Wahoo when connected and switched on.
    private func sentTo(_ r: ThresholdCheck.Measured, connected: ThresholdCheck.Connected?) -> String {
        var to: [String] = []
        if connected?.intervals == true && writeIntervals { to.append("Intervals.icu") }
        if connected?.wahoo == true && writeWahoo && r.result?.ftp != nil { to.append("Wahoo") }
        switch to.count {
        case 0: return L10n.tr("Po uložení se přepočítají tvoje zóny.")
        case 1: return L10n.f("Po uložení se přepočítají tvoje zóny a pošlou do %@.", to[0])
        default: return L10n.f("Po uložení se přepočítají tvoje zóny a pošlou do %@ a %@.", to[0], to[1])
        }
    }

    private func resultLines(_ r: ThresholdCheck.Measured, current: ThresholdCheck.Current?) -> [String] {
        guard let v = r.result else { return [] }
        var out: [String] = []
        func line(_ metric: String, _ value: Double?, _ now: Double?) {
            guard let value else { return }
            let shown = valueText(metric, value)
            out.append(now.map { L10n.f("%@: %@ (teď %@)", metricName(metric), shown, valueText(metric, $0)) } ?? L10n.f("%@: %@", metricName(metric), shown))
        }
        line("ftp", v.ftp, current?.ftp)
        line("lthr", v.lthr, current?.lthr)
        line("runThresholdPace", v.runThresholdPace, current?.runThresholdPace)
        line("swimCss", v.swimCss, current?.swimCss)
        if let hr = v.runLthr { out.append(L10n.f("%@: %@", metricName("lthr"), valueText("lthr", hr))) }
        if v.fromCurve == true { out.append(L10n.tr("Podle nejlepších 20 minut jízdy.")) }
        return out
    }

    private func values(_ v: ThresholdCheck.Values?) -> JSONObject {
        var out: JSONObject = [:]
        if let x = v?.ftp { out["ftp"] = .number(x) }
        if let x = v?.lthr { out["lthr"] = .number(x) }
        if let x = v?.runThresholdPace { out["runThresholdPace"] = .number(x) }
        if let x = v?.runLthr { out["runLthr"] = .number(x) }
        if let x = v?.swimCss { out["swimCss"] = .number(x) }
        return out
    }

    // MARK: - manual result

    private func manual(_ m: ThresholdCheck.Manual) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            WidgetHeader(title: sportTitle(m.sport) + " · " + L10n.tr("Výsledek testu"), color: Palette.amberBar)
            Text(L10n.f("Jak dopadl test %@?", Fmt.dayHeading(m.testDate))).font(Typo.sentence(20)).foregroundStyle(Palette.ink)
            ForEach(fields(m.testId), id: \.key) { (field: Field) in
                TextField(L10n.tr(field.label), text: Binding(get: { typed[m.sport + field.key] ?? "" }, set: { typed[m.sport + field.key] = $0 }))
                    .keyboardType(field.time ? .numbersAndPunctuation : .decimalPad)
                    .padding(12)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            HStack(spacing: 10) {
                PrimaryButton(title: L10n.tr("Spočítat"), busy: busy) {
                    var body: JSONObject = [:]
                    for field: Field in fields(m.testId) {
                        let raw = typed[m.sport + field.key] ?? ""
                        // A swim time "6:40" in seconds.
                        if field.time { if let value = ZonesSettingsView.seconds(raw) { body[field.key] = .number(value) }; continue }
                        let text = raw.replacingOccurrences(of: ",", with: ".")
                        guard let value = Double(text) else { continue }
                        body[field.key] = .number(field.key == "distanceKm" ? value / Units.distance(1) : value)
                    }
                    Task { await act(["action": .string("result"), "sport": .string(m.sport), "values": .object(body)], estimate: nil) }
                }
                .disabled(busy)
                SecondaryButton(title: "Test jsem nedělal") {
                    Task { await act(["action": .string("cancel"), "sport": .string(m.sport)], estimate: nil) }
                }
            }
        }
    }

    private struct Field {
        let key: String
        let label: String
        /// Typed as m:ss.
        var time = false
    }

    private func fields(_ testId: String) -> [Field] {
        switch testId {
        case "test-ride-ftp20": return [Field(key: "power20", label: "Průměrný výkon 20 min (W)")]
        case "test-ride-lthr30": return [Field(key: "hr", label: "Průměrný tep posledních 20 min")]
        case "test-swim-css": return [Field(key: "t400", label: "Čas na 400 m (m:ss)", time: true), Field(key: "t200", label: "Čas na 200 m (m:ss)", time: true)]
        default:
            return [Field(key: "distanceKm", label: Units.imperial ? "Uběhnutá vzdálenost za 30 min (mi)" : "Uběhnutá vzdálenost za 30 min (km)"),
                    Field(key: "hr", label: "Průměrný tep posledních 20 min")]
        }
    }

    // MARK: -

    private func act(_ body: JSONObject, estimate: ThresholdCheck.Estimate?) async {
        var body = body
        if let estimate { body["estimate"] = .object(["value": .number(estimate.value), "basis": .string(estimate.basis ?? "")]) }
        busy = true
        defer { busy = false }
        do {
            try await model.api.thresholdAction(body)
            error = nil
            await load()
            if case .string(let action)? = body["action"], ["schedule", "apply"].contains(action) { await model.refresh() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A thing of the threshold check. The server keeps one row per sport, so a
/// sport is one thing that goes from the offer to the planned test to the result.
enum ThresholdEntry: Hashable {
    case result(String), manual(String), planned(String), offer(String)

    var sport: String {
        switch self {
        case .result(let s), .manual(let s), .planned(let s), .offer(let s): return s
        }
    }
}

extension ThresholdCheckCard {
    /// The check's things in the card's old order: results, then the test
    /// planned, then the offers.
    static func entries(_ check: ThresholdCheck?) -> [ThresholdEntry] {
        guard let check else { return [] }
        var out: [ThresholdEntry] = []
        out += check.results.map { ThresholdEntry.result($0.sport) }
        out += check.manual.map { ThresholdEntry.manual($0.sport) }
        out += check.scheduled.map { ThresholdEntry.planned($0.sport) }
        out += check.offers.map { ThresholdEntry.offer($0.sport) }
        return out
    }

    /// The row's label in the coach's card, the same from the offer to the
    /// result: "FTP", "Threshold pace".
    var label: String {
        let check = things.threshold
        let sport = entry.sport
        let testId: String?
        switch entry {
        case .offer:
            if let o = check?.offers.first(where: { $0.sport == sport }) { return metricName(o.metric) }
            testId = nil
        case .planned: testId = check?.scheduled.first(where: { $0.sport == sport })?.testId
        case .result: testId = check?.results.first(where: { $0.sport == sport })?.testId
        case .manual: testId = check?.manual.first(where: { $0.sport == sport })?.testId
        }
        switch testId ?? "" {
        case "test-ride-ftp20": return metricName("ftp")
        case "test-ride-lthr30": return metricName("lthr")
        case "test-swim-css": return metricName("swimCss")
        default: return sport == "run" ? metricName("runThresholdPace") : L10n.tr("Test")
        }
    }

    /// The row's line: "Your rides say 268 W", "FTP: 268 W (now 255 W)". Empty: nothing to show.
    var summary: String {
        guard let check = things.threshold else { return "" }
        switch entry {
        case .result(let sport):
            return check.results.first { $0.sport == sport }.flatMap { resultLines($0, current: check.current).first } ?? ""
        case .manual(let sport):
            return check.manual.first { $0.sport == sport }.map { L10n.f("Jak dopadl test %@?", Fmt.dayHeading($0.testDate)) } ?? ""
        case .planned(let sport):
            return check.scheduled.first { $0.sport == sport }.map { L10n.f("%@ · %@", $0.name ?? L10n.tr("Test"), Fmt.dayHeading($0.testDate)) } ?? ""
        case .offer(let sport):
            guard let o = check.offers.first(where: { $0.sport == sport }) else { return "" }
            guard o.reason != "missing", let estimate = o.estimate?.value else { return headline(o) }
            let format = o.sport == "ride" ? "Podle jízd %@" : o.sport == "run" ? "Podle běhů %@" : o.sport == "swim" ? "Podle plavání %@" : "Podle tréninků %@"
            return L10n.f(format, valueText(o.metric, estimate))
        }
    }
}
