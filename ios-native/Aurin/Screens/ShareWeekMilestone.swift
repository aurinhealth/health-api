import SwiftUI

// MARK: - Týden and Milník: data

/// One week for Týden (src/share-week.js): per day the readiness, the main
/// sport and the training time, the totals and the week before.
struct ShareWeek: Decodable, Equatable {
    static let rows = ["Trénink", "Zátěž", "Tréninky", "Kolo", "Běh", "Spánek", "Připravenost"]

    struct Day: Decodable, Equatable {
        var date: String
        var readiness: Double?
        var zone: String?
        var sport: String?
        var minutes: Double?
        var sessions: Int = 0
        var tss: Double?
    }

    struct Totals: Decodable, Equatable {
        var minutes: Double?
        var sessions: Int = 0
        var tss: Double?
        var rideKm: Double?
        var runKm: Double?
        var sleepMinutes: Double?
        var readiness: Double?
    }

    var start: String
    var end: String
    var today: String?
    var days: [Day]
    var week: Totals
    var previous: Totals

    /// A number of the week by its row in Upravit: the text, its unit and the raw value.
    static func value(_ key: String, _ t: Totals) -> (value: String, unit: String, raw: Double)? {
        switch key {
        case "Trénink":
            guard let m = t.minutes, m > 0 else { return nil }
            return (Fmt.hoursMinutes(m), "h", m)
        case "Zátěž":
            guard let v = t.tss, v > 0 else { return nil }
            return (Fmt.int(v), "TSS", v)
        case "Tréninky":
            guard t.sessions > 0 else { return nil }
            return (String(t.sessions), "", Double(t.sessions))
        case "Kolo", "Běh":
            guard let km = key == "Kolo" ? t.rideKm : t.runKm, km > 0 else { return nil }
            let shown = Units.distance(km)
            return (Fmt.decimal(shown, digits: shown < 100 ? 1 : 0), Units.distanceUnit, km)
        case "Spánek":
            guard let m = t.sleepMinutes, m > 0 else { return nil }
            return (Fmt.hoursMinutes(m), "h", m)
        case "Připravenost":
            guard let v = t.readiness else { return nil }
            return (Fmt.int(v), "", v)
        default:
            return nil
        }
    }

    /// "+1:05 h", "+74", "−4": this week against the one before.
    static func delta(_ key: String, now: Double, before: Double) -> String {
        let d = now - before
        switch key {
        case "Trénink", "Spánek":
            return (d < 0 ? "−" : "+") + Fmt.hoursMinutes(abs(d)) + (key == "Trénink" ? " h" : "")
        case "Kolo", "Běh":
            return Fmt.signed(Units.distance(d))
        default:
            return Fmt.signed(d)
        }
    }

    static func tone(_ key: String) -> ShareMetric.Tone {
        switch key {
        case "Zátěž", "Kolo": return .amber
        case "Běh", "Připravenost": return .green
        case "Spánek": return .indigo
        default: return .ink
        }
    }
}

/// The round numbers reached since joining Aurin (src/share-milestone.js) and
/// the power record from Intervals.icu.
struct ShareMilestones: Decodable, Equatable {
    static let rows = ["Graf", "Tréninky", "Čas", "Převýšení"]

    struct Bar: Decodable, Equatable {
        var date: String
        var value: Double?
    }

    struct Item: Decodable, Equatable, Identifiable {
        /// ride, run, gym or streak.
        var key: String
        var value: Double
        var total: Double?
        var since: String?
        var reachedOn: String?
        var sessions: Int?
        var minutes: Double?
        var elevation: Double?
        var bars: [Bar] = []
        /// How far the sessions before the bars got.
        var start: Double?
        var id: String { key }
    }

    struct Point: Decodable, Equatable {
        var seconds: Double
        var watts: Double
    }

    struct Record: Decodable, Equatable {
        var isNew: Bool
        var seconds: Double
        var watts: Double
        var previous: Double?
        var curve: [Point] = []
        var previousCurve: [Point] = []
    }

    var today: String?
    var items: [Item] = []
    var record: Record?

    var isEmpty: Bool { items.isEmpty && record == nil }

