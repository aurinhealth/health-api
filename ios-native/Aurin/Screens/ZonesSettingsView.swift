import SwiftUI

/// Zóny: the maximum and resting heart rate first, then bike, run and swim
/// separately, thresholds, the zone preset (the same presets as Intervals.icu)
/// and the resulting zones, the heart-rate ones also as a coloured bar. Swim:
/// CSS (from a 400 + 200 m test), the usual pool and open water.
struct ZonesSettingsView: View {
    let store: SettingsStore
    @State private var hrmax = ""
    @State private var rhr = ""
    @State private var heartOriginal: JSONObject = [:]
    @State private var sport = "run"
    @State private var ftp = ""
    @State private var lthr = ""
    @State private var maxHr = ""
    @State private var runPace = ""
    @State private var runLthr = ""
    @State private var powerModel = "coggan7"
    @State private var hrModel = "frielLthr"
    @State private var paceModel = "friel"
    @State private var swimCss = ""
    @State private var poolLength = ""
    @State private var openWater = "off"
    @State private var test400 = ""
    @State private var test200 = ""
    @State private var original: JSONObject = [:]
    // The athlete's own zones (model "custom"): tops in % FTP, bpm and % of
    // threshold speed, the preset they were made from (its names stay), and
    // running heart rate and swimming, which have no preset picker.
    @State private var powerBounds: [Double] = []
    @State private var powerBase = ""
    @State private var hrBounds: [Double] = []
    @State private var hrBase = ""
    @State private var paceBounds: [Double] = []
    @State private var paceBase = ""
    @State private var runHrCustom = false
    @State private var runHrBounds: [Double] = []
    @State private var swimCustom = false
    @State private var swimBounds: [Double] = []
    /// The group whose zone starts are being typed, the typed starts (Z2 on)
    /// and whether they are in % (of FTP, threshold HR or threshold speed).
    @State private var editing: ZoneGroup?
    @State private var startTexts: [String] = []
    @State private var inPercent = false
    @AppStorage("writeIntervals") private var writeIntervals = true
    @AppStorage("writeWahoo") private var writeWahoo = true
    /// Wahoo refused or failed the last write: the next save sends the zones again.
    @State private var wahooRetry = false
    @State private var reconnecting: ConnectTarget?

    enum ZoneGroup: String { case power, heart, pace, runHeart, swim }

