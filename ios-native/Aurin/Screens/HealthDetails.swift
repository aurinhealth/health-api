import SwiftUI

// MARK: - Sleep

/// One night (concept 5, "Detail noci"): the arrows through the nights, the
/// night as an arc from bedtime to waking, three cells, the stages, the
/// index, tonight's need, the debt and three pages for more.
struct SleepDetailView: View {
    @Environment(AppModel.self) private var model
    let health: HealthSnapshot
    @State private var detail: NightDetail?
    @State private var failed = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: "Spánek",
                     coach: .sleep(line: health.sleep.night?.minutes.map { L10n.f("Dnes %@", Fmt.duration(Int($0))) }, date: health.date)) {
            SleepDetailContent(health: health, detail: detail, failed: failed, retry: { await load() },
                               loadNight: model.demo ? nil : { date in try? await model.api.night(date: date) })
        }
        .task {
            guard detail == nil, health.sleep.night != nil else { return }
            if model.demo { detail = DemoData.night; return }
            await load()
        }
    }

    private func load() async {
        do { detail = try await model.api.night(date: health.date); failed = false } catch { failed = true }
    }
}

struct SleepDetailContent: View {
    let health: HealthSnapshot
    let detail: NightDetail?
    /// The night's timeline didn't load: "Zkusit znovu" where the chart goes.
    var failed = false
    var retry: () async -> Void = {}
    /// An earlier night for the arrows; nil keeps the page on last night.
    var loadNight: ((String) async -> NightDetail?)? = nil

    /// The night shown, the morning's date; nil is last night.
    @State private var picked: String?
    @State private var earlier: [String: NightDetail] = [:]

    private var date: String { picked ?? health.date }
    private var isLast: Bool { picked == nil || picked == health.date }
    private var shownDetail: NightDetail? { isLast ? detail : earlier[date] }
    /// The 14 nights the arrows go through, the ones measured.
    private var nights: [String] {
        let list = (health.sleep.index?.nights.map(\.date) ?? []) + health.sleep.week.map(\.date) + [health.date]
        return Array(Set(list)).filter { $0 <= health.date }.sorted()
    }