    /// The one chosen in Upravit, else the newest.
    func item(_ key: String?) -> Item? { items.first { $0.key == key } ?? items.first }
}

extension APIClient {
    func shareWeek(date: String) async throws -> ShareWeek {
        try await get("/app/api/share/week?date=" + date)
    }

    func shareMilestones() async throws -> ShareMilestones {
        try await get("/app/api/share/milestones")
    }
}

extension ShareMilestones.Item {
    var isDistance: Bool { key == "ride" || key == "run" }

    /// The chip in Upravit.
    var title: String {
        ["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "streak": "Dny v řadě"][key] ?? key
    }

    /// "1 000" (in miles with imperial units).
    var number: String { Fmt.int(isDistance ? Units.distance(value) : value) }

    /// "kilometrů na kole", "tréninků v posilovně", "dní v řadě".
    var noun: String {
        let n = Int(value.rounded())
        switch key {
        case "ride": return L10n.tr(Units.imperial ? "mil na kole" : "kilometrů na kole")
        case "run": return L10n.tr(Units.imperial ? "naběhaných mil" : "naběhaných kilometrů")
        case "gym": return L10n.plural("tréninků v posilovně", n)
        default: return L10n.plural("dní v řadě", n)
        }
    }

    /// "od 12. června", nil without the day.
    var sinceText: String? {
        guard let since, since.count == 10 else { return nil }
        return L10n.f("od %@", ShareText.dayMonth(since))
    }

    /// Under the big number of Cesta: "na kole od 12. června".
    var pathText: String {
        let what: String
        switch key {
        case "ride": what = L10n.tr("na kole")
        case "run": what = L10n.tr("naběháno")
        default: what = noun
        }
        return [what, sinceText].compactMap { $0 }.joined(separator: " ")
    }

    /// The numbers under the poster by their row in Upravit.
    func stat(_ row: String) -> ShareStat? {
        switch row {
        case "Tréninky":
            guard let sessions, sessions > 0 else { return nil }
            let label = key == "ride" ? "Jízdy" : key == "run" ? "Běhy" : "Tréninky"
            return ShareStat(label: label, value: String(sessions), unit: "")
        case "Čas":
            guard let minutes, minutes > 0 else { return nil }
            return minutes < 600 ? ShareStat(label: "Čas", value: Fmt.hoursMinutes(minutes), unit: "h")
                : ShareStat(label: "Čas", value: Fmt.int(minutes / 60), unit: "h")
        case "Převýšení":
            guard isDistance, let elevation, elevation >= 1 else { return nil }
            return Units.imperial ? ShareStat(label: "Převýšení", value: Fmt.int(elevation * 3.28084), unit: "ft")
                : ShareStat(label: "Převýšení", value: Fmt.int(elevation), unit: "m")
        default:
            return nil
        }
    }

    /// The way there: where it started, then the total after each bar.
    var path: [Double] {
        var sum = start ?? 0
        var out = [sum]
        for bar in bars {
            sum += bar.value ?? 0
            out.append(sum)
        }
        return out
    }
}

extension ShareMilestones.Record {
    /// "20 minut", "5 sekund", "1 hodina".
    static func duration(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        if s < 60 { return L10n.plural("%lld sekund", s) }
        if s < 3600 { return L10n.plural("%lld minut", s / 60) }
        return L10n.plural("%lld hodin", s / 3600)
    }

    /// The axis under the curve: "5 s", "1 min", "1 h".
    static func short(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        if s < 60 { return "\(s) s" }
        if s < 3600 { return "\(s / 60) min" }
        return "\(s / 3600) h"
    }
}

// MARK: - Týden: the image

struct ShareWeekCard: View {
    let week: ShareWeek
    let options: ShareOptions
    let s: ShareStyle

    var body: some View {
        switch options.variant {
        case 1: rings
        case 2: numbers
        case 3: compare
        default: days
        }
    }

    private var range: String { ShareText.range(week.start, week.end) }

    private func future(_ day: ShareWeek.Day) -> Bool {
        guard let today = week.today else { return false }
        return day.date > today
    }

    private func zoneColor(_ zone: String?) -> Color {
        switch zone {
        case "yellow": return s.t.amber
        case "red": return s.t.rust
        case "green": return s.t.green
        default: return s.t.muted
        }
    }