    var body: some View {
        SettingsPage(title: "Zóny") {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Tep") {
                SettingsField(title: "Maximální tep", text: $hrmax, unit: "bpm", keyboard: .numberPad, placeholder: suggested("hrmax"), note: heartNote)
                SettingsDivider()
                SettingsField(title: "Klidový tep", text: $rhr, unit: "bpm", keyboard: .numberPad, placeholder: suggested("rhr"))
            }
            if let seen = seenMax {
                MaxHeartSuggestion(bpm: seen) { hrmax = Fmt.int(seen) }
            }

            Picker("Sport", selection: $sport) {
                Text("Kolo").tag("bike")
                Text("Běh").tag("run")
                Text("Plavání").tag("swim")
            }
            .pickerStyle(.segmented)

            if let training = store.training {
                let zones = live(training)
                // An older server sends no presets to work the zones out with: they change after Save.
                if zones.estimated && changes != original {
                    Label("Zóny níže se přepočítají po uložení.", systemImage: "info.circle")
                        .font(Typo.caption).foregroundStyle(Palette.amber)
                }
                if sport == "run" { run(training, zones) } else if sport == "swim" { swim(training, zones) } else { bike(training, zones) }
                intervals(training)
                if training.wahooConnected == true { wahoo(training) }
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
        .toolbar { SaveButton(enabled: canSave, saving: store.saving) { Task { await save() } } }
        .onAppear { fill(); fillHeart() }
        .onChange(of: store.training) { fill() }
        // A new threshold moves the zones: the typed starts follow.
        .onChange(of: [ftp, lthr, maxHr, runPace, runLthr, swimCss, hrmax, rhr]) { refreshStarts() }
        .onChange(of: sport) { editing = nil }
        .sheet(item: $reconnecting) { target in ServiceConnectSheet(target: target) { await store.load() } }
    }

    private var canSave: Bool {
        guard startsValid else { return false }
        return changes != original || heart != heartOriginal || (writeIntervals && store.training?.intervals?.status != "ok" && store.training?.intervalsConnected == true) || (writeWahoo && wahooRetry)
    }

    // MARK: Run

    @ViewBuilder
    private func run(_ t: TrainingProfileResponse, _ zones: LiveZones) -> some View {
        SettingsGroup(title: "Prahové hodnoty") {
            SettingsField(title: "Prahové tempo", text: $runPace, unit: Units.paceUnit, keyboard: .numbersAndPunctuation, placeholder: t.resolved.runThresholdPace.map { Self.pace(Units.pace($0)) } ?? "m:ss", note: note(t, "runThresholdPace"))
            SettingsDivider()
            SettingsField(title: "Prahový tep", text: $runLthr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.runLthr.map { Fmt.int($0) } ?? "–", note: note(t, "runLthr"))
        }
        SettingsGroup(title: "Tempové zóny", footer: editing == .pace ? editFooter(.pace) : nil,
                      action: editAction(.pace, zones)) {
            OptionListRow(title: "Předvolba", selection: $paceModel, options: presetOptions(t.paceZoneModels, custom: paceModel == "custom"))
            if editing == .pace {
                startRows(.pace, zones)
            } else {
                ForEach(zones.pace) { z in
                    SettingsDivider()
                    ZoneRow(name: z.name, percent: percentRange(z.percentLow, z.percentHigh, first: z.zone == 1), range: paceRange(z))
                }
            }
        }
        if !zones.runHeart.isEmpty {
            SettingsGroup(title: "Tepové zóny pro běh", footer: editing == .runHeart ? editFooter(.runHeart) : nil,
                          action: editAction(.runHeart, zones)) {
                HeartZoneStrip(zones: zones.runHeart)
                if runHrCustom {
                    SettingsDivider()
                    PresetLabelRow(value: "Vlastní")
                }
                if editing == .runHeart {
                    startRows(.runHeart, zones)
                } else {
                    ForEach(Array(zones.runHeart.enumerated()), id: \.element.id) { i, z in
                        SettingsDivider()
                        ZoneRow(name: z.name, percent: heartPercent(z, lthr: zones.runLthr), range: bpmRange(z), color: HeartZoneStrip.color(i))
                    }
                }
            }
        }
    }

    // MARK: Bike

    @ViewBuilder
    private func bike(_ t: TrainingProfileResponse, _ zones: LiveZones) -> some View {
        SettingsGroup(title: "Prahové hodnoty") {
            SettingsField(title: "FTP", text: $ftp, unit: "W", keyboard: .numberPad, placeholder: t.resolved.ftp.map { Fmt.int($0) } ?? "–", note: note(t, "ftp"))
            SettingsDivider()
            SettingsField(title: "Prahový tep", text: $lthr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.lthr.map { Fmt.int($0) } ?? "–", note: note(t, "lthr"))
            SettingsDivider()
            SettingsField(title: "Maximální tep na kole", text: $maxHr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.maxHr.map { Fmt.int($0) } ?? "–", note: note(t, "maxHr"))
        }
        SettingsGroup(title: "Výkonové zóny", footer: editing == .power ? editFooter(.power) : nil,
                      action: editAction(.power, zones)) {
            OptionListRow(title: "Předvolba", selection: $powerModel, options: presetOptions(t.powerZoneModels, custom: powerModel == "custom"))
            if editing == .power {
                startRows(.power, zones)
            } else {
                ForEach(zones.power) { z in
                    SettingsDivider()
                    ZoneRow(name: z.name, percent: percentRange(z.percentLow, z.percentHigh, first: z.zone == 1), range: wattRange(z))
                }
            }
        }
        SettingsGroup(title: "Tepové zóny pro kolo", footer: editing == .heart ? editFooter(.heart) : nil,
                      action: editAction(.heart, zones)) {
            HeartZoneStrip(zones: zones.heart)
            SettingsDivider()
            OptionListRow(title: "Předvolba", selection: $hrModel, options: presetOptions(t.hrZoneModels, custom: hrModel == "custom"))
            if editing == .heart {
                startRows(.heart, zones)
            } else {
                ForEach(Array(zones.heart.enumerated()), id: \.element.id) { i, z in
                    SettingsDivider()
                    ZoneRow(name: z.name, percent: heartPercent(z, lthr: zones.lthr), range: bpmRange(z), color: HeartZoneStrip.color(i))
                }
            }
        }
    }

    // MARK: Swim

    static let pools = [("25", "25 m"), ("50", "50 m"), ("22.86", "25 yd"), ("33.33", "33⅓ m")]
    static let openWaterOptions = [("off", "Vypnuto"), ("races", "Před závody"), ("season", "V sezóně")]

    /// "automaticky · 25 m": the pool of the last pool swim until one is picked.
    private func poolOptions(_ t: TrainingProfileResponse) -> [(String, String)] {
        let last = t.resolved.poolLengthSource == "auto" ? t.resolved.poolLength.flatMap { n in Self.pools.first { Double($0.0) == n }?.1 } : nil
        return [("", last.map { L10n.tr("automaticky") + " · " + $0 } ?? L10n.tr("automaticky"))] + Self.pools
    }

    @ViewBuilder
    private func swim(_ t: TrainingProfileResponse, _ zones: LiveZones) -> some View {
        SettingsGroup(title: "Prahové hodnoty", footer: "CSS je tempo, které udržíš zhruba 30 minut. Z něj jsou plavecké zóny.") {
            SettingsField(title: "CSS", text: $swimCss, unit: "/100 m", keyboard: .numbersAndPunctuation, placeholder: t.resolved.swimCss.map { Self.pace($0) } ?? "m:ss", note: note(t, "swimCss"))
        }
        SettingsGroup(title: "Test 400 + 200 m", footer: "Po rozplavání 400 m naplno, pak 5 minut volně a 200 m naplno.") {
            SettingsField(title: "400 m", text: $test400, unit: "min", keyboard: .numbersAndPunctuation, placeholder: "m:ss")
            SettingsDivider()
            SettingsField(title: "200 m", text: $test200, unit: "min", keyboard: .numbersAndPunctuation, placeholder: "m:ss")
            if let css = Self.css(test400, test200) {
                SettingsDivider()
                Button { swimCss = Self.pace(css) } label: {
                    HStack {
                        Text(L10n.f("CSS %@ /100 m", Self.pace(css))).font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Text("Použít").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        SettingsGroup(title: "Kde plaveš") {
            OptionListRow(title: "Obvyklý bazén", selection: $poolLength, options: poolOptions(t))
            SettingsDivider()
            OptionListRow(title: "Otevřená voda", selection: $openWater, options: Self.openWaterOptions.map { ($0.0, L10n.tr($0.1)) },
                          footer: L10n.tr("Vypnuto: plánujeme jen bazén. Před závody: jednou týdně 6–8 týdnů před závodem. V sezóně: jednou týdně od května do září. Ve volné vodě nikdy neplav sám."))
        }
        if !zones.swim.isEmpty {
            SettingsGroup(title: "Tempové zóny v plavání", footer: editing == .swim ? editFooter(.swim) : nil,
                          action: editAction(.swim, zones)) {
                if swimCustom {
                    PresetLabelRow(value: "Vlastní")
                    SettingsDivider()
                }
                if editing == .swim {
                    startRows(.swim, zones, divided: false)
                } else {
                    ForEach(zones.swim) { z in
                        if z.zone > 1 { SettingsDivider() }
                        ZoneRow(name: z.name, percent: nil, range: swimRange(z))
                    }
                }
            }
        }
    }

    /// CSS from a 400 m and a 200 m time: (T400 − T200) / 2 per 100 m.
    static func css(_ t400: String, _ t200: String) -> Double? {
        guard let a = seconds(t400), let b = seconds(t200), a > b, b / 2 < a / 4 else { return nil }
        let css = (a - b) / 2
        return (60...240).contains(css) ? css.rounded() : nil
    }

    static func seconds(_ typed: String) -> Double? {
        let parts = typed.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard parts.count == 2, let m = Double(parts[0]), let s = Double(parts[1]), s < 60 else { return nil }
        return m * 60 + s
    }

    private func swimRange(_ z: TrainingProfileResponse.SwimZone) -> String {
        switch (z.paceSlow, z.paceFast) {
        case (let slow?, let fast?): return fast + "–" + slow
        case (nil, let fast?): return L10n.f("pod %@", fast)
        case (let slow?, nil): return L10n.f("nad %@", slow)
        default: return "–"
        }
    }

    // MARK: Intervals.icu

    @ViewBuilder
    private func intervals(_ t: TrainingProfileResponse) -> some View {
        PillToggle(title: "Zapisovat do Intervals.icu",
                   subtitle: t.intervalsConnected == false ? "Intervals.icu není připojené" : writeIntervals ? "Prahy a zóny se po uložení pošlou do Intervals.icu" : "Zóny zůstanou jen v Aurinu",
                   systemImage: "arrow.triangle.2.circlepath", isOn: $writeIntervals, disabled: t.intervalsConnected == false)
        if let result = t.intervals {
            switch result.status {
            case "ok":
                Label(L10n.tr("Zapsáno do Intervals.icu") + ((result.updated ?? []).isEmpty ? "" : " (" + (result.updated ?? []).map { L10n.tr($0 == "Ride" ? "kolo" : $0 == "Swim" ? "plavání" : "běh") }.joined(separator: ", ") + ")"), systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            case "needs-permission":
                VStack(alignment: .leading, spacing: 10) {
                    Text("Intervals.icu zápis odmítlo. Připoj ho znovu a ulož zóny ještě jednou.")
                        .font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                    Button { reconnecting = ConnectTarget(id: "intervals") } label: {
                        Text("Připojit znovu").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
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

    // MARK: Wahoo

    /// Like Intervals.icu: the FTP and power zones go to Wahoo after a save
    /// that changed them; shown only with Wahoo connected.
    @ViewBuilder
    private func wahoo(_ t: TrainingProfileResponse) -> some View {
        PillToggle(title: "Zapisovat do Wahoo",
                   subtitle: writeWahoo ? "FTP a výkonové zóny se po uložení pošlou do Wahoo" : "Zóny zůstanou jen v Aurinu",
                   systemImage: "arrow.triangle.2.circlepath", isOn: $writeWahoo)
        if writeWahoo, let result = t.wahoo {
            switch result.status {
            case "ok":
                Label("Zapsáno do Wahoo", systemImage: "checkmark.circle.fill")
                    .font(Typo.small).foregroundStyle(Palette.green)
            case "needs-permission":
                VStack(alignment: .leading, spacing: 10) {
                    Text("Wahoo zápis odmítlo. Připoj ho znovu a ulož zóny ještě jednou.")
                        .font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                    Button { reconnecting = ConnectTarget(id: "wahoo") } label: {
                        Text("Připojit znovu").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 16).frame(height: 40)
                            .background(Palette.button, in: Capsule())
                    }
                }
            case "error":
                Text("Do Wahoo se nepodařilo zapsat.")
                    .font(Typo.small).foregroundStyle(Palette.rust)
            default:
                EmptyView()
            }
        }
    }

    // MARK: Values

    nonisolated static func pace(_ seconds: Double) -> String {
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
        swimCss = (p["swimCss"]?.number).map { Self.pace($0) } ?? ""
        poolLength = (p["poolLength"]?.number).flatMap { n in Self.pools.first { Double($0.0) == n }?.0 } ?? ""
        openWater = p["openWater"]?.string ?? "off"
        powerBounds = Self.numbers(p["powerZoneBounds"])
        powerBase = p["powerZoneBase"]?.string ?? ""
        hrBounds = Self.numbers(p["hrZoneBounds"])
        hrBase = p["hrZoneBase"]?.string ?? ""
        paceBounds = Self.numbers(p["paceZoneBounds"])
        paceBase = p["paceZoneBase"]?.string ?? ""
        runHrCustom = p["runHrZoneModel"]?.string == "custom"
        runHrBounds = Self.numbers(p["runHrZoneBounds"])
        swimCustom = p["swimZoneModel"]?.string == "custom"
        swimBounds = Self.numbers(p["swimZoneBounds"])
        editing = nil
        original = changes
    }

    static func numbers(_ value: JSONValue?) -> [Double] {
        guard case .array(let items)? = value else { return [] }
        return items.compactMap(\.number)
    }

    private var changes: JSONObject {
        [
            "ftp": .field(ftp), "lthr": .field(lthr), "maxHr": .field(maxHr),
            // "4:35" goes as text, the server reads m:ss.
            "runThresholdPace": runPace.trimmingCharacters(in: .whitespaces).isEmpty ? .null : .string(Self.paceForServer(runPace)),
            "runLthr": .field(runLthr),
            "powerZoneModel": .string(powerModel), "hrZoneModel": .string(hrModel), "paceZoneModel": .string(paceModel),
            "swimCss": swimCss.trimmingCharacters(in: .whitespaces).isEmpty ? .null : .string(swimCss.trimmingCharacters(in: .whitespaces)),
            "poolLength": Double(poolLength).map { .number($0) } ?? .null, "openWater": .string(openWater),
            // The athlete's own zones; the server keeps them only with the model "custom".
            "powerZoneBounds": Self.own(powerModel == "custom", powerBounds), "powerZoneBase": Self.base(powerModel == "custom", powerBase),
            "hrZoneBounds": Self.own(hrModel == "custom", hrBounds), "hrZoneBase": Self.base(hrModel == "custom", hrBase),
            "paceZoneBounds": Self.own(paceModel == "custom", paceBounds), "paceZoneBase": Self.base(paceModel == "custom", paceBase),
            "runHrZoneModel": .string(runHrCustom ? "custom" : "auto"), "runHrZoneBounds": Self.own(runHrCustom, runHrBounds),
            "swimZoneModel": .string(swimCustom ? "custom" : "preset"), "swimZoneBounds": Self.own(swimCustom, swimBounds)
        ]
    }

    private static func own(_ custom: Bool, _ bounds: [Double]) -> JSONValue {
        custom && !bounds.isEmpty ? .array(bounds.map { .number($0) }) : .null
    }

    private static func base(_ custom: Bool, _ id: String) -> JSONValue {
        custom && !id.isEmpty ? .string(id) : .null
    }

    // MARK: Zones while typing

    /// The zones from what is typed now (ZoneMath, the same math as the
    /// server). estimated: an older server sent no presets to work them out
    /// with, so these are the saved zones and they change after Save.
    struct LiveZones {
        var power: [TrainingProfileResponse.PowerZone]
        var heart: [TrainingProfileResponse.HRZone]
        var pace: [TrainingProfileResponse.PaceZone]
        var runHeart: [TrainingProfileResponse.HRZone]
        var swim: [TrainingProfileResponse.SwimZone]
        var ftp: Double?
        var lthr: Double?
        var runLthr: Double?
        var runPace: Double?
        var css: Double?
        /// The heart-rate models in use now (after the server's fallbacks).
        var heartModel: String
        var runHeartModel: String
        var swimFastEnds: [Double]
        var estimated = false
    }

    /// A typed number in its range; an empty field falls back to `base`.
    static func value(_ text: String, _ range: ClosedRange<Double>, base: Double?) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return base }
        guard let n = Double(t.replacingOccurrences(of: ",", with: ".")), range.contains(n) else { return nil }
        return n
    }

    /// A typed m:ss in seconds (per km after `perKm` turns a mile pace into a km one).
    static func clockValue(_ text: String, _ range: ClosedRange<Double>, base: Double?, perKm: Bool = false) -> Double? {
        if text.trimmingCharacters(in: .whitespaces).isEmpty { return base }
        guard let typed = seconds(text) else { return nil }
        let value = perKm ? typed / Units.pace(1) : typed
        return range.contains(value) ? value : nil
    }

    private func live(_ t: TrainingProfileResponse) -> LiveZones {
        let runModel = ["frielLthr", "frielRun", "custom"].contains(hrModel) ? "frielRun" : hrModel
        guard let base = t.preview, let swimModel = t.swimZoneModel else {
            return LiveZones(power: t.powerZones, heart: t.hrZones, pace: t.paceZones, runHeart: t.runHrZones ?? [], swim: t.swimZones ?? [],
                             ftp: t.resolved.ftp, lthr: t.resolved.lthr, runLthr: t.resolved.runLthr, runPace: t.resolved.runThresholdPace, css: t.resolved.swimCss,
                             heartModel: t.hrModel ?? hrModel, runHeartModel: t.runHrModel ?? runModel, swimFastEnds: [], estimated: true)
        }
        let ftpNow = Self.value(ftp, 50...600, base: base.ftp)
        let lthrNow = Self.value(lthr, 100...220, base: base.lthr)
        let ownMax = Self.value(hrmax, 100...230, base: nil)
        let bikeMax = Self.value(maxHr, 110...230, base: nil)
        let maxNow = bikeMax ?? ownMax ?? base.maxHr
        // A max typed in Tep replaces Intervals.icu's running max too (src/intervals-athlete.js).
        let runMaxNow = (bikeMax == nil && ownMax != nil ? nil : base.runMaxHr) ?? maxNow
        let restNow = Self.value(rhr, 30...100, base: base.restHr)
        let runPaceNow = Self.clockValue(runPace, 150...600, base: base.runThresholdPace, perKm: true)
        let runLthrNow = Self.value(runLthr, 100...220, base: base.runLthr)
        let cssNow = Self.clockValue(swimCss, 60...240, base: base.swimCss)

        let power: [TrainingProfileResponse.PowerZone]
        if powerModel == "custom" {
            power = ZoneMath.power(bounds: powerBounds, names: ZoneMath.names(t.powerZoneModels, base: powerBase, count: powerBounds.count + 1, skip: "sweetSpot"), ftp: ftpNow)
        } else if let m = t.powerZoneModels.first(where: { $0.id == powerModel }) ?? t.powerZoneModels.first, let bounds = m.bounds, let names = m.names {
            power = ZoneMath.power(bounds: bounds, names: names, ftp: ftpNow)
        } else {
            power = t.powerZones
        }

        let heartModel = hrModel == "custom" ? "custom" : ZoneMath.heartModel(hrModel, lthr: lthrNow, maxHr: maxNow, restHr: restNow)
        let heart: [TrainingProfileResponse.HRZone]
        if heartModel == "custom" {
            heart = ZoneMath.heart(tops: hrBounds, names: ZoneMath.names(t.hrZoneModels, base: hrBase, count: hrBounds.count + 1), maxHr: maxNow)
        } else {
            heart = presetHeart(t.hrZoneModels, heartModel, lthr: lthrNow, maxHr: maxNow, restHr: restNow) ?? t.hrZones
        }

        let runHeartModel = runHrCustom ? "custom" : ZoneMath.heartModel(runModel, lthr: runLthrNow, maxHr: runMaxNow, restHr: restNow)
        let runHeart: [TrainingProfileResponse.HRZone]
        if runHeartModel == "custom" {
            runHeart = ZoneMath.heart(tops: runHrBounds, names: ZoneMath.names(t.hrZoneModels, base: runModel, count: runHrBounds.count + 1), maxHr: runMaxNow)
        } else {
            runHeart = presetHeart(t.hrZoneModels, runHeartModel, lthr: runLthrNow, maxHr: runMaxNow, restHr: restNow) ?? (t.runHrZones ?? [])
        }

        let pace: [TrainingProfileResponse.PaceZone]
        if paceModel == "custom" {
            pace = ZoneMath.pace(bounds: paceBounds, names: ZoneMath.names(t.paceZoneModels, base: paceBase, count: paceBounds.count + 1), threshold: runPaceNow)
        } else if let m = t.paceZoneModels.first(where: { $0.id == paceModel }) ?? t.paceZoneModels.first, let bounds = m.bounds, let names = m.names {
            pace = ZoneMath.pace(bounds: bounds, names: names, threshold: runPaceNow)
        } else {
            pace = t.paceZones
        }

        let fastEnds = swimCustom && swimBounds.count == swimModel.offsets.count ? swimBounds : swimModel.offsets
        let swim = ZoneMath.swim(fastEnds: fastEnds, names: swimModel.names, css: cssNow)
        return LiveZones(power: power, heart: heart, pace: pace, runHeart: runHeart, swim: swim,
                         ftp: ftpNow, lthr: lthrNow, runLthr: runLthrNow, runPace: runPaceNow, css: cssNow,
                         heartModel: heartModel, runHeartModel: runHeartModel, swimFastEnds: fastEnds)
    }

    private func presetHeart(_ models: [TrainingProfileResponse.Model], _ id: String, lthr: Double?, maxHr: Double?, restHr: Double?) -> [TrainingProfileResponse.HRZone]? {
        guard let m = models.first(where: { $0.id == id }), let bounds = m.bounds, let names = m.names, let reference = m.reference else { return nil }
        return ZoneMath.heart(reference: reference, bounds: bounds, names: names, lthr: lthr, maxHr: maxHr, restHr: restHr)
    }

    /// The preset list; "Vlastní" only while the athlete's own zones are in use.
    private func presetOptions(_ models: [TrainingProfileResponse.Model], custom: Bool) -> [(String, String)] {
        models.map { ($0.id, $0.label) } + (custom ? [("custom", L10n.tr("Vlastní"))] : [])
    }

    // MARK: Editing zone starts

    /// "Upravit" / "Hotovo" at the group's title, only while the zones have
    /// numbers to start from (and the server can work them out again).
    private func editAction(_ group: ZoneGroup, _ zones: LiveZones) -> SettingsGroupAction? {
        if editing == group { return SettingsGroupAction(title: "Hotovo") { editing = nil } }
        guard editable(group, zones) else { return nil }
        return SettingsGroupAction(title: "Upravit") {
            inPercent = false
            editing = group
            startTexts = starts(group, zones).map { text(group, $0) }
        }
    }

    private func editable(_ group: ZoneGroup, _ zones: LiveZones) -> Bool {
        guard !zones.estimated else { return false }
        switch group {
        case .power: return zones.ftp != nil && zones.power.count > 1
        case .heart: return zones.heart.count > 1 && zones.heart.dropFirst().allSatisfy { $0.bpmLow != nil }
        case .runHeart: return zones.runHeart.count > 1 && zones.runHeart.dropFirst().allSatisfy { $0.bpmLow != nil }
        case .pace: return zones.runPace != nil && zones.pace.count > 1
        case .swim: return zones.css != nil && zones.swim.count > 1
        }
    }

    /// Whether the group can be typed in % too, and of what.
    private func percentUnit(_ group: ZoneGroup, _ zones: LiveZones) -> String? {
        switch group {
        case .power: return "% FTP"
        case .pace: return "% prahu"
        case .heart: return zones.lthr == nil ? nil : "% prahového tepu"
        case .runHeart: return zones.runLthr == nil ? nil : "% prahového tepu"
        case .swim: return nil
        }
    }

    private func plainUnit(_ group: ZoneGroup) -> String {
        switch group {
        case .power: return "W"
        case .heart, .runHeart: return "bpm"
        case .pace: return Units.paceUnit
        case .swim: return "/100 m"
        }
    }

    /// Each zone's start from Z2 on, in the unit shown now (paces in seconds per km or per 100 m).
    private func starts(_ group: ZoneGroup, _ zones: LiveZones) -> [Double?] {
        switch group {
        case .power: return ZoneMath.powerStarts(zones.power, percent: inPercent)
        case .heart: return ZoneMath.heartStarts(zones.heart, lthr: inPercent ? zones.lthr : nil)
        case .runHeart: return ZoneMath.heartStarts(zones.runHeart, lthr: inPercent ? zones.runLthr : nil)
        case .pace: return ZoneMath.paceStarts(zones.pace, percent: inPercent)
        case .swim: return ZoneMath.swimStarts(fastEnds: zones.swimFastEnds, css: zones.css)
        }
    }

    private func text(_ group: ZoneGroup, _ value: Double?) -> String {
        guard let value else { return "" }
        switch group {
        case .pace where !inPercent: return Self.pace(Units.pace(value))
        case .swim: return Self.pace(value)
        default: return value.rounded() == value ? String(Int(value)) : Fmt.decimal(value, digits: 1)
        }
    }

    /// The typed starts as numbers (paces in seconds per km or per 100 m).
    private func typedStarts(_ group: ZoneGroup) -> [Double?] {
        startTexts.map { (typed: String) -> Double? in
            switch group {
            case .pace where !inPercent: return Self.seconds(typed).map { $0 / Units.pace(1) }
            case .swim: return Self.seconds(typed)
            default: return Double(typed.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
            }
        }
    }

    /// Paces get faster zone by zone: their starts go down.
    private func descending(_ group: ZoneGroup) -> Bool {
        group == .swim || (group == .pace && !inPercent)
    }

    /// The typed starts break no order (else Save waits).
    private var startsValid: Bool {
        guard let editing else { return true }
        return ZoneMath.outOfOrder(typedStarts(editing), descending: descending(editing)).isEmpty
    }

    /// A typed start changed: the zones follow when all starts are in order;
    /// the preset becomes the athlete's own, keeping the preset's names.
    private func applyStarts(_ group: ZoneGroup) {
        guard let t = store.training else { return }
        let zones = live(t), typed = typedStarts(group)
        switch group {
        case .power:
            guard let bounds = ZoneMath.powerBounds(starts: typed, percent: inPercent, ftp: zones.ftp) else { return }
            if powerModel != "custom" { powerBase = powerModel; powerModel = "custom" }
            powerBounds = bounds
        case .heart:
            guard let tops = ZoneMath.heartTops(starts: typed, lthr: inPercent ? zones.lthr : nil) else { return }
            if hrModel != "custom" { hrBase = hrModel; hrModel = "custom" }
            hrBounds = tops
        case .runHeart:
            guard let tops = ZoneMath.heartTops(starts: typed, lthr: inPercent ? zones.runLthr : nil) else { return }
            runHrCustom = true
            runHrBounds = tops
        case .pace:
            guard let bounds = ZoneMath.paceBounds(starts: typed, percent: inPercent, threshold: zones.runPace) else { return }
            if paceModel != "custom" { paceBase = paceModel; paceModel = "custom" }
            paceBounds = bounds
        case .swim:
            guard let ends = ZoneMath.swimFastEnds(starts: typed, css: zones.css) else { return }
            swimCustom = true
            swimBounds = ends
        }
    }

    /// Back to the preset the zones were made from.
    private func reset(_ group: ZoneGroup) {
        switch group {
        case .power: powerModel = powerBase.isEmpty ? "coggan7" : powerBase
        case .heart: hrModel = hrBase.isEmpty || hrBase == "custom" ? "frielLthr" : hrBase
        case .runHeart: runHrCustom = false
        case .pace: paceModel = paceBase.isEmpty ? "friel" : paceBase
        case .swim: swimCustom = false
        }
        refreshStarts()
    }

    /// The typed starts again from the zones (after a new threshold, a unit or a reset).
    private func refreshStarts() {
        guard let group = editing, let t = store.training else { return }
        startTexts = starts(group, live(t)).map { text(group, $0) }
    }

    private func editFooter(_ group: ZoneGroup) -> String {
        switch group {
        case .power: return L10n.tr("Napiš, kde každá zóna začíná; zóna pod ní končí těsně pod tím. Z1 začíná vždy na 0. Zóny drží svá % FTP, takže se s novým FTP posunou.")
        case .pace: return L10n.tr("Napiš, kde každá zóna začíná; zóna před ní končí těsně před tím. Zóny drží svá % prahového tempa, takže se s novým prahem posunou.")
        case .heart, .runHeart: return L10n.tr("Napiš, kde každá zóna začíná; zóna pod ní končí o tep níž. Poslední zóna končí na maximálním tepu. Tepové zóny zůstanou v tepech, jak je napíšeš, nový prahový tep je neposune.")
        case .swim: return L10n.tr("Napiš, kde každá zóna začíná; zóna před ní končí o sekundu pomaleji. Zóny se drží CSS, takže se s novým CSS posunou.")
        }
    }

    /// The rows of the edit mode: the unit switch, then each zone with its
    /// start (a field from Z2 on) and its end, which follows from the next start.
    @ViewBuilder
    private func startRows(_ group: ZoneGroup, _ zones: LiveZones, divided: Bool = true) -> some View {
        let percentLabel = percentUnit(group, zones)
        if let percentLabel {
            if divided { SettingsDivider() }
            HStack(spacing: 12) {
                Text("Začátek zóny v").font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Picker("Začátek zóny v", selection: Binding(get: { inPercent }, set: { inPercent = $0; refreshStarts() })) {
                    Text(plainUnit(group)).tag(false)
                    Text(percentLabel).tag(true)
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            .padding(.horizontal, 16).frame(minHeight: 50)
        }
        let rows = editRows(group, zones)
        let bad = ZoneMath.outOfOrder(typedStarts(group), descending: descending(group))
        ForEach(rows) { row in
            if divided || percentLabel != nil || row.index > 0 { SettingsDivider() }
            let warning = bad.contains(row.index - 1)
            ZoneStartRow(name: row.name, color: row.color, detail: warning ? nil : row.detail, warning: warning,
                         fixedStart: row.fixedStart, text: startBinding(group, row.index - 1),
                         end: row.end, unit: row.unit, keyboard: keyboard(group))
        }
        SettingsDivider()
        Button { reset(group) } label: {
            Text(L10n.f("Vrátit na %@", resetLabel(group, zones))).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).padding(.horizontal, 16).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The field of a zone's start (index 0 = Z2); none for Z1.
    private func startBinding(_ group: ZoneGroup, _ index: Int) -> Binding<String>? {
        guard index >= 0, index < startTexts.count else { return nil }
        return Binding(
            get: { startTexts.indices.contains(index) ? startTexts[index] : "" },
            set: { value in
                guard startTexts.indices.contains(index) else { return }
                startTexts[index] = value
                applyStarts(group)
            })
    }

    /// m:ss needs the colon; numbers the decimal comma.
    private func keyboard(_ group: ZoneGroup) -> UIKeyboardType {
        if group == .swim { return .numbersAndPunctuation }
        if group == .pace && !inPercent { return .numbersAndPunctuation }
        return .decimalPad
    }

    private func resetLabel(_ group: ZoneGroup, _ zones: LiveZones) -> String {
        guard let t = store.training else { return "" }
        func label(_ models: [TrainingProfileResponse.Model], _ id: String, _ fallback: String) -> String {
            let key = id.isEmpty || id == "custom" ? fallback : id
            return models.first { $0.id == key }?.label ?? key
        }
        switch group {
        case .power: return label(t.powerZoneModels, powerModel == "custom" ? powerBase : powerModel, "coggan7")
        case .heart: return label(t.hrZoneModels, hrModel == "custom" ? hrBase : hrModel, "frielLthr")
        case .runHeart:
            let auto = t.runHrAuto ?? "frielRun"
            return label(t.hrZoneModels, auto, "frielRun")
        case .pace: return label(t.paceZoneModels, paceModel == "custom" ? paceBase : paceModel, "friel")
        case .swim: return "Swim Smooth"
        }
    }

    struct EditRow: Identifiable {
        let index: Int
        let name: String
        var color: Color? = nil
        /// The range in the other unit ("56–75 % FTP" while typing watts).
        let detail: String?
        /// Z1 has no field: its start is fixed ("0") or open.
        let fixedStart: String?
        let end: String
        let unit: String
        var id: Int { index }
    }

    private func editRows(_ group: ZoneGroup, _ zones: LiveZones) -> [EditRow] {
        var rows: [EditRow] = []
        switch group {
        case .power:
            let unit = inPercent ? "%" : "W"
            for (i, z) in zones.power.enumerated() {
                let last = z.wattsHigh == nil
                let detail: String = inPercent ? wattRange(z) : (percentRange(z.percentLow, z.percentHigh, first: i == 0) ?? "") + " FTP"
                var end = ""
                if !last { end = inPercent ? Fmt.int(z.percentHigh) : Fmt.int(z.wattsHigh) }
                rows.append(EditRow(index: i, name: z.name, detail: detail, fixedStart: i == 0 ? "0" : nil, end: end,
                                    unit: last ? L10n.f("%@ a víc", unit) : unit))
            }
        case .heart, .runHeart:
            let list = group == .heart ? zones.heart : zones.runHeart
            let ref: Double? = group == .heart ? zones.lthr : zones.runLthr
            for (i, z) in list.enumerated() {
                var detail: String? = nil
                if inPercent { detail = bpmRange(z) + " bpm" } else if let pct = heartPercent(z, lthr: ref) { detail = pct + " " + L10n.tr("prahového tepu") }
                var end = ""
                if let high = z.bpmHigh {
                    if !inPercent { end = Fmt.int(high) } else if let ref, ref > 0 { end = Fmt.int(ZoneMath.round(high / ref * 100)) }
                }
                rows.append(EditRow(index: i, name: z.name, color: HeartZoneStrip.color(i), detail: detail, fixedStart: i == 0 ? L10n.tr("do") : nil,
                                    end: end, unit: inPercent ? "%" : "bpm"))
            }
        case .pace:
            for (i, z) in zones.pace.enumerated() {
                let detail: String? = inPercent ? paceRange(z) + " " + Units.paceUnit : percentRange(z.percentLow, z.percentHigh, first: i == 0)
                var end = ""
                if inPercent, let high = z.percentHigh { end = text(.pace, high) }
                if !inPercent, let fast = z.paceFast { end = Self.pace(Units.pace(fast)) }
                let unit: String = z.percentHigh == nil ? L10n.tr("a rychleji") : (inPercent ? "%" : Units.paceUnit)
                rows.append(EditRow(index: i, name: z.name, detail: detail, fixedStart: i == 0 ? L10n.tr("do") : nil, end: end, unit: unit))
            }
        case .swim:
            for (i, z) in zones.swim.enumerated() {
                let unit: String = z.paceFast == nil ? L10n.tr("a rychleji") : "/100 m"
                rows.append(EditRow(index: i, name: z.name, detail: nil, fixedStart: i == 0 ? L10n.tr("do") : nil, end: z.paceFast ?? "", unit: unit))
            }
        }
        return rows
    }

    /// "56–75 %"; the first zone from 0, the last open ("151+ %").
    private func percentRange(_ low: Double?, _ high: Double?, first: Bool) -> String? {
        func number(_ x: Double) -> String { x.rounded() == x ? Fmt.int(x) : Fmt.decimal(x, digits: 1) }
        switch (low, high) {
        case (let low?, let high?): return number(first ? 0 : low) + "–" + number(high) + Fmt.percentSign
        case (let low?, nil): return number(low) + "+" + Fmt.percentSign
        default: return nil
        }
    }

    /// A heart-rate zone in % of the threshold heart rate, when it is known.
    private func heartPercent(_ z: TrainingProfileResponse.HRZone, lthr: Double?) -> String? {
        guard let lthr, lthr > 0 else { return nil }
        let pct = { (bpm: Double) in Fmt.int(ZoneMath.round(bpm / lthr * 100)) }
        switch (z.bpmLow, z.bpmHigh) {
        case (let low?, let high?): return pct(low) + "–" + pct(high) + Fmt.percentSign
        case (nil, let high?): return L10n.f("do %@", pct(high)) + Fmt.percentSign
        case (let low?, nil): return pct(low) + "+" + Fmt.percentSign
        default: return nil
        }
    }

    // MARK: Heart rate (the profile)

    /// The worked-out value shown in an empty field.
    /// Where a threshold comes from and how old it is, while its field still
    /// shows the saved value (a typed change is the athlete's own).
    private func note(_ t: TrainingProfileResponse, _ key: String) -> String? {
        changes[key] == original[key] ? t.notes?[key] : nil
    }

    /// The max heart rate the app works with when none is typed: an estimate
    /// from age must not look like a measured one.
    private var heartNote: String? {
        guard hrmax.trimmingCharacters(in: .whitespaces).isEmpty, store.suggestions["hrmax"]?.number != nil,
              case .object(let sources)? = store.suggestions["sources"] else { return nil }
        switch sources["hrmax"]?.string {
        case "age-estimate": return L10n.tr("Odhad podle věku")
        case "activities-6m": return L10n.tr("Nejvyšší tep z tréninků za 6 měsíců")
        default: return nil
        }
    }

    private func suggested(_ key: String) -> String {
        (store.suggestions[key]?.number).map { Fmt.int($0) } ?? "–"
    }

    /// The highest heart rate of the last months' workouts, when it is above
    /// the typed maximum (an empty field already uses it).
    private var seenMax: Double? {
        guard case .object(let sources)? = store.suggestions["sources"], sources["hrmax"]?.string == "activities-6m",
              let seen = store.suggestions["hrmax"]?.number, let typed = Double(hrmax.trimmingCharacters(in: .whitespaces)),
              seen >= typed + 2 else { return nil }
        return seen
    }

    private var heart: JSONObject { ["hrmax": .field(hrmax), "rhr": .field(rhr)] }

    private func fillHeart() {
        hrmax = store.profile["hrmax"]?.string ?? ""
        rhr = store.profile["rhr"]?.string ?? ""
        heartOriginal = heart
    }

    private func save() async {
        if heart != heartOriginal {
            guard await store.saveProfile(heart) else { return }
            fillHeart()
        }
        let again = writeWahoo && wahooRetry
        if changes != original || again || (writeIntervals && store.training?.intervals?.status != "ok" && store.training?.intervalsConnected == true) {
            if await store.saveTraining(changes, writeIntervals: writeIntervals, writeWahoo: writeWahoo, wahooAgain: again) {
                fill()
                if let status = store.training?.wahoo?.status { wahooRetry = status == "needs-permission" || status == "error" }
            }
        }
    }
}

/// "Z tréninků: max 196 · Použít": puts the seen maximum into the field.
struct MaxHeartSuggestion: View {
    let bpm: Double
    let use: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.fill").scaledFont(15, weight: .medium).foregroundStyle(Palette.amber)
            Text(L10n.f("Z tréninků: max %@", Fmt.int(bpm))).font(.subheadline).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Button(action: use) {
                Text("Použít").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Palette.amber.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.amber.opacity(0.28), lineWidth: 1) }
    }
}

/// The heart-rate zones as one bar, each part as wide as its range of beats.
struct HeartZoneStrip: View {
    let zones: [TrainingProfileResponse.HRZone]

    static let colors: [Color] = [Palette.faint, Palette.blue, Palette.green, Palette.amberBar, Palette.rust, Palette.indigo, Palette.indigo]
    static func color(_ index: Int) -> Color { colors[min(index, colors.count - 1)] }

    /// Each zone's width in beats; an open end gets a tenth of the whole span.
    private var widths: [Double] {
        let lows = zones.compactMap(\.bpmLow), highs = zones.compactMap(\.bpmHigh)
        guard let bottom = (lows + highs).min(), let top = (lows + highs).max(), top > bottom else { return zones.map { _ in 1 } }
        let open = (top - bottom) / 10
        return zones.map { z in max(1, (z.bpmHigh ?? (z.bpmLow ?? top) + open) - (z.bpmLow ?? (z.bpmHigh ?? bottom) - open)) }
    }

    var body: some View {
        let widths = widths, total = max(widths.reduce(0, +), 1)
        GeometryReader { geo in
            HStack(spacing: 3) {
                ForEach(widths.indices, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Self.color(i))
                        .frame(width: max(4, (geo.size.width - CGFloat(widths.count - 1) * 3) * widths[i] / total))
                }
            }
        }
        .frame(height: 12)
        .padding(.horizontal, 16).padding(.vertical, 16)
        .accessibilityHidden(true)
    }
}

/// "Z2 Aerobní · 87,7 % · 5:14–5:55".
struct ZoneRow: View {
    let name: String
    let percent: String?
    let range: String
    var color: Color? = nil

    var body: some View {
        HStack(spacing: 10) {
            if let color { Circle().fill(color).frame(width: 9, height: 9).accessibilityHidden(true) }
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

/// "Předvolba · Vlastní" where the zones have no preset picker (running heart rate, swimming).
struct PresetLabelRow: View {
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Text("Předvolba").font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Text(value).font(.subheadline).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 50)
    }
}

/// A zone in edit mode: "Z2 Vytrvalost · 56–75 % FTP · [161] – 220 W". The
/// start is typed (from Z2 on); the end follows from the next zone's start.
struct ZoneStartRow: View {
    let name: String
    var color: Color? = nil
    /// The range in the other unit; nil while the start is out of order.
    let detail: String?
    let warning: Bool
    /// Z1 has no field: "0" for power, "do" (up to) elsewhere.
    let fixedStart: String?
    let text: Binding<String>?
    let end: String
    let unit: String
    let keyboard: UIKeyboardType

    var body: some View {
        HStack(spacing: 8) {
            if let color { Circle().fill(color).frame(width: 9, height: 9).accessibilityHidden(true) }
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                if warning {
                    Text("Musí navazovat na zónu před ní.").font(Typo.caption).foregroundStyle(Palette.rust)
                } else if let detail {
                    Text(detail).font(Typo.caption).foregroundStyle(Palette.faint).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 6)
            if let text {
                TextField("", text: text)
                    .keyboardType(keyboard)
                    .multilineTextAlignment(.trailing)
                    .font(Typo.number(19))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .frame(width: 64)
                    .background(warning ? Palette.rust.opacity(0.08) : Palette.cardLift, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(warning ? Palette.rust : Palette.hairline, lineWidth: warning ? 1.5 : 1) }
                    .accessibilityLabel(L10n.f("Začátek zóny %@", name))
            } else if let fixedStart {
                Text(fixedStart).font(fixedStart == "0" ? Typo.number(19) : .subheadline).foregroundStyle(Palette.muted)
            }
            if !end.isEmpty {
                if fixedStart != L10n.tr("do") || text != nil { Text("–").font(.subheadline).foregroundStyle(Palette.muted) }
                Text(end).font(Typo.number(19)).foregroundStyle(Palette.ink)
            }
            Text(unit).font(.subheadline).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .frame(minHeight: 50)
    }
}
