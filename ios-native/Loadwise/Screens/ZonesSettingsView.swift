import SwiftUI

/// Tréninkové zóny: run and bike separately, thresholds, the zone preset (the
/// same presets as Intervals.icu) and the resulting zones.
struct ZonesSettingsView: View {
    let store: SettingsStore
    @State private var sport = "run"
    @State private var ftp = ""
    @State private var lthr = ""
    @State private var maxHr = ""
    @State private var runPace = ""
    @State private var runLthr = ""
    @State private var powerModel = "coggan7"
    @State private var hrModel = "frielLthr"
    @State private var paceModel = "friel"
    @State private var original: JSONObject = [:]
    @AppStorage("writeIntervals") private var writeIntervals = true

    var body: some View {
        SettingsPage(title: "Zóny") {
            Picker("Sport", selection: $sport) {
                Text("Běh").tag("run")
                Text("Kolo").tag("bike")
            }
            .pickerStyle(.segmented)

            if let training = store.training {
                if changes != original {
                    Label("Zóny níže se přepočítají po uložení.", systemImage: "info.circle")
                        .font(Typo.caption).foregroundStyle(Palette.amber)
                }
                if sport == "run" { run(training) } else { bike(training) }
                intervals(training)
            } else if store.demo {
                Text("V ukázce se zóny nenačítají.").font(Typo.small).foregroundStyle(Palette.muted)
            } else if store.loaded {
                Text("Zóny se nepodařilo načíst.").font(Typo.small).foregroundStyle(Palette.muted)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        // Also without a change while Intervals.icu has not taken the zones yet
        // (after connecting it again, one tap sends them).
        .toolbar { SaveButton(enabled: changes != original || (writeIntervals && store.training?.intervals?.status != "ok" && store.training?.intervalsConnected == true), saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
        .onChange(of: store.training) { fill() }
    }

    // MARK: Run

    @ViewBuilder
    private func run(_ t: TrainingProfileResponse) -> some View {
        SettingsGroup(title: "Prahové hodnoty") {
            SettingsField(title: "Prahové tempo", text: $runPace, unit: Units.paceUnit, keyboard: .numbersAndPunctuation, placeholder: t.resolved.runThresholdPace.map { Self.pace(Units.pace($0)) } ?? "m:ss")
            SettingsDivider()
            SettingsField(title: "Prahový tep", text: $runLthr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.runLthr.map { Fmt.int($0) } ?? "–")
        }
        SettingsGroup(title: "Tempové zóny", footer: "Procenta jsou z prahové rychlosti.") {
            OptionListRow(title: "Předvolba", selection: $paceModel, options: t.paceZoneModels.map { ($0.id, $0.label) }, footer: Self.presetFooter)
            ForEach(t.paceZones) { z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: z.percentHigh.map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) + " %" },
                        range: paceRange(z))
            }
        }
        if let zones = t.runHrZones, !zones.isEmpty {
            SettingsGroup(title: "Tepové zóny pro běh") {
                ForEach(Array(zones.enumerated()), id: \.element.id) { i, z in
                    if i > 0 { SettingsDivider() }
                    ZoneRow(name: z.name, percent: nil, range: bpmRange(z))
                }
            }
        }
    }

    // MARK: Bike

    @ViewBuilder
    private func bike(_ t: TrainingProfileResponse) -> some View {
        SettingsGroup(title: "Prahové hodnoty") {
            SettingsField(title: "FTP", text: $ftp, unit: "W", keyboard: .numberPad, placeholder: t.resolved.ftp.map { Fmt.int($0) } ?? "–")
            SettingsDivider()
            SettingsField(title: "Prahový tep", text: $lthr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.lthr.map { Fmt.int($0) } ?? "–")
            SettingsDivider()
            SettingsField(title: "Maximální tep", text: $maxHr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.maxHr.map { Fmt.int($0) } ?? "–")
        }
        SettingsGroup(title: "Výkonové zóny", footer: "Procenta jsou z FTP.") {
            OptionListRow(title: "Předvolba", selection: $powerModel, options: t.powerZoneModels.map { ($0.id, $0.label) }, footer: Self.presetFooter)
            ForEach(t.powerZones) { z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: z.percentHigh.map { Fmt.int($0) + " %" }, range: wattRange(z))
            }
        }
        SettingsGroup(title: "Tepové zóny pro kolo") {
            OptionListRow(title: "Předvolba", selection: $hrModel, options: t.hrZoneModels.map { ($0.id, $0.label) }, footer: Self.presetFooter)
            ForEach(t.hrZones) { z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: nil, range: bpmRange(z))
            }
        }
    }

    // MARK: Intervals.icu

    @ViewBuilder
    private func intervals(_ t: TrainingProfileResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            PillToggle(title: "Zapisovat do Intervals.icu",
                       subtitle: t.intervalsConnected == false ? "Intervals.icu není připojené" : writeIntervals ? "Prahy a zóny se po uložení pošlou do Intervals.icu" : "Zóny zůstanou jen v Loadwise",
                       systemImage: "arrow.triangle.2.circlepath", isOn: $writeIntervals, disabled: t.intervalsConnected == false)
            Text("Kalendář, hodinky i trenér pak počítají se stejnými čísly. Prázdné prahy se berou z Intervals.icu.")
                .font(Typo.caption).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let result = t.intervals {
            switch result.status {
            case "ok":
                Label(L10n.tr("Zapsáno do Intervals.icu") + ((result.updated ?? []).isEmpty ? "" : " (" + (result.updated ?? []).map { L10n.tr($0 == "Ride" ? "kolo" : "běh") }.joined(separator: ", ") + ")"), systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            case "needs-permission":
                VStack(alignment: .leading, spacing: 10) {
                    Text("Intervals.icu zápis odmítlo: připojení je starší a smí nastavení jen číst. Připoj Intervals.icu znovu a povol úpravu nastavení, pak ulož zóny ještě jednou.")
                        .font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                    Link(destination: URL(string: "https://petrfitnessdata.eu/app#settings-connections")!) {
                        Text("Připojit znovu na webu").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 16).frame(height: 40)
                            .background(Palette.button, in: Capsule())
                    }
                }
            case "error":
                Text(result.message.map { L10n.f("Do Intervals.icu se nepodařilo zapsat: %@", $0) } ?? L10n.tr("Do Intervals.icu se nepodařilo zapsat."))
                    .font(Typo.small).foregroundStyle(Palette.rust)
            default:
                EmptyView()
            }
        }
    }

    // MARK: Values

    static let presetFooter = "Předvolby jsou stejné jako v Intervals.icu. Hranice zón se přepočítají po uložení."

    static func pace(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }

    /// The typed threshold pace as the server reads it, m:ss per km: per mile
    /// with imperial units is converted, otherwise it goes as typed.
    static func paceForServer(_ typed: String) -> String {
        guard Units.imperial else { return typed }
        let parts = typed.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard parts.count == 2, let m = Double(parts[0]), let s = Double(parts[1]) else { return typed }
        return pace((m * 60 + s) / Units.pace(1))
    }

    private func paceRange(_ z: TrainingProfileResponse.PaceZone) -> String {
        switch (z.paceSlow, z.paceFast) {
        case (let slow?, let fast?): return Self.pace(Units.pace(fast)) + "–" + Self.pace(Units.pace(slow))
        case (nil, let fast?): return L10n.f("nad %@", Self.pace(Units.pace(fast)))
        case (let slow?, nil): return L10n.f("pod %@", Self.pace(Units.pace(slow)))
        default: return "–"
        }
    }

    private func bpmRange(_ z: TrainingProfileResponse.HRZone) -> String {
        switch (z.bpmLow, z.bpmHigh) {
        case (let low?, let high?): return Fmt.int(low) + "–" + Fmt.int(high)
        case (nil, let high?): return L10n.f("do %@", Fmt.int(high))
        case (let low?, nil): return Fmt.int(low) + "+"
        default: return "–"
        }
    }

    private func wattRange(_ z: TrainingProfileResponse.PowerZone) -> String {
        switch (z.wattsLow, z.wattsHigh) {
        case (let low?, let high?): return Fmt.int(low) + "–" + Fmt.int(high) + " W"
        case (let low?, nil): return Fmt.int(low) + "+ W"
        default: return "–"
        }
    }

    private func fill() {
        let p = store.training?.profile ?? [:]
        ftp = p["ftp"]?.string ?? ""
        lthr = p["lthr"]?.string ?? ""
        maxHr = p["maxHr"]?.string ?? ""
        runPace = (p["runThresholdPace"]?.number).map { Self.pace(Units.pace($0)) } ?? ""
        runLthr = p["runLthr"]?.string ?? ""
        powerModel = p["powerZoneModel"]?.string ?? "coggan7"
        hrModel = p["hrZoneModel"]?.string ?? "frielLthr"
        paceModel = p["paceZoneModel"]?.string ?? "friel"
        original = changes
    }

    private var changes: JSONObject {
        [
            "ftp": .field(ftp), "lthr": .field(lthr), "maxHr": .field(maxHr),
            // "4:35" goes as text, the server reads m:ss.
            "runThresholdPace": runPace.trimmingCharacters(in: .whitespaces).isEmpty ? .null : .string(Self.paceForServer(runPace)),
            "runLthr": .field(runLthr),
            "powerZoneModel": .string(powerModel), "hrZoneModel": .string(hrModel), "paceZoneModel": .string(paceModel)
        ]
    }

    private func save() async {
        if await store.saveTraining(changes, writeIntervals: writeIntervals) { fill() }
    }
}

/// "Z2 Aerobní · 87,7 % · 5:14–5:55".
struct ZoneRow: View {
    let name: String
    let percent: String?
    let range: String

    var body: some View {
        HStack(spacing: 10) {
            Text(name).font(.subheadline).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 6)
            if let percent { Text(percent).font(.caption).foregroundStyle(Palette.faint) }
            Text(range).font(Typo.number(17)).foregroundStyle(Palette.ink).frame(minWidth: 82, alignment: .trailing)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}