    /// A: each day with its readiness, sport and time.
    private var days: some View {
        let u = s.u
        let longest = max(1, week.days.compactMap(\.minutes).max() ?? 1)
        let heads = ["Trénink", "Zátěž"].filter { options.shows($0) }.compactMap { key -> ShareStat? in
            ShareWeek.value(key, week.week).map { ShareStat(label: key, value: $0.value, unit: $0.unit) }
        }
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(range)
            s.title(L10n.tr("Týden")).padding(.top, u * 8)
            if !heads.isEmpty {
                HStack(spacing: u * 9) {
                    ForEach(heads) { s.number($0.label, $0.value, $0.unit, size: 12) }
                }
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 4)
            }
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                ForEach(Array(week.days.enumerated()), id: \.offset) { i, day in
                    dayRow(day, longest: longest)
                        .overlay(alignment: .top) { s.divider(i) }
                        .sharePiece(day.date, s)
                }
            }
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 7)
        }
    }

    private func dayRow(_ day: ShareWeek.Day, longest: Double) -> some View {
        let u = s.u
        let later = future(day)
        let minutes = day.minutes ?? 0
        let sport: String = later ? "" : (day.sport.map { L10n.tr(ShareWorkout(title: "", sport: $0).sportName) } ?? L10n.tr("Volno"))
        return HStack(spacing: u * 2.6) {
            Text(verbatim: ShareText.weekday(day.date)).font(s.sans(3.4)).foregroundStyle(s.t.muted)
                .frame(width: u * 6, alignment: .leading)
            if options.shows("Připravenost") {
                let color = zoneColor(day.zone)
                Text(verbatim: day.readiness.map { Fmt.int($0) } ?? "–").font(s.serif(5)).foregroundStyle(color)
                    .frame(width: u * 7.4, height: u * 6.4)
                    .background(color.opacity(day.readiness == nil ? 0.08 : 0.16), in: RoundedRectangle(cornerRadius: u * 1.6, style: .continuous))
            }
            Text(verbatim: sport).font(s.sans(4)).foregroundStyle(day.sessions > 0 ? s.t.ink : s.t.muted).lineLimit(1)
            Spacer(minLength: u * 2)
            if minutes > 0 {
                Text(verbatim: Fmt.hoursMinutes(minutes)).font(s.serif(5.6)).foregroundStyle(s.t.ink)
            }
            ZStack(alignment: .leading) {
                Capsule().fill(s.t.line(0.1))
                if minutes > 0 {
                    Capsule().fill(s.t.amber).frame(width: max(u * 1.2, u * 16 * minutes / longest))
                }
            }
            .frame(width: u * 16, height: u * 1.2)
        }
        .frame(height: u * 12.6)
    }

    /// B: the readiness of each day as a ring, the week's mean big.
    private var rings: some View {
        let u = s.u
        let rows: [[ShareWeek.Day]] = stride(from: 0, to: week.days.count, by: 4).map { Array(week.days[$0..<min($0 + 4, week.days.count)]) }
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(range)
            s.title(L10n.tr("Připravenost"), sub: L10n.tr("průměr týdne")).padding(.top, u * 8)
            Text(verbatim: week.week.readiness.map { Fmt.int($0) } ?? "–").font(s.serif(24)).foregroundStyle(s.t.ink)
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 1)
            VStack(alignment: .leading, spacing: u * 4) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: u * 4.6) {
                        ForEach(row, id: \.date) { ring($0) }
                    }
                }
            }
            .shareBlock(ShareBlock.bottom, s)
            .padding(.horizontal, u * 7)
            .padding(.top, u * 7)
            Spacer(minLength: 0)
        }
    }

    private func ring(_ day: ShareWeek.Day) -> some View {
        let u = s.u
        let color = zoneColor(day.zone)
        let p = min(1, max(0, (day.readiness ?? 0) / 100))
        return VStack(spacing: u * 1.6) {
            Text(verbatim: ShareText.weekday(day.date)).font(s.sans(3)).foregroundStyle(s.t.muted)
            ZStack {
                Circle().stroke(s.t.line(0.1), lineWidth: u * 1.8)
                if day.readiness != nil {
                    Circle().trim(from: 0, to: p)
                        .stroke(color, style: StrokeStyle(lineWidth: u * 1.8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .shadow(color: color.opacity(0.4), radius: u * 1)
                }
                Text(verbatim: day.readiness.map { Fmt.int($0) } ?? "–").font(s.serif(6.4))
                    .foregroundStyle(day.readiness == nil ? s.t.muted : s.t.ink)
            }
            .frame(width: u * 16.2, height: u * 16.2)
            .padding(u * 0.9)
        }
    }

    /// C: the week's numbers in two columns.
    private var numbers: some View {
        let u = s.u
        let keys = ["Trénink", "Tréninky", "Kolo", "Běh", "Zátěž", "Spánek", "Připravenost"]
        let list: [ShareStat] = Array(keys.filter { options.shows($0) }.compactMap { key -> ShareStat? in
            ShareWeek.value(key, week.week).map { ShareStat(label: key, value: $0.value, unit: $0.unit) }
        }.prefix(6))
        let pairs: [[ShareStat]] = stride(from: 0, to: list.count, by: 2).map { Array(list[$0..<min($0 + 2, list.count)]) }
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(range)
            s.title(L10n.tr("Týden")).padding(.top, u * 8)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: u * 6) {
                ForEach(Array(pairs.enumerated()), id: \.offset) { _, pair in
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(pair) { stat in
                            let tone = ShareWeek.tone(stat.label)
                            s.number(stat.label, stat.value, stat.unit, size: 12,
                                     color: tone == .ink || tone == .indigo ? nil : ShareMetric(key: "", label: "", value: "", tone: tone).color(s.t))
                                .sharePiece(stat.id, s)
                                .frame(width: u * 43, alignment: .leading)
                        }
                    }
                }
            }
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 9)
        }
    }

    /// D: this week against the one before, each number with two bars.
    private var compare: some View {
        let u = s.u
        let hero = options.shows("Trénink") ? ShareWeek.value("Trénink", week.week) : nil
        let before = ShareWeek.value("Trénink", week.previous)?.raw ?? 0
        let keys = ["Zátěž", "Kolo", "Běh", "Spánek", "Připravenost"].filter { key in
            options.shows(key) && (ShareWeek.value(key, week.week) != nil || ShareWeek.value(key, week.previous) != nil)
        }
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(range)
            s.title(L10n.tr("Týden"), sub: L10n.tr("proti minulému")).padding(.top, u * 8)
            if let hero {
                VStack(alignment: .leading, spacing: u * 0.6) {
                    s.label("Trénink", size: 4)
                    HStack(alignment: .lastTextBaseline, spacing: u * 2.4) {
                        s.value(hero.value, hero.unit, size: 20).lineLimit(1)
                        deltaText("Trénink", now: hero.raw, before: before, size: 3.8)
                    }
                }
                .shareBlock(ShareBlock.top, s)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 7)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: u * 4.4) {
                ForEach(keys, id: \.self) { compareRow($0).sharePiece($0, s) }
            }
            .padding(.horizontal, u * 7)
            HStack(spacing: u * 4) {
                legend(s.t.ink, "tento týden")
                legend(s.t.line(0.25), "minulý")
            }
            .padding(.horizontal, u * 7)
            .padding(.top, u * 6)
            .padding(.bottom, u * 7)
        }
    }

    private func compareRow(_ key: String) -> some View {
        let u = s.u
        let now = ShareWeek.value(key, week.week)
        let before = ShareWeek.value(key, week.previous)
        let top = max(1, max(now?.raw ?? 0, before?.raw ?? 0))
        let color = ShareMetric(key: "", label: "", value: "", tone: ShareWeek.tone(key)).color(s.t)
        return VStack(alignment: .leading, spacing: u * 1.4) {
            HStack(alignment: .firstTextBaseline, spacing: u * 2) {
                s.label(key, size: 3.8)
                Spacer(minLength: u * 2)
                s.value(now?.value ?? "–", now == nil ? "" : (now?.unit ?? ""), size: 6).lineLimit(1)
                deltaText(key, now: now?.raw ?? 0, before: before?.raw ?? 0, size: 3.2)
                    .frame(width: u * 11, alignment: .trailing)
            }
            VStack(alignment: .leading, spacing: u * 0.8) {
                track((now?.raw ?? 0) / top, color, height: 1.3)
                track((before?.raw ?? 0) / top, s.t.line(0.22), height: 1)
            }
        }
    }

    private func deltaText(_ key: String, now: Double, before: Double, size: CGFloat) -> some View {
        let up = now >= before
        return Text(verbatim: ShareWeek.delta(key, now: now, before: before)).font(s.sans(size, .semibold))
            .foregroundStyle(before <= 0 && now <= 0 ? s.t.muted : (up ? s.t.green : s.t.rust))
            .lineLimit(1)
    }

    private func track(_ progress: Double, _ color: Color, height: CGFloat) -> some View {
        let u = s.u
        return GeometryReader { geo in
            Capsule().fill(color)
                .frame(width: max(progress > 0 ? u * height : 0, geo.size.width * min(1, max(0, progress))))
        }
        .frame(height: u * height)
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        let u = s.u
        return HStack(spacing: u * 1.4) {
            Capsule().fill(color).frame(width: u * 3.6, height: u * 1.2)
            Text(L10n.tr(text)).font(s.sans(3)).foregroundStyle(s.t.muted)
        }
    }
}

