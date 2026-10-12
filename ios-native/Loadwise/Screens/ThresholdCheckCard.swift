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
    }

    struct Current: Decodable, Equatable {
        let ftp: Double?
        let lthr: Double?
        let runThresholdPace: Double?
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
}

extension APIClient {
    func thresholdCheck() async throws -> ThresholdCheck {
        try await get("/app/api/threshold-check")
    }

    func thresholdAction(_ body: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/threshold-check", method: "POST", body: body)
    }
}

/// On Today: the threshold estimate and the test to confirm it. The athlete
/// picks the day (the recommended one is chosen), or declines; after the test
/// the new value is saved only when confirmed.
struct ThresholdCheckCard: View {
    @Environment(AppModel.self) private var model
    @State private var check: ThresholdCheck?
    @State private var day: [String: String] = [:]
    @State private var typed: [String: String] = [:]
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 12) {
            if let check {
                ForEach(check.results, id: \.sport) { result($0, current: check.current) }
                ForEach(check.manual, id: \.sport) { manual($0) }
                ForEach(check.scheduled, id: \.sport) { planned($0) }
                ForEach(check.offers) { offer($0) }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task {
            guard !model.demo else { return }
            await load()
        }
    }

    private func load() async {
        check = try? await model.api.thresholdCheck()
    }

    private func sportTitle(_ sport: String) -> String { L10n.tr(sport == "run" ? "Běh" : "Kolo") }

    private func valueText(_ metric: String, _ value: Double) -> String {
        switch metric {
        case "runThresholdPace", "pace": return ZonesSettingsView.pace(Units.pace(value)) + " " + Units.paceUnit
        case "lthr", "runLthr": return "\(Int(value.rounded())) bpm"
        default: return "\(Int(value.rounded())) W"
        }
    }

    private func metricName(_ metric: String) -> String {
        L10n.tr(metric == "runThresholdPace" ? "Prahové tempo" : metric == "lthr" ? "Prahový tep" : "FTP")
    }

    // MARK: - offer

    @ViewBuilder private func offer(_ o: ThresholdCheck.Offer) -> some View {
        let chosen = day[o.sport] ?? o.recommended
        Card {
            WidgetHeader(title: sportTitle(o.sport) + " · " + metricName(o.metric), color: Palette.amberBar)
            Text(headline(o)).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            Text(L10n.f("Ověř to testem: %@ (%@).", o.testName, Fmt.duration(o.testMinutes ?? 60)))
                .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(o.options.filter(\.fits), id: \.date) { (option: ThresholdCheck.Option) in
                        let on = chosen == option.date
                        Button { day[o.sport] = option.date } label: {
                            VStack(spacing: 2) {
                                Text(Fmt.weekdayShort(option.date)).font(.footnote.weight(.semibold))
                                Text(Fmt.dayMonth(option.date)).font(.caption)
                                Image(systemName: "star.fill").font(.system(size: 8))
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
        Card {
            WidgetHeader(title: sportTitle(p.sport) + " · " + L10n.tr("Test"), color: Palette.amberBar)
            Text(L10n.f("%@ · %@", p.name ?? L10n.tr("Test"), Fmt.dayHeading(p.testDate)))
                .font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            SecondaryButton(title: "Zrušit test") {
                Task { await act(["action": .string("cancel"), "sport": .string(p.sport)], estimate: nil) }
            }
        }
    }

    // MARK: - result

    @ViewBuilder private func result(_ r: ThresholdCheck.Measured, current: ThresholdCheck.Current?) -> some View {
        let lines = resultLines(r, current: current)
        if !lines.isEmpty {
            Card {
                WidgetHeader(title: sportTitle(r.sport) + " · " + L10n.tr("Výsledek testu"), color: Palette.green)
                ForEach(lines, id: \.self) { line in
                    Text(line).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 10) {
                    PrimaryButton(title: L10n.tr("Uložit"), systemImage: "checkmark", busy: busy) {
                        Task { await act(["action": .string("apply"), "sport": .string(r.sport), "values": .object(values(r.result))], estimate: nil) }
                    }
                    .disabled(busy)
                    SecondaryButton(title: "Neukládat") {
                        Task { await act(["action": .string("dismiss"), "sport": .string(r.sport)], estimate: nil) }
                    }
                }
            }
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
        if let hr = v.runLthr { out.append(L10n.f("%@: %@", metricName("lthr"), valueText("lthr", hr))) }
        return out
    }

    private func values(_ v: ThresholdCheck.Values?) -> JSONObject {
        var out: JSONObject = [:]
        if let x = v?.ftp { out["ftp"] = .number(x) }
        if let x = v?.lthr { out["lthr"] = .number(x) }
        if let x = v?.runThresholdPace { out["runThresholdPace"] = .number(x) }
        if let x = v?.runLthr { out["runLthr"] = .number(x) }
        return out
    }

    // MARK: - manual result

    private func manual(_ m: ThresholdCheck.Manual) -> some View {
        Card {
            WidgetHeader(title: sportTitle(m.sport) + " · " + L10n.tr("Výsledek testu"), color: Palette.amberBar)
            Text(L10n.f("Jak dopadl test %@?", Fmt.dayHeading(m.testDate))).font(Typo.sentence(20)).foregroundStyle(Palette.ink)
            ForEach(fields(m.testId), id: \.key) { (field: Field) in
                TextField(L10n.tr(field.label), text: Binding(get: { typed[m.sport + field.key] ?? "" }, set: { typed[m.sport + field.key] = $0 }))
                    .keyboardType(.decimalPad)
                    .padding(12)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            HStack(spacing: 10) {
                PrimaryButton(title: L10n.tr("Spočítat"), busy: busy) {
                    var body: JSONObject = [:]
                    for field: Field in fields(m.testId) {
                        let text = (typed[m.sport + field.key] ?? "").replacingOccurrences(of: ",", with: ".")
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
    }

    private func fields(_ testId: String) -> [Field] {
        switch testId {
        case "test-ride-ftp20": return [Field(key: "power20", label: "Průměrný výkon 20 min (W)")]
        case "test-ride-lthr30": return [Field(key: "hr", label: "Průměrný tep posledních 20 min")]
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