    var body: some View {
        let sleep = health.sleep
        VStack(alignment: .leading, spacing: 0) {
            switcher.padding(.top, 8)
            if let night = summary {
                arc(night).padding(.top, 6)
                ThreeCells(cells: [("Usnutí", night.start ?? "–"), ("Probuzení", night.end ?? "–"), ("V posteli", night.inBed.map { TodayDials.length($0) } ?? "–")])
                    .padding(.top, 18)
                stages(night).padding(.top, 28)
                if let index = night.index {
                    HStack(alignment: .firstTextBaseline) {
                        SectionLabel(text: "Index spánku")
                        Spacer()
                        Text(verbatim: String(index)).font(Typo.number(26)).foregroundStyle(Palette.ink)
                    }
                    .padding(.top, 28)
                    // The usual range and one sentence (D-ZDRAVI-17).
                    Text(verbatim: Self.indexSentence(sleep.index)).font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    if isLast, let last = sleep.night, last.parts != nil {
                        Card { SleepIndexParts(night: last, wakeups: shownDetail?.night?.stats?.wakeups) }.padding(.top, 10)
                    }
                }
            } else if isLast {
                Text("Dnešní noc ještě není nahraná.").font(Typo.heading(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 16)
            } else if failed || loadNight == nil {
                Text("Tuhle noc se nepodařilo načíst.").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 16)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }

            if isLast {
                tonight(sleep.tonight).padding(.top, 28)
                if let debt = sleep.debt {
                    Card {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Spánkový dluh").font(.body).foregroundStyle(Palette.ink)
                                Text("za posledních 7 nocí").font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            Spacer()
                            Text(verbatim: TodayDials.length(Double(debt.minutes))).font(Typo.number(28)).foregroundStyle(Palette.ink)
                                .accessibilityLabel(Fmt.hoursMinutesSpoken(Double(debt.minutes)))
                        }
                    }
                    .padding(.top, 12)
                }
            }
            links.padding(.top, 12)
        }
    }

    // MARK: The night

    /// What the page shows of a night: last night from the snapshot, an
    /// earlier one from /app/api/night.
    struct Summary {
        let minutes: Double?
        let inBed: Double?
        let start: String?
        let end: String?
        /// Minutes from midnight of the evening (past midnight above 1440).
        let bed: Double?
        let wake: Double?
        let stages: HealthSnapshot.Stages?
        let index: Int?
    }

    private var summary: Summary? {
        let shown = shownDetail?.night
        if isLast, let night = health.sleep.night {
            return Summary(minutes: night.minutes, inBed: night.inBedMinutes,
                           start: ClockText.format(optional: night.start), end: ClockText.format(optional: night.end),
                           bed: shown?.bedClock, wake: shown?.wakeClock, stages: night.stages, index: night.index)
        }
        guard let night = shown, night.asleepMin != nil || night.segments?.isEmpty == false else { return nil }
        return Summary(minutes: night.asleepMin ?? Self.stages(night.segments)?.asleep, inBed: night.inBedMin,
                       start: night.bedClock.map { ClockText.format(minutes: Int($0.rounded()) % 1440) },
                       end: night.wakeClock.map { ClockText.format(minutes: Int($0.rounded()) % 1440) },
                       bed: night.bedClock, wake: night.wakeClock, stages: Self.stages(night.segments)?.stages,
                       index: health.sleep.index?.nights.first { $0.date == date }.map { Int($0.value.rounded()) })
    }

    /// The stages added up from the night's segments, for an earlier night.
    static func stages(_ segments: [NightDetail.Segment]?) -> (stages: HealthSnapshot.Stages, asleep: Double)? {
        guard let segments, !segments.isEmpty else { return nil }
        func total(_ type: String) -> Double { segments.filter { $0.type == type }.map { $0.e - $0.s }.reduce(0, +) }
        let stages = HealthSnapshot.Stages(deep: total("DEEP"), light: total("LIGHT"), rem: total("REM"), awake: total("AWAKE"))
        return (stages, stages.deep + stages.light + stages.rem)
    }

    /// "< NIGHT TO MON, NOV 9 >": the arrows through the 14 nights.
    private var switcher: some View {
        let list = nights, index = list.firstIndex(of: date)
        let before = index.flatMap { $0 > 0 ? list[$0 - 1] : nil }
        let after = index.flatMap { $0 + 1 < list.count ? list[$0 + 1] : nil }
        return HStack {
            arrow("chevron.left", to: before, label: "Předchozí noc")
            Spacer()
            Text(verbatim: L10n.f("Noc na %@", Self.dayName(date)).uppercased(with: Fmt.locale))
                .scaledFont(12, weight: .medium, cap: .denseCap).tracking(1.5).foregroundStyle(Palette.muted)
            Spacer()
            arrow("chevron.right", to: after, label: "Další noc")
        }
    }

    private func arrow(_ symbol: String, to night: String?, label: String) -> some View {
        Button {
            guard let night else { return }
            picked = night == health.date ? nil : night
            guard night != health.date, earlier[night] == nil, let loadNight else { return }
            Task { if let loaded = await loadNight(night) { earlier[night] = loaded } }
        } label: {
            Image(systemName: symbol).scaledFont(14, weight: .semibold, cap: .denseCap)
                .foregroundStyle(night == nil || loadNight == nil ? Palette.faint.opacity(0.5) : Palette.ink)
                .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                .frame(width: 44, height: 44).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(night == nil || loadNight == nil)
        .accessibilityLabel(L10n.tr(label))
    }

    /// "Mon, Nov 9" / "po 9. 11." for the morning the night ends on.
    static func dayName(_ iso: String) -> String {
        guard let day = ISODay.date(iso) else { return iso }
        return DateFormatters.make(L10n.isEnglish ? "EEE, MMM d" : "EEEEEE d. M.", locale: Fmt.locale, timeZone: TimeZone(identifier: "UTC")!, template: L10n.isEnglish).string(from: day)
    }

    /// The night as a green arc on a dial from 20:00 to 10:00, the times at
    /// its ends, the length and how far from the need in the middle.
    private func arc(_ night: Summary) -> some View {
        let from = 20.0 * 60, to = 34.0 * 60
        let band: ClosedRange<Double>? = {
            // Minutes after midnight, a time before noon counted into the next day as the server does.
            let late = { (m: Double) in m < 12 * 60 ? m + 24 * 60 : m }
            guard let bed = night.bed.map(late), let wake = night.wake.map(late), wake > bed else { return nil }
            return min(max(bed, from), to)...min(max(wake, from), to)
        }()
        let need = Double(health.sleep.need)
        let gap = night.minutes.map { Int((need - $0).rounded()) }
        let note: String? = gap.map { g in
            g > 0 ? L10n.f("o %@ méně než %@", Fmt.duration(g), TodayDials.length(need))
                : g < 0 ? L10n.f("o %@ víc než %@", Fmt.duration(-g), TodayDials.length(need)) : L10n.f("přesně %@", TodayDials.length(need))
        }
        return RangeDial(value: nil, scale: from...to, band: band, bandColor: Palette.green, ends: (ClockText.format(minutes: 20 * 60), ClockText.format(minutes: 10 * 60)), size: 220,
                         spoken: [L10n.tr("Spánek"), Fmt.hoursMinutesSpoken(night.minutes), note].compactMap { $0 }.joined(separator: ", ")) {
            VStack(spacing: 2) {
                Text("Spánek").font(Typo.caption).foregroundStyle(Palette.muted)
                Text(verbatim: night.minutes.map { Fmt.hoursMinutesLong($0) } ?? "–").font(Typo.number(36)).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if let note { Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            .padding(.horizontal, 30)
        }
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) {
            // The night's own times at the ends of its arc.
            HStack {
                Text(verbatim: night.start ?? "")
                Spacer()
                Text(verbatim: night.end ?? "")
            }
            .font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.muted)
            .frame(width: 250)
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func stages(_ night: Summary) -> some View {
        if let stages = night.stages {
            SectionLabel(text: "Fáze spánku")
            Card {
                if failed && shownDetail == nil && isLast {
                    RetryRow(message: "Průběh noci se nepodařilo načíst.", retry: retry)
                } else if let segments = shownDetail?.night?.segments, !segments.isEmpty {
                    Hypnogram(segments: segments)
                    HStack {
                        Text(verbatim: night.start ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                        Spacer()
                        Text(verbatim: night.end ?? "").font(Typo.tiny).foregroundStyle(Palette.faint)
                    }
                    .padding(.leading, 56)
                }
                StageTotals(stages: stages, wakeups: shownDetail?.night?.stats?.wakeups, usual: isLast ? health.sleep.night?.usual : nil)
            }
            .padding(.top, 10)
        } else if failed && isLast && shownDetail == nil {
            RetryRow(message: "Průběh noci se nepodařilo načíst.", retry: retry)
        }
    }

    // MARK: Tonight and more

    /// Tonight's need: the number, when to be in bed and the alarm, and the
    /// planner. Why the need is what it is lives in the planner (D-ZDRAVI-17).
    private func tonight(_ t: HealthSnapshot.Tonight) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                SectionLabel(text: "Dnešní potřeba spánku")
                Text(verbatim: TodayDials.length(Double(t.sleep ?? t.need))).font(Typo.number(40)).foregroundStyle(Palette.ink)
                if let line = Self.bedLine(t) {
                    Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            RouteLink(route: .sleepSettings) {
                HStack {
                    Text("Naplánovat noc").font(.body).foregroundStyle(Palette.ink)
                    Spacer()
                    Text("večerka a budík").font(Typo.caption).foregroundStyle(Palette.muted)
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
        }
    }

    /// "in bed by 23:10, alarm at 06:40".
    static func bedLine(_ t: HealthSnapshot.Tonight) -> String? {
        guard let bed = t.bedtime.flatMap({ ClockText.format(optional: $0) }) else { return nil }
        guard let wake = t.wake.flatMap({ ClockText.format(optional: $0) }) else { return L10n.f("v posteli do %@", bed) }
        return L10n.f("v posteli do %@, budík v %@", bed, wake)
    }

    /// Heart rate in sleep, the index over 14 nights and the regularity, each its own page.
    private var links: some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                // Only a night whose heart rate covers most of it: a few minutes
                // drew one spike at the left edge (device comparison point 57).
                if let night = shownDetail?.night, let hr = night.hr, hr.count > 3,
                   (hr.last?.m ?? 0) - (hr.first?.m ?? 0) >= 0.5 * SleepHeartRate.end(night) {
                    NavigationLink { SleepHeartRateView(health: health, night: night) } label: {
                        linkRow("Tep ve spánku", note: L10n.f("průměr %@ bpm", Fmt.int(night.stats?.avgHr)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("open.sleepHeartRate")
                    Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 16)
                }
                if let index = health.sleep.index, index.nights.count >= 2 {
                    NavigationLink {
                        DetailScreen(glow: Palette.Glow.today, title: "Index spánku") {
                            Card { SleepIndexNights(index: index, date: health.date) }.padding(.top, 24)
                        }
                    } label: {
                        linkRow("Index spánku", note: L10n.f("průměr %@ za 14 nocí", String(index.average)))
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 16)
                }
                if let reg = health.sleep.regularity, !reg.nights.isEmpty {
                    let usual = RegularityChart.usual(reg.nights)
                    NavigationLink {
                        DetailScreen(glow: Palette.Glow.today, title: "Pravidelnost") {
                            Text(Fmt.oneStop(L10n.f("Usínáš obvykle mezi %@ a %@.", RegularityChart.clock(usual - RegularityChart.band), RegularityChart.clock(usual + RegularityChart.band))))
                                .font(Typo.sentence(18)).foregroundStyle(Palette.secondary).padding(.top, 24)
                            Card { RegularityChart(nights: reg.nights) }.padding(.top, 14)
                        }
                    } label: {
                        linkRow("Pravidelnost", note: L10n.f("obvykle usínáš kolem %@", RegularityChart.clock(usual)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func linkRow(_ title: String, note: String) -> some View {
        HStack {
            Text(LocalizedStringKey(title)).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }

    /// "Usual 75 to 83. The index is the night's length, quality and stages, out of 100."
    static func indexSentence(_ index: HealthSnapshot.IndexNights?) -> String {
        let what = L10n.tr("Index skládá délku, kvalitu a fáze noci do čísla ze 100.")
        guard let low = index?.low, let high = index?.high else { return what }
        return L10n.f("Obvykle %@ až %@.", Fmt.int(low), Fmt.int(high)) + " " + what
    }
}

struct ThreeCells: View {
    let cells: [(String, String)]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(cells.indices, id: \.self) { i in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(width: 1) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(cells[i].0).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(cells[i].1).font(Typo.number(26)).foregroundStyle(Palette.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, i > 0 ? 14 : 0)
                .padding(.vertical, 14)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }
}

struct StatRow: View {
    let title: String
    let value: String
    var unit: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
            if let unit { Text(unit).font(Typo.small).foregroundStyle(Palette.faint) }
        }
        .padding(.vertical, 13)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}

enum StageStyle {
    static let order = ["AWAKE", "REM", "LIGHT", "DEEP"]
    static let labels = ["AWAKE": "Bdění", "REM": "REM", "LIGHT": "Lehký", "DEEP": "Hluboký"]
    static func color(_ type: String) -> Color {
        switch type {
        // Greens as concept 5 (Petr 2026-11-20: no purple on Today's pages).
        case "DEEP": return Color(light: 0x1F6B52, dark: 0x8FE6C4)
        case "LIGHT": return Color(light: 0xB9DCCB, dark: 0x3E6B5A)
        case "REM": return Color(light: 0x5FA585, dark: 0x5FC79E)
        default: return Color(light: 0xE0A46A, dark: 0xE0A46A)
        }
    }
}

/// Stages through the night, one row per stage.
struct Hypnogram: View {
    let segments: [NightDetail.Segment]

    var body: some View {
        let end = max(segments.map(\.e).max() ?? 1, 1)
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(StageStyle.order, id: \.self) { type in
                    Text(StageStyle.labels[type] ?? type).font(Typo.tiny).foregroundStyle(Palette.muted).frame(height: 22, alignment: .leading)
                }
            }
            .frame(width: 48, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    ForEach(segments.indices, id: \.self) { i in
                        let s = segments[i], row = CGFloat(StageStyle.order.firstIndex(of: s.type) ?? 2)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(StageStyle.color(s.type))
                            .frame(width: max(1.5, geo.size.width * (s.e - s.s) / end), height: 16)
                            .offset(x: geo.size.width * s.s / end, y: row * 22 + 3)
                    }
                }
            }
            .frame(height: 88)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fáze spánku během noci")
    }
}

/// The night's stages one under the other: a bar of each one's share of the
/// sleep, the time and the percentage, and the awakenings.
struct StageTotals: View {
    let stages: HealthSnapshot.Stages
    let wakeups: Int?
    /// "obvykle 15–20 %" under deep and REM sleep, from the user's own nights.
    var usual: HealthSnapshot.UsualStages? = nil

    var body: some View {
        let asleep = max(stages.deep + stages.light + stages.rem, 1)
        let longest = max(stages.deep, stages.light, stages.rem, stages.awake, 1)
        VStack(spacing: 12) {
            row("DEEP", "Hluboký", stages.deep, share: stages.deep / asleep, longest: longest)
            if let range = usual?.deep { usually(range) }
            row("REM", "REM", stages.rem, share: stages.rem / asleep, longest: longest)
            if let range = usual?.rem { usually(range) }
            row("LIGHT", "Lehký", stages.light, share: stages.light / asleep, longest: longest)
            row("AWAKE", "Bdění", stages.awake, share: nil, longest: longest)
        }
        .padding(.top, 6)
    }

    private func row(_ type: String, _ label: String, _ minutes: Double, share: Double?, longest: Double) -> some View {
        HStack(spacing: 10) {
            Text(label).font(Typo.small).foregroundStyle(Palette.secondary).frame(width: 64, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(StageStyle.color(type)).frame(width: max(6, Double(geo.size.width) * minutes / longest))
                }
            }
            .frame(height: 10)
            Text(Fmt.hoursMinutesLong(minutes)).font(Typo.number(18)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8).frame(width: 62, alignment: .trailing)
            Text(Self.note(share: share, wakeups: wakeups)).font(Typo.caption).foregroundStyle(Palette.muted)
                .frame(width: 40, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(label) + " " + Fmt.hoursMinutesSpoken(minutes) + ", " + Self.note(share: share, wakeups: wakeups))
    }

    /// Under the stage's bar: the middle half of the user's nights. Words, no
    /// colour: a share outside it is no verdict (stages are the least precise).
    private func usually(_ range: HealthSnapshot.UsualStages.Range) -> some View {
        Text(L10n.f("obvykle %@–%@", String(range.low), String(range.high) + Fmt.percentSign))
            .font(Typo.caption).foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 74)
            .padding(.top, -8)
    }

    /// "19 %", or the awakenings for the awake row ("3×").
    static func note(share: Double?, wakeups: Int?) -> String {
        if let share { return Fmt.int(share * 100) + Fmt.percentSign }
        return wakeups.map { "\($0)×" } ?? ""
    }
}

/// "Z čeho se skládá index": length against the need, quality and the share
/// of deep and REM sleep, each with the night's own values and a bar for how
/// full the part is (src/recovery-model.js sleepIndexParts). No points and no
/// good or bad: the parts don't always add up (a night without stages is
/// rescaled). A device's own score has no parts, only the note.
struct SleepIndexParts: View {
    let night: HealthSnapshot.Night
    let wakeups: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let parts = night.parts {
                part("Délka", value: L10n.f("%@ z %@", Fmt.hoursMinutesLong(parts.length.minutes), Fmt.hoursMinutesLong(parts.length.need)),
                     note: L10n.tr("spánek proti potřebě na minulou noc"), fill: parts.length.fill, first: true,
                     spoken: L10n.f("%@ z %@", Fmt.hoursMinutesSpoken(parts.length.minutes), Fmt.hoursMinutesSpoken(parts.length.need)))
                part("Kvalita", value: L10n.f("efektivita %@", String(parts.quality.efficiency) + Fmt.percentSign),
                     note: qualityNote(parts.quality), fill: parts.quality.fill)
                if let stages = parts.stages {
                    part("Fáze", value: L10n.f("%@ spánku", String(stages.share) + Fmt.percentSign),
                         note: L10n.tr("hluboký a REM spánek dohromady"), fill: stages.fill)
                }
                Text(verbatim: L10n.tr(parts.stages == nil
                     ? "Index 0–100: délka proti tvé potřebě a kvalita. Tahle noc nemá fáze, tak se počítá jen z nich."
                     : "Index 0–100: délka proti tvé potřebě, kvalita a podíl hlubokého a REM spánku. Fáze váží nejméně, hodinky je měří nejméně přesně."))
                    .font(Typo.small).foregroundStyle(Palette.secondary).padding(.top, 16)
            } else {
                Text("Index téhle noci spočítalo tvoje zařízení, Aurin k němu nemá části.")
                    .font(Typo.small).foregroundStyle(Palette.secondary)
            }
        }
    }

    /// "usnutí za 9 min, probuzení 3×, 22 min vzhůru", whatever the night has.
    private func qualityNote(_ q: HealthSnapshot.IndexParts.Quality) -> String {
        var bits: [String] = []
        if let latency = q.latency ?? night.latencyMinutes { bits.append(L10n.f("usnutí za %@ min", Fmt.int(latency))) }
        if let wakeups { bits.append(L10n.f("probuzení %@×", String(wakeups))) }
        if let awake = q.waso ?? night.stages?.awake { bits.append(L10n.f("%@ min vzhůru", Fmt.int(awake))) }
        return bits.isEmpty ? L10n.tr("čas v posteli, kdy spíš") : bits.joined(separator: ", ")
    }

    private func part(_ title: String, value: String, note: String, fill: Double, first: Bool = false, spoken: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text(verbatim: value).font(.body).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            Text(verbatim: note).font(Typo.small).foregroundStyle(Palette.secondary)
            ProgressLine(fraction: fill, color: Palette.Status.good).padding(.top, 8)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Palette.hairline).frame(height: 1) } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(title) + ", " + (spoken ?? value) + ", " + note)
    }
}

/// "Posledních 14 nocí": a sentence on last night against the usual range,
/// then the index of each night as a dot on a 40–100 scale (lower when a night
/// is under 40), a thin line between neighbouring nights and a gap for a night
/// not measured, the usual range (the middle half of the nights before the
/// rated one, server) as a band with dashed edges and a letter for each day
/// (chart review 1: bars from 40 made 57 against 68 look twice as much).
struct SleepIndexNights: View {
    let index: HealthSnapshot.IndexNights
    let date: String
    static let slots = 14

    private struct Mark: Identifiable {
        let slot: Int
        let value: Double
        var id: Int { slot }
    }

    /// The 14 days up to `date`, oldest first.
    private var days: [String] { (0..<Self.slots).map { ISODay.shift(date, $0 - (Self.slots - 1)) } }

    var body: some View {
        let byDate = Dictionary(index.nights.map { ($0.date, $0.value) }, uniquingKeysWith: { a, _ in a })
        let marks = days.enumerated().compactMap { i, d in byDate[d].map { Mark(slot: i, value: $0) } }
        let lowest = index.nights.map(\.value).min() ?? 40
        let lo = max(0, min(40, ((lowest - 5) / 10).rounded(.down) * 10))
        let height: CGFloat = 120
        VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: summary).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            GeometryReader { geo in
                let w = geo.size.width - scaleWidth, step = w / CGFloat(Self.slots)
                let y: (Double) -> CGFloat = { height * (1 - CGFloat((min(max($0, lo), 100) - lo) / (100 - lo))) }
                let x: (Int) -> CGFloat = { step * (CGFloat($0) + 0.5) }
                ZStack(alignment: .topLeading) {
                    ChartScale(ticks: [50.0, 75, 100].filter { $0 > lo }.map { ScaleTick(value: $0, text: Fmt.int($0)) }, width: w, y: y)
                    if let low = index.low, let high = index.high {
                        Rectangle().fill(Palette.Status.good.opacity(0.2))
                            .frame(width: w, height: max(2, y(low) - y(high)))
                            .offset(y: y(high))
                        ForEach([low, high], id: \.self) { edge in
                            DashedLine().stroke(Palette.Status.good.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                                .frame(width: w, height: 1)
                                .offset(y: y(edge))
                        }
                    }
                    // A line only between nights next to each other: a missing night stays a gap.
                    Path { p in
                        for (a, b) in zip(marks, marks.dropFirst()) where b.slot == a.slot + 1 {
                            p.move(to: CGPoint(x: x(a.slot), y: y(a.value)))
                            p.addLine(to: CGPoint(x: x(b.slot), y: y(b.value)))
                        }
                    }
                    .stroke(Palette.Status.good.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    ForEach(marks) { m in
                        let last = m.id == marks.last?.id
                        Circle().fill(last ? Palette.Status.good : Palette.Status.good.opacity(0.6))
                            .frame(width: last ? 11 : 6, height: last ? 11 : 6)
                            .position(x: x(m.slot), y: y(m.value))
                        if last {
                            Text(verbatim: Fmt.int(m.value))
                                .scaledFont(chartText, weight: .semibold, cap: .denseCap)
                                .foregroundStyle(Palette.ink)
                                .fixedSize()
                                .position(x: x(m.slot) - 16, y: y(m.value))
                        }
                    }
                }
                .frame(width: geo.size.width, height: height, alignment: .topLeading)
            }
            .frame(height: height)
            HStack(spacing: 0) {
                ForEach(days, id: \.self) { d in
                    Text(verbatim: String(Fmt.weekdayShort(d).prefix(1)))
                        .scaledFont(chartText, cap: .denseCap)
                        .foregroundStyle(Palette.faint)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.trailing, scaleWidth)
            HStack(spacing: 14) {
                if let low = index.low, let high = index.high {
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 2).fill(Palette.Status.good.opacity(0.3)).frame(width: 14, height: 6)
                        Text(verbatim: L10n.f("obvyklé rozmezí %@–%@", Fmt.int(low), Fmt.int(high))).font(Typo.tiny).foregroundStyle(Palette.muted)
                    }
                }
                HStack(spacing: 5) {
                    Circle().fill(Palette.Status.good).frame(width: 7, height: 7)
                    Text("poslední noc").font(Typo.tiny).foregroundStyle(Palette.muted)
                }
            }
            Text(verbatim: L10n.f("Změřeno %@ ze %@ nocí", String(marks.count), String(Self.slots)))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary + " " + L10n.f("Index spánku za posledních %@ nocí, průměr %@.", String(marks.count), String(index.average)))
    }

    /// "Last night 61, in your usual range of 57–68.", above or below it, or
    /// that the range needs 7 nights first.
    var summary: String {
        guard let last = index.nights.last else { return "" }
        let value = Fmt.int(last.value)
        let night = last.date == date ? L10n.f("Poslední noc %@", value) : L10n.f("Noc na %@: %@", Fmt.dayMonth(last.date), value)
        guard let low = index.low, let high = index.high else { return night + ". " + L10n.tr("Tvoje obvyklé rozmezí se ukáže po 7 nocích.") }
        switch RangeBar.side(last.value, low, high) {
        case 1: return L10n.f("%@, nad tvým obvyklým rozmezím %@–%@.", night, Fmt.int(low), Fmt.int(high))
        case -1: return L10n.f("%@, pod tvým obvyklým rozmezím %@–%@.", night, Fmt.int(low), Fmt.int(high))
        default: return L10n.f("%@, v tvém obvyklém rozmezí %@–%@.", night, Fmt.int(low), Fmt.int(high))
        }
    }
}

// MARK: - Weight

/// Log weight ("+", Health → Weight; concept 14-plus): the last weigh-in to
/// start from, − and + by 0.1, a tap on the number types it.
struct WeightEntrySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    /// The last weigh-in, kg, and its day (Health), the starting number.
    private var last: (kg: Double, date: String)? {
        // Health may not have loaded yet when "+" opens this from Today.
        model.health?.weight.map { (kg: $0.latest, date: $0.date) }
            ?? model.today?.weight.flatMap { w in w.series.last.map { (kg: w.latest, date: $0.date) } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center) {
                Text("Zapsat váhu").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
            }
            // − and + by 0.1 (held, they repeat); a tap on the number types it (D-PLUS-3).
            HStack(alignment: .center, spacing: 12) {
                stepButton(-1)
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    TextField(placeholder, text: $text)
                        .keyboardType(.decimalPad)
                        .font(Typo.number(64))
                        .multilineTextAlignment(.center)
                        .fixedSize()
                        .focused($focused)
                        .foregroundStyle(Palette.ink)
                        .accessibilityLabel(Text("Váha"))
                        .accessibilityIdentifier("weight.value")
                    Text(Units.weightUnit).font(Typo.body).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 0)
                stepButton(1)
            }
            if let last {
                Text(L10n.f("Poslední záznam %@, %@", Units.weightText(last.kg), Self.when(last.date)))
                    .font(Typo.small).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                .disabled(saving || value == nil)
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.height(340), .medium])
        .glassSheetBackground()
        .onAppear {
            // The last weigh-in to start from; nothing yet: type it.
            if text.isEmpty, let last { text = Fmt.decimal((Units.weight(last.kg) * 10).rounded() / 10) } else if last == nil { focused = true }
        }
    }

    private func stepButton(_ direction: Double) -> some View {
        Button { step(direction) } label: {
            Image(systemName: direction < 0 ? "minus" : "plus").scaledFont(18, weight: .semibold, cap: .denseCap)
                .foregroundStyle(Palette.ink)
                .frame(width: 48, height: 48)
                .background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(L10n.tr(direction < 0 ? "Snížit váhu" : "Zvýšit váhu"))
    }

    private func step(_ direction: Double) {
        let shown = Double(text.replacingOccurrences(of: ",", with: ".")) ?? last.map { Units.weight($0.kg) } ?? (Units.imperial ? 180 : 80)
        text = Fmt.decimal(((shown + direction * 0.1) * 10).rounded() / 10)
    }

    /// "on Tuesday" within the week, else the date.
    static func when(_ date: String) -> String {
        let today = AppModel.localDate(Date())
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let a = f.date(from: today), let b = f.date(from: date) else { return date }
        let days = Int((a.timeIntervalSince(b) / 86400).rounded())
        if days == 0 { return L10n.tr("dnes") }
        if days == 1 { return L10n.tr("včera") }
        return days < 7 ? Fmt.onWeekday(date) : Fmt.dayMonth(date)
    }

    private var placeholder: String {
        Fmt.decimal(Units.imperial ? 181.7 : 82.4)
    }

    /// The typed weight in kg (typed in lb with imperial units).
    private var value: Double? {
        guard let shown = Double(text.replacingOccurrences(of: ",", with: ".")) else { return nil }
        let v = Units.kg(shown)
        guard LogWeightIntent.range.contains(v) else { return nil }
        return v
    }

    private func save() async {
        guard let value else { return }
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        do {
            // Without signal the weigh-in waits on the phone (AppModel outbox).
            try await model.addWeight(kg: value)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Pravidelnost (Petr's design of 2026-10-17): one row per night with a dot
/// at the time of falling asleep on an hourly axis; the band is the usual
/// time ± 30 min. A dot in the band is green, outside it amber, earlier or
/// later alike. Sliding a finger over the chart shows the exact time there.
struct RegularityChart: View {
    /// Bedtime as minutes after 18:00 (src/app-health.js regularity).
    let nights: [Point]
    @State private var scrub: Double?

    static let band: Double = 30
    private static let rowHeight: CGFloat = 30
    private static let dayWidth: CGFloat = 30
    private static let timeWidth: CGFloat = 70
    /// Room above the rows for the time under the finger.
    private static let bubble: CGFloat = 30

    static func usual(_ nights: [Point]) -> Double {
        nights.map(\.value).reduce(0, +) / Double(max(nights.count, 1))
    }
    /// Minutes after 18:00 → the phone's clock.
    static func clock(_ minutes: Double) -> String { ClockText.format(minutes: Int(minutes.rounded()) + 18 * 60) }

    /// Where a time sits across the plot.
    private struct Scale {
        let lo: Double
        let hi: Double
        let x0: CGFloat
        let width: CGFloat
        func x(_ minutes: Double) -> CGFloat { x0 + CGFloat((minutes - lo) / (hi - lo)) * width }
        func minutes(_ x: CGFloat) -> Double { lo + Double((x - x0) / width) * (hi - lo) }
    }

    private var usual: Double { Self.usual(nights) }
    private var plotHeight: CGFloat { Self.rowHeight * CGFloat(nights.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GeometryReader { geo in
                plot(scale(geo.size.width), width: geo.size.width)
            }
            .frame(height: Self.bubble + plotHeight + 26)
            VStack(alignment: .leading, spacing: 7) {
                legend(Palette.green, "V obvyklém čase")
                legend(Palette.amber, "Dřív nebo později než obvykle")
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.oneStop(L10n.f("Usínáš obvykle mezi %@ a %@.", Self.clock(usual - Self.band), Self.clock(usual + Self.band))))
    }

    private func scale(_ width: CGFloat) -> Scale {
        let values = nights.map(\.value) + [usual - Self.band, usual + Self.band]
        let lo = ((values.min() ?? 0) / 60).rounded(.down) * 60
        let hi = max(lo + 120, ((values.max() ?? 0) / 60).rounded(.up) * 60)
        return Scale(lo: lo, hi: hi, x0: Self.dayWidth + 8, width: max(1, width - Self.dayWidth - Self.timeWidth - 16))
    }

    private func plot(_ scale: Scale, width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            // A label every hour only where they fit: at least 46 pt apart
            // ("11:00 PM2:00 AM" ran together, device comparison point 58).
            let every = max(1, Int((46 / max(scale.width * 60 / CGFloat(scale.hi - scale.lo), 1)).rounded(.up)))
            ForEach(Array(stride(from: scale.lo, through: scale.hi, by: 60).enumerated()), id: \.element) { i, hour in
                hourLine(hour, scale, label: i % every == 0)
            }
            ForEach(Array(nights.enumerated()), id: \.offset) { index, night in
                nightRow(night, y: Self.bubble + Self.rowHeight * (CGFloat(index) + 0.5), scale: scale, width: width)
            }
            if let scrub { scrubMark(scrub, scale) }
        }
        .frame(width: width, height: Self.bubble + plotHeight + 26, alignment: .topLeading)
        .contentShape(Rectangle())
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { drag in
                let m = min(max(scale.minutes(drag.location.x), scale.lo), scale.hi)
                scrub = (m / 5).rounded() * 5
            }
            .onEnded { _ in scrub = nil })
    }

    private func hourLine(_ hour: Double, _ scale: Scale, label: Bool) -> some View {
        let x = scale.x(hour)
        return ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: x, y: Self.bubble))
                p.addLine(to: CGPoint(x: x, y: Self.bubble + plotHeight))
            }
            .stroke(Palette.hairline, style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
            if label {
                Text(ClockText.format(minutes: Int(hour) + 18 * 60)).font(.caption2).foregroundStyle(Palette.faint)
                    .fixedSize()
                    .position(x: x, y: Self.bubble + plotHeight + 12)
            }
        }
    }

    private func nightRow(_ night: Point, y: CGFloat, scale: Scale, width: CGFloat) -> some View {
        let inside = abs(night.value - usual) <= Self.band
        let left = scale.x(usual - Self.band), right = scale.x(usual + Self.band)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(Palette.greenSoft)
                .frame(width: right - left, height: Self.rowHeight - 6)
                .position(x: (left + right) / 2, y: y)
            Path { p in
                p.move(to: CGPoint(x: scale.x0, y: y))
                p.addLine(to: CGPoint(x: scale.x0 + scale.width, y: y))
            }
            .stroke(Palette.hairline, lineWidth: 1)
            Text(Fmt.weekdayShort(night.date)).font(Typo.caption).foregroundStyle(Palette.muted)
                .frame(width: Self.dayWidth, alignment: .leading)
                .position(x: Self.dayWidth / 2, y: y)
            Circle().fill(inside ? Palette.green : Palette.amber).frame(width: 12, height: 12)
                .position(x: scale.x(night.value), y: y)
            Text(Self.clock(night.value)).font(Typo.small).foregroundStyle(inside ? Palette.secondary : Palette.amber)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(width: Self.timeWidth, alignment: .trailing)
                .position(x: width - Self.timeWidth / 2, y: y)
        }
    }

    private func scrubMark(_ minutes: Double, _ scale: Scale) -> some View {
        let x = scale.x(minutes)
        return ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: x, y: Self.bubble - 2))
                p.addLine(to: CGPoint(x: x, y: Self.bubble + plotHeight))
            }
            .stroke(Palette.ink.opacity(0.85), lineWidth: 1.5)
            Text(Self.clock(minutes)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.card)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Palette.ink, in: Capsule())
                .fixedSize()
                .position(x: min(max(x, scale.x0 + 34), scale.x0 + scale.width - 34), y: Self.bubble / 2 - 2)
        }
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(L10n.tr(text)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}