// MARK: - Milník: the image

struct ShareMilestoneCard: View {
    let milestones: ShareMilestones
    let options: ShareOptions
    let s: ShareStyle

    private var item: ShareMilestones.Item? { milestones.item(options.milestone) }
    private var dateText: String { ShareText.short(milestones.today ?? AppModel.localDate(Date())) }

    var body: some View {
        if options.variant == 2, let record = milestones.record {
            recordCard(record)
        } else if let item = item {
            if options.variant == 1 { path(item) } else { poster(item) }
        } else if let record = milestones.record {
            recordCard(record)
        }
    }

    /// A: the number big, the sessions behind it as bars, three numbers.
    private func poster(_ item: ShareMilestones.Item) -> some View {
        let u = s.u
        let stats = ["Tréninky", "Čas", "Převýšení"].filter { options.shows($0) }.compactMap { item.stat($0) }
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(dateText)
            VStack(alignment: .leading, spacing: u * 1.2) {
                Text(verbatim: item.number).font(s.serif(34)).foregroundStyle(s.t.amber)
                    .lineLimit(1).minimumScaleFactor(0.4)
                Text(verbatim: item.noun).font(s.italic(8.6)).foregroundStyle(s.t.ink).lineLimit(1).minimumScaleFactor(0.6)
                if let since = item.sinceText {
                    Text(verbatim: since).font(s.sans(3.6)).foregroundStyle(s.t.muted).padding(.top, u * 1.4)
                }
            }
            .shareBlock(ShareBlock.top, s)
            .padding(.horizontal, u * 7)
            .padding(.top, u * 18)
            if options.shows("Graf"), !item.bars.isEmpty {
                ShareBars(bars: item.bars, color: s.t.amber, label: s.t.muted, u: u)
                    .frame(height: u * 34)
                    .padding(.horizontal, u * 7)
                    .padding(.top, u * 10)
            }
            Spacer(minLength: 0)
            HStack(alignment: .top, spacing: u * 9) {
                ForEach(stats) { s.number($0.label, $0.value, $0.unit, size: 7.4).sharePiece($0.id, s) }
            }
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// B: the way there as one rising line, the number under it.
    private func path(_ item: ShareMilestones.Item) -> some View {
        let u = s.u
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(dateText)
            SharePath(values: item.path, marks: marks(item), color: s.t.amber, label: s.t.muted, hole: s.t.hole, u: u)
                .frame(height: u * 82)
                .padding(.horizontal, u * 7)
                .padding(.top, u * 12)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: u * 1) {
                Text(verbatim: item.number + (item.isDistance ? " " + Units.distanceUnit : "")).font(s.serif(17)).foregroundStyle(s.t.amber)
                    .lineLimit(1).minimumScaleFactor(0.5)
                Text(verbatim: item.pathText).font(s.news(6.4)).foregroundStyle(s.t.ink).lineLimit(2).minimumScaleFactor(0.6)
            }
            .shareBlock(ShareBlock.bottom, s)
            .padding(.horizontal, u * 7)
            .padding(.bottom, u * 8)
        }
    }

    /// A quarter, a half and three quarters of the way, where the line crosses them.
    private func marks(_ item: ShareMilestones.Item) -> [(at: Double, text: String)] {
        let values = item.path
        let first = values.first ?? 0, last = values.last ?? 0
        return [0.25, 0.5, 0.75].compactMap { share -> (at: Double, text: String)? in
            let mark = (item.value * share).rounded()
            guard mark > first, mark < last else { return nil }
            return (mark, Fmt.int(item.isDistance ? Units.distance(mark) : mark))
        }
    }

    /// C: the best power of a duration, the curve with the year before dashed.
    private func recordCard(_ record: ShareMilestones.Record) -> some View {
        let u = s.u
        let gain = record.previous.map { record.watts - $0 } ?? 0
        return VStack(alignment: .leading, spacing: 0) {
            s.brand(dateText)
            VStack(alignment: .leading, spacing: u * 1.2) {
                if record.isNew { s.pill("Nový rekord", s.t.amber).padding(.bottom, u * 1.6) }
                Text(verbatim: ShareMilestones.Record.duration(record.seconds)).font(s.sans(4.2)).foregroundStyle(s.t.secondary)
                HStack(alignment: .lastTextBaseline, spacing: u * 2) {
                    Text(verbatim: Fmt.int(record.watts)).font(s.serif(28)).foregroundStyle(s.t.amber)
                    Text(verbatim: "W").font(s.sans(5.4, .regular)).foregroundStyle(s.t.muted)
                }
                if record.isNew, gain > 0 {
                    Text(verbatim: L10n.f("+%@ W než dosud", Fmt.int(gain))).font(s.sans(3.6, .semibold)).foregroundStyle(s.t.green)
                } else if !record.isNew {
                    Text(L10n.tr("nejlepší za 30 dní")).font(s.sans(3.6)).foregroundStyle(s.t.muted)
                }
            }
            .shareBlock(ShareBlock.top, s)
            .padding(.horizontal, u * 7)
            .padding(.top, u * 14)
            Spacer(minLength: 0)
            if record.curve.count >= 2 {
                SharePowerCurve(record: record, color: s.t.amber, previous: s.t.line(0.4), label: s.t.muted, u: u)
                    .frame(height: u * 50)
                    .padding(.horizontal, u * 7)
                    .padding(.bottom, u * 7)
            }
        }
    }
}

