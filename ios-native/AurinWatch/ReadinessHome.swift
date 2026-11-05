import SwiftUI

/// The first page, as Today on the iPhone: readiness as a big number with its
/// word, and sleep, strain and HRV in one card with their range bars, all on
/// one screen. The number opens why readiness is what it is, each column its
/// detail (the pages are in WatchRoot's navigationDestination); the alarm
/// sits at the top left, the coach at the top right.
///
/// Before today's numbers come (review 2026-11-02, point 6) it shows the last
/// day it has, greyed: "Getting today…" while the watch fetches them, "No
/// connection" only when that failed, and "Waiting for last night's sleep"
/// when today came without the night.
struct ReadinessHome: View {
    let s: WatchSnapshot
    /// Always On (wrist down): the morning's numbers hide (Today audit 17).
    @Environment(\.isLuminanceReduced) private var dimmed
    /// Why `s` is not today's numbers; nil when it is.
    var stale: Stale? = nil
    /// Today's snapshot while the night is awaited (its next workout).
    var today: WatchSnapshot? = nil

    enum Page: Hashable {
        case why, sleep, restingHR, hrv, strain, alarm, coach
    }

    enum Stale {
        /// The watch is getting today (from the iPhone or the server).
        case loading
        /// Neither the iPhone nor the server gave today.
        case failed
        /// Today came without last night's sleep (the wearable has not synced yet).
        case night
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavigationLink(value: Page.why) { hero }
                .buttonStyle(.plain)
                // An older day's details would read as today's.
                .disabled(stale != nil)
            if stale == .failed {
                Text(W.tr("Bez spojení. Otevři Aurin v iPhonu a aktualizuj.", "No connection. Open Aurin on your iPhone to update."))
                    .watchFont(12, .semibold)
                    .foregroundStyle(W.amber)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            } else if stale != nil {
                Text(dayLabel)
                    .watchFont(12, .medium)
                    .foregroundStyle(W.secondary)
                    .padding(.top, 2)
            }
            gauges.padding(.top, stale == nil ? 6 : 3)
                .disabled(stale != nil)
            if let race = todayRace {
                // Race day: the race opens its legs (RaceDetail).
                NavigationLink(value: race) {
                    todayRow(text: race.name + (race.first.time.map { " · " + W.clockText($0) } ?? ""), symbol: "flag.fill")
                }
                .buttonStyle(.plain)
            } else if let today = todayLine {
                NavigationLink(value: today.session) { todayRow(text: today.text, symbol: today.symbol) }
                    .buttonStyle(.plain)
                    .disabled(today.session.sport != "ride" && today.session.sport != "run")
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(value: Page.alarm) {
                    Image(systemName: "alarm.fill").foregroundStyle(W.indigo)
                }
                .accessibilityLabel(W.tr("Budík", "Alarm"))
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Page.coach) {
                    Image(systemName: "bubble.left.and.text.bubble.right").foregroundStyle(W.amber)
                }
                .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
        .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
    }

    // MARK: Readiness

