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
    @AppStorage("writeIntervals") private var writeIntervals = true
    @AppStorage("writeWahoo") private var writeWahoo = true
    /// Wahoo refused or failed the last write: the next save sends the zones again.
    @State private var wahooRetry = false
    @State private var reconnecting: ConnectTarget?

    var body: some View {
        SettingsPage(title: "Zóny") {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Tep") {
                SettingsField(title: "Maximální tep", text: $hrmax, unit: "bpm", keyboard: .numberPad, placeholder: suggested("hrmax"))
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
                if changes != original {
                    Label("Zóny níže se přepočítají po uložení.", systemImage: "info.circle")
                        .font(Typo.caption).foregroundStyle(Palette.amber)
                }
                if sport == "run" { run(training) } else if sport == "swim" { swim(training) } else { bike(training) }
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
        .toolbar { SaveButton(enabled: changes != original || heart != heartOriginal || (writeIntervals && store.training?.intervals?.status != "ok" && store.training?.intervalsConnected == true) || (writeWahoo && wahooRetry), saving: store.saving) { Task { await save() } } }
        .onAppear { fill(); fillHeart() }
        .onChange(of: store.training) { fill() }
        .sheet(item: $reconnecting) { target in ServiceConnectSheet(target: target) { await store.load() } }
    }

    // MARK: Run

    @ViewBuilder
    private func run(_ t: TrainingProfileResponse) -> some View {
        SettingsGroup(title: "Prahové hodnoty") {
            SettingsField(title: "Prahové tempo", text: $runPace, unit: Units.paceUnit, keyboard: .numbersAndPunctuation, placeholder: t.resolved.runThresholdPace.map { Self.pace(Units.pace($0)) } ?? "m:ss")
            SettingsDivider()
            SettingsField(title: "Prahový tep", text: $runLthr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.runLthr.map { Fmt.int($0) } ?? "–")
        }
        SettingsGroup(title: "Tempové zóny") {
            OptionListRow(title: "Předvolba", selection: $paceModel, options: t.paceZoneModels.map { ($0.id, $0.label) })
            ForEach(t.paceZones) { z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: z.percentHigh.map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) + Fmt.percentSign },
                        range: paceRange(z))
            }
        }
        if let zones = t.runHrZones, !zones.isEmpty {
            SettingsGroup(title: "Tepové zóny pro běh") {
                HeartZoneStrip(zones: zones)
                ForEach(Array(zones.enumerated()), id: \.element.id) { i, z in
                    SettingsDivider()
                    ZoneRow(name: z.name, percent: nil, range: bpmRange(z), color: HeartZoneStrip.color(i))
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
            SettingsField(title: "Maximální tep na kole", text: $maxHr, unit: "bpm", keyboard: .numberPad, placeholder: t.resolved.maxHr.map { Fmt.int($0) } ?? "–")
        }
        SettingsGroup(title: "Výkonové zóny") {
            OptionListRow(title: "Předvolba", selection: $powerModel, options: t.powerZoneModels.map { ($0.id, $0.label) })
            ForEach(t.powerZones) { z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: z.percentHigh.map { Fmt.int($0) + Fmt.percentSign }, range: wattRange(z))
            }
        }
        SettingsGroup(title: "Tepové zóny pro kolo") {
            HeartZoneStrip(zones: t.hrZones)
            SettingsDivider()
            OptionListRow(title: "Předvolba", selection: $hrModel, options: t.hrZoneModels.map { ($0.id, $0.label) })
            ForEach(Array(t.hrZones.enumerated()), id: \.element.id) { i, z in
                SettingsDivider()
                ZoneRow(name: z.name, percent: nil, range: bpmRange(z), color: HeartZoneStrip.color(i))
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
    private func swim(_ t: TrainingProfileResponse) -> some View {
        SettingsGroup(title: "Prahové hodnoty", footer: "CSS je tempo, které udržíš zhruba 30 minut. Z něj jsou plavecké zóny.") {
            SettingsField(title: "CSS", text: $swimCss, unit: "/100 m", keyboard: .numbersAndPunctuation, placeholder: t.resolved.swimCss.map { Self.pace($0) } ?? "m:ss")
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
        if let zones = t.swimZones, !zones.isEmpty {
            SettingsGroup(title: "Tempové zóny v plavání") {
                ForEach(zones) { z in
                    if z.zone > 1 { SettingsDivider() }
                    ZoneRow(name: z.name, percent: nil, range: swimRange(z))
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

    private static func seconds(_ typed: String) -> Double? {
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
        original = changes
    }

    private var changes: JSONObject {
        [
            "ftp": .field(ftp), "lthr": .field(lthr), "maxHr": .field(maxHr),
            // "4:35" goes as text, the server reads m:ss.
            "runThresholdPace": runPace.trimmingCharacters(in: .whitespaces).isEmpty ? .null : .string(Self.paceForServer(runPace)),
            "runLthr": .field(runLthr),
            "powerZoneModel": .string(powerModel), "hrZoneModel": .string(hrModel), "paceZoneModel": .string(paceModel),
            "swimCss": swimCss.trimmingCharacters(in: .whitespaces).isEmpty ? .null : .string(swimCss.trimmingCharacters(in: .whitespaces)),
            "poolLength": Double(poolLength).map { .number($0) } ?? .null, "openWater": .string(openWater)
        ]
    }

    // MARK: Heart rate (the profile)

    /// The worked-out value shown in an empty field.
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