/// The sessions as thin glowing bars, the months under them.
struct ShareBars: View {
    let bars: [ShareMilestones.Bar]
    let color: Color
    let label: Color
    let u: CGFloat

    var body: some View {
        GeometryReader { geo in
            let n = CGFloat(max(1, bars.count))
            let width = min(u * 3, geo.size.width / (n * 1.6 - 0.6))
            let gap = n > 1 ? (geo.size.width - width * n) / (n - 1) : 0
            let chart = geo.size.height - u * 5
            let top = max(0.001, bars.compactMap(\.value).max() ?? 1)
            ZStack(alignment: .topLeading) {
                ForEach(Array(bars.enumerated()), id: \.offset) { i, bar in
                    let h = max(u * 1, chart * CGFloat((bar.value ?? 0) / top))
                    Capsule()
                        .fill(LinearGradient(colors: [color, color.opacity(0.25)], startPoint: .top, endPoint: .bottom))
                        .frame(width: width, height: h)
                        .shadow(color: color.opacity(0.35), radius: u * 0.8)
                        .offset(x: CGFloat(i) * (width + gap), y: chart - h)
                }
                ForEach(Array(monthStarts(step: width + gap).enumerated()), id: \.offset) { _, month in
                    Text(verbatim: month.text).font(.system(size: u * 2.8, weight: .medium)).foregroundStyle(label)
                        .fixedSize()
                        .offset(x: month.x, y: chart + u * 1.6)
                }
            }
        }
    }