    private var hero: some View {
        VStack(alignment: .leading, spacing: 2) {
            heroNumber
            // The day's verdict under the number, the iPhone's line (src/day-verdict.js) in short.
            if let verdict, !dimmed {
                Text(verdict.text)
                    .watchFont(14, .semibold)
                    .foregroundStyle(verdict.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .opacity(stale == nil ? 1 : 0.45)
            }
        }
        // In from the screen's edge and clear of the alarm button above.
        .padding(.top, 6)
        .padding(.leading, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var heroNumber: some View {
        // The name beside the number, above the pill: over the number it
        // slid under the alarm button, which hangs over the page.
        HStack(alignment: .lastTextBaseline, spacing: 8) {
            if s.readiness == nil, let days = learning {
                // A new athlete: the day of the 14 readiness needs ("5/14"),
                // as "Učím se tvůj normál" on the iPhone.
                HStack(alignment: .lastTextBaseline, spacing: 0) {
                    Text(String(days)).foregroundStyle(W.ink)
                    Text(verbatim: "/14").foregroundStyle(W.secondary)
                }
                .font(W.serif(46))
                .lineLimit(1)
            } else {
                Text(dimmed ? "––" : s.readiness.map { String($0) } ?? "–")
                    .font(W.serif(52))
                    .foregroundStyle(stale == nil ? W.ink : W.muted)
                    .lineLimit(1)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .watchFont(12, .medium)
                    .foregroundStyle(W.secondary)
                    .lineLimit(stale == .night || dimmed ? 2 : 1)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                if let pill, verdict == nil, !dimmed {
                    Text(pill.text)
                        .watchFont(12, .semibold)
                        .foregroundStyle(pill.color)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(pill.color.opacity(0.16), in: Capsule())
                        .opacity(stale == nil ? 1 : 0.45)
                }
            }
        }
    }

    private var learning: Int? { s.learningDays.map { min(14, max(1, $0)) } }

    /// Beside the number: what the page waits for, else "Readiness".
    private var title: String {
        if dimmed { return W.tr("Zvedni zápěstí", "Raise your wrist to see") }
        switch stale {
        case .loading: W.tr("Načítám dnešek…", "Getting today…")
        case .night: W.tr("Čekám na spánek z noci", "Waiting for last night's sleep")
        case .failed, nil: W.tr("Připravenost", "Readiness")
        }
    }

    /// Whose numbers these are: "Yesterday", or the day's name when older.
    private var dayLabel: String {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date()).map(WatchStore.localDate)
        return s.date == yesterday ? W.tr("Včera", "Yesterday") : W.dayName(s.date).capitalized
    }

    /// The day's verdict in at most 24 characters (Today audit 17), coloured
    /// as the iPhone's: rest red, no intensity never green.
    private var verdict: (text: String, color: Color)? {
        guard s.readiness != nil, let key = s.verdict else { return nil }
        let text: String? = switch key {
        case "hard": W.tr("Den na tvrdý trénink", "Ready for a hard day")
        case "steady": W.tr("Dnes s mírou", "Keep it steady")
        case "easy": W.tr("Dnes v klidu", "Take it easy")
        case "legs": W.tr("Dej nohám pauzu", "Give your legs a break")
        case "no_intensity": W.tr("Dnes bez intenzity", "No intensity today")
        case "rest": W.tr("Dnes odpočinek", "Rest today")
        default: nil
        }
        let color = key == "rest" ? W.red : key == "no_intensity" && s.zone == "green" ? W.amber : W.zoneColor(s.zone)
        return text.map { ($0, color) }
    }

    /// From an older iPhone without the verdict: the zone's words (TodayView's pill); while readiness
    /// learns a new athlete's normal, "učím se".
    private var pill: (text: String, color: Color)? {
        if s.readiness == nil, learning != nil { return (W.tr("učím se", "learning"), W.amber) }
        guard s.readiness != nil else { return nil }
        switch s.zone {
        case "green": return (W.tr("vysoká", "high"), W.green)
        case "yellow": return (W.tr("střední", "moderate"), W.amber)
        case "red": return (W.tr("nízká", "low"), W.red)
        default: return nil
        }
    }

    // MARK: Today

    /// Today's race not yet done, in place of the next workout ("Duatlon · 9:00").
    private var todayRace: RaceDay? {
        // As todayLine: an older day's plan is not today's.
        guard let day = stale == nil ? s : today else { return nil }
        return RaceDay((day.week ?? []).filter { $0.date == day.date && !$0.done })
    }

    private func todayRow(text: String, symbol: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Image(systemName: symbol).watchFont(12, .semibold).foregroundStyle(W.amber)
            Text(text).watchFont(13, .semibold).foregroundStyle(W.ink)
                .lineLimit(2).minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 7)
        .contentShape(Rectangle())
    }

    /// What is next today, under the numbers ("Sweet spot · 75′ at 17:30"), the
    /// length once though the plan's title may already end with it.
    private var todayLine: (text: String, symbol: String, session: WatchSnapshot.Session)? {
        // An older day's plan is not today's: only today's snapshot tells it.
        guard let day = stale == nil ? s : today,
              let next = (day.week ?? []).first(where: { $0.date == day.date && !$0.done }) else { return nil }
        var text = next.name
        if let minutes = next.minutes { text += " · \(minutes)′" }
        if let time = next.time { text += W.tr(" v ", " at ") + time }
        let symbol = switch next.sport {
        case "ride": "figure.outdoor.cycle"
        case "run": "figure.run"
        case "strength": "dumbbell.fill"
        default: "figure.mixed.cardio"
        }
        return (text, symbol, next)
    }

    // MARK: Sleep, strain, HRV

    private struct Gauge {
        var page: Page
        var title: String
        var value: String
        var unit: String? = nil
        var bar: (value: Double, low: Double, high: Double)? = nil
        var note: String? = nil
        var color: Color
    }

    private var gauges: some View {
        HStack(spacing: 0) {
            ForEach(Array([sleep, strain, hrv].map(shown).enumerated()), id: \.offset) { index, gauge in
                if index > 0 { Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1) }
                NavigationLink(value: gauge.page) { cell(gauge) }
                    .buttonStyle(.plain)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        // An older day's numbers, greyed (point 6).
        .saturation(stale == nil ? 1 : 0)
        .opacity(stale == nil ? 1 : 0.55)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }

    private func cell(_ g: Gauge) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(g.title).watchFont(12, .medium).foregroundStyle(W.muted).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(g.value).font(W.serif(19)).foregroundStyle(W.ink)
                if let unit = g.unit, g.value != "–" { Text(unit).watchFont(12).foregroundStyle(W.muted) }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            if let bar = g.bar {
                WatchRangeBar(value: bar.value, low: bar.low, high: bar.high, color: g.color).padding(.vertical, 2)
            }
            Text(g.note ?? " ")
                .watchFont(12, .semibold)
                .foregroundStyle(g.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// Always On: the name stays, the number, bar and note hide.
    private func shown(_ g: Gauge) -> Gauge {
        guard dimmed else { return g }
        var g = g
        g.value = "––"
        g.unit = nil
        g.bar = nil
        g.note = nil
        g.color = W.muted
        return g
    }

    /// The night against its need: the band is half an hour either side (TodayView).
    private var sleep: Gauge {
        var g = Gauge(page: .sleep, title: W.tr("Spánek", "Sleep"), value: s.sleep?.minutes.map { W.clock(minutes: $0) } ?? "–", color: W.indigo)
        guard let minutes = s.sleep?.minutes, let need = s.sleep?.need, need > 0 else { return g }
        let low = need - 30, high = need + 30
        g.bar = (minutes, low, high)
        g.note = W.tr("\(W.number(minutes / need * 100)) %", "\(W.number(minutes / need * 100))%")
        // As on the watch face: red under three quarters of the need.
        g.color = minutes >= low ? W.green : minutes >= need * 0.75 ? W.amber : W.red
        return g
    }

    private var strain: Gauge {
        var g = Gauge(page: .strain, title: W.tr("Námaha", "Strain"), value: s.strain.score.map { W.number($0, digits: 1) } ?? "–", color: W.amber)
        guard let low = s.strain.low, let high = s.strain.high else {
            g.note = s.strain.planned.map { W.tr("plán ~", "plan ~") + W.number($0, digits: 1) }
            return g
        }
        g.note = W.tr("z ", "of ") + W.number(low) + "–" + W.number(high)
        g.color = W.green
        if let score = s.strain.score {
            g.bar = (score, low, high)
            g.color = WatchRangeBar.side(score, low, high) == 0 ? W.green : W.amber
        }
        return g
    }

    private var hrv: Gauge {
        var g = Gauge(page: .hrv, title: "HRV", value: s.hrv?.value.map { W.number($0) } ?? "–", unit: "ms", color: W.green)
        guard let value = s.hrv?.value, let low = s.hrv?.low, let high = s.hrv?.high, high > low else { return g }
        g.bar = (value, low, high)
        switch WatchRangeBar.side(value, low, high) {
        case 1: g.note = W.tr("nad", "above")
        case -1: g.note = W.tr("pod", "below"); g.color = W.amber
        default: g.note = W.tr("v rozmezí", "usual")
        }
        return g
    }
}

/// The iPhone's range bar (Aurin/Design/Components.swift RangeBar) in the
/// watch's colours: the usual range or the goal takes the middle third.
struct WatchRangeBar: View {
    let value: Double
    let low: Double
    let high: Double
    var color: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(W.track)
                Capsule().fill(W.dim).frame(width: w / 3, height: 4).offset(x: w / 3)
                Circle().fill(color)
                    .overlay { Circle().stroke(W.track, lineWidth: 1.5) }
                    .frame(width: 9, height: 9)
                    .offset(x: position * w - 4.5)
            }
            .frame(height: 6)
            .frame(maxHeight: .infinity)
        }
        .frame(height: 9)
        .accessibilityHidden(true)
    }

    private var position: Double {
        guard high > low else { return 0.5 }
        let span = high - low
        return min(max((value - low + span) / (3 * span), 0.03), 0.97)
    }

    /// -1 under the range, 1 above it, 0 within.
    static func side(_ value: Double, _ low: Double, _ high: Double) -> Int {
        value > high ? 1 : value < low ? -1 : 0
    }
}