    /// Where each month starts, at least a few letters apart.
    private func monthStarts(step: CGFloat) -> [(x: CGFloat, text: String)] {
        var out: [(x: CGFloat, text: String)] = []
        var last = ""
        for (i, bar) in bars.enumerated() {
            let month = String(bar.date.prefix(7))
            guard month != last else { continue }
            last = month
            let x = CGFloat(i) * step
            if let previous = out.last, x - previous.x < u * 9 { continue }
            out.append((x, ShareText.month(bar.date)))
        }
        return out.count > 1 ? out : []
    }
}

/// The running total as one rising line with a glow, round numbers on the way.
struct SharePath: View {
    let values: [Double]
    let marks: [(at: Double, text: String)]
    let color: Color
    let label: Color
    let hole: Color
    let u: CGFloat

    var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            let line = Path { $0.addLines(pts) }
            ZStack(alignment: .topLeading) {
                line.stroke(color.opacity(0.16), style: StrokeStyle(lineWidth: u * 3.6, lineCap: .round, lineJoin: .round))
                line.stroke(color, style: StrokeStyle(lineWidth: u * 1.2, lineCap: .round, lineJoin: .round))
                    .shadow(color: color.opacity(0.6), radius: u * 1.6)
                ForEach(Array(marks.enumerated()), id: \.offset) { _, mark in
                    let p = crossing(mark.at, pts)
                    Text(verbatim: mark.text).font(.system(size: u * 2.8, weight: .medium)).foregroundStyle(label)
                        .fixedSize()
                        .offset(x: p.x + u * 1.6, y: p.y + u * 0.8)
                }
                if let end = pts.last {
                    Circle().strokeBorder(color, lineWidth: u * 1.1).background { Circle().fill(hole) }
                        .frame(width: u * 5, height: u * 5)
                        .position(end)
                }
            }
        }
    }

    private var low: Double { values.min() ?? 0 }
    private var high: Double { max(low + 0.001, values.max() ?? 1) }

    private func points(in size: CGSize) -> [CGPoint] {
        let w = Double(size.width) - Double(u * 3), h = Double(size.height) - Double(u * 3)
        let last = Double(max(1, values.count - 1))
        return values.enumerated().map { item -> CGPoint in
            let x: Double = w * Double(item.offset) / last
            let y: Double = Double(u * 1.5) + h - h * (item.element - low) / (high - low)
            return CGPoint(x: x, y: y)
        }
    }

    /// The point where the total first reaches `value`.
    private func crossing(_ value: Double, _ pts: [CGPoint]) -> CGPoint {
        guard let i = values.firstIndex(where: { $0 >= value }), i < pts.count else { return pts.last ?? .zero }
        guard i > 0 else { return pts[0] }
        let a = values[i - 1], b = values[i]
        let k = CGFloat(b > a ? (value - a) / (b - a) : 1)
        return CGPoint(x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k)
    }
}

/// The best power by duration (5 s to an hour, on a log scale), the year before
/// dashed and the record's duration marked.
struct SharePowerCurve: View {
    let record: ShareMilestones.Record
    let color: Color
    let previous: Color
    let label: Color
    let u: CGFloat

    private static let axis: [Double] = [5, 60, 300, 1200, 3600]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let chart = geo.size.height - u * 6
            let all = (record.curve + record.previousCurve).map(\.watts)
            let top = (all.max() ?? 1) * 1.05
            let bottom = (all.min() ?? 0) * 0.85
            let x = { (sec: Double) -> CGFloat in w * CGFloat(log(max(5, sec) / 5) / log(3600.0 / 5)) }
            let y = { (watts: Double) -> CGFloat in chart - chart * CGFloat((watts - bottom) / max(1, top - bottom)) }
            let pts = record.curve.map { CGPoint(x: x($0.seconds), y: y($0.watts)) }
            let before = record.previousCurve.map { CGPoint(x: x($0.seconds), y: y($0.watts)) }
            let mark = CGPoint(x: x(record.seconds), y: y(record.watts))
            ZStack(alignment: .topLeading) {
                Path { p in
                    p.addLines(pts)
                    p.addLine(to: CGPoint(x: pts.last?.x ?? w, y: chart))
                    p.addLine(to: CGPoint(x: pts.first?.x ?? 0, y: chart))
                    p.closeSubpath()
                }
                .fill(LinearGradient(colors: [color.opacity(0.45), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                Path { $0.addLines(before) }
                    .stroke(previous, style: StrokeStyle(lineWidth: u * 0.5, dash: [u * 1.2, u * 1]))
                Path { $0.addLines(pts) }
                    .stroke(color, style: StrokeStyle(lineWidth: u * 0.9, lineJoin: .round))
                Path { p in
                    p.move(to: mark)
                    p.addLine(to: CGPoint(x: mark.x, y: chart))
                }
                .stroke(color.opacity(0.6), lineWidth: u * 0.3)
                Circle().fill(color.opacity(0.25)).frame(width: u * 6, height: u * 6).position(mark)
                Circle().fill(color).frame(width: u * 2.8, height: u * 2.8).position(mark)
                ForEach(Array(Self.axis.enumerated()), id: \.offset) { i, sec in
                    Text(verbatim: ShareMilestones.Record.short(sec)).font(.system(size: u * 2.8, weight: .medium)).foregroundStyle(label)
                        .fixedSize()
                        .frame(width: u * 12, alignment: i == 0 ? .leading : i == Self.axis.count - 1 ? .trailing : .center)
                        .offset(x: i == 0 ? 0 : i == Self.axis.count - 1 ? w - u * 12 : x(sec) - u * 6, y: chart + u * 2)
                }
            }
        }
    }
}

// MARK: - Samples (demo and tests)

extension ShareWeek {
    static let sample: ShareWeek = {
        let zones = ["green", "yellow", "green", "yellow", "green", "red", "green"]
        let scores: [Double] = [64, 58, 72, 51, 69, 47, 66]
        let sports: [String?] = ["ride", "run", nil, "strength", "ride", "ride", "run"]
        let minutes: [Double] = [72, 45, 0, 50, 90, 185, 38]
        let days = (0..<7).map { i in
            Day(date: String(format: "2026-10-%02d", 12 + i), readiness: scores[i], zone: zones[i], sport: sports[i],
                minutes: minutes[i], sessions: sports[i] == nil ? 0 : 1, tss: minutes[i] * 1.1)
        }
        return ShareWeek(start: "2026-10-12", end: "2026-10-18", today: "2026-10-18", days: days,
                         week: Totals(minutes: 460, sessions: 6, tss: 486, rideKm: 142, runKm: 18, sleepMinutes: 441, readiness: 61),
                         previous: Totals(minutes: 395, sessions: 5, tss: 412, rideKm: 118, runKm: 22, sleepMinutes: 422, readiness: 58))
    }()
}

extension ShareMilestones {
    static let sample: ShareMilestones = {
        var bars: [Bar] = []
        for i in 0..<41 {
            let month = 6 + i / 9, day = 1 + (i % 9) * 3
            bars.append(Bar(date: String(format: "2026-%02d-%02d", month, day), value: 14 + Double((i * 7) % 23) + (i % 5 == 0 ? 18 : 0)))
        }
        let total = bars.compactMap(\.value).reduce(0, +)
        let ride = Item(key: "ride", value: 1000, total: total, since: "2026-06-12", reachedOn: "2026-10-14", sessions: 41,
                        minutes: 2280, elevation: 9840, bars: bars, start: 0)
        let streak = Item(key: "streak", value: 14, total: 15, since: "2026-10-01", reachedOn: "2026-10-14", sessions: 17, minutes: 980,
                          elevation: nil, bars: (1...15).map { Bar(date: String(format: "2026-10-%02d", $0), value: 40 + Double(($0 * 13) % 50)) }, start: 0)
        let points: [(Double, Double, Double)] = [(5, 905, 880), (15, 760, 742), (30, 610, 598), (60, 452, 430), (120, 372, 360),
                                                  (300, 318, 309), (600, 297, 286), (1200, 286, 274), (1800, 270, 262), (3600, 251, 246)]
        let record = Record(isNew: true, seconds: 1200, watts: 286, previous: 274,
                            curve: points.map { Point(seconds: $0.0, watts: $0.1) }, previousCurve: points.map { Point(seconds: $0.0, watts: $0.2) })
        return ShareMilestones(today: "2026-10-15", items: [ride, streak], record: record)
    }()
}
